export type VerticalGestureKind = 'brightness' | 'volume';

export type VerticalGestureIconName =
  | 'sunny-outline'
  | 'sunny'
  | 'volume-mute'
  | 'volume-low'
  | 'volume-medium'
  | 'volume-high';

export function clampGestureValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function computeVerticalGestureValue(
  startValue: number,
  deltaY: number,
  surfaceHeight: number,
  fullHeightRatio = 0.58,
): number {
  const safeStart = clampGestureValue(startValue);
  const safeSpan = Math.max(1, surfaceHeight * fullHeightRatio);
  return clampGestureValue(safeStart - deltaY / safeSpan);
}

export function getVerticalGestureIconName(
  kind: VerticalGestureKind,
  value: number,
): VerticalGestureIconName {
  const normalized = clampGestureValue(value);
  if (kind === 'brightness') {
    return normalized <= 0.35 ? 'sunny-outline' : 'sunny';
  }
  if (normalized <= 0.01) {
    return 'volume-mute';
  }
  if (normalized < 0.35) {
    return 'volume-low';
  }
  if (normalized < 0.75) {
    return 'volume-medium';
  }
  return 'volume-high';
}

export function formatVerticalGesturePercent(value: number): string {
  return `${Math.round(clampGestureValue(value) * 100)}%`;
}
