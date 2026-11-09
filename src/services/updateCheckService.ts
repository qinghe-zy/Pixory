import Constants from 'expo-constants';
import { Alert, Linking } from 'react-native';
import * as Updates from 'expo-updates';

const DEFAULT_TIMEOUT_MS = 5000;
const FALLBACK_CURRENT_VERSION = '2.9.4';
const FALLBACK_CURRENT_VERSION_CODE = 29007;

export interface AppUpdateInfo {
  version: string;
  versionCode: number | null;
  title: string;
  message: string;
  releaseNotes: string[];
  downloadUrl: string;
}

interface UpdateCheckConfig {
  enabled: boolean;
  url: string | null;
  githubLatestUrl: string | null;
  fallbackDownloadUrl: string | null;
  timeoutMs: number;
}

interface CurrentAppVersion {
  version: string;
  versionCode: number | null;
}

type RemoteUpdatePayload = {
  enabled?: unknown;
  version?: unknown;
  latestVersion?: unknown;
  versionCode?: unknown;
  latestVersionCode?: unknown;
  title?: unknown;
  message?: unknown;
  releaseNotes?: unknown;
  detailLines?: unknown;
  downloadUrl?: unknown;
  url?: unknown;
};

type RemoteGitHubReleasePayload = {
  draft?: unknown;
  prerelease?: unknown;
  tag_name?: unknown;
  name?: unknown;
  body?: unknown;
  html_url?: unknown;
  assets?: unknown;
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

export function compareAppVersions(candidateVersion: string, currentVersion: string): number {
  const candidateParts = candidateVersion.split(/[.+-]/).map((part) => Number.parseInt(part, 10));
  const currentParts = currentVersion.split(/[.+-]/).map((part) => Number.parseInt(part, 10));
  const maxLength = Math.max(candidateParts.length, currentParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const candidatePart = Number.isFinite(candidateParts[index]) ? candidateParts[index] : 0;
    const currentPart = Number.isFinite(currentParts[index]) ? currentParts[index] : 0;
    if (candidatePart > currentPart) {
      return 1;
    }
    if (candidatePart < currentPart) {
      return -1;
    }
  }

  return 0;
}

function getUpdateCheckConfig(): UpdateCheckConfig {
  const extra = asRecord(Constants.expoConfig?.extra);
  const updateCheck = asRecord(extra?.updateCheck);
  const enabled = updateCheck?.enabled !== false;
  const url = asNonEmptyString(updateCheck?.url);
  const githubLatestUrl = asNonEmptyString(updateCheck?.githubLatestUrl);
  const fallbackDownloadUrl = asNonEmptyString(updateCheck?.fallbackDownloadUrl);
  const timeoutMs = asPositiveInteger(updateCheck?.timeoutMs) ?? DEFAULT_TIMEOUT_MS;

  return { enabled, fallbackDownloadUrl, githubLatestUrl, timeoutMs, url };
}

export function getCurrentAppVersion(): CurrentAppVersion {
  const expoConfig = Constants.expoConfig;
  return {
    version: expoConfig?.version ?? FALLBACK_CURRENT_VERSION,
    versionCode: asPositiveInteger(expoConfig?.android?.versionCode) ?? FALLBACK_CURRENT_VERSION_CODE,
  };
}

export function getAppVersion(): string {
  return Constants.expoConfig?.version ?? FALLBACK_CURRENT_VERSION;
}

function normalizeRemoteUpdate(payload: unknown): AppUpdateInfo | null {
  const record = asRecord(payload) as RemoteUpdatePayload | null;
  if (!record || record.enabled === false) {
    return null;
  }

  const version = asNonEmptyString(record.version) ?? asNonEmptyString(record.latestVersion);
  const versionCode = asPositiveInteger(record.versionCode) ?? asPositiveInteger(record.latestVersionCode);
  const downloadUrl = asNonEmptyString(record.downloadUrl) ?? asNonEmptyString(record.url);

  if (!version || !downloadUrl) {
    return null;
  }

  const releaseNotes = Array.isArray(record.releaseNotes)
    ? record.releaseNotes
        .map((item) => asNonEmptyString(item))
        .filter((item): item is string => Boolean(item))
    : Array.isArray(record.detailLines)
    ? record.detailLines
        .map((item) => asNonEmptyString(item))
        .filter((item): item is string => Boolean(item))
    : [];

  return {
    version,
    versionCode,
    downloadUrl,
    releaseNotes,
    title: asNonEmptyString(record.title) ?? '发现 Pixory 新版本',
    message: asNonEmptyString(record.message) ?? `Pixory ${version} 已可更新。`,
  };
}

function normalizeVersionTag(value: string): string {
  return value.trim().replace(/^v/i, '');
}

function normalizeGitHubRelease(payload: unknown, fallbackDownloadUrl: string | null): AppUpdateInfo | null {
  const record = asRecord(payload) as RemoteGitHubReleasePayload | null;
  if (!record || record.draft === true || record.prerelease === true) {
    return null;
  }

  const versionTag = asNonEmptyString(record.tag_name);
  const version = versionTag ? normalizeVersionTag(versionTag) : null;
  const releaseUrl = asNonEmptyString(record.html_url);
  if (!version || !releaseUrl) {
    return null;
  }

  const releaseNotes = asNonEmptyString(record.body)
    ?.split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .replace(/\*\*/g, '')
    )
    .filter(
      (line) =>
        line.length > 0 &&
        !/^官方下载[:：]|^服务器直下[:：]|^#|^<!--|^>/.test(line)
    )
    ?? [];

  return {
    version,
    versionCode: null,
    downloadUrl: fallbackDownloadUrl ?? releaseUrl,
    releaseNotes,
    title: asNonEmptyString(record.name) ?? `发现 Pixory ${version}`,
    message: `Pixory ${version} 已发布，可前往下载页获取最新版。`,
  };
}

function isRemoteVersionNewer(remote: AppUpdateInfo, current: CurrentAppVersion): boolean {
  const versionComparison = compareAppVersions(remote.version, current.version);
  if (versionComparison !== 0) {
    return versionComparison > 0;
  }

  return false;
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

export async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  const config = getUpdateCheckConfig();
  if (!config.enabled || (!config.url && !config.githubLatestUrl)) {
    return null;
  }

  if (config.url) {
    try {
      const response = await fetchWithTimeout(config.url, config.timeoutMs);
      if (response.ok) {
        const updateInfo = normalizeRemoteUpdate(await response.json());
        if (updateInfo && isRemoteVersionNewer(updateInfo, getCurrentAppVersion())) {
          return updateInfo;
        }
      }
    } catch {
      // Fall through to the GitHub release source below.
    }
  }

  if (config.githubLatestUrl) {
    try {
      const response = await fetchWithTimeout(config.githubLatestUrl, config.timeoutMs);
      if (response.ok) {
        const updateInfo = normalizeGitHubRelease(await response.json(), config.fallbackDownloadUrl);
        if (updateInfo && isRemoteVersionNewer(updateInfo, getCurrentAppVersion())) {
          return updateInfo;
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}

export type UpdateToastFunction = (
  options: string | { message: string; durationMs?: number; tone?: 'neutral' | 'success' | 'warning' | 'error' | 'info' },
) => void;

export interface CheckAllAppUpdatesOptions {
  showToast: UpdateToastFunction;
  openUrl?: (url: string) => void;
}

let isCheckUpdateInProgress = false;

export async function checkAllAppUpdates(
  options: CheckAllAppUpdatesOptions | UpdateToastFunction,
): Promise<void> {
  const showToast = typeof options === 'function' ? options : options.showToast;
  const openUrl =
    typeof options === 'function'
      ? (url: string) => {
          Linking.openURL(url).catch(() => {});
        }
      : (options.openUrl ??
        ((url: string) => {
          Linking.openURL(url).catch(() => {});
        }));

  if (isCheckUpdateInProgress) {
    showToast({ message: '正在检查更新中，请稍候...', tone: 'info', durationMs: 2000 });
    return;
  }

  isCheckUpdateInProgress = true;
  try {
    showToast({ message: '正在检查更新...', durationMs: 999999 });
    const [versionInfo, otaUpdate] = await Promise.all([
      checkForAppUpdate().catch(() => null),
      __DEV__ || !Updates.isEnabled
        ? Promise.resolve(null)
        : Promise.race([
            Updates.checkForUpdateAsync().catch(() => null),
            new Promise<any>((_, reject) => setTimeout(() => reject(new Error('OTA_TIMEOUT')), 10000)),
          ]).catch(() => null),
    ]);

    if (versionInfo) {
      showToast({ message: '发现新版本', durationMs: 3000, tone: 'success' });
      Alert.alert('发现新版本', `新版本 v${versionInfo.version} 已发布，是否前往下载？`, [
        { text: '稍后', style: 'cancel' },
        { text: '前往', onPress: () => openUrl(versionInfo.downloadUrl) },
      ]);
      return;
    }

    if (otaUpdate?.isAvailable) {
      showToast({ message: '发现新热更新，正在下载...', durationMs: 999999 });
      await Updates.fetchUpdateAsync();
      showToast({ message: '热更新下载完成', durationMs: 3000, tone: 'success' });
      Alert.alert('热更新完成', '是否立即重启应用以应用更新？', [
        { text: '稍后', style: 'cancel' },
        { text: '重启', onPress: () => Updates.reloadAsync() },
      ]);
    } else {
      showToast({ message: '当前已是最新版本', durationMs: 2600, tone: 'neutral' });
    }
  } catch (error: any) {
    if (error?.message === 'OTA_TIMEOUT' || error?.message?.includes('timeout') || error?.message?.includes('network')) {
      showToast({ message: '网络问题，检查超时', tone: 'error' });
    } else {
      showToast({ message: '更新检查失败', tone: 'error' });
    }
  } finally {
    isCheckUpdateInProgress = false;
  }
}

