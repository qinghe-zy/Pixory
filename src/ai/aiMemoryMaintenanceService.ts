import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import {
  hasStrongProfileSignal,
  maybeInitializeUserProfile,
  maybeUpdateUserProfile,
} from './aiMemoryProfileService';
import { compressOldestThreadRounds, maybeMergeSummarySegments } from './aiMemorySummaryService';

type CompanionMaintenanceReason = 'reply_completed' | 'leave_chat' | 'app_background';

interface ActiveMaintenanceTask {
  pendingReason: CompanionMaintenanceReason | null;
  promise: Promise<void>;
  reason: CompanionMaintenanceReason;
}

const activeMaintenanceTasks = new Map<string, ActiveMaintenanceTask>();

function maintenanceTaskKey(space: PixorySpace, threadId: string): string {
  return `${space}:${threadId}`;
}

function reasonPriority(reason: CompanionMaintenanceReason): number {
  return reason === 'reply_completed' ? 1 : 2;
}

function chooseStrongerReason(
  left: CompanionMaintenanceReason | null,
  right: CompanionMaintenanceReason
): CompanionMaintenanceReason {
  if (!left || reasonPriority(right) > reasonPriority(left)) {
    return right;
  }
  return left;
}

async function recordMaintenanceFailure(space: PixorySpace, threadId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'memory_maintenance_failed';
  await runWithDatabaseSpace(space, (db) =>
    aiThreadRepository.updateThreadMemoryJob(db, {
      lastMaintenanceError: message,
      threadId,
    })
  ).catch(() => undefined);
}

export async function runCompanionMemoryMaintenance(input: {
  space: PixorySpace;
  threadId: string;
  reason: CompanionMaintenanceReason;
}): Promise<void> {
  await compressOldestThreadRounds(input.space, input.threadId);
  await maybeInitializeUserProfile(input.space, input.threadId);
  await maybeUpdateUserProfile(
    input.space,
    input.threadId,
    input.reason === 'reply_completed' ? 'message_interval' : input.reason
  );
  const lastUserMessage = await runWithDatabaseSpace(input.space, async (db) => {
    const messages = await aiThreadRepository.listRecentCompletedNonSystemMessages(db, input.threadId, 12);
    return [...messages].reverse().find((message) => message.role === 'user' && message.status === 'completed') ?? null;
  });
  if (lastUserMessage && hasStrongProfileSignal(lastUserMessage.content)) {
    await maybeUpdateUserProfile(input.space, input.threadId, 'strong_signal');
  }
  await maybeMergeSummarySegments(input.space, input.threadId);
}

export async function scheduleCompanionMemoryMaintenance(input: {
  space: PixorySpace;
  threadId: string;
  reason: CompanionMaintenanceReason;
}): Promise<void> {
  const key = maintenanceTaskKey(input.space, input.threadId);
  const activeEntry = activeMaintenanceTasks.get(key);
  if (activeEntry) {
    activeEntry.pendingReason = chooseStrongerReason(activeEntry.pendingReason, input.reason);
    return activeEntry.promise;
  }
  const entry: ActiveMaintenanceTask = {
    pendingReason: null,
    promise: Promise.resolve(),
    reason: input.reason,
  };
  const task = (async () => {
    let reason: CompanionMaintenanceReason = input.reason;
    while (true) {
      try {
        await runCompanionMemoryMaintenance({ ...input, reason });
      } catch (error) {
        await recordMaintenanceFailure(input.space, input.threadId, error);
      }
      const pendingReason = entry.pendingReason;
      entry.pendingReason = null;
      if (!pendingReason || reasonPriority(pendingReason) <= reasonPriority(reason)) {
        break;
      }
      reason = pendingReason;
      entry.reason = reason;
    }
  })()
    .finally(() => {
      if (activeMaintenanceTasks.get(key) === entry) {
        activeMaintenanceTasks.delete(key);
      }
    });
  entry.promise = task;
  activeMaintenanceTasks.set(key, entry);
  return task;
}

export function isThreadMemoryMaintenanceActive(space: PixorySpace, threadId: string): boolean {
  return activeMaintenanceTasks.has(maintenanceTaskKey(space, threadId));
}
