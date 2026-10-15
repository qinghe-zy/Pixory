let latestAssistantBubbleContentWidth: number | null = null;

function sanitizeWidth(width: number): number | null {
  if (!Number.isFinite(width) || width <= 0) {
    return null;
  }
  return Math.round(width / 8) * 8;
}

export function setLatestAssistantBubbleContentWidth(width: number): void {
  latestAssistantBubbleContentWidth = sanitizeWidth(width);
}

export function getLatestAssistantBubbleContentWidth(): number | null {
  return latestAssistantBubbleContentWidth;
}

export function getAssistantBubbleContentWidthFallback(input: {
  bubbleHorizontalPadding: number;
  messageStackRatio: number;
  pagePaddingHorizontal: number;
  screenWidth: number;
}): number {
  const listContentWidth = Math.max(
    220,
    input.screenWidth - input.pagePaddingHorizontal * 2,
  );
  const stackWidth = listContentWidth * input.messageStackRatio;
  // Assistant output now sits directly on the chat canvas. Keep the legacy inset
  // parameter for callers while treating a full-width stack as having no bubble inset.
  const bubbleContentWidth = input.messageStackRatio >= 1
    ? listContentWidth
    : stackWidth - input.bubbleHorizontalPadding * 2;
  return Math.max(220, Math.round(bubbleContentWidth / 8) * 8);
}
