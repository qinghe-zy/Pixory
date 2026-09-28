export type MediaScrollDirection = -1 | 0 | 1;
export type MediaMemoryPressure = 'normal' | 'high';

export interface MediaScrollSample {
  direction: MediaScrollDirection;
  memoryPressure: MediaMemoryPressure;
  velocity: number;
}

export interface MediaPrefetchWindow {
  encodedAhead: number;
  encodedBehind: number;
  decodedAhead: number;
  decodedBehind: number;
}

export interface BuildPrefetchIndicesInput {
  currentIndex: number;
  direction: MediaScrollDirection;
  itemCount: number;
  kind: 'encoded' | 'decoded';
  window: MediaPrefetchWindow;
}

export const MEDIA_PREFETCH_MEDIUM_VELOCITY = 0.75;
export const MEDIA_PREFETCH_FAST_VELOCITY = 2.5;

export function resolveMediaPrefetchWindow(sample: MediaScrollSample): MediaPrefetchWindow {
  const velocity = Math.abs(sample.velocity);
  const base = velocity >= MEDIA_PREFETCH_FAST_VELOCITY
    ? { decodedAhead: 6, decodedBehind: 3, encodedAhead: 32, encodedBehind: 8 }
    : velocity >= MEDIA_PREFETCH_MEDIUM_VELOCITY
      ? { decodedAhead: 5, decodedBehind: 3, encodedAhead: 16, encodedBehind: 6 }
      : { decodedAhead: 3, decodedBehind: 2, encodedAhead: 8, encodedBehind: 4 };

  if (sample.memoryPressure === 'high') {
    return { ...base, decodedAhead: 0, decodedBehind: 0, encodedAhead: 8, encodedBehind: 4 };
  }
  return base;
}

export function buildPrefetchIndices(input: BuildPrefetchIndicesInput): number[] {
  if (input.itemCount <= 0) {
    return [];
  }
  const currentIndex = Math.max(0, Math.min(input.itemCount - 1, Math.floor(input.currentIndex)));
  const direction = input.direction === -1 ? -1 : 1;
  const ahead = input.kind === 'encoded' ? input.window.encodedAhead : input.window.decodedAhead;
  const behind = input.kind === 'encoded' ? input.window.encodedBehind : input.window.decodedBehind;
  if (input.kind === 'decoded' && ahead === 0 && behind === 0) {
    return [];
  }
  const indices = [currentIndex];
  for (let distance = 1; distance <= ahead; distance += 1) {
    indices.push(currentIndex + distance * direction);
  }
  for (let distance = 1; distance <= behind; distance += 1) {
    indices.push(currentIndex - distance * direction);
  }
  return [...new Set(indices.filter((index) => index >= 0 && index < input.itemCount))];
}
