import type { TtsEngine } from './TtsEngine';
import type { TtsSynthesisRequest, TtsSynthesisResult } from '../types';
import { synthesizeNativeTtsToFile } from '../../native/pixoryMediaModule';

const STAGE_ACTION_STRIP_REGEX = /[（\(][^）\)]+[）\)]/g;

export class NativeTtsEngine implements TtsEngine {
  readonly kind = 'native' as const;

  async synthesizeToFile(request: TtsSynthesisRequest): Promise<TtsSynthesisResult> {
    const rawText = request.ttsScript?.trim() || request.text;
    // 原生离线引擎不支持副语言标记，彻底剥离括号舞台动作与拟声词避免机械读出括号文字
    const cleanText = rawText.replace(STAGE_ACTION_STRIP_REGEX, '').trim() || rawText;

    const result = await synthesizeNativeTtsToFile(
      cleanText,
      request.rate || 1.0,
      request.pitch || 0.0,
      request.outputPath
    );

    // 基于文本长度与语速合理估算音频毫秒数 (中文平均单字 240ms)
    const charCount = Math.max(1, cleanText.trim().length);
    const estimatedDurationMs = Math.max(
      1000,
      Math.round((charCount * 240) / Math.max(0.5, request.rate || 1.0))
    );

    return {
      filePath: result.filePath,
      durationMs: estimatedDurationMs,
      byteSize: result.byteSize,
      engineUsed: 'native',
    };
  }
}

export const nativeTtsEngine = new NativeTtsEngine();
