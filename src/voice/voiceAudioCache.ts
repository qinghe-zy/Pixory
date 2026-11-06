import * as FileSystem from 'expo-file-system/legacy';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { PixorySpace } from '../database';
import type { VoiceAudioCacheRecord, VoicePresetRecord } from './types';

export function getVoiceCacheDirectory(space: PixorySpace): string {
  const base = FileSystem.documentDirectory || '';
  return `${base}voice_cache/${space}/`;
}

export async function ensureVoiceCacheDirectory(space: PixorySpace): Promise<string> {
  const dir = getVoiceCacheDirectory(space);
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

export function buildVoiceCacheKey(
  text: string,
  preset: VoicePresetRecord,
  effectiveRate: number,
  effectivePitch: number,
  effectiveStyle?: string | null
): string {
  const payload = [
    text.trim(),
    preset.engineKind,
    preset.model || '',
    preset.voiceId,
    effectiveRate.toFixed(2),
    effectivePitch.toFixed(1),
    effectiveStyle || '',
  ].join('\u001F');

  return bytesToHex(sha256(new TextEncoder().encode(payload)));
}

export async function getCachedAudioRecord(
  db: SQLiteDatabase,
  cacheKey: string
): Promise<VoiceAudioCacheRecord | null> {
  const row = await db.getFirstAsync<{
    cache_key: string;
    file_path: string;
    duration_ms: number;
    byte_size: number;
    engine_kind: string;
    created_at: string;
    last_used_at: string;
  }>(
    'SELECT * FROM voice_audio_cache WHERE cache_key = ?',
    [cacheKey]
  );

  if (!row) return null;

  // 物理检查文件是否存在
  const fileInfo = await FileSystem.getInfoAsync(row.file_path);
  if (!fileInfo.exists) {
    // 物理文件已被删除或丢失，清理索引
    await db.runAsync('DELETE FROM voice_audio_cache WHERE cache_key = ?', [cacheKey]);
    return null;
  }

  // 延展最后使用时间
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE voice_audio_cache SET last_used_at = ? WHERE cache_key = ?',
    [now, cacheKey]
  );

  return {
    cacheKey: row.cache_key,
    filePath: row.file_path,
    durationMs: row.duration_ms,
    byteSize: row.byte_size,
    engineKind: row.engine_kind as any,
    createdAt: row.created_at,
    lastUsedAt: now,
  };
}

export async function saveCachedAudioRecord(
  db: SQLiteDatabase,
  record: VoiceAudioCacheRecord
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO voice_audio_cache
     (cache_key, file_path, duration_ms, byte_size, engine_kind, created_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      record.cacheKey,
      record.filePath,
      record.durationMs,
      record.byteSize,
      record.engineKind,
      record.createdAt,
      record.lastUsedAt,
    ]
  );
}

export async function getVoiceCacheStats(
  db: SQLiteDatabase
): Promise<{ count: number; totalBytes: number }> {
  const row = await db.getFirstAsync<{ count: number; totalBytes: number | null }>(
    'SELECT COUNT(*) as count, SUM(byte_size) as totalBytes FROM voice_audio_cache'
  );
  return {
    count: row?.count ?? 0,
    totalBytes: row?.totalBytes ?? 0,
  };
}

export async function clearVoiceCache(
  db: SQLiteDatabase,
  space: PixorySpace
): Promise<void> {
  const dir = getVoiceCacheDirectory(space);
  try {
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(dir, { idempotent: true });
    }
    await ensureVoiceCacheDirectory(space);
  } catch {
    // 忽略文件系统清理容错
  }

  await db.runAsync('DELETE FROM voice_audio_cache');
}
