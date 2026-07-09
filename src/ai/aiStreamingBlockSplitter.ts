import { PixelRatio } from 'react-native';

import { createStreamBlockHeightCacheKey, createStreamingHeightCache, fastStringHash } from './aiStreamingHeightCache';

export const streamBlockHeightCache = createStreamingHeightCache();

export type AiStreamBlockType =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'blockquote'
  | 'code'
  | 'table'
  | 'math'
  | 'image'
  | 'html'
  | 'thinking'
  | 'plain';

export type AiStreamBlock = {
  blockId: string;
  estimatedHeight: number;
  finalized: boolean;
  generationId: string;
  lane: 'reasoning' | 'content';
  measuredHeight?: number;
  messageId: string;
  ordinal: number;
  raw: string;
  reservedHeight: number;
  startOffset: number;
  type: AiStreamBlockType;
};

export type StreamBlockEstimateInput = {
  bubbleWidth: number;
  fontScale?: number;
  lineHeight?: number;
};

const DEFAULT_LINE_HEIGHT = 22;
const MIN_BLOCK_HEIGHT = 24;
const PARAGRAPH_VERTICAL_PADDING = 10;
const CODE_VERTICAL_PADDING = 34;
const TABLE_VERTICAL_PADDING = 30;
const RICH_FALLBACK_HEIGHT = 140;
const SOFT_SEGMENT_MIN_CHARS = 180;
const SOFT_SEGMENT_TARGET_CHARS = 420;
const SOFT_SEGMENT_MAX_CHARS = 560;

function countCjkChars(text: string): number {
  const matches = text.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g);
  return matches?.length ?? 0;
}

function estimateWrappedLines(text: string, bubbleWidth: number): number {
  const safeWidth = Math.max(180, bubbleWidth);
  const cjkCount = countCjkChars(text);
  const nonCjkCount = Math.max(0, text.length - cjkCount);
  const weightedChars = cjkCount + nonCjkCount * 0.55;
  const charsPerLine = Math.max(12, Math.floor(safeWidth / 15));
  return Math.max(1, Math.ceil(weightedChars / charsPerLine));
}

function inferBlockType(raw: string): AiStreamBlockType {
  const trimmed = raw.trimStart();
  if (!trimmed) return 'plain';
  if (/^```/.test(trimmed)) return 'code';
  if (/^\$\$/.test(trimmed)) return 'math';
  if (/^#{1,6}\s/.test(trimmed)) return 'heading';
  if (/^>\s?/m.test(trimmed)) return 'blockquote';
  if (/^(\s*[-*+]\s+|\s*\d+\.\s+)/m.test(trimmed)) return 'list';
  if (/^\|.+\|\r?\n\|[\s:-]+\|/m.test(trimmed)) return 'table';
  if (/^<([a-z][\w-]*)(\s|>|\/>)/i.test(trimmed)) return 'html';
  if (/!\[[^\]]*]\([^)]+\)/.test(trimmed)) return 'image';
  return 'paragraph';
}

export function estimateStreamBlockHeight(
  block: Pick<AiStreamBlock, 'raw' | 'type'>,
  input: StreamBlockEstimateInput
): number {
  const lineHeight = (input.lineHeight ?? DEFAULT_LINE_HEIGHT) * (input.fontScale ?? 1);
  const raw = block.raw || '';
  const physicalLines = Math.max(1, raw.split(/\r?\n/).length);
  if (block.type === 'code') {
    return Math.ceil(Math.max(MIN_BLOCK_HEIGHT, physicalLines * lineHeight + CODE_VERTICAL_PADDING));
  }
  if (block.type === 'table') {
    return Math.ceil(Math.max(MIN_BLOCK_HEIGHT, physicalLines * lineHeight * 1.15 + TABLE_VERTICAL_PADDING));
  }
  if (block.type === 'image' || block.type === 'html' || block.type === 'math') {
    return RICH_FALLBACK_HEIGHT;
  }
  const wrappedLines = estimateWrappedLines(raw, input.bubbleWidth);
  return Math.ceil(Math.max(MIN_BLOCK_HEIGHT, wrappedLines * lineHeight + PARAGRAPH_VERTICAL_PADDING));
}

function isFenceOpen(text: string): boolean {
  return (text.match(/^```/gm)?.length ?? 0) % 2 === 1;
}

function nextBlockId(input: {
  generationId: string;
  lane: 'reasoning' | 'content';
  messageId: string;
  ordinal: number;
  startOffset: number;
  type: AiStreamBlockType;
}): string {
  return `${input.messageId}:${input.generationId}:${input.ordinal}:${input.type}:${input.lane}:${input.startOffset}`;
}

function canSoftSegmentBlock(type: AiStreamBlockType): boolean {
  return type === 'paragraph' || type === 'plain' || type === 'thinking';
}

function findSoftSegmentEnd(raw: string, cursor: number): number {
  const remaining = raw.length - cursor;
  if (remaining <= SOFT_SEGMENT_MAX_CHARS) {
    return raw.length;
  }
  const minEnd = Math.min(raw.length, cursor + SOFT_SEGMENT_MIN_CHARS);
  const targetEnd = Math.min(raw.length, cursor + SOFT_SEGMENT_TARGET_CHARS);
  const maxEnd = Math.min(raw.length, cursor + SOFT_SEGMENT_MAX_CHARS);
  const candidate = raw.slice(minEnd, maxEnd);
  const boundaryPattern = /[\n。！？.!?；;，,]/g;
  let boundaryEnd = -1;
  let match: RegExpExecArray | null;
  while ((match = boundaryPattern.exec(candidate)) !== null) {
    const absoluteEnd = minEnd + match.index + match[0].length;
    if (absoluteEnd <= targetEnd || boundaryEnd < 0) {
      boundaryEnd = absoluteEnd;
    }
    if (absoluteEnd >= targetEnd) {
      break;
    }
  }
  return boundaryEnd > cursor ? boundaryEnd : targetEnd;
}

function splitSoftStreamSegments(input: {
  finalized: boolean;
  raw: string;
  startOffset: number;
  type: AiStreamBlockType;
}): Array<{ finalized: boolean; raw: string; startOffset: number }> {
  if (!canSoftSegmentBlock(input.type) || input.raw.length <= SOFT_SEGMENT_MAX_CHARS) {
    return [{ finalized: input.finalized, raw: input.raw, startOffset: input.startOffset }];
  }
  const segments: Array<{ finalized: boolean; raw: string; startOffset: number }> = [];
  let cursor = 0;
  while (cursor < input.raw.length) {
    const end = findSoftSegmentEnd(input.raw, cursor);
    const raw = input.raw.slice(cursor, end);
    if (raw) {
      segments.push({
        finalized: end < input.raw.length ? true : input.finalized,
        raw,
        startOffset: input.startOffset + cursor,
      });
    }
    if (end <= cursor) {
      break;
    }
    cursor = end;
  }
  return segments;
}

export function splitStreamingTextIntoBlocks(input: {
  bubbleWidth: number;
  content: string;
  fontScale?: number;
  generationId: string;
  lane: 'reasoning' | 'content';
  lineHeight?: number;
  messageId: string;
}): AiStreamBlock[] {
  const content = input.content ?? '';
  if (!content) return [];
  const fontScale = input.fontScale ?? PixelRatio.getFontScale();

  const blocks: AiStreamBlock[] = [];
  const paragraphPattern = /\n{2,}/g;
  let startOffset = 0;
  let match: RegExpExecArray | null;

  const pushBlock = (raw: string, start: number, finalized: boolean) => {
    if (!raw) return;
    const type = input.lane === 'reasoning' ? 'thinking' : inferBlockType(raw);
    const segments = splitSoftStreamSegments({ finalized, raw, startOffset: start, type });
    segments.forEach((segment) => {
      const ordinal = blocks.length;
      const lineCount = Math.max(1, segment.raw.split(/\r?\n/).length);
      const blockId = nextBlockId({
        generationId: input.generationId,
        lane: input.lane,
        messageId: input.messageId,
        ordinal,
        startOffset: segment.startOffset,
        type,
      });
      const cacheKey = createStreamBlockHeightCacheKey({
        blockType: type,
        contentHash: fastStringHash(segment.raw),
        fontScale,
        lane: input.lane,
        lineCount,
        rawLength: segment.raw.length,
        width: input.bubbleWidth,
      });
      const cachedEntry = streamBlockHeightCache.get(cacheKey);
      const estimatedHeight = cachedEntry?.measuredHeight ?? estimateStreamBlockHeight(
        { raw: segment.raw, type },
        { bubbleWidth: input.bubbleWidth, fontScale, lineHeight: input.lineHeight }
      );
      blocks.push({
        blockId,
        estimatedHeight,
        finalized: segment.finalized,
        generationId: input.generationId,
        lane: input.lane,
        messageId: input.messageId,
        ordinal,
        raw: segment.raw,
        reservedHeight: estimatedHeight,
        startOffset: segment.startOffset,
        type,
      });
    });
  };

  while ((match = paragraphPattern.exec(content)) !== null) {
    const end = match.index;
    pushBlock(content.slice(startOffset, end), startOffset, true);
    startOffset = match.index + match[0].length;
  }

  const tail = content.slice(startOffset);
  pushBlock(tail, startOffset, !tail || (!isFenceOpen(tail) && /\n$/.test(content)));
  return blocks;
}

export function chooseGracefulDetachText(input: {
  previousVisibleText: string;
  targetText: string;
  maxExtraChars?: number;
}): string {
  const previous = input.previousVisibleText ?? '';
  const target = input.targetText ?? '';
  if (!target.startsWith(previous)) {
    return previous;
  }
  const maxExtraChars = input.maxExtraChars ?? 64;
  const candidate = target.slice(0, previous.length + maxExtraChars);
  const extra = candidate.slice(previous.length);
  const boundaryMatch = /[\n。！？.!?；;](?![\s\S]*[\n。！？.!?；;])/.exec(extra);
  if (!boundaryMatch) {
    return candidate;
  }
  return previous + extra.slice(0, boundaryMatch.index + boundaryMatch[0].length);
}
