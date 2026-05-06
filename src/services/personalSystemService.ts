import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { deleteDatabaseAsync } from 'expo-sqlite';

import { PERSONAL_DATABASE_NAME, resetDatabaseSpaceCache } from '../database';
import { ensureAppDirectories, getExportsDir, getOriginalsDir, getTempDir, getThumbnailsDir } from './fileStorageService';

export const PERSONAL_CREDENTIAL_KEY = 'pixory.personal.credential.v1';
export const MAX_PERSONAL_UNLOCK_FAILURES = 5;
const PERSONAL_CREDENTIAL_VERSION = 2;
const PERSONAL_LOCK_MS = 5 * 60 * 1000;

interface PersonalCredential {
  version: number;
  salt: string;
  hash: string;
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

  return JSON.parse(rawValue) as PersonalCredential;
}

async function writeCredential(credential: PersonalCredential): Promise<void> {
  await SecureStore.setItemAsync(PERSONAL_CREDENTIAL_KEY, JSON.stringify(credential));
}

export async function hasPersonalPassword(): Promise<boolean> {
  return Boolean(await readCredential());
}

export async function setPersonalPassword(secret: string): Promise<void> {
  const preparedSecret = secret.trim();
  if (preparedSecret.length < 4) {
    throw new Error('隐私系统密码至少需要 4 位。');
  }

  const salt = await generateSalt();
  const credential: PersonalCredential = {
    version: PERSONAL_CREDENTIAL_VERSION,
    salt,
    hash: await hashPersonalSecret(preparedSecret, salt),
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: nowIso(),
  };

  await writeCredential(credential);
  await ensureAppDirectories('personal');
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

  const nextHash = await hashPersonalSecret(secret.trim(), credential.salt);
  if (nextHash === credential.hash) {
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

export async function changePersonalPassword(currentSecret: string, nextSecret: string): Promise<void> {
  const verified = await verifyPersonalPassword(currentSecret);
  if (!verified.ok) {
    throw new Error(verified.message ?? '原密码不正确。');
  }

  await setPersonalPassword(nextSecret);
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
