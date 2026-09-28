import type { MemorySpeechMode } from '../memory/memoryTypes';

export const COMPANION_AFFECT_POLICY_VERSION = 'affect-policy-v1';

export interface CompanionAffectState {
  affection: number;
  security: number;
  arousal: number;
  agency: number;
}

export interface AffectPolicyEvent {
  category: string;
  subtype: string;
  intensity: number;
  sincerity: number;
  speechMode: MemorySpeechMode;
  confidence?: number;
}

export interface AffectPolicyContext {
  stage: 'new' | 'familiar' | 'trusted' | 'close';
  trust: number;
  unresolvedRupture: boolean;
}

const DECAY: CompanionAffectState = { affection: 0.01, security: 0.025, arousal: 0.12, agency: 0.08 };
const STAGE_WEIGHT: Record<AffectPolicyContext['stage'], number> = { new: 0.85, familiar: 1, trusted: 1.1, close: 1.15 };
const NON_EFFECTIVE = new Set<MemorySpeechMode>(['quoted', 'hypothetical', 'joke', 'roleplay', 'negated']);

const STIMULI: Record<string, CompanionAffectState> = {
  'interaction:praise': { affection: 4, security: 3, arousal: 2, agency: -0.5 },
  'interaction:gratitude': { affection: 3, security: 3, arousal: 1, agency: -0.5 },
  'interaction:playful_tease': { affection: 2.5, security: 1, arousal: 4, agency: 2 },
  'interaction:casual': { affection: 0.5, security: 0.4, arousal: 0.8, agency: 0 },
  'interaction:question': { affection: 0.5, security: 0.5, arousal: 1.5, agency: 0 },
  'relationship:vulnerable_disclosure': { affection: 5, security: -1, arousal: -1, agency: -3 },
  'user_affect:excitement': { affection: 4, security: 3, arousal: 5, agency: 1 },
  'user_affect:joy': { affection: 4, security: 3, arousal: 5, agency: 1 },
  'relationship:conflict': { affection: -5, security: -6, arousal: 5, agency: 3 },
  'relationship:rejection': { affection: -3, security: -5, arousal: -1, agency: -2 },
  'relationship:apology': { affection: 3, security: 5, arousal: -2, agency: -2 },
  'correction:fact': { affection: 0, security: -1, arousal: 1, agency: 0 },
  'correction:identity': { affection: 0, security: -1, arousal: 1, agency: 0 },
  'boundary:naming': { affection: 0, security: 0, arousal: 0, agency: -4 },
  'boundary:topic': { affection: 0, security: 0, arousal: 0, agency: -4 },
  'boundary:tone': { affection: 0, security: 0, arousal: 0, agency: -4 },
  'boundary:behavior': { affection: 0, security: 0, arousal: 0, agency: -4 },
  'relationship:repair_confirmed': { affection: 4, security: 7, arousal: -2, agency: 0 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function initialCompanionAffectState(): CompanionAffectState {
  return { affection: 0, security: 0, arousal: 0, agency: 0 };
}

export function decayAffectState(state: CompanionAffectState): CompanionAffectState {
  return {
    affection: state.affection * (1 - DECAY.affection),
    security: state.security * (1 - DECAY.security),
    arousal: state.arousal * (1 - DECAY.arousal),
    agency: state.agency * (1 - DECAY.agency),
  };
}

export function applyAffectEvent(
  state: CompanionAffectState,
  event: AffectPolicyEvent,
  context: AffectPolicyContext,
): CompanionAffectState {
  const decayed = decayAffectState(state);
  if (NON_EFFECTIVE.has(event.speechMode)) return decayed;
  const stimulus = STIMULI[`${event.category}:${event.subtype}`];
  if (!stimulus) return decayed;
  const uncertainWeight = event.speechMode === 'uncertain' ? 0.25 : 1;
  const trustMod = clamp(0.8 + context.trust / 250, 0.8, 1.2);
  const commonScale = clamp(event.intensity, 0, 1) * clamp(event.sincerity, 0, 1) * uncertainWeight
    * STAGE_WEIGHT[context.stage] * trustMod;
  const next = { ...decayed };
  for (const key of Object.keys(next) as Array<keyof CompanionAffectState>) {
    let raw = stimulus[key] * commonScale;
    if (context.unresolvedRupture && raw > 0 && key === 'security') raw *= 0.65;
    if (context.unresolvedRupture && raw > 0 && key === 'affection') raw *= 0.85;
    const capScale = Math.max(0.15, 1 - Math.abs(state[key]) / 120);
    const delta = clamp(raw * capScale, -8, 8);
    next[key] = clamp(decayed[key] + delta, -100, 100);
  }
  return next;
}

export function applyMemoryEcho(state: CompanionAffectState, echo: CompanionAffectState): CompanionAffectState {
  const clamped = (Object.keys(echo) as Array<keyof CompanionAffectState>).reduce<CompanionAffectState>((result, key) => {
    result[key] = clamp(echo[key], -1.5, 1.5);
    return result;
  }, initialCompanionAffectState());
  const total = Object.values(clamped).reduce((sum, value) => sum + Math.abs(value), 0);
  const scale = total > 4 ? 4 / total : 1;
  return {
    affection: clamp(state.affection + clamped.affection * scale, -100, 100),
    security: clamp(state.security + clamped.security * scale, -100, 100),
    arousal: clamp(state.arousal + clamped.arousal * scale, -100, 100),
    agency: clamp(state.agency + clamped.agency * scale, -100, 100),
  };
}

export const CompanionAffectPolicy = { applyEvent: applyAffectEvent, applyMemoryEcho, decay: decayAffectState, initial: initialCompanionAffectState };
