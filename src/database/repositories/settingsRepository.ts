import type { SQLiteDatabase } from 'expo-sqlite';
import type { AppSettingRecord } from '../types';
import { createTimestamp } from '../utils';

const PROFILE_AVATAR_KEY = 'profileAvatarUri';
const RECENT_IMPORT_GROUP_IDS_KEY = 'recentImportGroupIds';
const LAST_BACKUP_AT_KEY = 'lastBackupAt';

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
};

export default settingsRepository;
