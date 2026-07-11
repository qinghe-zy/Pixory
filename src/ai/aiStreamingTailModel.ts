import {
  type AiStreamBlock,
  chooseGracefulDetachText,
  splitStreamingTextIntoBlocks,
} from "./aiStreamingBlockSplitter";
import { streamingTailPerfDebug } from "./aiStreamingPerfDebug";
import type { AiMessageStatus } from "./types";

type StreamingTailMessageStatus = Extract<
  AiMessageStatus,
  "generating" | "completed" | "failed" | "stopped"
>;

export type StreamingTailPatch = {
  completedAt?: string | null;
  content?: string;
  errorMessage?: string | null;
  generationId?: string;
  id?: string;
  reasoningText?: string | null;
  status?: AiMessageStatus;
  updatedAt?: string | null;
};

export type AiStreamingTailState = {
  blocks: AiStreamBlock[];
  completedAt: string | null;
  debtPayoffEligible: boolean;
  errorMessage: string | null;
  frozenContent: string;
  frozenReasoningText: string | null;
  generationId: string | null;
  messageId: string | null;
  messageStatus: StreamingTailMessageStatus;
  overReservedHeight: number;
  pendingShrinkHeight: number;
  promotedBlockIds: Set<string>;
  shrinkStableSince: number | null;
  status: "idle" | "detached" | "completed";
  tailContent: string;
  tailReasoningText: string | null;
  totalReservedHeight: number;
  updatedAt: string | null;
};

function isTerminalMessageStatus(
  status: AiMessageStatus | undefined,
): status is Extract<AiMessageStatus, "completed" | "failed" | "stopped"> {
  return status === "completed" || status === "failed" || status === "stopped";
}

function sumReservedHeight(
  blocks: AiStreamBlock[],
  promotedBlockIds: Set<string>,
): number {
  return blocks.reduce((total, block) => {
    if (promotedBlockIds.has(block.blockId)) {
      return total;
    }
    return total + block.reservedHeight;
  }, 0);
}

function calculateBlockShrinkGap(block: AiStreamBlock): number {
  if (typeof block.measuredHeight !== "number") {
    return 0;
  }
  return Math.max(0, block.reservedHeight - block.measuredHeight);
}

function calculatePendingShrinkHeight(blocks: AiStreamBlock[]): number {
  return blocks.reduce((total, block) => total + calculateBlockShrinkGap(block), 0);
}

function withRecomputedDerivedState(
  previous: AiStreamingTailState,
  input: {
    blocks?: AiStreamBlock[];
    overReservedHeight?: number;
    pendingShrinkHeight?: number;
    promotedBlockIds?: Set<string>;
    shrinkStableSince?: number | null;
  },
): AiStreamingTailState {
  const blocks = input.blocks ?? previous.blocks;
  const promotedBlockIds = input.promotedBlockIds ?? previous.promotedBlockIds;
  const pendingShrinkHeight =
    input.pendingShrinkHeight ?? calculatePendingShrinkHeight(blocks);
  const overReservedHeight =
    input.overReservedHeight ?? pendingShrinkHeight;
  const nextState = {
    ...previous,
    blocks,
    overReservedHeight,
    pendingShrinkHeight,
    promotedBlockIds,
    shrinkStableSince:
      input.shrinkStableSince === undefined
        ? pendingShrinkHeight > 0
          ? previous.shrinkStableSince
          : null
        : input.shrinkStableSince,
    totalReservedHeight: sumReservedHeight(blocks, promotedBlockIds),
  };
  streamingTailPerfDebug.recordReservedHeights({
    overReservedHeight: nextState.overReservedHeight,
    totalReservedHeight: nextState.totalReservedHeight,
  });
  streamingTailPerfDebug.recordTailReplayNegativeDebt({
    debtHeight: nextState.pendingShrinkHeight,
    reason: "recompute",
  });
  return nextState;
}

function lineCountForBlock(block: AiStreamBlock): number {
  return Math.max(1, block.raw.split(/\r?\n/).length);
}

function isSingleLineBlock(block: AiStreamBlock): boolean {
  return lineCountForBlock(block) === 1;
}

export function createEmptyStreamingTailState(): AiStreamingTailState {
  return {
    blocks: [],
    completedAt: null,
    debtPayoffEligible: false,
    errorMessage: null,
    frozenContent: "",
    frozenReasoningText: null,
    generationId: null,
    messageId: null,
    messageStatus: "generating",
    overReservedHeight: 0,
    pendingShrinkHeight: 0,
    promotedBlockIds: new Set<string>(),
    shrinkStableSince: null,
    status: "idle",
    tailContent: "",
    tailReasoningText: null,
    totalReservedHeight: 0,
    updatedAt: null,
  };
}

export function startStreamingTailDetach(input: {
  bubbleWidth: number;
  currentContent: string;
  currentReasoningText: string | null;
  generationId: string;
  messageId: string;
  targetContent: string;
  targetReasoningText: string | null;
}): AiStreamingTailState {
  const frozenContent = chooseGracefulDetachText({
    previousVisibleText: input.currentContent,
    targetText: input.targetContent,
  });
  const hiddenContent = input.targetContent.startsWith(frozenContent)
    ? input.targetContent.slice(frozenContent.length)
    : "";
  const frozenReasoningText = chooseGracefulDetachText({
    previousVisibleText: input.currentReasoningText ?? "",
    targetText: input.targetReasoningText ?? "",
  });
  const hiddenReasoningText = (input.targetReasoningText || "").startsWith(
    frozenReasoningText,
  )
    ? (input.targetReasoningText || "").slice(frozenReasoningText.length)
    : "";

  const reasoningBlocks = splitStreamingTextIntoBlocks({
    bubbleWidth: input.bubbleWidth,
    content: hiddenReasoningText,
    generationId: input.generationId,
    lane: "reasoning",
    messageId: input.messageId,
  });
  const contentBlocks = splitStreamingTextIntoBlocks({
    bubbleWidth: input.bubbleWidth,
    content: hiddenContent,
    generationId: input.generationId,
    lane: "content",
    messageId: input.messageId,
  });
  const blocks = [...reasoningBlocks, ...contentBlocks];
  const promotedBlockIds = new Set<string>();
  const nextState = withRecomputedDerivedState(
    {
      ...createEmptyStreamingTailState(),
      blocks,
      debtPayoffEligible: false,
      frozenContent,
      frozenReasoningText: frozenReasoningText || null,
      generationId: input.generationId,
      messageId: input.messageId,
      promotedBlockIds,
      status: "detached",
      tailContent: hiddenContent,
      tailReasoningText: hiddenReasoningText,
    },
    {
      blocks,
      overReservedHeight: 0,
      pendingShrinkHeight: 0,
      promotedBlockIds,
      shrinkStableSince: null,
    },
  );
  return nextState;
}

export function mergeStreamingTailPatch(input: {
  bubbleWidth: number;
  patch: StreamingTailPatch;
  previous: AiStreamingTailState;
}): AiStreamingTailState {
  const previous = input.previous;
  if (!input.patch.generationId || !input.patch.id) {
    return previous;
  }
  const patchMessageStatus = isTerminalMessageStatus(input.patch.status)
    ? input.patch.status
    : null;
  const terminalPatch = patchMessageStatus !== null;
  const status =
    previous.status === "completed" || terminalPatch ? "completed" : "detached";
  const previousMessageTerminal = isTerminalMessageStatus(
    previous.messageStatus,
  );
  const messageStatus: StreamingTailMessageStatus = previousMessageTerminal
    ? previous.messageStatus
    : patchMessageStatus ?? "generating";
  const terminalAt =
    input.patch.completedAt ?? input.patch.updatedAt ?? new Date().toISOString();
  const finalizeOpenBlocks = status === "completed";
  const frozenContent = previous.frozenContent;
  const nextFullContent =
    input.patch.content ?? frozenContent + previous.tailContent;
  const tailContent = nextFullContent.startsWith(frozenContent)
    ? nextFullContent.slice(frozenContent.length)
    : previous.tailContent;

  const frozenReasoningText = previous.frozenReasoningText || "";
  const nextFullReasoningText =
    input.patch.reasoningText === undefined
      ? frozenReasoningText + (previous.tailReasoningText || "")
      : input.patch.reasoningText || "";
  const tailReasoningText = nextFullReasoningText.startsWith(frozenReasoningText)
    ? nextFullReasoningText.slice(frozenReasoningText.length)
    : previous.tailReasoningText || "";

  const reasoningBlocks = splitStreamingTextIntoBlocks({
    bubbleWidth: input.bubbleWidth,
    content: tailReasoningText,
    finalizeOpenBlocks,
    generationId: input.patch.generationId,
    lane: "reasoning",
    messageId: input.patch.id,
  });
  const contentBlocks = splitStreamingTextIntoBlocks({
    bubbleWidth: input.bubbleWidth,
    content: tailContent,
    finalizeOpenBlocks,
    generationId: input.patch.generationId,
    lane: "content",
    messageId: input.patch.id,
  });

  const previousById = new Map(
    previous.blocks.map((block) => [block.blockId, block] as const),
  );
  const nextBlocks = [...reasoningBlocks, ...contentBlocks].map((nextBlock) => {
    const previousBlock = previousById.get(nextBlock.blockId);
    if (!previousBlock) {
      return nextBlock;
    }
    const measurementStillMatches =
      previousBlock.raw === nextBlock.raw &&
      previousBlock.finalized === nextBlock.finalized;
    return {
      ...nextBlock,
      measuredHeight: measurementStillMatches
        ? previousBlock.measuredHeight
        : undefined,
      reservedHeight: Math.max(
        previousBlock.reservedHeight,
        nextBlock.reservedHeight,
      ),
    };
  });
  const promotedBlockIds = new Set(
    [...previous.promotedBlockIds].filter((blockId) =>
      nextBlocks.some((block) => block.blockId === blockId),
    ),
  );
  streamingTailPerfDebug.incrementTailStateUpdateCount();
  return withRecomputedDerivedState(
    {
      ...previous,
      blocks: nextBlocks,
      completedAt:
        isTerminalMessageStatus(messageStatus)
          ? previous.completedAt ?? terminalAt
          : null,
      debtPayoffEligible:
        status === "completed" ? true : previous.debtPayoffEligible,
      errorMessage:
        input.patch.errorMessage === undefined
          ? previous.errorMessage
          : input.patch.errorMessage,
      generationId: input.patch.generationId,
      messageId: input.patch.id,
      messageStatus,
      promotedBlockIds,
      status,
      tailContent,
      tailReasoningText,
      updatedAt:
        input.patch.updatedAt ??
        input.patch.completedAt ??
        previous.updatedAt,
    },
    {
      blocks: nextBlocks,
      promotedBlockIds,
      shrinkStableSince:
        previous.pendingShrinkHeight > 0 ? previous.shrinkStableSince : null,
    },
  );
}

export function updateStreamingTailBlockMeasurement(input: {
  blockId: string;
  measuredAt?: number;
  measuredHeight: number;
  previous: AiStreamingTailState;
}): AiStreamingTailState {
  let changed = false;
  const measuredAt = input.measuredAt ?? Date.now();
  const blocks = input.previous.blocks.map((block) => {
    if (block.blockId !== input.blockId) {
      return block;
    }
    const nextReservedHeight = Math.max(
      block.reservedHeight,
      input.measuredHeight,
    );
    if (
      nextReservedHeight === block.reservedHeight &&
      block.measuredHeight === input.measuredHeight
    ) {
      return block;
    }
    changed = true;
    return {
      ...block,
      measuredHeight: input.measuredHeight,
      reservedHeight: nextReservedHeight,
    };
  });
  if (!changed) {
    return input.previous;
  }

  const pendingShrinkHeight = calculatePendingShrinkHeight(blocks);
  const shrinkStableSince =
    pendingShrinkHeight > 0
      ? pendingShrinkHeight !== input.previous.pendingShrinkHeight
        ? measuredAt
        : input.previous.shrinkStableSince
      : null;

  streamingTailPerfDebug.incrementMeasurementCount();
  streamingTailPerfDebug.incrementTailStateUpdateCount();
  return withRecomputedDerivedState(input.previous, {
    blocks,
    overReservedHeight: pendingShrinkHeight,
    pendingShrinkHeight,
    shrinkStableSince,
  });
}

export function settleStreamingTailShrinkDebt(input: {
  canApplyBlock: (block: AiStreamBlock) => boolean;
  previous: AiStreamingTailState;
}): AiStreamingTailState {
  if (!input.previous.debtPayoffEligible) {
    streamingTailPerfDebug.recordTailReplayUnsafePayoff({
      debtHeight: input.previous.pendingShrinkHeight,
      reason: "not_eligible",
    });
    return input.previous;
  }
  if (input.previous.pendingShrinkHeight <= 0) {
    return input.previous;
  }

  let changed = false;
  const blocks = input.previous.blocks.map((block) => {
    if (!input.canApplyBlock(block)) {
      return block;
    }
    if (typeof block.measuredHeight !== "number") {
      return block;
    }
    if (block.measuredHeight >= block.reservedHeight) {
      return block;
    }
    changed = true;
    return {
      ...block,
      reservedHeight: block.measuredHeight,
    };
  });

  if (!changed) {
    return input.previous;
  }

  const pendingShrinkHeight = calculatePendingShrinkHeight(blocks);
  streamingTailPerfDebug.incrementTailStateUpdateCount();
  const nextState = withRecomputedDerivedState(input.previous, {
    blocks,
    overReservedHeight: pendingShrinkHeight,
    pendingShrinkHeight,
    shrinkStableSince: pendingShrinkHeight > 0 ? Date.now() : null,
  });
  return {
    ...nextState,
    debtPayoffEligible:
      pendingShrinkHeight > 0 ? input.previous.debtPayoffEligible : false,
  };
}

export function promoteStreamingTailBlocks(input: {
  activeLanes?: ("reasoning" | "content")[];
  previous: AiStreamingTailState;
  replayHorizonHeight: number;
}): AiStreamingTailState {
  let consumed = 0;
  const promotedBlockIds = new Set(input.previous.promotedBlockIds);
  let changed = false;
  const eligibleBlocks = input.previous.blocks.filter(
    (block) =>
      !input.activeLanes || input.activeLanes.includes(block.lane),
  );

  let nextEligibleIndex = -1;
  for (const [index, block] of eligibleBlocks.entries()) {
    if (promotedBlockIds.has(block.blockId)) {
      consumed += block.reservedHeight;
      continue;
    }
    const nextConsumed = consumed + block.reservedHeight;
    if (nextConsumed > input.replayHorizonHeight) {
      nextEligibleIndex = index;
      break;
    }
    promotedBlockIds.add(block.blockId);
    changed = true;
    consumed = nextConsumed;
  }

  if (nextEligibleIndex >= 0) {
    // prewarm the next complete block so replay feels like existing history.
    const nextCompleteBlock = eligibleBlocks[nextEligibleIndex];
    if (
      nextCompleteBlock &&
      nextCompleteBlock.finalized &&
      !promotedBlockIds.has(nextCompleteBlock.blockId)
    ) {
      promotedBlockIds.add(nextCompleteBlock.blockId);
      changed = true;

      // If that block is very small, allow one more block.
      if (isSingleLineBlock(nextCompleteBlock)) {
        const afterNextBlock = eligibleBlocks[nextEligibleIndex + 1];
        if (
          afterNextBlock &&
          afterNextBlock.finalized &&
          !promotedBlockIds.has(afterNextBlock.blockId)
        ) {
          promotedBlockIds.add(afterNextBlock.blockId);
        }
      }
    }
  }

  if (!changed) {
    return input.previous;
  }

  for (const block of input.previous.blocks) {
    if (
      promotedBlockIds.has(block.blockId) &&
      !input.previous.promotedBlockIds.has(block.blockId)
    ) {
      streamingTailPerfDebug.recordTailReplayBlockPromoted({
        blockId: block.blockId,
        finalized: block.finalized,
      });
    }
  }
  streamingTailPerfDebug.incrementPromotionCount();
  streamingTailPerfDebug.incrementTailStateUpdateCount();
  return withRecomputedDerivedState(input.previous, {
    promotedBlockIds,
  });
}

export function calculateEffectiveTotalReservedHeight(
  state: AiStreamingTailState,
  activeLanes?: ("reasoning" | "content")[],
): number {
  return state.blocks.reduce((total, block) => {
    if (activeLanes && !activeLanes.includes(block.lane)) {
      return total;
    }
    return total + block.reservedHeight;
  }, 0);
}

export function calculateRemainingStreamingTailHeight(
  state: AiStreamingTailState,
  activeLanes?: ("reasoning" | "content")[],
): number {
  return Math.max(
    0,
    state.blocks.reduce((total, block) => {
      if (activeLanes && !activeLanes.includes(block.lane)) {
        return total;
      }
      if (state.promotedBlockIds.has(block.blockId)) {
        return total;
      }
      return total + block.reservedHeight;
    }, 0),
  );
}

export function calculateStreamingTailOccupiedHeight(
  state: AiStreamingTailState,
  activeLanes?: ("reasoning" | "content")[],
): number {
  return state.blocks.reduce((total, block) => {
    if (activeLanes && !activeLanes.includes(block.lane)) {
      return total;
    }
    if (state.promotedBlockIds.has(block.blockId)) {
      return total + block.reservedHeight;
    }
    return total + block.reservedHeight;
  }, 0);
}
