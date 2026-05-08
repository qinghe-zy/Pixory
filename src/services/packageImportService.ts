import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getUncompressedSize, unzip } from 'react-native-zip-archive';

import { groupRepository, importBatchRepository, runWithDatabaseSpace, type GroupRecord, type ImportBatchItemRecord, type PixorySpace } from '../database';
import {
  copyLocalFile,
  deleteLocalFile,
  ensureAppDirectories,
  ensureLocalDirectory,
  getFileInfo,
  getTempDir,
  joinStoragePath,
} from './fileStorageService';
import { importSingleImage, type ImportedImageResult, type PickedImageAsset } from './imageImportService';
import { importPlainBackupPackage, type ImportPlainBackupPackageResult } from './backupService';
import { importVideosToIp, type ImportedVideoResult, type PickedVideoAsset } from './videoImportService';

export const MAX_PACKAGE_BYTES = 200 * 1024 * 1024;
export const MAX_UNCOMPRESSED_BYTES = 800 * 1024 * 1024;
export const MAX_PACKAGE_FILE_COUNT = 1000;
export const MAX_PACKAGE_DIRECTORY_DEPTH = 8;
const MIN_FREE_STORAGE_AFTER_IMPORT_BYTES = 64 * 1024 * 1024;
const MAGIC_BYTE_READ_LENGTH = 16;

type SupportedPackageImageType = {
  mimeType: string;
  extension: string;
};

type SupportedPackageVideoType = {
  mimeType: string;
  extension: string;
};

export interface PickPackageForImportResult {
  canceled: boolean;
  packageUri: string | null;
  packageName: string | null;
}


export interface PackageImportError {
  sourcePath: string;
  originalFilename: string;
  message: string;
}

export interface PackageImportResult {
  importBatchId: number | null;
  successCount: number;
  imageSuccessCount: number;
  videoSuccessCount: number;
  failedCount: number;
  imageFailedCount: number;
  videoFailedCount: number;
  importedImages: ImportedImageResult[];
  importedVideos: ImportedVideoResult[];
  errors: PackageImportError[];
  skippedCount: number;
  imageSkippedCount: number;
  videoSkippedCount: number;
  plainBackupImport: ImportPlainBackupPackageResult | null;
  items: ImportBatchItemRecord[];
}

interface ExtractedPackageFile {
  uri: string;
  relativePath: string;
  name: string;
}

const SUPPORTED_PACKAGE_EXTENSIONS = ['zip', 'pixorypack'];

function normalizeDirectoryUri(directoryUri: string): string {
  return directoryUri.endsWith('/') ? directoryUri : `${directoryUri}/`;
}

function getFileName(fileUri: string): string {
  return fileUri.replace(/\/$/, '').split('/').pop() ?? 'package.pixorypack';
}

function getFileStem(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

function getPackageExtension(fileName: string): string | null {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName.trim());
  return match ? match[1].toLowerCase() : null;
}

function sanitizePathName(name: string): string {
  return name
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'package';
}

async function copyPackageToPrivateTemp(
  packageUri: string,
  packageName: string,
  space: PixorySpace
): Promise<string> {
  const tempDir = getTempDir(space);
  await ensureLocalDirectory(tempDir);
  const extension = getPackageExtension(packageName) ?? 'zip';
  const destinationUri = joinStoragePath(
    tempDir,
    `${sanitizePathName(getFileStem(packageName))}_${Date.now()}.${extension}`
  );
  await copyLocalFile(packageUri, destinationUri);
  return destinationUri;
}

async function unzipPackageToPrivateTemp(packageUri: string, space: PixorySpace): Promise<string> {
  const targetDir = normalizeDirectoryUri(joinStoragePath(getTempDir(space), `package_${Date.now()}`));
  await ensureLocalDirectory(targetDir);
  await unzip(packageUri, targetDir);
  return targetDir;
}

function assertSafeExtractedPath(rootDir: string, candidateUri: string): void {
  const normalizedRoot = normalizeDirectoryUri(rootDir);
  const normalizedCandidate = candidateUri.replace(/\\/g, '/');
  if (
    normalizedCandidate.includes('../') ||
    normalizedCandidate.includes('..%2f') ||
    !normalizedCandidate.startsWith(normalizedRoot)
  ) {
    throw new Error('资源包包含不安全路径，已停止导入。');
  }
}

function getDirectoryDepth(relativePath: string): number {
  return relativePath.split('/').filter(Boolean).length;
}

async function scanExtractedFiles(rootDir: string): Promise<ExtractedPackageFile[]> {
  const files: ExtractedPackageFile[] = [];
  const normalizedRoot = normalizeDirectoryUri(rootDir);

  async function visit(directoryUri: string, relativeDir: string): Promise<void> {
    const entries = await FileSystem.readDirectoryAsync(directoryUri);
    for (const entry of entries) {
      const entryUri = `${normalizeDirectoryUri(directoryUri)}${entry}`;
      assertSafeExtractedPath(normalizedRoot, entryUri);
      const relativePath = `${relativeDir}${entry}`;
      if (getDirectoryDepth(relativePath) > MAX_PACKAGE_DIRECTORY_DEPTH) {
        throw new Error('资源包目录层级过深。');
      }

      const info = await FileSystem.getInfoAsync(entryUri);
      if (!info.exists) {
        continue;
      }

      if (info.isDirectory) {
        await visit(`${entryUri}/`, `${relativePath}/`);
        continue;
      }

      files.push({ uri: entryUri, relativePath, name: entry });
      if (files.length > MAX_PACKAGE_FILE_COUNT) {
        throw new Error('资源包文件数量过多。');
      }
    }
  }

  await visit(normalizedRoot, '');
  return files;
}

async function detectImageTypeFromMagicBytes(fileUri: string): Promise<SupportedPackageImageType | null> {
  const base64Header = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
    position: 0,
    length: MAGIC_BYTE_READ_LENGTH,
  });

  if (base64Header.startsWith('iVBORw0KGgo')) {
    return { mimeType: 'image/png', extension: 'png' };
  }

  if (base64Header.startsWith('/9j/')) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }

  if (base64Header.startsWith('UklGR')) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }

  if (base64Header.startsWith('R0lGOD')) {
    return { mimeType: 'image/gif', extension: 'gif' };
  }

  if (base64Header.startsWith('Qk')) {
    return { mimeType: 'image/bmp', extension: 'bmp' };
  }

  return null;
}

async function detectVideoTypeFromMagicBytes(fileUri: string): Promise<SupportedPackageVideoType | null> {
  const base64Header = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
    position: 0,
    length: MAGIC_BYTE_READ_LENGTH,
  });

  if (base64Header.includes('ZnR5c')) {
    return { mimeType: 'video/mp4', extension: 'mp4' };
  }

  if (base64Header.startsWith('AAAA') || base64Header.startsWith('GkXf')) {
    return { mimeType: 'video/mp4', extension: 'mp4' };
  }

  return null;
}

function looksLikePixoryManifest(files: ExtractedPackageFile[]): boolean {
  return files.some((file) => file.relativePath === 'manifest.json' || file.relativePath.endsWith('/manifest.json'));
}

async function importSingleVideoFromPackage(params: {
  space: PixorySpace;
  ipId: number;
  groupIds: number[];
  tagNames?: string[];
  note?: string | null;
  isFavorite?: boolean;
  file: ExtractedPackageFile;
  videoType: SupportedPackageVideoType;
}): Promise<ImportedVideoResult> {
  const fileName = params.file.name.includes('.') ? params.file.name : `${params.file.name}.${params.videoType.extension}`;
  const pickedAsset: PickedVideoAsset = {
    uri: params.file.uri,
    fileName,
    mimeType: params.videoType.mimeType,
    fileSize: (await getFileInfo(params.file.uri)).size ?? null,
  };
  const result = await importVideosToIp({
    space: params.space,
    ipId: params.ipId,
    groupIds: params.groupIds,
    tagNames: params.tagNames,
    note: params.note,
    isFavorite: params.isFavorite,
    pickedAssets: [pickedAsset],
    title: '资源包视频导入',
  });
  const importedVideo = result.importedVideos[0];
  if (!importedVideo) {
    throw new Error(result.errors[0]?.message ?? '视频导入失败。');
  }
  return importedVideo;
}

function resolvePackageGroupName(relativePath: string): string | null {
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length <= 1) {
    return null;
  }

  return sanitizePathName(parts[parts.length - 2]);
}

async function getOrCreatePackageGroup(
  db: SQLiteDatabase,
  ipId: number,
  groupName: string | null
): Promise<GroupRecord | null> {
  if (!groupName) {
    return null;
  }

  const existingGroup = await groupRepository.findByIpIdAndName(db, ipId, groupName);
  return existingGroup ?? groupRepository.create(db, { ipId, name: groupName, type: 'custom' });
}

function mergePackageGroupIds(manualGroupIds: number[] = [], packageGroupId: number | null): number[] {
  const mergedIds = [...manualGroupIds];
  if (packageGroupId != null) {
    mergedIds.push(packageGroupId);
  }
  return [...new Set(mergedIds.filter((groupId) => Number.isInteger(groupId) && groupId > 0))];
}

async function validatePackageFile(packageUri: string, packageName: string): Promise<void> {
  const extension = getPackageExtension(packageName);
  if (!extension || !SUPPORTED_PACKAGE_EXTENSIONS.includes(extension)) {
    throw new Error('请选择 .zip / .pixorypack 资源包。');
  }

  const packageInfo = await getFileInfo(packageUri);
  if ((packageInfo.size ?? 0) > MAX_PACKAGE_BYTES) {
    throw new Error('资源包体积过大。');
  }

  const uncompressedBytes = await getUncompressedSize(packageUri);
  if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
    throw new Error('资源包解压后体积过大。');
  }

  await assertEnoughStorageForPackage(uncompressedBytes, packageInfo.size ?? 0);
}

async function assertEnoughStorageForPackage(uncompressedBytes: number, packageBytes: number): Promise<void> {
  const freeBytes = await FileSystem.getFreeDiskStorageAsync();
  const requiredBytes = uncompressedBytes + packageBytes + MIN_FREE_STORAGE_AFTER_IMPORT_BYTES;
  if (freeBytes < requiredBytes) {
    throw new Error('设备剩余空间不足，已停止导入。');
  }
}

export async function pickPackageForImport(): Promise<PickPackageForImportResult> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ['application/zip', 'application/octet-stream', '*/*'],
  });

  if (result.canceled) {
    return { canceled: true, packageUri: null, packageName: null };
  }

  const asset = result.assets[0];
  return {
    canceled: false,
    packageUri: asset.uri,
    packageName: asset.name ?? getFileName(asset.uri),
  };
}

export async function importPackageToIp(params: {
  space?: PixorySpace;
  ipId: number;
  packageUri: string;
  packageName: string;
  tagNames?: string[];
  groupIds?: number[];
  note?: string | null;
  isFavorite?: boolean;
}): Promise<PackageImportResult> {
  const space = params.space ?? 'normal';
  await ensureAppDirectories(space);

  return runWithDatabaseSpace(space, async (db) => {
    let copiedPackageUri: string | null = null;
    let extractDir: string | null = null;

    try {
      copiedPackageUri = await copyPackageToPrivateTemp(params.packageUri, params.packageName, space);
      await validatePackageFile(copiedPackageUri, params.packageName);
      extractDir = await unzipPackageToPrivateTemp(copiedPackageUri, space);
      const files = await scanExtractedFiles(extractDir);
      if (looksLikePixoryManifest(files)) {
        const plainBackupImport = await importPlainBackupPackage({
          space,
          extractedDirectoryUri: extractDir,
          mode: 'merge',
        });
        return {
          importBatchId: null,
          successCount: plainBackupImport.importedImageCount,
          imageSuccessCount: plainBackupImport.importedImageCount,
          videoSuccessCount: 0,
          failedCount: 0,
          imageFailedCount: 0,
          videoFailedCount: 0,
          importedImages: [],
          importedVideos: [],
          errors: [],
          skippedCount: 0,
          imageSkippedCount: 0,
          videoSkippedCount: 0,
          plainBackupImport,
          items: [],
        };
      }
      const importBatch = await importBatchRepository.create(db, {
        ipId: params.ipId,
        name: `${params.packageName} 资源包导入`,
        totalCount: files.length,
      });
      const importedImages: ImportedImageResult[] = [];
      const importedVideos: ImportedVideoResult[] = [];
      const errors: PackageImportError[] = [];
      const items: ImportBatchItemRecord[] = [];
      let skippedCount = 0;
      let imageSkippedCount = 0;
      let videoSkippedCount = 0;
      let imageFailedCount = 0;
      let videoFailedCount = 0;

      for (const file of files) {
        try {
          const imageType = await detectImageTypeFromMagicBytes(file.uri);
          const videoType = imageType ? null : await detectVideoTypeFromMagicBytes(file.uri);
          if (!imageType && !videoType) {
            skippedCount += 1;
            imageSkippedCount += 1;
            items.push(
              await importBatchRepository.createItem(db, {
                importBatchId: importBatch.id,
                sourcePath: file.relativePath,
                originalFilename: file.name,
                status: 'skipped',
                reason: 'Unsupported file type or unrecognized image magic bytes.',
              })
            );
            continue;
          }

          const group = await getOrCreatePackageGroup(db, params.ipId, resolvePackageGroupName(file.relativePath));
          const groupIds = mergePackageGroupIds(params.groupIds, group?.id ?? null);
          if (videoType) {
            const importedVideo = await importSingleVideoFromPackage({
              space,
              ipId: params.ipId,
              groupIds,
              tagNames: params.tagNames,
              note: params.note,
              isFavorite: params.isFavorite,
              file,
              videoType,
            });
            importedVideos.push(importedVideo);
            items.push(
              await importBatchRepository.createItem(db, {
                importBatchId: importBatch.id,
                sourcePath: file.relativePath,
                originalFilename: file.name,
                status: 'success',
                imageAssetId: importedVideo.video.id,
              })
            );
            continue;
          }

          if (!imageType) {
            continue;
          }

          const fileName = file.name.includes('.') ? file.name : `${file.name}.${imageType.extension}`;
          const pickedAsset: PickedImageAsset = {
            uri: file.uri,
            fileName,
            mimeType: imageType.mimeType,
            type: 'image',
            width: 0,
            height: 0,
          };

          importedImages.push(
            await importSingleImage({
              space,
              ipId: params.ipId,
              importBatchId: importBatch.id,
              groupId: groupIds[0] ?? null,
              groupIds,
              pickedAsset,
              tagNames: params.tagNames,
              note: params.note,
              isFavorite: params.isFavorite,
            })
          );
          const importedImage = importedImages[importedImages.length - 1];
          if (importedImage) {
            items.push(
              await importBatchRepository.createItem(db, {
                importBatchId: importBatch.id,
                sourcePath: file.relativePath,
                originalFilename: file.name,
                status: 'success',
                imageAssetId: importedImage.image.id,
              })
            );
          }
        } catch (error) {
          const importError = {
            sourcePath: file.relativePath,
            originalFilename: file.name,
            message: error instanceof Error ? error.message : '未知导入错误。',
          };
          errors.push(importError);
          if (/\.(mp4|mov|mkv|webm|avi)$/i.test(file.name)) {
            videoFailedCount += 1;
          } else {
            imageFailedCount += 1;
          }
          items.push(
            await importBatchRepository.createItem(db, {
              importBatchId: importBatch.id,
              sourcePath: file.relativePath,
              originalFilename: file.name,
              status: 'failed',
              reason: importError.message,
            })
          );
        }
      }

      await importBatchRepository.complete(db, importBatch.id, importedImages.length + importedVideos.length, errors.length);

      return {
        importBatchId: importBatch.id,
        successCount: importedImages.length + importedVideos.length,
        imageSuccessCount: importedImages.length,
        videoSuccessCount: importedVideos.length,
        failedCount: errors.length,
        imageFailedCount,
        videoFailedCount,
        importedImages,
        importedVideos,
        errors,
        skippedCount,
        imageSkippedCount,
        videoSkippedCount,
        plainBackupImport: null,
        items,
      };
    } finally {
      if (extractDir) {
        await FileSystem.deleteAsync(extractDir, { idempotent: true });
      }
      if (copiedPackageUri) {
        await deleteLocalFile(copiedPackageUri);
      }
    }
  });
}
