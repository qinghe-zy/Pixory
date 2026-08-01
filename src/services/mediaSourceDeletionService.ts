import * as MediaLibrary from 'expo-media-library';

function isAndroidPlatform(): boolean {
  try {
    return require('react-native').Platform.OS === 'android';
  } catch {
    return false;
  }
}

function requestNativeMediaStoreDeletion(assetIds: string[]): Promise<boolean> {
  const nativeModule = require('../native/pixoryMediaModule') as {
    deleteNativeMediaStoreAssetsWithConfirmation: (ids: string[]) => Promise<boolean>;
  };
  return nativeModule.deleteNativeMediaStoreAssetsWithConfirmation(assetIds);
}

export function normalizeMediaStoreAssetIds(assetIds: string[]): string[] {
  return Array.from(new Set(assetIds.map((id) => id.trim()).filter(Boolean)));
}

export async function deleteMediaStoreAssetsWithConfirmation(assetIds: string[]): Promise<boolean> {
  const uniqueAssetIds = normalizeMediaStoreAssetIds(assetIds);
  if (uniqueAssetIds.length === 0) {
    return true;
  }

  if (isAndroidPlatform()) {
    try {
      return await requestNativeMediaStoreDeletion(uniqueAssetIds);
    } catch {
      return MediaLibrary.deleteAssetsAsync(uniqueAssetIds);
    }
  }

  return MediaLibrary.deleteAssetsAsync(uniqueAssetIds);
}
