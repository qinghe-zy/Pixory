import * as FileSystem from 'expo-file-system/legacy';
import type { TtsEngine } from './TtsEngine';
import type { TtsSynthesisRequest, TtsSynthesisResult } from '../types';
import { arrayBufferToBase64 } from '../base64Utils';

export function buildEdgeSsml(
  text: string,
  voice: string,
  rate: number,
  pitch: number,
  style?: string | null
): string {
  const ratePercent = Math.round((rate - 1.0) * 100);
  const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

  const pitchPercent = Math.round(pitch);
  const pitchStr = pitchPercent >= 0 ? `+${pitchPercent}%` : `${pitchPercent}%`;

  const cleanText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  if (style) {
    return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='zh-CN'>
  <voice name='${voice}'>
    <mstts:express-as style='${style}'>
      <prosody pitch='${pitchStr}' rate='${rateStr}'>
        ${cleanText}
      </prosody>
    </mstts:express-as>
  </voice>
</speak>`;
  }

  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>
  <voice name='${voice}'>
    <prosody pitch='${pitchStr}' rate='${rateStr}'>
      ${cleanText}
    </prosody>
  </voice>
</speak>`;
}

// 免费高保真公共中转候选池 (支持动态热备与自愈)
const DEFAULT_FREE_TTS_GATEWAYS = [
  'https://tts.shunzi.tech',
  'https://api.sound.free-tts.org/v1/edge',
];

export class BuiltinFreeEngine implements TtsEngine {
  readonly kind = 'builtin_free' as const;

  async synthesizeToFile(request: TtsSynthesisRequest): Promise<TtsSynthesisResult> {
    const voiceId = request.voiceId || 'zh-CN-XiaoyiNeural';
    const ssml = buildEdgeSsml(
      request.text,
      voiceId,
      request.rate || 1.0,
      request.pitch || 0.0,
      request.style
    );

    const controller = new AbortController();
    const timeout = request.timeoutMs || 6000;
    const timer = setTimeout(() => controller.abort(), timeout);

    let lastError: any = null;

    // 尝试网关请求
    for (const gateway of DEFAULT_FREE_TTS_GATEWAYS) {
      try {
        const response = await fetch(`${gateway}/synthesize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            ssml,
            voice: voiceId,
            rate: request.rate || 1.0,
            pitch: request.pitch || 0.0,
            text: request.text,
            format: 'audio-24khz-48kbitrate-mono-mp3',
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`网关响应失败 (${response.status})`);
        }

        const buffer = await response.arrayBuffer();
        if (!buffer || buffer.byteLength < 500) {
          throw new Error('返回音频数据过短或无效');
        }

        clearTimeout(timer);
        const base64 = arrayBufferToBase64(buffer);
        await FileSystem.writeAsStringAsync(request.outputPath, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const byteSize = buffer.byteLength;
        const calculatedDurationMs = Math.round((byteSize / 6000) * 1000);
        const textDurationEstimate = Math.round((request.text.length * 240) / Math.max(0.5, request.rate || 1.0));
        const durationMs = Math.max(1000, Math.min(calculatedDurationMs || textDurationEstimate, 120000));

        return {
          filePath: request.outputPath,
          durationMs,
          byteSize,
          engineUsed: 'builtin_free',
        };
      } catch (err: any) {
        lastError = err;
        if (err?.name === 'AbortError') {
          break; // 超时直接跳出转交 Tier 3
        }
      }
    }

    clearTimeout(timer);
    throw new Error(lastError?.message || `内置免费语音引擎暂时不可用 (${timeout}ms 超时)，将平滑降级至本机离线语音。`);
  }
}

export const builtinFreeEngine = new BuiltinFreeEngine();
