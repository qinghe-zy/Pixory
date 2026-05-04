import * as MediaLibrary from 'expo-media-library';

import { getFileInfo } from './fileStorageService';

export async function saveImageToSystemAlbum(originalFileUri: string): Promise<void> {
  const isAvailable = await MediaLibrary.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('当前平台不支持保存到系统相册。');
  }

  const fileInfo = await getFileInfo(originalFileUri);
  if (!fileInfo.exists || fileInfo.isDirectory) {
    throw new Error('原图文件不存在，无法保存到系统相册。');
  }

  const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  if (!permission.granted) {
    throw new Error('未获得相册写入权限。');
  }

  await MediaLibrary.saveToLibraryAsync(originalFileUri);
}
