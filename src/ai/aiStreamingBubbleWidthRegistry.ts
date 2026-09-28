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
  const bubbleContentWidth = stackWidth - input.bubbleHorizontalPadding * 2;
  return Math.max(220, Math.round(bubbleContentWidth / 8) * 8);
}
