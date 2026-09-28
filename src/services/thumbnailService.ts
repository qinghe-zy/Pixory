import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import type { PixorySpace } from '../database';
import { ensureAppDirectories, getThumbnailsDir } from './fileStorageService';

const THUMBNAIL_MAX_DIMENSION = 480;

function normalizeDirectoryUri(directoryUri: string): string {
  return directoryUri.endsWith('/') ? directoryUri : `${directoryUri}/`;
}

function joinPath(baseDir: string, childName: string): string {
  return `${normalizeDirectoryUri(baseDir)}${childName}`;
}

function buildIpScopedThumbnailDir(ipId: number, space: PixorySpace = 'normal'): string {
  return normalizeDirectoryUri(joinPath(getThumbnailsDir(space), `ip_${ipId}`));
}

function getThumbnailFormat(internalFilename: string): SaveFormat {
  const lowerCasedName = internalFilename.toLowerCase();

  if (lowerCasedName.endsWith('.jpg') || lowerCasedName.endsWith('.jpeg')) {
    return SaveFormat.JPEG;
  }

  return SaveFormat.PNG;
}

function getThumbnailFilename(internalFilename: string, format: SaveFormat): string {
  const extension = format === SaveFormat.JPEG ? '.jpg' : '.png';
  const baseName = internalFilename.replace(/\.[A-Za-z0-9]+$/, '');
  return `${baseName}_thumb${extension}`;
}

function getResizeAction(width: number, height: number): { width?: number; height?: number } {
  if (width <= THUMBNAIL_MAX_DIMENSION && height <= THUMBNAIL_MAX_DIMENSION) {
    return { width, height };
  }

  if (width >= height) {
    return { width: THUMBNAIL_MAX_DIMENSION };
  }

  return { height: THUMBNAIL_MAX_DIMENSION };
}

function getImageDimensions(fileUri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      fileUri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
}

export async function generateThumbnail(
  originalFileUri: string,
  ipId: number,
  internalFilename: string,
  space: PixorySpace = 'normal'
): Promise<string> {
  await ensureAppDirectories(space);

  const thumbnailDir = buildIpScopedThumbnailDir(ipId, space);
  await FileSystem.makeDirectoryAsync(thumbnailDir, { intermediates: true });

  const { width, height } = await getImageDimensions(originalFileUri);
  const format = getThumbnailFormat(internalFilename);
  const thumbnailFilename = getThumbnailFilename(internalFilename, format);

  const manipulatedImage = await manipulateAsync(
    originalFileUri,
    [{ resize: getResizeAction(width, height) }],
    {
      compress: format === SaveFormat.JPEG ? 0.82 : 1,
      format,
    }
  );

  const thumbnailUri = joinPath(thumbnailDir, thumbnailFilename);

  await FileSystem.copyAsync({
    from: manipulatedImage.uri,
    to: thumbnailUri,
  });

  if (manipulatedImage.uri !== thumbnailUri) {
    await FileSystem.deleteAsync(manipulatedImage.uri, { idempotent: true });
  }

  return thumbnailUri;
}
