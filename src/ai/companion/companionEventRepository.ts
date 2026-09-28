import type { SQLiteDatabase } from 'expo-sqlite';

import { createTimestamp } from '../../database/utils';
import type { PixorySpace } from '../../database/db';
import type {
  CompanionEventCandidate,
  CompanionEventRecord,
  CompanionObservedMessage,
  CompanionOpenLoopPolicyFields,
  CompanionOpenLoopStatus,
  CompanionSubjectType,
  ParsedTemporalAnchor,
} from './companionTypes';
import {
  hashCompanionMessageVersion,
  hashCompanionText,
  isFiniteUnit,
  parseCompanionJsonArray,
  parseCompanionJsonObject,
} from './companionRuntimeValidation';
import { advanceRecurringTemporalAnchor } from './companionTemporalService';

export interface CompanionRuntimeJobRecord {
  id: string;
  space: PixorySpace;
  threadId: string;
  branchRouteHash: string;
  lineageVersion: number;
  sourceMessageId: string | null;
  jobType: 'event_enrichment' | 'projection_rebuild' | 'temporal_expiry';
  status: 'pending' | 'running' | 'retry' | 'waiting_model' | 'done' | 'dead' | 'cancelled';
  payloadJson: string;
  idempotencyKey: string;
  attemptCount: number;
  nextRunAt: string;
  leaseOwner: string | null;
  leaseUntil: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CompanionTemporalAnchorRecord {
  id: string;
  space: PixorySpace;
  roleCardId: string | null;
  threadId: string;
  branchRouteHash: string;
  lineageVersion: number;
  sourceEventId: string;
  sourceMessageId: string;
  rawText: string;
  startAtUtc: string | null;
  endAtUtc: string | null;
  parseTimeZone: string;
  localDateKey: string;
  precision: ParsedTemporalAnchor['precision'];
  anchorType: ParsedTemporalAnchor['type'];
  recurrenceRule: string | null;
  mentionCount: number;
  lastMentionedAt: string | null;
  status: 'active' | 'completed' | 'expired' | 'cancelled' | 'superseded';
  confidence: number;
  parserVersion: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanionOpenLoopRecord extends CompanionOpenLoopPolicyFields {
  id: string;
  space: PixorySpace;
  roleCardId: string | null;
  threadId: string;
  branchRouteHash: string;
  lineageVersion: number;
  sourceEventId: string;
  sourceMessageId: string;
  temporalAnchorId: string | null;
  topicText: string;
  resolutionEvidenceMessageId: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

function mapEvent(row: Record<string, unknown>): CompanionEventRecord {
  return {
    branchRootMessageId: (row.branchRootMessageId as string | null) ?? null,
    branchRouteHash: String(row.branchRouteHash),
    branchVersionIndex: row.branchVersionIndex == null ? null : Number(row.branchVersionIndex),
    category: row.category as CompanionEventRecord['category'],
    confidence: Number(row.confidence),
    createdAt: String(row.createdAt),
    eventSequence: Number(row.eventSequence),
    evidenceSpanJson: String(row.evidenceSpanJson),
    extractorVersion: String(row.extractorVersion),
    id: String(row.id),
    idempotencyKey: String(row.idempotencyKey),
    intensity: Number(row.intensity),
    lineageVersion: Number(row.lineageVersion),
    payloadJson: String(row.payloadJson),
    provenanceJson: String(row.provenanceJson),
    roleCardId: (row.roleCardId as string | null) ?? null,
    sincerity: Number(row.sincerity),
    sourceMessageId: String(row.sourceMessageId),
    sourceMessageVersionHash: String(row.sourceMessageVersionHash),
    space: row.space as PixorySpace,
    speechMode: row.speechMode as CompanionEventRecord['speechMode'],
    status: row.status as CompanionEventRecord['status'],
    subjectId: String(row.subjectId),
    subjectType: row.subjectType as CompanionSubjectType,
    subtype: String(row.subtype),
    threadId: String(row.threadId),
  };
}

function validEventShape(event: CompanionEventRecord): boolean {
  return Boolean(
    parseCompanionJsonObject(event.payloadJson)
    && parseCompanionJsonObject(event.evidenceSpanJson)
    && parseCompanionJsonArray(event.provenanceJson)
    && isFiniteUnit(event.confidence)
    && isFiniteUnit(event.intensity)
    && isFiniteUnit(event.sincerity)
  );
}

function observedMessage(row: Record<string, unknown>): CompanionObservedMessage {
  return {
    branchRootMessageId: (row.branchRootMessageId as string | null) ?? null,
    branchVersionIndex: row.branchVersionIndex == null ? null : Number(row.branchVersionIndex),
    completedAt: (row.completedAt as string | null) ?? null,
    content: String(row.content),
    id: String(row.id),
    role: row.role as CompanionObservedMessage['role'],
    status: String(row.status),
    updatedAt: String(row.updatedAt),
  };
}

export async function appendCompanionEvent(
  db: SQLiteDatabase,
  input: {
    space: PixorySpace;
    subjectType: CompanionSubjectType;
    subjectId: string;
    roleCardId?: string | null;
    threadId: string;
    branchRootMessageId?: string | null;
    branchVersionIndex?: number | null;
    branchRouteHash: string;
    lineageVersion: number;
    sourceMessageId: string;
    candidate: CompanionEventCandidate;
    createdAt?: string;
  },
): Promise<{ event: CompanionEventRecord; inserted: boolean }> {
  const idempotencyKey = hashCompanionText([
    input.space,
    input.threadId,
    input.branchRouteHash,
    input.candidate.semanticKey,
  ].join('\u001F'));
  const existing = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM companion_events WHERE idempotencyKey = ?',
    idempotencyKey,
  );
  if (existing) {
    const current = mapEvent(existing);
    const provenance = parseCompanionJsonArray(current.provenanceJson) ?? [];
    const hasExtractor = provenance.some((item) => (
      item != null
      && typeof item === 'object'
      && (item as Record<string, unknown>).extractorVersion === input.candidate.extractorVersion
    ));
    if (!hasExtractor) {
      provenance.push({ extractorVersion: input.candidate.extractorVersion, confidence: input.candidate.confidence });
      await db.runAsync(
        'UPDATE companion_events SET provenanceJson = ?, confidence = MAX(confidence, ?) WHERE id = ?',
        JSON.stringify(provenance), input.candidate.confidence, current.id,
      );
      const merged = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_events WHERE id = ?', current.id);
      return { event: merged ? mapEvent(merged) : current, inserted: false };
    }
    return { event: current, inserted: false };
  }
  const eventSequence = Number((await db.getFirstAsync<{ sequence: number }>(
    `SELECT COALESCE(MAX(eventSequence), 0) + 1 AS sequence
     FROM companion_events
     WHERE space = ? AND subjectType = ? AND subjectId = ? AND threadId = ? AND branchRouteHash = ?`,
    input.space, input.subjectType, input.subjectId, input.threadId, input.branchRouteHash,
  ))?.sequence ?? 1);
  const createdAt = input.createdAt ?? createTimestamp();
  const id = `cevt_${idempotencyKey.slice(0, 32)}`;
  await db.runAsync(
    `INSERT OR IGNORE INTO companion_events (
       id, space, subjectType, subjectId, roleCardId, threadId,
       branchRootMessageId, branchVersionIndex, branchRouteHash, lineageVersion,
       sourceMessageId, sourceMessageVersionHash, category, subtype, speechMode,
       confidence, intensity, sincerity, payloadJson, evidenceSpanJson,
       extractorVersion, provenanceJson, idempotencyKey, status, eventSequence, createdAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    id, input.space, input.subjectType, input.subjectId, input.roleCardId ?? null, input.threadId,
    input.branchRootMessageId ?? null, input.branchVersionIndex ?? null, input.branchRouteHash, input.lineageVersion,
    input.sourceMessageId, input.candidate.evidence.messageVersionHash, input.candidate.category, input.candidate.subtype,
    input.candidate.speechMode, input.candidate.confidence, input.candidate.intensity, input.candidate.sincerity,
    JSON.stringify(input.candidate.payload), JSON.stringify(input.candidate.evidence), input.candidate.extractorVersion,
    JSON.stringify([{ extractorVersion: input.candidate.extractorVersion, confidence: input.candidate.confidence }]),
    idempotencyKey, eventSequence, createdAt,
  );
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_events WHERE idempotencyKey = ?', idempotencyKey);
  if (!row) throw new Error('companion_event_write_failed');
  return { event: mapEvent(row), inserted: String(row.id) === id };
}

export async function listVisibleCompanionEvents(
  db: SQLiteDatabase,
  input: { space: PixorySpace; threadId: string; branchRouteHash: string; lineageVersion: number },
): Promise<CompanionEventRecord[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM companion_events
     WHERE space = ? AND threadId = ? AND branchRouteHash = ? AND lineageVersion = ? AND status = 'active'
     ORDER BY eventSequence ASC, id ASC`,
    input.space, input.threadId, input.branchRouteHash, input.lineageVersion,
  );
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((row) => String(row.sourceMessageId)))];
  const messages = await db.getAllAsync<Record<string, unknown>>(
    `SELECT id, branchRootMessageId, branchVersionIndex, role, status, content, updatedAt, completedAt
     FROM ai_messages WHERE id IN (${ids.map(() => '?').join(', ')})`,
    ...ids,
  );
  const messageById = new Map(messages.map((row) => [String(row.id), observedMessage(row)]));
  return rows
    .map(mapEvent)
    .filter((event) => {
      const message = messageById.get(event.sourceMessageId);
      return validEventShape(event) && Boolean(message) && hashCompanionMessageVersion(message as CompanionObservedMessage) === event.sourceMessageVersionHash;
    });
}

function mapJob(row: Record<string, unknown>): CompanionRuntimeJobRecord {
  return {
    attemptCount: Number(row.attemptCount), branchRouteHash: String(row.branchRouteHash), completedAt: (row.completedAt as string | null) ?? null,
    createdAt: String(row.createdAt), id: String(row.id), idempotencyKey: String(row.idempotencyKey), jobType: row.jobType as CompanionRuntimeJobRecord['jobType'],
    lastErrorCode: (row.lastErrorCode as string | null) ?? null, leaseOwner: (row.leaseOwner as string | null) ?? null,
    leaseUntil: (row.leaseUntil as string | null) ?? null, lineageVersion: Number(row.lineageVersion), nextRunAt: String(row.nextRunAt),
    payloadJson: String(row.payloadJson), sourceMessageId: (row.sourceMessageId as string | null) ?? null, space: row.space as PixorySpace,
    status: row.status as CompanionRuntimeJobRecord['status'], threadId: String(row.threadId), updatedAt: String(row.updatedAt),
  };
}

export async function enqueueCompanionRuntimeJob(db: SQLiteDatabase, input: {
  space: PixorySpace; threadId: string; branchRouteHash: string; lineageVersion: number; sourceMessageId?: string | null;
  jobType: CompanionRuntimeJobRecord['jobType']; payload: Record<string, unknown>; idempotencyKey: string; nextRunAt: string;
}): Promise<CompanionRuntimeJobRecord> {
  const now = createTimestamp();
  const id = `cjob_${hashCompanionText(`${input.space}\u001F${input.idempotencyKey}`).slice(0, 32)}`;
  await db.runAsync(
    `INSERT OR IGNORE INTO companion_runtime_jobs (
       id, space, threadId, branchRouteHash, lineageVersion, sourceMessageId, jobType,
       status, payloadJson, idempotencyKey, attemptCount, nextRunAt, createdAt, updatedAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 0, ?, ?, ?)`,
    id, input.space, input.threadId, input.branchRouteHash, input.lineageVersion, input.sourceMessageId ?? null,
    input.jobType, JSON.stringify(input.payload), input.idempotencyKey, input.nextRunAt, now, now,
  );
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_runtime_jobs WHERE idempotencyKey = ?', input.idempotencyKey);
  if (!row) throw new Error('companion_runtime_job_write_failed');
  return mapJob(row);
}

export async function findCompanionRuntimeJob(db: SQLiteDatabase, jobId: string): Promise<CompanionRuntimeJobRecord | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_runtime_jobs WHERE id = ?', jobId);
  return row ? mapJob(row) : null;
}

export async function acquireCompanionRuntimeJob(db: SQLiteDatabase, input: {
  jobId: string; leaseOwner: string; now: string; leaseUntil: string;
}): Promise<CompanionRuntimeJobRecord | null> {
  await db.runAsync(
    `UPDATE companion_runtime_jobs
     SET status = 'running', leaseOwner = ?, leaseUntil = ?, attemptCount = attemptCount + 1, updatedAt = ?
     WHERE id = ? AND nextRunAt <= ? AND (
       status IN ('pending', 'retry', 'waiting_model')
       OR (status = 'running' AND (leaseUntil IS NULL OR leaseUntil <= ?))
     )`,
    input.leaseOwner, input.leaseUntil, input.now, input.jobId, input.now, input.now,
  );
  const row = await findCompanionRuntimeJob(db, input.jobId);
  return row?.status === 'running' && row.leaseOwner === input.leaseOwner ? row : null;
}

export async function failCompanionRuntimeJob(db: SQLiteDatabase, input: {
  jobId: string; leaseOwner: string; errorCode: string; nextRunAt: string; maxAttempts: number;
}): Promise<void> {
  const current = await findCompanionRuntimeJob(db, input.jobId);
  if (!current || current.status !== 'running' || current.leaseOwner !== input.leaseOwner) return;
  const terminal = current.attemptCount >= input.maxAttempts;
  const now = createTimestamp();
  await db.runAsync(
    `UPDATE companion_runtime_jobs
     SET status = ?, nextRunAt = ?, leaseOwner = NULL, leaseUntil = NULL,
         lastErrorCode = ?, completedAt = ?, updatedAt = ?
     WHERE id = ? AND status = 'running' AND leaseOwner = ?`,
    terminal ? 'dead' : 'retry', input.nextRunAt, input.errorCode, terminal ? now : null, now, input.jobId, input.leaseOwner,
  );
}

export async function listReadyCompanionRuntimeJobs(
  db: SQLiteDatabase,
  input: { space: PixorySpace; now: string; limit?: number },
): Promise<CompanionRuntimeJobRecord[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM companion_runtime_jobs
     WHERE space = ? AND nextRunAt <= ? AND (
       status IN ('pending', 'retry', 'waiting_model')
       OR (status = 'running' AND (leaseUntil IS NULL OR leaseUntil <= ?))
     )
     ORDER BY nextRunAt ASC, createdAt ASC, id ASC
     LIMIT ?`,
    input.space, input.now, input.now, Math.max(1, Math.min(50, input.limit ?? 10)),
  );
  return rows.map(mapJob).filter((job) => Boolean(parseCompanionJsonObject(job.payloadJson)));
}

export async function completeCompanionRuntimeJob(
  db: SQLiteDatabase,
  input: { jobId: string; leaseOwner: string; completedAt?: string },
): Promise<void> {
  const completedAt = input.completedAt ?? createTimestamp();
  await db.runAsync(
    `UPDATE companion_runtime_jobs
     SET status = 'done', leaseOwner = NULL, leaseUntil = NULL, lastErrorCode = NULL,
         completedAt = ?, updatedAt = ?
     WHERE id = ? AND status = 'running' AND leaseOwner = ?`,
    completedAt, completedAt, input.jobId, input.leaseOwner,
  );
}

export async function deferCompanionRuntimeJob(
  db: SQLiteDatabase,
  input: { jobId: string; leaseOwner: string; nextRunAt: string; errorCode?: string | null },
): Promise<void> {
  await db.runAsync(
    `UPDATE companion_runtime_jobs
     SET status = 'waiting_model', leaseOwner = NULL, leaseUntil = NULL,
         nextRunAt = ?, lastErrorCode = ?, updatedAt = ?
     WHERE id = ? AND status = 'running' AND leaseOwner = ?`,
    input.nextRunAt, input.errorCode ?? 'model_unavailable', createTimestamp(), input.jobId, input.leaseOwner,
  );
}

function mapAnchor(row: Record<string, unknown>): CompanionTemporalAnchorRecord {
  return {
    anchorType: row.anchorType as CompanionTemporalAnchorRecord['anchorType'], branchRouteHash: String(row.branchRouteHash),
    confidence: Number(row.confidence), createdAt: String(row.createdAt), endAtUtc: (row.endAtUtc as string | null) ?? null,
    id: String(row.id), idempotencyKey: String(row.idempotencyKey), lineageVersion: Number(row.lineageVersion), localDateKey: String(row.localDateKey),
    parseTimeZone: String(row.parseTimeZone), parserVersion: String(row.parserVersion), precision: row.precision as CompanionTemporalAnchorRecord['precision'],
    rawText: String(row.rawText), recurrenceRule: (row.recurrenceRule as string | null) ?? null,
    mentionCount: Number(row.mentionCount ?? 0), lastMentionedAt: (row.lastMentionedAt as string | null) ?? null,
    roleCardId: (row.roleCardId as string | null) ?? null,
    sourceEventId: String(row.sourceEventId), sourceMessageId: String(row.sourceMessageId), space: row.space as PixorySpace,
    startAtUtc: (row.startAtUtc as string | null) ?? null, status: row.status as CompanionTemporalAnchorRecord['status'],
    threadId: String(row.threadId), updatedAt: String(row.updatedAt),
  };
}

export async function upsertCompanionTemporalAnchor(db: SQLiteDatabase, input: {
  space: PixorySpace; roleCardId?: string | null; threadId: string; branchRouteHash: string; lineageVersion: number;
  sourceEventId: string; sourceMessageId: string; parsed: ParsedTemporalAnchor; confidence: number; idempotencyKey: string;
}): Promise<CompanionTemporalAnchorRecord> {
  const now = createTimestamp();
  const id = `ctmp_${hashCompanionText(`${input.space}\u001F${input.idempotencyKey}`).slice(0, 32)}`;
  await db.runAsync(
    `INSERT OR IGNORE INTO companion_temporal_anchors (
       id, space, roleCardId, threadId, branchRouteHash, lineageVersion, sourceEventId, sourceMessageId,
       rawText, startAtUtc, endAtUtc, parseTimeZone, localDateKey, precision, anchorType,
       recurrenceRule, mentionCount, lastMentionedAt, status, confidence, parserVersion, idempotencyKey, createdAt, updatedAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'active', ?, ?, ?, ?, ?)`,
    id, input.space, input.roleCardId ?? null, input.threadId, input.branchRouteHash, input.lineageVersion,
    input.sourceEventId, input.sourceMessageId, input.parsed.rawText, input.parsed.startAtUtc, input.parsed.endAtUtc,
    input.parsed.parseTimeZone, input.parsed.localDateKey, input.parsed.precision, input.parsed.type,
    input.parsed.recurrenceRule, input.confidence, input.parsed.parserVersion, input.idempotencyKey, now, now,
  );
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_temporal_anchors WHERE idempotencyKey = ?', input.idempotencyKey);
  if (!row) throw new Error('companion_temporal_anchor_write_failed');
  return mapAnchor(row);
}

function mapLoop(row: Record<string, unknown>): CompanionOpenLoopRecord {
  return {
    branchRouteHash: String(row.branchRouteHash), createdAt: String(row.createdAt), earliestMentionAt: String(row.earliestMentionAt),
    expiresAt: (row.expiresAt as string | null) ?? null, id: String(row.id), idempotencyKey: String(row.idempotencyKey),
    kind: row.kind as CompanionOpenLoopRecord['kind'], lastMentionedAt: (row.lastMentionedAt as string | null) ?? null,
    lastMentionedRound: row.lastMentionedRound == null ? null : Number(row.lastMentionedRound), lineageVersion: Number(row.lineageVersion),
    mentionCount: Number(row.mentionCount), priority: Number(row.priority), recurrenceRule: (row.recurrenceRule as string | null) ?? null,
    resolutionEvidenceMessageId: (row.resolutionEvidenceMessageId as string | null) ?? null, roleCardId: (row.roleCardId as string | null) ?? null,
    sourceEventId: String(row.sourceEventId), sourceMessageId: String(row.sourceMessageId), space: row.space as PixorySpace,
    status: row.status as CompanionOpenLoopStatus, temporalAnchorId: (row.temporalAnchorId as string | null) ?? null,
    threadId: String(row.threadId), topicText: String(row.topicText), updatedAt: String(row.updatedAt),
  };
}

export async function upsertCompanionOpenLoop(db: SQLiteDatabase, input: {
  space: PixorySpace; roleCardId?: string | null; threadId: string; branchRouteHash: string; lineageVersion: number;
  eventId: string; sourceMessageId: string; anchorId?: string | null; topicText: string;
  loop: CompanionOpenLoopPolicyFields; idempotencyKey: string;
}): Promise<CompanionOpenLoopRecord> {
  const now = createTimestamp();
  const id = `cloop_${hashCompanionText(`${input.space}\u001F${input.idempotencyKey}`).slice(0, 32)}`;
  await db.runAsync(
    `INSERT OR IGNORE INTO companion_open_loops (
       id, space, roleCardId, threadId, branchRouteHash, lineageVersion, sourceEventId, sourceMessageId,
       temporalAnchorId, kind, topicText, status, priority, earliestMentionAt, expiresAt,
       mentionCount, lastMentionedAt, lastMentionedRound, recurrenceRule, idempotencyKey, createdAt, updatedAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, input.space, input.roleCardId ?? null, input.threadId, input.branchRouteHash, input.lineageVersion,
    input.eventId, input.sourceMessageId, input.anchorId ?? null, input.loop.kind, input.topicText, input.loop.status,
    input.loop.priority, input.loop.earliestMentionAt, input.loop.expiresAt, input.loop.mentionCount,
    input.loop.lastMentionedAt, input.loop.lastMentionedRound, input.loop.recurrenceRule, input.idempotencyKey, now, now,
  );
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_open_loops WHERE idempotencyKey = ?', input.idempotencyKey);
  if (!row) throw new Error('companion_open_loop_write_failed');
  return mapLoop(row);
}

export async function transitionCompanionOpenLoop(db: SQLiteDatabase, input: {
  id: string; status: Exclude<CompanionOpenLoopStatus, 'open'>; resolutionEvidenceMessageId?: string | null;
}): Promise<void> {
  await db.runAsync(
    `UPDATE companion_open_loops SET status = ?, resolutionEvidenceMessageId = ?, updatedAt = ? WHERE id = ? AND status = 'open'`,
    input.status, input.resolutionEvidenceMessageId ?? null, createTimestamp(), input.id,
  );
}

export async function listCompanionOpenLoops(db: SQLiteDatabase, input: {
  space: PixorySpace; threadId: string; branchRouteHash: string; lineageVersion: number; statuses: CompanionOpenLoopStatus[];
}): Promise<CompanionOpenLoopRecord[]> {
  if (input.statuses.length === 0) return [];
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM companion_open_loops
     WHERE space = ? AND threadId = ? AND branchRouteHash = ? AND lineageVersion = ?
       AND status IN (${input.statuses.map(() => '?').join(', ')})
     ORDER BY priority DESC, createdAt ASC, id ASC`,
    input.space, input.threadId, input.branchRouteHash, input.lineageVersion, ...input.statuses,
  );
  return rows.map(mapLoop);
}

export async function expireCompanionOpenLoops(
  db: SQLiteDatabase,
  input: { space: PixorySpace; threadId: string; branchRouteHash: string; lineageVersion: number; now: string },
): Promise<number> {
  const result = await db.runAsync(
    `UPDATE companion_open_loops
     SET status = 'expired', updatedAt = ?
     WHERE space = ? AND threadId = ? AND branchRouteHash = ? AND lineageVersion = ?
       AND status = 'open' AND expiresAt IS NOT NULL AND expiresAt <= ?`,
    input.now, input.space, input.threadId, input.branchRouteHash, input.lineageVersion, input.now,
  );
  return Number(result.changes ?? 0);
}

export async function markCompanionOpenLoopMentioned(
  db: SQLiteDatabase,
  input: { id: string; mentionedAt: string; round: number },
): Promise<void> {
  await db.runAsync(
    `UPDATE companion_open_loops
     SET mentionCount = mentionCount + 1, lastMentionedAt = ?, lastMentionedRound = ?, updatedAt = ?
     WHERE id = ? AND status = 'open' AND mentionCount < 2`,
    input.mentionedAt, input.round, input.mentionedAt, input.id,
  );
}

export async function listCompanionTemporalAnchors(db: SQLiteDatabase, input: {
  space: PixorySpace; threadId: string; branchRouteHash: string; lineageVersion: number;
  statuses?: CompanionTemporalAnchorRecord['status'][];
}): Promise<CompanionTemporalAnchorRecord[]> {
  const statuses = input.statuses ?? ['active'];
  if (statuses.length === 0) return [];
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM companion_temporal_anchors
     WHERE space = ? AND threadId = ? AND branchRouteHash = ? AND lineageVersion = ?
       AND status IN (${statuses.map(() => '?').join(', ')})
     ORDER BY COALESCE(startAtUtc, createdAt) ASC, id ASC`,
    input.space, input.threadId, input.branchRouteHash, input.lineageVersion, ...statuses,
  );
  return rows.map(mapAnchor);
}

export async function expireCompanionTemporalAnchors(
  db: SQLiteDatabase,
  input: { space: PixorySpace; threadId: string; branchRouteHash: string; lineageVersion: number; now: string },
): Promise<number> {
  const result = await db.runAsync(
    `UPDATE companion_temporal_anchors
     SET status = 'expired', updatedAt = ?
     WHERE space = ? AND threadId = ? AND branchRouteHash = ? AND lineageVersion = ?
       AND status = 'active' AND anchorType NOT IN ('recurrence', 'anniversary')
       AND endAtUtc IS NOT NULL AND datetime(endAtUtc, '+7 days') <= datetime(?)`,
    input.now, input.space, input.threadId, input.branchRouteHash, input.lineageVersion, input.now,
  );
  return Number(result.changes ?? 0);
}

export async function markCompanionTemporalAnchorMentioned(
  db: SQLiteDatabase,
  input: { id: string; mentionedAt: string },
): Promise<void> {
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_temporal_anchors WHERE id = ? AND status = \'active\'', input.id);
  if (!row) return;
  const anchor = mapAnchor(row);
  if (anchor.anchorType !== 'recurrence' && anchor.anchorType !== 'anniversary') {
    await db.runAsync(
      `UPDATE companion_temporal_anchors
       SET mentionCount = mentionCount + 1, lastMentionedAt = ?, status = 'completed', updatedAt = ?
       WHERE id = ? AND status = 'active'`,
      input.mentionedAt, input.mentionedAt, input.id,
    );
    return;
  }
  const next = advanceRecurringTemporalAnchor({
    mentionedAt: input.mentionedAt,
    parseTimeZone: anchor.parseTimeZone,
    rawText: anchor.rawText,
    type: anchor.anchorType,
  });
  if (!next) {
    await db.runAsync(
      `UPDATE companion_temporal_anchors SET status = 'expired', updatedAt = ? WHERE id = ? AND status = 'active'`,
      input.mentionedAt, input.id,
    );
    return;
  }
  await db.runAsync(
    `UPDATE companion_temporal_anchors
     SET startAtUtc = ?, endAtUtc = ?, localDateKey = ?, mentionCount = 0,
         lastMentionedAt = ?, updatedAt = ?
     WHERE id = ? AND status = 'active'`,
    next.startAtUtc, next.endAtUtc, next.localDateKey,
    input.mentionedAt, input.mentionedAt, input.id,
  );
}

export async function recordCompanionContextTrace(db: SQLiteDatabase, input: {
  id: string; space: PixorySpace; threadId: string; sourceMessageId?: string | null; branchRouteHash: string;
  lineageVersion: number; policyVersion: string; eventCount: number; diagnosticCandidateCount: number;
  optionalCandidateCount: number; selectedTopicType?: string | null; observerDurationMs?: number;
  compilerDurationMs?: number; reasonCodes?: string[]; createdAt?: string;
}): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO companion_context_traces (
       id, space, threadId, sourceMessageId, branchRouteHash, lineageVersion, policyVersion,
       eventCount, diagnosticCandidateCount, optionalCandidateCount, selectedTopicType,
       observerDurationMs, compilerDurationMs, reasonCodesJson, createdAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       eventCount = excluded.eventCount,
       diagnosticCandidateCount = excluded.diagnosticCandidateCount,
       optionalCandidateCount = excluded.optionalCandidateCount,
       selectedTopicType = excluded.selectedTopicType,
       observerDurationMs = MAX(companion_context_traces.observerDurationMs, excluded.observerDurationMs),
       compilerDurationMs = MAX(companion_context_traces.compilerDurationMs, excluded.compilerDurationMs),
       reasonCodesJson = excluded.reasonCodesJson`,
    input.id, input.space, input.threadId, input.sourceMessageId ?? null, input.branchRouteHash,
    input.lineageVersion, input.policyVersion, input.eventCount, input.diagnosticCandidateCount,
    input.optionalCandidateCount, input.selectedTopicType ?? null, input.observerDurationMs ?? 0,
    input.compilerDurationMs ?? 0, JSON.stringify(input.reasonCodes ?? []), input.createdAt ?? createTimestamp(),
  );
}

export const CompanionEventRepository = {
  acquireJob: acquireCompanionRuntimeJob,
  append: appendCompanionEvent,
  completeJob: completeCompanionRuntimeJob,
  deferJob: deferCompanionRuntimeJob,
  enqueueJob: enqueueCompanionRuntimeJob,
  expireOpenLoops: expireCompanionOpenLoops,
  expireTemporalAnchors: expireCompanionTemporalAnchors,
  failJob: failCompanionRuntimeJob,
  findJob: findCompanionRuntimeJob,
  listOpenLoops: listCompanionOpenLoops,
  listReadyJobs: listReadyCompanionRuntimeJobs,
  listTemporalAnchors: listCompanionTemporalAnchors,
  listVisible: listVisibleCompanionEvents,
  markOpenLoopMentioned: markCompanionOpenLoopMentioned,
  markTemporalAnchorMentioned: markCompanionTemporalAnchorMentioned,
  recordTrace: recordCompanionContextTrace,
  transitionOpenLoop: transitionCompanionOpenLoop,
  upsertOpenLoop: upsertCompanionOpenLoop,
  upsertTemporalAnchor: upsertCompanionTemporalAnchor,
};
