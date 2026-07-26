import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { createTimestamp } from '../../database/utils';
import type {
  MemoryEventInput,
  MemoryEventRecord,
  MemoryProjectionMeta,
  MemorySpace,
} from './memoryTypes';

const UNIT_SEPARATOR = '\u001F';

export function deriveMemoryCommandAggregateId(
  prefix: string,
  space: MemorySpace,
  commandId: string,
  purpose: string
): string {
  const digest = bytesToHex(sha256(new TextEncoder().encode([
    space,
    commandId,
    purpose,
  ].join(UNIT_SEPARATOR))));
  return `${prefix}_${digest.slice(0, 32)}`;
}

export function deriveMemoryEventIdempotencyKey(input: Pick<
  MemoryEventInput,
  'space' | 'commandId' | 'aggregateType' | 'aggregateId' | 'eventType' | 'eventSequence'
>): string {
  return bytesToHex(sha256(new TextEncoder().encode([
    input.space,
    input.commandId,
    input.aggregateType,
    input.aggregateId,
    input.eventType,
    input.eventSequence,
  ].join(UNIT_SEPARATOR))));
}

function createMemoryId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function mapEventRow(row: Record<string, unknown>): MemoryEventRecord {
  return {
    actorId: (row.actorId as string | null) ?? null,
    actorType: row.actorType as MemoryEventRecord['actorType'],
    aggregateId: String(row.aggregateId),
    aggregateType: row.aggregateType as MemoryEventRecord['aggregateType'],
    commandId: String(row.commandId),
    createdAt: String(row.createdAt),
    eventType: String(row.eventType),
    eventVersion: Number(row.eventVersion),
    evidenceIdsJson: String(row.evidenceIdsJson ?? '[]'),
    id: String(row.id),
    idempotencyKey: String(row.idempotencyKey),
    payloadJson: String(row.payloadJson),
    projectionVersion: Number(row.projectionVersion),
    source: String(row.source),
    space: row.space as MemorySpace,
  };
}

export async function appendMemoryEvent(
  db: SQLiteDatabase,
  input: MemoryEventInput
): Promise<{ event: MemoryEventRecord; inserted: boolean }> {
  const idempotencyKey = deriveMemoryEventIdempotencyKey(input);
  const existing = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM memory_events WHERE idempotencyKey = ?',
    idempotencyKey
  );
  if (existing) {
    return { event: mapEventRow(existing), inserted: false };
  }
  const aggregateVersion = input.eventVersion ?? (
    (await db.getFirstAsync<{ version: number }>(
      `SELECT COALESCE(MAX(eventVersion), 0) AS version
       FROM memory_events
       WHERE space = ? AND aggregateType = ? AND aggregateId = ?`,
      input.space,
      input.aggregateType,
      input.aggregateId
    ))?.version ?? 0
  ) + 1;

  const event: MemoryEventRecord = {
    actorId: input.actorId ?? null,
    actorType: input.actorType,
    aggregateId: input.aggregateId,
    aggregateType: input.aggregateType,
    commandId: input.commandId,
    createdAt: input.createdAt ?? createTimestamp(),
    eventType: input.eventType,
    eventVersion: aggregateVersion,
    evidenceIdsJson: JSON.stringify(input.evidenceIds ?? []),
    id: input.id ?? createMemoryId('mevent'),
    idempotencyKey,
    payloadJson: JSON.stringify(input.payload ?? null),
    projectionVersion: input.projectionVersion,
    source: input.source,
    space: input.space,
  };

  await db.runAsync(
    `INSERT INTO memory_events (
      id, space, aggregateType, aggregateId, eventType, eventVersion,
      commandId, idempotencyKey, actorType, actorId, source, payloadJson,
      evidenceIdsJson, createdAt, projectionVersion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    event.id,
    event.space,
    event.aggregateType,
    event.aggregateId,
    event.eventType,
    event.eventVersion,
    event.commandId,
    event.idempotencyKey,
    event.actorType,
    event.actorId,
    event.source,
    event.payloadJson,
    event.evidenceIdsJson,
    event.createdAt,
    event.projectionVersion
  );

  return { event, inserted: true };
}

export async function listMemoryEvents(
  db: SQLiteDatabase,
  input: { space: MemorySpace; afterProjectionVersion?: number; aggregateId?: string }
): Promise<MemoryEventRecord[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    input.aggregateId
      ? `SELECT * FROM memory_events
         WHERE space = ? AND aggregateId = ? AND projectionVersion > ?
         ORDER BY projectionVersion ASC, eventVersion ASC, createdAt ASC`
      : `SELECT * FROM memory_events
         WHERE space = ? AND projectionVersion > ?
         ORDER BY projectionVersion ASC, eventVersion ASC, createdAt ASC`,
    ...(input.aggregateId
      ? [input.space, input.aggregateId, input.afterProjectionVersion ?? -1]
      : [input.space, input.afterProjectionVersion ?? -1])
  );
  return rows.map(mapEventRow);
}

export async function getMemoryProjectionMeta(
  db: SQLiteDatabase,
  space: MemorySpace
): Promise<MemoryProjectionMeta> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM memory_projection_meta WHERE space = ?',
    space
  );
  if (!row) {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO memory_projection_meta
       (space, projectionVersion, memoryEpoch, ontologyVersion, retrievalScorerVersion, updatedAt)
       VALUES (?, 0, 0, 'ontology-v1', 'retrieval-v1', ?)`,
      space,
      now
    );
    return {
      lastRebuiltAt: null,
      memoryEpoch: 0,
      ontologyVersion: 'ontology-v1',
      projectionVersion: 0,
      retrievalScorerVersion: 'retrieval-v1',
      space,
      updatedAt: now,
    };
  }
  return {
    lastRebuiltAt: (row.lastRebuiltAt as string | null) ?? null,
    memoryEpoch: Number(row.memoryEpoch),
    ontologyVersion: String(row.ontologyVersion),
    projectionVersion: Number(row.projectionVersion),
    retrievalScorerVersion: String(row.retrievalScorerVersion),
    space,
    updatedAt: String(row.updatedAt),
  };
}

export async function advanceMemoryProjectionMeta(
  db: SQLiteDatabase,
  space: MemorySpace,
  options: { incrementEpoch?: boolean; projectionVersion?: number }
): Promise<MemoryProjectionMeta> {
  const current = await getMemoryProjectionMeta(db, space);
  const now = createTimestamp();
  const nextVersion = options.projectionVersion ?? current.projectionVersion + 1;
  const nextEpoch = current.memoryEpoch + (options.incrementEpoch ? 1 : 0);
  await db.runAsync(
    `UPDATE memory_projection_meta
     SET projectionVersion = ?, memoryEpoch = ?, updatedAt = ?
     WHERE space = ?`,
    nextVersion,
    nextEpoch,
    now,
    space
  );
  return { ...current, memoryEpoch: nextEpoch, projectionVersion: nextVersion, updatedAt: now };
}
