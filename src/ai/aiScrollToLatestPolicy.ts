export const SCROLL_TO_LATEST_GESTURE_DISTANCE = 8;
export const SCROLL_TO_LATEST_REATTACH_OFFSET = 160;
export const SCROLL_TO_LATEST_SHOW_OFFSET = 200;

export type ScrollToLatestGestureDirection =
  | 'undetermined'
  | 'toward_latest'
  | 'away_from_latest';

export function resolveScrollToLatestGestureDirection(
  current: ScrollToLatestGestureDirection,
  verticalTouchDelta: number,
): ScrollToLatestGestureDirection {
  if (current !== 'undetermined') return current;
  if (verticalTouchDelta >= SCROLL_TO_LATEST_GESTURE_DISTANCE) {
    return 'toward_latest';
  }
  if (verticalTouchDelta <= -SCROLL_TO_LATEST_GESTURE_DISTANCE) {
    return 'away_from_latest';
  }
  return current;
}

export function shouldReattachToLatest(input: {
  direction: ScrollToLatestGestureDirection;
  offsetY: number;
}): boolean {
  return (
    input.direction === 'toward_latest' &&
    input.offsetY <= SCROLL_TO_LATEST_REATTACH_OFFSET
  );
}

export function shouldShowScrollToLatest(offsetY: number): boolean {
  return offsetY >= SCROLL_TO_LATEST_SHOW_OFFSET;
}
