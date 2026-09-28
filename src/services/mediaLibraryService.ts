import * as MediaLibrary from 'expo-media-library';

import { getFileInfo } from './fileStorageService';
import { saveNativeImageToMediaStore, saveNativeVideoToMediaStore } from '../native/pixoryMediaModule';

let hasMediaLibrarySavePermission = false;

export interface SystemAlbumOption {
  id: string;
  title: string;
  assetCount: number;
}

export interface SaveImagesToSystemAlbumOptions {
  albumId?: string | null;
  albumTitle?: string | null;
  newAlbumName?: string | null;
  onProgress?: (completedCount: number, totalCount: number) => void;
}

export async function requestMediaLibrarySavePermission(): Promise<void> {
  const isAvailable = await MediaLibrary.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('当前平台不支持保存到系统相册。');
  }

  if (hasMediaLibrarySavePermission) {
    return;
  }

  const currentPermission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
  if (currentPermission.granted) {
    hasMediaLibrarySavePermission = true;
    return;
  }

  const permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
  if (!permission.granted) {
    throw new Error('未获得相册写入权限。');
  }
  hasMediaLibrarySavePermission = true;
}

export async function getSystemAlbums(): Promise<SystemAlbumOption[]> {
  await requestMediaLibrarySavePermission();
  const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: false });
  return albums
    .map((album) => ({ id: album.id, title: album.title, assetCount: album.assetCount }))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}

function getDisplayNameFromUri(fileUri: string): string {
  const [cleanUri] = fileUri.split('?');
  const rawName = cleanUri.split('/').pop() ?? '';
  const decodedName = (() => {
    try {
      return decodeURIComponent(rawName).trim();
    } catch {
      return rawName.trim();
    }
  })();
  return decodedName || `pixory-image-${Date.now()}.jpg`;
}

export async function saveImageToSystemAlbum(
  originalFileUri: string,
  _albumId?: string | null,
  albumTitle?: string | null
): Promise<void> {
  const fileInfo = await getFileInfo(originalFileUri);
  if (!fileInfo.exists || fileInfo.isDirectory) {
    throw new Error('原始素材文件不存在，无法保存到系统相册。');
  }

  const isVideo = /\.(mp4|mov|mkv|webm|avi|m4v|3gp)(?:\?|$)/i.test(originalFileUri);
  if (isVideo) {
    await saveNativeVideoToMediaStore(originalFileUri, getDisplayNameFromUri(originalFileUri));
  } else {
    await saveNativeImageToMediaStore(originalFileUri, getDisplayNameFromUri(originalFileUri), albumTitle?.trim() || null);
  }
}

export interface SaveImagesToSystemAlbumResult {
  successCount: number;
  failedCount: number;
  failedUris: string[];
}

export async function saveImagesToSystemAlbum(
  originalFileUris: string[],
  options: SaveImagesToSystemAlbumOptions = {}
): Promise<SaveImagesToSystemAlbumResult> {
  const uniqueUris = [...new Set(originalFileUris)];
  const failedUris: string[] = [];
  let completedCount = 0;

  function reportProgress() {
    completedCount += 1;
    options.onProgress?.(completedCount, uniqueUris.length);
  }

  const validUris: string[] = [];
  for (const originalFileUri of uniqueUris) {
    const fileInfo = await getFileInfo(originalFileUri);
    if (!fileInfo.exists || fileInfo.isDirectory) {
      failedUris.push(originalFileUri);
      reportProgress();
    } else {
      validUris.push(originalFileUri);
    }
  }

  const newAlbumName = options.newAlbumName?.trim();
  const targetAlbumTitle = newAlbumName || options.albumTitle?.trim() || null;
  for (const originalFileUri of validUris) {
    try {
      await saveImageToSystemAlbum(originalFileUri, options.albumId, targetAlbumTitle);
    } catch {
      failedUris.push(originalFileUri);
    } finally {
      reportProgress();
    }
  }

  return {
    successCount: uniqueUris.length - failedUris.length,
    failedCount: failedUris.length,
    failedUris,
  };
}
