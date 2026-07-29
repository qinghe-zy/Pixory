import { runWithDatabaseSpace, type PixorySpace } from '../../database';
import { listReadyCompanionRuntimeJobs } from './companionEventRepository';
import { runCompanionEventEnrichmentJob } from './companionEventEnrichmentService';
import { dreamRepository } from '../dream/dreamRepository';
import { runDreamJob } from '../dream/dreamWorker';
import { thoughtRepository } from '../thought/thoughtRepository';
import { runThoughtJob } from '../thought/thoughtWorker';

const activePasses = new Map<PixorySpace, Promise<void>>();

async function scheduleNextReadyPass(input: {
  space: PixorySpace;
  allowRemoteModelForPersonal?: boolean;
}): Promise<void> {
  const now = new Date().toISOString();
  const hasMore = await runWithDatabaseSpace(input.space, async (db) => {
    const [companion, dreams, thoughts] = await Promise.all([
      listReadyCompanionRuntimeJobs(db, { limit: 1, now, space: input.space }),
      dreamRepository.listReadyJobs(db, { limit: 1, now, space: input.space }),
      thoughtRepository.listReadyJobs(db, { limit: 1, now, space: input.space }),
    ]);
    return companion.length + dreams.length + thoughts.length > 0;
  });
  if (hasMore) {
    scheduleCompanionMaintenance({
      allowRemoteModelForPersonal: input.allowRemoteModelForPersonal,
      delayMs: 250,
      space: input.space,
    });
  }
}

export async function runCompanionMaintenancePass(input: {
  space: PixorySpace;
  allowRemoteModelForPersonal?: boolean;
  now?: string;
}): Promise<void> {
  const existing = activePasses.get(input.space);
  if (existing) return existing;
  const pass = (async () => {
    const now = input.now ?? new Date().toISOString();
    // A maintenance pass deliberately performs at most one optional model call.
    // This keeps enrichment sparse even if several local observations queue while offline.
    const [jobs, dreamJobs, thoughtJobs] = await runWithDatabaseSpace(input.space, async (db) => Promise.all([
      listReadyCompanionRuntimeJobs(db, { limit: 1, now, space: input.space }),
      dreamRepository.listReadyJobs(db, { limit: 1, now, space: input.space }),
      thoughtRepository.listReadyJobs(db, { limit: 1, now, space: input.space }),
    ]));
    const candidate = [
      ...jobs.map((job) => ({ createdAt: job.createdAt, kind: 'companion' as const, job })),
      ...dreamJobs.map((job) => ({ createdAt: job.createdAt, kind: 'dream' as const, job })),
      ...thoughtJobs.map((job) => ({ createdAt: job.createdAt, kind: 'thought' as const, job })),
    ].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
    if (candidate?.kind === 'dream') {
      await runDreamJob({ allowRemoteModelForPersonal: input.allowRemoteModelForPersonal, jobId: candidate.job.id, now, space: input.space });
      await scheduleNextReadyPass(input);
      return;
    }
    if (candidate?.kind === 'thought') {
      await runThoughtJob({ allowRemoteModelForPersonal: input.allowRemoteModelForPersonal, jobId: candidate.job.id, now, space: input.space });
      await scheduleNextReadyPass(input);
      return;
    }
    for (const job of candidate?.kind === 'companion' ? [candidate.job] : []) {
      if (job.jobType === 'event_enrichment') {
        await runCompanionEventEnrichmentJob({
          allowRemoteModelForPersonal: input.allowRemoteModelForPersonal,
          jobId: job.id,
          now,
          space: input.space,
        });
      }
    }
    await scheduleNextReadyPass(input);
  })().finally(() => {
    activePasses.delete(input.space);
  });
  activePasses.set(input.space, pass);
  return pass;
}

export function scheduleCompanionMaintenance(input: {
  space: PixorySpace;
  allowRemoteModelForPersonal?: boolean;
  delayMs?: number;
}): void {
  setTimeout(() => {
    void runCompanionMaintenancePass(input).catch(() => undefined);
  }, Math.max(0, input.delayMs ?? 1500));
}

export const CompanionMaintenanceQueue = { run: runCompanionMaintenancePass, schedule: scheduleCompanionMaintenance };
