import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { deleteDatabaseAsync } from 'expo-sqlite';

import { PERSONAL_DATABASE_NAME, resetDatabaseSpaceCache } from '../database';
import { ensureAppDirectories, getExportsDir, getOriginalsDir, getTempDir, getThumbnailsDir } from './fileStorageService';

export const PERSONAL_CREDENTIAL_KEY = 'pixory.personal.credential.v1';
export const MAX_PERSONAL_UNLOCK_FAILURES = 5;
const PERSONAL_CREDENTIAL_VERSION = 4;
const PERSONAL_LOCK_MS = 5 * 60 * 1000;

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
  return {
    hasCredential: true,
    hasPassword: !!cred.hash,
    hasPattern: !!cred.patternHash,
    fingerprintEnabled: cred.fingerprintEnabled ?? false,
    defaultMethod: cred.defaultMethod || 'password',
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
    fingerprintEnabled: cred?.fingerprintEnabled,
    defaultMethod: cred?.defaultMethod ?? 'pattern',
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

export async function setDefaultUnlockMethod(method: 'password' | 'pattern'): Promise<void> {
  const cred = await readCredential();
  if (!cred) throw new Error('请先设置隐私系统密码。');
  
  await writeCredential({
    ...cred,
    defaultMethod: method,
    updatedAt: nowIso(),
  });
}

export async function verifyPersonalPassword(secret: string): Promise<PersonalVerificationResult> {
  const credential = await readCredential();
  if (!credential) {
    return {
      ok: false,
      lockedUntil: null,
      remainingAttempts: MAX_PERSONAL_UNLOCK_FAILURES,
      message: '请先设置隐私系统密码。',
    };
  }

  if (isLocked(credential)) {
    return {
      ok: false,
      lockedUntil: credential.lockedUntil,
      remainingAttempts: 0,
      message: '隐私系统已暂时锁定，请稍后再试。',
    };
  }

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
  await SecureStore.deleteItemAsync(PERSONAL_CREDENTIAL_KEY);
  await resetDatabaseSpaceCache('personal');
  await Promise.allSettled([
    deleteDirectoryIfExists(getOriginalsDir('personal')),
    deleteDirectoryIfExists(getThumbnailsDir('personal')),
    deleteDirectoryIfExists(getTempDir('personal')),
    deleteDirectoryIfExists(getExportsDir('personal')),
    deleteDatabaseAsync(PERSONAL_DATABASE_NAME),
  ]);
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
  const credential = await readCredential();
  if (!credential || !credential.recoveryKeyHash) return false;
  
  if (isLocked(credential)) {
    throw new Error('输入错误次数过多，已被锁定');
  }
  
  const inputHash = await hashPersonalSecret(recoveryKey, credential.salt);
  if (inputHash === credential.recoveryKeyHash) {
    credential.failedAttempts = 0;
    credential.lockedUntil = null;
    await writeCredential(credential);
    return true;
  } else {
    credential.failedAttempts += 1;
    if (credential.failedAttempts >= MAX_PERSONAL_UNLOCK_FAILURES) {
      credential.lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    }
    await writeCredential(credential);
    return false;
  }
}

export async function forceResetPersonalPassword(newSecret: string, method: 'password' | 'pattern' = 'password'): Promise<void> {
  const credential = await readCredential();
  if (!credential) throw new Error('隐私密码尚未设置');
  
  const hash = await hashPersonalSecret(newSecret, credential.salt);
  if (method === 'pattern') {
    credential.patternHash = hash;
    credential.defaultMethod = 'pattern';
  } else {
    credential.hash = hash;
    credential.defaultMethod = 'password';
  }
  
  credential.failedAttempts = 0;
  credential.lockedUntil = null;
  credential.updatedAt = nowIso();
  
  await writeCredential(credential);
}
