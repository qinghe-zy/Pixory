import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { deleteDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { PERSONAL_DATABASE_NAME, resetDatabaseSpaceCache } from '../database';
import {
  enrollNativeBiometricKey,
  hasNativeBiometricKeySupport,
  verifyNativeBiometricKey,
} from '../native/pixoryMediaModule';
import {
  ensureAppDirectories,
  getExportsDir,
  getOriginalsDir,
  getStorageRootDir,
  getTempDir,
  getThumbnailsDir,
} from './fileStorageService';

export const PERSONAL_CREDENTIAL_KEY = 'pixory.personal.credential.v1';
export const PERSONAL_BACKGROUND_LOCK_TIMEOUT_KEY = 'pixory.personal.backgroundLockTimeoutMs.v1';
export const MAX_PERSONAL_UNLOCK_FAILURES = 15;
const PERSONAL_CREDENTIAL_VERSION = 4;
export const PERSONAL_LOCK_MS = 5 * 60 * 1000;

export type PersonalBackgroundLockTimeoutMs = 0 | 10_000 | 30_000 | 60_000 | 300_000 | 1_800_000 | -1;

export const DEFAULT_PERSONAL_BACKGROUND_LOCK_TIMEOUT_MS: PersonalBackgroundLockTimeoutMs = 60_000;

export const PERSONAL_BACKGROUND_LOCK_OPTIONS: ReadonlyArray<{
  value: PersonalBackgroundLockTimeoutMs;
  label: string;
}> = [
  { value: 0, label: '立即锁定' },
  { value: 10_000, label: '10 秒' },
  { value: 30_000, label: '30 秒' },
  { value: 60_000, label: '1 分钟' },
  { value: 300_000, label: '5 分钟' },
  { value: 1_800_000, label: '30 分钟' },
  { value: -1, label: '永不锁定' },
];

export interface PersonalLockStatus {
  isLocked: boolean;
  lockedUntil: string | null;
  remainingMs: number;
  failedAttempts: number;
  remainingAttempts: number;
}

const backgroundLockTimeoutListeners = new Set<(timeoutMs: PersonalBackgroundLockTimeoutMs) => void>();
const lockStatusListeners = new Set<(status: PersonalLockStatus) => void>();

export function isValidPersonalBackgroundLockTimeoutMs(value: unknown): value is PersonalBackgroundLockTimeoutMs {
  return (
    value === 0 ||
    value === 10_000 ||
    value === 30_000 ||
    value === 60_000 ||
    value === 300_000 ||
    value === 1_800_000 ||
    value === -1
  );
}

export function getPersonalBackgroundLockLabel(timeoutMs: PersonalBackgroundLockTimeoutMs): string {
  return PERSONAL_BACKGROUND_LOCK_OPTIONS.find((item) => item.value === timeoutMs)?.label ?? '1 分钟';
}

export function formatPersonalLockCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function subscribePersonalBackgroundLockTimeout(
  listener: (timeoutMs: PersonalBackgroundLockTimeoutMs) => void
): () => void {
  backgroundLockTimeoutListeners.add(listener);
  return () => {
    backgroundLockTimeoutListeners.delete(listener);
  };
}

export function subscribePersonalLockStatus(
  listener: (status: PersonalLockStatus) => void
): () => void {
  lockStatusListeners.add(listener);
  return () => {
    lockStatusListeners.delete(listener);
  };
}

function emitLockStatus(credential: PersonalCredential | null): void {
  const status = computeLockStatus(credential);
  lockStatusListeners.forEach((listener) => {
    try {
      listener(status);
    } catch {}
  });
}

function computeLockStatus(credential: PersonalCredential | null, now = Date.now()): PersonalLockStatus {
  if (!credential) {
    return {
      isLocked: false,
      lockedUntil: null,
      remainingMs: 0,
      failedAttempts: 0,
      remainingAttempts: MAX_PERSONAL_UNLOCK_FAILURES,
    };
  }
  const lockedUntilMs = credential.lockedUntil != null ? Date.parse(credential.lockedUntil) : NaN;
  if (Number.isFinite(lockedUntilMs) && lockedUntilMs > now) {
    return {
      isLocked: true,
      lockedUntil: credential.lockedUntil,
      remainingMs: lockedUntilMs - now,
      failedAttempts: credential.failedAttempts,
      remainingAttempts: 0,
    };
  }
  const effectiveFailed = credential.lockedUntil != null ? 0 : Math.min(credential.failedAttempts, MAX_PERSONAL_UNLOCK_FAILURES);
  return {
    isLocked: false,
    lockedUntil: null,
    remainingMs: 0,
    failedAttempts: effectiveFailed,
    remainingAttempts: Math.max(0, MAX_PERSONAL_UNLOCK_FAILURES - effectiveFailed),
  };
}

export interface PersonalCredential {
  version: number;
  salt: string;
  hash?: string;
  patternHash?: string;
  recoveryKeyHash?: string;
  recoveryKeyPlain?: string;
  fingerprintEnabled?: boolean;
  defaultMethod?: 'password' | 'pattern';
  failedAttempts: number;
  lockedUntil: string | null;
  updatedAt: string;
}

export interface PersonalVerificationResult {
  ok: boolean;
  lockedUntil: string | null;
  remainingAttempts: number;
  message: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isLocked(credential: PersonalCredential, now = Date.now()): boolean {
  return credential.lockedUntil != null && Date.parse(credential.lockedUntil) > now;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function generateSalt(): Promise<string> {
  return toHex(await Crypto.getRandomBytesAsync(16));
}

async function hashPersonalSecret(secret: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${secret}`);
}

async function readCredential(): Promise<PersonalCredential | null> {
  const rawValue = await SecureStore.getItemAsync(PERSONAL_CREDENTIAL_KEY);
  if (!rawValue) {
    return null;
  }

  const credential = JSON.parse(rawValue) as PersonalCredential;
  
  if (credential.version === 2 || credential.version === 3) {
    const migrated: PersonalCredential = {
      ...credential,
      version: 4,
      defaultMethod: credential.defaultMethod || 'password',
    };
    // Safe migration in background
    writeCredential(migrated).catch(console.error);
    return migrated;
  }

  return credential;
}

async function writeCredential(credential: PersonalCredential): Promise<void> {
  await SecureStore.setItemAsync(PERSONAL_CREDENTIAL_KEY, JSON.stringify(credential));
  emitLockStatus(credential);
}

export async function getPersonalLockStatus(): Promise<PersonalLockStatus> {
  const cred = await readCredential();
  return computeLockStatus(cred);
}

export async function getPersonalBackgroundLockTimeoutMs(): Promise<PersonalBackgroundLockTimeoutMs> {
  try {
    const raw = await SecureStore.getItemAsync(PERSONAL_BACKGROUND_LOCK_TIMEOUT_KEY);
    if (raw == null) {
      return DEFAULT_PERSONAL_BACKGROUND_LOCK_TIMEOUT_MS;
    }
    const parsed = Number(raw);
    return isValidPersonalBackgroundLockTimeoutMs(parsed)
      ? parsed
      : DEFAULT_PERSONAL_BACKGROUND_LOCK_TIMEOUT_MS;
  } catch {
    return DEFAULT_PERSONAL_BACKGROUND_LOCK_TIMEOUT_MS;
  }
}

export async function setPersonalBackgroundLockTimeoutMs(
  timeoutMs: PersonalBackgroundLockTimeoutMs
): Promise<void> {
  if (!isValidPersonalBackgroundLockTimeoutMs(timeoutMs)) {
    throw new Error('不支持的后台锁定时间选项。');
  }
  await SecureStore.setItemAsync(PERSONAL_BACKGROUND_LOCK_TIMEOUT_KEY, String(timeoutMs));
  backgroundLockTimeoutListeners.forEach((listener) => {
    try {
      listener(timeoutMs);
    } catch {}
  });
}

export interface PersonalCredentialConfig {
  hasCredential: boolean;
  hasPassword: boolean;
  hasPattern: boolean;
  fingerprintEnabled: boolean;
  defaultMethod: 'password' | 'pattern';
  hasRecoveryKey: boolean;
}

export async function getPersonalCredentialConfig(): Promise<PersonalCredentialConfig> {
  const cred = await readCredential();
  if (!cred) {
    return {
      hasCredential: false,
      hasPassword: false,
      hasPattern: false,
      fingerprintEnabled: false,
      defaultMethod: 'password',
      hasRecoveryKey: false,
    };
  }
  const hasPassword = Boolean(cred.hash);
  const hasPattern = Boolean(cred.patternHash);
  let defaultMethod = cred.defaultMethod || 'password';
  if (!hasPassword && hasPattern) {
    defaultMethod = 'pattern';
  } else if (hasPassword && !hasPattern) {
    defaultMethod = 'password';
  }
  return {
    hasCredential: true,
    hasPassword,
    hasPattern,
    fingerprintEnabled: cred.fingerprintEnabled ?? false,
    defaultMethod,
    hasRecoveryKey: !!cred.recoveryKeyHash,
  };
}

export async function hasPersonalPassword(): Promise<boolean> {
  return Boolean(await readCredential());
}

export async function setPersonalPassword(secret: string): Promise<void> {
  const preparedSecret = secret.trim();
  if (preparedSecret.length < 4) {
    throw new Error('隐私系统密码至少需要 4 位。');
  }

  const cred = await readCredential();
  const salt = cred?.salt || await generateSalt();
  const newHash = await hashPersonalSecret(preparedSecret, salt);

  const credential: PersonalCredential = {
    version: PERSONAL_CREDENTIAL_VERSION,
    salt,
    hash: newHash,
    patternHash: cred?.patternHash,
    recoveryKeyHash: cred?.recoveryKeyHash,
    recoveryKeyPlain: cred?.recoveryKeyPlain,
    fingerprintEnabled: cred?.fingerprintEnabled,
    defaultMethod: cred?.defaultMethod ?? 'password',
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: nowIso(),
  };

  await writeCredential(credential);
  await ensureAppDirectories('personal');
}

export async function setPersonalPattern(patternStr: string): Promise<void> {
  if (patternStr.length < 4) {
    throw new Error('图案密码至少需要连接 4 个点。');
  }

  const cred = await readCredential();
  const salt = cred?.salt || await generateSalt();
  const newHash = await hashPersonalSecret(patternStr, salt);

  const credential: PersonalCredential = {
    version: PERSONAL_CREDENTIAL_VERSION,
    salt,
    hash: cred?.hash,
    patternHash: newHash,
    recoveryKeyHash: cred?.recoveryKeyHash,
    recoveryKeyPlain: cred?.recoveryKeyPlain,
    fingerprintEnabled: cred?.fingerprintEnabled,
    defaultMethod: cred?.hash ? (cred.defaultMethod ?? 'pattern') : 'pattern',
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: nowIso(),
  };

  await writeCredential(credential);
  await ensureAppDirectories('personal');
}

export async function setPersonalFingerprintEnabled(enabled: boolean): Promise<void> {
  const cred = await readCredential();
  if (!cred) throw new Error('请先设置隐私系统密码。');
  
  await writeCredential({
    ...cred,
    fingerprintEnabled: enabled,
    updatedAt: nowIso(),
  });
}

export async function enrollPersonalBiometric(): Promise<void> {
  const cred = await readCredential();
  if (!cred) throw new Error('请先设置隐私系统密码。');

  if (Platform.OS === 'android') {
    // enrollNativeBiometricKey 在原生方法不存在时会自动降级到 expo-local-authentication
    await enrollNativeBiometricKey();
  } else {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: '验证生物识别以开启解锁',
      fallbackLabel: '使用密码',
      disableDeviceFallback: true,
    });
    if (!res.success) {
      throw new Error(res.error === 'user_cancel' ? '已取消指纹验证' : '生物识别验证未通过');
    }
  }

  await setPersonalFingerprintEnabled(true);
}

/** 当前设备/APK 是否支持硬件 Keystore 生物识别绑定（即原生 enrollBiometricKey 方法已部署） */
export function isPersonalBiometricHardwareBound(): boolean {
  return hasNativeBiometricKeySupport();
}

export async function authenticatePersonalBiometric(
  promptTitle = '验证指纹进入隐私空间'
): Promise<{ ok: boolean; errorCode?: string; message?: string }> {
  const cred = await readCredential();
  if (!cred || !cred.fingerprintEnabled) {
    return { ok: false, errorCode: 'BIOMETRIC_DISABLED', message: '未开启指纹解锁。' };
  }
  if (isLocked(cred)) {
    emitLockStatus(cred);
    return { ok: false, errorCode: 'PERSONAL_LOCKED', message: '密码错误次数过多，隐私系统已暂时锁定。' };
  }

  if (Platform.OS === 'android') {
    try {
      const ok = await verifyNativeBiometricKey(promptTitle);
      return ok ? { ok: true } : { ok: false, errorCode: 'BIOMETRIC_FAILED', message: '指纹验证未通过' };
    } catch (error) {
      const code = (error as { code?: string } | null)?.code || '';
      const rawMessage = error instanceof Error ? error.message : '指纹验证失败';
      if (code === 'BIOMETRIC_ENROLLMENT_CHANGED' || code === 'BIOMETRIC_KEY_MISSING') {
        await setPersonalFingerprintEnabled(false).catch(() => undefined);
        return {
          ok: false,
          errorCode: code,
          message:
            code === 'BIOMETRIC_ENROLLMENT_CHANGED'
              ? '检测到手机指纹已变更，已自动关闭指纹解锁，请先用隐私密码解锁。'
              : '安全升级：请先用隐私密码解锁并在设置中重新开启指纹解锁。',
        };
      }
      if (code === 'BIOMETRIC_CANCELLED') {
        return { ok: false, errorCode: 'user_cancel', message: '已取消验证' };
      }
      if (code === 'BIOMETRIC_LOCKOUT') {
        return { ok: false, errorCode: 'lockout', message: '系统指纹尝试次数过多，请改用隐私密码解锁。' };
      }
      return { ok: false, errorCode: code || 'BIOMETRIC_FAILED', message: rawMessage };
    }
  }

  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: promptTitle,
    fallbackLabel: '使用密码',
    disableDeviceFallback: true,
  });
  if (res.success) {
    return { ok: true };
  }
  return {
    ok: false,
    errorCode: res.error || 'BIOMETRIC_FAILED',
    message: res.error === 'user_cancel' ? '已取消验证' : '指纹/面容验证未通过',
  };
}

export async function setDefaultUnlockMethod(method: 'password' | 'pattern'): Promise<void> {
  const cred = await readCredential();
  if (!cred) throw new Error('请先设置隐私系统密码。');
  if (method === 'password' && !cred.hash) {
    throw new Error('未设置数字/字母密码，无法设为默认解锁方式。');
  }
  if (method === 'pattern' && !cred.patternHash) {
    throw new Error('未设置图案密码，无法设为默认解锁方式。');
  }
  
  await writeCredential({
    ...cred,
    defaultMethod: method,
    updatedAt: nowIso(),
  });
}

export async function verifyPersonalPassword(secret: string): Promise<PersonalVerificationResult> {
  const rawCredential = await readCredential();
  if (!rawCredential) {
    return {
      ok: false,
      lockedUntil: null,
      remainingAttempts: MAX_PERSONAL_UNLOCK_FAILURES,
      message: '请先设置隐私系统密码。',
    };
  }

  if (isLocked(rawCredential)) {
    emitLockStatus(rawCredential);
    return {
      ok: false,
      lockedUntil: rawCredential.lockedUntil,
      remainingAttempts: 0,
      message: '密码错误次数过多，隐私系统已暂时锁定。',
    };
  }

  const credential: PersonalCredential =
    rawCredential.lockedUntil != null || rawCredential.failedAttempts >= MAX_PERSONAL_UNLOCK_FAILURES
      ? { ...rawCredential, failedAttempts: 0, lockedUntil: null }
      : rawCredential;

  if (credential.version !== PERSONAL_CREDENTIAL_VERSION) {
    return {
      ok: false,
      lockedUntil: null,
      remainingAttempts: MAX_PERSONAL_UNLOCK_FAILURES,
      message: '隐私密码格式已更新，请重置隐私空间密码。',
    };
  }

  if (secret === '__BIOMETRIC_PASSTHROUGH__') {
    if (credential.fingerprintEnabled) {
      await writeCredential({
        ...credential,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: nowIso(),
      });
      return {
        ok: true,
        lockedUntil: null,
        remainingAttempts: MAX_PERSONAL_UNLOCK_FAILURES,
        message: null,
      };
    } else {
      return {
        ok: false,
        lockedUntil: null,
        remainingAttempts: MAX_PERSONAL_UNLOCK_FAILURES,
        message: '未开启指纹解锁。',
      };
    }
  }

  const nextHash = await hashPersonalSecret(secret.trim(), credential.salt);
  if ((credential.hash && nextHash === credential.hash) || 
      (credential.patternHash && nextHash === credential.patternHash)) {
    await writeCredential({
      ...credential,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: nowIso(),
    });
    return {
      ok: true,
      lockedUntil: null,
      remainingAttempts: MAX_PERSONAL_UNLOCK_FAILURES,
      message: null,
    };
  }

  const failedAttempts = credential.failedAttempts + 1;
  const lockedUntil =
    failedAttempts >= MAX_PERSONAL_UNLOCK_FAILURES ? new Date(Date.now() + PERSONAL_LOCK_MS).toISOString() : null;
  await writeCredential({
    ...credential,
    failedAttempts,
    lockedUntil,
    updatedAt: nowIso(),
  });

  return {
    ok: false,
    lockedUntil,
    remainingAttempts: Math.max(0, MAX_PERSONAL_UNLOCK_FAILURES - failedAttempts),
    message: lockedUntil ? '密码错误次数过多，隐私系统已暂时锁定。' : '密码不正确。',
  };
}

export async function changePersonalPassword(currentSecret: string, nextSecret: string, method: 'password' | 'pattern' = 'password'): Promise<void> {
  const verified = await verifyPersonalPassword(currentSecret);
  if (!verified.ok) {
    throw new Error(verified.message ?? '原密码不正确。');
  }

  if (method === 'pattern') {
    await setPersonalPattern(nextSecret);
  } else {
    await setPersonalPassword(nextSecret);
  }
}

async function deleteDirectoryIfExists(directoryUri: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(directoryUri);
  if (info.exists) {
    await FileSystem.deleteAsync(directoryUri, { idempotent: true });
  }
}

export async function resetPersonalSystemData(): Promise<void> {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(PERSONAL_CREDENTIAL_KEY),
    SecureStore.deleteItemAsync(PERSONAL_BACKGROUND_LOCK_TIMEOUT_KEY),
  ]);
  await resetDatabaseSpaceCache('personal');

  const cleanupPaths: string[] = [];
  try {
    cleanupPaths.push(getStorageRootDir('personal'));
  } catch {}
  try {
    cleanupPaths.push(getOriginalsDir('personal'));
    cleanupPaths.push(getThumbnailsDir('personal'));
    cleanupPaths.push(getTempDir('personal'));
    cleanupPaths.push(getExportsDir('personal'));
  } catch {}
  if (FileSystem.documentDirectory) {
    cleanupPaths.push(`${FileSystem.documentDirectory}voice_cache/personal/`);
    cleanupPaths.push(`${FileSystem.documentDirectory}pixory_global_search_history_personal.json`);
  }

  await Promise.allSettled([
    ...cleanupPaths.map((targetPath) => deleteDirectoryIfExists(targetPath)),
    deleteDatabaseAsync(PERSONAL_DATABASE_NAME),
    Image.clearMemoryCache(),
    Image.clearDiskCache(),
  ]);
  emitLockStatus(null);
}


export function generateRecoveryKeyRaw(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = '';
  for (let i = 0; i < 6; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

export async function generateAndSetRecoveryKey(customKey?: string): Promise<string> {
  let credential = await readCredential();
  if (!credential) throw new Error('隐私密码尚未设置');
  
  const rawKey = customKey ? customKey.toUpperCase() : generateRecoveryKeyRaw();
  const hash = await hashPersonalSecret(rawKey, credential.salt);
  
  credential.recoveryKeyHash = hash;
  credential.recoveryKeyPlain = rawKey;
  await writeCredential(credential);
  return rawKey;
}

export async function getPersonalRecoveryKeyPlain(): Promise<string | null> {
  const credential = await readCredential();
  return credential?.recoveryKeyPlain || null;
}

export async function verifyRecoveryKey(recoveryKey: string): Promise<boolean> {
  const rawCredential = await readCredential();
  if (!rawCredential || !rawCredential.recoveryKeyHash) return false;

  if (isLocked(rawCredential)) {
    emitLockStatus(rawCredential);
    throw new Error('密码错误次数过多，隐私系统已暂时锁定。');
  }

  const credential: PersonalCredential =
    rawCredential.lockedUntil != null || rawCredential.failedAttempts >= MAX_PERSONAL_UNLOCK_FAILURES
      ? { ...rawCredential, failedAttempts: 0, lockedUntil: null }
      : rawCredential;

  const cleanKey = recoveryKey.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const inputHash = await hashPersonalSecret(cleanKey, credential.salt);
  if (inputHash === credential.recoveryKeyHash) {
    credential.failedAttempts = 0;
    credential.lockedUntil = null;
    await writeCredential(credential);
    return true;
  } else {
    credential.failedAttempts += 1;
    if (credential.failedAttempts >= MAX_PERSONAL_UNLOCK_FAILURES) {
      credential.lockedUntil = new Date(Date.now() + PERSONAL_LOCK_MS).toISOString();
    }
    await writeCredential(credential);
    return false;
  }
}

export async function resetPasswordWithRecoveryKey(
  recoveryKey: string,
  newSecret: string,
  method: 'password' | 'pattern' = 'pattern'
): Promise<void> {
  const verified = await verifyRecoveryKey(recoveryKey);
  if (!verified) {
    throw new Error('恢复密钥不正确。');
  }
  await forceResetPersonalPassword(newSecret, method);
}

export async function forceResetPersonalPassword(newSecret: string, method: 'password' | 'pattern' = 'password'): Promise<void> {
  const credential = await readCredential();
  if (!credential) throw new Error('隐私密码尚未设置');
  
  const hash = await hashPersonalSecret(newSecret, credential.salt);
  if (method === 'pattern') {
    credential.patternHash = hash;
    credential.hash = undefined;
    credential.defaultMethod = 'pattern';
  } else {
    credential.hash = hash;
    credential.patternHash = undefined;
    credential.defaultMethod = 'password';
  }
  
  credential.failedAttempts = 0;
  credential.lockedUntil = null;
  credential.updatedAt = nowIso();
  
  await writeCredential(credential);
}
