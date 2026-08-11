import { runWithDatabaseSpace, type PixorySpace } from '../../database';

import { runDiaryJobInBackground } from './diaryGenerationManager';
import { diaryRepository } from './diaryRepository';
import { scheduleDiaryJob } from './diarySchedulerService';

export async function regenerateDiaryVersion(input: {
  space: PixorySpace;
  versionId: string;
}): Promise<{ diaryId: string; versionId: string }> {
  const { entry, sourceJob } = await runWithDatabaseSpace(input.space, async (db) => {
    const entry = await diaryRepository.findVersionEntryById(db, input.versionId);
    if (!entry) {
      throw new Error('日记版本不存在或已删除。');
    }
    const sourceJob = await diaryRepository.findSourceJobForVersion(db, input.versionId);
    if (!sourceJob) {
      throw new Error('这版日记缺少可用的生成来源，无法重新生成。');
    }
    return { entry, sourceJob };
  });

  const job = await scheduleDiaryJob({
    space: input.space,
    roleCardId: sourceJob.roleCardId,
    diaryDate: sourceJob.diaryDate,
    triggerKind: 'manual',
    scheduledFor: new Date().toISOString(),
    sourceThreadId: sourceJob.sourceThreadId,
    sourceBranchRouteJson: sourceJob.sourceBranchRouteJson,
    sourceMessagesJson: sourceJob.sourceMessagesJson,
    sourceSummarySnapshot: sourceJob.sourceSummarySnapshot,
    sourceSystemPromptSnapshot: sourceJob.sourceSystemPromptSnapshot,
    roleSnapshotJson: sourceJob.roleSnapshotJson,
    jobContextSnapshotHash: sourceJob.jobContextSnapshotHash,
  });
  await runDiaryJobInBackground({ jobId: job.id, space: input.space });

  return runWithDatabaseSpace(input.space, async (db) => {
    const [latest, completedJob] = await Promise.all([
      diaryRepository.findDiaryVersion(db, entry.diary.id),
      diaryRepository.findJobById(db, job.id),
    ]);
    if (latest && latest.version.id !== input.versionId) {
      return { diaryId: latest.diary.id, versionId: latest.version.id };
    }
    throw new Error(completedJob?.errorMessage ?? '日记重新生成失败。');
  });
}
