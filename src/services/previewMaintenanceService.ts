import * as FileSystem from 'expo-file-system/legacy';

import { imageRepository, runWithDatabaseSpace, type ImageAssetRecord, type PixorySpace } from '../database';
import { createNativeVideoThumbnail } from '../native/pixoryMediaModule';
import { ensureLocalDirectory, getThumbnailsDir, joinStoragePath } from './fileStorageService';
import { generateThumbnail } from './thumbnailService';

export interface PreviewMaintenanceResult {
  processedCount: number;
  failedCount: number;
}

function normalizeDirectoryUri(directoryUri: string): string {
  return directoryUri.endsWith('/') ? directoryUri : `${directoryUri}/`;
}

async function deleteWithinBase(uri: string, baseUri: string): Promise<void> {
  if (uri !== baseUri && !uri.startsWith(baseUri)) {
    return;
  }

  await FileSystem.deleteAsync(uri, { idempotent: true });
}

async function previewExists(asset: ImageAssetRecord): Promise<boolean> {
  const uri = asset.coverThumbnailFileUri ?? asset.thumbnailFileUri;
  if (!uri) {
    return false;
  }

  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory && (info.size ?? 0) > 0;
  } catch {
    return false;
  }
}

function buildVideoCoverUri(asset: ImageAssetRecord, space: PixorySpace): string {
  const thumbnailsDir = normalizeDirectoryUri(joinStoragePath(getThumbnailsDir(space), `ip_${asset.ipId}`));
  const coverFilename = asset.internalFilename.replace(/\.[A-Za-z0-9]+$/, '') + '_cover.jpg';
  return joinStoragePath(thumbnailsDir, coverFilename);
}

async function regeneratePreviewForAsset(space: PixorySpace, asset: ImageAssetRecord): Promise<void> {
  if (asset.mediaType === 'video') {
    const coverUri = buildVideoCoverUri(asset, space);
    await ensureLocalDirectory(coverUri.slice(0, coverUri.lastIndexOf('/') + 1));
    const cover = await createNativeVideoThumbnail(asset.originalFileUri, coverUri);
    await runWithDatabaseSpace(space, (db) =>
      imageRepository.update(db, asset.id, {
        mediaType: 'video',
        thumbnailFileUri: cover.uri || coverUri,
        coverThumbnailFileUri: cover.uri || coverUri,
        previewStatus: 'ready',
      })
    );
    return;
  }

  const thumbnailUri = await generateThumbnail(asset.originalFileUri, asset.ipId, asset.internalFilename, space);
  await runWithDatabaseSpace(space, (db) =>
    imageRepository.update(db, asset.id, {
      mediaType: 'image',
      thumbnailFileUri: thumbnailUri,
      coverThumbnailFileUri: thumbnailUri,
      previewStatus: 'ready',
    })
  );
}

async function rebuildPreviewsForAssets(space: PixorySpace, assets: ImageAssetRecord[]): Promise<PreviewMaintenanceResult> {
  let processedCount = 0;
  let failedCount = 0;

  for (const asset of assets) {
    try {
      await regeneratePreviewForAsset(space, asset);
      processedCount += 1;
    } catch {
      failedCount += 1;
      await runWithDatabaseSpace(space, (db) =>
        imageRepository.update(db, asset.id, {
          mediaType: asset.mediaType,
          previewStatus: 'failed',
        })
      );
    }
  }

  return { processedCount, failedCount };
}

export async function regenerateMissingPreviews(space: PixorySpace = 'normal'): Promise<PreviewMaintenanceResult> {
  const assets = await runWithDatabaseSpace(space, (db) =>
    imageRepository.findAll(db, { includeDeleted: true, mediaType: 'all' })
  );
  const missing: ImageAssetRecord[] = [];

  for (const asset of assets) {
    if (!(await previewExists(asset))) {
      missing.push(asset);
    }
  }

  return rebuildPreviewsForAssets(space, missing);
}

export async function rebuildAllPreviews(space: PixorySpace = 'normal'): Promise<PreviewMaintenanceResult> {
  const thumbnailsDir = getThumbnailsDir(space);
  const baseUri = thumbnailsDir;
  const uri = thumbnailsDir;
  if (uri.startsWith(baseUri)) {
    await deleteWithinBase(uri, baseUri);
  }
  await ensureLocalDirectory(thumbnailsDir);

  const assets = await runWithDatabaseSpace(space, (db) =>
    imageRepository.findAll(db, { includeDeleted: true, mediaType: 'all' })
  );
  return rebuildPreviewsForAssets(space, assets);
}
