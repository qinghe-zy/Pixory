import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { getUncompressedSize, unzip } from 'react-native-zip-archive';

import { groupRepository, runWithDatabaseSpace, type GroupRecord, type PixorySpace } from '../database';
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

export const MAX_PACKAGE_BYTES = 200 * 1024 * 1024;
export const MAX_UNCOMPRESSED_BYTES = 800 * 1024 * 1024;
export const MAX_PACKAGE_FILE_COUNT = 1000;
export const MAX_PACKAGE_DIRECTORY_DEPTH = 8;

type SupportedPackageImageType = {
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
  successCount: number;
  failedCount: number;
  importedImages: ImportedImageResult[];
  errors: PackageImportError[];
  skippedCount: number;
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
  const base64Contents = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (base64Contents.startsWith('iVBORw0KGgo')) {
    return { mimeType: 'image/png', extension: 'png' };
  }

  if (base64Contents.startsWith('/9j/')) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }

  if (base64Contents.startsWith('UklGR')) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }

  if (base64Contents.startsWith('R0lGOD')) {
    return { mimeType: 'image/gif', extension: 'gif' };
  }

  if (base64Contents.startsWith('Qk')) {
    return { mimeType: 'image/bmp', extension: 'bmp' };
  }

  return null;
}

function resolvePackageGroupName(relativePath: string): string | null {
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length <= 1) {
    return null;
  }

  return sanitizePathName(parts[parts.length - 2]);
}

async function getOrCreatePackageGroup(
  ipId: number,
  groupName: string | null
): Promise<GroupRecord | null> {
  if (!groupName) {
    return null;
  }

  const existingGroup = await groupRepository.findByIpIdAndName(ipId, groupName);
  return existingGroup ?? groupRepository.create({ ipId, name: groupName, type: 'custom' });
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
  note?: string | null;
  isFavorite?: boolean;
}): Promise<PackageImportResult> {
  const space = params.space ?? 'normal';
  await ensureAppDirectories(space);

  return runWithDatabaseSpace(space, async () => {
    let copiedPackageUri: string | null = null;
    let extractDir: string | null = null;

    try {
      copiedPackageUri = await copyPackageToPrivateTemp(params.packageUri, params.packageName, space);
      await validatePackageFile(copiedPackageUri, params.packageName);
      extractDir = await unzipPackageToPrivateTemp(copiedPackageUri, space);
      const files = await scanExtractedFiles(extractDir);
      const importedImages: ImportedImageResult[] = [];
      const errors: PackageImportError[] = [];
      let skippedCount = 0;

      for (const file of files) {
        try {
          const imageType = await detectImageTypeFromMagicBytes(file.uri);
          if (!imageType) {
            skippedCount += 1;
            continue;
          }

          const group = await getOrCreatePackageGroup(params.ipId, resolvePackageGroupName(file.relativePath));
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
              groupId: group?.id ?? null,
              pickedAsset,
              tagNames: params.tagNames,
              note: params.note,
              isFavorite: params.isFavorite,
            })
          );
        } catch (error) {
          errors.push({
            sourcePath: file.relativePath,
            originalFilename: file.name,
            message: error instanceof Error ? error.message : '未知导入错误。',
          });
        }
      }

      return {
        successCount: importedImages.length,
        failedCount: errors.length,
        importedImages,
        errors,
        skippedCount,
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

