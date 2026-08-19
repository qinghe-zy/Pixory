import * as MediaLibrary from 'expo-media-library';

interface PickedAssetWithId {
  assetId?: string | null;
  fileName?: string | null;
}

const METADATA_BATCH_SIZE = 32;

/** Keep library imports in chronological source order; file-picker items retain picker order. */
export async function sortPickedAssetsByCreationTime<T extends PickedAssetWithId>(assets: T[]): Promise<T[]> {
  const creationTimes = new Map<string, number>();

  for (let start = 0; start < assets.length; start += METADATA_BATCH_SIZE) {
    const batch = assets.slice(start, start + METADATA_BATCH_SIZE);
    await Promise.all(batch.map(async (asset) => {
      const assetId = asset.assetId?.trim();
      if (!assetId || creationTimes.has(assetId)) {
        return;
      }

      try {
        const info = await MediaLibrary.getAssetInfoAsync(assetId);
        if (Number.isFinite(info.creationTime)) {
          creationTimes.set(assetId, info.creationTime);
        }
        if (info.filename) {
          asset.fileName = info.filename;
        }
      } catch {
        // Limited/file-provider assets may not expose MediaLibrary metadata; keep picker order for them.
      }
    }));
  }

  return assets
    .map((asset, index) => ({ asset, index }))
    .sort((left, right) => {
      const leftTime = left.asset.assetId ? creationTimes.get(left.asset.assetId) : undefined;
      const rightTime = right.asset.assetId ? creationTimes.get(right.asset.assetId) : undefined;
      if (leftTime != null && rightTime != null && leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      if (leftTime != null && rightTime == null) {
        return -1;
      }
      if (leftTime == null && rightTime != null) {
        return 1;
      }
      return left.index - right.index;
    })
    .map(({ asset }) => asset);
}
