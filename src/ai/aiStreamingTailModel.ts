import {
  type AiStreamBlock,
  chooseGracefulDetachText,
  splitStreamingTextIntoBlocks,
} from './aiStreamingBlockSplitter';

export type StreamingTailPatch = {
  content?: string;
  generationId?: string;
  id?: string;
  reasoningText?: string | null;
  status?: string;
};

export type AiStreamingTailState = {
  blocks: AiStreamBlock[];
  frozenContent: string;
  frozenReasoningText: string | null;
  generationId: string | null;
  messageId: string | null;
  promotedBlockIds: Set<string>;
  status: 'idle' | 'detached' | 'completed';
  tailContent: string;
  tailReasoningText: string | null;
  totalReservedHeight: number;
};

export function createEmptyStreamingTailState(): AiStreamingTailState {
  return {
    blocks: [],
    frozenContent: '',
    frozenReasoningText: null,
    generationId: null,
    messageId: null,
    promotedBlockIds: new Set<string>(),
    status: 'idle',
    tailContent: '',
    tailReasoningText: null,
    totalReservedHeight: 0,
  };
}

function sumReservedHeight(blocks: AiStreamBlock[], promotedBlockIds: Set<string>): number {
  return blocks.reduce((total, block) => {
    if (promotedBlockIds.has(block.blockId)) {
      return total;
    }
    return total + block.reservedHeight;
  }, 0);
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
    : '';
  const frozenReasoningText = chooseGracefulDetachText({
    previousVisibleText: input.currentReasoningText ?? '',
    targetText: input.targetReasoningText ?? '',
  });
  const hiddenReasoningText = (input.targetReasoningText || '').startsWith(frozenReasoningText)
    ? (input.targetReasoningText || '').slice(frozenReasoningText.length)
    : '';

  const reasoningBlocks = splitStreamingTextIntoBlocks({
    bubbleWidth: input.bubbleWidth,
    content: hiddenReasoningText,
    generationId: input.generationId,
    lane: 'reasoning',
    messageId: input.messageId,
  });
  const contentBlocks = splitStreamingTextIntoBlocks({
    bubbleWidth: input.bubbleWidth,
    content: hiddenContent,
    generationId: input.generationId,
    lane: 'content',
    messageId: input.messageId,
  });
  const blocks = [...reasoningBlocks, ...contentBlocks];
  const promotedBlockIds = new Set<string>();
  return {
    blocks,
    frozenContent,
    frozenReasoningText: frozenReasoningText || null,
    generationId: input.generationId,
    messageId: input.messageId,
    promotedBlockIds,
    status: 'detached',
    tailContent: hiddenContent,
    tailReasoningText: hiddenReasoningText,
    totalReservedHeight: sumReservedHeight(blocks, promotedBlockIds),
  };
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
  const frozenContent = previous.frozenContent;
  const nextFullContent = input.patch.content ?? frozenContent + previous.tailContent;
  const tailContent = nextFullContent.startsWith(frozenContent)
    ? nextFullContent.slice(frozenContent.length)
    : previous.tailContent;

  const frozenReasoningText = previous.frozenReasoningText || '';
  const nextFullReasoningText = input.patch.reasoningText === undefined
    ? frozenReasoningText + (previous.tailReasoningText || '')
    : (input.patch.reasoningText || '');
  const tailReasoningText = nextFullReasoningText.startsWith(frozenReasoningText)
    ? nextFullReasoningText.slice(frozenReasoningText.length)
    : (previous.tailReasoningText || '');

  const reasoningBlocks = splitStreamingTextIntoBlocks({
    bubbleWidth: input.bubbleWidth,
    content: tailReasoningText,
    generationId: input.patch.generationId,
    lane: 'reasoning',
    messageId: input.patch.id,
  });
  const contentBlocks = splitStreamingTextIntoBlocks({
    bubbleWidth: input.bubbleWidth,
    content: tailContent,
    generationId: input.patch.generationId,
    lane: 'content',
    messageId: input.patch.id,
  });

  const nextBlocks = [...reasoningBlocks, ...contentBlocks].map((nextBlock) => {
    const previousBlock = previous.blocks.find((block) => block.blockId === nextBlock.blockId);
    if (!previousBlock) return nextBlock;
    return {
      ...nextBlock,
      measuredHeight: previousBlock.measuredHeight,
      reservedHeight: Math.max(previousBlock.reservedHeight, nextBlock.reservedHeight),
    };
  });
  const promotedBlockIds = new Set(
    [...previous.promotedBlockIds].filter((blockId) => nextBlocks.some((block) => block.blockId === blockId))
  );
  const status = input.patch.status === 'completed' || input.patch.status === 'failed' || input.patch.status === 'stopped'
    ? 'completed'
    : 'detached';
  return {
    ...previous,
    blocks: nextBlocks,
    generationId: input.patch.generationId,
    messageId: input.patch.id,
    promotedBlockIds,
    status,
    tailContent,
    tailReasoningText,
    totalReservedHeight: sumReservedHeight(nextBlocks, promotedBlockIds),
  };
}

export function updateStreamingTailBlockMeasurement(input: {
  blockId: string;
  measuredHeight: number;
  previous: AiStreamingTailState;
}): AiStreamingTailState {
  let changed = false;
  const blocks = input.previous.blocks.map((block) => {
    if (block.blockId !== input.blockId) return block;
    const nextReservedHeight = Math.max(block.reservedHeight, input.measuredHeight);
    if (nextReservedHeight <= block.reservedHeight) {
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
  return {
    ...input.previous,
    blocks,
    totalReservedHeight: sumReservedHeight(blocks, input.previous.promotedBlockIds),
  };
}

export function promoteStreamingTailBlocks(input: {
  activeLanes?: ('reasoning' | 'content')[];
  previous: AiStreamingTailState;
  visibleTailHeight: number;
}): AiStreamingTailState {
  let consumed = 0;
  const promotedBlockIds = new Set(input.previous.promotedBlockIds);
  let changed = false;
  for (const block of input.previous.blocks) {
    if (input.activeLanes && !input.activeLanes.includes(block.lane)) continue;
    if (promotedBlockIds.has(block.blockId)) continue;
    const nextConsumed = consumed + block.reservedHeight;
    if (nextConsumed > input.visibleTailHeight) break;
    promotedBlockIds.add(block.blockId);
    changed = true;
    consumed = nextConsumed;
  }
  if (!changed) {
    return input.previous;
  }
  return {
    ...input.previous,
    promotedBlockIds,
    totalReservedHeight: sumReservedHeight(input.previous.blocks, promotedBlockIds),
  };
}

export function calculateEffectiveTotalReservedHeight(
  state: AiStreamingTailState,
  activeLanes?: ('reasoning' | 'content')[]
): number {
  return state.blocks.reduce((total, block) => {
    if (activeLanes && !activeLanes.includes(block.lane)) return total;
    if (state.promotedBlockIds.has(block.blockId)) return total;
    return total + block.reservedHeight;
  }, 0);
}
