import type { PixorySpace } from '../database';
import {
  isThreadMemoryMaintenanceActive,
  resumeMemoryMaintenanceSpace,
  runLocalCurrentTurnExtraction,
  runUnifiedMemoryMaintenancePass,
  scheduleMemoryMaintenance,
  suspendMemoryMaintenanceSpace,
} from './aiMemoryMaintenanceQueue';

export type CompanionMaintenanceReason = 'reply_completed' | 'leave_chat' | 'app_background';
const DEFERRED_REPLY_MAINTENANCE_DELAY_MS = 1200;
type DeferredReplyMaintenanceInput = {
  space: PixorySpace;
  threadId: string;
  reason: CompanionMaintenanceReason;
  branchScopes?: import('../database/repositories/aiThreadRepository').AiBranchScope[];
  thread?: import('./types').AiThreadRecord;
  userMessage?: Pick<import('../database/repositories/aiThreadRepository').AiMessageRecord, 'id' | 'content'>;
  assistantMessageId?: string;
};

const deferredReplyMaintenanceTimers = new Map<string, {
  input: DeferredReplyMaintenanceInput;
  rejectors: Array<(error?: unknown) => void>;
  resolvers: Array<() => void>;
  timeout: ReturnType<typeof setTimeout>;
}>();
const activeLocalExtractions = new Map<PixorySpace, Set<Promise<void>>>();

export { isThreadMemoryMaintenanceActive, runUnifiedMemoryMaintenancePass, scheduleMemoryMaintenance };

function trackLocalExtraction(space: PixorySpace, task: Promise<void>): void {
  const tasks = activeLocalExtractions.get(space) ?? new Set<Promise<void>>();
  tasks.add(task);
  activeLocalExtractions.set(space, tasks);
  void task.finally(() => {
    tasks.delete(task);
    if (tasks.size === 0) activeLocalExtractions.delete(space);
  }).catch(() => undefined);
}

function deferredReplyMaintenanceKey(space: PixorySpace, threadId: string): string {
  return `${space}:${threadId}`;
}

function scheduleDeferredReplyMaintenanceTimeout(
  key: string,
  entry: {
    input: DeferredReplyMaintenanceInput;
    rejectors: Array<(error?: unknown) => void>;
    resolvers: Array<() => void>;
    timeout: ReturnType<typeof setTimeout>;
  }
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    deferredReplyMaintenanceTimers.delete(key);
    const input = entry.input;
    void scheduleMemoryMaintenance(input)
      .then(() => {
        entry.resolvers.forEach((resolve) => resolve());
      })
      .catch((error) => {
        entry.rejectors.forEach((reject) => reject(error));
      });
  }, DEFERRED_REPLY_MAINTENANCE_DELAY_MS);
}

export function scheduleCompanionMemoryMaintenance(input: {
  space: PixorySpace;
  threadId: string;
  reason: CompanionMaintenanceReason;
}): Promise<void> {
  return scheduleMemoryMaintenance(input);
}

export function scheduleDeferredCompanionMemoryMaintenance(input: DeferredReplyMaintenanceInput): Promise<void> {
  const key = deferredReplyMaintenanceKey(input.space, input.threadId);
  const localExtraction = runLocalCurrentTurnExtraction(input).catch(() => undefined);
  trackLocalExtraction(input.space, localExtraction);
  const maintenanceInput = { ...input, currentTurnExtractionDone: true };
  const existing = deferredReplyMaintenanceTimers.get(key);
  return new Promise((resolve, reject) => {
    if (existing) {
      clearTimeout(existing.timeout);
      existing.input = maintenanceInput;
      existing.resolvers.push(resolve);
      existing.rejectors.push(reject);
      existing.timeout = scheduleDeferredReplyMaintenanceTimeout(key, existing);
      return;
    }
    const entry = {
      input: maintenanceInput,
      rejectors: [reject],
      resolvers: [resolve],
      timeout: null as unknown as ReturnType<typeof setTimeout>,
    };
    entry.timeout = scheduleDeferredReplyMaintenanceTimeout(key, entry);
    deferredReplyMaintenanceTimers.set(key, entry);
  });
}

export function resumeCompanionMemoryMaintenance(space: PixorySpace): void {
  resumeMemoryMaintenanceSpace(space);
}

export async function suspendCompanionMemoryMaintenance(space: PixorySpace): Promise<void> {
  const queueSuspension = suspendMemoryMaintenanceSpace(space);
  for (const [key, entry] of deferredReplyMaintenanceTimers) {
    if (entry.input.space !== space) continue;
    clearTimeout(entry.timeout);
    deferredReplyMaintenanceTimers.delete(key);
    entry.resolvers.forEach((resolve) => resolve());
  }
  await queueSuspension;
  await Promise.allSettled([...(activeLocalExtractions.get(space) ?? [])]);
}
