export const VIDEO_SWIPE_DISTANCE_RATIO = 0.18;
export const VIDEO_SWIPE_VELOCITY_THRESHOLD = 0.65;

export interface VideoSwipeInput {
  canGoNext: boolean;
  canGoPrevious: boolean;
  translationY: number;
  velocityY: number;
  viewportHeight: number;
}

export interface VideoSwipeResolution {
  action: 'cancel' | 'switch';
  direction: -1 | 0 | 1;
  targetOffset: number;
}

const CANCEL_SWIPE: VideoSwipeResolution = {
  action: 'cancel',
  direction: 0,
  targetOffset: 0,
};

export function resolveVideoSwipe(input: VideoSwipeInput): VideoSwipeResolution {
  if (
    !Number.isFinite(input.viewportHeight)
    || input.viewportHeight <= 0
    || !Number.isFinite(input.translationY)
    || !Number.isFinite(input.velocityY)
  ) {
    return CANCEL_SWIPE;
  }

  const hasVelocityCommit = Math.abs(input.velocityY) >= VIDEO_SWIPE_VELOCITY_THRESHOLD;
  const hasDistanceCommit = Math.abs(input.translationY) >= input.viewportHeight * VIDEO_SWIPE_DISTANCE_RATIO;
  if (!hasVelocityCommit && !hasDistanceCommit) {
    return CANCEL_SWIPE;
  }

  const direction = hasVelocityCommit
    ? input.velocityY < 0 ? 1 : -1
    : input.translationY < 0 ? 1 : -1;
  if ((direction === 1 && !input.canGoNext) || (direction === -1 && !input.canGoPrevious)) {
    return CANCEL_SWIPE;
  }

  return {
    action: 'switch',
    direction,
    targetOffset: -direction * input.viewportHeight,
  };
}
