import Constants from 'expo-constants';

const DEFAULT_TIMEOUT_MS = 5000;

export interface RemoteAnnouncementInfo {
  id: string;
  title: string;
  message: string;
  actionLabel: string;
  detailLines: string[];
}

interface AnnouncementCheckConfig {
  enabled: boolean;
  url: string | null;
  timeoutMs: number;
}

type RemoteAnnouncementPayload = {
  enabled?: unknown;
  id?: unknown;
  title?: unknown;
  message?: unknown;
  actionLabel?: unknown;
  detailLines?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function getAnnouncementCheckConfig(): AnnouncementCheckConfig {
  const extra = asRecord(Constants.expoConfig?.extra);
  const announcement = asRecord(extra?.announcement);
  const enabled = announcement?.enabled !== false;
  const url = asNonEmptyString(announcement?.url);
  const timeoutMs = asPositiveInteger(announcement?.timeoutMs) ?? DEFAULT_TIMEOUT_MS;

  return { enabled, timeoutMs, url };
}

function normalizeRemoteAnnouncement(payload: unknown): RemoteAnnouncementInfo | null {
  const record = asRecord(payload) as RemoteAnnouncementPayload | null;
  if (!record || record.enabled === false) {
    return null;
  }

  const id = asNonEmptyString(record.id);
  const title = asNonEmptyString(record.title);
  const message = asNonEmptyString(record.message);
  if (!id || !title || !message) {
    return null;
  }

  const detailLines = Array.isArray(record.detailLines)
    ? record.detailLines
        .map((item) => asNonEmptyString(item))
        .filter((item): item is string => Boolean(item))
    : [];

  return {
    id,
    title,
    message,
    detailLines,
    actionLabel: asNonEmptyString(record.actionLabel) ?? '知道了',
  };
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkForRemoteAnnouncement(): Promise<RemoteAnnouncementInfo | null> {
  const config = getAnnouncementCheckConfig();
  if (!config.enabled || !config.url) {
    return null;
  }

  try {
    const response = await fetchWithTimeout(config.url, config.timeoutMs);
    if (!response.ok) {
      return null;
    }

    return normalizeRemoteAnnouncement(await response.json());
  } catch {
    return null;
  }
}
