export type AiGenerationJobState =
  | 'prepared'
  | 'requesting'
  | 'streaming'
  | 'reconciling'
  | 'recoverable_interrupted'
  | 'retrying'
  | 'continuing'
  | 'completed'
  | 'failed'
  | 'stopped';

const TERMINAL_STATES = new Set<AiGenerationJobState>(['completed', 'failed', 'stopped']);
const TRANSITIONS: Record<AiGenerationJobState, ReadonlySet<AiGenerationJobState>> = {
  prepared: new Set(['requesting', 'recoverable_interrupted', 'failed', 'stopped']),
  requesting: new Set(['streaming', 'recoverable_interrupted', 'failed', 'stopped']),
  streaming: new Set(['reconciling', 'recoverable_interrupted', 'completed', 'failed', 'stopped']),
  reconciling: new Set(['recoverable_interrupted', 'retrying', 'continuing', 'completed', 'failed', 'stopped']),
  recoverable_interrupted: new Set(['reconciling', 'retrying', 'continuing', 'failed', 'stopped']),
  retrying: new Set(['requesting', 'streaming', 'recoverable_interrupted', 'completed', 'failed', 'stopped']),
  continuing: new Set(['requesting', 'streaming', 'recoverable_interrupted', 'completed', 'failed', 'stopped']),
  completed: new Set(),
  failed: new Set(),
  stopped: new Set(),
};

export function isTerminalGenerationState(state: AiGenerationJobState): boolean {
  return TERMINAL_STATES.has(state);
}

export function canTransitionGeneration(from: AiGenerationJobState, to: AiGenerationJobState): boolean {
  return from === to || TRANSITIONS[from].has(to);
}

export function decideGenerationRecovery(input: {
  continuationCount: number;
  partialContent: string;
  retryCount: number;
}): 'continue' | 'retry' | 'stop' {
  if (input.partialContent.trim()) return input.continuationCount < 1 ? 'continue' : 'stop';
  return input.retryCount < 1 ? 'retry' : 'stop';
}

export function mergeContinuationDelta(initialPartial: string, currentText: string, delta: string): string {
  if (!delta || currentText !== initialPartial || !initialPartial) return currentText + delta;
  const tail = initialPartial.slice(-320);
  const maxOverlap = Math.min(tail.length, delta.length);
  // CJK clauses can be only four code units long (for example “风很轻。”).
  // Below four characters the false-positive risk is too high for automatic merging.
  for (let overlap = maxOverlap; overlap >= 4; overlap -= 1) {
    if (tail.endsWith(delta.slice(0, overlap))) return currentText + delta.slice(overlap);
  }
  return currentText + delta;
}
