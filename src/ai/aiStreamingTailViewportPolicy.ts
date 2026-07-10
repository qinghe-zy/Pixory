export type StreamingTailViewportInput = {
  scrollOffset: number;
  scrollingTowardLatest: boolean;
  totalReservedHeight: number;
  viewportHeight: number;
};

export type StreamingTailViewportPolicy = {
  hotZone: 'cold' | 'warming' | 'active';
  prePromotionHeight: number;
  shouldExpandRenderWindow: boolean;
  shouldRelaxClipping: boolean;
  targetDetachedFps: number;
};

const ACTIVE_VIEWPORT_MULTIPLIER = 0.35;
const WARMING_VIEWPORT_MULTIPLIER = 1.25;

export function deriveStreamingTailViewportPolicy(
  input: StreamingTailViewportInput,
): StreamingTailViewportPolicy {
  const viewportHeight = Math.max(1, input.viewportHeight);
  const occupiedTailHeight = Math.max(0, input.totalReservedHeight);
  const distanceToReplayRegion = Math.max(
    0,
    input.scrollOffset - occupiedTailHeight,
  );
  const activeThreshold = viewportHeight * ACTIVE_VIEWPORT_MULTIPLIER;
  const warmingThreshold = viewportHeight * WARMING_VIEWPORT_MULTIPLIER;

  const hotZone: StreamingTailViewportPolicy['hotZone'] =
    distanceToReplayRegion <= activeThreshold
      ? 'active'
      : input.scrollingTowardLatest &&
          distanceToReplayRegion <= warmingThreshold
        ? 'warming'
        : 'cold';

  if (hotZone === 'active') {
    return {
      hotZone,
      prePromotionHeight: viewportHeight,
      shouldExpandRenderWindow: true,
      shouldRelaxClipping: true,
      targetDetachedFps: 30,
    };
  }
  if (hotZone === 'warming') {
    return {
      hotZone,
      prePromotionHeight: Math.round(viewportHeight * 0.75),
      shouldExpandRenderWindow: true,
      shouldRelaxClipping: false,
      targetDetachedFps: 18,
    };
  }
  return {
    hotZone,
    prePromotionHeight: 0,
    shouldExpandRenderWindow: false,
    shouldRelaxClipping: false,
    targetDetachedFps: 8,
  };
}
