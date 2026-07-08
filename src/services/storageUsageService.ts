import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

import { imageRepository, runWithDatabaseSpace, type ImageListItem, type PixorySpace } from '../database';
import { getExportsDir, getOriginalsDir, getTempDir, getThumbnailsDir, joinStoragePath } from './fileStorageService';
import { getLocalEntrySize } from './cacheCleanupService';

export type StorageUsageCategoryKey =
  | 'original-assets'
  | 'preview-cache'
  | 'temporary-cache'
  | 'backup-export'
  | 'chat-history'
  | 'trash';

export interface StorageUsageSummaryItem {
  key: StorageUsageCategoryKey;
  label: string;
  bytes: number;
  actionLabel: '查看' | '重建' | '清理' | '管理';
  subtitle: string;
  failed?: boolean;
}

export interface StorageUsageSummary {
  totalBytes: number;
  originalBytes: number;
  previewBytes: number;
  previewImageBytes: number;
  previewVideoBytes: number;
  temporaryBytes: number;
  backupExportBytes: number;
  trashBytes: number;
  trashCount: number;
  backupExportCount: number;
  chatHistoryBytes: number;
  chatHistoryCount: number;
  imageCount: number;
  videoCount: number;
  previousTotalBytes: number | null;
  previousScannedAt: string | null;
  scannedAt: string;
  items: StorageUsageSummaryItem[];
}

export interface IpStorageUsageItem {
  ipId: number;
  ipName: string;
  coverUri: string | null;
  totalBytes: number;
  imageBytes: number;
  videoBytes: number;
  imageCount: number;
  videoCount: number;
  trashBytes: number;
}

export interface IpStorageDetail {
  ip: IpStorageUsageItem;
  images: ImageListItem[];
}

export interface BackupExportEntry {
  uri: string;
  name: string;
  type: '完整备份' | 'IP备份' | '加密包' | '普通导出';
  sizeBytes: number;
  createdAt: string | null;
  isEncrypted: boolean;
  assetCount: number | null;
  ipCount: number | null;
}

interface BackupManifestShape {
  type?: string;
  assetCount?: number;
  images?: unknown[];
  ip?: unknown;
  ipCount?: number;
  exportData?: {
    ips?: unknown[];
    images?: unknown[];
  };
}

const LAST_STORAGE_SUMMARY_KEY_PREFIX = 'pixory.storageUsage.lastSummary';

interface StoredStorageSummary {
  totalBytes: number;
  scannedAt: string;
}

function normalizeDirectoryUri(directoryUri: string): string {
  return directoryUri.endsWith('/') ? directoryUri : `${directoryUri}/`;
}

function getPreviousSummaryKey(space: PixorySpace): string {
  return `${LAST_STORAGE_SUMMARY_KEY_PREFIX}.${space}`;
}

function formatCompactCount(count: number, unit: string): string {
  return `${count} ${unit}`;
}

async function safeGetLocalEntrySize(uri: string | null | undefined): Promise<{ bytes: number; failed: boolean }> {
  if (!uri) {
    return { bytes: 0, failed: false };
  }

  try {
    return { bytes: await getLocalEntrySize(uri), failed: false };
  } catch {
    return { bytes: 0, failed: true };
  }
}

async function getPreviewBreakdown(space: PixorySpace): Promise<{ imageBytes: number; videoBytes: number }> {
  return runWithDatabaseSpace(space, async (db) => {
    const assets = await imageRepository.findAll(db, { includeDeleted: true, mediaType: 'all' });
    const imageUris = new Set<string>();
    const videoUris = new Set<string>();

    for (const asset of assets) {
      const targetSet = asset.mediaType === 'video' ? videoUris : imageUris;
      if (asset.thumbnailFileUri) {
        targetSet.add(asset.thumbnailFileUri);
      }
      if (asset.coverThumbnailFileUri) {
        targetSet.add(asset.coverThumbnailFileUri);
      }
    }

    const [imageSizes, videoSizes] = await Promise.all([
      Promise.all([...imageUris].map((uri) => safeGetLocalEntrySize(uri))),
      Promise.all([...videoUris].map((uri) => safeGetLocalEntrySize(uri))),
    ]);

    return {
      imageBytes: imageSizes.reduce((sum, item) => sum + item.bytes, 0),
      videoBytes: videoSizes.reduce((sum, item) => sum + item.bytes, 0),
    };
  });
}

async function readPreviousSummary(space: PixorySpace): Promise<StoredStorageSummary | null> {
  let raw: string | null = null;
  try {
    raw = await SecureStore.getItemAsync(getPreviousSummaryKey(space));
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredStorageSummary;
    return Number.isFinite(parsed.totalBytes) && parsed.scannedAt ? parsed : null;
  } catch {
    return null;
  }
}

async function writePreviousSummary(space: PixorySpace, summary: StoredStorageSummary): Promise<void> {
  try {
    await SecureStore.setItemAsync(getPreviousSummaryKey(space), JSON.stringify(summary));
  } catch {
    // Storage statistics should remain usable even if the comparison snapshot cannot be persisted.
  }
}

async function getTrashStats(space: PixorySpace): Promise<{ bytes: number; count: number }> {
  return runWithDatabaseSpace(space, async (db) => {
    const deleted = await imageRepository.findDeleted(db, { mediaType: 'all' });
    return {
      bytes: deleted.reduce((sum, item) => sum + item.fileSize, 0),
      count: deleted.length,
    };
  });
}

async function getAssetStats(space: PixorySpace): Promise<{ imageCount: number; videoCount: number }> {
  return runWithDatabaseSpace(space, async (db) => {
    const [imageCount, videoCount] = await Promise.all([
      imageRepository.count(db, { includeDeleted: true, mediaType: 'image' }),
      imageRepository.count(db, { includeDeleted: true, mediaType: 'video' }),
    ]);
    return { imageCount, videoCount };
  });
}

export async function getChatHistoryStats(space: PixorySpace): Promise<{ bytes: number; count: number }> {
  return runWithDatabaseSpace(space, async (db) => {
    const rows = await db.getAllAsync<{ sizeBytes: number }>(
      `SELECT SUM(LENGTH(CAST(m.content AS BLOB))) as sizeBytes
       FROM ai_threads t
       JOIN ai_messages m ON m.threadId = t.id
       WHERE t.space = ?
       GROUP BY t.id
       HAVING COUNT(m.id) > 0`,
      [space]
    );
    const bytes = rows.reduce((sum, r) => sum + (r.sizeBytes || 0), 0);
    return { bytes, count: rows.length };
  });
}

export async function getStorageUsageSummary(space: PixorySpace = 'normal'): Promise<StorageUsageSummary> {
  const previous = await readPreviousSummary(space);
  const [original, preview, temp, backup, previewBreakdown, trash, assetStats, backupEntries, chatStats] = await Promise.all([
    safeGetLocalEntrySize(getOriginalsDir(space)),
    safeGetLocalEntrySize(getThumbnailsDir(space)),
    safeGetLocalEntrySize(getTempDir(space)),
    safeGetLocalEntrySize(getExportsDir(space)),
    getPreviewBreakdown(space),
    getTrashStats(space),
    getAssetStats(space),
    listBackupExportEntries(space),
    getChatHistoryStats(space),
  ]);
  const expoCache = await safeGetLocalEntrySize(FileSystem.cacheDirectory);

  const originalBytes = original.bytes;
  const previewBytes = preview.bytes;
  const temporaryBytes = temp.bytes + expoCache.bytes;
  const backupExportBytes = backup.bytes;
  const trashBytes = trash.bytes;
  const chatHistoryBytes = chatStats.bytes;
  const totalBytes = originalBytes + previewBytes + temporaryBytes + backupExportBytes + chatHistoryBytes;
  const scannedAt = new Date().toISOString();

  const summary: StorageUsageSummary = {
    totalBytes,
    originalBytes,
    previewBytes,
    previewImageBytes: previewBreakdown.imageBytes,
    previewVideoBytes: previewBreakdown.videoBytes,
    temporaryBytes,
    backupExportBytes,
    trashBytes,
    trashCount: trash.count,
    backupExportCount: backupEntries.length,
    chatHistoryBytes,
    chatHistoryCount: chatStats.count,
    imageCount: assetStats.imageCount,
    videoCount: assetStats.videoCount,
    previousTotalBytes: previous?.totalBytes ?? null,
    previousScannedAt: previous?.scannedAt ?? null,
    scannedAt,
    items: [
      {
        key: 'original-assets',
        label: '原始素材',
        bytes: originalBytes,
        actionLabel: '查看',
        subtitle: `${formatCompactCount(assetStats.imageCount, '张图片')} · ${formatCompactCount(assetStats.videoCount, '个视频')}`,
        failed: original.failed,
      },
      {
        key: 'preview-cache',
        label: '预览缓存',
        bytes: previewBytes,
        actionLabel: '重建',
        subtitle: `图片缩略图 ${previewBreakdown.imageBytes} · 视频封面 ${previewBreakdown.videoBytes}`,
        failed: preview.failed,
      },
      {
        key: 'temporary-cache',
        label: '临时缓存',
        bytes: temporaryBytes,
        actionLabel: '清理',
        subtitle: `${temporaryBytes} 可释放`,
        failed: temp.failed || expoCache.failed,
      },
      {
        key: 'backup-export',
        label: '备份导出',
        bytes: backupExportBytes,
        actionLabel: '管理',
        subtitle: `${backupEntries.length} 个备份包`,
        failed: backup.failed,
      },
      {
        key: 'trash',
        label: '回收站',
        bytes: trashBytes,
        actionLabel: '查看',
        subtitle: `${trash.count} 项`,
      },
      {
        key: 'chat-history',
        label: '聊天记录',
        bytes: chatHistoryBytes,
        actionLabel: '查看',
        subtitle: `${chatStats.count} 个对话`,
      },
    ],
  };

  await writePreviousSummary(space, { totalBytes, scannedAt });
  return summary;
}

export interface ChatStorageUsageItem {
  threadId: string;
  title: string;
  updatedAt: string;
  bytes: number;
  messageCount: number;
  avatarUri?: string | null;
}

export async function listChatStorageUsage(space: PixorySpace = 'normal'): Promise<ChatStorageUsageItem[]> {
  return runWithDatabaseSpace(space, async (db) => {
    const rows = await db.getAllAsync<{
      threadId: string;
      title: string;
      updatedAt: string;
      sizeBytes: number;
      messageCount: number;
      roleSnapshotJson: string;
    }>(
      `SELECT 
         t.id as threadId, 
         t.title, 
         t.updatedAt, 
         t.roleSnapshotJson,
         COALESCE(SUM(LENGTH(CAST(m.content AS BLOB))), 0) as sizeBytes,
         COUNT(m.id) as messageCount
       FROM ai_threads t
       JOIN ai_messages m ON m.threadId = t.id
       WHERE t.space = ?
       GROUP BY t.id
       HAVING messageCount > 0
       ORDER BY sizeBytes DESC`,
      [space]
    );
    return rows.map(r => {
      let avatarUri = null;
      try {
        if (r.roleSnapshotJson) {
          const snapshot = JSON.parse(r.roleSnapshotJson);
          avatarUri = snapshot.avatarUri || null;
        }
      } catch (e) {
        // ignore JSON parse errors
      }
      return {
        threadId: r.threadId,
        title: r.title,
        updatedAt: r.updatedAt,
        bytes: r.sizeBytes,
        messageCount: r.messageCount,
        avatarUri,
      };
    });
  });
}

export async function listIpStorageUsage(space: PixorySpace = 'normal'): Promise<IpStorageUsageItem[]> {
  return runWithDatabaseSpace(space, async (db) => {
    const rows = await db.getAllAsync<{
      ipId: number;
      ipName: string;
      coverUri: string | null;
      totalBytes: number | null;
      imageBytes: number | null;
      videoBytes: number | null;
      imageCount: number;
      videoCount: number;
      trashBytes: number | null;
    }>(
      `SELECT
         ips.id AS ipId,
         ips.name AS ipName,
         COALESCE(customCover.thumbnailFileUri, defaultCover.thumbnailFileUri) AS coverUri,
         COALESCE(SUM(image_assets.fileSize), 0) AS totalBytes,
         COALESCE(SUM(CASE WHEN image_assets.mediaType = 'image' THEN image_assets.fileSize ELSE 0 END), 0) AS imageBytes,
         COALESCE(SUM(CASE WHEN image_assets.mediaType = 'video' THEN image_assets.fileSize ELSE 0 END), 0) AS videoBytes,
         COUNT(CASE WHEN image_assets.mediaType = 'image' THEN 1 END) AS imageCount,
         COUNT(CASE WHEN image_assets.mediaType = 'video' THEN 1 END) AS videoCount,
         COALESCE(SUM(CASE WHEN image_assets.deletedAt IS NOT NULL THEN image_assets.fileSize ELSE 0 END), 0) AS trashBytes
       FROM ips
       LEFT JOIN image_assets ON image_assets.ipId = ips.id
       LEFT JOIN image_assets AS customCover ON customCover.id = ips.coverImageAssetId AND customCover.deletedAt IS NULL
       LEFT JOIN image_assets AS defaultCover ON defaultCover.id = (
         SELECT id FROM image_assets AS coverCandidate
         WHERE coverCandidate.ipId = ips.id AND coverCandidate.deletedAt IS NULL
         ORDER BY coverCandidate.updatedAt DESC, coverCandidate.id DESC
         LIMIT 1
       )
       WHERE ips.deletedAt IS NULL
       GROUP BY ips.id
       ORDER BY totalBytes DESC, ips.updatedAt DESC, ips.id DESC`
    );

    return rows.map((row) => ({
      ipId: row.ipId,
      ipName: row.ipName,
      coverUri: row.coverUri,
      totalBytes: row.totalBytes ?? 0,
      imageBytes: row.imageBytes ?? 0,
      videoBytes: row.videoBytes ?? 0,
      imageCount: row.imageCount,
      videoCount: row.videoCount,
      trashBytes: row.trashBytes ?? 0,
    }));
  });
}

export async function getIpStorageDetail(
  space: PixorySpace,
  ipId: number,
  orderBy: 'fileSizeDesc' | 'createdAtDesc' | 'groupNameAsc' = 'fileSizeDesc'
): Promise<IpStorageDetail> {
  const [items, images] = await Promise.all([
    listIpStorageUsage(space),
    runWithDatabaseSpace(space, (db) =>
      imageRepository.findByIpId(db, ipId, {
        includeDeleted: true,
        mediaType: 'all',
        orderBy: orderBy === 'createdAtDesc' ? 'createdAtDesc' : 'fileSizeDesc',
      })
    ),
  ]);
  const ip = items.find((item) => item.ipId === ipId);
  if (!ip) {
    throw new Error('没有找到这个 IP 的存储信息。');
  }

  return {
    ip,
    images: orderBy === 'groupNameAsc'
      ? [...images].sort((left, right) => (left.groupName ?? '未分组').localeCompare(right.groupName ?? '未分组') || right.fileSize - left.fileSize)
      : images,
  };
}

function getFileName(uri: string): string {
  return uri.replace(/\/$/, '').split('/').pop() ?? 'backup';
}

function classifyBackupEntry(name: string, uri: string): BackupExportEntry['type'] {
  const lower = `${name} ${uri}`.toLowerCase();
  if (lower.endsWith('.pixorypack') || lower.includes('encrypted')) {
    return '加密包';
  }
  if (lower.includes('/full_') || lower.startsWith('full_') || lower.includes('all_')) {
    return '完整备份';
  }
  if (lower.includes('/ip_') || lower.startsWith('ip_')) {
    return 'IP备份';
  }
  return '普通导出';
}

async function getEntryCreatedAt(uri: string): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && info.modificationTime ? new Date(info.modificationTime * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

function getManifestCounts(manifest: BackupManifestShape): { assetCount: number | null; ipCount: number | null } {
  const assetCount = Number.isFinite(manifest.assetCount)
    ? manifest.assetCount ?? null
    : Array.isArray(manifest.exportData?.images)
      ? manifest.exportData.images.length
      : Array.isArray(manifest.images)
        ? manifest.images.length
        : null;
  const ipCount = Number.isFinite(manifest.ipCount)
    ? manifest.ipCount ?? null
    : Array.isArray(manifest.exportData?.ips)
      ? manifest.exportData.ips.length
      : manifest.ip
        ? 1
        : null;

  return { assetCount, ipCount };
}

async function readBackupManifestCounts(entryUri: string): Promise<{ assetCount: number | null; ipCount: number | null }> {
  try {
    const entryInfo = await FileSystem.getInfoAsync(entryUri);
    if (!entryInfo.exists || !entryInfo.isDirectory) {
      return { assetCount: null, ipCount: null };
    }

    const manifestUri = joinStoragePath(normalizeDirectoryUri(entryUri), 'manifest.json');
    const manifestInfo = await FileSystem.getInfoAsync(manifestUri);
    if (!manifestInfo.exists || manifestInfo.isDirectory) {
      return { assetCount: null, ipCount: null };
    }

    const raw = await FileSystem.readAsStringAsync(manifestUri, { encoding: FileSystem.EncodingType.UTF8 });
    return getManifestCounts(JSON.parse(raw) as BackupManifestShape);
  } catch {
    return { assetCount: null, ipCount: null };
  }
}

async function listDirectoryChildren(directoryUri: string): Promise<string[]> {
  try {
    const info = await FileSystem.getInfoAsync(directoryUri);
    if (!info.exists || !info.isDirectory) {
      return [];
    }
    const names = await FileSystem.readDirectoryAsync(directoryUri);
    const base = normalizeDirectoryUri(directoryUri);
    return names.map((name) => `${base}${name}`);
  } catch {
    return [];
  }
}

export async function listBackupExportEntries(space: PixorySpace = 'normal'): Promise<BackupExportEntry[]> {
  const exportsDir = getExportsDir(space);
  const topLevel = await listDirectoryChildren(exportsDir);
  const backupRoot = normalizeDirectoryUri(joinStoragePath(exportsDir, 'backups'));
  const backupChildren = await listDirectoryChildren(backupRoot);
  const candidates = topLevel
    .filter((uri) => normalizeDirectoryUri(uri) !== backupRoot)
    .concat(backupChildren);

  const entries = await Promise.all(candidates.map(async (uri) => {
    const name = getFileName(uri);
    const size = await safeGetLocalEntrySize(uri);
    const manifestCounts = await readBackupManifestCounts(uri);
    return {
      uri,
      name,
      type: classifyBackupEntry(name, uri),
      sizeBytes: size.bytes,
      createdAt: await getEntryCreatedAt(uri),
      isEncrypted: name.toLowerCase().endsWith('.pixorypack') || name.toLowerCase().includes('encrypted'),
      assetCount: manifestCounts.assetCount,
      ipCount: manifestCounts.ipCount,
    };
  }));

  return entries
    .filter((entry) => entry.sizeBytes > 0)
    .sort((left, right) => right.sizeBytes - left.sizeBytes || left.name.localeCompare(right.name));
}

export async function deleteBackupExportEntry(space: PixorySpace, entryUri: string): Promise<void> {
  const exportsDir = getExportsDir(space);
  if (entryUri === exportsDir || !entryUri.startsWith(exportsDir)) {
    return;
  }

  await FileSystem.deleteAsync(entryUri, { idempotent: true });
}
