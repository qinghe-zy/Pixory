import * as FileSystem from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';
import { EncryptionMethods, unzip, unzipWithPassword, zipWithPassword } from 'react-native-zip-archive';

import {
  DATABASE_NAME,
  PERSONAL_DATABASE_NAME,
  checkpointDatabase,
  getDatabase,
  groupRepository,
  imageRepository,
  importBatchRepository,
  ipRepository,
  runWithDatabaseSpace,
  settingsRepository,
  tagRepository,
  type PixorySpace,
} from '../database';
import { formatImageAssetCode } from '../utils/imageAssetCode';
import { copyFileToSafWithProgress } from '../native/pixoryMediaModule';
import {
  copyLocalFile,
  deleteLocalFile,
  ensureLocalDirectory,
  getExportsDir,
  generateInternalFilename,
  getOriginalsDir,
  getTempDir,
  getThumbnailsDir,
  joinStoragePath,
  writeBase64File,
  writeTextFile,
} from './fileStorageService';
import { verifyPersonalPassword } from './personalSystemService';
import { assertPersonalTaskActive, type PersonalTaskToken } from './personalTaskToken';

export type BackupScope = 'normal' | 'personal' | 'all';
export type IpNameConflictStrategy = 'ask' | 'mergeExisting' | 'createRenamed' | 'cancelImport';
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
  destinationDirUri: string;
  copiedFileCount: number;
}

export interface EncryptedPackResult {
  packUri: string;
  stagingDir: string;
  createdAt: string;
}

export interface ImportEncryptedPersonalPackParams {
  packageUri: string;
  secret: string;
  mode: 'merge';
  ipNameConflictStrategy?: IpNameConflictStrategy;
  taskToken?: PersonalTaskToken | null;
}

export interface ImportEncryptedPersonalPackResult {
  importedIpCount: number;
  importedImageCount: number;
}

export interface ImportPlainBackupPackageParams {
  space?: PixorySpace;
  packageUri?: string;
  extractedDirectoryUri?: string;
  mode: 'merge';
  ipNameConflictStrategy?: IpNameConflictStrategy;
}

export interface ImportPlainBackupPackageResult {
  importedIpCount: number;
  importedImageCount: number;
}

type ExportData = {
  ips: Awaited<ReturnType<typeof ipRepository.findAllIncludingDeleted>>;
  groups: Awaited<ReturnType<typeof groupRepository.findAll>>;
  tags: Awaited<ReturnType<typeof tagRepository.findAll>>;
  images: Array<Awaited<ReturnType<typeof imageRepository.findAll>>[number] & { groupIds: number[]; tagNames: string[] }>;
  importBatches: Awaited<ReturnType<typeof importBatchRepository.findByIpId>>;
  importBatchItemsByBatchId: Record<string, Awaited<ReturnType<typeof importBatchRepository.findItemsByBatchId>>>;
};

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

async function copyDirectoryIfExists(sourceDirUri: string, destinationDirUri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(sourceDirUri);
  if (!info.exists || !info.isDirectory) {
    return 0;
  }

  await ensureLocalDirectory(destinationDirUri);
  const normalizedSourceDir = sourceDirUri.endsWith('/') ? sourceDirUri : `${sourceDirUri}/`;
  const normalizedDestinationDir = destinationDirUri.endsWith('/') ? destinationDirUri : `${destinationDirUri}/`;
  const entries = await FileSystem.readDirectoryAsync(normalizedSourceDir);
  let copiedFileCount = 0;

  for (const entry of entries) {
    const sourceUri = `${normalizedSourceDir}${entry}`;
    const destinationUri = joinStoragePath(normalizedDestinationDir, entry);
    const entryInfo = await FileSystem.getInfoAsync(sourceUri);
    if (!entryInfo.exists) {
      continue;
    }

    if (entryInfo.isDirectory) {
      copiedFileCount += await copyDirectoryIfExists(`${sourceUri}/`, `${destinationUri}/`);
      continue;
    }

    await copyLocalFile(sourceUri, destinationUri);
    copiedFileCount += 1;
  }

  return copiedFileCount;
}

function getFileName(fileUri: string): string {
  return fileUri.replace(/\/$/, '').split('/').pop() ?? 'backup-file';
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
    mediaType: image.mediaType,
    assetCode: formatImageAssetCode(image),
    ipId: image.ipId,
    originalFilename: image.originalFilename,
    internalFilename: image.internalFilename,
    width: image.width,
    height: image.height,
    mimeType: image.mimeType,
    fileSize: image.fileSize,
    durationMs: image.durationMs,
    coverThumbnailFileUri: image.coverThumbnailFileUri,
    deletedAt: image.deletedAt,
  }));
}

async function buildExportData(db: SQLiteDatabase, ipId?: number): Promise<ExportData> {
  const [ips, groups, tags, images] = await Promise.all([
    ipRepository.findAllIncludingDeleted(db),
    groupRepository.findAll(db),
    tagRepository.findAll(db),
    imageRepository.findAll(db, { includeDeleted: true, mediaType: 'all' }),
  ]);
  const filteredIps = ipId != null ? ips.filter((ip) => ip.id === ipId) : ips;
  const filteredIpIds = new Set(filteredIps.map((ip) => ip.id));
  const filteredGroups = groups.filter((group) => filteredIpIds.has(group.ipId));
  const filteredImages = images.filter((image) => filteredIpIds.has(image.ipId));
  const imagesWithRelations = await Promise.all(
    filteredImages.map(async (image) => ({
      ...image,
      groupIds: await imageRepository.findGroupIdsByImageId(db, image.id),
      tagNames: (await tagRepository.findByImageId(db, image.id)).map((tag) => tag.name),
    }))
  );
  const importBatches = (await Promise.all(filteredIps.map((ip) => importBatchRepository.findByIpId(db, ip.id, 1000)))).flat();
  const importBatchItemsByBatchId: ExportData['importBatchItemsByBatchId'] = {};
  for (const batch of importBatches) {
    importBatchItemsByBatchId[String(batch.id)] = await importBatchRepository.findItemsByBatchId(db, batch.id);
  }

  return { ips: filteredIps, groups: filteredGroups, tags, images: imagesWithRelations, importBatches, importBatchItemsByBatchId };
}

async function buildMemoryBackupManifest(db: SQLiteDatabase, space: PixorySpace): Promise<Record<string, unknown>> {
  const tableNames = [
    'memory_events',
    'memory_claims',
    'memory_evidence',
    'memory_current_turn_observations',
    'memory_lineage_meta',
    'memory_import_id_map',
    'memory_deletion_certificates',
    'memory_episodes',
    'memory_relational_states',
    'memory_profiles',
  ];
  const memory: Record<string, unknown> = {};
  for (const table of tableNames) {
    const where = table === 'memory_lineage_meta'
      ? 'WHERE threadId IN (SELECT id FROM ai_threads WHERE space = ?)'
      : table === 'memory_import_id_map'
        ? ''
        : 'WHERE space = ?';
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${table} ${where}`,
      ...(where ? [space] : [])
    );
    memory[table] = rows;
  }
  return memory;
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

    await copyFileToSafWithProgress(sourceUri, destinationDirUri, entry, getMimeType(entry), `backup-export-${Date.now()}`);
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

export async function createFullBackup(space: PixorySpace = NORMAL_BACKUP_SCOPE.space, taskToken?: PersonalTaskToken | null): Promise<BackupResult> {
  assertPersonalTaskActive(taskToken);
  return runWithDatabaseSpace(space, async (db) => {
    await checkpointDatabase(space);
    const { backupDir, createdAt } = await createBackupShell('full', space);
    const databaseUri = await writeDatabaseCopy(backupDir, space);
    const images = await imageRepository.findAll(db, { includeDeleted: true, mediaType: 'all' });
    let originalCount = 0;
    let thumbnailCount = 0;

    for (const image of images) {
      assertPersonalTaskActive(taskToken);
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
      if (image.coverThumbnailFileUri && image.coverThumbnailFileUri !== image.thumbnailFileUri) {
        const coverName = image.coverThumbnailFileUri.split('/').pop() ?? `${image.internalFilename}_cover`;
        if (await copyFileIfExists(image.coverThumbnailFileUri, joinStoragePath(thumbnailDir, coverName))) {
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
          assetCount: images.length,
          imageCount: images.filter((image) => image.mediaType === 'image').length,
          videoCount: images.filter((image) => image.mediaType === 'video').length,
          images: buildManifestImageEntries(images),
          exportData: await buildExportData(db),
          memory: await buildMemoryBackupManifest(db, space),
          safety: 'Originals are copied as-is. Thumbnails are separate preview files. No compression or re-encoding is performed.',
        },
        null,
        2
      )
    );
    await settingsRepository.setLastBackupAt(db, createdAt);

    return { backupDir, createdAt, databaseUri, manifestUri, originalCount, thumbnailCount, totalBytes: await calculateDirectorySize(backupDir) };
  });
}

export async function createIpBackup(ipId: number, space: PixorySpace = NORMAL_BACKUP_SCOPE.space, taskToken?: PersonalTaskToken | null): Promise<BackupResult> {
  assertPersonalTaskActive(taskToken);
  return runWithDatabaseSpace(space, async (db) => {
    await checkpointDatabase(space);
    const ip = await ipRepository.findById(db, ipId);
    if (!ip) {
      throw new Error('没有找到这个 IP。');
    }

    const { backupDir, createdAt } = await createBackupShell(`ip_${ipId}`, space);
    const databaseUri = await writeDatabaseCopy(backupDir, space);
    const images = await imageRepository.findByIpId(db, ipId, { includeDeleted: true, mediaType: 'all' });
    const originalDir = `${joinStoragePath(`${joinStoragePath(backupDir, 'originals')}/`, `ip_${ipId}`)}/`;
    const thumbnailDir = `${joinStoragePath(`${joinStoragePath(backupDir, 'thumbnails')}/`, `ip_${ipId}`)}/`;
    await ensureLocalDirectory(originalDir);
    await ensureLocalDirectory(thumbnailDir);
    let originalCount = 0;
    let thumbnailCount = 0;

    for (const image of images) {
      assertPersonalTaskActive(taskToken);
      if (await copyFileIfExists(image.originalFileUri, joinStoragePath(originalDir, image.internalFilename))) {
        originalCount += 1;
      }

      if (image.thumbnailFileUri) {
        const thumbnailName = image.thumbnailFileUri.split('/').pop() ?? `${image.internalFilename}_thumb`;
        if (await copyFileIfExists(image.thumbnailFileUri, joinStoragePath(thumbnailDir, thumbnailName))) {
          thumbnailCount += 1;
        }
      }
      if (image.coverThumbnailFileUri && image.coverThumbnailFileUri !== image.thumbnailFileUri) {
        const coverName = image.coverThumbnailFileUri.split('/').pop() ?? `${image.internalFilename}_cover`;
        if (await copyFileIfExists(image.coverThumbnailFileUri, joinStoragePath(thumbnailDir, coverName))) {
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
          assetCount: images.length,
          imageCount: images.filter((image) => image.mediaType === 'image').length,
          videoCount: images.filter((image) => image.mediaType === 'video').length,
          images: buildManifestImageEntries(images),
          exportData: await buildExportData(db, ipId),
          memory: await buildMemoryBackupManifest(db, space),
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
  return createPersonalPlainBackup(secret);
}

export async function createPersonalIpPlainBackup(secret: string, ipId: number, taskToken?: PersonalTaskToken | null): Promise<BackupResult> {
  await requirePersonalVerification(secret);
  assertPersonalTaskActive(taskToken);
  return createIpBackup(ipId, 'personal', taskToken);
}

export async function createPersonalPlainBackup(secret: string, taskToken?: PersonalTaskToken | null): Promise<BackupResult> {
  await requirePersonalVerification(secret);
  assertPersonalTaskActive(taskToken);
  return runWithDatabaseSpace('personal', async (db) => {
    const space: PixorySpace = 'personal';
    await checkpointDatabase('personal');
    const { backupDir, createdAt } = await createBackupShell('personal', space);
    const databaseUri = await writeDatabaseCopy(backupDir, space);
    const images = await imageRepository.findAll(db, { includeDeleted: true, mediaType: 'all' });
    let originalCount = 0;
    let thumbnailCount = 0;

    for (const image of images) {
      assertPersonalTaskActive(taskToken);
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
      if (image.coverThumbnailFileUri && image.coverThumbnailFileUri !== image.thumbnailFileUri) {
        const coverName = image.coverThumbnailFileUri.split('/').pop() ?? `${image.internalFilename}_cover`;
        if (await copyFileIfExists(image.coverThumbnailFileUri, joinStoragePath(thumbnailDir, coverName))) {
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
          assetCount: images.length,
          imageCount: images.filter((image) => image.mediaType === 'image').length,
          videoCount: images.filter((image) => image.mediaType === 'video').length,
          images: buildManifestImageEntries(images),
          exportData: await buildExportData(db),
          memory: await buildMemoryBackupManifest(db, space),
          plainExportWarning:
            'This is a plain personal export. If copied to a public directory, private names, metadata, originals, and thumbnails are visible.',
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

async function createEncryptedPackFromBackup(backup: BackupResult, prefix: string, secret: string): Promise<EncryptedPackResult> {
  const createdAt = new Date().toISOString();
  const packUri = joinStoragePath(getExportsDir('personal'), `${prefix}_${timestampForPath(createdAt)}.pixorypack`);
  await zipWithPassword(backup.backupDir, packUri, secret, EncryptionMethods.AES_256);
  return {
    packUri,
    stagingDir: backup.backupDir,
    createdAt,
  };
}

export async function createEncryptedPersonalPack(secret: string, taskToken?: PersonalTaskToken | null): Promise<EncryptedPackResult> {
  await requirePersonalVerification(secret);
  assertPersonalTaskActive(taskToken);
  await checkpointDatabase('personal');
  const backup = await createPersonalPlainBackup(secret, taskToken);
  return createEncryptedPackFromBackup(backup, 'personal_encrypted', secret);
}

export async function createEncryptedAllPack(secret: string, taskToken?: PersonalTaskToken | null): Promise<EncryptedPackResult> {
  await requirePersonalVerification(secret);
  assertPersonalTaskActive(taskToken);
  const normalBackup = await createFullBackup('normal');
  const personalBackup = await createPersonalPlainBackup(secret, taskToken);
  const createdAt = new Date().toISOString();
  const stagingDir = `${joinStoragePath(getTempDir('personal'), `all_pack_${timestampForPath(createdAt)}`)}/`;
  await ensureLocalDirectory(stagingDir);
  await copyDirectoryIfExists(normalBackup.backupDir, `${joinStoragePath(stagingDir, 'normal')}/`);
  await copyDirectoryIfExists(personalBackup.backupDir, `${joinStoragePath(stagingDir, 'personal')}/`);
  await writeTextFile(
    joinStoragePath(stagingDir, 'manifest.json'),
    JSON.stringify({ type: 'all-encrypted', createdAt, spaces: ['normal', 'personal'] }, null, 2)
  );
  const packUri = joinStoragePath(getExportsDir('personal'), `all_encrypted_${timestampForPath(createdAt)}.pixorypack`);
  await zipWithPassword(stagingDir, packUri, secret, EncryptionMethods.AES_256);
  return { packUri, stagingDir, createdAt };
}

async function findManifestUri(directoryUri: string): Promise<string> {
  const directManifestUri = joinStoragePath(directoryUri, 'manifest.json');
  const directInfo = await FileSystem.getInfoAsync(directManifestUri);
  if (directInfo.exists && !directInfo.isDirectory) {
    return directManifestUri;
  }

  const entries = await FileSystem.readDirectoryAsync(directoryUri);
  for (const entry of entries) {
    const entryUri = joinStoragePath(directoryUri, entry);
    const info = await FileSystem.getInfoAsync(entryUri);
    if (!info.exists || !info.isDirectory) {
      continue;
    }
    const nestedManifestUri = joinStoragePath(`${entryUri}/`, 'manifest.json');
    const nestedInfo = await FileSystem.getInfoAsync(nestedManifestUri);
    if (nestedInfo.exists && !nestedInfo.isDirectory) {
      return nestedManifestUri;
    }
  }

  throw new Error('加密包缺少 manifest.json。');
}

function resolveBackupRelativeFile(rootManifestUri: string, role: 'originals' | 'thumbnails', ipId: number, fileName: string): string {
  const backupDir = rootManifestUri.slice(0, rootManifestUri.lastIndexOf('/') + 1);
  return joinStoragePath(`${joinStoragePath(`${joinStoragePath(backupDir, role)}/`, `ip_${ipId}`)}/`, fileName);
}

async function createRenamedIp(db: SQLiteDatabase, name: string, input: { description?: string | null; isFavorite?: boolean }): Promise<Awaited<ReturnType<typeof ipRepository.create>>> {
  let suffix = 2;
  let nextName = `${name} ${suffix}`;
  while (await ipRepository.findByName(db, nextName)) {
    suffix += 1;
    nextName = `${name} ${suffix}`;
  }
  return ipRepository.create(db, { ...input, name: nextName });
}

async function resolveImportedIp(
  db: SQLiteDatabase,
  sourceIp: ExportData['ips'][number],
  strategy: IpNameConflictStrategy
): Promise<{ ipId: number; created: boolean }> {
  const existingIp = await ipRepository.findByName(db, sourceIp.name);
  if (!existingIp) {
    const createdIp = await ipRepository.create(db, {
      name: sourceIp.name,
      description: sourceIp.description,
      isFavorite: sourceIp.isFavorite,
    });
    return { ipId: createdIp.id, created: true };
  }

  if (strategy === 'mergeExisting') {
    return { ipId: existingIp.id, created: false };
  }

  if (strategy === 'ask' || strategy === 'cancelImport') {
    throw new Error(`同名 IP「${sourceIp.name}」已存在，请选择合并到已有 IP 或创建新 IP 后再导入。`);
  }

  const renamedIp = await createRenamedIp(db, sourceIp.name, {
    description: sourceIp.description,
    isFavorite: sourceIp.isFavorite,
  });
  return { ipId: renamedIp.id, created: true };
}

async function copyPlainBackupAssetFiles(params: {
  manifestUri: string;
  sourceImage: ExportData['images'][number];
  destinationSpace: PixorySpace;
  destinationIpId: number;
  internalFilename: string;
}): Promise<{
  originalDestinationUri: string;
  thumbnailDestinationUri: string | null;
  coverDestinationUri: string | null;
}> {
  const originalSourceUri = resolveBackupRelativeFile(
    params.manifestUri,
    'originals',
    params.sourceImage.ipId,
    params.sourceImage.internalFilename
  );
  const thumbnailName = params.sourceImage.thumbnailFileUri?.split('/').pop() ?? null;
  const thumbnailSourceUri = thumbnailName
    ? resolveBackupRelativeFile(params.manifestUri, 'thumbnails', params.sourceImage.ipId, thumbnailName)
    : null;
  const coverName = params.sourceImage.coverThumbnailFileUri?.split('/').pop() ?? null;
  const coverSourceUri = coverName
    ? resolveBackupRelativeFile(params.manifestUri, 'thumbnails', params.sourceImage.ipId, coverName)
    : null;
  const originalDestinationDir = `${joinStoragePath(getOriginalsDir(params.destinationSpace), `ip_${params.destinationIpId}`)}/`;
  const thumbnailDestinationDir = `${joinStoragePath(getThumbnailsDir(params.destinationSpace), `ip_${params.destinationIpId}`)}/`;
  await ensureLocalDirectory(originalDestinationDir);
  await ensureLocalDirectory(thumbnailDestinationDir);

  const originalDestinationUri = joinStoragePath(originalDestinationDir, params.internalFilename);
  await copyLocalFile(originalSourceUri, originalDestinationUri);

  const thumbnailDestinationUri =
    thumbnailSourceUri && thumbnailName ? joinStoragePath(thumbnailDestinationDir, thumbnailName) : null;
  if (thumbnailSourceUri && thumbnailDestinationUri) {
    await copyLocalFile(thumbnailSourceUri, thumbnailDestinationUri);
  }

  const coverDestinationUri =
    coverSourceUri && coverName ? joinStoragePath(thumbnailDestinationDir, coverName) : null;
  if (coverSourceUri && coverDestinationUri && coverDestinationUri !== thumbnailDestinationUri) {
    await copyLocalFile(coverSourceUri, coverDestinationUri);
  }

  return {
    originalDestinationUri,
    thumbnailDestinationUri,
    coverDestinationUri: coverDestinationUri ?? thumbnailDestinationUri,
  };
}

export async function importPlainBackupPackage({
  extractedDirectoryUri,
  ipNameConflictStrategy = 'createRenamed',
  mode,
  packageUri,
  space = 'normal',
}: ImportPlainBackupPackageParams): Promise<ImportPlainBackupPackageResult> {
  if (mode !== 'merge') {
    throw new Error('Plain backup import only supports merge mode.');
  }

  const createdAt = new Date().toISOString();
  const tempDir =
    extractedDirectoryUri ??
    `${joinStoragePath(getTempDir(space), `plain_backup_import_${timestampForPath(createdAt)}`)}/`;
  const shouldCleanupTempDir = !extractedDirectoryUri;
  const stagedDestinationUris: string[] = [];
  let importedIpCount = 0;
  let importedImageCount = 0;

  try {
    if (!extractedDirectoryUri) {
      if (!packageUri) {
        throw new Error('缺少要导入的备份包。');
      }
      await ensureLocalDirectory(tempDir);
      await unzip(packageUri, tempDir);
    }

    const manifestUri = await findManifestUri(tempDir);
    const manifest = JSON.parse(await FileSystem.readAsStringAsync(manifestUri, { encoding: FileSystem.EncodingType.UTF8 })) as {
      type?: string;
      space?: PixorySpace;
      exportData?: ExportData;
    };

    if (!manifest.exportData || !['full', 'ip', 'personal'].includes(manifest.type ?? '')) {
      throw new Error('这不是标准 Pixory 备份包。');
    }

    if (manifest.space === 'personal' && space !== 'personal') {
      throw new Error('隐私备份不能导入普通空间。');
    }

    await runWithDatabaseSpace(space, async (db) => db.withTransactionAsync(async () => {
      const exportData = manifest.exportData;
      const ipIdMap = new Map<number, number>();
      const groupIdMap = new Map<number, number>();
      const importBatchIdMap = new Map<number, number>();
      const imageIdMap = new Map<number, number>();

      for (const ip of exportData?.ips ?? []) {
        const resolvedIp = await resolveImportedIp(db, ip, ipNameConflictStrategy);
        ipIdMap.set(ip.id, resolvedIp.ipId);
        if (resolvedIp.created) {
          importedIpCount += 1;
        }
      }

      for (const group of exportData?.groups ?? []) {
        const nextIpId = ipIdMap.get(group.ipId);
        if (!nextIpId) continue;
        const existingGroup = await groupRepository.findByIpIdAndName(db, nextIpId, group.name);
        const resolvedGroup = existingGroup ?? (await groupRepository.create(db, {
          ipId: nextIpId,
          name: group.name,
          type: group.type,
          sortOrder: group.sortOrder,
          isPinned: group.isPinned,
          description: group.description,
        }));
        groupIdMap.set(group.id, resolvedGroup.id);
      }

      for (const batch of exportData?.importBatches ?? []) {
        const nextIpId = ipIdMap.get(batch.ipId);
        if (!nextIpId) continue;
        const createdBatch = await importBatchRepository.create(db, {
          ipId: nextIpId,
          name: batch.name,
          templateKey: batch.templateKey,
          totalCount: batch.totalCount,
        });
        importBatchIdMap.set(batch.id, createdBatch.id);
      }

      for (const image of exportData?.images ?? []) {
        const nextIpId = ipIdMap.get(image.ipId);
        if (!nextIpId) continue;
        const groupIds = image.groupIds
          .map((groupId) => groupIdMap.get(groupId))
          .filter((groupId): groupId is number => groupId != null);
        const nextInternalFilename = generateInternalFilename(image.originalFilename);
        const copied = await copyPlainBackupAssetFiles({
          destinationIpId: nextIpId,
          destinationSpace: space,
          internalFilename: nextInternalFilename,
          manifestUri,
          sourceImage: image,
        });
        stagedDestinationUris.push(
          copied.originalDestinationUri,
          ...(copied.thumbnailDestinationUri ? [copied.thumbnailDestinationUri] : []),
          ...(copied.coverDestinationUri ? [copied.coverDestinationUri] : [])
        );

        const createdImage = await imageRepository.create(db, {
          mediaType: image.mediaType ?? 'image',
          ipId: nextIpId,
          importBatchId: image.importBatchId != null ? importBatchIdMap.get(image.importBatchId) ?? null : null,
          groupId: groupIds[0] ?? null,
          groupIds,
          originalFileUri: copied.originalDestinationUri,
          thumbnailFileUri: copied.thumbnailDestinationUri,
          coverThumbnailFileUri: copied.coverDestinationUri,
          originalFilename: image.originalFilename,
          internalFilename: nextInternalFilename,
          width: image.width,
          height: image.height,
          durationMs: image.durationMs ?? null,
          mimeType: image.mimeType,
          fileSize: image.fileSize,
          isFavorite: image.isFavorite,
          note: image.note,
          previewStatus: image.previewStatus ?? 'ready',
          contentHash: image.contentHash,
          visualHash: image.visualHash,
        });
        imageIdMap.set(image.id, createdImage.id);
        const tagIds = [];
        for (const tagName of image.tagNames) {
          const existingTag = await tagRepository.findByName(db, tagName);
          const tag = existingTag ?? (await tagRepository.create(db, { name: tagName }));
          tagIds.push(tag.id);
        }
        await tagRepository.replaceImageTags(db, createdImage.id, tagIds);
        importedImageCount += 1;
      }

      for (const ip of exportData?.ips ?? []) {
        const nextIpId = ipIdMap.get(ip.id);
        if (!nextIpId) continue;
        await ipRepository.update(db, nextIpId, {
          coverImageAssetId: ip.coverImageAssetId != null ? imageIdMap.get(ip.coverImageAssetId) ?? null : null,
          coverBlurEnabled: ip.coverBlurEnabled,
          coverBlurRadius: ip.coverBlurRadius,
        });
      }

      for (const group of exportData?.groups ?? []) {
        const nextGroupId = groupIdMap.get(group.id);
        if (!nextGroupId) continue;
        await groupRepository.update(db, nextGroupId, {
          coverImageAssetId: group.coverImageAssetId != null ? imageIdMap.get(group.coverImageAssetId) ?? null : null,
        });
      }

      for (const batch of exportData?.importBatches ?? []) {
        const nextBatchId = importBatchIdMap.get(batch.id);
        if (!nextBatchId) continue;
        for (const item of exportData?.importBatchItemsByBatchId[String(batch.id)] ?? []) {
          await importBatchRepository.createItem(db, {
            importBatchId: nextBatchId,
            sourcePath: item.sourcePath,
            originalFilename: item.originalFilename,
            status: item.status,
            imageAssetId: item.imageAssetId != null ? imageIdMap.get(item.imageAssetId) ?? null : null,
            reason: item.reason,
          });
        }
        await importBatchRepository.complete(db, nextBatchId, batch.successCount, batch.failedCount);
      }
    }));

    return { importedIpCount, importedImageCount };
  } catch (error) {
    await Promise.allSettled([...new Set(stagedDestinationUris)].map((uri) => deleteLocalFile(uri)));
    throw error;
  } finally {
    if (shouldCleanupTempDir) {
      await deleteLocalFile(tempDir);
    }
  }
}

export async function importEncryptedPersonalPack({
  ipNameConflictStrategy = 'createRenamed',
  packageUri,
  secret,
  mode,
  taskToken,
}: ImportEncryptedPersonalPackParams): Promise<ImportEncryptedPersonalPackResult> {
  if (mode !== 'merge') {
    throw new Error('Personal encrypted import only supports merge mode.');
  }
  await requirePersonalVerification(secret);
  assertPersonalTaskActive(taskToken);

  const createdAt = new Date().toISOString();
  const tempDir = `${joinStoragePath(getTempDir('personal'), `encrypted_import_${timestampForPath(createdAt)}`)}/`;
  const copiedPackUri = joinStoragePath(tempDir, 'source.pixorypack');
  let importedIpCount = 0;
  let importedImageCount = 0;
  const stagedDestinationUris: string[] = [];

  try {
    await ensureLocalDirectory(tempDir);
    await copyLocalFile(packageUri, copiedPackUri);
    assertPersonalTaskActive(taskToken);
    await unzipWithPassword(copiedPackUri, tempDir, secret);
    const manifestUri = await findManifestUri(tempDir);
    const manifest = JSON.parse(await FileSystem.readAsStringAsync(manifestUri, { encoding: FileSystem.EncodingType.UTF8 })) as {
      type?: string;
      space?: PixorySpace;
      exportData?: ExportData;
    };

    if (!manifest.exportData || (manifest.space !== 'personal' && manifest.type !== 'personal')) {
      throw new Error('只能在 Personal System 内合并导入 personal 加密包。');
    }

    await runWithDatabaseSpace('personal', async (db) => db.withTransactionAsync(async () => {
      assertPersonalTaskActive(taskToken);
      const exportData = manifest.exportData;
      const ipIdMap = new Map<number, number>();
      const groupIdMap = new Map<number, number>();
      const importBatchIdMap = new Map<number, number>();
      const imageIdMap = new Map<number, number>();

      for (const ip of exportData?.ips ?? []) {
        assertPersonalTaskActive(taskToken);
        const resolvedIp = await resolveImportedIp(db, ip, ipNameConflictStrategy);
        ipIdMap.set(ip.id, resolvedIp.ipId);
        if (resolvedIp.created) {
          importedIpCount += 1;
        }
      }

      for (const group of exportData?.groups ?? []) {
        const nextIpId = ipIdMap.get(group.ipId);
        if (!nextIpId) {
          continue;
        }
        const existingGroup = await groupRepository.findByIpIdAndName(db, nextIpId, group.name);
        const resolvedGroup = existingGroup ?? (await groupRepository.create(db, {
          ipId: nextIpId,
          name: group.name,
          type: group.type,
          sortOrder: group.sortOrder,
          isPinned: group.isPinned,
          description: group.description,
        }));
        groupIdMap.set(group.id, resolvedGroup.id);
      }

      for (const batch of exportData?.importBatches ?? []) {
        const nextIpId = ipIdMap.get(batch.ipId);
        if (!nextIpId) {
          continue;
        }
        const createdBatch = await importBatchRepository.create(db, {
          ipId: nextIpId,
          name: batch.name,
          templateKey: batch.templateKey,
          totalCount: batch.totalCount,
        });
        importBatchIdMap.set(batch.id, createdBatch.id);
      }

      for (const image of exportData?.images ?? []) {
        assertPersonalTaskActive(taskToken);
        const nextIpId = ipIdMap.get(image.ipId);
        if (!nextIpId) {
          continue;
        }
        const nextImportBatchId =
          image.importBatchId != null ? importBatchIdMap.get(image.importBatchId) ?? null : null;
        const groupIds = image.groupIds
          .map((groupId) => groupIdMap.get(groupId))
          .filter((groupId): groupId is number => groupId != null);
        const nextInternalFilename = generateInternalFilename(image.originalFilename);
        const originalSourceUri = resolveBackupRelativeFile(manifestUri, 'originals', image.ipId, image.internalFilename);
        const thumbnailName = image.thumbnailFileUri?.split('/').pop() ?? null;
        const thumbnailSourceUri = thumbnailName ? resolveBackupRelativeFile(manifestUri, 'thumbnails', image.ipId, thumbnailName) : null;
        const originalDestinationDir = `${joinStoragePath(getOriginalsDir('personal'), `ip_${nextIpId}`)}/`;
        const thumbnailDestinationDir = `${joinStoragePath(getThumbnailsDir('personal'), `ip_${nextIpId}`)}/`;
        await ensureLocalDirectory(originalDestinationDir);
        await ensureLocalDirectory(thumbnailDestinationDir);
        const originalDestinationUri = joinStoragePath(originalDestinationDir, nextInternalFilename);
        await copyLocalFile(originalSourceUri, originalDestinationUri);
        stagedDestinationUris.push(originalDestinationUri);
        const thumbnailDestinationUri = thumbnailSourceUri && thumbnailName ? joinStoragePath(thumbnailDestinationDir, thumbnailName) : null;
        if (thumbnailSourceUri && thumbnailDestinationUri) {
          await copyLocalFile(thumbnailSourceUri, thumbnailDestinationUri);
          stagedDestinationUris.push(thumbnailDestinationUri);
        }
        const coverName = image.coverThumbnailFileUri?.split('/').pop() ?? null;
        const coverSourceUri = coverName ? resolveBackupRelativeFile(manifestUri, 'thumbnails', image.ipId, coverName) : null;
        const coverDestinationUri = coverSourceUri && coverName ? joinStoragePath(thumbnailDestinationDir, coverName) : null;
        if (coverSourceUri && coverDestinationUri && coverDestinationUri !== thumbnailDestinationUri) {
          await copyLocalFile(coverSourceUri, coverDestinationUri);
          stagedDestinationUris.push(coverDestinationUri);
        }

        const createdImage = await imageRepository.create(db, {
          mediaType: image.mediaType ?? 'image',
          ipId: nextIpId,
          importBatchId: nextImportBatchId,
          groupId: groupIds[0] ?? null,
          groupIds,
          originalFileUri: originalDestinationUri,
          thumbnailFileUri: thumbnailDestinationUri,
          coverThumbnailFileUri: coverDestinationUri ?? thumbnailDestinationUri,
          originalFilename: image.originalFilename,
          internalFilename: nextInternalFilename,
          width: image.width,
          height: image.height,
          durationMs: image.durationMs ?? null,
          mimeType: image.mimeType,
          fileSize: image.fileSize,
          isFavorite: image.isFavorite,
          note: image.note,
          previewStatus: image.previewStatus ?? 'ready',
          contentHash: image.contentHash,
          visualHash: image.visualHash,
        });
        imageIdMap.set(image.id, createdImage.id);
        const tagIds = [];
        for (const tagName of image.tagNames) {
          const existingTag = await tagRepository.findByName(db, tagName);
          const tag = existingTag ?? (await tagRepository.create(db, { name: tagName }));
          tagIds.push(tag.id);
        }
        await tagRepository.replaceImageTags(db, createdImage.id, tagIds);
        importedImageCount += 1;
      }

      for (const ip of exportData?.ips ?? []) {
        const nextIpId = ipIdMap.get(ip.id);
        if (!nextIpId) {
          continue;
        }
        await ipRepository.update(db, nextIpId, {
          coverImageAssetId: ip.coverImageAssetId != null ? imageIdMap.get(ip.coverImageAssetId) ?? null : null,
          coverBlurEnabled: ip.coverBlurEnabled,
          coverBlurRadius: ip.coverBlurRadius,
        });
      }

      for (const group of exportData?.groups ?? []) {
        const nextGroupId = groupIdMap.get(group.id);
        if (!nextGroupId) {
          continue;
        }
        await groupRepository.update(db, nextGroupId, {
          coverImageAssetId: group.coverImageAssetId != null ? imageIdMap.get(group.coverImageAssetId) ?? null : null,
        });
      }

      for (const batch of exportData?.importBatches ?? []) {
        const nextBatchId = importBatchIdMap.get(batch.id);
        if (!nextBatchId) {
          continue;
        }
        for (const item of exportData?.importBatchItemsByBatchId[String(batch.id)] ?? []) {
          await importBatchRepository.createItem(db, {
            importBatchId: nextBatchId,
            sourcePath: item.sourcePath,
            originalFilename: item.originalFilename,
            status: item.status,
            imageAssetId: item.imageAssetId != null ? imageIdMap.get(item.imageAssetId) ?? null : null,
            reason: item.reason,
          });
        }
        await importBatchRepository.complete(db, nextBatchId, batch.successCount, batch.failedCount);
      }
    }));

    return { importedIpCount, importedImageCount };
  } catch (error) {
    await Promise.allSettled(stagedDestinationUris.map((uri) => deleteLocalFile(uri)));
    throw error;
  } finally {
    await deleteLocalFile(tempDir);
  }
}

export async function requestBackupExportDirectory(initialDirectoryUri?: string | null): Promise<string> {
  const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialDirectoryUri ?? null);
  if (!permissions.granted) {
    throw new Error('未选择系统导出目录。');
  }

  return permissions.directoryUri;
}

export async function exportBackupToSystemDirectory(
  backupDir: string,
  destinationDirUri?: string | null
): Promise<BackupSystemExportResult> {
  const parentDirUri = destinationDirUri ?? (await requestBackupExportDirectory());
  const backupFolderName = getFileName(backupDir);
  const exportedDirUri = await FileSystem.StorageAccessFramework.makeDirectoryAsync(
    parentDirUri,
    backupFolderName
  );
  const copiedFileCount = await copyBackupDirectoryToSaf(backupDir.endsWith('/') ? backupDir : `${backupDir}/`, exportedDirUri);

  return {
    exportedDirUri,
    destinationDirUri: parentDirUri,
    copiedFileCount,
  };
}
