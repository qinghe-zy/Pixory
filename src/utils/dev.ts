export const isDevToolsEnabled = __DEV__ && process.env.EXPO_PUBLIC_PIXORY_DEV_TOOLS === '1';

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
