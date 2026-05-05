import { imageRepository, ipRepository, runWithDatabaseSpace, type ImageListItem, type PixorySpace } from '../database';
import { deleteLocalFile } from './fileStorageService';

export interface SoftDeleteIpResult {
  ipDeletedCount: number;
  imageDeletedCount: number;
}

export interface PermanentDeleteIpFileFailure {
  imageId: number;
  fileUri: string;
  fileRole: 'original' | 'thumbnail';
  message: string;
}

export interface PermanentDeleteIpResult {
  ipDeletedCount: number;
  imageDeletedCount: number;
  groupDeletedCount: number;
  importBatchDeletedCount: number;
  fileDeletedCount: number;
  fileFailures: PermanentDeleteIpFileFailure[];
}

export async function softDeleteIpToTrash(ipId: number, space: PixorySpace = 'normal'): Promise<SoftDeleteIpResult> {
  return runWithDatabaseSpace(space, (db) => ipRepository.softDeleteById(db, ipId));
}

export async function permanentlyDeleteIp(ipId: number, space: PixorySpace = 'normal'): Promise<PermanentDeleteIpResult> {
  const { images, databaseResult } = await runWithDatabaseSpace(space, async (db) => ({
    images: await imageRepository.findByIpId(db, ipId, { includeDeleted: true }),
    databaseResult: await ipRepository.deletePermanentlyById(db, ipId),
  }));
  const fileResult = databaseResult.ipDeletedCount > 0 ? await deleteIpImageFiles(images) : { fileDeletedCount: 0, fileFailures: [] };

  return {
    ...databaseResult,
    ...fileResult,
  };
}

async function deleteIpImageFiles(images: ImageListItem[]): Promise<{
  fileDeletedCount: number;
  fileFailures: PermanentDeleteIpFileFailure[];
}> {
  let fileDeletedCount = 0;
  const fileFailures: PermanentDeleteIpFileFailure[] = [];

  for (const image of images) {
    const originalFailure = await deleteIpFile(image, 'original', image.originalFileUri);
    if (originalFailure) {
      fileFailures.push(originalFailure);
    } else {
      fileDeletedCount += 1;
    }

    if (image.thumbnailFileUri) {
      const thumbnailFailure = await deleteIpFile(image, 'thumbnail', image.thumbnailFileUri);
      if (thumbnailFailure) {
        fileFailures.push(thumbnailFailure);
      } else {
        fileDeletedCount += 1;
      }
    }
  }

  return { fileDeletedCount, fileFailures };
}

async function deleteIpFile(
  image: ImageListItem,
  fileRole: 'original' | 'thumbnail',
  fileUri: string
): Promise<PermanentDeleteIpFileFailure | null> {
  try {
    await deleteLocalFile(fileUri);
    return null;
  } catch (error) {
    return {
      imageId: image.id,
      fileRole,
      fileUri,
      message: error instanceof Error ? error.message : '未知错误',
    };
  }
}
