import { runWithDatabaseSpace, settingsRepository, type PixorySpace } from '../../database';

export const COMPANION_AWARENESS_ENABLED_KEY = 'companionAwarenessEnabled';

export async function isCompanionAwarenessEnabled(space: PixorySpace): Promise<boolean> {
  const value = await runWithDatabaseSpace(space, (db) => settingsRepository.getValue(db, COMPANION_AWARENESS_ENABLED_KEY));
  return value !== 'false';
}

export async function setCompanionAwarenessEnabled(space: PixorySpace, enabled: boolean): Promise<void> {
  await runWithDatabaseSpace(space, (db) => settingsRepository.setValue(db, COMPANION_AWARENESS_ENABLED_KEY, enabled ? 'true' : 'false'));
}

export const CompanionSettingsService = { getEnabled: isCompanionAwarenessEnabled, setEnabled: setCompanionAwarenessEnabled };
