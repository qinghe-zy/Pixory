import type { PixorySpace } from '../database';
import type { StorageUsageSummary } from './storageUsageService';
import { getDataEpoch } from './dataEpochService';

const STORAGE_SNAPSHOT_TTL_MS = 2 * 60 * 1000;

interface StorageSnapshotEntry {
  epoch: number;
  storedAt: number;
  summary: StorageUsageSummary;
}

const snapshots = new Map<PixorySpace, StorageSnapshotEntry>();

export function getCachedStorageUsageSummary(space: PixorySpace): StorageUsageSummary | undefined {
  const entry = snapshots.get(space);
  if (!entry) return undefined;
  if (Date.now() - entry.storedAt > STORAGE_SNAPSHOT_TTL_MS || entry.epoch !== getDataEpoch('media', space)) {
    snapshots.delete(space);
    return undefined;
  }
  return entry.summary;
}

export function setCachedStorageUsageSummary(space: PixorySpace, summary: StorageUsageSummary): void {
  snapshots.set(space, { epoch: getDataEpoch('media', space), storedAt: Date.now(), summary });
}

export function invalidateStorageUsageSnapshot(space?: PixorySpace): void {
  if (space) snapshots.delete(space);
  else snapshots.clear();
}
