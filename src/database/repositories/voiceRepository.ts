import type { SQLiteDatabase } from 'expo-sqlite';
import type { VoicePresetRecord, VoiceBindingRecord, VoiceScopeType } from '../../voice/types';
import { BUILTIN_VOICE_PRESETS, getBuiltinPreset, NATIVE_OFFLINE_PRESET } from '../../voice/builtinPresets';

export const voiceRepository = {
  async listPresets(db: SQLiteDatabase, includeBuiltin = true): Promise<VoicePresetRecord[]> {
    // 自动清理历史版本遗留在 SQLite 中的废弃 Edge-TTS 内置预设 (id LIKE 'builtin-%' 或 engine_kind = 'builtin_free')
    await db.runAsync("DELETE FROM voice_presets WHERE id LIKE 'builtin-%' OR engine_kind = 'builtin_free'").catch(() => {});

    const rows = await db.getAllAsync<{
      id: string;
      name: string;
      engine_kind: string;
      base_url: string | null;
      model: string | null;
      voice_id: string;
      rate: number;
      pitch: number;
      style: string | null;
      is_builtin: number;
      created_at: string;
      updated_at: string;
    }>("SELECT * FROM voice_presets WHERE id NOT LIKE 'builtin-%' AND engine_kind != 'builtin_free' ORDER BY created_at ASC");

    const customPresets: VoicePresetRecord[] = rows.map(r => ({
      id: r.id,
      name: r.name,
      engineKind: r.engine_kind as any,
      baseUrl: r.base_url,
      model: r.model,
      voiceId: r.voice_id,
      rate: r.rate,
      pitch: r.pitch,
      style: r.style,
      isBuiltin: Boolean(r.is_builtin),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    if (!includeBuiltin) return customPresets;

    // 内置调好的声学预设排在前面
    return [...BUILTIN_VOICE_PRESETS, ...customPresets];
  },

  async getPresetById(db: SQLiteDatabase, id: string): Promise<VoicePresetRecord | null> {
    if (id === 'native-system' || id === 'builtin-native-system') return NATIVE_OFFLINE_PRESET;
    const builtin = getBuiltinPreset(id);
    if (builtin) return builtin;

    const row = await db.getFirstAsync<{
      id: string;
      name: string;
      engine_kind: string;
      base_url: string | null;
      model: string | null;
      voice_id: string;
      rate: number;
      pitch: number;
      style: string | null;
      is_builtin: number;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM voice_presets WHERE id = ?', [id]);

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      engineKind: row.engine_kind as any,
      baseUrl: row.base_url,
      model: row.model,
      voiceId: row.voice_id,
      rate: row.rate,
      pitch: row.pitch,
      style: row.style,
      isBuiltin: Boolean(row.is_builtin),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  async upsertPreset(db: SQLiteDatabase, preset: VoicePresetRecord): Promise<void> {
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT OR REPLACE INTO voice_presets
       (id, name, engine_kind, base_url, model, voice_id, rate, pitch, style, is_builtin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        preset.id,
        preset.name.trim(),
        preset.engineKind,
        preset.baseUrl ?? null,
        preset.model ?? null,
        preset.voiceId.trim(),
        preset.rate ?? 1.0,
        preset.pitch ?? 0.0,
        preset.style ?? null,
        preset.isBuiltin ? 1 : 0,
        preset.createdAt || now,
        now,
      ]
    );
  },

  async deletePreset(db: SQLiteDatabase, id: string): Promise<boolean> {
    // 内置预设不可删除
    if (getBuiltinPreset(id)) return false;

    // 清理该预设在 bindings 中的悬挂引用（回退为上一级）
    await db.runAsync('UPDATE voice_bindings SET preset_id = NULL WHERE preset_id = ?', [id]);
    await db.runAsync('DELETE FROM voice_presets WHERE id = ?', [id]);
    return true;
  },

  async getBinding(
    db: SQLiteDatabase,
    scopeType: VoiceScopeType,
    scopeId: string
  ): Promise<VoiceBindingRecord | null> {
    const row = await db.getFirstAsync<{
      scope_type: string;
      scope_id: string;
      preset_id: string | null;
      rate_override: number | null;
      pitch_override: number | null;
      voice_bubble_enabled: number | null;
      auto_read_enabled: number | null;
      updated_at: string;
    }>('SELECT * FROM voice_bindings WHERE scope_type = ? AND scope_id = ?', [scopeType, scopeId]);

    if (!row) return null;

    return {
      scopeType: row.scope_type as any,
      scopeId: row.scope_id,
      presetId: row.preset_id,
      rateOverride: row.rate_override,
      pitchOverride: row.pitch_override,
      voiceBubbleEnabled: row.voice_bubble_enabled === null ? null : Boolean(row.voice_bubble_enabled),
      autoReadEnabled: row.auto_read_enabled === null ? null : Boolean(row.auto_read_enabled),
      updatedAt: row.updated_at,
    };
  },

  async setBinding(db: SQLiteDatabase, binding: VoiceBindingRecord): Promise<void> {
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT OR REPLACE INTO voice_bindings
       (scope_type, scope_id, preset_id, rate_override, pitch_override, voice_bubble_enabled, auto_read_enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        binding.scopeType,
        binding.scopeId,
        binding.presetId,
        binding.rateOverride ?? null,
        binding.pitchOverride ?? null,
        binding.voiceBubbleEnabled === null || binding.voiceBubbleEnabled === undefined
          ? null
          : binding.voiceBubbleEnabled ? 1 : 0,
        binding.autoReadEnabled === null || binding.autoReadEnabled === undefined
          ? null
          : binding.autoReadEnabled ? 1 : 0,
        now,
      ]
    );
  },

  async clearBinding(db: SQLiteDatabase, scopeType: VoiceScopeType, scopeId: string): Promise<void> {
    await db.runAsync(
      'DELETE FROM voice_bindings WHERE scope_type = ? AND scope_id = ?',
      [scopeType, scopeId]
    );
  },
};
