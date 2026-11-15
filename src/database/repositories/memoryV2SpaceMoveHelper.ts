import type { SQLiteDatabase } from 'expo-sqlite';

import type { PixorySpace } from '../db';

export interface MemoryClaimSnapshotRow {
  id: string;
  space: PixorySpace;
  schemaVersion: number;
  canonicalClaimId: string;
  relatedClaimGroupId: string | null;
  lane: 'confirmed' | 'working' | 'archive';
  status: 'tentative' | 'committed' | 'confirmed' | 'stale' | 'superseded' | 'conflicted' | 'suppressed' | 'deleted';
  kind: 'state' | 'episode' | 'task' | 'commitment' | 'relational_signal';
  actor: 'user' | 'companion' | 'joint';
  subjectEntityId: string;
  subjectDisplay: string;
  scopeType: 'global' | 'role' | 'ip' | 'knowledge_base' | 'thread' | 'branch';
  scopeId: string | null;
  predicate: string;
  valueNormalized: string;
  valueDisplay: string;
  polarity: 'positive' | 'negative' | 'unknown';
  speechMode: 'asserted' | 'corrected' | 'negated' | 'hypothetical' | 'joke' | 'quoted' | 'roleplay' | 'uncertain';
  rawTimePhrase: string | null;
  validFrom: string | null;
  validTo: string | null;
  validPrecision: 'exact' | 'day' | 'month' | 'relative' | 'unknown';
  confidenceRaw: number;
  confidenceCalibrated: number | null;
  confidenceBand: 'high' | 'medium' | 'low';
  importance: number;
  stability: 'ephemeral' | 'short' | 'long' | 'permanent';
  manualLocked: number;
  safetyState: 'none' | 'safety_pending' | 'safety_confirmed';
  sourceKind: 'message' | 'summary' | 'import' | 'manual' | 'assistant_commitment';
  sourceMessageId: string | null;
  extractorVersion: string;
  ontologyVersion: string;
  projectionVersion: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  supersededByClaimId: string | null;
  deletedAt: string | null;
}

export interface MemoryEventSnapshotRow {
  id: string;
  space: PixorySpace;
  aggregateType: 'claim' | 'episode' | 'relation' | 'import';
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  commandId: string;
  idempotencyKey: string;
  actorType: 'user' | 'system' | 'model' | 'import';
  actorId: string | null;
  source: string;
  payloadJson: string;
  evidenceIdsJson: string;
  createdAt: string;
  projectionVersion: number;
}

export interface MemoryEvidenceSnapshotRow {
  id: string;
  space: PixorySpace;
  sourceType: 'message' | 'summary' | 'import' | 'attachment';
  sourceId: string;
  messageId: string | null;
  role: string | null;
  quote: string | null;
  quoteHash: string;
  charStart: number | null;
  charEnd: number | null;
  sourceRevision: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface MemoryClaimFeedbackSnapshotRow {
  claimId: string;
  space: PixorySpace;
  injectedCount: number;
  usedCount: number;
  lastInjectedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryCurrentTurnObservationSnapshotRow {
  id: string;
  space: PixorySpace;
  threadId: string;
  branchRootMessageId: string | null;
  branchVersionIndex: number | null;
  messageId: string;
  intent: 'none' | 'recall' | 'correction' | 'forget' | 'confirm' | 'historical' | 'safety';
  explicitUserAction: number;
  payloadJson: string;
  status: 'pending' | 'consumed' | 'expired' | 'deleted';
  extractorVersion: string;
  idempotencyKey: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  deletedAt: string | null;
}

export interface MemoryEpisodeSnapshotRow {
  id: string;
  space: PixorySpace;
  scopeType: string;
  scopeId: string | null;
  lane: 'confirmed' | 'working' | 'archive';
  status: 'active' | 'closed' | 'archived' | 'deleted';
  title: string;
  summaryText: string;
  startMessageId: string | null;
  endMessageId: string | null;
  validFrom: string | null;
  validTo: string | null;
  sourceClaimIdsJson: string;
  sourceMessageIdsJson: string;
  branchRootMessageId: string | null;
  branchVersionIndex: number | null;
  confidenceBand: 'high' | 'medium' | 'low';
  importance: number;
  projectionVersion: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
}

export interface MemoryRelationalStateSnapshotRow {
  id: string;
  space: PixorySpace;
  scopeType: string;
  scopeId: string | null;
  subjectEntityId: string;
  metric: 'affinity' | 'trust' | 'tension' | 'familiarity';
  value: number;
  signalWeight: number;
  decayHalfLifeDays: number;
  lastEvidenceAt: string | null;
  evidenceIdsJson: string;
  projectionVersion: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryProfileSnapshotRow {
  id: string;
  space: PixorySpace;
  scopeType: string;
  scopeId: string | null;
  profileJson: string;
  profileText: string;
  sourceClaimIdsJson: string;
  sourceMessageIdsJson: string;
  version: number;
  projectionVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoleV2MemoryBundle {
  claims: MemoryClaimSnapshotRow[];
  episodes: MemoryEpisodeSnapshotRow[];
  events: MemoryEventSnapshotRow[];
  evidence: MemoryEvidenceSnapshotRow[];
  feedback: MemoryClaimFeedbackSnapshotRow[];
  profiles: MemoryProfileSnapshotRow[];
  relationalStates: MemoryRelationalStateSnapshotRow[];
}

export interface RoleV2SpaceMovePlan {
  claimIdMap: Map<string, string>;
  skippedClaimIds: Set<string>;
  skippedEpisodeIds: Set<string>;
  skippedProfileIds: Set<string>;
  skippedRelationalStateIds: Set<string>;
}

/**
 * Plan collision-free claim IDs and active-canonical skips when migrating
 * role-scoped V2 memory into targetSpace.
 */
export async function planRoleV2SpaceMove(
  db: SQLiteDatabase,
  input: {
    targetSpace: PixorySpace;
    roleIdMap: Map<string, string>;
    roleV2Memory: RoleV2MemoryBundle;
  }
): Promise<RoleV2SpaceMovePlan> {
  const skippedClaimIds = new Set<string>();
  const skippedEpisodeIds = new Set<string>();
  const skippedProfileIds = new Set<string>();
  const skippedRelationalStateIds = new Set<string>();
  const claimIdMap = new Map<string, string>();

  if (!(await hasMemoryV2Table(db, 'memory_claims'))) {
    return {
      claimIdMap,
      skippedClaimIds,
      skippedEpisodeIds,
      skippedProfileIds,
      skippedRelationalStateIds,
    };
  }

  const targetRoleCardIds = Array.from(new Set(input.roleIdMap.values()));
  const claimIds = Array.from(new Set(input.roleV2Memory.claims.map((claim) => claim.id)));
  const claimsById =
    claimIds.length > 0
      ? await db.getAllAsync<MemoryClaimSnapshotRow>(
          `SELECT * FROM memory_claims WHERE id IN (${makePlaceholders(claimIds.length)})`,
          ...claimIds
        )
      : [];
  const activeCanonicalClaims =
    targetRoleCardIds.length > 0
      ? await db.getAllAsync<MemoryClaimSnapshotRow>(
          `SELECT * FROM memory_claims
           WHERE space = ? AND scopeType = 'role' AND scopeId IN (${makePlaceholders(targetRoleCardIds.length)})
             AND status IN ('tentative', 'committed', 'confirmed', 'conflicted')
             AND deletedAt IS NULL`,
          input.targetSpace,
          ...targetRoleCardIds
        )
      : [];

  const existingById = new Map(claimsById.map((claim) => [claim.id, claim]));
  const reservedClaimIds = new Set(claimsById.map((claim) => claim.id));
  const activeCanonicalByKey = new Map(
    activeCanonicalClaims.map((claim) => [
      buildCanonicalClaimKey(claim.canonicalClaimId, claim.scopeType, claim.scopeId),
      claim,
    ])
  );

  for (const claim of input.roleV2Memory.claims) {
    const targetRoleCardId = claim.scopeId ? input.roleIdMap.get(claim.scopeId) : null;
    if (!targetRoleCardId) {
      throw new Error('角色 V2 记忆的迁移映射不完整。');
    }
    const existingClaim = existingById.get(claim.id);
    if (
      existingClaim?.space === input.targetSpace &&
      existingClaim.scopeType === 'role' &&
      existingClaim.scopeId === targetRoleCardId
    ) {
      claimIdMap.set(claim.id, claim.id);
      skippedClaimIds.add(claim.id);
      continue;
    }
    const canonicalKey = buildCanonicalClaimKey(
      claim.canonicalClaimId,
      claim.scopeType,
      targetRoleCardId
    );
    const existingCanonical = isActiveCanonicalClaim(claim)
      ? activeCanonicalByKey.get(canonicalKey)
      : undefined;
    if (existingCanonical) {
      claimIdMap.set(claim.id, existingCanonical.id);
      skippedClaimIds.add(claim.id);
      continue;
    }
    let targetClaimId = claim.id;
    while (
      reservedClaimIds.has(targetClaimId) ||
      Boolean(
        await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM memory_claims WHERE id = ?',
          targetClaimId
        )
      )
    ) {
      targetClaimId = createMemoryV2Id('memc');
    }
    claimIdMap.set(claim.id, targetClaimId);
    reservedClaimIds.add(targetClaimId);
    if (isActiveCanonicalClaim(claim)) {
      activeCanonicalByKey.set(canonicalKey, {
        ...claim,
        id: targetClaimId,
        space: input.targetSpace,
        scopeId: targetRoleCardId,
      });
    }
  }

  if (
    input.roleV2Memory.episodes.length > 0 ||
    input.roleV2Memory.profiles.length > 0 ||
    input.roleV2Memory.relationalStates.length > 0
  ) {
    const existingAgg = await exportV2AggregateMemoryForScopes(
      db,
      input.targetSpace,
      'role',
      targetRoleCardIds
    );
    const existingEpisodeIds = new Set(existingAgg.episodes.map((ep) => ep.id));
    for (const ep of input.roleV2Memory.episodes) {
      if (existingEpisodeIds.has(ep.id)) {
        skippedEpisodeIds.add(ep.id);
      }
    }
    const existingProfileKeys = new Set(
      existingAgg.profiles.map((p) => `${p.scopeType}\u0000${p.scopeId ?? ''}`)
    );
    for (const profile of input.roleV2Memory.profiles) {
      const mappedScopeId = profile.scopeId
        ? (input.roleIdMap.get(profile.scopeId) ?? profile.scopeId)
        : '';
      if (
        existingProfileKeys.has(`${profile.scopeType}\u0000${mappedScopeId}`) ||
        existingAgg.profiles.some((existing) => existing.id === profile.id)
      ) {
        skippedProfileIds.add(profile.id);
      }
    }
    const existingRelKeys = new Set(
      existingAgg.relationalStates.map(
        (rel) => `${rel.scopeType}\u0000${rel.scopeId ?? ''}\u0000${rel.subjectEntityId}\u0000${rel.metric}`
      )
    );
    for (const rel of input.roleV2Memory.relationalStates) {
      const mappedScopeId = rel.scopeId ? (input.roleIdMap.get(rel.scopeId) ?? rel.scopeId) : '';
      if (
        existingRelKeys.has(`${rel.scopeType}\u0000${mappedScopeId}\u0000${rel.subjectEntityId}\u0000${rel.metric}`) ||
        existingAgg.relationalStates.some((existing) => existing.id === rel.id)
      ) {
        skippedRelationalStateIds.add(rel.id);
      }
    }
  }

  return {
    claimIdMap,
    skippedClaimIds,
    skippedEpisodeIds,
    skippedProfileIds,
    skippedRelationalStateIds,
  };
}

/**
 * Transform source role V2 memory records into target-space records using a move plan.
 */
export function buildTargetRoleV2MemoryBundle(input: {
  movedMessageIds: Set<string>;
  plan: RoleV2SpaceMovePlan;
  roleIdMap: Map<string, string>;
  source: RoleV2MemoryBundle;
  targetSpace: PixorySpace;
}): RoleV2MemoryBundle {
  const claims = input.source.claims
    .filter((claim) => !input.plan.skippedClaimIds.has(claim.id))
    .map((claim) => {
      const targetRoleCardId = claim.scopeId ? input.roleIdMap.get(claim.scopeId) : null;
      if (!targetRoleCardId) {
        throw new Error('角色 V2 记忆的迁移映射不完整。');
      }
      return {
        ...claim,
        id: input.plan.claimIdMap.get(claim.id) ?? createMemoryV2Id('memc'),
        space: input.targetSpace,
        scopeId: targetRoleCardId,
        sourceMessageId:
          claim.sourceMessageId && input.movedMessageIds.has(claim.sourceMessageId)
            ? claim.sourceMessageId
            : null,
        supersededByClaimId: claim.supersededByClaimId
          ? input.plan.claimIdMap.get(claim.supersededByClaimId) ?? null
          : null,
      };
    });

  const importedSourceClaimIds = new Set(
    input.source.claims
      .filter((claim) => !input.plan.skippedClaimIds.has(claim.id))
      .map((claim) => claim.id)
  );
  const usedEvidenceIds = new Set<string>();
  const events = input.source.events
    .filter((event) => importedSourceClaimIds.has(event.aggregateId))
    .map((event) => {
      const targetClaimId = input.plan.claimIdMap.get(event.aggregateId) ?? event.aggregateId;
      const remapped = targetClaimId !== event.aggregateId;
      for (const id of parseEvidenceIds(event.evidenceIdsJson)) {
        usedEvidenceIds.add(id);
      }
      let nextPayloadJson = event.payloadJson;
      if (remapped) {
        try {
          const parsed = JSON.parse(event.payloadJson);
          if (parsed && typeof parsed === 'object' && parsed.claim && typeof parsed.claim === 'object') {
            parsed.claim.id = targetClaimId;
            parsed.claim.space = input.targetSpace;
            nextPayloadJson = JSON.stringify(parsed);
          }
        } catch {
          // Keep original payload if unparseable.
        }
      }
      return {
        ...event,
        id: remapped ? createMemoryV2Id('memevt') : event.id,
        space: input.targetSpace,
        aggregateId: targetClaimId,
        idempotencyKey: remapped ? `${event.idempotencyKey}:move:${targetClaimId}` : event.idempotencyKey,
        payloadJson: nextPayloadJson,
      };
    });

  const evidence = input.source.evidence
    .filter((item) => usedEvidenceIds.has(item.id))
    .map((item) => ({
      ...item,
      space: input.targetSpace,
      messageId:
        item.messageId && input.movedMessageIds.has(item.messageId) ? item.messageId : null,
    }));

  const feedback = input.source.feedback
    .filter((item) => importedSourceClaimIds.has(item.claimId))
    .map((item) => ({
      ...item,
      claimId: input.plan.claimIdMap.get(item.claimId) ?? item.claimId,
      space: input.targetSpace,
    }));

  const episodes = input.source.episodes
    .filter((ep) => !input.plan.skippedEpisodeIds.has(ep.id))
    .map((ep) => ({
      ...ep,
      space: input.targetSpace,
      scopeId: ep.scopeId ? (input.roleIdMap.get(ep.scopeId) ?? ep.scopeId) : ep.scopeId,
      startMessageId:
        ep.startMessageId && input.movedMessageIds.has(ep.startMessageId)
          ? ep.startMessageId
          : null,
      endMessageId:
        ep.endMessageId && input.movedMessageIds.has(ep.endMessageId) ? ep.endMessageId : null,
    }));

  const profiles = input.source.profiles
    .filter((profile) => !input.plan.skippedProfileIds.has(profile.id))
    .map((profile) => ({
      ...profile,
      space: input.targetSpace,
      scopeId: profile.scopeId
        ? (input.roleIdMap.get(profile.scopeId) ?? profile.scopeId)
        : profile.scopeId,
    }));

  const relationalStates = input.source.relationalStates
    .filter((rel) => !input.plan.skippedRelationalStateIds.has(rel.id))
    .map((rel) => ({
      ...rel,
      space: input.targetSpace,
      scopeId: rel.scopeId ? (input.roleIdMap.get(rel.scopeId) ?? rel.scopeId) : rel.scopeId,
    }));

  return {
    claims,
    episodes,
    events,
    evidence,
    feedback,
    profiles,
    relationalStates,
  };
}

const ACTIVE_CANONICAL_CLAIM_STATUSES = new Set([
  'tentative',
  'committed',
  'confirmed',
  'conflicted',
]);

function makePlaceholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

export function createMemoryV2Id(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function isActiveCanonicalClaim(claim: Pick<MemoryClaimSnapshotRow, 'status' | 'deletedAt'>): boolean {
  return ACTIVE_CANONICAL_CLAIM_STATUSES.has(claim.status) && !claim.deletedAt;
}

export function buildCanonicalClaimKey(
  canonicalClaimId: string,
  scopeType: string,
  scopeId: string | null
): string {
  return `${canonicalClaimId}\u0000${scopeType}\u0000${scopeId ?? '∅'}`;
}

export async function hasMemoryV2Table(db: SQLiteDatabase, tableName: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    tableName
  );
  return Boolean(row);
}

function parseEvidenceIds(evidenceIdsJson: string | null | undefined): string[] {
  if (!evidenceIdsJson) {
    return [];
  }
  try {
    const parsed = JSON.parse(evidenceIdsJson);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
  } catch {
    return [];
  }
}

function resolveCalibratedScore(
  confidenceCalibrated: number | null | undefined,
  confidenceBand: MemoryClaimSnapshotRow['confidenceBand']
): number {
  if (confidenceCalibrated != null && Number.isFinite(confidenceCalibrated)) {
    return Math.max(0, Math.min(1, confidenceCalibrated));
  }
  return confidenceBand === 'high' ? 0.95 : confidenceBand === 'medium' ? 0.7 : 0.35;
}

/**
 * Collect V2 claim-graph dependencies (events, evidence, feedback) for a list of claims.
 */
export async function exportV2ClaimDependencies(
  db: SQLiteDatabase,
  space: PixorySpace,
  claimIds: string[],
  extraMessageIds: string[] = []
): Promise<{
  events: MemoryEventSnapshotRow[];
  evidence: MemoryEvidenceSnapshotRow[];
  feedback: MemoryClaimFeedbackSnapshotRow[];
}> {
  const uniqueClaimIds = Array.from(new Set(claimIds.filter(Boolean)));
  const uniqueMsgIds = Array.from(new Set(extraMessageIds.filter(Boolean)));
  let events: MemoryEventSnapshotRow[] = [];
  if (uniqueClaimIds.length > 0 && (await hasMemoryV2Table(db, 'memory_events'))) {
    events = await db.getAllAsync<MemoryEventSnapshotRow>(
      `SELECT * FROM memory_events
       WHERE space = ? AND aggregateType = 'claim' AND aggregateId IN (${makePlaceholders(uniqueClaimIds.length)})
       ORDER BY createdAt ASC, eventVersion ASC, id ASC`,
      space,
      ...uniqueClaimIds
    );
  }

  const evidenceIds = new Set<string>();
  for (const event of events) {
    for (const id of parseEvidenceIds(event.evidenceIdsJson)) {
      evidenceIds.add(id);
    }
  }

  let evidence: MemoryEvidenceSnapshotRow[] = [];
  if ((evidenceIds.size > 0 || uniqueMsgIds.length > 0) && (await hasMemoryV2Table(db, 'memory_evidence'))) {
    const clauses: string[] = [];
    const params: (string | number)[] = [space];
    if (evidenceIds.size > 0) {
      const ids = Array.from(evidenceIds);
      clauses.push(`id IN (${makePlaceholders(ids.length)})`);
      params.push(...ids);
    }
    if (uniqueMsgIds.length > 0) {
      clauses.push(`messageId IN (${makePlaceholders(uniqueMsgIds.length)})`);
      params.push(...uniqueMsgIds);
    }
    evidence = await db.getAllAsync<MemoryEvidenceSnapshotRow>(
      `SELECT * FROM memory_evidence
       WHERE space = ? AND (${clauses.join(' OR ')})
       ORDER BY createdAt ASC, id ASC`,
      ...params
    );
  }

  let feedback: MemoryClaimFeedbackSnapshotRow[] = [];
  if (uniqueClaimIds.length > 0 && (await hasMemoryV2Table(db, 'memory_claim_feedback'))) {
    feedback = await db.getAllAsync<MemoryClaimFeedbackSnapshotRow>(
      `SELECT * FROM memory_claim_feedback
       WHERE space = ? AND claimId IN (${makePlaceholders(uniqueClaimIds.length)})`,
      space,
      ...uniqueClaimIds
    );
  }

  return { events, evidence, feedback };
}

async function resolveValidMessageIds(
  db: SQLiteDatabase,
  candidateIds: Array<string | null | undefined>,
  knownValidMessageIds?: Set<string>
): Promise<Set<string>> {
  const valid = new Set<string>(knownValidMessageIds ?? []);
  const toCheck = Array.from(
    new Set(
      candidateIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0 && !valid.has(id)
      )
    )
  );
  if (toCheck.length === 0 || !(await hasMemoryV2Table(db, 'ai_messages'))) {
    return valid;
  }
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM ai_messages WHERE id IN (${makePlaceholders(toCheck.length)})`,
    ...toCheck
  );
  for (const row of rows) {
    valid.add(row.id);
  }
  return valid;
}

async function syncV2ClaimProjections(db: SQLiteDatabase, claim: MemoryClaimSnapshotRow): Promise<void> {
  const hidden = claim.status === 'deleted' || claim.status === 'suppressed' || Boolean(claim.deletedAt);
  if (await hasMemoryV2Table(db, 'memory_board_projection')) {
    if (hidden) {
      await db.runAsync(
        'DELETE FROM memory_board_projection WHERE claimId = ? AND space = ?',
        claim.id,
        claim.space
      );
    } else {
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
        claim.importance + resolveCalibratedScore(claim.confidenceCalibrated, claim.confidenceBand) * 100,
        claim.projectionVersion,
        0,
        claim.updatedAt
      );
    }
  }

  if (await hasMemoryV2Table(db, 'ai_memory_fts')) {
    await db.runAsync('DELETE FROM ai_memory_fts WHERE id = ?', claim.id);
    if (!hidden && claim.status !== 'superseded' && !claim.supersededByClaimId) {
      await db.runAsync(
        `INSERT INTO ai_memory_fts (
          id, space, scope, scopeId, content, normalizedContent, assetSnapshotJson, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        claim.id,
        claim.space,
        claim.scopeType,
        claim.scopeId,
        claim.valueDisplay,
        claim.valueNormalized,
        JSON.stringify({ predicate: claim.predicate, lane: claim.lane, status: claim.status }),
        claim.updatedAt
      );
    }
  }
}

export async function exportV2AggregateMemoryForScopes(
  db: SQLiteDatabase,
  space: PixorySpace,
  scopeType: 'thread' | 'role',
  scopeIds: string[]
): Promise<{
  episodes: MemoryEpisodeSnapshotRow[];
  relationalStates: MemoryRelationalStateSnapshotRow[];
  profiles: MemoryProfileSnapshotRow[];
}> {
  const uniqueScopeIds = Array.from(new Set(scopeIds.filter(Boolean)));
  if (uniqueScopeIds.length === 0) {
    return { episodes: [], relationalStates: [], profiles: [] };
  }
  const placeholders = makePlaceholders(uniqueScopeIds.length);
  const episodes = (await hasMemoryV2Table(db, 'memory_episodes'))
    ? await db.getAllAsync<MemoryEpisodeSnapshotRow>(
        `SELECT * FROM memory_episodes
         WHERE space = ? AND scopeType = ? AND scopeId IN (${placeholders})
         ORDER BY createdAt ASC, id ASC`,
        space,
        scopeType,
        ...uniqueScopeIds
      )
    : [];
  const relationalStates = (await hasMemoryV2Table(db, 'memory_relational_states'))
    ? await db.getAllAsync<MemoryRelationalStateSnapshotRow>(
        `SELECT * FROM memory_relational_states
         WHERE space = ? AND scopeType = ? AND scopeId IN (${placeholders})
         ORDER BY createdAt ASC, id ASC`,
        space,
        scopeType,
        ...uniqueScopeIds
      )
    : [];
  const profiles = (await hasMemoryV2Table(db, 'memory_profiles'))
    ? await db.getAllAsync<MemoryProfileSnapshotRow>(
        `SELECT * FROM memory_profiles
         WHERE space = ? AND scopeType = ? AND scopeId IN (${placeholders})
         ORDER BY createdAt ASC, id ASC`,
        space,
        scopeType,
        ...uniqueScopeIds
      )
    : [];
  return { episodes, relationalStates, profiles };
}

/**
 * Import V2 claims and their dependencies into targetSpace using two-pass self-FK
 * insertion and board/FTS projection updates.
 */
export async function importV2MemoryGraph(
  db: SQLiteDatabase,
  input: {
    targetSpace: PixorySpace;
    claims: MemoryClaimSnapshotRow[];
    episodes?: MemoryEpisodeSnapshotRow[];
    events?: MemoryEventSnapshotRow[];
    evidence?: MemoryEvidenceSnapshotRow[];
    feedback?: MemoryClaimFeedbackSnapshotRow[];
    profiles?: MemoryProfileSnapshotRow[];
    relationalStates?: MemoryRelationalStateSnapshotRow[];
    knownValidMessageIds?: Set<string>;
  }
): Promise<void> {
  if (!(await hasMemoryV2Table(db, 'memory_claims'))) {
    return;
  }

  const validMessageIds = await resolveValidMessageIds(
    db,
    [
      ...input.claims.map((c) => c.sourceMessageId),
      ...(input.evidence ?? []).map((e) => e.messageId),
      ...(input.episodes ?? []).flatMap((ep) => [ep.startMessageId, ep.endMessageId]),
    ],
    input.knownValidMessageIds
  );

  if ((input.evidence?.length ?? 0) > 0 && (await hasMemoryV2Table(db, 'memory_evidence'))) {
    for (const item of input.evidence!) {
      const safeMessageId = item.messageId && validMessageIds.has(item.messageId) ? item.messageId : null;
      await db.runAsync(
        `INSERT OR IGNORE INTO memory_evidence (
          id, space, sourceType, sourceId, messageId, role, quote, quoteHash,
          charStart, charEnd, sourceRevision, createdAt, deletedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item.id,
        input.targetSpace,
        item.sourceType,
        item.sourceId,
        safeMessageId,
        item.role,
        item.quote,
        item.quoteHash,
        item.charStart,
        item.charEnd,
        item.sourceRevision,
        item.createdAt,
        item.deletedAt
      );
    }
  }

  const normalizedClaims: MemoryClaimSnapshotRow[] = input.claims.map((claim) => ({
    ...claim,
    space: input.targetSpace,
    sourceMessageId:
      claim.sourceMessageId && validMessageIds.has(claim.sourceMessageId)
        ? claim.sourceMessageId
        : null,
  }));

  // Pass 1: Insert claims with supersededByClaimId = NULL so arbitrary order cannot break self-FK.
  for (const claim of normalizedClaims) {
    await db.runAsync(
      `INSERT INTO memory_claims (
        id, space, schemaVersion, canonicalClaimId, relatedClaimGroupId, lane, status,
        kind, actor, subjectEntityId, subjectDisplay, scopeType, scopeId, predicate,
        valueNormalized, valueDisplay, polarity, speechMode, rawTimePhrase, validFrom,
        validTo, validPrecision, confidenceRaw, confidenceCalibrated, confidenceBand,
        importance, stability, manualLocked, safetyState, sourceKind, sourceMessageId,
        extractorVersion, ontologyVersion, projectionVersion, version, createdAt,
        updatedAt, lastUsedAt, supersededByClaimId, deletedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
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
      claim.manualLocked,
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
      claim.deletedAt
    );
  }

  // Pass 2: Restore valid supersededByClaimId references, then project to board & FTS.
  const targetSupersedeIds = Array.from(
    new Set(
      normalizedClaims
        .map((claim) => claim.supersededByClaimId)
        .filter((id): id is string => Boolean(id))
    )
  );
  const existingTargetIds = new Set<string>(normalizedClaims.map((claim) => claim.id));
  if (targetSupersedeIds.length > 0) {
    const found = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM memory_claims WHERE id IN (${makePlaceholders(targetSupersedeIds.length)})`,
      ...targetSupersedeIds
    );
    for (const row of found) {
      existingTargetIds.add(row.id);
    }
  }

  for (const claim of normalizedClaims) {
    if (claim.supersededByClaimId && existingTargetIds.has(claim.supersededByClaimId)) {
      await db.runAsync(
        'UPDATE memory_claims SET supersededByClaimId = ? WHERE id = ?',
        claim.supersededByClaimId,
        claim.id
      );
    }
    await syncV2ClaimProjections(db, claim);
  }

  if ((input.events?.length ?? 0) > 0 && (await hasMemoryV2Table(db, 'memory_events'))) {
    for (const event of input.events!) {
      await db.runAsync(
        `INSERT OR IGNORE INTO memory_events (
          id, space, aggregateType, aggregateId, eventType, eventVersion,
          commandId, idempotencyKey, actorType, actorId, source, payloadJson,
          evidenceIdsJson, createdAt, projectionVersion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        event.id,
        input.targetSpace,
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
    }
  }

  if ((input.feedback?.length ?? 0) > 0 && (await hasMemoryV2Table(db, 'memory_claim_feedback'))) {
    const claimIdSet = new Set(normalizedClaims.map((claim) => claim.id));
    for (const fb of input.feedback!) {
      if (!claimIdSet.has(fb.claimId)) {
        continue;
      }
      await db.runAsync(
        `INSERT OR REPLACE INTO memory_claim_feedback (
          claimId, space, injectedCount, usedCount, lastInjectedAt, lastUsedAt, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        fb.claimId,
        input.targetSpace,
        fb.injectedCount,
        fb.usedCount,
        fb.lastInjectedAt,
        fb.lastUsedAt,
        fb.createdAt,
        fb.updatedAt
      );
    }
  }

  if ((input.episodes?.length ?? 0) > 0 && (await hasMemoryV2Table(db, 'memory_episodes'))) {
    for (const ep of input.episodes!) {
      await db.runAsync(
        `INSERT OR IGNORE INTO memory_episodes (
          id, space, scopeType, scopeId, lane, status, title, summaryText,
          startMessageId, endMessageId, validFrom, validTo, sourceClaimIdsJson,
          sourceMessageIdsJson, branchRootMessageId, branchVersionIndex,
          confidenceBand, importance, projectionVersion, createdAt, updatedAt, archivedAt, deletedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ep.id,
        input.targetSpace,
        ep.scopeType,
        ep.scopeId,
        ep.lane,
        ep.status,
        ep.title,
        ep.summaryText,
        ep.startMessageId && validMessageIds.has(ep.startMessageId) ? ep.startMessageId : null,
        ep.endMessageId && validMessageIds.has(ep.endMessageId) ? ep.endMessageId : null,
        ep.validFrom,
        ep.validTo,
        ep.sourceClaimIdsJson,
        ep.sourceMessageIdsJson,
        ep.branchRootMessageId,
        ep.branchVersionIndex,
        ep.confidenceBand,
        ep.importance,
        ep.projectionVersion,
        ep.createdAt,
        ep.updatedAt,
        ep.archivedAt,
        ep.deletedAt
      );
    }
  }

  if ((input.relationalStates?.length ?? 0) > 0 && (await hasMemoryV2Table(db, 'memory_relational_states'))) {
    for (const rel of input.relationalStates!) {
      await db.runAsync(
        `INSERT OR IGNORE INTO memory_relational_states (
          id, space, scopeType, scopeId, subjectEntityId, metric, value,
          signalWeight, decayHalfLifeDays, lastEvidenceAt, evidenceIdsJson,
          projectionVersion, version, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        rel.id,
        input.targetSpace,
        rel.scopeType,
        rel.scopeId,
        rel.subjectEntityId,
        rel.metric,
        rel.value,
        rel.signalWeight,
        rel.decayHalfLifeDays,
        rel.lastEvidenceAt,
        rel.evidenceIdsJson,
        rel.projectionVersion,
        rel.version,
        rel.createdAt,
        rel.updatedAt
      );
    }
  }

  if ((input.profiles?.length ?? 0) > 0 && (await hasMemoryV2Table(db, 'memory_profiles'))) {
    for (const profile of input.profiles!) {
      await db.runAsync(
        `INSERT OR IGNORE INTO memory_profiles (
          id, space, scopeType, scopeId, profileJson, profileText,
          sourceClaimIdsJson, sourceMessageIdsJson, version, projectionVersion, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        profile.id,
        input.targetSpace,
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
  }
}

/**
 * Delete V2 claims plus projections, FTS, feedback, embeddings, events, and
 * unreferenced evidence rows in the given space.
 */
export async function deleteV2ClaimsAndOrphanedArtifacts(
  db: SQLiteDatabase,
  space: PixorySpace | null,
  claimIds: string[],
  extraEvidenceMessageIds: string[] = []
): Promise<void> {
  const uniqueClaimIds = Array.from(new Set(claimIds.filter(Boolean)));
  const candidateEvidenceIds = new Set<string>();

  if (uniqueClaimIds.length > 0 && (await hasMemoryV2Table(db, 'memory_events'))) {
    const placeholders = makePlaceholders(uniqueClaimIds.length);
    const eventRows = await db.getAllAsync<{ evidenceIdsJson: string }>(
      space
        ? `SELECT evidenceIdsJson FROM memory_events WHERE space = ? AND aggregateType = 'claim' AND aggregateId IN (${placeholders})`
        : `SELECT evidenceIdsJson FROM memory_events WHERE aggregateType = 'claim' AND aggregateId IN (${placeholders})`,
      ...(space ? [space, ...uniqueClaimIds] : uniqueClaimIds)
    );
    for (const row of eventRows) {
      for (const id of parseEvidenceIds(row.evidenceIdsJson)) {
        candidateEvidenceIds.add(id);
      }
    }
    await db.runAsync(
      space
        ? `DELETE FROM memory_events WHERE space = ? AND aggregateType = 'claim' AND aggregateId IN (${placeholders})`
        : `DELETE FROM memory_events WHERE aggregateType = 'claim' AND aggregateId IN (${placeholders})`,
      ...(space ? [space, ...uniqueClaimIds] : uniqueClaimIds)
    );
  }

  if (uniqueClaimIds.length > 0) {
    const placeholders = makePlaceholders(uniqueClaimIds.length);
    if (await hasMemoryV2Table(db, 'ai_memory_fts')) {
      await db.runAsync(
        `DELETE FROM ai_memory_fts WHERE id IN (${placeholders})`,
        ...uniqueClaimIds
      );
    }
    if (await hasMemoryV2Table(db, 'memory_board_projection')) {
      await db.runAsync(
        space
          ? `DELETE FROM memory_board_projection WHERE space = ? AND claimId IN (${placeholders})`
          : `DELETE FROM memory_board_projection WHERE claimId IN (${placeholders})`,
        ...(space ? [space, ...uniqueClaimIds] : uniqueClaimIds)
      );
    }
    if (await hasMemoryV2Table(db, 'memory_claim_feedback')) {
      await db.runAsync(
        space
          ? `DELETE FROM memory_claim_feedback WHERE space = ? AND claimId IN (${placeholders})`
          : `DELETE FROM memory_claim_feedback WHERE claimId IN (${placeholders})`,
        ...(space ? [space, ...uniqueClaimIds] : uniqueClaimIds)
      );
    }
    if (await hasMemoryV2Table(db, 'memory_embeddings')) {
      await db.runAsync(
        space
          ? `DELETE FROM memory_embeddings WHERE space = ? AND claimId IN (${placeholders})`
          : `DELETE FROM memory_embeddings WHERE claimId IN (${placeholders})`,
        ...(space ? [space, ...uniqueClaimIds] : uniqueClaimIds)
      );
    }
    if (await hasMemoryV2Table(db, 'memory_claims')) {
      await db.runAsync(
        `UPDATE memory_claims SET supersededByClaimId = NULL WHERE supersededByClaimId IN (${placeholders}) OR id IN (${placeholders})`,
        ...uniqueClaimIds,
        ...uniqueClaimIds
      );
      await db.runAsync(
        space
          ? `DELETE FROM memory_claims WHERE space = ? AND id IN (${placeholders})`
          : `DELETE FROM memory_claims WHERE id IN (${placeholders})`,
        ...(space ? [space, ...uniqueClaimIds] : uniqueClaimIds)
      );
    }
  }

  const uniqueMsgIds = Array.from(new Set(extraEvidenceMessageIds.filter(Boolean)));
  if (
    (candidateEvidenceIds.size > 0 || uniqueMsgIds.length > 0) &&
    (await hasMemoryV2Table(db, 'memory_evidence'))
  ) {
    if (uniqueMsgIds.length > 0) {
      const msgEvidenceRows = await db.getAllAsync<{ id: string }>(
        space
          ? `SELECT id FROM memory_evidence WHERE space = ? AND messageId IN (${makePlaceholders(uniqueMsgIds.length)})`
          : `SELECT id FROM memory_evidence WHERE messageId IN (${makePlaceholders(uniqueMsgIds.length)})`,
        ...(space ? [space, ...uniqueMsgIds] : uniqueMsgIds)
      );
      for (const row of msgEvidenceRows) {
        candidateEvidenceIds.add(row.id);
      }
    }

    if (candidateEvidenceIds.size > 0) {
      const hasEvents = await hasMemoryV2Table(db, 'memory_events');
      const evidenceIds = Array.from(candidateEvidenceIds);
      const referencedIds = new Set<string>();
      if (hasEvents) {
        const remainingEvents = await db.getAllAsync<{ evidenceIdsJson: string }>(
          space
            ? "SELECT evidenceIdsJson FROM memory_events WHERE space = ? AND evidenceIdsJson != '[]'"
            : "SELECT evidenceIdsJson FROM memory_events WHERE evidenceIdsJson != '[]'",
          ...(space ? [space] : [])
        );
        for (const row of remainingEvents) {
          for (const id of parseEvidenceIds(row.evidenceIdsJson)) {
            if (candidateEvidenceIds.has(id)) {
              referencedIds.add(id);
            }
          }
        }
      }
      const unreferencedIds = evidenceIds.filter((id) => !referencedIds.has(id));
      if (unreferencedIds.length > 0) {
        await db.runAsync(
          space
            ? `DELETE FROM memory_evidence WHERE space = ? AND id IN (${makePlaceholders(unreferencedIds.length)})`
            : `DELETE FROM memory_evidence WHERE id IN (${makePlaceholders(unreferencedIds.length)})`,
          ...(space ? [space, ...unreferencedIds] : unreferencedIds)
        );
      }
    }
  }
}

async function deleteV2AggregateScopeRows(
  db: SQLiteDatabase,
  space: PixorySpace | null,
  scopeType: 'thread' | 'role',
  scopeId: string
): Promise<void> {
  for (const table of ['memory_episodes', 'memory_relational_states', 'memory_profiles'] as const) {
    if (await hasMemoryV2Table(db, table)) {
      await db.runAsync(
        space
          ? `DELETE FROM ${table} WHERE space = ? AND scopeType = ? AND scopeId = ?`
          : `DELETE FROM ${table} WHERE scopeType = ? AND scopeId = ?`,
        ...(space ? [space, scopeType, scopeId] : [scopeType, scopeId])
      );
    }
  }
}

/**
 * Clean up all V2 memory tables scoped to a thread (and its branches) before thread deletion.
 */
export async function deleteThreadV2MemoryData(
  db: SQLiteDatabase,
  threadId: string,
  space: PixorySpace | null
): Promise<void> {
  if (await hasMemoryV2Table(db, 'memory_current_turn_observations')) {
    await db.runAsync(
      space
        ? 'DELETE FROM memory_current_turn_observations WHERE space = ? AND threadId = ?'
        : 'DELETE FROM memory_current_turn_observations WHERE threadId = ?',
      ...(space ? [space, threadId] : [threadId])
    );
  }

  let messageIds: string[] = [];
  if (await hasMemoryV2Table(db, 'ai_messages')) {
    const msgRows = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM ai_messages WHERE threadId = ?',
      threadId
    );
    messageIds = msgRows.map((row) => row.id);
  }

  let claimIds: string[] = [];
  if (await hasMemoryV2Table(db, 'memory_claims')) {
    const branchCondition = `(
            scopeType = 'branch' AND (
              sourceMessageId IN (SELECT id FROM ai_messages WHERE threadId = ?)
              OR (
                CASE
                  WHEN instr(COALESCE(scopeId, ''), ':') > 0
                    THEN substr(scopeId, 1, instr(scopeId, ':') - 1)
                  ELSE COALESCE(scopeId, '')
                END IN (SELECT id FROM ai_messages WHERE threadId = ?)
              )
            )
          )`;
    const claimRows = await db.getAllAsync<{ id: string }>(
      space
        ? `SELECT id FROM memory_claims
           WHERE space = ? AND ((scopeType = 'thread' AND scopeId = ?) OR ${branchCondition})`
        : `SELECT id FROM memory_claims
           WHERE (scopeType = 'thread' AND scopeId = ?) OR ${branchCondition}`,
      ...(space ? [space, threadId, threadId, threadId] : [threadId, threadId, threadId])
    );
    claimIds = claimRows.map((row) => row.id);
  }

  await deleteV2AggregateScopeRows(db, space, 'thread', threadId);
  await deleteV2ClaimsAndOrphanedArtifacts(db, space, claimIds, messageIds);
}

/**
 * Clean up all V2 memory claims and artifacts scoped to an unreferenced role card in a space.
 */
export async function deleteRoleV2MemoryData(
  db: SQLiteDatabase,
  space: PixorySpace,
  roleCardId: string
): Promise<void> {
  await deleteV2AggregateScopeRows(db, space, 'role', roleCardId);
  if (!(await hasMemoryV2Table(db, 'memory_claims'))) {
    return;
  }
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM memory_claims
     WHERE space = ? AND scopeType = 'role' AND scopeId = ?`,
    space,
    roleCardId
  );
  if (rows.length === 0) {
    return;
  }
  await deleteV2ClaimsAndOrphanedArtifacts(
    db,
    space,
    rows.map((row) => row.id)
  );
}
