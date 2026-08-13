import { runWithDatabaseSpace, type PixorySpace } from '../database';
import {
  type AiGenerationCreatedInfo,
  continueAssistantReply,
  continueAssistantMessage,
  regenerateAssistantMessage,
  replyToAssistantMessage,
  rewriteUserMessage,
  recoverInterruptedGeneration,
  sendUserMessage,
  stopInterruptedGeneration,
  stopStreamingMessage,
  type AiStreamingMessagePatch,
  type ContinueAssistantReplyInput,
  type ContinueAssistantMessageInput,
  type ReplyToAssistantMessageInput,
  type RetryAssistantMessageInput,
  type RewriteUserMessageInput,
  type SendUserMessageInput,
} from './aiChatService';
import type { StreamingVisibilityState } from './aiStreamingRuntime';
import {
  beginGenerationRecoveryAttempt,
  claimGenerationRecovery,
  listRecoverableGenerationJobs,
  markInterruptedGenerationJobs,
} from './generation/aiGenerationRepository';
import { decideGenerationRecovery } from './generation/aiGenerationRecovery';

export type AiGenerationSubscriber = {
  getStreamingVisibility?: () => StreamingVisibilityState;
  onCreated?: (ids: AiGenerationCreatedInfo) => void;
  onMessagePatch?: (patch: AiStreamingMessagePatch) => void;
  onUpdated?: () => void;
  onSettled?: () => void;
};

type ActiveGenerationTask = {
  assistantMessageId: string | null;
  controller: AbortController;
  finished: boolean;
  generationId: string | null;
  promise: Promise<unknown>;
  space: PixorySpace;
  subscribers: Set<AiGenerationSubscriber>;
  thinkingExpected: boolean | null;
  threadId: string;
  userMessageId: string | null;
};

type ManagedTaskStart<T> = {
  promise: Promise<T>;
  unsubscribe: () => void;
};

type GenerationStartTimingInput = {
  sendPressedAt?: string;
};

type StopGenerationReason = 'timeout' | 'user';

type StartSendUserMessageInput = Omit<SendUserMessageInput, 'signal' | 'onCreated' | 'onMessagePatch' | 'onUpdated'> & {
  subscriber?: AiGenerationSubscriber;
} & GenerationStartTimingInput;

type StartRegenerateAssistantMessageInput = Omit<RetryAssistantMessageInput, 'signal' | 'onCreated' | 'onMessagePatch' | 'onUpdated'> & {
  subscriber?: AiGenerationSubscriber;
} & GenerationStartTimingInput;

type StartContinueAssistantMessageInput = Omit<ContinueAssistantMessageInput, 'signal' | 'onCreated' | 'onMessagePatch' | 'onUpdated'> & {
  subscriber?: AiGenerationSubscriber;
} & GenerationStartTimingInput;

type StartContinueAssistantReplyInput = Omit<ContinueAssistantReplyInput, 'signal' | 'onCreated' | 'onMessagePatch' | 'onUpdated'> & {
  subscriber?: AiGenerationSubscriber;
} & GenerationStartTimingInput;

type StartReplyToAssistantMessageInput = Omit<ReplyToAssistantMessageInput, 'signal' | 'onCreated' | 'onMessagePatch' | 'onUpdated'> & {
  subscriber?: AiGenerationSubscriber;
} & GenerationStartTimingInput;

type StartRewriteUserMessageInput = Omit<RewriteUserMessageInput, 'signal' | 'onCreated' | 'onMessagePatch' | 'onUpdated'> & {
  subscriber?: AiGenerationSubscriber;
} & GenerationStartTimingInput;

export type ActiveAiGenerationTaskInfo = {
  assistantMessageId: string | null;
  generationId: string | null;
  space: PixorySpace;
  threadId: string;
  userMessageId: string | null;
};

const tasksByThreadId = new Map<string, ActiveGenerationTask>();
const tasksByAssistantId = new Map<string, ActiveGenerationTask>();
const reconciliationBySpace = new Map<PixorySpace, Promise<void>>();
const runtimeEpochBySpace = new Map<PixorySpace, number>();
const suspendedSpaces = new Set<PixorySpace>(['personal']);
const RECOVERY_LEASE_MS = 2 * 60 * 1000;
const RECOVERY_OWNER = `pixory_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

function taskKey(space: PixorySpace, threadId: string): string {
  return `${space}:${threadId}`;
}

function rememberAssistantMessage(task: ActiveGenerationTask, assistantMessageId: string) {
  if (task.finished) {
    return;
  }
  if (task.assistantMessageId && task.assistantMessageId !== assistantMessageId) {
    tasksByAssistantId.delete(task.assistantMessageId);
  }
  task.assistantMessageId = assistantMessageId;
  tasksByAssistantId.set(assistantMessageId, task);
}

function addSubscriber(task: ActiveGenerationTask | undefined, subscriber?: AiGenerationSubscriber): () => void {
  if (!task || !subscriber) {
    return () => undefined;
  }
  task.subscribers.add(subscriber);
  return () => {
    task.subscribers.delete(subscriber);
  };
}

function emitCreated(task: ActiveGenerationTask, ids: AiGenerationCreatedInfo) {
  if (task.finished) {
    return;
  }
  rememberAssistantMessage(task, ids.assistantMessageId);
  task.generationId = ids.generationId;
  task.thinkingExpected = ids.thinkingExpected ?? null;
  task.userMessageId = ids.userMessageId;
  task.subscribers.forEach((subscriber) => subscriber.onCreated?.(ids));
}

function emitMessagePatch(task: ActiveGenerationTask, patch: AiStreamingMessagePatch) {
  if (task.finished) {
    return;
  }
  task.subscribers.forEach((subscriber) => subscriber.onMessagePatch?.(patch));
}

function emitUpdated(task: ActiveGenerationTask) {
  if (task.finished) {
    return;
  }
  task.subscribers.forEach((subscriber) => subscriber.onUpdated?.());
}

function finishTask(task: ActiveGenerationTask) {
  if (task.finished) {
    return;
  }
  task.finished = true;
  const key = taskKey(task.space, task.threadId);
  if (tasksByThreadId.get(key) === task) {
    tasksByThreadId.delete(key);
  }
  if (task.assistantMessageId && tasksByAssistantId.get(task.assistantMessageId) === task) {
    tasksByAssistantId.delete(task.assistantMessageId);
  }
  task.subscribers.forEach((subscriber) => subscriber.onSettled?.());
  task.subscribers.clear();
}

function createTask(space: PixorySpace, threadId: string): ActiveGenerationTask {
  if (suspendedSpaces.has(space)) throw new Error(`${space} generation runtime is suspended.`);
  const key = taskKey(space, threadId);
  const current = tasksByThreadId.get(key);
  if (current) {
    current.controller.abort();
    finishTask(current);
  }
  const task: ActiveGenerationTask = {
    assistantMessageId: null,
    controller: new AbortController(),
    finished: false,
    generationId: null,
    promise: Promise.resolve(),
    space,
    subscribers: new Set(),
    thinkingExpected: null,
    threadId,
    userMessageId: null,
  };
  tasksByThreadId.set(key, task);
  return task;
}

function taskInfo(task: ActiveGenerationTask): ActiveAiGenerationTaskInfo {
  return {
    assistantMessageId: task.assistantMessageId,
    generationId: task.generationId,
    space: task.space,
    threadId: task.threadId,
    userMessageId: task.userMessageId,
  };
}

function getTaskStreamingVisibility(task: ActiveGenerationTask): StreamingVisibilityState {
  for (const subscriber of task.subscribers) {
    const visibility = subscriber.getStreamingVisibility?.();
    if (visibility) {
      return visibility;
    }
  }
  return { bottomLocked: true };
}

function startSendUserMessage(input: StartSendUserMessageInput): ManagedTaskStart<{ userMessageId: string; assistantMessageId: string }> {
  const task = createTask(input.space, input.threadId);
  const unsubscribe = addSubscriber(task, input.subscriber);
  const { subscriber: _subscriber, ...request } = input;
  task.promise = sendUserMessage({
    ...request,
    getStreamingVisibility: () => getTaskStreamingVisibility(task),
    onCreated: (ids) => emitCreated(task, ids),
    onMessagePatch: (patch) => emitMessagePatch(task, patch),
    onTimeout: () => {
      void stopGeneration({ assistantMessageId: task.assistantMessageId, reason: 'timeout', space: task.space, threadId: task.threadId });
    },
    onUpdated: () => emitUpdated(task),
    signal: task.controller.signal,
  }).finally(() => finishTask(task));
  return { promise: task.promise as Promise<{ userMessageId: string; assistantMessageId: string }>, unsubscribe };
}

function startRegenerateAssistantMessage(input: StartRegenerateAssistantMessageInput): ManagedTaskStart<void> {
  const task = createTask(input.space, input.threadId);
  rememberAssistantMessage(task, input.assistantMessageId);
  const unsubscribe = addSubscriber(task, input.subscriber);
  const { subscriber: _subscriber, ...request } = input;
  task.promise = regenerateAssistantMessage({
    ...request,
    getStreamingVisibility: () => getTaskStreamingVisibility(task),
    onCreated: (ids) => emitCreated(task, ids),
    onMessagePatch: (patch) => emitMessagePatch(task, patch),
    onTimeout: () => {
      void stopGeneration({ assistantMessageId: task.assistantMessageId, reason: 'timeout', space: task.space, threadId: task.threadId });
    },
    onUpdated: () => emitUpdated(task),
    signal: task.controller.signal,
  }).finally(() => finishTask(task));
  return { promise: task.promise as Promise<void>, unsubscribe };
}

function startContinueAssistantMessage(input: StartContinueAssistantMessageInput): ManagedTaskStart<void> {
  const task = createTask(input.space, input.threadId);
  rememberAssistantMessage(task, input.assistantMessageId);
  const unsubscribe = addSubscriber(task, input.subscriber);
  const { subscriber: _subscriber, ...request } = input;
  task.promise = continueAssistantMessage({
    ...request,
    getStreamingVisibility: () => getTaskStreamingVisibility(task),
    onCreated: (ids) => emitCreated(task, ids),
    onMessagePatch: (patch) => emitMessagePatch(task, patch),
    onTimeout: () => {
      void stopGeneration({ assistantMessageId: task.assistantMessageId, reason: 'timeout', space: task.space, threadId: task.threadId });
    },
    onUpdated: () => emitUpdated(task),
    signal: task.controller.signal,
  }).finally(() => finishTask(task));
  return { promise: task.promise as Promise<void>, unsubscribe };
}

function startContinueAssistantReply(input: StartContinueAssistantReplyInput): ManagedTaskStart<void> {
  const task = createTask(input.space, input.threadId);
  const unsubscribe = addSubscriber(task, input.subscriber);
  const { subscriber: _subscriber, ...request } = input;
  task.promise = continueAssistantReply({
    ...request,
    getStreamingVisibility: () => getTaskStreamingVisibility(task),
    onCreated: (ids) => emitCreated(task, ids),
    onMessagePatch: (patch) => emitMessagePatch(task, patch),
    onTimeout: () => {
      void stopGeneration({ assistantMessageId: task.assistantMessageId, reason: 'timeout', space: task.space, threadId: task.threadId });
    },
    onUpdated: () => emitUpdated(task),
    signal: task.controller.signal,
  }).finally(() => finishTask(task));
  return { promise: task.promise as Promise<void>, unsubscribe };
}

function startReplyToAssistantMessage(input: StartReplyToAssistantMessageInput): ManagedTaskStart<{ userMessageId: string; assistantMessageId: string }> {
  const task = createTask(input.space, input.threadId);
  const unsubscribe = addSubscriber(task, input.subscriber);
  const { subscriber: _subscriber, ...request } = input;
  task.promise = replyToAssistantMessage({
    ...request,
    getStreamingVisibility: () => getTaskStreamingVisibility(task),
    onCreated: (ids) => emitCreated(task, ids),
    onMessagePatch: (patch) => emitMessagePatch(task, patch),
    onTimeout: () => {
      void stopGeneration({ assistantMessageId: task.assistantMessageId, reason: 'timeout', space: task.space, threadId: task.threadId });
    },
    onUpdated: () => emitUpdated(task),
    signal: task.controller.signal,
  }).finally(() => finishTask(task));
  return { promise: task.promise as Promise<{ userMessageId: string; assistantMessageId: string }>, unsubscribe };
}

function startRewriteUserMessage(input: StartRewriteUserMessageInput): ManagedTaskStart<{ userMessageId: string; assistantMessageId: string }> {
  const task = createTask(input.space, input.threadId);
  const unsubscribe = addSubscriber(task, input.subscriber);
  const { subscriber: _subscriber, ...request } = input;
  task.promise = rewriteUserMessage({
    ...request,
    getStreamingVisibility: () => getTaskStreamingVisibility(task),
    onCreated: (ids) => emitCreated(task, ids),
    onMessagePatch: (patch) => emitMessagePatch(task, patch),
    onTimeout: () => {
      void stopGeneration({ assistantMessageId: task.assistantMessageId, reason: 'timeout', space: task.space, threadId: task.threadId });
    },
    onUpdated: () => emitUpdated(task),
    signal: task.controller.signal,
  }).finally(() => finishTask(task));
  return { promise: task.promise as Promise<{ userMessageId: string; assistantMessageId: string }>, unsubscribe };
}

function subscribeToThread(space: PixorySpace, threadId: string, subscriber: AiGenerationSubscriber): () => void {
  const task = tasksByThreadId.get(taskKey(space, threadId));
  if (!task) {
    const timeout = setTimeout(() => subscriber.onSettled?.(), 0);
    return () => clearTimeout(timeout);
  }
  if (task.assistantMessageId && task.generationId) {
    setTimeout(() => {
      if (!task.finished && task.assistantMessageId && task.generationId) {
        subscriber.onCreated?.({
          assistantMessageId: task.assistantMessageId,
          generationId: task.generationId,
          thinkingExpected: task.thinkingExpected ?? undefined,
          userMessageId: task.userMessageId ?? '',
        });
      }
    }, 0);
  }
  return addSubscriber(task, subscriber);
}

function getActiveTaskForThread(space: PixorySpace, threadId: string): ActiveAiGenerationTaskInfo | null {
  const task = tasksByThreadId.get(taskKey(space, threadId));
  return task ? taskInfo(task) : null;
}

function hasActiveTask(assistantMessageId: string): boolean {
  return tasksByAssistantId.has(assistantMessageId);
}

async function stopGeneration({ assistantMessageId, reason = 'user', space, threadId }: { assistantMessageId: string | null; reason?: StopGenerationReason; space: PixorySpace; threadId: string | null }): Promise<void> {
  const task = assistantMessageId
    ? tasksByAssistantId.get(assistantMessageId)
    : threadId
      ? tasksByThreadId.get(taskKey(space, threadId))
      : undefined;
  const stoppedAssistantId = assistantMessageId ?? task?.assistantMessageId;
  if (task && !task.generationId) {
    task.controller.abort();
    await task.promise.catch(() => undefined);
    return;
  }
  if (!stoppedAssistantId && task) {
    task.controller.abort();
    await task.promise.catch(() => undefined);
    return;
  }
  if (stoppedAssistantId) {
    await stopStreamingMessage({ assistantMessageId: stoppedAssistantId, reason, space });
    if (task && task.assistantMessageId === stoppedAssistantId) {
      emitMessagePatch(task, {
        id: task.assistantMessageId!,
        generationId: task.generationId!,
        status: 'stopped',
      });
    }
  }
  task?.controller.abort();
}

async function runGenerationReconciliation(space: PixorySpace): Promise<void> {
  const runtimeEpoch = runtimeEpochBySpace.get(space) ?? 0;
  const isActive = () => !suspendedSpaces.has(space) && (runtimeEpochBySpace.get(space) ?? 0) === runtimeEpoch;
  if (!isActive()) return;
  const jobs = await runWithDatabaseSpace(space, (db) => listRecoverableGenerationJobs(db, space));
  if (!isActive()) return;
  for (const candidate of jobs) {
    if (!isActive()) return;
    if (tasksByThreadId.has(taskKey(space, candidate.threadId))) continue;
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + RECOVERY_LEASE_MS).toISOString();
    const claimed = await runWithDatabaseSpace(space, (db) => claimGenerationRecovery(db, {
      jobId: candidate.id,
      leaseExpiresAt,
      leaseOwner: RECOVERY_OWNER,
      now: now.toISOString(),
    }));
    if (!isActive()) return;
    if (!claimed) continue;
    const decision = decideGenerationRecovery(claimed);
    if (decision === 'stop') {
      await stopInterruptedGeneration(claimed, '生成恢复次数已用尽，请手动重试。');
      continue;
    }
    const attempt = await runWithDatabaseSpace(space, (db) => beginGenerationRecoveryAttempt(db, {
      attemptId: `recovery_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
      decision,
      generationId: claimed.generationId,
      leaseExpiresAt,
      leaseOwner: RECOVERY_OWNER,
      now: new Date().toISOString(),
    }));
    if (!isActive()) return;
    if (!attempt) continue;

    const task = createTask(space, attempt.threadId);
    task.generationId = attempt.generationId;
    task.userMessageId = attempt.userMessageId;
    rememberAssistantMessage(task, attempt.assistantMessageId);
    task.promise = recoverInterruptedGeneration({
      decision,
      job: attempt,
      signal: task.controller.signal,
      onMessagePatch: (patch) => emitMessagePatch(task, patch),
      onTimeout: () => {
        void stopGeneration({ assistantMessageId: attempt.assistantMessageId, reason: 'timeout', space, threadId: attempt.threadId });
      },
      onUpdated: () => emitUpdated(task),
    }).catch(async (error) => {
      const message = error instanceof Error ? error.message : '生成恢复失败。';
      await stopInterruptedGeneration(attempt, message);
    }).finally(() => finishTask(task));
    await task.promise;
  }
}

function reconcileInterruptedGenerations(space: PixorySpace): Promise<void> {
  const current = reconciliationBySpace.get(space);
  if (current) return current;
  const promise = runGenerationReconciliation(space).finally(() => {
    if (reconciliationBySpace.get(space) === promise) reconciliationBySpace.delete(space);
  });
  reconciliationBySpace.set(space, promise);
  return promise;
}

function resumeSpace(space: PixorySpace): void {
  runtimeEpochBySpace.set(space, (runtimeEpochBySpace.get(space) ?? 0) + 1);
  suspendedSpaces.delete(space);
}

async function suspendSpace(space: PixorySpace): Promise<void> {
  suspendedSpaces.add(space);
  runtimeEpochBySpace.set(space, (runtimeEpochBySpace.get(space) ?? 0) + 1);
  const tasks = [...tasksByThreadId.values()].filter((task) => task.space === space);
  tasks.forEach((task) => task.controller.abort());
  await Promise.allSettled([
    ...tasks.map((task) => task.promise),
    ...(reconciliationBySpace.get(space) ? [reconciliationBySpace.get(space)!] : []),
  ]);
  await runWithDatabaseSpace(space, (db) => markInterruptedGenerationJobs(db, {
    now: new Date().toISOString(),
    space,
  }));
}

export const aiGenerationManager = {
  startContinueAssistantReply,
  getActiveTaskForThread,
  hasActiveTask,
  reconcileInterruptedGenerations,
  resumeSpace,
  startContinueAssistantMessage,
  startReplyToAssistantMessage,
  startRegenerateAssistantMessage,
  startRewriteUserMessage,
  startSendUserMessage,
  stopGeneration,
  suspendSpace,
  subscribeToThread,
};
