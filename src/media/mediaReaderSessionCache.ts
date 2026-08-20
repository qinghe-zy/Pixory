import type { PixorySpace } from '../database';
import { ScopedLruCache, type ScopedLruCacheOptions } from '../services/scopedLruCache';

const DEFAULT_SESSION_CAPACITY = 8;
const DEFAULT_SESSION_TTL_MS = 10 * 60 * 1_000;

export interface MediaReaderSessionSnapshot<T> {
  currentId: number;
  currentIndex: number;
  entryId: number;
  hasNewer: boolean;
  hasOlder: boolean;
  items: readonly T[];
  newerCursor: unknown | null;
  olderCursor: unknown | null;
  leadingBoundary?: MediaReaderSessionBoundary;
  trailingBoundary?: MediaReaderSessionBoundary;
}

export interface MediaReaderSessionBoundary {
  cursor: unknown | null;
  direction: 'before' | 'after';
  hasMore: boolean;
}

export class MediaReaderSessionCache<T = unknown> {
  private readonly cache: ScopedLruCache<MediaReaderSessionSnapshot<T>>;

  constructor(options: ScopedLruCacheOptions = {
    maxEntries: DEFAULT_SESSION_CAPACITY,
    ttlMs: DEFAULT_SESSION_TTL_MS,
  }) {
    this.cache = new ScopedLruCache(options);
  }

  get(
    space: PixorySpace,
    contextKey: string,
    dataEpoch: number
  ): MediaReaderSessionSnapshot<T> | undefined {
    return this.cache.get(space, createSessionKey(contextKey, dataEpoch));
  }

  set(
    space: PixorySpace,
    contextKey: string,
    dataEpoch: number,
    snapshot: MediaReaderSessionSnapshot<T>
  ): void {
    this.cache.set(space, createSessionKey(contextKey, dataEpoch), snapshot);
  }

  clearSpace(space: PixorySpace): void {
    this.cache.clearScope(space);
  }

  clear(): void {
    this.cache.clear();
  }
}

export function createMediaReaderContextKey(context: unknown): string {
  return JSON.stringify(sortObjectKeys(context));
}

function createSessionKey(contextKey: string, dataEpoch: number): string {
  return JSON.stringify([contextKey, dataEpoch]);
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = sortObjectKeys(record[key]);
        return sorted;
      }, {});
  }
  return value;
}

export const mediaReaderSessionCache = new MediaReaderSessionCache();

export function getMediaReaderSession<T>(
  space: PixorySpace,
  contextKey: string,
  dataEpoch: number
): MediaReaderSessionSnapshot<T> | undefined {
  return mediaReaderSessionCache.get(space, contextKey, dataEpoch) as MediaReaderSessionSnapshot<T> | undefined;
}

export function setMediaReaderSession<T>(
  space: PixorySpace,
  contextKey: string,
  dataEpoch: number,
  snapshot: MediaReaderSessionSnapshot<T>
): void {
  mediaReaderSessionCache.set(space, contextKey, dataEpoch, snapshot);
}

export function clearPersonalMediaReaderSessions(): void {
  mediaReaderSessionCache.clearSpace('personal');
}
