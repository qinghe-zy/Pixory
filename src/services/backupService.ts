import * as FileSystem from 'expo-file-system/legacy';

import { DATABASE_NAME, getDatabase, imageRepository, ipRepository, settingsRepository } from '../database';
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

export interface BackupResult {
  backupDir: string;
  manifestUri: string;
  databaseUri: string;
  originalCount: number;
  thumbnailCount: number;
  createdAt: string;
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

async function createBackupShell(prefix: string) {
  const createdAt = new Date().toISOString();
  const backupRoot = joinStoragePath(getExportsDir(), 'backups');
  await ensureLocalDirectory(backupRoot);
  const backupDir = `${joinStoragePath(backupRoot, `${prefix}_${timestampForPath(createdAt)}`)}/`;
  await ensureLocalDirectory(backupDir);
  await ensureLocalDirectory(`${joinStoragePath(backupDir, 'database')}/`);
  await ensureLocalDirectory(`${joinStoragePath(backupDir, 'originals')}/`);
  await ensureLocalDirectory(`${joinStoragePath(backupDir, 'thumbnails')}/`);

  return { backupDir, createdAt };
}

async function writeDatabaseCopy(backupDir: string): Promise<string> {
  const db = await getDatabase();
  const databaseUri = joinStoragePath(`${joinStoragePath(backupDir, 'database')}/`, DATABASE_NAME);
  await writeBase64File(databaseUri, toBase64(await db.serializeAsync()));
  return databaseUri;
}

export async function createFullBackup(): Promise<BackupResult> {
  const { backupDir, createdAt } = await createBackupShell('full');
  const databaseUri = await writeDatabaseCopy(backupDir);
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
        originalRoot: getOriginalsDir(),
        thumbnailRoot: getThumbnailsDir(),
        originalCount,
        thumbnailCount,
        imageCount: images.length,
        safety: 'Originals are copied as-is. Thumbnails are separate preview files. No compression or re-encoding is performed.',
      },
      null,
      2
    )
  );
  await settingsRepository.setLastBackupAt(createdAt);

  return { backupDir, createdAt, databaseUri, manifestUri, originalCount, thumbnailCount };
}

export async function createIpBackup(ipId: number): Promise<BackupResult> {
  const ip = await ipRepository.findById(ipId);
  if (!ip) {
    throw new Error('没有找到这个 IP。');
  }

  const { backupDir, createdAt } = await createBackupShell(`ip_${ipId}`);
  const databaseUri = await writeDatabaseCopy(backupDir);
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
        ip,
        createdAt,
        database: databaseUri,
        originalCount,
        thumbnailCount,
        imageCount: images.length,
        safety: 'Originals are copied as-is. Thumbnails are separate preview files. No compression or re-encoding is performed.',
      },
      null,
      2
    )
  );

  return { backupDir, createdAt, databaseUri, manifestUri, originalCount, thumbnailCount };
}
