import type { PixorySpace } from '../database';
import type { StorageUsageSummary } from './storageUsageService';
import { getDataEpoch } from './dataEpochService';

const STORAGE_SNAPSHOT_TTL_MS = 2 * 60 * 1000;

interface StorageSnapshotEntry {
  epoch: number;
  storedAt: number;
  summary: StorageUsageSummary;
}

type StorageTotalListener = (totalBytes: number) => void;

const snapshots = new Map<PixorySpace, StorageSnapshotEntry>();
const latestKnownTotals = new Map<PixorySpace, number>();
const totalListeners = new Map<PixorySpace, Set<StorageTotalListener>>();

export function getCachedStorageUsageSummary(space: PixorySpace): StorageUsageSummary | undefined {
  const entry = snapshots.get(space);
  if (!entry) return undefined;
  if (Date.now() - entry.storedAt > STORAGE_SNAPSHOT_TTL_MS || entry.epoch !== getDataEpoch('media', space)) {
    snapshots.delete(space);
    return undefined;
  }
  return entry.summary;
}

/** Returns the most recent scanned total bytes for a space even after the full-summary TTL expires. */
export function getLatestStorageTotalBytes(space: PixorySpace): number | undefined {
  return latestKnownTotals.get(space);
}

/** Updates the latest scanned total bytes for a space and notifies active subscribers. */
export function setLatestStorageTotalBytes(space: PixorySpace, totalBytes: number): void {
  if (!Number.isFinite(totalBytes) || totalBytes < 0) return;
  latestKnownTotals.set(space, totalBytes);
  const listeners = totalListeners.get(space);
  if (!listeners) return;
  for (const listener of listeners) {
    listener(totalBytes);
  }
}

/** Subscribes to latest scanned total byte updates for a specific space. */
export function subscribeLatestStorageTotalBytes(
  space: PixorySpace,
  listener: StorageTotalListener,
): () => void {
  let listeners = totalListeners.get(space);
  if (!listeners) {
    listeners = new Set();
    totalListeners.set(space, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
  };
}

export function setCachedStorageUsageSummary(space: PixorySpace, summary: StorageUsageSummary): void {
  snapshots.set(space, { epoch: getDataEpoch('media', space), storedAt: Date.now(), summary });
  setLatestStorageTotalBytes(space, summary.totalBytes);
}

export function invalidateStorageUsageSnapshot(space?: PixorySpace): void {
  if (space) snapshots.delete(space);
  else snapshots.clear();
}

/** Clears both the full-summary snapshot and latest known total for a space (e.g., on Personal lock). */
export function clearSpaceStorageSnapshotCache(space?: PixorySpace): void {
  invalidateStorageUsageSnapshot(space);
  if (space) {
    latestKnownTotals.delete(space);
  } else {
    latestKnownTotals.clear();
  }
}
