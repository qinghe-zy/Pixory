export type DreamRuntimeNotice =
  | { type: 'manual_confirmation'; threadId: string; seedId: string }
  | { type: 'generating'; threadId: string; jobId: string }
  | { type: 'completed'; threadId: string; jobId: string; dreamId: string }
  | { type: 'failed'; threadId: string; jobId: string }
  | { type: 'cancelled'; threadId: string; jobId: string };

type Listener = (notice: DreamRuntimeNotice) => void;
const listeners = new Set<Listener>();
const latestByThread = new Map<string, DreamRuntimeNotice>();

export function emitDreamRuntimeNotice(notice: DreamRuntimeNotice): void {
  latestByThread.set(notice.threadId, notice);
  for (const listener of listeners) listener(notice);
}
export function subscribeDreamRuntimeNotices(listener: Listener): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export function getLatestDreamRuntimeNotice(threadId: string): DreamRuntimeNotice | null { return latestByThread.get(threadId) ?? null; }
export function clearDreamRuntimeNotice(threadId: string, expectedType?: DreamRuntimeNotice['type']): void { if (!expectedType || latestByThread.get(threadId)?.type === expectedType) latestByThread.delete(threadId); }

export async function loadDreamRuntimeNotice(
  db: SQLiteDatabase,
  input: { threadId: string; branchRouteHash: string; lineageVersion: number },
): Promise<DreamRuntimeNotice | null> {
  const manual = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM companion_dream_seeds
     WHERE threadId = ? AND branchRouteHash = ? AND lineageVersion = ?
       AND manual = 1 AND decision = 'awaiting_confirmation'
     ORDER BY createdAt DESC LIMIT 1`,
    input.threadId,
    input.branchRouteHash,
    input.lineageVersion,
  );
  if (manual) return { seedId: manual.id, threadId: input.threadId, type: 'manual_confirmation' };
  const active = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM companion_dream_jobs
     WHERE threadId = ? AND branchRouteHash = ? AND lineageVersion = ?
       AND cancelRequested = 0 AND status IN ('pending', 'running', 'retry', 'waiting_model')
     ORDER BY createdAt DESC LIMIT 1`,
    input.threadId,
    input.branchRouteHash,
    input.lineageVersion,
  );
  if (active) return { jobId: active.id, threadId: input.threadId, type: 'generating' };
  const dream = await db.getFirstAsync<{ id: string; jobId: string }>(
    `SELECT id, jobId FROM companion_dreams
     WHERE sourceThreadId = ? AND sourceBranchRouteHash = ? AND lineageVersion = ?
       AND status = 'active' AND viewedAt IS NULL
     ORDER BY displayAt DESC LIMIT 1`,
    input.threadId,
    input.branchRouteHash,
    input.lineageVersion,
  );
  if (dream) return { dreamId: dream.id, jobId: dream.jobId, threadId: input.threadId, type: 'completed' };
  const failed = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM companion_dream_jobs
     WHERE threadId = ? AND branchRouteHash = ? AND lineageVersion = ? AND status = 'failed'
     ORDER BY updatedAt DESC LIMIT 1`,
    input.threadId,
    input.branchRouteHash,
    input.lineageVersion,
  );
  return failed ? { jobId: failed.id, threadId: input.threadId, type: 'failed' } : null;
}

export const dreamRuntimeEvents = { clear: clearDreamRuntimeNotice, emit: emitDreamRuntimeNotice, latest: getLatestDreamRuntimeNotice, load: loadDreamRuntimeNotice, subscribe: subscribeDreamRuntimeNotices };
import type { SQLiteDatabase } from 'expo-sqlite';
