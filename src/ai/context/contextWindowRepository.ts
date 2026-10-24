import type { SQLiteDatabase } from 'expo-sqlite';
import type { PixorySpace } from '../../database/db';
import type { ContextWindowSnapshot } from './conversationCoverage';

interface WindowIdentity {
  space: PixorySpace;
  threadId: string;
  branchRouteHash: string;
  lineageVersion: number;
}

export async function readContextWindow(db: SQLiteDatabase, identity: WindowIdentity): Promise<ContextWindowSnapshot | null> {
  const row = await db.getFirstAsync<{ windowTarget: number; rawStartMessageId: string | null; activeSummaryIdsJson: string }>(
    `SELECT windowTarget, rawStartMessageId, activeSummaryIdsJson FROM ai_context_windows
     WHERE space = ? AND threadId = ? AND branchRouteHash = ? AND lineageVersion = ? AND plannerVersion = 1`,
    identity.space, identity.threadId, identity.branchRouteHash, identity.lineageVersion,
  );
  if (!row) return null;
  try {
    const ids: unknown = JSON.parse(row.activeSummaryIdsJson);
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) return null;
    return { windowTarget: row.windowTarget, rawStartMessageId: row.rawStartMessageId, activeSummaryIds: ids };
  } catch {
    return null;
  }
}

export async function saveContextWindow(db: SQLiteDatabase, identity: WindowIdentity, snapshot: ContextWindowSnapshot): Promise<void> {
  const id = JSON.stringify([identity.space, identity.threadId, identity.branchRouteHash, identity.lineageVersion]);
  await db.runAsync(
    `INSERT INTO ai_context_windows (id, space, threadId, branchRouteHash, lineageVersion,
       plannerVersion, windowTarget, rawStartMessageId, activeSummaryIdsJson, updatedAt)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
     ON CONFLICT(space, threadId, branchRouteHash, lineageVersion) DO UPDATE SET
       plannerVersion = 1, windowTarget = excluded.windowTarget, rawStartMessageId = excluded.rawStartMessageId,
       activeSummaryIdsJson = excluded.activeSummaryIdsJson, updatedAt = excluded.updatedAt`,
    id, identity.space, identity.threadId, identity.branchRouteHash, identity.lineageVersion,
    snapshot.windowTarget, snapshot.rawStartMessageId, JSON.stringify(snapshot.activeSummaryIds), new Date().toISOString(),
  );
}

export async function readContextMaintenanceDurations(db: SQLiteDatabase, identity: WindowIdentity): Promise<number[]> {
  const rows = await db.getAllAsync<{ durationMs: number }>(
    `SELECT durationMs FROM ai_context_maintenance_samples WHERE space = ? AND threadId = ?
     AND branchRouteHash = ? AND lineageVersion = ? ORDER BY createdAt DESC, id DESC LIMIT 8`,
    identity.space, identity.threadId, identity.branchRouteHash, identity.lineageVersion,
  );
  return rows.map(row => row.durationMs);
}

export async function recordContextMaintenanceDuration(db: SQLiteDatabase, identity: WindowIdentity, durationMs: number): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(`INSERT INTO ai_context_maintenance_samples
    (id, space, threadId, branchRouteHash, lineageVersion, durationMs, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    `ctxsample_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`, identity.space,
    identity.threadId, identity.branchRouteHash, identity.lineageVersion, Math.max(0, Math.ceil(durationMs)), now);
  await db.runAsync(`DELETE FROM ai_context_maintenance_samples WHERE space = ? AND threadId = ? AND branchRouteHash = ?
    AND lineageVersion = ? AND id NOT IN (SELECT id FROM ai_context_maintenance_samples WHERE space = ? AND threadId = ?
    AND branchRouteHash = ? AND lineageVersion = ? ORDER BY createdAt DESC, id DESC LIMIT 8)`,
    identity.space, identity.threadId, identity.branchRouteHash, identity.lineageVersion,
    identity.space, identity.threadId, identity.branchRouteHash, identity.lineageVersion);
}
