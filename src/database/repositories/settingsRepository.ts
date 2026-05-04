import { getDatabase } from '../db';
import type { AppSettingRecord } from '../types';
import { createTimestamp } from '../utils';

const PROFILE_AVATAR_KEY = 'profileAvatarUri';

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
};

export default settingsRepository;
