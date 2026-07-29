import type { SQLiteDatabase } from 'expo-sqlite';

import type { PixorySpace } from '../../database/db';
import { createTimestamp } from '../../database/utils';
import { beijingDiaryDate } from '../diary/diaryTypes';
import { hashCompanionText, parseCompanionJsonArray, parseCompanionJsonObject } from '../companion/companionRuntimeValidation';
import type { DreamClassification, DreamSceneState } from './dreamPolicy';

export type DreamSeedDecision = 'awaiting_confirmation' | 'prepruned' | 'frequency_blocked' | 'classifying' | 'selected' | 'rejected' | 'cancelled' | 'failed';
export type DreamJobStatus = 'pending' | 'running' | 'retry' | 'waiting_model' | 'completed' | 'failed' | 'cancelled';

export interface DreamRoundCounter {
  totalRounds: number; lastDreamSuccessRound: number | null; beijingDateKey: string;
  dailyDreamSuccessCount: number; dailyDreamReservedCount: number;
}
export interface DreamSceneRecord {
  id: string; space: PixorySpace; roleCardId: string; threadId: string; branchRouteHash: string; lineageVersion: number;
  semanticState: DreamSceneState; participants: string[]; evidenceMessageIds: string[]; sourceSnapshotHash: string;
  status: 'active' | 'closed' | 'source_changed'; openedAt: string; closedAt: string | null; updatedAt: string;
}
export interface DreamSeedRecord {
  id: string; space: PixorySpace; roleCardId: string; threadId: string; branchRouteHash: string; lineageVersion: number;
  sceneId: string; sourceMessageIds: string[]; sourceMessageVersionHashes: string[]; sourceSnapshotHash: string;
  roll: number; classification: DreamClassification | null; classifiedProbability: number | null;
  decision: DreamSeedDecision; manual: boolean; policyVersion: string; idempotencyKey: string; createdAt: string; updatedAt: string;
}
export interface DreamJobRecord {
  id: string; space: PixorySpace; roleCardId: string; threadId: string; branchRouteHash: string; lineageVersion: number;
  sceneId: string; seedId: string; phase: 'classifying' | 'generating'; status: DreamJobStatus; sourceSnapshotHash: string;
  sourceMessageIds: string[]; attemptCount: number; maxAttempts: number; cancelRequested: boolean; quotaReserved: boolean;
  nextRunAt: string; leaseOwner: string | null; leaseUntil: string | null; lastErrorCode: string | null;
  classifierPromptTokens: number | null; classifierCompletionTokens: number | null;
  generationPromptTokens: number | null; generationCompletionTokens: number | null;
  idempotencyKey: string; createdAt: string; updatedAt: string; completedAt: string | null;
}
export interface DreamRecord {
  id: string; space: PixorySpace; roleCardId: string; sourceThreadId: string; sourceBranchRouteHash: string; lineageVersion: number;
  sceneId: string; seedId: string; jobId: string; sourceMessageIds: string[]; sourceSnapshotHash: string;
  title: string; body: string; displayAt: string; status: 'active' | 'stale_source' | 'soft_deleted';
  contextOptIn: boolean | null; viewedAt: string | null; deletedAt: string | null; createdAt: string; updatedAt: string;
}

function strings(value: unknown): string[] { return (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === 'string'); }
function mapScene(row: Record<string, unknown>): DreamSceneRecord {
  return { id: String(row.id), space: row.space as PixorySpace, roleCardId: String(row.roleCardId), threadId: String(row.threadId), branchRouteHash: String(row.branchRouteHash), lineageVersion: Number(row.lineageVersion), semanticState: row.semanticState as DreamSceneState, participants: strings(parseCompanionJsonArray(String(row.participantsJson))), evidenceMessageIds: strings(parseCompanionJsonArray(String(row.evidenceMessageIdsJson))), sourceSnapshotHash: String(row.sourceSnapshotHash), status: row.status as DreamSceneRecord['status'], openedAt: String(row.openedAt), closedAt: (row.closedAt as string | null) ?? null, updatedAt: String(row.updatedAt) };
}
function mapSeed(row: Record<string, unknown>): DreamSeedRecord {
  const classification = row.classificationJson ? parseCompanionJsonObject(String(row.classificationJson)) : null;
  return { id: String(row.id), space: row.space as PixorySpace, roleCardId: String(row.roleCardId), threadId: String(row.threadId), branchRouteHash: String(row.branchRouteHash), lineageVersion: Number(row.lineageVersion), sceneId: String(row.sceneId), sourceMessageIds: strings(parseCompanionJsonArray(String(row.sourceMessageIdsJson))), sourceMessageVersionHashes: strings(parseCompanionJsonArray(String(row.sourceMessageVersionHashesJson))), sourceSnapshotHash: String(row.sourceSnapshotHash), roll: Number(row.roll), classification: classification as DreamClassification | null, classifiedProbability: row.classifiedProbability == null ? null : Number(row.classifiedProbability), decision: row.decision as DreamSeedDecision, manual: Number(row.manual) === 1, policyVersion: String(row.policyVersion), idempotencyKey: String(row.idempotencyKey), createdAt: String(row.createdAt), updatedAt: String(row.updatedAt) };
}
function mapJob(row: Record<string, unknown>): DreamJobRecord {
  return { id: String(row.id), space: row.space as PixorySpace, roleCardId: String(row.roleCardId), threadId: String(row.threadId), branchRouteHash: String(row.branchRouteHash), lineageVersion: Number(row.lineageVersion), sceneId: String(row.sceneId), seedId: String(row.seedId), phase: row.phase as DreamJobRecord['phase'], status: row.status as DreamJobStatus, sourceSnapshotHash: String(row.sourceSnapshotHash), sourceMessageIds: strings(parseCompanionJsonArray(String(row.sourceMessageIdsJson))), attemptCount: Number(row.attemptCount), maxAttempts: Number(row.maxAttempts), cancelRequested: Number(row.cancelRequested) === 1, quotaReserved: Number(row.quotaReserved) === 1, nextRunAt: String(row.nextRunAt), leaseOwner: (row.leaseOwner as string | null) ?? null, leaseUntil: (row.leaseUntil as string | null) ?? null, lastErrorCode: (row.lastErrorCode as string | null) ?? null, classifierPromptTokens: row.classifierPromptTokens == null ? null : Number(row.classifierPromptTokens), classifierCompletionTokens: row.classifierCompletionTokens == null ? null : Number(row.classifierCompletionTokens), generationPromptTokens: row.generationPromptTokens == null ? null : Number(row.generationPromptTokens), generationCompletionTokens: row.generationCompletionTokens == null ? null : Number(row.generationCompletionTokens), idempotencyKey: String(row.idempotencyKey), createdAt: String(row.createdAt), updatedAt: String(row.updatedAt), completedAt: (row.completedAt as string | null) ?? null };
}
function mapDream(row: Record<string, unknown>): DreamRecord {
  return { id: String(row.id), space: row.space as PixorySpace, roleCardId: String(row.roleCardId), sourceThreadId: String(row.sourceThreadId), sourceBranchRouteHash: String(row.sourceBranchRouteHash), lineageVersion: Number(row.lineageVersion), sceneId: String(row.sceneId), seedId: String(row.seedId), jobId: String(row.jobId), sourceMessageIds: strings(parseCompanionJsonArray(String(row.sourceMessageIdsJson))), sourceSnapshotHash: String(row.sourceSnapshotHash), title: String(row.title), body: String(row.body), displayAt: String(row.displayAt), status: row.status as DreamRecord['status'], contextOptIn: row.contextOptIn == null ? null : Number(row.contextOptIn) === 1, viewedAt: (row.viewedAt as string | null) ?? null, deletedAt: (row.deletedAt as string | null) ?? null, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt) };
}

export async function registerDreamRound(db: SQLiteDatabase, input: { space: PixorySpace; roleCardId: string; threadId: string; branchRouteHash: string; userMessageId: string; assistantMessageId: string; userMessageVersionHash: string; assistantMessageVersionHash: string; now: string }): Promise<{ counter: DreamRoundCounter; inserted: boolean }> {
  const dateKey = beijingDiaryDate(new Date(input.now));
  const counterId = `crnd_${hashCompanionText(`${input.space}\u001F${input.roleCardId}`).slice(0, 32)}`;
  const idempotencyKey = [input.space, input.roleCardId, input.userMessageId, input.userMessageVersionHash, input.assistantMessageId, input.assistantMessageVersionHash].join('\u001F');
  const receiptId = `crcp_${hashCompanionText(idempotencyKey).slice(0, 32)}`;
  await db.runAsync(`INSERT OR IGNORE INTO companion_role_round_counters (id, space, roleCardId, totalRounds, beijingDateKey, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?, ?)`, counterId, input.space, input.roleCardId, dateKey, input.now, input.now);
  await db.runAsync(`UPDATE companion_role_round_counters SET beijingDateKey = ?, dailyDreamSuccessCount = CASE WHEN beijingDateKey = ? THEN dailyDreamSuccessCount ELSE 0 END, dailyDreamReservedCount = CASE WHEN beijingDateKey = ? THEN dailyDreamReservedCount ELSE 0 END, updatedAt = ? WHERE space = ? AND roleCardId = ?`, dateKey, dateKey, dateKey, input.now, input.space, input.roleCardId);
  const result = await db.runAsync(`INSERT OR IGNORE INTO companion_role_round_receipts (id, space, roleCardId, threadId, branchRouteHash, userMessageId, assistantMessageId, userMessageVersionHash, assistantMessageVersionHash, roundNumber, idempotencyKey, createdAt) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, totalRounds + 1, ?, ? FROM companion_role_round_counters WHERE id = ?`, receiptId, input.space, input.roleCardId, input.threadId, input.branchRouteHash, input.userMessageId, input.assistantMessageId, input.userMessageVersionHash, input.assistantMessageVersionHash, idempotencyKey, input.now, counterId);
  const inserted = Number(result.changes ?? 0) > 0;
  if (inserted) await db.runAsync('UPDATE companion_role_round_counters SET totalRounds = totalRounds + 1, updatedAt = ? WHERE space = ? AND roleCardId = ?', input.now, input.space, input.roleCardId);
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_role_round_counters WHERE space = ? AND roleCardId = ?', input.space, input.roleCardId);
  if (!row) throw new Error('dream_round_counter_missing');
  return { counter: { totalRounds: Number(row.totalRounds), lastDreamSuccessRound: row.lastDreamSuccessRound == null ? null : Number(row.lastDreamSuccessRound), beijingDateKey: String(row.beijingDateKey), dailyDreamSuccessCount: Number(row.dailyDreamSuccessCount), dailyDreamReservedCount: Number(row.dailyDreamReservedCount) }, inserted };
}

export async function rebuildRoleRoundCounter(
  db: SQLiteDatabase,
  input: { space: PixorySpace; roleCardId: string; now?: string },
): Promise<void> {
  const now = input.now ?? createTimestamp();
  const receipts = await db.getAllAsync<{ id: string; createdAt: string }>(
    `SELECT id, createdAt FROM companion_role_round_receipts
     WHERE space = ? AND roleCardId = ?
     ORDER BY createdAt ASC, id ASC`,
    input.space,
    input.roleCardId,
  );
  const dreams = await db.getAllAsync<{ displayAt: string }>(
    `SELECT displayAt FROM companion_dreams
     WHERE space = ? AND roleCardId = ?
     ORDER BY displayAt ASC, id ASC`,
    input.space,
    input.roleCardId,
  );
  const reserved = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM companion_dream_jobs
     WHERE space = ? AND roleCardId = ? AND quotaReserved = 1
       AND status IN ('pending', 'running', 'retry', 'waiting_model')`,
    input.space,
    input.roleCardId,
  );
  if (receipts.length === 0 && dreams.length === 0 && Number(reserved?.count ?? 0) === 0) {
    await db.runAsync(
      'DELETE FROM companion_role_round_counters WHERE space = ? AND roleCardId = ?',
      input.space,
      input.roleCardId,
    );
    return;
  }
  for (let index = 0; index < receipts.length; index += 1) {
    await db.runAsync(
      'UPDATE companion_role_round_receipts SET roundNumber = ? WHERE id = ?',
      index + 1,
      receipts[index].id,
    );
  }
  const latestDreamAt = dreams.at(-1)?.displayAt ?? null;
  const lastDreamSuccessRound = latestDreamAt
    ? receipts.filter((receipt) => receipt.createdAt <= latestDreamAt).length
    : null;
  const dateKey = beijingDiaryDate(new Date(now));
  const dailyDreamSuccessCount = dreams.filter(
    (dream) => beijingDiaryDate(new Date(dream.displayAt)) === dateKey,
  ).length;
  const counterId = `crnd_${hashCompanionText(`${input.space}\u001F${input.roleCardId}`).slice(0, 32)}`;
  await db.runAsync(
    `INSERT INTO companion_role_round_counters (
       id, space, roleCardId, totalRounds, lastDreamSuccessRound, beijingDateKey,
       dailyDreamSuccessCount, dailyDreamReservedCount, createdAt, updatedAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(space, roleCardId) DO UPDATE SET
       totalRounds = excluded.totalRounds,
       lastDreamSuccessRound = excluded.lastDreamSuccessRound,
       beijingDateKey = excluded.beijingDateKey,
       dailyDreamSuccessCount = excluded.dailyDreamSuccessCount,
       dailyDreamReservedCount = excluded.dailyDreamReservedCount,
       updatedAt = excluded.updatedAt`,
    counterId,
    input.space,
    input.roleCardId,
    receipts.length,
    lastDreamSuccessRound,
    dateKey,
    dailyDreamSuccessCount,
    Number(reserved?.count ?? 0),
    now,
    now,
  );
}

export async function findActiveDreamScene(db: SQLiteDatabase, input: { space: PixorySpace; roleCardId: string; threadId: string; branchRouteHash: string; lineageVersion: number }): Promise<DreamSceneRecord | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(`SELECT * FROM companion_dream_scenes WHERE space = ? AND roleCardId = ? AND threadId = ? AND branchRouteHash = ? AND lineageVersion = ? AND status = 'active'`, input.space, input.roleCardId, input.threadId, input.branchRouteHash, input.lineageVersion);
  return row ? mapScene(row) : null;
}
export async function findDreamScene(db: SQLiteDatabase, id: string): Promise<DreamSceneRecord | null> { const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_dream_scenes WHERE id = ?', id); return row ? mapScene(row) : null; }

export async function upsertDreamScene(db: SQLiteDatabase, input: { space: PixorySpace; roleCardId: string; threadId: string; branchRouteHash: string; lineageVersion: number; state: DreamSceneState; evidenceMessageIds: string[]; sourceSnapshotHash: string; now: string }): Promise<DreamSceneRecord> {
  const existing = await findActiveDreamScene(db, input);
  if (existing) {
    const evidence = [...new Set([...existing.evidenceMessageIds, ...input.evidenceMessageIds])].slice(-20);
    await db.runAsync('UPDATE companion_dream_scenes SET semanticState = ?, evidenceMessageIdsJson = ?, sourceSnapshotHash = ?, updatedAt = ? WHERE id = ?', input.state, JSON.stringify(evidence), input.sourceSnapshotHash, input.now, existing.id);
    return { ...existing, evidenceMessageIds: evidence, semanticState: input.state, sourceSnapshotHash: input.sourceSnapshotHash, updatedAt: input.now };
  }
  const id = `dscene_${hashCompanionText([input.space, input.roleCardId, input.threadId, input.branchRouteHash, input.lineageVersion, input.now].join('\u001F')).slice(0, 32)}`;
  await db.runAsync(`INSERT INTO companion_dream_scenes (id, space, roleCardId, threadId, branchRouteHash, lineageVersion, semanticState, participantsJson, evidenceMessageIdsJson, sourceSnapshotHash, status, openedAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, 'active', ?, ?)`, id, input.space, input.roleCardId, input.threadId, input.branchRouteHash, input.lineageVersion, input.state, JSON.stringify(input.evidenceMessageIds.slice(-20)), input.sourceSnapshotHash, input.now, input.now);
  return (await findActiveDreamScene(db, input))!;
}

export async function closeDreamScene(db: SQLiteDatabase, id: string, now: string): Promise<void> { await db.runAsync(`UPDATE companion_dream_scenes SET semanticState = 'closed', status = 'closed', closedAt = ?, updatedAt = ? WHERE id = ? AND status = 'active'`, now, now, id); }

export async function findDreamSeedForScene(db: SQLiteDatabase, sceneId: string): Promise<DreamSeedRecord | null> { const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_dream_seeds WHERE sceneId = ? ORDER BY createdAt DESC LIMIT 1', sceneId); return row ? mapSeed(row) : null; }

export async function createDreamSeed(db: SQLiteDatabase, input: Omit<DreamSeedRecord, 'id' | 'classification' | 'classifiedProbability' | 'createdAt' | 'updatedAt'> & { now: string }): Promise<DreamSeedRecord> {
  const id = `dseed_${hashCompanionText(input.idempotencyKey).slice(0, 32)}`;
  await db.runAsync(`INSERT OR IGNORE INTO companion_dream_seeds (id, space, roleCardId, threadId, branchRouteHash, lineageVersion, sceneId, sourceMessageIdsJson, sourceMessageVersionHashesJson, sourceSnapshotHash, roll, decision, manual, policyVersion, idempotencyKey, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, input.space, input.roleCardId, input.threadId, input.branchRouteHash, input.lineageVersion, input.sceneId, JSON.stringify(input.sourceMessageIds), JSON.stringify(input.sourceMessageVersionHashes), input.sourceSnapshotHash, input.roll, input.decision, input.manual ? 1 : 0, input.policyVersion, input.idempotencyKey, input.now, input.now);
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_dream_seeds WHERE idempotencyKey = ?', input.idempotencyKey); if (!row) throw new Error('dream_seed_write_failed'); return mapSeed(row);
}

export async function updateDreamSeed(db: SQLiteDatabase, input: { id: string; decision: DreamSeedDecision; now: string; classification?: DreamClassification | null; probability?: number | null }): Promise<void> { await db.runAsync('UPDATE companion_dream_seeds SET decision = ?, classificationJson = COALESCE(?, classificationJson), classifiedProbability = COALESCE(?, classifiedProbability), updatedAt = ? WHERE id = ?', input.decision, input.classification ? JSON.stringify(input.classification) : null, input.probability ?? null, input.now, input.id); }

export async function createDreamJob(db: SQLiteDatabase, input: { seed: DreamSeedRecord; phase: DreamJobRecord['phase']; now: string }): Promise<DreamJobRecord> {
  const idempotencyKey = `dream-job:${input.seed.id}`; const id = `djob_${hashCompanionText(idempotencyKey).slice(0, 32)}`;
  await db.runAsync(`INSERT OR IGNORE INTO companion_dream_jobs (id, space, roleCardId, threadId, branchRouteHash, lineageVersion, sceneId, seedId, phase, status, sourceSnapshotHash, sourceMessageIdsJson, nextRunAt, idempotencyKey, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`, id, input.seed.space, input.seed.roleCardId, input.seed.threadId, input.seed.branchRouteHash, input.seed.lineageVersion, input.seed.sceneId, input.seed.id, input.phase, input.seed.sourceSnapshotHash, JSON.stringify(input.seed.sourceMessageIds), input.now, idempotencyKey, input.now, input.now);
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_dream_jobs WHERE seedId = ?', input.seed.id); if (!row) throw new Error('dream_job_write_failed'); return mapJob(row);
}

export async function listReadyDreamJobs(db: SQLiteDatabase, input: { space: PixorySpace; now: string; limit?: number }): Promise<DreamJobRecord[]> { const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM companion_dream_jobs WHERE space = ? AND nextRunAt <= ? AND (status IN ('pending','retry','waiting_model') OR (status = 'running' AND (leaseUntil IS NULL OR leaseUntil <= ?))) ORDER BY nextRunAt, createdAt LIMIT ?`, input.space, input.now, input.now, Math.max(1, Math.min(10, input.limit ?? 1))); return rows.map(mapJob); }
export async function findDreamJob(db: SQLiteDatabase, id: string): Promise<DreamJobRecord | null> { const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_dream_jobs WHERE id = ?', id); return row ? mapJob(row) : null; }
export async function findDreamSeed(db: SQLiteDatabase, id: string): Promise<DreamSeedRecord | null> { const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_dream_seeds WHERE id = ?', id); return row ? mapSeed(row) : null; }
export async function acquireDreamJob(db: SQLiteDatabase, input: { id: string; workerId: string; now: string; leaseUntil: string }): Promise<DreamJobRecord | null> { await db.runAsync(`UPDATE companion_dream_jobs SET status = 'running', leaseOwner = ?, leaseUntil = ?, attemptCount = attemptCount + 1, updatedAt = ? WHERE id = ? AND cancelRequested = 0 AND (status IN ('pending','retry','waiting_model') OR (status = 'running' AND (leaseUntil IS NULL OR leaseUntil <= ?)))`, input.workerId, input.leaseUntil, input.now, input.id, input.now); const job = await findDreamJob(db, input.id); return job?.status === 'running' && job.leaseOwner === input.workerId ? job : null; }

export async function reserveDreamQuota(db: SQLiteDatabase, job: DreamJobRecord, now: string): Promise<boolean> {
  if ((await findDreamSeed(db, job.seedId))?.manual) return true;
  const dateKey = beijingDiaryDate(new Date(now));
  const result = await db.runAsync(`UPDATE companion_role_round_counters SET dailyDreamReservedCount = dailyDreamReservedCount + 1, updatedAt = ? WHERE space = ? AND roleCardId = ? AND beijingDateKey = ? AND dailyDreamSuccessCount + dailyDreamReservedCount < 2 AND (lastDreamSuccessRound IS NULL OR totalRounds - lastDreamSuccessRound >= 50)`, now, job.space, job.roleCardId, dateKey);
  if (Number(result.changes ?? 0) === 0) return false;
  await db.runAsync('UPDATE companion_dream_jobs SET quotaReserved = 1, updatedAt = ? WHERE id = ?', now, job.id); return true;
}

export async function transitionDreamJob(db: SQLiteDatabase, input: { id: string; workerId?: string; phase?: DreamJobRecord['phase']; status: DreamJobStatus; now: string; errorCode?: string | null; nextRunAt?: string; releaseLease?: boolean }): Promise<void> {
  await db.runAsync(`UPDATE companion_dream_jobs SET phase = COALESCE(?, phase), status = ?, nextRunAt = COALESCE(?, nextRunAt), lastErrorCode = ?, leaseOwner = CASE WHEN ? THEN NULL ELSE leaseOwner END, leaseUntil = CASE WHEN ? THEN NULL ELSE leaseUntil END, completedAt = CASE WHEN ? IN ('completed','failed','cancelled') THEN ? ELSE completedAt END, updatedAt = ? WHERE id = ? AND (? IS NULL OR leaseOwner = ?)`, input.phase ?? null, input.status, input.nextRunAt ?? null, input.errorCode ?? null, input.releaseLease !== false ? 1 : 0, input.releaseLease !== false ? 1 : 0, input.status, input.now, input.now, input.id, input.workerId ?? null, input.workerId ?? null);
}

export async function recordDreamJobUsage(db: SQLiteDatabase, input: {
  id: string;
  phase: DreamJobRecord['phase'];
  promptTokens: number | null;
  completionTokens: number | null;
  now: string;
}): Promise<void> {
  if (input.promptTokens == null && input.completionTokens == null) return;
  if (input.phase === 'classifying') {
    await db.runAsync(
      `UPDATE companion_dream_jobs
       SET classifierPromptTokens = COALESCE(?, classifierPromptTokens),
           classifierCompletionTokens = COALESCE(?, classifierCompletionTokens),
           updatedAt = ?
       WHERE id = ?`,
      input.promptTokens,
      input.completionTokens,
      input.now,
      input.id,
    );
    return;
  }
  await db.runAsync(
    `UPDATE companion_dream_jobs
     SET generationPromptTokens = COALESCE(?, generationPromptTokens),
         generationCompletionTokens = COALESCE(?, generationCompletionTokens),
         updatedAt = ?
     WHERE id = ?`,
    input.promptTokens,
    input.completionTokens,
    input.now,
    input.id,
  );
}

export async function completeDream(db: SQLiteDatabase, input: { job: DreamJobRecord; seed: DreamSeedRecord; title: string; body: string; now: string; workerId: string }): Promise<DreamRecord | null> {
  const current = await findDreamJob(db, input.job.id); if (!current || current.status !== 'running' || current.leaseOwner !== input.workerId || current.cancelRequested) return null;
  const id = `dream_${hashCompanionText(input.job.id).slice(0, 32)}`;
  await db.runAsync(`INSERT OR IGNORE INTO companion_dreams (id, space, roleCardId, sourceThreadId, sourceBranchRouteHash, lineageVersion, sceneId, seedId, jobId, sourceMessageIdsJson, sourceSnapshotHash, title, body, displayAt, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`, id, input.job.space, input.job.roleCardId, input.job.threadId, input.job.branchRouteHash, input.job.lineageVersion, input.job.sceneId, input.job.seedId, input.job.id, JSON.stringify(input.job.sourceMessageIds), input.job.sourceSnapshotHash, input.title, input.body, input.now, input.now, input.now);
  if (current.quotaReserved) await db.runAsync('UPDATE companion_role_round_counters SET dailyDreamReservedCount = MAX(0, dailyDreamReservedCount - 1), dailyDreamSuccessCount = dailyDreamSuccessCount + 1, lastDreamSuccessRound = totalRounds, updatedAt = ? WHERE space = ? AND roleCardId = ?', input.now, input.job.space, input.job.roleCardId);
  await transitionDreamJob(db, { id: input.job.id, now: input.now, status: 'completed', workerId: input.workerId });
  await updateDreamSeed(db, { decision: 'selected', id: input.seed.id, now: input.now });
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_dreams WHERE id = ?', id); return row ? mapDream(row) : null;
}

export async function cancelDreamJob(db: SQLiteDatabase, id: string, now = createTimestamp()): Promise<void> { const job = await findDreamJob(db, id); if (!job || ['completed','failed','cancelled'].includes(job.status)) return; await db.runAsync(`UPDATE companion_dream_jobs SET cancelRequested = 1, status = 'cancelled', leaseOwner = NULL, leaseUntil = NULL, completedAt = ?, updatedAt = ? WHERE id = ?`, now, now, id); if (job.quotaReserved) await db.runAsync('UPDATE companion_role_round_counters SET dailyDreamReservedCount = MAX(0, dailyDreamReservedCount - 1), updatedAt = ? WHERE space = ? AND roleCardId = ?', now, job.space, job.roleCardId); await updateDreamSeed(db, { decision: 'cancelled', id: job.seedId, now }); }
export async function releaseDreamQuota(db: SQLiteDatabase, job: DreamJobRecord, now: string): Promise<void> { if (!job.quotaReserved) return; await db.runAsync('UPDATE companion_role_round_counters SET dailyDreamReservedCount = MAX(0, dailyDreamReservedCount - 1), updatedAt = ? WHERE space = ? AND roleCardId = ?', now, job.space, job.roleCardId); await db.runAsync('UPDATE companion_dream_jobs SET quotaReserved = 0, updatedAt = ? WHERE id = ?', now, job.id); }

export async function listDreamsForRole(db: SQLiteDatabase, roleCardId: string): Promise<DreamRecord[]> { const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM companion_dreams WHERE roleCardId = ? AND status = 'active' ORDER BY displayAt DESC`, roleCardId); return rows.map(mapDream); }
export async function findDream(db: SQLiteDatabase, id: string): Promise<DreamRecord | null> { const row = await db.getFirstAsync<Record<string, unknown>>(`SELECT * FROM companion_dreams WHERE id = ? AND status = 'active'`, id); return row ? mapDream(row) : null; }
export async function setDreamContextOptIn(db: SQLiteDatabase, id: string, accepted: boolean): Promise<void> { await db.runAsync(`UPDATE companion_dreams SET contextOptIn = ?, updatedAt = ? WHERE id = ? AND status = 'active'`, accepted ? 1 : 0, createTimestamp(), id); }
export async function markDreamViewed(db: SQLiteDatabase, id: string): Promise<void> { const now = createTimestamp(); await db.runAsync(`UPDATE companion_dreams SET viewedAt = COALESCE(viewedAt, ?), updatedAt = ? WHERE id = ? AND status = 'active'`, now, now, id); }
export async function softDeleteDream(db: SQLiteDatabase, id: string): Promise<void> { const now = createTimestamp(); await db.runAsync(`UPDATE companion_dreams SET status = 'soft_deleted', deletedAt = ?, updatedAt = ? WHERE id = ? AND status = 'active'`, now, now, id); }

export const dreamRepository = { acquireJob: acquireDreamJob, cancelJob: cancelDreamJob, closeScene: closeDreamScene, complete: completeDream, createJob: createDreamJob, createSeed: createDreamSeed, find: findDream, findActiveScene: findActiveDreamScene, findJob: findDreamJob, findScene: findDreamScene, findSeed: findDreamSeed, findSeedForScene: findDreamSeedForScene, listForRole: listDreamsForRole, listReadyJobs: listReadyDreamJobs, markViewed: markDreamViewed, rebuildRoleRoundCounter, recordUsage: recordDreamJobUsage, registerRound: registerDreamRound, releaseQuota: releaseDreamQuota, reserveQuota: reserveDreamQuota, setContextOptIn: setDreamContextOptIn, softDelete: softDeleteDream, transitionJob: transitionDreamJob, updateSeed: updateDreamSeed, upsertScene: upsertDreamScene };
