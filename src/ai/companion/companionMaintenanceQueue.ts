import { runWithDatabaseSpace, type PixorySpace } from '../../database';
import { listReadyCompanionRuntimeJobs } from './companionEventRepository';
import { runCompanionEventEnrichmentJob } from './companionEventEnrichmentService';

const activePasses = new Map<PixorySpace, Promise<void>>();

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
    const jobs = await runWithDatabaseSpace(input.space, (db) => listReadyCompanionRuntimeJobs(db, { limit: 1, now, space: input.space }));
    for (const job of jobs) {
      if (job.jobType === 'event_enrichment') {
        await runCompanionEventEnrichmentJob({
          allowRemoteModelForPersonal: input.allowRemoteModelForPersonal,
          jobId: job.id,
          now,
          space: input.space,
        });
      }
    }
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
