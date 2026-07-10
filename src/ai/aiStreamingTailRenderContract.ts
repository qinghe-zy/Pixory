import type { AiStreamBlock } from "./aiStreamingBlockSplitter";
import type { AiMessageWithCitations } from "./aiChatService";

export type AiTailSegmentEdge = "single" | "first" | "middle" | "last";

export type AiMessageTerminalState =
  | "streaming"
  | "done"
  | "completed"
  | "stopped"
  | "failed"
  | "error";

export type AiMessageRenderState = {
  hasPendingTail: boolean;
  terminalState: AiMessageTerminalState;
};

export type AiTailMessageSegment = {
  blockRange: {
    endBlockIndex: number;
    lane: AiStreamBlock["lane"];
    startBlockIndex: number;
  };
  edge: AiTailSegmentEdge;
  id: string;
  messageId: string;
  segmentIndex: number;
  type: "messageSegment";
};

export type AiTailDebtSpacerItem = {
  height: number;
  id: string;
  messageId: string;
  type: "tailDebtSpacer";
};

export type AiTailSegmentChrome = {
  borderBottomClosed: boolean;
  borderTopClosed: boolean;
  drawsCitations: boolean;
  drawsFooter: boolean;
  elevation: number;
  shadowOpacity: number;
};

export function selectVisibleMessage<
  T extends Pick<AiMessageWithCitations, "content" | "id" | "reasoningText">
>(input: {
  message: T;
  tailOverride?: {
    frozenContent: string;
    frozenReasoningText?: string | null;
    messageId: string;
    status: "idle" | "detached" | "completed";
  };
}): T {
  const tailOverride = input.tailOverride;
  if (
    !tailOverride ||
    tailOverride.status === "idle" ||
    tailOverride.messageId !== input.message.id
  ) {
    return input.message;
  }
  return {
    ...input.message,
    content: tailOverride.frozenContent,
    reasoningText:
      tailOverride.frozenReasoningText ?? input.message.reasoningText,
  };
}

export function buildTailMessageSegments(input: {
  blocks: AiStreamBlock[];
  maxBlocksPerSegment?: number;
}): AiTailMessageSegment[] {
  const maxBlocksPerSegment = Math.max(1, Math.floor(input.maxBlocksPerSegment ?? 3));
  const segments: AiTailMessageSegment[] = [];
  let cursor = 0;

  while (cursor < input.blocks.length) {
    const first = input.blocks[cursor];
    if (!first) break;
    let end = cursor;
    while (
      end + 1 < input.blocks.length &&
      end + 1 - cursor < maxBlocksPerSegment &&
      input.blocks[end + 1]?.messageId === first.messageId &&
      input.blocks[end + 1]?.lane === first.lane
    ) {
      end += 1;
    }
    const segmentIndex = segments.filter((segment) => segment.messageId === first.messageId).length;
    segments.push({
      blockRange: {
        endBlockIndex: input.blocks[end]?.blockIndex ?? end,
        lane: first.lane,
        startBlockIndex: first.blockIndex,
      },
      edge: "single",
      id: `${first.messageId}:${segmentIndex}`,
      messageId: first.messageId,
      segmentIndex,
      type: "messageSegment",
    });
    cursor = end + 1;
  }

  const segmentCountByMessage = new Map<string, number>();
  for (const segment of segments) {
    segmentCountByMessage.set(
      segment.messageId,
      (segmentCountByMessage.get(segment.messageId) ?? 0) + 1,
    );
  }
  const seenByMessage = new Map<string, number>();
  return segments.map((segment) => {
    const count = segmentCountByMessage.get(segment.messageId) ?? 1;
    const seen = seenByMessage.get(segment.messageId) ?? 0;
    seenByMessage.set(segment.messageId, seen + 1);
    const edge: AiTailSegmentEdge =
      count === 1
        ? "single"
        : seen === 0
          ? "first"
          : seen === count - 1
            ? "last"
            : "middle";
    return { ...segment, edge };
  });
}

export function footerVisible(
  renderState: AiMessageRenderState,
  edge: AiTailSegmentEdge,
): boolean {
  return (
    renderState.terminalState !== "streaming" &&
    !renderState.hasPendingTail &&
    (edge === "last" || edge === "single")
  );
}

export function stitchTailSegmentEdgeAfterFrozenPrefix(
  edge: AiTailSegmentEdge,
): AiTailSegmentEdge {
  if (edge === "single" || edge === "last") {
    return "last";
  }
  return "middle";
}

export function createTailDebtSpacer(
  messageId: string,
  height: number,
): AiTailDebtSpacerItem {
  return {
    height: Math.max(0, Number.isFinite(height) ? height : 0),
    id: `tail-debt:${messageId}`,
    messageId,
    type: "tailDebtSpacer",
  };
}

export function shouldPayoffDebt(input: {
  debtHeight: number;
  isAtBottom: boolean;
  isListIdle: boolean;
  isMvcpCompensatedSide: boolean;
  isSpacerOffscreen: boolean;
}): boolean {
  if (input.debtHeight <= 0) return false;
  return (
    input.isSpacerOffscreen ||
    (input.isMvcpCompensatedSide && input.isListIdle) ||
    (input.isAtBottom && input.isListIdle)
  );
}

export function getSegmentChrome(
  edge: AiTailSegmentEdge,
  platform: "android" | "ios" | "web" | "default" = "default",
): AiTailSegmentChrome {
  const internal = edge === "middle" || edge === "first";
  return {
    borderBottomClosed: edge === "single" || edge === "last",
    borderTopClosed: edge === "single" || edge === "first",
    drawsCitations: edge === "single" || edge === "last",
    drawsFooter: edge === "single" || edge === "last",
    elevation: platform === "android" && !internal ? 0 : 0,
    shadowOpacity: internal ? 0 : 0,
  };
}

export function getTailReplayItemKey(
  item: AiTailMessageSegment | AiTailDebtSpacerItem,
): string {
  return item.id;
}
