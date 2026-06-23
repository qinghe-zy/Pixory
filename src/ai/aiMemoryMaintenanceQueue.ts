import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type { AiBranchScope, AiMessageRecord } from '../database/repositories/aiThreadRepository';
import { captureDeepMemoryForExchange } from './aiMemoryCaptureService';
import {
  hasStrongProfileSignal,
  maybeInitializeUserProfile,
  maybeUpdateUserProfile,
  type ProfileUpdateReason,
} from './aiMemoryProfileService';
import { compressOldestThreadRounds, maybeMergeSummarySegments, type MemoryMaintenanceStepResult } from './aiMemorySummaryService';
import type { AiThreadRecord } from './types';

export type MemoryMaintenanceReason = 'reply_completed' | 'leave_chat' | 'app_background' | 'manual';

interface ScheduleMemoryMaintenanceInput {
  space: PixorySpace;
  threadId: string;
  reason: MemoryMaintenanceReason;
  branchScopes?: AiBranchScope[];
  thread?: AiThreadRecord;
  userMessage?: Pick<AiMessageRecord, 'id' | 'content'>;
  assistantMessageId?: string;
}

interface ActiveMaintenanceTask {
  currentInput: ScheduleMemoryMaintenanceInput;
  done: (error?: unknown) => void;
  pendingReason: MemoryMaintenanceReason | null;
  pendingInput: ScheduleMemoryMaintenanceInput | null;
  promise: Promise<void>;
  reason: MemoryMaintenanceReason;
}

interface MaintenancePassAccumulator {
  error: string | null;
  modelId: string | null;
  providerId: string | null;
  remoteFailedUsedFallback: boolean;
  usedFallback: boolean;
  usedRemote: boolean;
}

type ImportAwareMaintenanceContext = {
  reversibleImportSessionId?: string | null;
  allowIrreversibleImportEffects: boolean;
};

const activeMaintenanceTasks = new Map<string, ActiveMaintenanceTask>();
const queuedMaintenanceTasks: ActiveMaintenanceTask[] = [];
let globalMaintenanceRunnerActive = false;

function maintenanceTaskKey(space: PixorySpace, threadId: string): string {
  return `${space}:${threadId}`;
}

function reasonPriority(reason: MemoryMaintenanceReason): number {
  if (reason === 'app_background' || reason === 'leave_chat') {
    return 3;
  }
  if (reason === 'reply_completed') {
    return 2;
  }
  return 1;
}

function chooseStrongerReason(left: MemoryMaintenanceReason | null, right: MemoryMaintenanceReason): MemoryMaintenanceReason {
  if (!left || reasonPriority(right) > reasonPriority(left)) {
    return right;
  }
  return left;
}

function profileReasonForMaintenance(reason: MemoryMaintenanceReason): ProfileUpdateReason {
  if (reason === 'reply_completed' || reason === 'manual') {
    return 'message_interval';
  }
  return reason;
}

function consumeStep(accumulator: MaintenancePassAccumulator, result: MemoryMaintenanceStepResult): void {
  accumulator.usedRemote = accumulator.usedRemote || result.usedRemote;
  accumulator.usedFallback = accumulator.usedFallback || result.usedFallback;
  accumulator.remoteFailedUsedFallback = accumulator.remoteFailedUsedFallback || Boolean(result.error && result.usedFallback);
  accumulator.error = accumulator.error ?? result.error;
  accumulator.providerId = accumulator.providerId ?? result.providerId;
  accumulator.modelId = accumulator.modelId ?? result.modelId;
}

async function recordMaintenanceResult(space: PixorySpace, threadId: string, accumulator: MaintenancePassAccumulator): Promise<void> {
  await runWithDatabaseSpace(space, (db) =>
    aiThreadRepository.updateThreadMemoryJob(db, {
      lastMaintenanceCompletedAt: new Date().toISOString(),
      lastMaintenanceError: accumulator.error,
      lastMaintenanceModelId: accumulator.modelId,
      lastMaintenanceModelProviderId: accumulator.providerId,
      lastMaintenanceUsedFallback: accumulator.remoteFailedUsedFallback ? 1 : 0,
      threadId,
    })
  );
}

async function recordMaintenanceFailure(space: PixorySpace, threadId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'memory_maintenance_failed';
  await runWithDatabaseSpace(space, (db) =>
    aiThreadRepository.updateThreadMemoryJob(db, {
      lastMaintenanceCompletedAt: new Date().toISOString(),
      lastMaintenanceError: message,
      threadId,
    })
  ).catch(() => undefined);
}

async function loadLastUserMessage(space: PixorySpace, threadId: string, branchScopes?: AiBranchScope[]): Promise<AiMessageRecord | null> {
  return runWithDatabaseSpace(space, async (db) => {
    const messages = await aiThreadRepository.listRecentCompletedNonSystemMessages(db, threadId, 12, branchScopes);
    return [...messages].reverse().find((message) => message.role === 'user' && message.status === 'completed') ?? null;
  });
}

export async function runUnifiedMemoryMaintenancePass(input: ScheduleMemoryMaintenanceInput): Promise<void> {
  const branchScopes = input.branchScopes ?? [];
  const accumulator: MaintenancePassAccumulator = {
    error: null,
    modelId: null,
    providerId: null,
    remoteFailedUsedFallback: false,
    usedFallback: false,
    usedRemote: false,
  };
  let allowRemoteModel = true;
  let reversibleImportSessionId: string | null = null;
  let rollbackState: 'available' | 'locked' | 'rolled_back' | null = null;
  const runStep = async (step: Promise<MemoryMaintenanceStepResult>) => {
    const result = await step;
    consumeStep(accumulator, result);
    if (result.usedRemote) {
      allowRemoteModel = false;
    }
  };

  const reviewGateState = await runWithDatabaseSpace(input.space, (db) =>
    aiThreadRepository.loadContinuityImportReviewGateState(db, input.threadId, branchScopes)
  );
  rollbackState = await runWithDatabaseSpace(input.space, async (db) => {
    const importSessionId = await aiThreadRepository.resolveContinuityImportSessionIdForBranchScopes(db, input.threadId, branchScopes);
    if (!importSessionId) {
      return null;
    }
    const session = await aiThreadRepository.findContinuityImportSessionById(db, importSessionId);
    return session?.rollbackState ?? null;
  });
  const importAwareContext: ImportAwareMaintenanceContext = {
    allowIrreversibleImportEffects: true,
    reversibleImportSessionId,
  };
  if ((reviewGateState === 'pending_review' || reviewGateState === 'failed') || rollbackState === 'available') {
    importAwareContext.allowIrreversibleImportEffects = false;
    reversibleImportSessionId = await runWithDatabaseSpace(input.space, (db) =>
      aiThreadRepository.resolveContinuityImportSessionIdForBranchScopes(db, input.threadId, branchScopes)
    );
    importAwareContext.reversibleImportSessionId = reversibleImportSessionId;
  }
  if (importAwareContext.allowIrreversibleImportEffects === false && !importAwareContext.reversibleImportSessionId) {
    await recordMaintenanceResult(input.space, input.threadId, accumulator);
    return;
  }

  await runStep(compressOldestThreadRounds(input.space, input.threadId, { allowRemoteModel, branchScopes, ...importAwareContext }));
  await runStep(maybeInitializeUserProfile(input.space, input.threadId, { allowRemoteModel, branchScopes, ...importAwareContext }));
  await runStep(maybeUpdateUserProfile(input.space, input.threadId, profileReasonForMaintenance(input.reason), { allowRemoteModel, branchScopes, ...importAwareContext }));

  const lastUserMessage = await loadLastUserMessage(input.space, input.threadId, branchScopes);
  if (lastUserMessage && hasStrongProfileSignal(lastUserMessage.content)) {
    await runStep(maybeUpdateUserProfile(input.space, input.threadId, 'strong_signal', { allowRemoteModel, branchScopes, ...importAwareContext }));
  }

  if (input.thread && input.userMessage && input.assistantMessageId) {
    await runStep(captureDeepMemoryForExchange({
      allowRemoteModel,
      allowIrreversibleImportEffects: importAwareContext.allowIrreversibleImportEffects,
      assistantMessageId: input.assistantMessageId,
      branchScopes,
      reversibleImportSessionId: importAwareContext.reversibleImportSessionId,
      space: input.space,
      thread: input.thread,
      userMessage: input.userMessage,
    }));
  }

  await runStep(maybeMergeSummarySegments(input.space, input.threadId, { allowRemoteModel, branchScopes, ...importAwareContext }));
  await recordMaintenanceResult(input.space, input.threadId, accumulator);
}

function enqueueMaintenanceTask(entry: ActiveMaintenanceTask): void {
  queuedMaintenanceTasks.push(entry);
  queuedMaintenanceTasks.sort((left, right) => reasonPriority(right.reason) - reasonPriority(left.reason));
  void drainMaintenanceQueue();
}

async function drainMaintenanceQueue(): Promise<void> {
  if (globalMaintenanceRunnerActive) {
    return;
  }
  globalMaintenanceRunnerActive = true;
  try {
    while (queuedMaintenanceTasks.length > 0) {
      const entry = queuedMaintenanceTasks.shift();
      if (!entry) {
        continue;
      }
      let currentInput = entry.currentInput;
      while (true) {
        try {
          await runUnifiedMemoryMaintenancePass(currentInput);
        } catch (error) {
          await recordMaintenanceFailure(currentInput.space, currentInput.threadId, error);
        }
        const pendingReason = entry.pendingReason;
        const pendingInput = entry.pendingInput;
        entry.pendingReason = null;
        entry.pendingInput = null;
        if (!pendingReason) {
          break;
        }
        const hasPendingExchange = Boolean(pendingInput?.thread && pendingInput.userMessage && pendingInput.assistantMessageId);
        const hasStrongerReason = reasonPriority(pendingReason) > reasonPriority(currentInput.reason);
        const hasDifferentReason = pendingReason !== currentInput.reason;
        if (!hasPendingExchange && !hasStrongerReason && !hasDifferentReason) {
          break;
        }
        currentInput = {
          ...(pendingInput ?? currentInput),
          reason: pendingReason,
        };
        entry.reason = pendingReason;
      }
      entry.done(undefined);
    }
  } finally {
    globalMaintenanceRunnerActive = false;
  }
}

export async function scheduleMemoryMaintenance(input: ScheduleMemoryMaintenanceInput): Promise<void> {
  const key = maintenanceTaskKey(input.space, input.threadId);
  const activeEntry = activeMaintenanceTasks.get(key);
  if (activeEntry) {
    const nextReason = chooseStrongerReason(activeEntry.reason, input.reason);
    activeEntry.reason = nextReason;
    if (queuedMaintenanceTasks.includes(activeEntry)) {
      activeEntry.currentInput = {
        ...input,
        reason: nextReason,
      };
      queuedMaintenanceTasks.sort((left, right) => reasonPriority(right.reason) - reasonPriority(left.reason));
      return activeEntry.promise;
    }
    activeEntry.pendingReason = chooseStrongerReason(activeEntry.pendingReason, input.reason);
    activeEntry.pendingInput = input;
    return activeEntry.promise;
  }
  let finishTask: (error?: unknown) => void = () => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    finishTask = (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };
  });
  const entry: ActiveMaintenanceTask = {
    currentInput: input,
    done: finishTask,
    pendingInput: null,
    pendingReason: null,
    promise,
    reason: input.reason,
  };
  entry.promise = entry.promise.finally(() => {
    if (activeMaintenanceTasks.get(key) === entry) {
      activeMaintenanceTasks.delete(key);
    }
  });
  activeMaintenanceTasks.set(key, entry);
  enqueueMaintenanceTask(entry);
  return entry.promise;
}

export function isThreadMemoryMaintenanceActive(space: PixorySpace, threadId: string): boolean {
  return activeMaintenanceTasks.has(maintenanceTaskKey(space, threadId));
}
