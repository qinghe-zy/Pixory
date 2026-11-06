import type { SQLiteDatabase } from 'expo-sqlite';
import type { PixorySpace } from '../database';
import type { ResolvedVoiceProfile, VoicePresetRecord, VoiceScopeType } from './types';
import { voiceRepository } from '../database/repositories/voiceRepository';
import { getDefaultVoicePreset, getDefaultNativePreset } from './builtinPresets';

export interface ResolveVoiceProfileContext {
  scopeType?: 'thread_long' | 'thread_im';
  threadId?: string | null;
  roleCardId?: string | null;
}

export async function resolveVoiceProfile(
  db: SQLiteDatabase,
  space: PixorySpace,
  context: ResolveVoiceProfileContext
): Promise<ResolvedVoiceProfile> {
  // 1. 查询会话级覆盖 (thread_long 或 thread_im)
  const threadBinding = (context.scopeType && context.threadId)
    ? await voiceRepository.getBinding(db, context.scopeType, context.threadId)
    : null;

  // 2. 查询角色卡级覆盖
  const roleBinding = context.roleCardId
    ? await voiceRepository.getBinding(db, 'role', context.roleCardId)
    : null;

  // 3. 查询全局配置
  const globalBinding = await voiceRepository.getBinding(db, 'global', '*');

  // 解析目标 presetId
  let targetPresetId: string | null = null;
  let sourceScope: VoiceScopeType = 'global';

  if (threadBinding?.presetId) {
    targetPresetId = threadBinding.presetId;
    sourceScope = context.scopeType ?? 'thread_long';
  } else if (roleBinding?.presetId) {
    targetPresetId = roleBinding.presetId;
    sourceScope = 'role';
  } else if (globalBinding?.presetId) {
    targetPresetId = globalBinding.presetId;
    sourceScope = 'global';
  }

  // 加载预设实体
  let preset: VoicePresetRecord | null = null;
  if (targetPresetId) {
    preset = await voiceRepository.getPresetById(db, targetPresetId);
  }

  // 兜底为系统默认预设
  if (!preset) {
    preset = getDefaultVoicePreset();
  }

  // 计算多级覆盖合并后的实际参数
  const effectiveRate =
    threadBinding?.rateOverride ??
    roleBinding?.rateOverride ??
    globalBinding?.rateOverride ??
    preset.rate ??
    1.0;

  const effectivePitch =
    threadBinding?.pitchOverride ??
    roleBinding?.pitchOverride ??
    globalBinding?.pitchOverride ??
    preset.pitch ??
    0.0;

  const voiceBubbleEnabled =
    threadBinding?.voiceBubbleEnabled ??
    roleBinding?.voiceBubbleEnabled ??
    globalBinding?.voiceBubbleEnabled ??
    true;

  const autoReadEnabled =
    threadBinding?.autoReadEnabled ??
    roleBinding?.autoReadEnabled ??
    globalBinding?.autoReadEnabled ??
    false;

  // Personal 空间防护：若为 Personal 空间且预设为云端模型，降级为系统本地离线预设
  if (space === 'personal' && preset.engineKind !== 'native') {
    const nativePreset = getDefaultNativePreset();
    return {
      preset: nativePreset,
      effectiveRate,
      effectivePitch: 0.0,
      effectiveStyle: null,
      voiceBubbleEnabled,
      autoReadEnabled,
      sourceScope,
    };
  }

  return {
    preset,
    effectiveRate: Number(effectiveRate.toFixed(2)),
    effectivePitch: Number(effectivePitch.toFixed(1)),
    effectiveStyle: preset.style,
    voiceBubbleEnabled,
    autoReadEnabled,
    sourceScope,
  };
}
