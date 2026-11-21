import * as MediaLibrary from 'expo-media-library';
import type {
  NativeSmartMediaDeletionItem,
  NativeSmartMediaDeletionResult,
  NativeManageMediaPermissionStatus,
} from '../native/pixoryMediaModule';

function isAndroidPlatform(): boolean {
  try {
    return require('react-native').Platform.OS === 'android';
  } catch {
    return false;
  }
}

function getPixoryNativeMediaModule() {
  try {
    return require('../native/pixoryMediaModule') as {
      deleteNativeMediaStoreAssetsSmart: (
        items: NativeSmartMediaDeletionItem[]
      ) => Promise<NativeSmartMediaDeletionResult>;
      deleteNativeMediaStoreAssetsWithConfirmation: (ids: string[]) => Promise<boolean>;
      getManageMediaPermissionStatus: () => Promise<NativeManageMediaPermissionStatus>;
      requestManageMediaPermission: () => Promise<boolean>;
    };
  } catch {
    return null;
  }
}

export type MediaSourceDeletionTarget = NativeSmartMediaDeletionItem;

export interface MediaSourceDeletionBatchResult {
  requestedCount: number;
  deletedCount: number;
  failedCount: number;
  granted: boolean;
}

export async function getAutoDeletePermissionStatus(): Promise<boolean> {
  if (!isAndroidPlatform()) {
    return true;
  }
  try {
    const mod = getPixoryNativeMediaModule();
    if (mod && typeof mod.getManageMediaPermissionStatus === 'function') {
      const status = await mod.getManageMediaPermissionStatus();
      return Boolean(status.granted);
    }
  } catch {}
  return false;
}

export async function requestAutoDeletePermission(): Promise<boolean> {
  if (!isAndroidPlatform()) {
    return true;
  }
  try {
    const mod = getPixoryNativeMediaModule();
    if (mod && typeof mod.requestManageMediaPermission === 'function') {
      return await mod.requestManageMediaPermission();
    }
  } catch {}
  return false;
}

export function normalizeMediaStoreAssetIds(assetIds: string[]): string[] {
  return Array.from(new Set(assetIds.map((id) => id.trim()).filter(Boolean)));
}

export async function resolveAssetIdsForTargets(targets: MediaSourceDeletionTarget[]): Promise<string[]> {
  const resolvedIds: string[] = [];
  const unresolvedTargets: MediaSourceDeletionTarget[] = [];

  for (const t of targets) {
    if (t.assetId && t.assetId.trim()) {
      resolvedIds.push(t.assetId.trim());
      continue;
    }
    const uri = t.sourceUri?.trim();
    if (uri && uri.startsWith('content://')) {
      const docMatch = uri.match(/image%3A(\d+)|video%3A(\d+)|media%3A(\d+)/i);
      const tailMatch = uri.match(/\/(\d+)(?:\?.*)?$/);
      const extracted = docMatch ? (docMatch[1] || docMatch[2] || docMatch[3]) : tailMatch ? tailMatch[1] : null;
      if (extracted) {
        resolvedIds.push(extracted);
        continue;
      }
    }
    unresolvedTargets.push(t);
  }

  if (unresolvedTargets.length > 0 && isAndroidPlatform()) {
    try {
      const neededFilenames = new Set(
        unresolvedTargets
          .map((t) => t.originalFilename?.trim())
          .filter((name): name is string => Boolean(name && name.length > 0))
      );
      if (neededFilenames.size > 0) {
        const paged = await MediaLibrary.getAssetsAsync({
          first: 100,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
          mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        });
        for (const asset of paged.assets) {
          if (neededFilenames.has(asset.filename)) {
            resolvedIds.push(asset.id);
            neededFilenames.delete(asset.filename);
            if (neededFilenames.size === 0) break;
          }
        }
      }
    } catch (err) {
      console.warn('Failed to query MediaLibrary for asset IDs:', err);
    }
  }

  return normalizeMediaStoreAssetIds(resolvedIds);
}

export async function deleteMediaStoreAssetsWithConfirmation(assetIds: string[]): Promise<boolean> {
  const uniqueAssetIds = normalizeMediaStoreAssetIds(assetIds);
  if (uniqueAssetIds.length === 0) {
    return true;
  }

  if (isAndroidPlatform()) {
    try {
      const mod = getPixoryNativeMediaModule();
      if (mod && typeof mod.deleteNativeMediaStoreAssetsWithConfirmation === 'function') {
        return await mod.deleteNativeMediaStoreAssetsWithConfirmation(uniqueAssetIds);
      }
    } catch {
      return MediaLibrary.deleteAssetsAsync(uniqueAssetIds);
    }
  }

  return MediaLibrary.deleteAssetsAsync(uniqueAssetIds);
}

export async function deleteImportedMediaSources(
  targets: MediaSourceDeletionTarget[]
): Promise<MediaSourceDeletionBatchResult> {
  if (!targets.length) {
    return {
      requestedCount: 0,
      deletedCount: 0,
      failedCount: 0,
      granted: true,
    };
  }

  if (isAndroidPlatform()) {
    try {
      const mod = getPixoryNativeMediaModule();
      if (mod && typeof mod.deleteNativeMediaStoreAssetsSmart === 'function') {
        const nativeResult: NativeSmartMediaDeletionResult = await mod.deleteNativeMediaStoreAssetsSmart(targets);
        return {
          requestedCount: targets.length,
          deletedCount: nativeResult.deletedCount,
          failedCount: nativeResult.failedCount,
          granted: nativeResult.mode !== 'cancelled',
        };
      }
    } catch (error) {
      console.warn('Native smart media source deletion error:', error);
    }
  }

  // Fallback: resolve real MediaStore asset IDs and use deleteMediaStoreAssetsWithConfirmation
  const assetIds = await resolveAssetIdsForTargets(targets);

  if (assetIds.length > 0) {
    try {
      const success = await deleteMediaStoreAssetsWithConfirmation(assetIds);
      return {
        requestedCount: targets.length,
        deletedCount: success ? assetIds.length : 0,
        failedCount: success ? targets.length - assetIds.length : targets.length,
        granted: success,
      };
    } catch {
      // Continue to failure return below
    }
  }

  return {
    requestedCount: targets.length,
    deletedCount: 0,
    failedCount: targets.length,
    granted: false,
  };
}
