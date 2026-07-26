import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { createTimestamp } from '../../database/utils';
import type {
  MemoryCurrentTurnObservation,
  MemoryIntent,
  MemorySpace,
} from './memoryTypes';

function createObservationId(): string {
  return `mobs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function createOutboxId(): string {
  return `moutbox_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function deriveObservationKey(input: {
  space: MemorySpace;
  threadId: string;
  messageId: string;
  intent: MemoryIntent;
}): string {
  return bytesToHex(sha256(new TextEncoder().encode(
    [input.space, input.threadId, input.messageId, input.intent].join('\u001F')
  )));
}

function mapObservation(row: Record<string, unknown>): MemoryCurrentTurnObservation {
  return {
    branchRootMessageId: (row.branchRootMessageId as string | null) ?? null,
    branchVersionIndex: row.branchVersionIndex == null ? null : Number(row.branchVersionIndex),
    consumedAt: (row.consumedAt as string | null) ?? null,
    createdAt: String(row.createdAt),
    deletedAt: (row.deletedAt as string | null) ?? null,
    explicitUserAction: Number(row.explicitUserAction) === 1,
    expiresAt: String(row.expiresAt),
    extractorVersion: String(row.extractorVersion),
    id: String(row.id),
    idempotencyKey: String(row.idempotencyKey),
    intent: row.intent as MemoryIntent,
    messageId: String(row.messageId),
    payloadJson: String(row.payloadJson),
    space: row.space as MemorySpace,
    status: row.status as MemoryCurrentTurnObservation['status'],
    threadId: String(row.threadId),
  };
}

export async function writeCurrentTurnObservation(
  db: SQLiteDatabase,
  input: {
    space: MemorySpace;
    threadId: string;
    branchRootMessageId?: string | null;
    branchVersionIndex?: number | null;
    messageId: string;
    intent: MemoryIntent;
    explicitUserAction: boolean;
    payload: Record<string, unknown>;
    extractorVersion?: string;
  }
): Promise<MemoryCurrentTurnObservation> {
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const idempotencyKey = deriveObservationKey(input);
  const existing = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM memory_current_turn_observations WHERE idempotencyKey = ?',
    idempotencyKey
  );
  if (existing) {
    return mapObservation(existing);
  }
  await db.runAsync(
    `INSERT INTO memory_current_turn_observations (
      id, space, threadId, branchRootMessageId, branchVersionIndex, messageId,
      intent, explicitUserAction, payloadJson, status, extractorVersion,
      idempotencyKey, createdAt, expiresAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    createObservationId(),
    input.space,
    input.threadId,
    input.branchRootMessageId ?? null,
    input.branchVersionIndex ?? null,
    input.messageId,
    input.intent,
    input.explicitUserAction ? 1 : 0,
    JSON.stringify(input.payload),
    input.extractorVersion ?? 'local-fast-v1',
    idempotencyKey,
    createdAt,
    expiresAt
  );
  await db.runAsync(
    `INSERT OR IGNORE INTO memory_outbox (
       id, space, eventId, taskType, status, idempotencyKey,
       retryCount, nextRunAt, createdAt, updatedAt
     ) VALUES (?, ?, NULL, 'memory_extract_current_turn', 'pending', ?, 0, ?, ?, ?)`,
    createOutboxId(),
    input.space,
    `current-turn:${idempotencyKey}`,
    createdAt,
    createdAt,
    createdAt
  );
  const created = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM memory_current_turn_observations WHERE idempotencyKey = ?',
    idempotencyKey
  );
  if (!created) {
    throw new Error('memory_current_turn_observation_write_failed');
  }
  return mapObservation(created);
}

export async function listPendingCurrentTurnObservations(
  db: SQLiteDatabase,
  input: { space: MemorySpace; threadId: string }
): Promise<MemoryCurrentTurnObservation[]> {
  const now = createTimestamp();
  await db.runAsync(
    `UPDATE memory_current_turn_observations
     SET status = 'expired'
     WHERE space = ? AND threadId = ? AND status = 'pending'
       AND (
         expiresAt <= ?
         OR (
           SELECT COUNT(*)
           FROM ai_messages later
           WHERE later.threadId = memory_current_turn_observations.threadId
             AND later.role = 'assistant'
             AND later.status = 'completed'
             AND later.createdAt > memory_current_turn_observations.createdAt
         ) >= 20
       )`,
    input.space,
    input.threadId,
    now
  );
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM memory_current_turn_observations
     WHERE space = ? AND threadId = ? AND status = 'pending'
     ORDER BY createdAt ASC`,
    input.space,
    input.threadId
  );
  return rows.map(mapObservation);
}

export async function consumeCurrentTurnObservation(
  db: SQLiteDatabase,
  input: { id: string; space: MemorySpace }
): Promise<void> {
  const row = await db.getFirstAsync<{ idempotencyKey: string }>(
    `SELECT idempotencyKey
     FROM memory_current_turn_observations
     WHERE id = ? AND space = ?`,
    input.id,
    input.space
  );
  await db.runAsync(
    `UPDATE memory_current_turn_observations
     SET status = 'consumed', consumedAt = ?
     WHERE id = ? AND space = ? AND status = 'pending'`,
    createTimestamp(),
    input.id,
    input.space
  );
  if (row) {
    await db.runAsync(
      `UPDATE memory_outbox
       SET status = 'done', leaseUntil = NULL, lastError = NULL, updatedAt = ?
       WHERE space = ? AND idempotencyKey = ?`,
      createTimestamp(),
      input.space,
      `current-turn:${row.idempotencyKey}`
    );
  }
}

export async function purgeExpiredCurrentTurnObservations(
  db: SQLiteDatabase,
  input: { space: MemorySpace; olderThan: string }
): Promise<void> {
  await db.runAsync(
    `DELETE FROM memory_current_turn_observations
     WHERE space = ? AND status IN ('consumed', 'expired', 'deleted') AND createdAt < ?`,
    input.space,
    input.olderThan
  );
}

export function parseObservationPayload(observation: MemoryCurrentTurnObservation): Record<string, unknown> {
  try {
    const parsed = JSON.parse(observation.payloadJson);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export const MemoryCurrentTurnRepository = {
  consume: consumeCurrentTurnObservation,
  listPending: listPendingCurrentTurnObservations,
  purgeExpired: purgeExpiredCurrentTurnObservations,
  write: writeCurrentTurnObservation,
};
