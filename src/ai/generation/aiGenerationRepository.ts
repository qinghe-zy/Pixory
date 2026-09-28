import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { PixorySpace } from '../../database';
import {
  canTransitionGeneration,
  isTerminalGenerationState,
  type AiGenerationJobState,
} from './aiGenerationRecovery';

export interface AiGenerationJobRecord {
  id: string;
  space: PixorySpace;
  threadId: string;
  userMessageId: string;
  assistantMessageId: string;
  generationId: string;
  attemptId: string;
  requestMode: 'replace' | 'continue' | 'followup';
  state: AiGenerationJobState;
  providerId: string | null;
  modelId: string | null;
  protocol: string | null;
  requestSnapshotJson: string;
  promptSnapshotHash: string | null;
  cacheMetadataJson: string;
  branchRouteHash: string;
  lineageVersion: number;
  partialContent: string;
  partialReasoning: string | null;
  lastPersistSequence: number;
  completionReason: string | null;
  providerRequestId: string | null;
  providerCursor: string | null;
  retryCount: number;
  continuationCount: number;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  heartbeatAt: string | null;
  lastErrorCode: string | null;
  remoteOutcomeUnknown: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

type JobRow = Omit<AiGenerationJobRecord, 'remoteOutcomeUnknown'> & { remoteOutcomeUnknown: number };

function mapJob(row: JobRow): AiGenerationJobRecord {
  return { ...row, remoteOutcomeUnknown: row.remoteOutcomeUnknown === 1 };
}

function contentHash(value: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(value))).slice(0, 24);
}

function safeEventPayload(payload: Record<string, unknown>): string {
  const forbidden = ['content', 'reasoning', 'prompt', 'message', 'text', 'apiKey', 'secret'];
  const inspect = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
      if (forbidden.some((word) => key.toLowerCase().includes(word.toLowerCase()))) {
        throw new Error(`Generation event payload cannot contain ${key}.`);
      }
      inspect(nested);
    }
  };
  inspect(payload);
  return JSON.stringify(payload);
}

async function appendEvent(
  db: SQLiteDatabase,
  job: AiGenerationJobRecord,
  input: {
    eventType: string;
    fromState?: AiGenerationJobState | null;
    now: string;
    partialContent?: string;
    payload?: Record<string, unknown>;
    toState?: AiGenerationJobState | null;
  },
): Promise<void> {
  const sequenceRow = await db.getFirstAsync<{ lastPersistSequence: number }>(
    `UPDATE ai_generation_jobs
        SET lastPersistSequence = lastPersistSequence + 1, updatedAt = ?
      WHERE id = ?
      RETURNING lastPersistSequence`,
    input.now,
    job.id,
  );
  if (!sequenceRow) throw new Error('Generation job disappeared while appending an event.');
  const sequence = sequenceRow.lastPersistSequence;
  await db.runAsync(
    `INSERT INTO ai_generation_events
      (id, jobId, sequence, eventType, fromState, toState, payloadJson, partialContentHash, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    `${job.id}:event:${sequence}`,
    job.id,
    sequence,
    input.eventType,
    input.fromState ?? null,
    input.toState ?? null,
    safeEventPayload(input.payload ?? {}),
    input.partialContent == null ? null : contentHash(input.partialContent),
    input.now,
  );
}

export async function findGenerationJobByGenerationId(
  db: SQLiteDatabase,
  generationId: string,
): Promise<AiGenerationJobRecord | null> {
  const row = await db.getFirstAsync<JobRow>('SELECT * FROM ai_generation_jobs WHERE generationId = ?', generationId);
  return row ? mapJob(row) : null;
}

export async function createPreparedGenerationJob(db: SQLiteDatabase, input: {
  assistantMessageId: string;
  attemptId: string;
  branchRouteHash: string;
  generationId: string;
  lineageVersion: number;
  now: string;
  partialContent: string;
  partialReasoning: string | null;
  requestMode: AiGenerationJobRecord['requestMode'];
  requestSnapshotJson: string;
  space: PixorySpace;
  threadId: string;
  userMessageId: string;
}): Promise<AiGenerationJobRecord> {
  const id = `aigjob_${input.generationId}`;
  await db.runAsync(
    `INSERT OR IGNORE INTO ai_generation_jobs (
      id, space, threadId, userMessageId, assistantMessageId, generationId, attemptId,
      requestMode, state, requestSnapshotJson, branchRouteHash, lineageVersion,
      partialContent, partialReasoning, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'prepared', ?, ?, ?, ?, ?, ?, ?)`,
    id, input.space, input.threadId, input.userMessageId, input.assistantMessageId,
    input.generationId, input.attemptId, input.requestMode, input.requestSnapshotJson,
    input.branchRouteHash, input.lineageVersion, input.partialContent,
    input.partialReasoning, input.now, input.now,
  );
  const job = await findGenerationJobByGenerationId(db, input.generationId);
  if (!job) throw new Error('Failed to persist the generation job.');
  if (job.lastPersistSequence === 0) {
    await appendEvent(db, job, {
      eventType: 'prepared', now: input.now, partialContent: input.partialContent,
      payload: { partialChars: input.partialContent.length }, toState: 'prepared',
    });
  }
  return (await findGenerationJobByGenerationId(db, input.generationId)) ?? job;
}

export async function transitionGenerationJob(db: SQLiteDatabase, input: {
  generationId: string;
  now: string;
  providerId?: string | null;
  modelId?: string | null;
  protocol?: string | null;
  promptSnapshotHash?: string | null;
  cacheMetadataJson?: string;
  state: AiGenerationJobState;
  eventType?: string;
  payload?: Record<string, unknown>;
}): Promise<AiGenerationJobRecord | null> {
  const current = await findGenerationJobByGenerationId(db, input.generationId);
  if (!current) return null;
  if (!canTransitionGeneration(current.state, input.state)) {
    throw new Error(`Illegal generation transition: ${current.state} -> ${input.state}`);
  }
  if (isTerminalGenerationState(current.state)) return current;
  await db.runAsync(
    `UPDATE ai_generation_jobs SET state = ?, providerId = COALESCE(?, providerId),
       modelId = COALESCE(?, modelId), protocol = COALESCE(?, protocol),
       promptSnapshotHash = COALESCE(?, promptSnapshotHash),
       cacheMetadataJson = COALESCE(?, cacheMetadataJson),
       startedAt = COALESCE(startedAt, ?), heartbeatAt = ?, updatedAt = ?
     WHERE id = ?`,
    input.state, input.providerId ?? null, input.modelId ?? null, input.protocol ?? null,
    input.promptSnapshotHash ?? null, input.cacheMetadataJson ?? null,
    input.now, input.now, input.now, current.id,
  );
  await appendEvent(db, current, {
    eventType: input.eventType ?? input.state,
    fromState: current.state,
    now: input.now,
    payload: input.payload,
    toState: input.state,
  });
  return findGenerationJobByGenerationId(db, input.generationId);
}

export async function persistGenerationPartial(db: SQLiteDatabase, input: {
  content: string;
  generationId: string;
  now: string;
  reasoning: string | null;
}): Promise<void> {
  const job = await findGenerationJobByGenerationId(db, input.generationId);
  if (!job || isTerminalGenerationState(job.state)) return;
  await db.runAsync(
    `UPDATE ai_generation_jobs SET partialContent = ?, partialReasoning = ?, heartbeatAt = ?, updatedAt = ? WHERE id = ?`,
    input.content, input.reasoning, input.now, input.now, job.id,
  );
  await appendEvent(db, job, {
    eventType: 'partial_persisted', now: input.now, partialContent: input.content,
    payload: { answerChars: input.content.length, analysisChars: input.reasoning?.length ?? 0 },
  });
}

export async function settleGenerationJob(db: SQLiteDatabase, input: {
  completionReason: string;
  content: string;
  errorCode?: string | null;
  generationId: string;
  now: string;
  reasoning: string | null;
  state: 'completed' | 'failed' | 'stopped';
}): Promise<AiGenerationJobRecord | null> {
  const current = await findGenerationJobByGenerationId(db, input.generationId);
  if (!current) return null;
  if (isTerminalGenerationState(current.state)) return current;
  if (!canTransitionGeneration(current.state, input.state)) {
    throw new Error(`Illegal terminal generation transition: ${current.state} -> ${input.state}`);
  }
  await db.runAsync(
    `UPDATE ai_generation_jobs SET state = ?, partialContent = ?, partialReasoning = ?,
       completionReason = ?, lastErrorCode = ?, leaseOwner = NULL, leaseExpiresAt = NULL,
       heartbeatAt = ?, completedAt = ?, updatedAt = ? WHERE id = ?`,
    input.state, input.content, input.reasoning, input.completionReason,
    input.errorCode ?? null, input.now, input.now, input.now, current.id,
  );
  await appendEvent(db, current, {
    eventType: 'settled', fromState: current.state, now: input.now,
    partialContent: input.content,
    payload: { answerChars: input.content.length, analysisChars: input.reasoning?.length ?? 0, outcome: input.completionReason },
    toState: input.state,
  });
  return findGenerationJobByGenerationId(db, input.generationId);
}

export async function markInterruptedGenerationJobs(db: SQLiteDatabase, input: {
  now: string;
  space: PixorySpace;
}): Promise<number> {
  const jobs = await db.getAllAsync<JobRow>(
    `SELECT * FROM ai_generation_jobs
      WHERE space = ? AND state NOT IN ('completed', 'failed', 'stopped')`,
    input.space,
  );
  for (const row of jobs) {
    const job = mapJob(row);
    await db.runAsync(
      `UPDATE ai_generation_jobs
          SET state = 'recoverable_interrupted',
              remoteOutcomeUnknown = CASE WHEN state IN ('requesting', 'streaming', 'reconciling') THEN 1 ELSE remoteOutcomeUnknown END,
              leaseOwner = NULL, leaseExpiresAt = NULL, heartbeatAt = ?, updatedAt = ?
        WHERE id = ?`,
      input.now, input.now, job.id,
    );
    await appendEvent(db, job, {
      eventType: 'process_interrupted',
      fromState: job.state,
      now: input.now,
      payload: { remoteOutcomeUnknown: ['requesting', 'streaming', 'reconciling'].includes(job.state) },
      toState: 'recoverable_interrupted',
    });
  }
  return jobs.length;
}

export async function listRecoverableGenerationJobs(
  db: SQLiteDatabase,
  space: PixorySpace,
): Promise<AiGenerationJobRecord[]> {
  const rows = await db.getAllAsync<JobRow>(
    `SELECT * FROM ai_generation_jobs
      WHERE space = ? AND state = 'recoverable_interrupted'
      ORDER BY updatedAt ASC`,
    space,
  );
  return rows.map(mapJob);
}

export async function claimGenerationRecovery(db: SQLiteDatabase, input: {
  jobId: string;
  leaseExpiresAt: string;
  leaseOwner: string;
  now: string;
}): Promise<AiGenerationJobRecord | null> {
  const current = await db.getFirstAsync<JobRow>(
    `SELECT * FROM ai_generation_jobs WHERE id = ? AND state = 'recoverable_interrupted'
      AND (leaseExpiresAt IS NULL OR leaseExpiresAt <= ?)`,
    input.jobId, input.now,
  );
  if (!current) return null;
  const row = await db.getFirstAsync<JobRow>(
    `UPDATE ai_generation_jobs
        SET state = 'reconciling', leaseOwner = ?, leaseExpiresAt = ?, heartbeatAt = ?, updatedAt = ?
      WHERE id = ? AND state = 'recoverable_interrupted'
        AND (leaseExpiresAt IS NULL OR leaseExpiresAt <= ?)
      RETURNING *`,
    input.leaseOwner, input.leaseExpiresAt, input.now, input.now, input.jobId, input.now,
  );
  if (!row) return null;
  await appendEvent(db, mapJob(current), {
    eventType: 'recovery_claimed', fromState: 'recoverable_interrupted', now: input.now,
    payload: { leaseExpiresAt: input.leaseExpiresAt }, toState: 'reconciling',
  });
  return findGenerationJobByGenerationId(db, row.generationId);
}

export async function beginGenerationRecoveryAttempt(db: SQLiteDatabase, input: {
  attemptId: string;
  decision: 'continue' | 'retry';
  generationId: string;
  leaseExpiresAt: string;
  leaseOwner: string;
  now: string;
}): Promise<AiGenerationJobRecord | null> {
  const job = await findGenerationJobByGenerationId(db, input.generationId);
  if (!job || job.state !== 'reconciling') return null;
  const state = input.decision === 'continue' ? 'continuing' : 'retrying';
  await db.runAsync(
    `UPDATE ai_generation_jobs SET state = ?, attemptId = ?, retryCount = retryCount + ?,
       continuationCount = continuationCount + ?, leaseOwner = ?, leaseExpiresAt = ?,
       heartbeatAt = ?, updatedAt = ? WHERE id = ?`,
    state, input.attemptId, input.decision === 'retry' ? 1 : 0, input.decision === 'continue' ? 1 : 0,
    input.leaseOwner, input.leaseExpiresAt, input.now, input.now, job.id,
  );
  await appendEvent(db, job, {
    eventType: `recovery_${input.decision}`, fromState: job.state, now: input.now,
    payload: { continuationCount: job.continuationCount + (input.decision === 'continue' ? 1 : 0), retryCount: job.retryCount + (input.decision === 'retry' ? 1 : 0) },
    toState: state,
  });
  return findGenerationJobByGenerationId(db, input.generationId);
}
