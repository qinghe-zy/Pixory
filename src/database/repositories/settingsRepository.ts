import { getDatabase } from '../db';
import type { AppSettingRecord } from '../types';
import { createTimestamp } from '../utils';

const PROFILE_AVATAR_KEY = 'profileAvatarUri';
const RECENT_IMPORT_GROUP_IDS_KEY = 'recentImportGroupIds';
const LAST_BACKUP_AT_KEY = 'lastBackupAt';

export const settingsRepository = {
  async getValue(key: string): Promise<string | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<AppSettingRecord>(
      'SELECT key, value, updatedAt FROM app_settings WHERE key = ?',
      key
    );

    return row?.value ?? null;
  },

  async setValue(key: string, value: string | null): Promise<void> {
    const db = await getDatabase();
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

  async getProfileAvatarUri(): Promise<string | null> {
    return this.getValue(PROFILE_AVATAR_KEY);
  },

  async setProfileAvatarUri(uri: string | null): Promise<void> {
    await this.setValue(PROFILE_AVATAR_KEY, uri);
  },

  async getRecentImportGroupIds(): Promise<number[]> {
    const value = await this.getValue(RECENT_IMPORT_GROUP_IDS_KEY);
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

  async rememberImportGroupIds(groupIds: number[]): Promise<void> {
    const current = await this.getRecentImportGroupIds();
    const next = [...new Set([...groupIds, ...current])].filter((groupId) => Number.isInteger(groupId) && groupId > 0).slice(0, 5);
    await this.setValue(RECENT_IMPORT_GROUP_IDS_KEY, JSON.stringify(next));
  },

  async getLastBackupAt(): Promise<string | null> {
    return this.getValue(LAST_BACKUP_AT_KEY);
  },

  async setLastBackupAt(value: string): Promise<void> {
    await this.setValue(LAST_BACKUP_AT_KEY, value);
  },
};

export default settingsRepository;
