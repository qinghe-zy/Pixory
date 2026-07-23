import * as MediaLibrary from 'expo-media-library';

export function normalizeMediaStoreAssetIds(assetIds: string[]): string[] {
  return Array.from(new Set(assetIds.map((id) => id.trim()).filter(Boolean)));
}

export async function deleteMediaStoreAssetsWithConfirmation(assetIds: string[]): Promise<boolean> {
  const uniqueAssetIds = normalizeMediaStoreAssetIds(assetIds);
  if (uniqueAssetIds.length === 0) {
    return true;
  }
  return MediaLibrary.deleteAssetsAsync(uniqueAssetIds);
}
