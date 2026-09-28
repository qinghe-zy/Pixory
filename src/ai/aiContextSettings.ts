export interface AiContextSettings {
  historyRoundLimit: number;
}

function buildSteppedValues(
  segments: ReadonlyArray<readonly [start: number, end: number, step: number]>,
): readonly number[] {
  const values = new Set<number>();
  for (const [start, end, step] of segments) {
    for (let value = start; value <= end; value += step) {
      values.add(value);
    }
  }
  return Object.freeze([...values].sort((left, right) => left - right));
}

// Fine-grained control for short chats and larger steps for very long threads.
export const AI_CONTEXT_HISTORY_ROUND_VALUES = buildSteppedValues([
  [4, 20, 1],
  [20, 60, 5],
  [60, 200, 10],
  [200, 500, 25],
  [500, 1000, 50],
  [1000, 2500, 100],
]);

export const AI_CONTEXT_DEFAULTS: Readonly<AiContextSettings> = Object.freeze({
  historyRoundLimit: 30,
});

type SliderAnchor = readonly [value: number, position: number];

const HISTORY_ROUND_SLIDER_ANCHORS: readonly SliderAnchor[] = Object.freeze([
  [4, 0],
  [15, 0.25],
  [60, 0.5],
  [200, 0.68],
  [500, 0.82],
  [2500, 1],
]);

function normalizeSliderPosition(position: unknown): number {
  if (typeof position !== 'number' || !Number.isFinite(position)) {
    return 0;
  }
  return Math.min(1, Math.max(0, position));
}

function interpolateValueToPosition(value: number, anchors: readonly SliderAnchor[]): number {
  if (!Number.isFinite(value) || value <= anchors[0][0]) {
    return anchors[0][1];
  }
  const lastAnchor = anchors[anchors.length - 1];
  if (value >= lastAnchor[0]) {
    return lastAnchor[1];
  }
  for (let index = 1; index < anchors.length; index += 1) {
    const upper = anchors[index];
    if (value <= upper[0]) {
      const lower = anchors[index - 1];
      const progress = (value - lower[0]) / (upper[0] - lower[0]);
      return lower[1] + progress * (upper[1] - lower[1]);
    }
  }
  return lastAnchor[1];
}

function snapPositionToSupportedValue(rawPosition: unknown): number {
  const position = normalizeSliderPosition(rawPosition);
  let closest = AI_CONTEXT_HISTORY_ROUND_VALUES[0];
  let closestDistance = Math.abs(position - interpolateValueToPosition(closest, HISTORY_ROUND_SLIDER_ANCHORS));
  for (let index = 1; index < AI_CONTEXT_HISTORY_ROUND_VALUES.length; index += 1) {
    const candidate = AI_CONTEXT_HISTORY_ROUND_VALUES[index];
    const distance = Math.abs(position - interpolateValueToPosition(candidate, HISTORY_ROUND_SLIDER_ANCHORS));
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

export function historyRoundsToPosition(rounds: number): number {
  return interpolateValueToPosition(rounds, HISTORY_ROUND_SLIDER_ANCHORS);
}

export function positionToHistoryRounds(position: number): number {
  return snapPositionToSupportedValue(position);
}

function snapToSupportedValue(rawValue: unknown, fallback: number): number {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    return fallback;
  }
  const clamped = Math.min(
    AI_CONTEXT_HISTORY_ROUND_VALUES[AI_CONTEXT_HISTORY_ROUND_VALUES.length - 1],
    Math.max(AI_CONTEXT_HISTORY_ROUND_VALUES[0], rawValue),
  );
  let closest = AI_CONTEXT_HISTORY_ROUND_VALUES[0];
  let closestDistance = Math.abs(clamped - closest);
  for (let index = 1; index < AI_CONTEXT_HISTORY_ROUND_VALUES.length; index += 1) {
    const candidate = AI_CONTEXT_HISTORY_ROUND_VALUES[index];
    const distance = Math.abs(clamped - candidate);
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

export function normalizeAiContextSettings(
  input: Partial<AiContextSettings> | Record<string, unknown> | null | undefined,
): AiContextSettings {
  return {
    historyRoundLimit: snapToSupportedValue(
      input?.historyRoundLimit,
      AI_CONTEXT_DEFAULTS.historyRoundLimit,
    ),
  };
}
