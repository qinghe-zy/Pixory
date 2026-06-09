import type { PixorySpace } from '../database';
import {
  isThreadMemoryMaintenanceActive,
  runUnifiedMemoryMaintenancePass,
  scheduleMemoryMaintenance,
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

export { isThreadMemoryMaintenanceActive, runUnifiedMemoryMaintenancePass, scheduleMemoryMaintenance };

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
  const existing = deferredReplyMaintenanceTimers.get(key);
  return new Promise((resolve, reject) => {
    if (existing) {
      clearTimeout(existing.timeout);
      existing.input = input;
      existing.resolvers.push(resolve);
      existing.rejectors.push(reject);
      existing.timeout = scheduleDeferredReplyMaintenanceTimeout(key, existing);
      return;
    }
    const entry = {
      input,
      rejectors: [reject],
      resolvers: [resolve],
      timeout: null as unknown as ReturnType<typeof setTimeout>,
    };
    entry.timeout = scheduleDeferredReplyMaintenanceTimeout(key, entry);
    deferredReplyMaintenanceTimers.set(key, entry);
  });
}
