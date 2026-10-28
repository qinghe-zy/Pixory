import { useState, useEffect, useCallback } from 'react';
import type { PixorySpace } from '../../database';
import { runWithDatabaseSpace } from '../../database/db';
import { settingsRepository } from '../../database/repositories/settingsRepository';
import {
  type ImGlobalPacingSettings,
  DEFAULT_IM_GLOBAL_SETTINGS,
} from '../config/pacingProfile';

const IM_GLOBAL_SETTINGS_KEY = 'imCompanionGlobalSettings';

export async function getImGlobalSettings(space: PixorySpace = 'normal'): Promise<ImGlobalPacingSettings> {
  return runWithDatabaseSpace(space, async (db) => {
    try {
      const val = await settingsRepository.getValue(db, IM_GLOBAL_SETTINGS_KEY);
      if (val) {
        const parsed = JSON.parse(val);
        return { ...DEFAULT_IM_GLOBAL_SETTINGS, ...parsed };
      }
    } catch {
      // 容错返回默认
    }
    return DEFAULT_IM_GLOBAL_SETTINGS;
  });
}

export async function setImGlobalSettings(
  space: PixorySpace,
  settings: Partial<ImGlobalPacingSettings>
): Promise<ImGlobalPacingSettings> {
  return runWithDatabaseSpace(space, async (db) => {
    const current = await getImGlobalSettings(space);
    const updated: ImGlobalPacingSettings = { ...current, ...settings };
    await settingsRepository.setValue(db, IM_GLOBAL_SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  });
}

export function useImGlobalSettings(space: PixorySpace = 'normal') {
  const [settings, setSettingsState] = useState<ImGlobalPacingSettings>(DEFAULT_IM_GLOBAL_SETTINGS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getImGlobalSettings(space);
      setSettingsState(data);
    } finally {
      setLoading(false);
    }
  }, [space]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = useCallback(
    async (patch: Partial<ImGlobalPacingSettings>) => {
      setSettingsState((prev) => ({ ...prev, ...patch }));
      return setImGlobalSettings(space, patch);
    },
    [space]
  );

  return { settings, update, loading, reload: load };
}
