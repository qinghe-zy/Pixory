import { imageRepository, runWithDatabaseSpace, type ImageListItem, type PixorySpace } from '../database';
import { deleteLocalFile } from './fileStorageService';

export type TrashClearFileRole = 'original' | 'thumbnail' | 'cover';

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

async function deleteTrashFile(
  image: ImageListItem,
  fileRole: TrashClearFileRole,
  fileUri: string
): Promise<TrashClearFileFailure | null> {
  try {
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

async function deleteTrashImageFiles(images: ImageListItem[]): Promise<{
  fileDeletedCount: number;
  fileFailures: TrashClearFileFailure[];
}> {
  let fileDeletedCount = 0;
  const fileFailures: TrashClearFileFailure[] = [];

  for (const image of images) {
    const originalFailure = await deleteTrashFile(image, 'original', image.originalFileUri);
    if (originalFailure) {
      fileFailures.push(originalFailure);
    } else {
      fileDeletedCount += 1;
    }

    if (image.thumbnailFileUri) {
      const thumbnailFailure = await deleteTrashFile(image, 'thumbnail', image.thumbnailFileUri);
      if (thumbnailFailure) {
        fileFailures.push(thumbnailFailure);
      } else {
        fileDeletedCount += 1;
      }
    }

    if (image.coverThumbnailFileUri && image.coverThumbnailFileUri !== image.thumbnailFileUri) {
      const coverFailure = await deleteTrashFile(image, 'cover', image.coverThumbnailFileUri);
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

export async function clearTrash(space: PixorySpace = 'normal'): Promise<ClearTrashResult> {
  return runWithDatabaseSpace(space, async (db) => {
    const deletedImages = await imageRepository.findDeleted(db, { mediaType: 'all' });
    const imageIds = deletedImages.map((image) => image.id);
    const databaseDeletedCount = imageIds.length > 0 ? await imageRepository.deletePermanentlyMany(db, imageIds) : 0;
    const shouldDeleteFiles = databaseDeletedCount === deletedImages.length;
    const { fileDeletedCount, fileFailures } = shouldDeleteFiles
      ? await deleteTrashImageFiles(deletedImages)
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
