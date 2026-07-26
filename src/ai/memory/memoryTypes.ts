import type { PixorySpace } from '../../database/db';

export type MemorySpace = PixorySpace;
export type MemoryLane = 'confirmed' | 'working' | 'archive';
export type MemoryStatus =
  | 'tentative'
  | 'committed'
  | 'confirmed'
  | 'stale'
  | 'superseded'
  | 'conflicted'
  | 'suppressed'
  | 'deleted';
export type MemoryKind = 'state' | 'episode' | 'task' | 'commitment' | 'relational_signal';
export type MemoryActor = 'user' | 'companion' | 'joint';
export type MemoryScopeType = 'global' | 'role' | 'ip' | 'knowledge_base' | 'thread' | 'branch';
export type MemorySpeechMode =
  | 'asserted'
  | 'corrected'
  | 'negated'
  | 'hypothetical'
  | 'joke'
  | 'quoted'
  | 'roleplay'
  | 'uncertain';
export type MemoryConfidenceBand = 'high' | 'medium' | 'low';
export type MemoryStability = 'ephemeral' | 'short' | 'long' | 'permanent';
export type MemoryPolarity = 'positive' | 'negative' | 'unknown';
export type MemorySafetyState = 'none' | 'safety_pending' | 'safety_confirmed';
export type MemorySourceKind = 'message' | 'summary' | 'import' | 'manual' | 'assistant_commitment';

export interface MemoryClaimRecord {
  id: string;
  space: MemorySpace;
  schemaVersion: number;
  canonicalClaimId: string;
  relatedClaimGroupId: string | null;
  lane: MemoryLane;
  status: MemoryStatus;
  kind: MemoryKind;
  actor: MemoryActor;
  subjectEntityId: string;
  subjectDisplay: string;
  scopeType: MemoryScopeType;
  scopeId: string | null;
  predicate: string;
  valueNormalized: string;
  valueDisplay: string;
  polarity: MemoryPolarity;
  speechMode: MemorySpeechMode;
  rawTimePhrase: string | null;
  validFrom: string | null;
  validTo: string | null;
  validPrecision: 'exact' | 'day' | 'month' | 'relative' | 'unknown';
  confidenceRaw: number;
  confidenceCalibrated: number | null;
  confidenceBand: MemoryConfidenceBand;
  importance: number;
  stability: MemoryStability;
  manualLocked: boolean;
  safetyState: MemorySafetyState;
  sourceKind: MemorySourceKind;
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

export interface MemoryClaimInput {
  id?: string;
  space: MemorySpace;
  canonicalClaimId?: string;
  relatedClaimGroupId?: string | null;
  lane?: MemoryLane;
  status?: MemoryStatus;
  kind: MemoryKind;
  actor?: MemoryActor;
  subjectEntityId?: string;
  subjectDisplay?: string;
  scopeType: MemoryScopeType;
  scopeId?: string | null;
  predicate: string;
  valueNormalized: string;
  valueDisplay?: string;
  polarity?: MemoryPolarity;
  speechMode?: MemorySpeechMode;
  rawTimePhrase?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  validPrecision?: MemoryClaimRecord['validPrecision'];
  confidenceRaw?: number;
  confidenceCalibrated?: number | null;
  confidenceBand?: MemoryConfidenceBand;
  importance?: number;
  stability?: MemoryStability;
  manualLocked?: boolean;
  safetyState?: MemorySafetyState;
  sourceKind?: MemorySourceKind;
  sourceMessageId?: string | null;
  extractorVersion?: string;
  ontologyVersion?: string;
}

export interface MemoryEpisodeRecord {
  id: string;
  space: MemorySpace;
  scopeType: Exclude<MemoryScopeType, 'branch'>;
  scopeId: string | null;
  lane: MemoryLane;
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
  confidenceBand: MemoryConfidenceBand;
  importance: number;
  projectionVersion: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
}

export interface MemoryRelationalStateRecord {
  id: string;
  space: MemorySpace;
  scopeType: Exclude<MemoryScopeType, 'global' | 'branch'>;
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

export interface MemoryProfileRecord {
  id: string;
  space: MemorySpace;
  scopeType: Exclude<MemoryScopeType, 'global' | 'branch'>;
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

export interface MemoryEventRecord {
  id: string;
  space: MemorySpace;
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

export interface MemoryEventInput {
  id?: string;
  space: MemorySpace;
  aggregateType: MemoryEventRecord['aggregateType'];
  aggregateId: string;
  eventType: string;
  eventVersion?: number;
  commandId: string;
  eventSequence: number;
  actorType: MemoryEventRecord['actorType'];
  actorId?: string | null;
  source: string;
  payload: unknown;
  evidenceIds?: string[];
  projectionVersion: number;
  createdAt?: string;
}

export interface MemoryProjectionMeta {
  space: MemorySpace;
  projectionVersion: number;
  memoryEpoch: number;
  ontologyVersion: string;
  retrievalScorerVersion: string;
  lastRebuiltAt: string | null;
  updatedAt: string;
}

export type MemoryIntent =
  | 'none'
  | 'recall'
  | 'correction'
  | 'forget'
  | 'confirm'
  | 'historical'
  | 'safety';

export interface MemoryCurrentTurnObservation {
  id: string;
  space: MemorySpace;
  threadId: string;
  branchRootMessageId: string | null;
  branchVersionIndex: number | null;
  messageId: string;
  intent: MemoryIntent;
  explicitUserAction: boolean;
  payloadJson: string;
  status: 'pending' | 'consumed' | 'expired' | 'deleted';
  extractorVersion: string;
  idempotencyKey: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  deletedAt: string | null;
}

export interface MemoryClaimCandidate {
  subjectEntityId?: string;
  subjectDisplay?: string;
  scopeType: MemoryScopeType;
  scopeId?: string | null;
  predicate: string;
  valueNormalized: string;
  valueDisplay: string;
  kind: MemoryKind;
  actor?: MemoryActor;
  polarity?: MemoryPolarity;
  speechMode?: MemorySpeechMode;
  confidenceRaw?: number;
  confidenceBand?: MemoryConfidenceBand;
  importance?: number;
  stability?: MemoryStability;
  safetyState?: MemorySafetyState;
  validPrecision?: MemoryClaimRecord['validPrecision'];
  rawTimePhrase?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
}

export function resolveCalibratedConfidence(
  confidenceCalibrated: number | null | undefined,
  confidenceBand: MemoryConfidenceBand
): number {
  if (confidenceCalibrated != null && Number.isFinite(confidenceCalibrated)) {
    return Math.max(0, Math.min(1, confidenceCalibrated));
  }
  return confidenceBand === 'high' ? 0.95 : confidenceBand === 'medium' ? 0.7 : 0.35;
}

export function resolveConfirmationGovernance(
  claim: Pick<MemoryClaimRecord, 'manualLocked' | 'safetyState'>,
  actorType: 'user' | 'system' | 'model' | 'import'
): Pick<MemoryClaimRecord, 'manualLocked' | 'safetyState'> {
  if (claim.safetyState === 'safety_pending' && actorType !== 'user') {
    throw new Error('memory_safety_confirmation_requires_user');
  }
  return {
    manualLocked: claim.manualLocked || actorType === 'user',
    safetyState: claim.safetyState === 'safety_pending' ? 'safety_confirmed' : claim.safetyState,
  };
}
