import type { AiStreamBlockType } from './aiStreamingBlockSplitter';

export const AI_STREAMING_HEIGHT_RENDERER_VERSION = 1;

export type AiStreamBlockHeightEntry = {
  blockType: AiStreamBlockType;
  fontScaleBucket: number;
  key: string;
  lineCount: number;
  measuredHeight: number;
  rawLength: number;
  rendererVersion: number;
  updatedAt: number;
  widthBucket: number;
};

export function bucketStreamWidth(width: number): number {
  return Math.round(inputSafeNumber(width, 0) / 8) * 8;
}

export function bucketFontScale(fontScale: number | undefined): number {
  return Math.round(inputSafeNumber(fontScale ?? 1, 1) * 100);
}

function inputSafeNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function fastStringHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function createStreamBlockHeightCacheKey(input: {
  blockType: AiStreamBlockType;
  contentHash: string;
  fontScale?: number;
  lane: 'reasoning' | 'content';
  lineCount: number;
  rawLength: number;
  rendererVersion?: number;
  width: number;
}): string {
  const widthBucket = Math.round(input.width / 8) * 8;
  const fontScaleBucket = bucketFontScale(input.fontScale);
  const rendererVersion = input.rendererVersion ?? AI_STREAMING_HEIGHT_RENDERER_VERSION;
  return [
    input.lane,
    input.blockType,
    widthBucket,
    fontScaleBucket,
    rendererVersion,
    input.rawLength,
    input.lineCount,
    input.contentHash,
  ].join(':');
}

export function createStreamingHeightCache(limit = 500) {
  const entries = new Map<string, AiStreamBlockHeightEntry>();

  function get(key: string): AiStreamBlockHeightEntry | undefined {
    return entries.get(key);
  }

  function set(entry: AiStreamBlockHeightEntry) {
    entries.set(entry.key, entry);
    if (entries.size <= limit) return;
    const oldest = entries.keys().next().value;
    if (oldest) entries.delete(oldest);
  }

  function clear() {
    entries.clear();
  }

  return { clear, get, set };
}
