import type { AiStreamBlock } from "./aiStreamingBlockSplitter";

export type AiStreamingTailContinuationGroup = {
  blocks: AiStreamBlock[];
  endOrdinal: number;
  generationId: string;
  groupId: string;
  lane: "reasoning" | "content";
  messageId: string;
  startOrdinal: number;
};

type GroupInput = {
  activeLanes?: ("reasoning" | "content")[];
  blocks: AiStreamBlock[];
  promotedBlockIds: Set<string>;
};

function createGroupId(input: {
  generationId: string;
  lane: "reasoning" | "content";
  messageId: string;
  startOrdinal: number;
}): string {
  return [
    "stream-tail-continuation",
    input.messageId,
    input.generationId,
    input.lane,
    input.startOrdinal,
  ].join(":");
}

function createGroup(blocks: AiStreamBlock[]): AiStreamingTailContinuationGroup {
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  return {
    blocks,
    endOrdinal: last.ordinal,
    generationId: first.generationId,
    groupId: createGroupId({
      generationId: first.generationId,
      lane: first.lane,
      messageId: first.messageId,
      startOrdinal: first.ordinal,
    }),
    lane: first.lane,
    messageId: first.messageId,
    startOrdinal: first.ordinal,
  };
}

export function groupPromotedStreamingTailBlocks({
  activeLanes,
  blocks,
  promotedBlockIds,
}: GroupInput): AiStreamingTailContinuationGroup[] {
  const activeLaneSet = activeLanes ? new Set(activeLanes) : null;
  const groups: AiStreamingTailContinuationGroup[] = [];
  let currentBlocks: AiStreamBlock[] = [];

  const flush = () => {
    if (currentBlocks.length === 0) {
      return;
    }
    groups.push(createGroup(currentBlocks));
    currentBlocks = [];
  };

  for (const block of blocks) {
    const active = !activeLaneSet || activeLaneSet.has(block.lane);
    if (!active || !promotedBlockIds.has(block.blockId)) {
      flush();
      continue;
    }

    const previous = currentBlocks[currentBlocks.length - 1];
    const canAppend =
      previous &&
      previous.lane === block.lane &&
      previous.messageId === block.messageId &&
      previous.generationId === block.generationId &&
      previous.ordinal + 1 === block.ordinal;

    if (!previous || canAppend) {
      currentBlocks.push(block);
      continue;
    }

    flush();
    currentBlocks.push(block);
  }

  flush();
  return groups;
}
