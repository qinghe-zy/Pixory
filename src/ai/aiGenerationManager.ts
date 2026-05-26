import type { PixorySpace } from '../database';
import {
  regenerateAssistantMessage,
  rewriteUserMessage,
  sendUserMessage,
  stopStreamingMessage,
  type AiStreamingMessagePatch,
  type RetryAssistantMessageInput,
  type RewriteUserMessageInput,
  type SendUserMessageInput,
} from './aiChatService';

export type AiGenerationSubscriber = {
  onCreated?: (ids: { userMessageId: string; assistantMessageId: string }) => void;
  onMessagePatch?: (patch: AiStreamingMessagePatch) => void;
  onUpdated?: () => void;
  onSettled?: () => void;
};

type ActiveGenerationTask = {
  assistantMessageId: string | null;
  controller: AbortController;
  finished: boolean;
  promise: Promise<unknown>;
  space: PixorySpace;
  subscribers: Set<AiGenerationSubscriber>;
  threadId: string;
};

type ManagedTaskStart<T> = {
  promise: Promise<T>;
  unsubscribe: () => void;
};

type StartSendUserMessageInput = Omit<SendUserMessageInput, 'signal' | 'onCreated' | 'onMessagePatch' | 'onUpdated'> & {
  subscriber?: AiGenerationSubscriber;
};

type StartRegenerateAssistantMessageInput = Omit<RetryAssistantMessageInput, 'signal' | 'onMessagePatch' | 'onUpdated'> & {
  subscriber?: AiGenerationSubscriber;
};

type StartRewriteUserMessageInput = Omit<RewriteUserMessageInput, 'signal' | 'onCreated' | 'onMessagePatch' | 'onUpdated'> & {
  subscriber?: AiGenerationSubscriber;
};

export type ActiveAiGenerationTaskInfo = {
  assistantMessageId: string | null;
  space: PixorySpace;
  threadId: string;
};

const tasksByThreadId = new Map<string, ActiveGenerationTask>();
const tasksByAssistantId = new Map<string, ActiveGenerationTask>();

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

function emitCreated(task: ActiveGenerationTask, ids: { userMessageId: string; assistantMessageId: string }) {
  if (task.finished) {
    return;
  }
  rememberAssistantMessage(task, ids.assistantMessageId);
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
    promise: Promise.resolve(),
    space,
    subscribers: new Set(),
    threadId,
  };
  tasksByThreadId.set(key, task);
  return task;
}

function taskInfo(task: ActiveGenerationTask): ActiveAiGenerationTaskInfo {
  return {
    assistantMessageId: task.assistantMessageId,
    space: task.space,
    threadId: task.threadId,
  };
}

function startSendUserMessage(input: StartSendUserMessageInput): ManagedTaskStart<{ userMessageId: string; assistantMessageId: string }> {
  const task = createTask(input.space, input.threadId);
  const unsubscribe = addSubscriber(task, input.subscriber);
  const { subscriber: _subscriber, ...request } = input;
  task.promise = sendUserMessage({
    ...request,
    onCreated: (ids) => emitCreated(task, ids),
    onMessagePatch: (patch) => emitMessagePatch(task, patch),
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
    onMessagePatch: (patch) => emitMessagePatch(task, patch),
    onUpdated: () => emitUpdated(task),
    signal: task.controller.signal,
  }).finally(() => finishTask(task));
  return { promise: task.promise as Promise<void>, unsubscribe };
}

function startRewriteUserMessage(input: StartRewriteUserMessageInput): ManagedTaskStart<{ userMessageId: string; assistantMessageId: string }> {
  const task = createTask(input.space, input.threadId);
  const unsubscribe = addSubscriber(task, input.subscriber);
  const { subscriber: _subscriber, ...request } = input;
  task.promise = rewriteUserMessage({
    ...request,
    onCreated: (ids) => emitCreated(task, ids),
    onMessagePatch: (patch) => emitMessagePatch(task, patch),
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
  return addSubscriber(task, subscriber);
}

function getActiveTaskForThread(space: PixorySpace, threadId: string): ActiveAiGenerationTaskInfo | null {
  const task = tasksByThreadId.get(taskKey(space, threadId));
  return task ? taskInfo(task) : null;
}

function hasActiveTask(assistantMessageId: string): boolean {
  return tasksByAssistantId.has(assistantMessageId);
}

async function stopGeneration({ assistantMessageId, space, threadId }: { assistantMessageId: string | null; space: PixorySpace; threadId: string | null }): Promise<void> {
  const task = assistantMessageId
    ? tasksByAssistantId.get(assistantMessageId)
    : threadId
      ? tasksByThreadId.get(taskKey(space, threadId))
      : undefined;
  task?.controller.abort();
  const stoppedAssistantId = assistantMessageId ?? task?.assistantMessageId;
  if (!stoppedAssistantId && task) {
    await task.promise.catch(() => undefined);
    return;
  }
  if (stoppedAssistantId) {
    await stopStreamingMessage({ assistantMessageId: stoppedAssistantId, space });
  }
}

export const aiGenerationManager = {
  getActiveTaskForThread,
  hasActiveTask,
  startRegenerateAssistantMessage,
  startRewriteUserMessage,
  startSendUserMessage,
  stopGeneration,
  subscribeToThread,
};
