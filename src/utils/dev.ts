import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';

const DEVELOPER_MODE_KEY = 'pixory_developer_mode_enabled';
export const isDevToolsEnabled = __DEV__ && process.env.EXPO_PUBLIC_PIXORY_DEV_TOOLS === '1';
export const isDeveloperModeRevealEnabled = true;
let developerModeEnabled = false;
const listeners = new Set<(enabled: boolean) => void>();
export function isDeveloperModeEnabled(): boolean { return isDevToolsEnabled || developerModeEnabled; }
export function subscribeDeveloperMode(listener: (enabled: boolean) => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export function useDeveloperMode(): boolean { const [enabled, setEnabled] = useState(isDeveloperModeEnabled()); useEffect(() => { let mounted = true; void SecureStore.getItemAsync(DEVELOPER_MODE_KEY).then((value) => { if (!mounted) return; developerModeEnabled = value === '1'; setEnabled(isDeveloperModeEnabled()); }); const unsubscribe = subscribeDeveloperMode(setEnabled); return () => { mounted = false; unsubscribe(); }; }, []); return enabled; }
export async function setDeveloperModeEnabled(enabled: boolean): Promise<void> { developerModeEnabled = enabled; await SecureStore.setItemAsync(DEVELOPER_MODE_KEY, enabled ? '1' : '0'); listeners.forEach((listener) => listener(isDeveloperModeEnabled())); }
export async function toggleDeveloperModeFromAbout(): Promise<boolean> { await setDeveloperModeEnabled(true); return true; }

const SENSITIVE_LOG_KEYS = new Set([
  'originalFileUri',
  'thumbnailFileUri',
  'sourceUri',
  'uri',
  'fileUri',
  'backupDir',
  'databaseUri',
  'manifestUri',
]);

export function redactDevLogString(value: string): string {
  return value
    .replace(/(?:file|content):\/\/[^\s"',}]+/g, '[redacted-uri]')
    .replace(/pixory_personal[^\s"',}]+/g, 'pixory_personal/[redacted-uri]');
}

export function redactDevLogValue(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_LOG_KEYS.has(key)) {
    return '[redacted-uri]';
  }

  if (typeof value === 'string') {
    return redactDevLogString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactDevLogValue(item));
  }

  if (value && typeof value === 'object') {
    const nextValue: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      nextValue[entryKey] = redactDevLogValue(entryValue, entryKey);
    }
    return nextValue;
  }

  return value;
}

export function devLog(...args: unknown[]) {
  if (isDevToolsEnabled) {
    console.log(...args.map((arg) => redactDevLogValue(arg)));
  }
}
