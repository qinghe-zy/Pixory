import type { SQLiteDatabase } from 'expo-sqlite';
import type { AppSettingRecord, ImageSortOrder } from '../types';
import { createTimestamp } from '../utils';

const PROFILE_AVATAR_KEY = 'profileAvatarUri';
const RECENT_IMPORT_GROUP_IDS_KEY = 'recentImportGroupIds';
const LAST_BACKUP_AT_KEY = 'lastBackupAt';
const BACKUP_EXPORT_DIRECTORY_URI_KEY = 'backupExportDirectoryUri';
const SKIPPED_UPDATE_VERSION_KEY = 'skippedUpdateVersionKey';
const DISMISSED_ANNOUNCEMENT_ID_KEY = 'dismissedAnnouncementId';
export const AI_DEFAULT_CHAT_PROVIDER_ID_KEY = 'aiDefaultChatProviderId';
export const ASSET_LIST_VIEW_MODE_KEY = 'assetListViewMode';
export const ASSET_LIST_SORT_ORDER_KEY = 'assetListSortOrder';
export const IMAGE_IMPORT_SOURCE_MODE_KEY = 'imageImportSourceMode';
export const VIDEO_IMPORT_NAMING_MODE_KEY = 'videoImportNamingMode';

export type AssetListViewMode = 'grid' | 'detail';
export type ImageImportSourceMode = 'copy' | 'move';
export type VideoImportNamingMode = 'generated' | 'preserveOriginal';

const VALID_SORT_ORDERS: ImageSortOrder[] = [
  'createdAtDesc',
  'createdAtAsc',
  'updatedAtDesc',
  'updatedAtAsc',
  'lastViewedAtDesc',
  'lastViewedAtAsc',
  'filenameAsc',
  'filenameDesc',
  'fileSizeDesc',
  'fileSizeAsc',
];

function isImageSortOrder(value: string | null): value is ImageSortOrder {
  return Boolean(value && VALID_SORT_ORDERS.includes(value as ImageSortOrder));
}

export const settingsRepository = {
  async getValue(db: SQLiteDatabase, key: string): Promise<string | null> {
    const row = await db.getFirstAsync<AppSettingRecord>(
      'SELECT key, value, updatedAt FROM app_settings WHERE key = ?',
      key
    );

    return row?.value ?? null;
  },

  async setValue(db: SQLiteDatabase, key: string, value: string | null): Promise<void> {
    const now = createTimestamp();

    await db.runAsync(
      `INSERT INTO app_settings (key, value, updatedAt)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
      key,
      value,
      now
    );
  },

  async getProfileAvatarUri(db: SQLiteDatabase): Promise<string | null> {
    return this.getValue(db, PROFILE_AVATAR_KEY);
  },

  async setProfileAvatarUri(db: SQLiteDatabase, uri: string | null): Promise<void> {
    await this.setValue(db, PROFILE_AVATAR_KEY, uri);
  },

  async getRecentImportGroupIds(db: SQLiteDatabase): Promise<number[]> {
    const value = await this.getValue(db, RECENT_IMPORT_GROUP_IDS_KEY);
    if (!value) {
      return [];
    }

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is number => Number.isInteger(item) && item > 0) : [];
    } catch {
      return [];
    }
  },

  async rememberImportGroupIds(db: SQLiteDatabase, groupIds: number[]): Promise<void> {
    const current = await this.getRecentImportGroupIds(db);
    const next = [...new Set([...groupIds, ...current])].filter((groupId) => Number.isInteger(groupId) && groupId > 0).slice(0, 5);
    await this.setValue(db, RECENT_IMPORT_GROUP_IDS_KEY, JSON.stringify(next));
  },

  async getLastBackupAt(db: SQLiteDatabase): Promise<string | null> {
    return this.getValue(db, LAST_BACKUP_AT_KEY);
  },

  async setLastBackupAt(db: SQLiteDatabase, value: string): Promise<void> {
    await this.setValue(db, LAST_BACKUP_AT_KEY, value);
  },

  async getBackupExportDirectoryUri(db: SQLiteDatabase): Promise<string | null> {
    return this.getValue(db, BACKUP_EXPORT_DIRECTORY_URI_KEY);
  },

  async setBackupExportDirectoryUri(db: SQLiteDatabase, uri: string | null): Promise<void> {
    await this.setValue(db, BACKUP_EXPORT_DIRECTORY_URI_KEY, uri);
  },

  async getSkippedUpdateVersionKey(db: SQLiteDatabase): Promise<string | null> {
    return this.getValue(db, SKIPPED_UPDATE_VERSION_KEY);
  },

  async setSkippedUpdateVersionKey(db: SQLiteDatabase, value: string | null): Promise<void> {
    await this.setValue(db, SKIPPED_UPDATE_VERSION_KEY, value);
  },

  async getDismissedAnnouncementId(db: SQLiteDatabase): Promise<string | null> {
    return this.getValue(db, DISMISSED_ANNOUNCEMENT_ID_KEY);
  },

  async setDismissedAnnouncementId(db: SQLiteDatabase, value: string | null): Promise<void> {
    await this.setValue(db, DISMISSED_ANNOUNCEMENT_ID_KEY, value);
  },

  async getDefaultAiProviderId(db: SQLiteDatabase): Promise<string | null> {
    return this.getValue(db, AI_DEFAULT_CHAT_PROVIDER_ID_KEY);
  },

  async setDefaultAiProviderId(db: SQLiteDatabase, providerId: string | null): Promise<void> {
    await this.setValue(db, AI_DEFAULT_CHAT_PROVIDER_ID_KEY, providerId);
  },

  async getAssetListViewMode(db: SQLiteDatabase): Promise<AssetListViewMode> {
    const value = await this.getValue(db, ASSET_LIST_VIEW_MODE_KEY);
    return value === 'detail' ? 'detail' : 'grid';
  },

  async setAssetListViewMode(db: SQLiteDatabase, mode: AssetListViewMode): Promise<void> {
    await this.setValue(db, ASSET_LIST_VIEW_MODE_KEY, mode);
  },

  async getAssetListSortOrder(db: SQLiteDatabase, fallback: ImageSortOrder = 'createdAtDesc'): Promise<ImageSortOrder> {
    const value = await this.getValue(db, ASSET_LIST_SORT_ORDER_KEY);
    return isImageSortOrder(value) ? value : fallback;
  },

  async setAssetListSortOrder(db: SQLiteDatabase, order: ImageSortOrder): Promise<void> {
    await this.setValue(db, ASSET_LIST_SORT_ORDER_KEY, order);
  },

  async getImageImportSourceMode(db: SQLiteDatabase): Promise<ImageImportSourceMode> {
    const value = await this.getValue(db, IMAGE_IMPORT_SOURCE_MODE_KEY);
    return value === 'move' ? 'move' : 'copy';
  },

  async setImageImportSourceMode(db: SQLiteDatabase, mode: ImageImportSourceMode): Promise<void> {
    await this.setValue(db, IMAGE_IMPORT_SOURCE_MODE_KEY, mode);
  },

  async getVideoImportNamingMode(db: SQLiteDatabase): Promise<VideoImportNamingMode> {
    const value = await this.getValue(db, VIDEO_IMPORT_NAMING_MODE_KEY);
    return value === 'generated' ? 'generated' : 'preserveOriginal';
  },

  async setVideoImportNamingMode(db: SQLiteDatabase, mode: VideoImportNamingMode): Promise<void> {
    await this.setValue(db, VIDEO_IMPORT_NAMING_MODE_KEY, mode);
  },
};

export default settingsRepository;
