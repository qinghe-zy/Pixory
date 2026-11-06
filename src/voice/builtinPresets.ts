import type { VoicePresetRecord } from './types';

export const BUILTIN_VOICE_PRESETS: VoicePresetRecord[] = [
  // 小米官方 MiMo-v2.5-TTS 高清声学预设 (国内直连、极速低延迟、高保真细腻人声)
  {
    id: 'mimo-bingtang',
    name: '冰糖·清澈甜美 (小米MiMo)',
    engineKind: 'openai_compat',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.5-tts',
    voiceId: '冰糖',
    rate: 1.0,
    pitch: 0.0,
    style: '年轻女声 · 清澈甜美',
    isBuiltin: true,
    createdAt: '2026-11-06T00:00:00.000Z',
    updatedAt: '2026-11-06T00:00:00.000Z',
  },
  {
    id: 'mimo-moli',
    name: '茉莉·温柔知性 (小米MiMo)',
    engineKind: 'openai_compat',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.5-tts',
    voiceId: '茉莉',
    rate: 1.0,
    pitch: 0.0,
    style: '成熟女声 · 温柔知性',
    isBuiltin: true,
    createdAt: '2026-11-06T00:00:00.000Z',
    updatedAt: '2026-11-06T00:00:00.000Z',
  },
  {
    id: 'mimo-suda',
    name: '苏打·阳光活力 (小米MiMo)',
    engineKind: 'openai_compat',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.5-tts',
    voiceId: '苏打',
    rate: 1.0,
    pitch: 0.0,
    style: '青年男声 · 阳光活力',
    isBuiltin: true,
    createdAt: '2026-11-06T00:00:00.000Z',
    updatedAt: '2026-11-06T00:00:00.000Z',
  },
  {
    id: 'mimo-baihua',
    name: '白桦·沉稳磁性 (小米MiMo)',
    engineKind: 'openai_compat',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.5-tts',
    voiceId: '白桦',
    rate: 1.0,
    pitch: 0.0,
    style: '成熟男声 · 沉稳磁性',
    isBuiltin: true,
    createdAt: '2026-11-06T00:00:00.000Z',
    updatedAt: '2026-11-06T00:00:00.000Z',
  },
];

export const DEFAULT_VOICE_PRESET_ID = 'mimo-bingtang';

export function getBuiltinPreset(id: string): VoicePresetRecord | undefined {
  return BUILTIN_VOICE_PRESETS.find(p => p.id === id);
}

export function getDefaultVoicePreset(): VoicePresetRecord {
  return BUILTIN_VOICE_PRESETS[0];
}

export const NATIVE_OFFLINE_PRESET: VoicePresetRecord = {
  id: 'native-system',
  name: '本机系统朗读 (离线零延迟)',
  engineKind: 'native',
  voiceId: 'native-default',
  rate: 1.0,
  pitch: 0.0,
  style: 'Android 系统默认语音',
  isBuiltin: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export function getDefaultNativePreset(): VoicePresetRecord {
  return NATIVE_OFFLINE_PRESET;
}
