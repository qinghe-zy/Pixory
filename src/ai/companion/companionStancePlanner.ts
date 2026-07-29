import type { CompanionAffectState } from './companionAffectPolicy';
import type { RelationshipProjection } from './companionRelationshipPolicy';

export const COMPANION_STANCE_POLICY_VERSION = 'stance-policy-v1';

export interface CompanionStance {
  warmth: 'low' | 'medium' | 'high';
  reassurance: 'none' | 'light' | 'strong';
  energy: 'quiet' | 'steady' | 'lively';
  assertiveness: 'low' | 'medium' | 'high';
  playfulness: 'off' | 'light' | 'on';
  intimacy: 'reserved' | 'familiar' | 'close';
  proximity: 'defensive' | 'neutral' | 'close';
  responseLength: 'short' | 'medium' | 'long';
  primaryIntent: 'answer' | 'comfort' | 'celebrate' | 'repair' | 'listen' | 'clarify';
  optionalTopicId: string | null;
  label: 'calm' | 'warm' | 'quiet_fond' | 'playful' | 'concerned' | 'hurt' | 'defensive' | 'repairing' | 'excited';
}

type CurrentEvent = { category: string; subtype: string; confidence?: number };

export function planCompanionStance(input: {
  affect: CompanionAffectState;
  relationship: RelationshipProjection;
  currentEvents: CurrentEvent[];
  unresolvedRepair: boolean;
  optionalTopicId?: string | null;
}): CompanionStance {
  const has = (...keys: string[]) => input.currentEvents.some((event) => keys.includes(`${event.category}:${event.subtype}`) && (event.confidence ?? 1) >= 0.65);
  const needsComfort = has('user_affect:sadness', 'user_affect:anxiety', 'user_affect:loneliness', 'user_affect:fatigue');
  const celebrates = has('user_affect:joy', 'user_affect:excitement');
  const primaryIntent: CompanionStance['primaryIntent'] = input.unresolvedRepair ? 'repair' : needsComfort ? 'comfort' : celebrates ? 'celebrate' : 'answer';
  const warmth = input.affect.affection >= 25 || input.relationship.stage === 'close' ? 'high' : input.affect.affection <= -15 ? 'low' : 'medium';
  const energy = celebrates || input.affect.arousal >= 30 ? 'lively' : needsComfort || input.affect.arousal <= -15 ? 'quiet' : 'steady';
  const intimacy: CompanionStance['intimacy'] = input.relationship.stage === 'close' ? 'close' : input.relationship.stage === 'new' ? 'reserved' : 'familiar';
  const label: CompanionStance['label'] = input.unresolvedRepair ? 'repairing'
    : celebrates ? 'excited'
      : needsComfort ? 'concerned'
        : input.affect.security < -25 ? 'defensive'
          : input.affect.affection > 35 && input.affect.arousal > 20 ? 'playful'
            : input.affect.affection > 20 ? 'warm'
              : input.affect.arousal < -15 ? 'quiet_fond'
                : 'calm';
  return {
    assertiveness: input.unresolvedRepair || input.affect.agency < -20 ? 'low' : input.affect.agency > 25 ? 'high' : 'medium',
    energy,
    intimacy,
    label,
    optionalTopicId: input.optionalTopicId ?? null,
    playfulness: input.unresolvedRepair || needsComfort ? 'off' : label === 'playful' ? 'on' : warmth === 'high' ? 'light' : 'off',
    primaryIntent,
    proximity: input.unresolvedRepair || input.affect.security < -25 ? 'defensive' : warmth === 'high' ? 'close' : 'neutral',
    reassurance: needsComfort ? (input.affect.security < -20 ? 'strong' : 'light') : input.unresolvedRepair ? 'light' : 'none',
    responseLength: input.unresolvedRepair ? 'short' : needsComfort ? 'medium' : 'medium',
    warmth,
  };
}

export const CompanionStancePlanner = { plan: planCompanionStance };
