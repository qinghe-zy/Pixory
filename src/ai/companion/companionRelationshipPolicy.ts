import type { AffectPolicyEvent } from './companionAffectPolicy';

export const COMPANION_RELATIONSHIP_POLICY_VERSION = 'relationship-policy-v1';

export interface RelationshipProjection {
  stage: 'new' | 'familiar' | 'trusted' | 'close';
  trust: number;
  ruptureCount: number;
  affectionMomentum: number;
  atmosphere: 'warm' | 'neutral' | 'cool' | 'repairing';
  consecutivePositiveTurns: number;
  turnsSinceLastRupture: number;
  sharedEventCount: number;
  meaningfulTurns: number;
  recentRelevantTurnsWithoutViolation: number;
  unresolvedRepairIds: string[];
}

const TRUST_DELTAS: Record<string, number> = {
  'interaction:praise': 0.3,
  'interaction:gratitude': 0.3,
  'relationship:vulnerable_disclosure': 1,
  'commitment:completed': 2,
  'relationship:repair_confirmed': 2.5,
  'relationship:conflict': -1.5,
  'assistant:boundary_violation': -5,
};
const MEANINGFUL = new Set([
  'relationship:vulnerable_disclosure', 'relationship:conflict', 'relationship:rejection', 'relationship:apology',
  'relationship:repair_confirmed', 'interaction:praise', 'interaction:gratitude', 'commitment:created',
  'commitment:completed', 'correction:fact', 'correction:identity', 'boundary:naming', 'boundary:topic',
  'boundary:tone', 'boundary:behavior', 'user_affect:sadness', 'user_affect:anxiety', 'user_affect:loneliness',
  'user_affect:joy', 'user_affect:excitement',
]);
const SHARED = new Set([
  'relationship:vulnerable_disclosure', 'relationship:repair_confirmed', 'interaction:praise', 'interaction:gratitude',
  'commitment:created', 'commitment:completed', 'user_affect:joy', 'user_affect:excitement',
]);

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }

export function initialRelationshipProjection(): RelationshipProjection {
  return {
    affectionMomentum: 0,
    atmosphere: 'neutral',
    consecutivePositiveTurns: 0,
    meaningfulTurns: 0,
    recentRelevantTurnsWithoutViolation: 0,
    ruptureCount: 0,
    sharedEventCount: 0,
    stage: 'new',
    trust: 35,
    turnsSinceLastRupture: 0,
    unresolvedRepairIds: [],
  };
}

export function recalculateRelationshipStage(state: RelationshipProjection): RelationshipProjection {
  let stage = state.stage;
  if (stage === 'close' && (state.trust < 55 || state.unresolvedRepairIds.length >= 2)) stage = 'trusted';
  if (stage === 'trusted' && (state.trust < 35 || state.unresolvedRepairIds.length >= 3)) stage = 'familiar';
  if (stage === 'new' && state.meaningfulTurns >= 8 && state.sharedEventCount >= 3 && state.trust >= 42) stage = 'familiar';
  if (stage === 'familiar' && state.meaningfulTurns >= 20 && state.sharedEventCount >= 8 && state.trust >= 65 && state.unresolvedRepairIds.length === 0) stage = 'trusted';
  if (stage === 'trusted' && state.meaningfulTurns >= 50 && state.sharedEventCount >= 18 && state.trust >= 82 && state.recentRelevantTurnsWithoutViolation >= 10 && state.unresolvedRepairIds.length === 0) stage = 'close';
  return { ...state, stage };
}

export function applyRelationshipEvent(state: RelationshipProjection, event: AffectPolicyEvent): RelationshipProjection {
  if (['quoted', 'hypothetical', 'joke', 'roleplay', 'negated'].includes(event.speechMode)) return state;
  const key = `${event.category}:${event.subtype}`;
  const trustDelta = clamp((TRUST_DELTAS[key] ?? 0) * clamp(event.intensity, 0, 1) * clamp(event.sincerity, 0, 1), -5, 3);
  const rupture = key === 'relationship:conflict' || key === 'relationship:rejection' || key === 'assistant:boundary_violation';
  const positive = trustDelta > 0;
  const next: RelationshipProjection = {
    ...state,
    affectionMomentum: clamp(state.affectionMomentum * 0.85 + trustDelta, -20, 20),
    atmosphere: rupture ? 'cool' : key === 'relationship:repair_confirmed' ? 'warm' : state.unresolvedRepairIds.length > 0 ? 'repairing' : positive ? 'warm' : state.atmosphere,
    consecutivePositiveTurns: positive ? state.consecutivePositiveTurns + 1 : rupture ? 0 : state.consecutivePositiveTurns,
    meaningfulTurns: state.meaningfulTurns + (MEANINGFUL.has(key) ? 1 : 0),
    recentRelevantTurnsWithoutViolation: rupture ? 0 : state.recentRelevantTurnsWithoutViolation + (MEANINGFUL.has(key) ? 1 : 0),
    ruptureCount: state.ruptureCount + (rupture ? 1 : 0),
    sharedEventCount: state.sharedEventCount + (SHARED.has(key) ? 1 : 0),
    trust: clamp(state.trust + trustDelta, 0, 100),
    turnsSinceLastRupture: rupture ? 0 : state.turnsSinceLastRupture + (MEANINGFUL.has(key) ? 1 : 0),
  };
  return recalculateRelationshipStage(next);
}

export function applyOfflineElapsed(state: RelationshipProjection, _days: number): RelationshipProjection {
  return { ...state, unresolvedRepairIds: [...state.unresolvedRepairIds] };
}

export const CompanionRelationshipPolicy = { applyEvent: applyRelationshipEvent, applyOfflineElapsed, initial: initialRelationshipProjection, recalculateStage: recalculateRelationshipStage };
