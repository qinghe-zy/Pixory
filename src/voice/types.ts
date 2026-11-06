import type { PixorySpace } from '../database';

export type VoiceEngineKind = 'openai_compat' | 'builtin_free' | 'native';

export type VoiceScopeType = 'global' | 'role' | 'thread_long' | 'thread_im';

export interface VoicePresetRecord {
  id: string;
  name: string;
  engineKind: VoiceEngineKind;
  baseUrl?: string | null;
  model?: string | null;
  voiceId: string;
  rate: number; // 0.5 ~ 2.0, 默认 1.0
  pitch: number; // -50.0 ~ +50.0 (%), 默认 0.0
  style?: string | null;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceBindingRecord {
  scopeType: VoiceScopeType;
  scopeId: string; // global 为 '*'，role 为 roleCardId，thread 为 threadId
  presetId: string | null; // null 表示跟随上一级
  rateOverride?: number | null;
  pitchOverride?: number | null;
  voiceBubbleEnabled?: boolean | null; // 伴聊是否发送语音条 (null = 跟随上一级)
  autoReadEnabled?: boolean | null; // 是否在 AI 回复完自动朗读
  updatedAt: string;
}

export interface ResolvedVoiceProfile {
  preset: VoicePresetRecord;
  effectiveRate: number;
  effectivePitch: number;
  effectiveStyle?: string | null;
  voiceBubbleEnabled: boolean;
  autoReadEnabled: boolean;
  sourceScope: VoiceScopeType;
}

export interface VoiceAudioCacheRecord {
  cacheKey: string;
  filePath: string;
  durationMs: number;
  byteSize: number;
  engineKind: VoiceEngineKind;
  createdAt: string;
  lastUsedAt: string;
}

export interface TtsSynthesisRequest {
  text: string;
  outputPath: string;
  voiceId: string;
  rate: number;
  pitch: number;
  style?: string | null;
  timeoutMs: number;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  space?: PixorySpace;
}

export interface TtsSynthesisResult {
  filePath: string;
  durationMs: number;
  byteSize: number;
  engineUsed: VoiceEngineKind;
}

export interface VoiceEngineCapabilities {
  supportsPitch: boolean;
  supportsSpeed: boolean;
  supportedStyles: string[];
  voiceListType: 'remote' | 'fixed_preset' | 'manual_id';
}

export interface VoiceTtsCapabilities {
  available: boolean;
  languageAvailable: boolean;
  voicesCount: number;
  enginePackage?: string;
}
