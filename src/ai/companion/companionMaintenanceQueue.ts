import { runWithDatabaseSpace, type PixorySpace } from '../../database';
import { listReadyCompanionRuntimeJobs } from './companionEventRepository';
import { abortCompanionEnrichmentForSpace, runCompanionEventEnrichmentJob } from './companionEventEnrichmentService';
import { dreamRepository } from '../dream/dreamRepository';
import { abortDreamJobsForSpace, runDreamJob } from '../dream/dreamWorker';
import { thoughtRepository } from '../thought/thoughtRepository';
import { abortThoughtJobsForSpace, runThoughtJob } from '../thought/thoughtWorker';
import { resumeThoughtSessions, suspendThoughtSessions } from '../thought/thoughtSessionCoordinator';
import { reconcileStrandedThoughtReservations } from './companionArtifactService';

const activePasses = new Map<PixorySpace, Promise<void>>();
const scheduledTimers = new Map<PixorySpace, Set<ReturnType<typeof setTimeout>>>();
let personalRuntimeAuthorized = false;
let personalRuntimeEpoch = 0;

function isRuntimeActive(space: PixorySpace, epoch: number): boolean {
  return space !== 'personal' || (personalRuntimeAuthorized && personalRuntimeEpoch === epoch);
}

function assertRuntimeActive(space: PixorySpace, epoch: number): void {
  if (!isRuntimeActive(space, epoch)) throw new Error('Personal companion runtime is suspended.');
}

export function resumePersonalCompanionMaintenance(): void {
  personalRuntimeEpoch += 1;
  personalRuntimeAuthorized = true;
  resumeThoughtSessions('personal');
}

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
  if (input.space === 'personal' && !personalRuntimeAuthorized) return;
  const existing = activePasses.get(input.space);
  if (existing) return existing;
  const runtimeEpoch = personalRuntimeEpoch;
  const allowRemoteModelForPersonal = input.space === 'personal' ? true : input.allowRemoteModelForPersonal;
  const pass = (async () => {
    assertRuntimeActive(input.space, runtimeEpoch);
    const now = input.now ?? new Date().toISOString();
    await runWithDatabaseSpace(input.space, (db) => reconcileStrandedThoughtReservations(db, input.space, now));
    assertRuntimeActive(input.space, runtimeEpoch);
    // A maintenance pass deliberately performs at most one optional model call.
    // This keeps enrichment sparse even if several local observations queue while offline.
    const [jobs, dreamJobs, thoughtJobs] = await runWithDatabaseSpace(input.space, async (db) => Promise.all([
      listReadyCompanionRuntimeJobs(db, { limit: 1, now, space: input.space }),
      dreamRepository.listReadyJobs(db, { limit: 1, now, space: input.space }),
      thoughtRepository.listReadyJobs(db, { limit: 1, now, space: input.space }),
    ]));
    assertRuntimeActive(input.space, runtimeEpoch);
    const candidate = [
      ...jobs.map((job) => ({ createdAt: job.createdAt, kind: 'companion' as const, job })),
      ...dreamJobs.map((job) => ({ createdAt: job.createdAt, kind: 'dream' as const, job })),
      ...thoughtJobs.map((job) => ({ createdAt: job.createdAt, kind: 'thought' as const, job })),
    ].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
    if (candidate?.kind === 'dream') {
      await runDreamJob({ allowRemoteModelForPersonal, assertActive: () => assertRuntimeActive(input.space, runtimeEpoch), jobId: candidate.job.id, now, space: input.space });
      assertRuntimeActive(input.space, runtimeEpoch);
      await scheduleNextReadyPass({ ...input, allowRemoteModelForPersonal });
      return;
    }
    if (candidate?.kind === 'thought') {
      await runThoughtJob({ allowRemoteModelForPersonal, assertActive: () => assertRuntimeActive(input.space, runtimeEpoch), jobId: candidate.job.id, now, space: input.space });
      assertRuntimeActive(input.space, runtimeEpoch);
      await scheduleNextReadyPass({ ...input, allowRemoteModelForPersonal });
      return;
    }
    for (const job of candidate?.kind === 'companion' ? [candidate.job] : []) {
      if (job.jobType === 'event_enrichment') {
        await runCompanionEventEnrichmentJob({
          allowRemoteModelForPersonal,
          assertActive: () => assertRuntimeActive(input.space, runtimeEpoch),
          jobId: job.id,
          now,
          space: input.space,
        });
      }
    }
    assertRuntimeActive(input.space, runtimeEpoch);
    await scheduleNextReadyPass({ ...input, allowRemoteModelForPersonal });
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
  if (input.space === 'personal' && !personalRuntimeAuthorized) return;
  const timer = setTimeout(() => {
    scheduledTimers.get(input.space)?.delete(timer);
    void runCompanionMaintenancePass(input).catch(() => undefined);
  }, Math.max(0, input.delayMs ?? 1500));
  const timers = scheduledTimers.get(input.space) ?? new Set();
  timers.add(timer);
  scheduledTimers.set(input.space, timers);
}

export async function suspendCompanionMaintenance(space: PixorySpace): Promise<void> {
  if (space === 'personal') {
    personalRuntimeAuthorized = false;
    personalRuntimeEpoch += 1;
  }
  for (const timer of scheduledTimers.get(space) ?? []) clearTimeout(timer);
  scheduledTimers.delete(space);
  abortDreamJobsForSpace(space);
  abortThoughtJobsForSpace(space);
  abortCompanionEnrichmentForSpace(space);
  await suspendThoughtSessions(space);
  await activePasses.get(space)?.catch(() => undefined);
  const now = new Date().toISOString();
  await runWithDatabaseSpace(space, async (db) => {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE companion_runtime_jobs SET status = 'retry', attemptCount = MAX(0, attemptCount - 1),
           nextRunAt = ?, leaseOwner = NULL, leaseUntil = NULL, lastErrorCode = 'space_suspended', updatedAt = ?
         WHERE space = ? AND status = 'running'`,
        now, now, space,
      );
      await db.runAsync(
        `UPDATE companion_dream_jobs SET status = 'retry', attemptCount = MAX(0, attemptCount - 1),
           nextRunAt = ?, leaseOwner = NULL, leaseUntil = NULL, lastErrorCode = 'space_suspended', updatedAt = ?
         WHERE space = ? AND status = 'running'`,
        now, now, space,
      );
      await db.runAsync(
        `UPDATE companion_thought_jobs SET status = 'retry', attemptCount = MAX(0, attemptCount - 1),
           nextRunAt = ?, leaseOwner = NULL, leaseUntil = NULL, lastErrorCode = 'space_suspended', updatedAt = ?
         WHERE space = ? AND status = 'running'`,
        now, now, space,
      );
    });
  });
}

export const CompanionMaintenanceQueue = {
  resumePersonal: resumePersonalCompanionMaintenance,
  run: runCompanionMaintenancePass,
  schedule: scheduleCompanionMaintenance,
  suspend: suspendCompanionMaintenance,
};
