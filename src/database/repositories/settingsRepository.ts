import type { SQLiteDatabase } from 'expo-sqlite';
import type { AppSettingRecord, ImageSortOrder } from '../types';
import { createTimestamp } from '../utils';

const PROFILE_AVATAR_KEY = 'profileAvatarUri';
const RECENT_IMPORT_GROUP_IDS_KEY = 'recentImportGroupIds';
const LAST_BACKUP_AT_KEY = 'lastBackupAt';
const BACKUP_EXPORT_DIRECTORY_URI_KEY = 'backupExportDirectoryUri';
const SKIPPED_UPDATE_VERSION_KEY = 'skippedUpdateVersionKey';
const DISMISSED_ANNOUNCEMENT_ID_KEY = 'dismissedAnnouncementId';
const LAST_APPLIED_UPDATE_NOTICE_ID_KEY = 'lastAppliedUpdateNoticeId';
export const AI_DEFAULT_CHAT_PROVIDER_ID_KEY = 'aiDefaultChatProviderId';
export const AI_PROVIDER_PROMPT_CACHE_ENABLED_KEY = 'aiProviderPromptCacheEnabled';
export const AI_PROVIDER_PROMPT_CACHE_DISABLED_PROVIDER_IDS_KEY = 'aiProviderPromptCacheDisabledProviderIds';
export const AI_PROVIDER_PROMPT_CACHE_TTL_MS_KEY = 'aiProviderPromptCacheTtlMs';
export const MEMORY_MAINTENANCE_MODE_KEY = 'memoryMaintenanceMode';
export const MEMORY_MAINTENANCE_PROVIDER_ID_KEY = 'memoryMaintenanceProviderId';
export const MEMORY_MAINTENANCE_MODEL_ID_KEY = 'memoryMaintenanceModelId';
export const MEMORY_MAINTENANCE_LAST_TEST_AT_KEY = 'memoryMaintenanceLastTestAt';
export const MEMORY_MAINTENANCE_LAST_TEST_STATUS_KEY = 'memoryMaintenanceLastTestStatus';
export const MEMORY_MAINTENANCE_LAST_TEST_MESSAGE_KEY = 'memoryMaintenanceLastTestMessage';
export const MEMORY_MAINTENANCE_TESTED_PROVIDER_ID_KEY = 'memoryMaintenanceTestedProviderId';
export const MEMORY_MAINTENANCE_TESTED_MODEL_ID_KEY = 'memoryMaintenanceTestedModelId';
export const MEMORY_MAINTENANCE_TESTED_BASE_URL_HASH_KEY = 'memoryMaintenanceTestedBaseUrlHash';
export const ASSET_LIST_VIEW_MODE_KEY = 'assetListViewMode';
export const ASSET_LIST_SORT_ORDER_KEY = 'assetListSortOrder';
export const IMAGE_IMPORT_SOURCE_MODE_KEY = 'imageImportSourceMode';
export const VIDEO_IMPORT_NAMING_MODE_KEY = 'videoImportNamingMode';

export type AssetListViewMode = 'grid' | 'detail';
export type ImageImportSourceMode = 'copy' | 'move';
export type VideoImportNamingMode = 'generated' | 'preserveOriginal';
export type MemoryMaintenanceMode = 'auto' | 'follow_chat' | 'deepseek_flash' | 'custom';

export interface MemoryMaintenanceSettingsRecord {
  memoryMaintenanceMode: MemoryMaintenanceMode;
  memoryMaintenanceProviderId: string | null;
  memoryMaintenanceModelId: string | null;
  memoryMaintenanceLastTestAt: string | null;
  memoryMaintenanceLastTestStatus: string | null;
  memoryMaintenanceLastTestMessage: string | null;
  memoryMaintenanceTestedBaseUrlHash: string | null;
  memoryMaintenanceTestedModelId: string | null;
  memoryMaintenanceTestedProviderId: string | null;
}

export interface AiPromptCacheSettingsRecord {
  enabled: boolean;
  disabledProviderIds: string[];
  providerTtlMs?: Record<string, number>;
}

const SUPPORTED_PROMPT_CACHE_PROVIDER_PROTOCOLS = ['openai_compatible', 'anthropic', 'gemini'] as const;

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

function isMemoryMaintenanceMode(value: string | null): value is MemoryMaintenanceMode {
  return value === 'auto' || value === 'follow_chat' || value === 'deepseek_flash' || value === 'custom';
}

function parseStringArray(value: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .map((item) => item.trim())
      : [];
  } catch {
    return [];
  }
}

function sanitizeProviderTtlMs(value: Record<string, number>): Record<string, number> | undefined {
  const entries = Object.entries(value)
    .filter((entry): entry is [string, number] =>
      SUPPORTED_PROMPT_CACHE_PROVIDER_PROTOCOLS.includes(entry[0] as typeof SUPPORTED_PROMPT_CACHE_PROVIDER_PROTOCOLS[number])
      && typeof entry[1] === 'number'
      && Number.isFinite(entry[1])
      && entry[1] > 0
    );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parseNumberRecord(value: string | null): Record<string, number> | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }
    return sanitizeProviderTtlMs(parsed as Record<string, number>);
  } catch {
    return undefined;
  }
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

  async getLastAppliedUpdateNoticeId(db: SQLiteDatabase): Promise<string | null> {
    return this.getValue(db, LAST_APPLIED_UPDATE_NOTICE_ID_KEY);
  },

  async setLastAppliedUpdateNoticeId(db: SQLiteDatabase, value: string | null): Promise<void> {
    await this.setValue(db, LAST_APPLIED_UPDATE_NOTICE_ID_KEY, value);
  },

  async getDefaultAiProviderId(db: SQLiteDatabase): Promise<string | null> {
    return this.getValue(db, AI_DEFAULT_CHAT_PROVIDER_ID_KEY);
  },

  async setDefaultAiProviderId(db: SQLiteDatabase, providerId: string | null): Promise<void> {
    await this.setValue(db, AI_DEFAULT_CHAT_PROVIDER_ID_KEY, providerId);
  },

  async getMemoryMaintenanceSettings(db: SQLiteDatabase): Promise<MemoryMaintenanceSettingsRecord> {
    const memoryMaintenanceMode = await this.getValue(db, MEMORY_MAINTENANCE_MODE_KEY);
    const memoryMaintenanceProviderId = await this.getValue(db, MEMORY_MAINTENANCE_PROVIDER_ID_KEY);
    const memoryMaintenanceModelId = await this.getValue(db, MEMORY_MAINTENANCE_MODEL_ID_KEY);
    const memoryMaintenanceLastTestAt = await this.getValue(db, MEMORY_MAINTENANCE_LAST_TEST_AT_KEY);
    const memoryMaintenanceLastTestStatus = await this.getValue(db, MEMORY_MAINTENANCE_LAST_TEST_STATUS_KEY);
    const memoryMaintenanceLastTestMessage = await this.getValue(db, MEMORY_MAINTENANCE_LAST_TEST_MESSAGE_KEY);
    const memoryMaintenanceTestedProviderId = await this.getValue(db, MEMORY_MAINTENANCE_TESTED_PROVIDER_ID_KEY);
    const memoryMaintenanceTestedModelId = await this.getValue(db, MEMORY_MAINTENANCE_TESTED_MODEL_ID_KEY);
    const memoryMaintenanceTestedBaseUrlHash = await this.getValue(db, MEMORY_MAINTENANCE_TESTED_BASE_URL_HASH_KEY);
    return {
      memoryMaintenanceMode: isMemoryMaintenanceMode(memoryMaintenanceMode) ? memoryMaintenanceMode : 'auto',
      memoryMaintenanceProviderId,
      memoryMaintenanceModelId,
      memoryMaintenanceLastTestAt,
      memoryMaintenanceLastTestStatus,
      memoryMaintenanceLastTestMessage,
      memoryMaintenanceTestedBaseUrlHash,
      memoryMaintenanceTestedModelId,
      memoryMaintenanceTestedProviderId,
    };
  },

  async updateMemoryMaintenanceSettings(db: SQLiteDatabase, patch: Partial<MemoryMaintenanceSettingsRecord>): Promise<MemoryMaintenanceSettingsRecord> {
    if (patch.memoryMaintenanceMode !== undefined) {
      await this.setValue(db, MEMORY_MAINTENANCE_MODE_KEY, isMemoryMaintenanceMode(patch.memoryMaintenanceMode) ? patch.memoryMaintenanceMode : 'auto');
    }
    if (patch.memoryMaintenanceProviderId !== undefined) {
      await this.setValue(db, MEMORY_MAINTENANCE_PROVIDER_ID_KEY, patch.memoryMaintenanceProviderId);
    }
    if (patch.memoryMaintenanceModelId !== undefined) {
      await this.setValue(db, MEMORY_MAINTENANCE_MODEL_ID_KEY, patch.memoryMaintenanceModelId);
    }
    if (patch.memoryMaintenanceLastTestAt !== undefined) {
      await this.setValue(db, MEMORY_MAINTENANCE_LAST_TEST_AT_KEY, patch.memoryMaintenanceLastTestAt);
    }
    if (patch.memoryMaintenanceLastTestStatus !== undefined) {
      await this.setValue(db, MEMORY_MAINTENANCE_LAST_TEST_STATUS_KEY, patch.memoryMaintenanceLastTestStatus);
    }
    if (patch.memoryMaintenanceLastTestMessage !== undefined) {
      await this.setValue(db, MEMORY_MAINTENANCE_LAST_TEST_MESSAGE_KEY, patch.memoryMaintenanceLastTestMessage);
    }
    if (patch.memoryMaintenanceTestedProviderId !== undefined) {
      await this.setValue(db, MEMORY_MAINTENANCE_TESTED_PROVIDER_ID_KEY, patch.memoryMaintenanceTestedProviderId);
    }
    if (patch.memoryMaintenanceTestedModelId !== undefined) {
      await this.setValue(db, MEMORY_MAINTENANCE_TESTED_MODEL_ID_KEY, patch.memoryMaintenanceTestedModelId);
    }
    if (patch.memoryMaintenanceTestedBaseUrlHash !== undefined) {
      await this.setValue(db, MEMORY_MAINTENANCE_TESTED_BASE_URL_HASH_KEY, patch.memoryMaintenanceTestedBaseUrlHash);
    }
    return this.getMemoryMaintenanceSettings(db);
  },

  async getAiPromptCacheSettings(db: SQLiteDatabase): Promise<AiPromptCacheSettingsRecord> {
    const enabled = await this.getValue(db, AI_PROVIDER_PROMPT_CACHE_ENABLED_KEY);
    const disabledProviderIds = await this.getValue(db, AI_PROVIDER_PROMPT_CACHE_DISABLED_PROVIDER_IDS_KEY);
    const providerTtlMs = await this.getValue(db, AI_PROVIDER_PROMPT_CACHE_TTL_MS_KEY);
    return {
      enabled: enabled !== 'false',
      disabledProviderIds: parseStringArray(disabledProviderIds),
      providerTtlMs: parseNumberRecord(providerTtlMs),
    };
  },

  async updateAiPromptCacheSettings(db: SQLiteDatabase, patch: Partial<AiPromptCacheSettingsRecord>): Promise<AiPromptCacheSettingsRecord> {
    if (patch.enabled !== undefined) {
      await this.setValue(db, AI_PROVIDER_PROMPT_CACHE_ENABLED_KEY, patch.enabled ? 'true' : 'false');
    }
    if (patch.disabledProviderIds !== undefined) {
      const disabledProviderIds = [...new Set(patch.disabledProviderIds.map((item) => item.trim()).filter(Boolean))];
      await this.setValue(db, AI_PROVIDER_PROMPT_CACHE_DISABLED_PROVIDER_IDS_KEY, JSON.stringify(disabledProviderIds));
    }
    if (patch.providerTtlMs !== undefined) {
      await this.setValue(db, AI_PROVIDER_PROMPT_CACHE_TTL_MS_KEY, JSON.stringify(sanitizeProviderTtlMs(patch.providerTtlMs) ?? {}));
    }
    return this.getAiPromptCacheSettings(db);
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
