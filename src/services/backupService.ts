import * as FileSystem from 'expo-file-system/legacy';

import { DATABASE_NAME, PERSONAL_DATABASE_NAME, getDatabase, imageRepository, ipRepository, runWithDatabaseSpace, settingsRepository, type PixorySpace } from '../database';
import { formatImageAssetCode } from '../utils/imageAssetCode';
import {
  copyLocalFile,
  ensureLocalDirectory,
  getExportsDir,
  getOriginalsDir,
  getThumbnailsDir,
  joinStoragePath,
  writeBase64File,
  writeTextFile,
} from './fileStorageService';
import { verifyPersonalPassword } from './personalSystemService';

export type BackupScope = 'normal' | 'personal' | 'all';
const NORMAL_BACKUP_SCOPE = { space: 'normal' as const };

export interface BackupResult {
  backupDir: string;
  manifestUri: string;
  databaseUri: string;
  originalCount: number;
  thumbnailCount: number;
  createdAt: string;
  totalBytes: number;
}

export interface BackupSystemExportResult {
  exportedDirUri: string;
  copiedFileCount: number;
}

function toBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let index = 0;

  while (index < bytes.length) {
    const first = bytes[index++] ?? 0;
    const second = index < bytes.length ? bytes[index++] : NaN;
    const third = index < bytes.length ? bytes[index++] : NaN;
    const triple = (first << 16) | ((Number.isNaN(second) ? 0 : second) << 8) | (Number.isNaN(third) ? 0 : third);

    output += alphabet[(triple >> 18) & 63];
    output += alphabet[(triple >> 12) & 63];
    output += Number.isNaN(second) ? '=' : alphabet[(triple >> 6) & 63];
    output += Number.isNaN(third) ? '=' : alphabet[triple & 63];
  }

  return output;
}

function timestampForPath(value: string): string {
  return value.replace(/[-:.TZ]/g, '').slice(0, 14);
}

async function copyFileIfExists(sourceUri: string, destinationUri: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(sourceUri);
  if (!info.exists || info.isDirectory) {
    return false;
  }

  await copyLocalFile(sourceUri, destinationUri);
  return true;
}

function getFileName(fileUri: string): string {
  return fileUri.replace(/\/$/, '').split('/').pop() ?? 'backup-file';
}

function getFileStem(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

function getMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.sqlite')) return 'application/octet-stream';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function buildManifestImageEntries(images: Awaited<ReturnType<typeof imageRepository.findAll>>) {
  return images.map((image) => ({
    id: image.id,
    assetCode: formatImageAssetCode(image),
    ipId: image.ipId,
    originalFilename: image.originalFilename,
    internalFilename: image.internalFilename,
    width: image.width,
    height: image.height,
    mimeType: image.mimeType,
    fileSize: image.fileSize,
    deletedAt: image.deletedAt,
  }));
}

async function calculateDirectorySize(directoryUri: string): Promise<number> {
  const entries = await FileSystem.readDirectoryAsync(directoryUri);
  let totalBytes = 0;

  for (const entry of entries) {
    const entryUri = `${directoryUri}${entry}`;
    const info = await FileSystem.getInfoAsync(entryUri);
    if (!info.exists) {
      continue;
    }

    if (info.isDirectory) {
      totalBytes += await calculateDirectorySize(`${entryUri}/`);
    } else {
      totalBytes += info.size ?? 0;
    }
  }

  return totalBytes;
}

async function copyBackupDirectoryToSaf(sourceDirUri: string, destinationDirUri: string): Promise<number> {
  const entries = await FileSystem.readDirectoryAsync(sourceDirUri);
  let copiedFileCount = 0;

  for (const entry of entries) {
    const sourceUri = `${sourceDirUri}${entry}`;
    const info = await FileSystem.getInfoAsync(sourceUri);
    if (!info.exists) {
      continue;
    }

    if (info.isDirectory) {
      const childDestinationDir = await FileSystem.StorageAccessFramework.makeDirectoryAsync(destinationDirUri, entry);
      copiedFileCount += await copyBackupDirectoryToSaf(`${sourceUri}/`, childDestinationDir);
      continue;
    }

    const destinationFileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      destinationDirUri,
      getFileStem(entry),
      getMimeType(entry)
    );
    const base64Contents = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.StorageAccessFramework.writeAsStringAsync(destinationFileUri, base64Contents, {
      encoding: FileSystem.EncodingType.Base64,
    });
    copiedFileCount += 1;
  }

  return copiedFileCount;
}

async function createBackupShell(prefix: string, space: PixorySpace = 'normal') {
  const createdAt = new Date().toISOString();
  const backupRoot = joinStoragePath(getExportsDir(space), 'backups');
  await ensureLocalDirectory(backupRoot);
  const backupDir = `${joinStoragePath(backupRoot, `${prefix}_${timestampForPath(createdAt)}`)}/`;
  await ensureLocalDirectory(backupDir);
  await ensureLocalDirectory(`${joinStoragePath(backupDir, 'database')}/`);
  await ensureLocalDirectory(`${joinStoragePath(backupDir, 'originals')}/`);
  await ensureLocalDirectory(`${joinStoragePath(backupDir, 'thumbnails')}/`);

  return { backupDir, createdAt };
}

async function writeDatabaseCopy(backupDir: string, space: PixorySpace = 'normal'): Promise<string> {
  const db = await getDatabase(space);
  const databaseName = space === 'personal' ? PERSONAL_DATABASE_NAME : DATABASE_NAME;
  const databaseUri = joinStoragePath(`${joinStoragePath(backupDir, 'database')}/`, databaseName);
  await writeBase64File(databaseUri, toBase64(await db.serializeAsync()));
  return databaseUri;
}

export async function createFullBackup(space: PixorySpace = NORMAL_BACKUP_SCOPE.space): Promise<BackupResult> {
  return runWithDatabaseSpace(space, async () => {
    const { backupDir, createdAt } = await createBackupShell('full', space);
    const databaseUri = await writeDatabaseCopy(backupDir, space);
    const images = await imageRepository.findAll({ includeDeleted: true });
    let originalCount = 0;
    let thumbnailCount = 0;

    for (const image of images) {
      const originalDir = `${joinStoragePath(`${joinStoragePath(backupDir, 'originals')}/`, `ip_${image.ipId}`)}/`;
      const thumbnailDir = `${joinStoragePath(`${joinStoragePath(backupDir, 'thumbnails')}/`, `ip_${image.ipId}`)}/`;
      await ensureLocalDirectory(originalDir);
      await ensureLocalDirectory(thumbnailDir);

      if (await copyFileIfExists(image.originalFileUri, joinStoragePath(originalDir, image.internalFilename))) {
        originalCount += 1;
      }

      if (image.thumbnailFileUri) {
        const thumbnailName = image.thumbnailFileUri.split('/').pop() ?? `${image.internalFilename}_thumb`;
        if (await copyFileIfExists(image.thumbnailFileUri, joinStoragePath(thumbnailDir, thumbnailName))) {
          thumbnailCount += 1;
        }
      }
    }

    const manifestUri = joinStoragePath(backupDir, 'manifest.json');
    await writeTextFile(
      manifestUri,
      JSON.stringify(
        {
          type: 'full',
          createdAt,
          database: databaseUri,
          space,
          originalRoot: getOriginalsDir(space),
          thumbnailRoot: getThumbnailsDir(space),
          originalCount,
          thumbnailCount,
          imageCount: images.length,
          images: buildManifestImageEntries(images),
          safety: 'Originals are copied as-is. Thumbnails are separate preview files. No compression or re-encoding is performed.',
        },
        null,
        2
      )
    );
    await settingsRepository.setLastBackupAt(createdAt);

    return { backupDir, createdAt, databaseUri, manifestUri, originalCount, thumbnailCount, totalBytes: await calculateDirectorySize(backupDir) };
  });
}

export async function createIpBackup(ipId: number, space: PixorySpace = NORMAL_BACKUP_SCOPE.space): Promise<BackupResult> {
  return runWithDatabaseSpace(space, async () => {
    const ip = await ipRepository.findById(ipId);
    if (!ip) {
      throw new Error('没有找到这个 IP。');
    }

    const { backupDir, createdAt } = await createBackupShell(`ip_${ipId}`, space);
    const databaseUri = await writeDatabaseCopy(backupDir, space);
    const images = await imageRepository.findByIpId(ipId, { includeDeleted: true });
    const originalDir = `${joinStoragePath(`${joinStoragePath(backupDir, 'originals')}/`, `ip_${ipId}`)}/`;
    const thumbnailDir = `${joinStoragePath(`${joinStoragePath(backupDir, 'thumbnails')}/`, `ip_${ipId}`)}/`;
    await ensureLocalDirectory(originalDir);
    await ensureLocalDirectory(thumbnailDir);
    let originalCount = 0;
    let thumbnailCount = 0;

    for (const image of images) {
      if (await copyFileIfExists(image.originalFileUri, joinStoragePath(originalDir, image.internalFilename))) {
        originalCount += 1;
      }

      if (image.thumbnailFileUri) {
        const thumbnailName = image.thumbnailFileUri.split('/').pop() ?? `${image.internalFilename}_thumb`;
        if (await copyFileIfExists(image.thumbnailFileUri, joinStoragePath(thumbnailDir, thumbnailName))) {
          thumbnailCount += 1;
        }
      }
    }

    const manifestUri = joinStoragePath(backupDir, 'manifest.json');
    await writeTextFile(
      manifestUri,
      JSON.stringify(
        {
          type: 'ip',
          space,
          ip,
          createdAt,
          database: databaseUri,
          originalCount,
          thumbnailCount,
          imageCount: images.length,
          images: buildManifestImageEntries(images),
          safety: 'Originals are copied as-is. Thumbnails are separate preview files. No compression or re-encoding is performed.',
        },
        null,
        2
      )
    );

    return { backupDir, createdAt, databaseUri, manifestUri, originalCount, thumbnailCount, totalBytes: await calculateDirectorySize(backupDir) };
  });
}

export async function requirePersonalVerification(secret: string): Promise<void> {
  const result = await verifyPersonalPassword(secret);
  if (!result.ok) {
    throw new Error(result.message ?? '隐私系统验证失败。');
  }
}

export async function createPersonalBackup(secret: string): Promise<BackupResult> {
  await requirePersonalVerification(secret);
  return runWithDatabaseSpace('personal', async () => {
    const space: PixorySpace = 'personal';
    const { backupDir, createdAt } = await createBackupShell('personal', space);
    const databaseUri = await writeDatabaseCopy(backupDir, space);
    const images = await imageRepository.findAll({ includeDeleted: true });
    let originalCount = 0;
    let thumbnailCount = 0;

    for (const image of images) {
      const originalDir = `${joinStoragePath(`${joinStoragePath(backupDir, 'originals')}/`, `ip_${image.ipId}`)}/`;
      const thumbnailDir = `${joinStoragePath(`${joinStoragePath(backupDir, 'thumbnails')}/`, `ip_${image.ipId}`)}/`;
      await ensureLocalDirectory(originalDir);
      await ensureLocalDirectory(thumbnailDir);

      if (await copyFileIfExists(image.originalFileUri, joinStoragePath(originalDir, image.internalFilename))) {
        originalCount += 1;
      }

      if (image.thumbnailFileUri) {
        const thumbnailName = image.thumbnailFileUri.split('/').pop() ?? `${image.internalFilename}_thumb`;
        if (await copyFileIfExists(image.thumbnailFileUri, joinStoragePath(thumbnailDir, thumbnailName))) {
          thumbnailCount += 1;
        }
      }
    }

    const manifestUri = joinStoragePath(backupDir, 'manifest.json');
    await writeTextFile(
      manifestUri,
      JSON.stringify(
        {
          type: 'personal',
          space,
          createdAt,
          database: databaseUri,
          originalRoot: getOriginalsDir(space),
          thumbnailRoot: getThumbnailsDir(space),
          originalCount,
          thumbnailCount,
          imageCount: images.length,
          images: buildManifestImageEntries(images),
          safety:
            'Personal backup requires password verification. First version isolates files and database but does not encrypt originals at rest.',
        },
        null,
        2
      )
    );

    return {
      backupDir,
      createdAt,
      databaseUri,
      manifestUri,
      originalCount,
      thumbnailCount,
      totalBytes: await calculateDirectorySize(backupDir),
    };
  });
}

export async function exportBackupToSystemDirectory(backupDir: string): Promise<BackupSystemExportResult> {
  const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) {
    throw new Error('未选择系统导出目录。');
  }

  const backupFolderName = getFileName(backupDir);
  const exportedDirUri = await FileSystem.StorageAccessFramework.makeDirectoryAsync(
    permissions.directoryUri,
    backupFolderName
  );
  const copiedFileCount = await copyBackupDirectoryToSaf(backupDir.endsWith('/') ? backupDir : `${backupDir}/`, exportedDirUri);

  return {
    exportedDirUri,
    copiedFileCount,
  };
}
