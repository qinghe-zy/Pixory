import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

import type { PixorySpace } from '../database';
import { getTempDir } from './fileStorageService';

export const BACKGROUND_MEMORY_CACHE_CLEAR_DELAY_MS = 5 * 60 * 1000;
export const TEMP_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const TEMP_FILE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

const LAST_TEMP_CLEANUP_KEY = 'pixory.cache.lastTempCleanupAt';
const CLEANUP_SPACES: PixorySpace[] = ['normal', 'personal'];

export interface CacheCleanupResult {
  deletedCount: number;
  deletedBytes: number;
}

export interface CleanupAppCacheOptions {
  includeDiskImageCache?: boolean;
  tempMaxAgeMs?: number;
}

function emptyCleanupResult(): CacheCleanupResult {
  return {
    deletedBytes: 0,
    deletedCount: 0,
  };
}

function mergeCleanupResults(results: CacheCleanupResult[]): CacheCleanupResult {
  return results.reduce(
    (summary, result) => ({
      deletedBytes: summary.deletedBytes + result.deletedBytes,
      deletedCount: summary.deletedCount + result.deletedCount,
    }),
    emptyCleanupResult()
  );
}

function isOlderThan(modificationTime: number | null | undefined, maxAgeMs: number, now = Date.now()): boolean {
  if (maxAgeMs <= 0) {
    return true;
  }

  if (!modificationTime) {
    return false;
  }

  return now - modificationTime * 1000 > maxAgeMs;
}

async function getLocalEntrySize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    return 0;
  }

  if (!info.isDirectory) {
    return info.size ?? 0;
  }

  const names = await FileSystem.readDirectoryAsync(uri);
  const childSizes = await Promise.all(names.map((name) => getLocalEntrySize(`${uri.endsWith('/') ? uri : `${uri}/`}${name}`)));
  return childSizes.reduce((sum, size) => sum + size, 0);
}

export async function clearImageMemoryCache(): Promise<void> {
  await Image.clearMemoryCache();
}

export async function clearImageDiskCache(): Promise<void> {
  await Image.clearDiskCache();
}

export async function cleanupOldTempFiles(
  space: PixorySpace,
  maxAgeMs = TEMP_FILE_MAX_AGE_MS
): Promise<CacheCleanupResult> {
  const tempDir = getTempDir(space);
  const tempInfo = await FileSystem.getInfoAsync(tempDir);
  if (!tempInfo.exists || !tempInfo.isDirectory) {
    return emptyCleanupResult();
  }

  const entryNames = await FileSystem.readDirectoryAsync(tempDir);
  const results: CacheCleanupResult[] = [];

  for (const entryName of entryNames) {
    const entryUri = `${tempDir}${entryName}`;
    const entryInfo = await FileSystem.getInfoAsync(entryUri);
    if (!entryInfo.exists || !isOlderThan(entryInfo.modificationTime, maxAgeMs)) {
      continue;
    }

    const deletedBytes = await getLocalEntrySize(entryUri);
    await FileSystem.deleteAsync(entryUri, { idempotent: true });
    results.push({
      deletedBytes,
      deletedCount: 1,
    });
  }

  return mergeCleanupResults(results);
}

export async function cleanupDailyAppTempCache(): Promise<CacheCleanupResult> {
  const lastTempCleanupAt = await SecureStore.getItemAsync(LAST_TEMP_CLEANUP_KEY);
  const lastCleanupTime = lastTempCleanupAt ? Date.parse(lastTempCleanupAt) : 0;
  if (Number.isFinite(lastCleanupTime) && Date.now() - lastCleanupTime < TEMP_CLEANUP_INTERVAL_MS) {
    return emptyCleanupResult();
  }

  const results = await Promise.all(CLEANUP_SPACES.map((space) => cleanupOldTempFiles(space, TEMP_FILE_MAX_AGE_MS)));
  await SecureStore.setItemAsync(LAST_TEMP_CLEANUP_KEY, new Date().toISOString());
  return mergeCleanupResults(results);
}

export async function cleanupAppCache(options: CleanupAppCacheOptions = {}): Promise<CacheCleanupResult> {
  const { includeDiskImageCache = false, tempMaxAgeMs = TEMP_FILE_MAX_AGE_MS } = options;
  await clearImageMemoryCache();
  if (includeDiskImageCache) {
    await clearImageDiskCache();
  }

  const results = await Promise.all(CLEANUP_SPACES.map((space) => cleanupOldTempFiles(space, tempMaxAgeMs)));
  return mergeCleanupResults(results);
}
