export type AiMessageContextMenuPositionInput = {
  anchorX: number;
  anchorY: number;
  bottomInset: number;
  gap?: number;
  horizontalMargin: number;
  menuHeight: number;
  menuWidth: number;
  topInset: number;
  viewportHeight: number;
  viewportWidth: number;
};

export type AiMessageContextMenuPosition = {
  left: number;
  maxHeight: number;
  opensBelowFinger: boolean;
  top: number;
};

export function resolveAiMessageContextMenuPosition(
  input: AiMessageContextMenuPositionInput,
): AiMessageContextMenuPosition {
  // The menu is deliberately anchored 5 physical pixels from the pressed point.
  const gap = input.gap ?? 5;
  const opensBelowFinger = input.anchorY < input.viewportHeight / 2;
  const minTop = input.topInset + input.horizontalMargin;
  const maxBottom =
    input.viewportHeight - input.bottomInset - input.horizontalMargin;
  const maxHeight = Math.max(
    0,
    opensBelowFinger
      ? maxBottom - (input.anchorY + gap)
      : input.anchorY - gap - minTop,
  );
  const constrainedMenuHeight = Math.min(input.menuHeight, maxHeight);
  const preferredTop = opensBelowFinger
    ? input.anchorY + gap
    : input.anchorY - gap - constrainedMenuHeight;
  const maxTop = Math.max(
    minTop,
    maxBottom - constrainedMenuHeight,
  );
  const preferredLeft = input.anchorX - input.menuWidth / 2;
  const minLeft = input.horizontalMargin;
  const maxLeft = Math.max(
    minLeft,
    input.viewportWidth - input.horizontalMargin - input.menuWidth,
  );

  return {
    left: Math.min(maxLeft, Math.max(minLeft, preferredLeft)),
    maxHeight,
    opensBelowFinger,
    top: Math.min(maxTop, Math.max(minTop, preferredTop)),
  };
}
