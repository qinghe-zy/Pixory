import type { SQLiteDatabase } from 'expo-sqlite';

import { createTimestamp } from '../../database/utils';
import {
  advanceMemoryProjectionMeta,
  getMemoryProjectionMeta,
  listMemoryEvents,
} from './memoryEventRepository';
import type {
  MemoryClaimRecord,
  MemoryEpisodeRecord,
  MemoryEventRecord,
  MemoryProfileRecord,
  MemoryRelationalStateRecord,
  MemorySpace,
  MemoryStatus,
} from './memoryTypes';
import { resolveCalibratedConfidence } from './memoryTypes';

function parsePayload(event: MemoryEventRecord): Record<string, unknown> {
  try {
    const value = JSON.parse(event.payloadJson);
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function mapClaimRow(row: Record<string, unknown>): MemoryClaimRecord {
  return {
    actor: row.actor as MemoryClaimRecord['actor'],
    canonicalClaimId: String(row.canonicalClaimId),
    confidenceBand: row.confidenceBand as MemoryClaimRecord['confidenceBand'],
    confidenceCalibrated: row.confidenceCalibrated == null ? null : Number(row.confidenceCalibrated),
    confidenceRaw: Number(row.confidenceRaw),
    createdAt: String(row.createdAt),
    deletedAt: (row.deletedAt as string | null) ?? null,
    id: String(row.id),
    importance: Number(row.importance),
    kind: row.kind as MemoryClaimRecord['kind'],
    lane: row.lane as MemoryClaimRecord['lane'],
    lastUsedAt: (row.lastUsedAt as string | null) ?? null,
    manualLocked: Number(row.manualLocked) === 1,
    ontologyVersion: String(row.ontologyVersion),
    polarity: row.polarity as MemoryClaimRecord['polarity'],
    predicate: String(row.predicate),
    projectionVersion: Number(row.projectionVersion),
    rawTimePhrase: (row.rawTimePhrase as string | null) ?? null,
    relatedClaimGroupId: (row.relatedClaimGroupId as string | null) ?? null,
    safetyState: row.safetyState as MemoryClaimRecord['safetyState'],
    schemaVersion: Number(row.schemaVersion),
    scopeId: (row.scopeId as string | null) ?? null,
    scopeType: row.scopeType as MemoryClaimRecord['scopeType'],
    space: row.space as MemorySpace,
    speechMode: row.speechMode as MemoryClaimRecord['speechMode'],
    stability: row.stability as MemoryClaimRecord['stability'],
    status: row.status as MemoryStatus,
    subjectDisplay: String(row.subjectDisplay),
    subjectEntityId: String(row.subjectEntityId),
    supersededByClaimId: (row.supersededByClaimId as string | null) ?? null,
    updatedAt: String(row.updatedAt),
    validFrom: (row.validFrom as string | null) ?? null,
    validPrecision: row.validPrecision as MemoryClaimRecord['validPrecision'],
    validTo: (row.validTo as string | null) ?? null,
    valueDisplay: String(row.valueDisplay),
    valueNormalized: String(row.valueNormalized),
    version: Number(row.version),
    sourceKind: row.sourceKind as MemoryClaimRecord['sourceKind'],
    sourceMessageId: (row.sourceMessageId as string | null) ?? null,
    extractorVersion: String(row.extractorVersion),
  };
}

function claimPayload(payload: Record<string, unknown>): MemoryClaimRecord | null {
  const candidate = payload.claim;
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  return candidate as MemoryClaimRecord;
}

async function upsertClaim(db: SQLiteDatabase, claim: MemoryClaimRecord): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO memory_claims (
      id, space, schemaVersion, canonicalClaimId, relatedClaimGroupId, lane, status,
      kind, actor, subjectEntityId, subjectDisplay, scopeType, scopeId, predicate,
      valueNormalized, valueDisplay, polarity, speechMode, rawTimePhrase, validFrom,
      validTo, validPrecision, confidenceRaw, confidenceCalibrated, confidenceBand,
      importance, stability, manualLocked, safetyState, sourceKind, sourceMessageId,
      extractorVersion, ontologyVersion, projectionVersion, version, createdAt,
      updatedAt, lastUsedAt, supersededByClaimId, deletedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    claim.id,
    claim.space,
    claim.schemaVersion,
    claim.canonicalClaimId,
    claim.relatedClaimGroupId,
    claim.lane,
    claim.status,
    claim.kind,
    claim.actor,
    claim.subjectEntityId,
    claim.subjectDisplay,
    claim.scopeType,
    claim.scopeId,
    claim.predicate,
    claim.valueNormalized,
    claim.valueDisplay,
    claim.polarity,
    claim.speechMode,
    claim.rawTimePhrase,
    claim.validFrom,
    claim.validTo,
    claim.validPrecision,
    claim.confidenceRaw,
    claim.confidenceCalibrated,
    claim.confidenceBand,
    claim.importance,
    claim.stability,
    claim.manualLocked ? 1 : 0,
    claim.safetyState,
    claim.sourceKind,
    claim.sourceMessageId,
    claim.extractorVersion,
    claim.ontologyVersion,
    claim.projectionVersion,
    claim.version,
    claim.createdAt,
    claim.updatedAt,
    claim.lastUsedAt,
    claim.supersededByClaimId,
    claim.deletedAt
  );
}

async function upsertEpisode(db: SQLiteDatabase, episode: MemoryEpisodeRecord): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO memory_episodes (
      id, space, scopeType, scopeId, lane, status, title, summaryText,
      startMessageId, endMessageId, validFrom, validTo, sourceClaimIdsJson,
      sourceMessageIdsJson, branchRootMessageId, branchVersionIndex,
      confidenceBand, importance, projectionVersion, createdAt, updatedAt,
      archivedAt, deletedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    episode.id,
    episode.space,
    episode.scopeType,
    episode.scopeId,
    episode.lane,
    episode.status,
    episode.title,
    episode.summaryText,
    episode.startMessageId,
    episode.endMessageId,
    episode.validFrom,
    episode.validTo,
    episode.sourceClaimIdsJson,
    episode.sourceMessageIdsJson,
    episode.branchRootMessageId,
    episode.branchVersionIndex,
    episode.confidenceBand,
    episode.importance,
    episode.projectionVersion,
    episode.createdAt,
    episode.updatedAt,
    episode.archivedAt,
    episode.deletedAt
  );
}

async function upsertRelationalState(
  db: SQLiteDatabase,
  relation: MemoryRelationalStateRecord
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO memory_relational_states (
      id, space, scopeType, scopeId, subjectEntityId, metric, value,
      signalWeight, decayHalfLifeDays, lastEvidenceAt, evidenceIdsJson,
      projectionVersion, version, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    relation.id,
    relation.space,
    relation.scopeType,
    relation.scopeId,
    relation.subjectEntityId,
    relation.metric,
    relation.value,
    relation.signalWeight,
    relation.decayHalfLifeDays,
    relation.lastEvidenceAt,
    relation.evidenceIdsJson,
    relation.projectionVersion,
    relation.version,
    relation.createdAt,
    relation.updatedAt
  );
}

async function upsertProfile(db: SQLiteDatabase, profile: MemoryProfileRecord): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO memory_profiles (
      id, space, scopeType, scopeId, profileJson, profileText,
      sourceClaimIdsJson, sourceMessageIdsJson, version, projectionVersion,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    profile.id,
    profile.space,
    profile.scopeType,
    profile.scopeId,
    profile.profileJson,
    profile.profileText,
    profile.sourceClaimIdsJson,
    profile.sourceMessageIdsJson,
    profile.version,
    profile.projectionVersion,
    profile.createdAt,
    profile.updatedAt
  );
}

async function updateClaimStatus(
  db: SQLiteDatabase,
  claimId: string,
  status: MemoryStatus,
  lane: MemoryClaimRecord['lane'],
  supersededByClaimId: string | null = null
): Promise<void> {
  await db.runAsync(
    `UPDATE memory_claims
     SET status = ?, lane = ?, supersededByClaimId = ?,
         deletedAt = CASE WHEN ? = 'deleted' THEN ? ELSE deletedAt END,
         updatedAt = ?
     WHERE id = ?`,
    status,
    lane,
    supersededByClaimId,
    status,
    createTimestamp(),
    createTimestamp(),
    claimId
  );
}

async function refreshBoardProjectionForClaim(
  db: SQLiteDatabase,
  space: MemorySpace,
  claimId: string
): Promise<void> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM memory_claims WHERE space = ? AND id = ?',
    space,
    claimId
  );
  if (row) {
    await syncBoardProjection(db, mapClaimRow(row));
  }
}

async function removeClaimPromptProjections(
  db: SQLiteDatabase,
  space: MemorySpace,
  claimId: string
): Promise<void> {
  await db.runAsync(
    'DELETE FROM memory_board_projection WHERE claimId = ? AND space = ?',
    claimId,
    space
  );
  await db.runAsync('DELETE FROM ai_memory_fts WHERE id = ? AND space = ?', claimId, space)
    .catch(() => undefined);
}

async function syncBoardProjection(db: SQLiteDatabase, claim: MemoryClaimRecord): Promise<void> {
  const hidden = claim.status === 'deleted' || claim.status === 'suppressed' || Boolean(claim.deletedAt);
  if (hidden) {
    await removeClaimPromptProjections(db, claim.space, claim.id);
    return;
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO memory_board_projection (
      claimId, space, displayContent, lane, scopeLabel, sourceLabel,
      needsReview, hasConflict, sortKey, projectionVersion, hidden, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    claim.id,
    claim.space,
    claim.valueDisplay,
    claim.lane,
    claim.scopeType,
    claim.sourceKind,
    claim.status === 'tentative' || claim.confidenceBand !== 'high' ? 1 : 0,
    claim.status === 'conflicted' ? 1 : 0,
    claim.importance + resolveCalibratedConfidence(claim.confidenceCalibrated, claim.confidenceBand) * 100,
    claim.projectionVersion,
    0,
    claim.updatedAt
  );
  await db.runAsync('DELETE FROM ai_memory_fts WHERE id = ?', claim.id).catch(() => undefined);
  await db.runAsync(
    `INSERT INTO ai_memory_fts
       (id, space, scope, scopeId, content, normalizedContent, assetSnapshotJson, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    claim.id,
    claim.space,
    claim.scopeType,
    claim.scopeId,
    claim.valueDisplay,
    claim.valueNormalized,
    JSON.stringify({ predicate: claim.predicate, lane: claim.lane, status: claim.status }),
    claim.updatedAt
  ).catch(() => undefined);
}

export async function projectMemoryEvent(
  db: SQLiteDatabase,
  event: MemoryEventRecord
): Promise<void> {
  const payload = parsePayload(event);
  const claim = claimPayload(payload);
  switch (event.eventType) {
    case 'claim_created':
    case 'claim_committed':
    case 'claim_confirmed':
    case 'claim_edited':
    case 'claim_restored':
    case 'claim_evidence_added':
    case 'claim_scope_changed':
    case 'claim_conflicted':
    case 'claim_conflict_resolved':
      if (claim) {
        await upsertClaim(db, claim);
        await syncBoardProjection(db, claim);
      }
      break;
    case 'claim_superseded':
      await updateClaimStatus(
        db,
        event.aggregateId,
        'superseded',
        'archive',
        typeof payload.supersededByClaimId === 'string' ? payload.supersededByClaimId : null
      );
      await removeClaimPromptProjections(db, event.space, event.aggregateId);
      break;
    case 'claim_staled':
      await updateClaimStatus(db, event.aggregateId, 'stale', 'archive');
      await refreshBoardProjectionForClaim(db, event.space, event.aggregateId);
      break;
    case 'claim_suppressed':
      await updateClaimStatus(db, event.aggregateId, 'suppressed', 'archive');
      await removeClaimPromptProjections(db, event.space, event.aggregateId);
      break;
    case 'claim_deleted':
      await updateClaimStatus(db, event.aggregateId, 'deleted', 'archive');
      await removeClaimPromptProjections(db, event.space, event.aggregateId);
      break;
    case 'episode_upserted':
      if (payload.episode && typeof payload.episode === 'object') {
        await upsertEpisode(db, payload.episode as MemoryEpisodeRecord);
      }
      break;
    case 'relation_upserted':
      if (payload.relation && typeof payload.relation === 'object') {
        await upsertRelationalState(db, payload.relation as MemoryRelationalStateRecord);
      }
      break;
    case 'profile_upserted':
      if (payload.profile && typeof payload.profile === 'object') {
        await upsertProfile(db, payload.profile as MemoryProfileRecord);
      }
      break;
    case 'episode_deleted':
      await db.runAsync('DELETE FROM memory_episodes WHERE id = ? AND space = ?', event.aggregateId, event.space);
      break;
    case 'relation_deleted':
      await db.runAsync('DELETE FROM memory_relational_states WHERE id = ? AND space = ?', event.aggregateId, event.space);
      break;
    case 'profile_deleted':
      await db.runAsync('DELETE FROM memory_profiles WHERE id = ? AND space = ?', event.aggregateId, event.space);
      break;
    default:
      break;
  }
}

export async function rebuildMemoryProjections(
  db: SQLiteDatabase,
  space: MemorySpace
): Promise<void> {
  const meta = await getMemoryProjectionMeta(db, space);
  await db.runAsync('DELETE FROM memory_board_projection WHERE space = ?', space);
  await db.runAsync('DELETE FROM ai_memory_fts WHERE space = ?', space).catch(() => undefined);
  await db.runAsync('DELETE FROM memory_claims WHERE space = ?', space);
  await db.runAsync('DELETE FROM memory_episodes WHERE space = ?', space);
  await db.runAsync('DELETE FROM memory_relational_states WHERE space = ?', space);
  await db.runAsync('DELETE FROM memory_profiles WHERE space = ?', space);
  const events = await listMemoryEvents(db, { afterProjectionVersion: -1, space });
  for (const event of events) {
    await projectMemoryEvent(db, event);
  }
  const now = createTimestamp();
  await db.runAsync(
    `UPDATE memory_projection_meta
     SET projectionVersion = ?, memoryEpoch = ?, lastRebuiltAt = ?, updatedAt = ?
     WHERE space = ?`,
    events.length ? events[events.length - 1].projectionVersion : meta.projectionVersion,
    meta.memoryEpoch,
    now,
    now,
    space
  );
}

export async function applyMemoryEventAndAdvance(
  db: SQLiteDatabase,
  event: MemoryEventRecord,
  options: { incrementEpoch?: boolean } = {}
): Promise<void> {
  await projectMemoryEvent(db, event);
  await advanceMemoryProjectionMeta(db, event.space, {
    incrementEpoch: options.incrementEpoch ?? false,
    projectionVersion: event.projectionVersion,
  });
}

export async function findMemoryClaimById(
  db: SQLiteDatabase,
  space: MemorySpace,
  claimId: string
): Promise<MemoryClaimRecord | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM memory_claims WHERE space = ? AND id = ?',
    space,
    claimId
  );
  return row ? mapClaimRow(row) : null;
}
