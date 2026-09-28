import * as FileSystem from 'expo-file-system/legacy';

import { MEDIA_IMPORT_FILE_CONCURRENCY } from '../constants/limits';
import type { PixorySpace } from '../database';
import { settleFileTasksWithConcurrency } from './boundedFileConcurrency';
import {
  evaluateMediaImportPreflight,
  type MediaImportKind,
} from './mediaImportPreflight';

export interface MediaImportSourceAsset {
  fileName?: string | null;
  fileSize?: number | null;
  uri: string;
}

export interface MediaImportPreflightRuntimeInput<T extends MediaImportSourceAsset> {
  assertActive?: () => void;
  assets: readonly T[];
  kind: MediaImportKind;
  signal?: AbortSignal;
  space: PixorySpace;
}

export interface ResolvedMediaImportPreflight<T extends MediaImportSourceAsset> {
  estimatedTotalBytes: number;
  resolvedAssets: Array<T & { fileSize: number | null }>;
}

export interface MixedMediaImportSourceAsset<T extends MediaImportSourceAsset = MediaImportSourceAsset> {
  asset: T;
  kind: MediaImportKind;
}

export interface ResolvedMixedMediaImportPreflight<T extends MediaImportSourceAsset> {
  estimatedTotalBytes: number;
  resolvedAssets: Array<MixedMediaImportSourceAsset<T & { fileSize: number | null }>>;
}

function assetName(asset: MediaImportSourceAsset, index: number): string {
  return asset.fileName?.trim() || `第 ${index + 1} 个文件`;
}

function throwIfRejected(result: ReturnType<typeof evaluateMediaImportPreflight>): asserts result is Extract<ReturnType<typeof evaluateMediaImportPreflight>, { ok: true }> {
  if (!result.ok) {
    throw new Error(result.message);
  }
}

export async function assertMediaImportPreflight<T extends MediaImportSourceAsset>(
  input: MediaImportPreflightRuntimeInput<T>,
): Promise<ResolvedMediaImportPreflight<T>> {
  input.assertActive?.();
  const knownSelectionResult = evaluateMediaImportPreflight({
    assets: input.assets.map((asset, index) => ({
      kind: input.kind,
      name: assetName(asset, index),
      size: typeof asset.fileSize === 'number' && Number.isFinite(asset.fileSize) && asset.fileSize >= 0
        ? asset.fileSize
        : 0,
      uri: asset.uri,
    })),
    cancelled: input.signal?.aborted,
    freeBytes: Number.MAX_SAFE_INTEGER,
    phase: 'before-commit',
    space: input.space,
  });
  throwIfRejected(knownSelectionResult);
  const sizeResults = await settleFileTasksWithConcurrency(
    input.assets,
    MEDIA_IMPORT_FILE_CONCURRENCY,
    async (asset) => {
      input.assertActive?.();
      if (typeof asset.fileSize === 'number' && Number.isFinite(asset.fileSize) && asset.fileSize >= 0) {
        return asset.fileSize;
      }
      try {
        const info = await FileSystem.getInfoAsync(asset.uri);
        return info.exists && !info.isDirectory && typeof info.size === 'number' ? info.size : null;
      } catch {
        return null;
      }
    },
    { signal: input.signal },
  );
  input.assertActive?.();
  const resolvedAssets = input.assets.map((asset, index) => {
    const result = sizeResults[index];
    return {
      ...asset,
      fileSize: result?.status === 'fulfilled' ? result.value : null,
    };
  });
  const freeBytes = await FileSystem.getFreeDiskStorageAsync();
  input.assertActive?.();
  const result = evaluateMediaImportPreflight({
    assets: resolvedAssets.map((asset, index) => ({
      kind: input.kind,
      name: assetName(asset, index),
      size: asset.fileSize,
      uri: asset.uri,
    })),
    cancelled: input.signal?.aborted,
    freeBytes,
    phase: 'before-copy',
    space: input.space,
  });
  throwIfRejected(result);
  return { estimatedTotalBytes: result.estimatedTotalBytes, resolvedAssets };
}

export async function assertMixedMediaImportPreflight<T extends MediaImportSourceAsset>(input: {
  assertActive?: () => void;
  assets: readonly MixedMediaImportSourceAsset<T>[];
  signal?: AbortSignal;
  space: PixorySpace;
}): Promise<ResolvedMixedMediaImportPreflight<T>> {
  input.assertActive?.();
  const knownSelectionResult = evaluateMediaImportPreflight({
    assets: input.assets.map(({ asset, kind }, index) => ({
      kind,
      name: assetName(asset, index),
      size: typeof asset.fileSize === 'number' && Number.isFinite(asset.fileSize) && asset.fileSize >= 0
        ? asset.fileSize
        : 0,
      uri: asset.uri,
    })),
    cancelled: input.signal?.aborted,
    freeBytes: Number.MAX_SAFE_INTEGER,
    phase: 'before-commit',
    space: input.space,
  });
  throwIfRejected(knownSelectionResult);
  const sizeResults = await settleFileTasksWithConcurrency(
    input.assets,
    MEDIA_IMPORT_FILE_CONCURRENCY,
    async ({ asset }) => {
      input.assertActive?.();
      if (typeof asset.fileSize === 'number' && Number.isFinite(asset.fileSize) && asset.fileSize >= 0) {
        return asset.fileSize;
      }
      try {
        const info = await FileSystem.getInfoAsync(asset.uri);
        return info.exists && !info.isDirectory && typeof info.size === 'number' ? info.size : null;
      } catch {
        return null;
      }
    },
    { signal: input.signal },
  );
  input.assertActive?.();
  const resolvedAssets = input.assets.map((entry, index) => {
    const result = sizeResults[index];
    return {
      ...entry,
      asset: {
        ...entry.asset,
        fileSize: result?.status === 'fulfilled' ? result.value : null,
      },
    };
  });
  const freeBytes = await FileSystem.getFreeDiskStorageAsync();
  input.assertActive?.();
  const result = evaluateMediaImportPreflight({
    assets: resolvedAssets.map(({ asset, kind }, index) => ({
      kind,
      name: assetName(asset, index),
      size: asset.fileSize,
      uri: asset.uri,
    })),
    cancelled: input.signal?.aborted,
    freeBytes,
    phase: 'before-copy',
    space: input.space,
  });
  throwIfRejected(result);
  return { estimatedTotalBytes: result.estimatedTotalBytes, resolvedAssets };
}

export async function assertMediaImportCommitBudget(input: {
  assertActive?: () => void;
  committedBytes: number;
  kind: MediaImportKind;
  name: string;
  size: number;
  space: PixorySpace;
}): Promise<number> {
  input.assertActive?.();
  const freeBytes = await FileSystem.getFreeDiskStorageAsync();
  input.assertActive?.();
  const result = evaluateMediaImportPreflight({
    assets: [{ kind: input.kind, name: input.name, size: input.size, uri: '' }],
    freeBytes,
    phase: 'before-commit',
    space: input.space,
    totalBytesAlreadyCommitted: input.committedBytes,
  });
  throwIfRejected(result);
  return result.estimatedTotalBytes;
}

export interface MediaImportCommitBudget {
  committedBytes: number;
  committedCount: number;
}

export function createMediaImportCommitBudget(): MediaImportCommitBudget {
  return { committedBytes: 0, committedCount: 0 };
}

export const MEDIA_IMPORT_COMMIT_RECHECK_INTERVAL = 16;
