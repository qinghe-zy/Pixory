import type { CompanionEventCategory } from './companionTypes';

export const COMPANION_EVENT_EXTRACTOR_VERSION = 'companion-observer-v1';
export const COMPANION_EVENT_POLICY_VERSION = 'companion-event-policy-v1';

export const COMPANION_EVENT_THRESHOLDS: Record<CompanionEventCategory, number> = {
  artifact: 0.75,
  assistant: 0.75,
  boundary: 0.85,
  commitment: 0.85,
  correction: 0.85,
  interaction: 0.70,
  relationship: 0.70,
  temporal: 0.85,
  user_affect: 0.65,
};

export const NON_EFFECTIVE_SPEECH_MODES = new Set([
  'hypothetical',
  'joke',
  'quoted',
  'roleplay',
]);
