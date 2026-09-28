import type { SQLiteDatabase } from 'expo-sqlite';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import {
  getDatabase,
  runWithDatabaseSpace,
  type PixorySpace,
} from '../../database';
import { createTimestamp } from '../../database/utils';
import {
  appendMemoryEvent,
  advanceMemoryProjectionMeta,
  deriveMemoryCommandAggregateId,
  getMemoryProjectionMeta,
} from './memoryEventRepository';
import {
  applyMemoryEventAndAdvance,
  findMemoryClaimById,
  rebuildMemoryProjections,
} from './memoryProjectionService';
import { buildCanonicalClaimId } from './memoryCanonicalization';
import type {
  MemoryClaimInput,
  MemoryClaimRecord,
  MemoryEpisodeRecord,
  MemoryEventRecord,
  MemoryLane,
  MemoryProfileRecord,
  MemoryRelationalStateRecord,
  MemoryScopeType,
  MemorySpace,
} from './memoryTypes';
import { resolveConfirmationGovernance } from './memoryTypes';

function createMemoryId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureCommandId(commandId?: string): string {
  return commandId?.trim() || createMemoryId('mcmd');
}

interface MemoryCommandOptions {
  commandId?: string;
  actorId?: string | null;
  source?: string;
  expectedVersion?: number;
}

function hashMemoryValue(value: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(value)));
}

function assertExpectedVersion(claim: MemoryClaimRecord, expectedVersion?: number): void {
  if (expectedVersion != null && claim.version !== expectedVersion) {
    throw new Error('memory_claim_version_conflict');
  }
}

async function recordMessageEvidence(
  db: SQLiteDatabase,
  claim: MemoryClaimRecord,
  sourceMessageId: string | null
): Promise<{ evidenceId: string | null; inserted: boolean; directEvidenceCount: number }> {
  if (!sourceMessageId) {
    return { directEvidenceCount: 0, evidenceId: null, inserted: false };
  }
  const evidenceId = `mevidence_${hashMemoryValue(
    [claim.space, claim.id, sourceMessageId].join('\u001F')
  ).slice(0, 32)}`;
  const sourceMessage = await db.getFirstAsync<{ role: string | null; content: string | null }>(
    `SELECT ai_messages.role, ai_messages.content
     FROM ai_messages
     INNER JOIN ai_threads ON ai_threads.id = ai_messages.threadId
     WHERE ai_messages.id = ? AND ai_threads.space = ?
     LIMIT 1`,
    sourceMessageId,
    claim.space
  );
  const quote = typeof sourceMessage?.content === 'string'
    ? sourceMessage.content.slice(0, 2000)
    : '';
  const quoteHash = hashMemoryValue(quote);
  const result = await db.runAsync(
    `INSERT OR IGNORE INTO memory_evidence (
       id, space, sourceType, sourceId, messageId, role, quote, quoteHash, createdAt
     ) VALUES (?, ?, 'message', ?, ?, ?, ?, ?, ?)`,
    evidenceId,
    claim.space,
    sourceMessageId,
    sourceMessageId,
    sourceMessage?.role === 'assistant' ? 'assistant' : 'user',
    quote,
    quoteHash,
    createTimestamp()
  );
  const count = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(DISTINCT sourceId) AS count
     FROM memory_evidence
     WHERE space = ? AND sourceType = 'message' AND deletedAt IS NULL
       AND id IN (
         SELECT value
         FROM json_each((
           SELECT json_group_array(value)
           FROM memory_events, json_each(memory_events.evidenceIdsJson)
           WHERE memory_events.space = ?
             AND memory_events.aggregateType = 'claim'
             AND memory_events.aggregateId = ?
         ))
       )`,
    claim.space,
    claim.space,
    claim.id
  ).catch(() => null);
  return {
    directEvidenceCount: Math.max(Number(count?.count ?? 0), result.changes > 0 ? 1 : 0),
    evidenceId,
    inserted: result.changes > 0,
  };
}

function buildClaimRecord(
  input: MemoryClaimInput,
  projectionVersion: number
): MemoryClaimRecord {
  const now = createTimestamp();
  const subjectEntityId = input.subjectEntityId ?? 'user';
  const predicate = input.predicate;
  const valueDisplay = input.valueDisplay ?? input.valueNormalized;
  const canonicalClaimId = input.canonicalClaimId ?? buildCanonicalClaimId({
    canonicalObject: input.valueNormalized,
    polarity: input.polarity ?? 'positive',
    predicate,
    privacyDomain: input.space,
    schemaVersion: 1,
    scopeId: input.scopeId,
    scopeType: input.scopeType,
    subjectEntityId,
    validTimeBucket: input.validFrom ?? input.validPrecision ?? 'unknown',
  });
  const requestedLane = input.lane ?? 'working';
  // A safety candidate cannot enter Confirmed merely because an importer or
  // extractor supplied a high lane; it needs an explicit user confirmation.
  const lane = input.safetyState === 'safety_pending' && requestedLane === 'confirmed'
    ? 'working'
    : requestedLane;
  const defaultStatus = lane === 'confirmed' ? 'confirmed' : lane === 'archive' ? 'stale' : 'committed';
  return {
    actor: input.actor ?? 'user',
    canonicalClaimId,
    confidenceBand: input.confidenceBand ?? 'medium',
    confidenceCalibrated: input.confidenceCalibrated ?? null,
    confidenceRaw: input.confidenceRaw ?? 0.7,
    createdAt: now,
    deletedAt: null,
    id: input.id ?? createMemoryId('mclaim'),
    importance: Math.max(0, Math.min(100, input.importance ?? 30)),
    kind: input.kind,
    lane,
    lastUsedAt: null,
    manualLocked: input.manualLocked ?? false,
    ontologyVersion: input.ontologyVersion ?? 'ontology-v1',
    polarity: input.polarity ?? 'positive',
    predicate,
    projectionVersion,
    rawTimePhrase: input.rawTimePhrase ?? null,
    relatedClaimGroupId: input.relatedClaimGroupId ?? null,
    safetyState: input.safetyState ?? 'none',
    schemaVersion: 1,
    scopeId: input.scopeId ?? null,
    scopeType: input.scopeType,
    sourceKind: input.sourceKind ?? 'message',
    sourceMessageId: input.sourceMessageId ?? null,
    space: input.space,
    speechMode: input.speechMode ?? 'asserted',
    stability: input.stability ?? 'short',
    status: input.status ?? defaultStatus,
    subjectDisplay: input.subjectDisplay ?? subjectEntityId,
    subjectEntityId,
    supersededByClaimId: null,
    updatedAt: now,
    validFrom: input.validFrom ?? null,
    validPrecision: input.validPrecision ?? 'unknown',
    validTo: input.validTo ?? null,
    valueDisplay,
    valueNormalized: input.valueNormalized,
    version: 1,
    extractorVersion: input.extractorVersion ?? 'memory-facade-v1',
  };
}

async function enqueueMemoryOutbox(
  db: SQLiteDatabase,
  input: {
    space: MemorySpace;
    eventId: string;
    taskType: string;
    idempotencyKey: string;
  }
): Promise<void> {
  const now = createTimestamp();
  await db.runAsync(
    `INSERT OR IGNORE INTO memory_outbox (
      id, space, eventId, taskType, status, idempotencyKey,
      retryCount, nextRunAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, 'pending', ?, 0, ?, ?, ?)`,
    createMemoryId('moutbox'),
    input.space,
    input.eventId,
    input.taskType,
    input.idempotencyKey,
    now,
    now,
    now
  );
}

async function appendAndProject(
  db: SQLiteDatabase,
  input: Parameters<typeof appendMemoryEvent>[1],
  options: { incrementEpoch?: boolean; outboxTaskType?: string } = {}
): Promise<MemoryEventRecord> {
  const result = await appendMemoryEvent(db, input);
  if (result.inserted) {
    await applyMemoryEventAndAdvance(db, result.event, {
      incrementEpoch: options.incrementEpoch ?? true,
    });
    if (options.outboxTaskType) {
      await enqueueMemoryOutbox(db, {
        eventId: result.event.id,
        idempotencyKey: `${result.event.id}:${options.outboxTaskType}`,
        space: input.space,
        taskType: options.outboxTaskType,
      });
    }
  }
  return result.event;
}

export async function createClaim(
  input: MemoryClaimInput,
  options: MemoryCommandOptions = {}
): Promise<MemoryClaimRecord> {
  let createdClaim: MemoryClaimRecord | null = null;
  await runWithDatabaseSpace(input.space, async (db) => {
    await db.withTransactionAsync(async () => {
      const commandId = ensureCommandId(options.commandId);
      const meta = await getMemoryProjectionMeta(db, input.space);
      const claim = buildClaimRecord({
        ...input,
        id: input.id ?? deriveMemoryCommandAggregateId('mclaim', input.space, commandId, 'create'),
      }, meta.projectionVersion + 1);
      const replayedClaim = await findMemoryClaimById(db, input.space, claim.id);
      if (replayedClaim) {
        createdClaim = replayedClaim;
        return;
      }
      const tombstoned = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM memory_claims
         WHERE space = ? AND canonicalClaimId = ? AND scopeType = ?
           AND COALESCE(scopeId, '∅') = COALESCE(?, '∅')
           AND status IN ('deleted', 'suppressed')
         LIMIT 1`,
        input.space,
        claim.canonicalClaimId,
        claim.scopeType,
        claim.scopeId
      );
      const explicitManualRecreate = input.sourceKind === 'manual' && options.actorId === 'user';
      if (tombstoned && !explicitManualRecreate) {
        throw new Error('memory_claim_tombstoned');
      }
      const existing = await db.getFirstAsync<Record<string, unknown>>(
        `SELECT id FROM memory_claims
         WHERE space = ? AND canonicalClaimId = ? AND scopeType = ?
           AND COALESCE(scopeId, '∅') = COALESCE(?, '∅')
           AND status IN ('tentative', 'committed', 'confirmed', 'conflicted')
           AND deletedAt IS NULL`,
        input.space,
        claim.canonicalClaimId,
        claim.scopeType,
        claim.scopeId
      );
      if (existing?.id) {
        const current = await findMemoryClaimById(db, input.space, String(existing.id));
        if (!current) {
          throw new Error('memory_claim_projection_missing');
        }
        if (current.id === claim.id) {
          createdClaim = current;
          return;
        }
        const alreadyLinked = input.sourceMessageId
          ? await db.getFirstAsync<{ id: string }>(
            `SELECT id FROM memory_evidence
             WHERE space = ? AND sourceType = 'message' AND sourceId = ? AND deletedAt IS NULL
               AND EXISTS (
                 SELECT 1 FROM memory_events event
                 WHERE event.space = ? AND event.aggregateId = ?
                   AND instr(event.evidenceIdsJson, memory_evidence.id) > 0
               )`,
            input.space,
            input.sourceMessageId,
            input.space,
            current.id
          )
          : null;
        if (alreadyLinked) {
          createdClaim = current;
          return;
        }
        const evidence = await recordMessageEvidence(db, current, input.sourceMessageId ?? null);
        const priorEvidenceCount = await db.getFirstAsync<{ count: number }>(
          `SELECT COUNT(DISTINCT e.sourceId) AS count
           FROM memory_events event
           JOIN json_each(event.evidenceIdsJson) ids
           JOIN memory_evidence e ON e.id = ids.value
           WHERE event.space = ? AND event.aggregateId = ?
             AND e.sourceType = 'message' AND e.deletedAt IS NULL`,
          input.space,
          current.id
        );
        const directEvidenceCount = Number(priorEvidenceCount?.count ?? 0) + (evidence.inserted ? 1 : 0);
        const highByEvidence = directEvidenceCount >= 2
          || (current.speechMode === 'corrected' && directEvidenceCount >= 1)
          || current.manualLocked;
        const confidenceBand = highByEvidence ? 'high' : current.confidenceBand;
        const canPromote = confidenceBand === 'high'
          && current.importance >= 60
          && !['joke', 'quoted', 'hypothetical', 'roleplay', 'uncertain'].includes(current.speechMode)
          && current.safetyState !== 'safety_pending';
        const replacement: MemoryClaimRecord = {
          ...current,
          confidenceBand,
          lane: canPromote ? 'confirmed' : current.lane,
          projectionVersion: meta.projectionVersion + 1,
          status: canPromote ? 'confirmed' : current.status,
          updatedAt: createTimestamp(),
          version: current.version + 1,
        };
        await appendAndProject(db, {
          actorId: options.actorId ?? null,
          actorType: input.sourceKind === 'manual' ? 'user' : 'system',
          aggregateId: current.id,
          aggregateType: 'claim',
          commandId,
          eventSequence: 0,
          eventType: 'claim_evidence_added',
          evidenceIds: evidence.evidenceId ? [evidence.evidenceId] : [],
          payload: { claim: replacement },
          projectionVersion: replacement.projectionVersion,
          source: options.source ?? 'memory_facade',
          space: input.space,
        }, { outboxTaskType: 'memory_embedding_upsert' });
        createdClaim = replacement;
        return;
      }
      const evidence = await recordMessageEvidence(db, claim, input.sourceMessageId ?? null);
      await appendAndProject(db, {
        actorId: options.actorId ?? null,
        actorType: input.sourceKind === 'manual' ? 'user' : 'system',
        aggregateId: claim.id,
        aggregateType: 'claim',
        commandId,
        eventSequence: 0,
        eventType: 'claim_created',
        evidenceIds: evidence.evidenceId ? [evidence.evidenceId] : [],
        payload: { claim },
        projectionVersion: claim.projectionVersion,
        source: options.source ?? 'memory_facade',
        space: input.space,
      }, { outboxTaskType: 'memory_embedding_upsert' });
      createdClaim = claim;
    });
  });
  if (!createdClaim) {
    throw new Error('memory_claim_create_failed');
  }
  return createdClaim;
}

export async function editClaim(
  input: {
    space: MemorySpace;
    claimId: string;
    patch: MemoryClaimInput;
  },
  options: MemoryCommandOptions = {}
): Promise<MemoryClaimRecord> {
  let replacementClaim: MemoryClaimRecord | null = null;
  await runWithDatabaseSpace(input.space, async (db) => {
    await db.withTransactionAsync(async () => {
      const current = await findMemoryClaimById(db, input.space, input.claimId);
      if (!current) {
        throw new Error('memory_claim_not_found');
      }
      assertExpectedVersion(current, options.expectedVersion);
      if (current.manualLocked && options.actorId !== 'user') {
        throw new Error('memory_claim_manual_locked');
      }
      const commandId = ensureCommandId(options.commandId);
      const meta = await getMemoryProjectionMeta(db, input.space);
      const replacementId = input.patch.id
        ?? deriveMemoryCommandAggregateId('mclaim', input.space, commandId, 'edit');
      const existingReplacement = await findMemoryClaimById(db, input.space, replacementId);
      if (existingReplacement) {
        replacementClaim = existingReplacement;
        return;
      }
      const merged = {
        ...current,
        ...input.patch,
        id: replacementId,
        scopeId: input.patch.scopeId ?? current.scopeId,
        scopeType: input.patch.scopeType ?? current.scopeType,
        sourceMessageId: input.patch.sourceMessageId ?? current.sourceMessageId,
        space: input.space,
        valueDisplay: input.patch.valueDisplay ?? current.valueDisplay,
        valueNormalized: input.patch.valueNormalized ?? current.valueNormalized,
      };
      const replacement = buildClaimRecord({
        ...merged,
        canonicalClaimId: input.patch.canonicalClaimId ?? buildCanonicalClaimId({
          canonicalObject: merged.valueNormalized,
          polarity: merged.polarity,
          predicate: merged.predicate,
          privacyDomain: input.space,
          schemaVersion: 1,
          scopeId: merged.scopeId,
          scopeType: merged.scopeType,
          subjectEntityId: merged.subjectEntityId,
          validTimeBucket: merged.validFrom ?? merged.validPrecision,
        }),
      }, meta.projectionVersion + 2);
      await appendAndProject(db, {
        actorId: options.actorId ?? null,
        actorType: 'user',
        aggregateId: current.id,
        aggregateType: 'claim',
        commandId,
        eventSequence: 0,
        eventType: 'claim_superseded',
        payload: { supersededByClaimId: replacement.id },
        projectionVersion: meta.projectionVersion + 1,
        source: options.source ?? 'memory_facade',
        space: input.space,
      });
      await appendAndProject(db, {
        actorId: options.actorId ?? null,
        actorType: 'user',
        aggregateId: replacement.id,
        aggregateType: 'claim',
        commandId,
        eventSequence: 1,
        eventType: 'claim_edited',
        payload: { claim: replacement, supersedesClaimId: current.id },
        projectionVersion: meta.projectionVersion + 2,
        source: options.source ?? 'memory_facade',
        space: input.space,
      }, { outboxTaskType: 'memory_embedding_upsert' });
      replacementClaim = replacement;
    });
  });
  if (!replacementClaim) {
    throw new Error('memory_claim_edit_failed');
  }
  return replacementClaim;
}

export async function confirmClaim(
  input: { space: MemorySpace; claimId: string },
  options: MemoryCommandOptions = {}
): Promise<void> {
  await updateClaimState(input, 'confirmed', 'confirmed', options);
}

export async function suppressClaim(
  input: { space: MemorySpace; claimId: string },
  options: MemoryCommandOptions = {}
): Promise<void> {
  await updateClaimState(input, 'suppressed', 'archive', options);
}

export async function conflictClaim(
  input: { space: MemorySpace; claimId: string; reason?: string },
  options: MemoryCommandOptions = {}
): Promise<void> {
  await runWithDatabaseSpace(input.space, (db) => db.withTransactionAsync(async () => {
    const current = await findMemoryClaimById(db, input.space, input.claimId);
    if (!current) {
      throw new Error('memory_claim_not_found');
    }
    assertExpectedVersion(current, options.expectedVersion);
    const meta = await getMemoryProjectionMeta(db, input.space);
    const replacement: MemoryClaimRecord = {
      ...current,
      lane: 'working',
      status: 'conflicted',
      updatedAt: createTimestamp(),
      version: current.version + 1,
      projectionVersion: meta.projectionVersion + 1,
    };
    await appendAndProject(db, {
      actorId: options.actorId ?? null,
      actorType: 'system',
      aggregateId: current.id,
      aggregateType: 'claim',
      commandId: ensureCommandId(options.commandId),
      eventSequence: 0,
      eventType: 'claim_conflicted',
      payload: { claim: replacement, reason: input.reason ?? 'conflicting evidence' },
      projectionVersion: replacement.projectionVersion,
      source: options.source ?? 'memory_facade',
      space: input.space,
    }, { incrementEpoch: true });
  }));
}

export async function deleteClaim(
  input: { space: MemorySpace; claimId: string },
  options: MemoryCommandOptions = {}
): Promise<void> {
  await runWithDatabaseSpace(input.space, async (db) => db.withTransactionAsync(async () => {
    const current = await findMemoryClaimById(db, input.space, input.claimId);
    if (!current) {
      return;
    }
    assertExpectedVersion(current, options.expectedVersion);
    if (current.manualLocked && options.actorId !== 'user') {
      throw new Error('memory_claim_manual_locked');
    }
    const meta = await getMemoryProjectionMeta(db, input.space);
    const event = await appendAndProject(db, {
      actorId: options.actorId ?? null,
      actorType: options.actorId === 'user' ? 'user' : 'system',
      aggregateId: current.id,
      aggregateType: 'claim',
      commandId: ensureCommandId(options.commandId),
      eventSequence: 0,
      eventType: 'claim_deleted',
      payload: { claimId: current.id },
      projectionVersion: meta.projectionVersion + 1,
      source: options.source ?? 'memory_facade',
      space: input.space,
    }, { incrementEpoch: true });
    await db.runAsync('DELETE FROM memory_embeddings WHERE claimId = ? AND space = ?', current.id, input.space);
    await enqueueMemoryOutbox(db, {
      eventId: event.id,
      idempotencyKey: `${event.id}:memory_delete_indexes`,
      space: input.space,
      taskType: 'memory_delete_indexes',
    });
    await db.runAsync(
      `INSERT OR IGNORE INTO memory_deletion_certificates
       (id, space, commandId, targetClaimIdsJson, projectionCleared, ftsCleared,
        embeddingCleared, graphCleared, cacheEpochAdvanced, exportCleared,
        providerCacheLimitation, createdAt)
       VALUES (?, ?, ?, ?, 1, 1, 1, 1, 1, 1, ?, ?)`,
      createMemoryId('mdelete'),
      input.space,
      event.commandId,
      JSON.stringify([current.id]),
      'Provider 缓存无法主动物理删除；已递增 memoryEpoch，后续请求不会复用旧快照。',
      createTimestamp()
    );
  }));
}

export async function forgetByCanonicalId(
  input: { space: MemorySpace; canonicalClaimId: string },
  options: MemoryCommandOptions = {}
): Promise<number> {
  const rows = await runWithDatabaseSpace(input.space, (db) =>
    db.getAllAsync<{ id: string }>(
      `SELECT id FROM memory_claims
       WHERE space = ? AND canonicalClaimId = ? AND status NOT IN ('deleted', 'suppressed')`,
      input.space,
      input.canonicalClaimId
    )
  );
  const commandId = ensureCommandId(options.commandId);
  for (const [sequence, row] of rows.entries()) {
    await deleteClaim({ claimId: row.id, space: input.space }, {
      ...options,
      commandId: `${commandId}:${sequence}`,
    });
  }
  return rows.length;
}

async function updateClaimState(
  input: { space: MemorySpace; claimId: string },
  status: 'confirmed' | 'stale' | 'suppressed',
  lane: MemoryLane,
  options: MemoryCommandOptions
): Promise<void> {
  await runWithDatabaseSpace(input.space, async (db) => db.withTransactionAsync(async () => {
    const current = await findMemoryClaimById(db, input.space, input.claimId);
    if (!current) {
      throw new Error('memory_claim_not_found');
    }
    assertExpectedVersion(current, options.expectedVersion);
    if (current.manualLocked && options.actorId !== 'user') {
      throw new Error('memory_claim_manual_locked');
    }
    const meta = await getMemoryProjectionMeta(db, input.space);
    const confirmationGovernance = status === 'confirmed'
      ? resolveConfirmationGovernance(current, options.actorId === 'user' ? 'user' : 'system')
      : { manualLocked: current.manualLocked, safetyState: current.safetyState };
    const replacement: MemoryClaimRecord = {
      ...current,
      deletedAt: status === 'confirmed' ? null : current.deletedAt,
      lane,
      status,
      updatedAt: createTimestamp(),
      version: current.version + 1,
      projectionVersion: meta.projectionVersion + 1,
      manualLocked: confirmationGovernance.manualLocked,
      safetyState: confirmationGovernance.safetyState,
    };
    const eventType = status === 'confirmed'
      ? current.status === 'deleted' ? 'claim_restored' : 'claim_confirmed'
      : status === 'stale' ? 'claim_staled'
        : 'claim_suppressed';
    await appendAndProject(db, {
      actorId: options.actorId ?? null,
      actorType: options.actorId === 'user' ? 'user' : 'system',
      aggregateId: current.id,
      aggregateType: 'claim',
      commandId: ensureCommandId(options.commandId),
      eventSequence: 0,
      eventType,
      payload: { claim: replacement },
      projectionVersion: replacement.projectionVersion,
      source: options.source ?? 'memory_facade',
      space: input.space,
    }, { incrementEpoch: status === 'suppressed' });
  }));
}

export async function restoreClaim(
  input: { space: MemorySpace; claimId: string },
  options: MemoryCommandOptions = {}
): Promise<void> {
  await updateClaimState(input, 'confirmed', 'confirmed', options);
}

export async function staleClaim(
  input: { space: MemorySpace; claimId: string },
  options: MemoryCommandOptions = {}
): Promise<void> {
  await updateClaimState(input, 'stale', 'archive', options);
}

export async function changeClaimScope(
  input: {
    space: MemorySpace;
    claimId: string;
    scopeType: MemoryScopeType;
    scopeId: string | null;
  },
  options: MemoryCommandOptions = {}
): Promise<MemoryClaimRecord> {
  const current = await runWithDatabaseSpace(input.space, (db) =>
    findMemoryClaimById(db, input.space, input.claimId)
  );
  if (!current) {
    throw new Error('memory_claim_not_found');
  }
  return editClaim({
    claimId: input.claimId,
    patch: {
      ...current,
      canonicalClaimId: undefined,
      id: undefined,
      scopeId: input.scopeId,
      scopeType: input.scopeType,
    },
    space: input.space,
  }, options);
}

export async function upsertEpisode(
  input: MemoryEpisodeRecord,
  options: MemoryCommandOptions = {}
): Promise<MemoryEpisodeRecord> {
  let projected: MemoryEpisodeRecord | null = null;
  await runWithDatabaseSpace(input.space, (db) => db.withTransactionAsync(async () => {
    const meta = await getMemoryProjectionMeta(db, input.space);
    const episode = {
      ...input,
      projectionVersion: meta.projectionVersion + 1,
      updatedAt: createTimestamp(),
    };
    await appendAndProject(db, {
      actorId: options.actorId ?? null,
      actorType: options.source === 'native_memory_package' || options.source === 'external_import_review' ? 'import' : 'system',
      aggregateId: episode.id,
      aggregateType: 'episode',
      commandId: ensureCommandId(options.commandId),
      eventSequence: 0,
      eventType: 'episode_upserted',
      payload: { episode },
      projectionVersion: episode.projectionVersion,
      source: options.source ?? 'memory_facade',
      space: input.space,
    });
    projected = episode;
  }));
  if (!projected) throw new Error('memory_episode_upsert_failed');
  return projected;
}

export async function upsertRelationalState(
  input: MemoryRelationalStateRecord,
  options: MemoryCommandOptions = {}
): Promise<MemoryRelationalStateRecord> {
  let projected: MemoryRelationalStateRecord | null = null;
  await runWithDatabaseSpace(input.space, (db) => db.withTransactionAsync(async () => {
    const meta = await getMemoryProjectionMeta(db, input.space);
    const relation = {
      ...input,
      projectionVersion: meta.projectionVersion + 1,
      updatedAt: createTimestamp(),
    };
    await appendAndProject(db, {
      actorId: options.actorId ?? null,
      actorType: options.source === 'native_memory_package' ? 'import' : 'system',
      aggregateId: relation.id,
      aggregateType: 'relation',
      commandId: ensureCommandId(options.commandId),
      eventSequence: 0,
      eventType: 'relation_upserted',
      payload: { relation },
      projectionVersion: relation.projectionVersion,
      source: options.source ?? 'memory_facade',
      space: input.space,
    });
    projected = relation;
  }));
  if (!projected) throw new Error('memory_relation_upsert_failed');
  return projected;
}

export async function upsertProfile(
  input: MemoryProfileRecord,
  options: MemoryCommandOptions = {}
): Promise<MemoryProfileRecord> {
  let projected: MemoryProfileRecord | null = null;
  await runWithDatabaseSpace(input.space, (db) => db.withTransactionAsync(async () => {
    const meta = await getMemoryProjectionMeta(db, input.space);
    const profile = {
      ...input,
      projectionVersion: meta.projectionVersion + 1,
      updatedAt: createTimestamp(),
    };
    await appendAndProject(db, {
      actorId: options.actorId ?? null,
      actorType: options.source === 'native_memory_package' ? 'import' : 'system',
      aggregateId: profile.id,
      aggregateType: 'import',
      commandId: ensureCommandId(options.commandId),
      eventSequence: 0,
      eventType: 'profile_upserted',
      payload: { profile },
      projectionVersion: profile.projectionVersion,
      source: options.source ?? 'memory_facade',
      space: input.space,
    });
    projected = profile;
  }));
  if (!projected) throw new Error('memory_profile_upsert_failed');
  return projected;
}

async function deleteProjectionAggregate(
  input: {
    space: MemorySpace;
    id: string;
    aggregateType: MemoryEventRecord['aggregateType'];
    eventType: 'episode_deleted' | 'relation_deleted' | 'profile_deleted';
  },
  options: MemoryCommandOptions
): Promise<void> {
  await runWithDatabaseSpace(input.space, (db) => db.withTransactionAsync(async () => {
    const meta = await getMemoryProjectionMeta(db, input.space);
    await appendAndProject(db, {
      actorId: options.actorId ?? null,
      actorType: 'system',
      aggregateId: input.id,
      aggregateType: input.aggregateType,
      commandId: ensureCommandId(options.commandId),
      eventSequence: 0,
      eventType: input.eventType,
      payload: { id: input.id },
      projectionVersion: meta.projectionVersion + 1,
      source: options.source ?? 'memory_facade',
      space: input.space,
    }, { incrementEpoch: true });
  }));
}

export async function deleteEpisode(
  input: { space: MemorySpace; episodeId: string },
  options: MemoryCommandOptions = {}
): Promise<void> {
  return deleteProjectionAggregate({
    aggregateType: 'episode',
    eventType: 'episode_deleted',
    id: input.episodeId,
    space: input.space,
  }, options);
}

export async function deleteRelationalState(
  input: { space: MemorySpace; relationalStateId: string },
  options: MemoryCommandOptions = {}
): Promise<void> {
  return deleteProjectionAggregate({
    aggregateType: 'relation',
    eventType: 'relation_deleted',
    id: input.relationalStateId,
    space: input.space,
  }, options);
}

export async function deleteProfile(
  input: { space: MemorySpace; profileId: string },
  options: MemoryCommandOptions = {}
): Promise<void> {
  return deleteProjectionAggregate({
    aggregateType: 'import',
    eventType: 'profile_deleted',
    id: input.profileId,
    space: input.space,
  }, options);
}

export async function rebuild(space: PixorySpace): Promise<void> {
  const db = await getDatabase(space);
  await db.withTransactionAsync(async () => {
    await rebuildMemoryProjections(db, space);
  });
}

export async function getProjectionMeta(space: PixorySpace) {
  return runWithDatabaseSpace(space, (db) => getMemoryProjectionMeta(db, space));
}

export async function touchClaims(
  space: MemorySpace,
  claimIds: string[],
  usedAt = createTimestamp()
): Promise<void> {
  const ids = [...new Set(claimIds.filter(Boolean))];
  if (ids.length === 0) return;
  await runWithDatabaseSpace(space, (db) => db.runAsync(
    `UPDATE memory_claims
     SET lastUsedAt = ?
     WHERE space = ? AND id IN (${ids.map(() => '?').join(', ')})`,
    usedAt,
    space,
    ...ids
  ).then(() => undefined));
}

export const MemoryFacade = {
  changeClaimScope,
  conflictClaim,
  confirmClaim,
  createClaim,
  deleteClaim,
  deleteEpisode,
  deleteProfile,
  deleteRelationalState,
  editClaim,
  forgetByCanonicalId,
  getProjectionMeta,
  rebuild,
  restoreClaim,
  staleClaim,
  suppressClaim,
  touchClaims,
  upsertEpisode,
  upsertProfile,
  upsertRelationalState,
};
