import {
  aiThreadRepository,
  runWithDatabaseSpace,
  settingsRepository,
  type AiThreadRecord,
  type PixorySpace,
} from '../../database';

import { resumeDiaryBackgroundTasks } from './diaryGenerationManager';
import { nextDiaryWakeupAt, runDueDiaryJobs, scheduleDiaryWakeup } from './diarySchedulerService';

const coordinationBySpace = new Map<PixorySpace, Promise<void>>();

export function selectLatestDiaryThreadPerRole(threads: AiThreadRecord[]): AiThreadRecord[] {
  const selectedRoleIds = new Set<string>();
  return threads
    .filter((thread) => Boolean(thread.roleCardId?.trim()))
    .slice()
    .sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
      || right.createdAt.localeCompare(left.createdAt)
      || left.id.localeCompare(right.id))
    .filter((thread) => {
      const roleCardId = thread.roleCardId as string;
      if (selectedRoleIds.has(roleCardId)) return false;
      selectedRoleIds.add(roleCardId);
      return true;
    });
}

async function coordinateSpace(space: PixorySpace, now: Date): Promise<void> {
  resumeDiaryBackgroundTasks(space);
  await runDueDiaryJobs(space);
  await runWithDatabaseSpace(space, async (db) => {
    if ((await settingsRepository.getValue(db, 'AI_ROLE_DIARY_ENABLED')) === 'false') {
      return;
    }
    const threads = selectLatestDiaryThreadPerRole(
      await aiThreadRepository.listActiveRoleThreads(db, space),
    );
    const scheduledFor = nextDiaryWakeupAt(now);
    for (const thread of threads) {
      const branchScopes = await aiThreadRepository.resolveBranchLineage(
        db,
        thread.currentBranchRootMessageId,
        thread.currentBranchVersionIndex,
      );
      await scheduleDiaryWakeup({ branchScopes, scheduledFor, space, threadId: thread.id });
    }
  });
}

export async function coordinateDiaryRuntime(input: {
  space: PixorySpace;
  allowPersonal?: boolean;
  now?: Date;
}): Promise<void> {
  if (input.space === 'personal' && input.allowPersonal !== true) {
    throw new Error('Personal diary runtime requires an unlocked personal space.');
  }
  const existing = coordinationBySpace.get(input.space);
  if (existing) {
    return existing;
  }
  const task = coordinateSpace(input.space, input.now ?? new Date());
  coordinationBySpace.set(input.space, task);
  try {
    await task;
  } finally {
    if (coordinationBySpace.get(input.space) === task) {
      coordinationBySpace.delete(input.space);
    }
  }
}
