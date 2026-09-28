import type { SQLiteDatabase } from 'expo-sqlite';

import { imageRepository, runWithDatabaseSpace, type ImageListItem, type PixorySpace } from '../database';
import { createTimestamp } from '../database/utils';
import { deleteLocalFile, getOriginalsDir, getThumbnailsDir } from './fileStorageService';

export type TrashClearFileRole = 'original' | 'thumbnail' | 'cover';
export const TRASH_RETENTION_DAYS = 30;

export interface TrashClearFileFailure {
  imageId: number;
  originalFilename: string;
  fileRole: TrashClearFileRole;
  fileUri: string;
  message: string;
}

export interface ClearTrashResult {
  requestedCount: number;
  databaseDeletedCount: number;
  fileDeletedCount: number;
  fileFailures: TrashClearFileFailure[];
  clearedCount: number;
  remainingCount: number;
  failures: TrashClearFileFailure[];
}

function isManagedTrashFileUri(fileUri: string, space: PixorySpace): boolean {
  return fileUri.startsWith(getOriginalsDir(space)) || fileUri.startsWith(getThumbnailsDir(space));
}

async function recordTrashCleanupFailure(
  db: SQLiteDatabase,
  failure: TrashClearFileFailure,
  stage: 'database' | 'file'
): Promise<void> {
  await db.runAsync(
    `INSERT INTO trash_cleanup_failures (assetId, fileUri, fileRole, stage, message, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    failure.imageId,
    failure.fileUri,
    failure.fileRole,
    stage,
    failure.message,
    createTimestamp()
  );
}

async function deleteTrashFile(
  image: ImageListItem,
  fileRole: TrashClearFileRole,
  fileUri: string,
  space: PixorySpace
): Promise<TrashClearFileFailure | null> {
  try {
    if (!isManagedTrashFileUri(fileUri, space)) {
      throw new Error('文件不在 Pixory 私有 originals/thumbnails 目录，已跳过物理删除。');
    }
    await deleteLocalFile(fileUri);
    return null;
  } catch (error) {
    return {
      imageId: image.id,
      originalFilename: image.originalFilename,
      fileRole,
      fileUri,
      message: error instanceof Error ? error.message : '未知错误',
    };
  }
}

async function deleteTrashImageFiles(images: ImageListItem[], space: PixorySpace): Promise<{
  fileDeletedCount: number;
  fileFailures: TrashClearFileFailure[];
}> {
  let fileDeletedCount = 0;
  const fileFailures: TrashClearFileFailure[] = [];

  for (const image of images) {
    const originalFailure = await deleteTrashFile(image, 'original', image.originalFileUri, space);
    if (originalFailure) {
      fileFailures.push(originalFailure);
    } else {
      fileDeletedCount += 1;
    }

    if (image.thumbnailFileUri) {
      const thumbnailFailure = await deleteTrashFile(image, 'thumbnail', image.thumbnailFileUri, space);
      if (thumbnailFailure) {
        fileFailures.push(thumbnailFailure);
      } else {
        fileDeletedCount += 1;
      }
    }

    if (image.coverThumbnailFileUri && image.coverThumbnailFileUri !== image.thumbnailFileUri) {
      const coverFailure = await deleteTrashFile(image, 'cover', image.coverThumbnailFileUri, space);
      if (coverFailure) {
        fileFailures.push(coverFailure);
      } else {
        fileDeletedCount += 1;
      }
    }
  }

  return {
    fileDeletedCount,
    fileFailures,
  };
}

export async function findExpiredTrashItems(space: PixorySpace = 'normal'): Promise<ImageListItem[]> {
  const threshold = Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return runWithDatabaseSpace(space, async (db) => {
    const deletedItems = await imageRepository.findDeleted(db, { mediaType: 'all' });
    return deletedItems.filter((image) => {
      if (!image.deletedAt) {
        return false;
      }
      const deletedTime = new Date(image.deletedAt).getTime();
      return Number.isFinite(deletedTime) && deletedTime <= threshold;
    });
  });
}

export async function clearTrashItems(imageIds: number[], space: PixorySpace = 'normal'): Promise<ClearTrashResult> {
  return runWithDatabaseSpace(space, async (db) => {
    const deletedImages = (await imageRepository.findDeleted(db, { mediaType: 'all' })).filter((image) => imageIds.includes(image.id));
    const databaseFailures: TrashClearFileFailure[] = [];
    const databaseDeletedImageIds: number[] = [];
    let databaseDeletedCount = 0;

    for (const image of deletedImages) {
      try {
        const deletedCount = await imageRepository.deletePermanentlyMany(db, [image.id]);
        databaseDeletedCount += deletedCount;
        if (deletedCount > 0) {
          databaseDeletedImageIds.push(image.id);
        }
      } catch (error) {
        const failure = {
          imageId: image.id,
          originalFilename: image.originalFilename,
          fileRole: 'original' as const,
          fileUri: image.originalFileUri,
          message: error instanceof Error ? error.message : '数据库永久删除失败。',
        };
        databaseFailures.push(failure);
        await recordTrashCleanupFailure(db, failure, 'database');
      }
    }

    const deletedImageIds = new Set(databaseDeletedImageIds);
    const fileTargets = deletedImages.filter((image) => deletedImageIds.has(image.id));
    const { fileDeletedCount, fileFailures } = await deleteTrashImageFiles(fileTargets, space);
    for (const failure of fileFailures) {
      await recordTrashCleanupFailure(db, failure, 'file');
    }

    return {
      requestedCount: deletedImages.length,
      databaseDeletedCount,
      fileDeletedCount,
      fileFailures,
      clearedCount: databaseDeletedCount,
      remainingCount: Math.max(0, deletedImages.length - databaseDeletedCount),
      failures: [...databaseFailures, ...fileFailures],
    };
  });
}

export async function clearExpiredTrashOnIdle(space: PixorySpace = 'normal'): Promise<ClearTrashResult> {
  const expiredItems = await findExpiredTrashItems(space);
  return clearTrashItems(expiredItems.map((image) => image.id), space);
}

export async function clearTrash(space: PixorySpace = 'normal'): Promise<ClearTrashResult> {
  return runWithDatabaseSpace(space, async (db) => {
    const deletedImages = await imageRepository.findDeleted(db, { mediaType: 'all' });
    const imageIds = deletedImages.map((image) => image.id);
    const databaseDeletedCount = imageIds.length > 0 ? await imageRepository.deletePermanentlyMany(db, imageIds) : 0;
    const shouldDeleteFiles = databaseDeletedCount === deletedImages.length;
    const { fileDeletedCount, fileFailures } = shouldDeleteFiles
      ? await deleteTrashImageFiles(deletedImages, space)
      : {
          fileDeletedCount: 0,
          fileFailures: deletedImages.map((image) => ({
            imageId: image.id,
            originalFilename: image.originalFilename,
            fileRole: 'original' as const,
            fileUri: image.originalFileUri,
            message: '数据库清空数量不一致，已保留本地文件等待人工核验。',
          })),
        };
    for (const failure of fileFailures) {
      await recordTrashCleanupFailure(db, failure, 'file');
    }

    const clearedCount = databaseDeletedCount;
    const remainingCount = Math.max(0, deletedImages.length - databaseDeletedCount);

    return {
      requestedCount: deletedImages.length,
      databaseDeletedCount,
      fileDeletedCount,
      fileFailures,
      clearedCount,
      remainingCount,
      failures: fileFailures,
    };
  });
}
