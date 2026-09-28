import { getDatabase } from '../../database';
import { runDiaryJob } from './diarySchedulerService';

export async function runDiaryJobForAnySpace(jobId: string): Promise<void> {
  const db = await getDatabase('normal');
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM companion_diary_jobs WHERE id = ?',
    jobId,
  );
  if (row) {
    await runDiaryJob('normal', jobId);
  }
}
