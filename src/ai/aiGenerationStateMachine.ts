export type AiGenerationPhase =
  | 'created'
  | 'local_persisted'
  | 'request_started'
  | 'first_byte'
  | 'reasoning'
  | 'answer'
  | 'terminal'
  | 'final_persisted'
  | 'ui_stable';

export type AiGenerationTerminalPhase = 'terminal' | 'final_persisted' | 'ui_stable';

const allowedTransitions: Record<AiGenerationPhase, readonly AiGenerationPhase[]> = {
  created: ['local_persisted', 'request_started', 'terminal'],
  local_persisted: ['request_started', 'terminal'],
  request_started: ['first_byte', 'reasoning', 'answer', 'terminal'],
  first_byte: ['reasoning', 'answer', 'terminal'],
  reasoning: ['reasoning', 'answer', 'terminal'],
  answer: ['answer', 'terminal'],
  terminal: ['final_persisted'],
  final_persisted: ['ui_stable'],
  ui_stable: [],
};

export interface AiGenerationState {
  generationId: string;
  threadId: string;
  messageId: string;
  phase: AiGenerationPhase;
  startedAtUtc: string;
  phaseStartedAtUtc: string;
  lastUpdatedAtUtc: string;
}

export interface AiGenerationTransitionResult {
  accepted: boolean;
  state: AiGenerationState;
  reason?: 'invalid_transition' | 'duplicate_terminal' | 'after_ui_stable';
}

export function createAiGenerationState(input: { generationId: string; threadId: string; messageId: string; occurredAtUtc: string }): AiGenerationState {
  return { generationId: input.generationId, threadId: input.threadId, messageId: input.messageId, phase: 'created', startedAtUtc: input.occurredAtUtc, phaseStartedAtUtc: input.occurredAtUtc, lastUpdatedAtUtc: input.occurredAtUtc };
}

export function transitionAiGeneration(state: AiGenerationState, nextPhase: AiGenerationPhase, occurredAtUtc: string): AiGenerationTransitionResult {
  if (state.phase === 'ui_stable') return { accepted: false, state, reason: 'after_ui_stable' };
  if (state.phase === nextPhase) return { accepted: state.phase !== 'terminal', state: { ...state, lastUpdatedAtUtc: occurredAtUtc }, reason: state.phase === 'terminal' ? 'duplicate_terminal' : undefined };
  if (!allowedTransitions[state.phase].includes(nextPhase)) return { accepted: false, state, reason: 'invalid_transition' };
  return { accepted: true, state: { ...state, phase: nextPhase, phaseStartedAtUtc: occurredAtUtc, lastUpdatedAtUtc: occurredAtUtc } };
}

export function isAiGenerationTerminalPhase(phase: AiGenerationPhase): phase is AiGenerationTerminalPhase { return phase === 'terminal' || phase === 'final_persisted' || phase === 'ui_stable'; }