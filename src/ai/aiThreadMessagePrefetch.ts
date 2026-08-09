/**
 * Thread message prefetch cache.
 *
 * When the user taps a thread in the home or history screen, we immediately
 * start reading messages from the database while the navigation animation
 * plays (≈250 ms on Android). By the time AiChatScreen mounts, the data is
 * often already available, so we can skip the async load entirely and render
 * the list at the correct position without any visible scroll.
 *
 * Only the single most-recently-prefetched thread is kept in memory.
 * consumeThreadMessagePrefetch() removes the entry after use to prevent
 * stale data from being shown on a later visit.
 */

import type { PixorySpace } from '../database';
import { CHAT_PREFETCH_PAGE_SIZE } from './aiConstants';
import {
  loadAdoptedThreadRouteSnapshot,
  type AiAdoptedThreadRouteSnapshot,
} from './aiThreadRouteSnapshotService';

interface PrefetchEntry {
  space: PixorySpace;
  threadId: string;
  /** Resolves to one atomically-read adopted route, or rejects on error. */
  promise: Promise<AiAdoptedThreadRouteSnapshot | null>;
}

let activeEntry: PrefetchEntry | null = null;

/**
 * Start prefetching messages for a thread immediately (fire-and-forget).
 * Call this the moment the user taps a thread row, before navigation begins.
 */
export function prefetchThreadMessages(
  space: PixorySpace,
  threadId: string,
): void {
  // Avoid redundant fetches if the same thread is tapped twice.
  if (activeEntry?.space === space && activeEntry.threadId === threadId) {
    return;
  }
  const promise = loadAdoptedThreadRouteSnapshot({
    limit: CHAT_PREFETCH_PAGE_SIZE,
    space,
    threadId,
  });
  activeEntry = { space, threadId, promise };
}

/**
 * Consume the prefetched result for a given thread, if available.
 * The entry is removed after this call so stale data is never reused.
 * Returns null when there is no matching prefetch.
 */
export async function consumeThreadMessagePrefetch(
  space: PixorySpace,
  threadId: string,
): Promise<AiAdoptedThreadRouteSnapshot | null> {
  const entry = activeEntry;
  if (!entry || entry.space !== space || entry.threadId !== threadId) {
    return null;
  }
  // Clear immediately – even if the promise hasn't resolved yet, we own it now.
  activeEntry = null;
  try {
    return await entry.promise;
  } catch {
    return null;
  }
}
