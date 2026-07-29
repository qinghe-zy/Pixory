import type { SQLiteDatabase } from 'expo-sqlite';

import type { PixorySpace } from '../../database/db';
import { createTimestamp } from '../../database/utils';
import { COMPANION_AFFECT_POLICY_VERSION, type CompanionAffectState } from './companionAffectPolicy';
import { COMPANION_RELATIONSHIP_POLICY_VERSION, type RelationshipProjection } from './companionRelationshipPolicy';
import { COMPANION_REPAIR_POLICY_VERSION, type CompanionRepairDraft, type CompanionRepairState } from './companionRepairService';
import type { CompanionStance } from './companionStancePlanner';
import { hashCompanionText, parseCompanionJsonArray, parseCompanionJsonObject } from './companionRuntimeValidation';

export interface CompanionProjectionSnapshotRecord {
  id: string;
  space: PixorySpace;
  scopeType: 'role_base' | 'branch_overlay' | 'thread';
  roleCardId: string | null;
  threadId: string | null;
  branchRouteHash: string;
  lineageVersion: number;
  basedOnEventSequence: number;
  affect: CompanionAffectState;
  relationship: RelationshipProjection;
  stance: CompanionStance;
  policyVersion: string;
  status: 'active' | 'stale' | 'rebuilding';
  createdAt: string;
  updatedAt: string;
}

export interface CompanionRepairRecord extends CompanionRepairDraft {
  id: string;
  space: PixorySpace;
  roleCardId: string | null;
  threadId: string;
  branchRouteHash: string;
  lineageVersion: number;
  sourceMessageVersionHash: string;
  lastCheckedAssistantMessageId: string | null;
  resolutionEvidenceMessageId: string | null;
  policyVersion: string;
  createdAt: string;
  updatedAt: string;
}

function isAffect(value: Record<string, unknown>): value is Record<keyof CompanionAffectState, number> {
  return ['affection', 'security', 'arousal', 'agency'].every((key) => Number.isFinite(value[key]));
}

function validRelationship(value: Record<string, unknown>): boolean {
  return ['stage', 'trust', 'ruptureCount', 'meaningfulTurns', 'sharedEventCount', 'unresolvedRepairIds'].every((key) => key in value)
    && Array.isArray(value.unresolvedRepairIds);
}

function validStance(value: Record<string, unknown>): boolean {
  return typeof value.primaryIntent === 'string' && typeof value.label === 'string';
}

function mapProjection(row: Record<string, unknown>): CompanionProjectionSnapshotRecord | null {
  const relationship = parseCompanionJsonObject(String(row.relationshipJson));
  const stance = parseCompanionJsonObject(String(row.stanceJson));
  const affect = { affection: Number(row.affection), security: Number(row.security), arousal: Number(row.arousal), agency: Number(row.agency) };
  if (!relationship || !stance || !isAffect(affect) || !validRelationship(relationship) || !validStance(stance)) return null;
  return {
    affect,
    basedOnEventSequence: Number(row.basedOnEventSequence),
    branchRouteHash: String(row.branchRouteHash),
    createdAt: String(row.createdAt),
    id: String(row.id),
    lineageVersion: Number(row.lineageVersion),
    policyVersion: String(row.policyVersion),
    relationship: relationship as unknown as RelationshipProjection,
    roleCardId: (row.roleCardId as string | null) ?? null,
    scopeType: row.scopeType as CompanionProjectionSnapshotRecord['scopeType'],
    space: row.space as PixorySpace,
    stance: stance as unknown as CompanionStance,
    status: row.status as CompanionProjectionSnapshotRecord['status'],
    threadId: (row.threadId as string | null) ?? null,
    updatedAt: String(row.updatedAt),
  };
}

function mapRepair(row: Record<string, unknown>): CompanionRepairRecord | null {
  const forbiddenTerms = parseCompanionJsonArray(String(row.forbiddenTermsJson));
  if (!forbiddenTerms || forbiddenTerms.some((term) => typeof term !== 'string')) return null;
  return {
    branchRouteHash: String(row.branchRouteHash),
    category: row.category as 'boundary' | 'correction',
    constraintText: String(row.constraintText),
    createdAt: String(row.createdAt),
    forbiddenTerms: forbiddenTerms as string[],
    id: String(row.id),
    lastCheckedAssistantMessageId: (row.lastCheckedAssistantMessageId as string | null) ?? null,
    lineageVersion: Number(row.lineageVersion),
    passedRelevantTurns: Number(row.passedRelevantTurns),
    policyVersion: String(row.policyVersion),
    resolutionEvidenceMessageId: (row.resolutionEvidenceMessageId as string | null) ?? null,
    roleCardId: (row.roleCardId as string | null) ?? null,
    semanticReviewRequired: Number(row.semanticReviewRequired) === 1,
    sourceEventId: String(row.sourceEventId),
    sourceMessageId: String(row.sourceMessageId),
    sourceMessageVersionHash: String(row.sourceMessageVersionHash),
    space: row.space as PixorySpace,
    state: row.state as CompanionRepairState,
    subtype: String(row.subtype),
    threadId: String(row.threadId),
    updatedAt: String(row.updatedAt),
    violationCount: Number(row.violationCount),
  };
}

export async function saveCompanionProjection(db: SQLiteDatabase, input: Omit<CompanionProjectionSnapshotRecord, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<CompanionProjectionSnapshotRecord> {
  const id = `cproj_${hashCompanionText([input.space, input.scopeType, input.roleCardId ?? '', input.threadId ?? '', input.branchRouteHash, input.lineageVersion].join('\u001F')).slice(0, 32)}`;
  const now = createTimestamp();
  await db.runAsync(
    `INSERT INTO companion_projection_snapshots (
       id, space, scopeType, roleCardId, threadId, branchRouteHash, lineageVersion, basedOnEventSequence,
       affection, security, arousal, agency, relationshipJson, stanceJson, policyVersion, status, createdAt, updatedAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
     ON CONFLICT(id) DO UPDATE SET basedOnEventSequence = excluded.basedOnEventSequence,
       affection = excluded.affection, security = excluded.security, arousal = excluded.arousal, agency = excluded.agency,
       relationshipJson = excluded.relationshipJson, stanceJson = excluded.stanceJson,
       policyVersion = excluded.policyVersion, status = 'active', updatedAt = excluded.updatedAt`,
    id, input.space, input.scopeType, input.roleCardId, input.threadId, input.branchRouteHash, input.lineageVersion,
    input.basedOnEventSequence, input.affect.affection, input.affect.security, input.affect.arousal, input.affect.agency,
    JSON.stringify(input.relationship), JSON.stringify(input.stance), input.policyVersion, now, now,
  );
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_projection_snapshots WHERE id = ?', id);
  const mapped = row ? mapProjection(row) : null;
  if (!mapped) throw new Error('companion_projection_write_failed');
  return mapped;
}

export async function findCompanionProjection(db: SQLiteDatabase, input: {
  space: PixorySpace; scopeType: CompanionProjectionSnapshotRecord['scopeType']; roleCardId?: string | null;
  threadId?: string | null; branchRouteHash?: string; lineageVersion?: number;
}): Promise<CompanionProjectionSnapshotRecord | null> {
  const id = `cproj_${hashCompanionText([input.space, input.scopeType, input.roleCardId ?? '', input.threadId ?? '', input.branchRouteHash ?? '', input.lineageVersion ?? 0].join('\u001F')).slice(0, 32)}`;
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_projection_snapshots WHERE id = ? AND status = \'active\'', id);
  return row ? mapProjection(row) : null;
}

export async function upsertAffectiveObservation(db: SQLiteDatabase, input: {
  space: PixorySpace; roleCardId?: string | null; threadId: string; branchRouteHash: string; lineageVersion: number;
  sourceEventId: string; sourceMessageId: string; sourceMessageVersionHash: string; label: string; confidence: number;
  expiresAt: string; expiresAfterRound: number;
}): Promise<void> {
  const now = createTimestamp();
  const id = `caobs_${hashCompanionText(`${input.space}\u001F${input.sourceEventId}`).slice(0, 32)}`;
  await db.runAsync(
    `INSERT OR IGNORE INTO companion_affective_observations (
       id, space, roleCardId, threadId, branchRouteHash, lineageVersion, sourceEventId, sourceMessageId,
       sourceMessageVersionHash, label, confidence, expiresAt, expiresAfterRound, status, createdAt, updatedAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    id, input.space, input.roleCardId ?? null, input.threadId, input.branchRouteHash, input.lineageVersion,
    input.sourceEventId, input.sourceMessageId, input.sourceMessageVersionHash, input.label, input.confidence,
    input.expiresAt, input.expiresAfterRound, now, now,
  );
}

export async function upsertCompanionRepair(db: SQLiteDatabase, input: {
  space: PixorySpace; roleCardId?: string | null; threadId: string; branchRouteHash: string; lineageVersion: number;
  sourceMessageVersionHash: string; draft: CompanionRepairDraft;
}): Promise<CompanionRepairRecord> {
  const now = createTimestamp();
  const id = `crepair_${hashCompanionText(`${input.space}\u001F${input.draft.sourceEventId}`).slice(0, 32)}`;
  await db.runAsync(
    `INSERT OR IGNORE INTO companion_repairs (
       id, space, roleCardId, threadId, branchRouteHash, lineageVersion, sourceEventId, sourceMessageId,
       sourceMessageVersionHash, category, subtype, constraintText, forbiddenTermsJson, state,
       passedRelevantTurns, violationCount, semanticReviewRequired, policyVersion, createdAt, updatedAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, input.space, input.roleCardId ?? null, input.threadId, input.branchRouteHash, input.lineageVersion,
    input.draft.sourceEventId, input.draft.sourceMessageId, input.sourceMessageVersionHash, input.draft.category,
    input.draft.subtype, input.draft.constraintText, JSON.stringify(input.draft.forbiddenTerms), input.draft.state,
    input.draft.passedRelevantTurns, input.draft.violationCount, input.draft.semanticReviewRequired ? 1 : 0,
    COMPANION_REPAIR_POLICY_VERSION, now, now,
  );
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_repairs WHERE sourceEventId = ?', input.draft.sourceEventId);
  const mapped = row ? mapRepair(row) : null;
  if (!mapped) throw new Error('companion_repair_write_failed');
  return mapped;
}

export async function listCompanionRepairs(db: SQLiteDatabase, input: {
  space: PixorySpace; threadId: string; branchRouteHash: string; lineageVersion: number; states?: CompanionRepairState[];
}): Promise<CompanionRepairRecord[]> {
  const states = input.states ?? ['constrained', 'acknowledged', 'observing', 'violated'];
  if (states.length === 0) return [];
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM companion_repairs WHERE space = ? AND threadId = ? AND branchRouteHash = ? AND lineageVersion = ?
       AND state IN (${states.map(() => '?').join(', ')}) ORDER BY updatedAt DESC, id ASC`,
    input.space, input.threadId, input.branchRouteHash, input.lineageVersion, ...states,
  );
  return rows.map(mapRepair).filter((item): item is CompanionRepairRecord => item != null);
}

export async function findCompanionRepair(db: SQLiteDatabase, id: string): Promise<CompanionRepairRecord | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM companion_repairs WHERE id = ?', id);
  return row ? mapRepair(row) : null;
}

export async function updateCompanionRepair(db: SQLiteDatabase, input: {
  id: string; state: CompanionRepairState; passedRelevantTurns: number; violationCount: number;
  lastCheckedAssistantMessageId?: string | null; resolutionEvidenceMessageId?: string | null;
}): Promise<void> {
  await db.runAsync(
    `UPDATE companion_repairs SET state = ?, passedRelevantTurns = ?, violationCount = ?,
       lastCheckedAssistantMessageId = ?, resolutionEvidenceMessageId = COALESCE(?, resolutionEvidenceMessageId), updatedAt = ? WHERE id = ?`,
    input.state, input.passedRelevantTurns, input.violationCount, input.lastCheckedAssistantMessageId ?? null,
    input.resolutionEvidenceMessageId ?? null, createTimestamp(), input.id,
  );
}

export function companionProjectionPolicyVersion(): string {
  return `${COMPANION_AFFECT_POLICY_VERSION}+${COMPANION_RELATIONSHIP_POLICY_VERSION}`;
}

export const CompanionProjectionRepository = {
  find: findCompanionProjection,
  findRepair: findCompanionRepair,
  listRepairs: listCompanionRepairs,
  save: saveCompanionProjection,
  updateRepair: updateCompanionRepair,
  upsertAffectiveObservation,
  upsertRepair: upsertCompanionRepair,
};
