import { imageRepository, type ImageListItem } from '../database';
import { deleteLocalFile } from './fileStorageService';

export interface TrashClearFailure {
  imageId: number;
  originalFilename: string;
  message: string;
}

export interface ClearTrashResult {
  clearedCount: number;
  remainingCount: number;
  failures: TrashClearFailure[];
}

async function clearSingleTrashImage(image: ImageListItem): Promise<void> {
  await deleteLocalFile(image.originalFileUri);

  if (image.thumbnailFileUri) {
    await deleteLocalFile(image.thumbnailFileUri);
  }

  const deletedCount = await imageRepository.deletePermanentlyMany([image.id]);
  if (deletedCount === 0) {
    throw new Error('图片记录未能从数据库中清除。');
  }
}

export async function clearTrash(): Promise<ClearTrashResult> {
  const deletedImages = await imageRepository.findDeleted();
  let clearedCount = 0;
  const failures: TrashClearFailure[] = [];

  for (const image of deletedImages) {
    try {
      await clearSingleTrashImage(image);
      clearedCount += 1;
    } catch (error) {
      failures.push({
        imageId: image.id,
        originalFilename: image.originalFilename,
        message: error instanceof Error ? error.message : '未知错误',
      });
    }
  }

  return {
    clearedCount,
    remainingCount: deletedImages.length - clearedCount,
    failures,
  };
}
