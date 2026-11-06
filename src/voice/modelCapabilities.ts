import type { VoiceEngineCapabilities, VoiceEngineKind } from './types';

export function getEngineCapabilities(engineKind: VoiceEngineKind, model?: string | null): VoiceEngineCapabilities {
  const normalizedModel = (model ?? '').toLowerCase();

  if (engineKind === 'openai_compat') {
    // 官方 OpenAI tts-1 / tts-1-hd 仅支持 speed (0.25 - 4.0)，不支持 pitch 和 style
    if (normalizedModel.startsWith('tts-1')) {
      return {
        supportsPitch: false,
        supportsSpeed: true,
        supportedStyles: [],
        voiceListType: 'fixed_preset',
      };
    }
    // MiniMax speech 支持 speed 与 emotion
    if (normalizedModel.includes('minimax') || normalizedModel.includes('speech-01')) {
      return {
        supportsPitch: false,
        supportsSpeed: true,
        supportedStyles: ['neutral', 'happy', 'sad', 'angry'],
        voiceListType: 'manual_id',
      };
    }
    // 通用 OpenAI 兼容协议中转
    return {
      supportsPitch: true,
      supportsSpeed: true,
      supportedStyles: [],
      voiceListType: 'manual_id',
    };
  }

  if (engineKind === 'builtin_free') {
    // 微软 Edge-TTS：完整支持 rate, pitch, style
    return {
      supportsPitch: true,
      supportsSpeed: true,
      supportedStyles: ['empathic', 'cheerful', 'calm', 'whispering', 'affectionate'],
      voiceListType: 'fixed_preset',
    };
  }

  // Android 本地系统 TTS：支持 rate, pitch，不支持情绪风格
  return {
    supportsPitch: true,
    supportsSpeed: true,
    supportedStyles: [],
    voiceListType: 'fixed_preset',
  };
}
