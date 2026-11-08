import * as FileSystem from 'expo-file-system/legacy';
import type { TtsEngine } from './TtsEngine';
import type { TtsSynthesisRequest, TtsSynthesisResult } from '../types';
import { arrayBufferToBase64 } from '../base64Utils';

export function normalizeOpenAiTtsUrl(baseUrl?: string | null): string {
  const raw = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  if (raw.endsWith('/audio/speech')) return raw;
  if (raw.endsWith('/v1')) return `${raw}/audio/speech`;
  return `${raw}/v1/audio/speech`;
}

export function isMimoTts(model?: string | null, baseUrl?: string | null): boolean {
  const m = (model || '').toLowerCase();
  const b = (baseUrl || '').toLowerCase();
  return m.includes('mimo') || b.includes('xiaomimimo') || b.includes('xiaomi');
}

export function normalizeMimoUrl(baseUrl?: string | null): string {
  const raw = (baseUrl || 'https://api.xiaomimimo.com/v1').replace(/\/+$/, '');
  if (raw.endsWith('/chat/completions')) return raw;
  if (raw.endsWith('/v1')) return `${raw}/chat/completions`;
  return `${raw}/v1/chat/completions`;
}

export async function fetchModelsFromEndpoint(baseUrl: string, apiKey?: string | null): Promise<string[]> {
  const normalizedBase = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const url = normalizedBase.endsWith('/models')
    ? normalizedBase
    : normalizedBase.endsWith('/v1')
    ? `${normalizedBase}/models`
    : `${normalizedBase}/v1/models`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`获取模型失败 (HTTP ${response.status})`);
    }

    const json = await response.json();
    let modelList: string[] = [];
    if (Array.isArray(json?.data)) {
      modelList = json.data.map((m: any) => m.id || m.name).filter(Boolean);
    } else if (Array.isArray(json)) {
      modelList = json.map((m: any) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
    }

    if (modelList.length === 0 && isMimoTts('', baseUrl)) {
      return ['mimo-v2.5-tts', 'mimo-v2.5-tts-voicedesign', 'mimo-v2.5-tts-voiceclone'];
    }

    return modelList;
  } catch (err: any) {
    clearTimeout(timer);
    if (isMimoTts('', baseUrl)) {
      return ['mimo-v2.5-tts', 'mimo-v2.5-tts-voicedesign', 'mimo-v2.5-tts-voiceclone'];
    }
    throw new Error(err?.message || '获取模型列表连接超时');
  }
}

export interface RemoteVoiceCandidate {
  id: string;
  name: string;
  description?: string;
  gender?: 'female' | 'male' | 'neutral';
}

export const KNOWN_PROVIDER_VOICES: Record<string, RemoteVoiceCandidate[]> = {
  mimo: [
    { id: '冰糖', name: '冰糖', description: '清澈甜美 · 年轻女声', gender: 'female' },
    { id: '茉莉', name: '茉莉', description: '温柔知性 · 成熟女声', gender: 'female' },
    { id: '苏打', name: '苏打', description: '阳光活力 · 青年男声', gender: 'male' },
    { id: '白桦', name: '白桦', description: '沉稳磁性 · 成熟男声', gender: 'male' },
    { id: '甜茶', name: '甜茶', description: '活泼灵动 · 元气女声', gender: 'female' },
  ],
  openai: [
    { id: 'alloy', name: 'Alloy', description: '中性自然 · 通用平衡', gender: 'neutral' },
    { id: 'echo', name: 'Echo', description: '沉稳磁性 · 温暖男声', gender: 'male' },
    { id: 'fable', name: 'Fable', description: '生动起伏 · 英伦叙事', gender: 'neutral' },
    { id: 'onyx', name: 'Onyx', description: '浑厚庄重 · 播音质感', gender: 'male' },
    { id: 'nova', name: 'Nova', description: '活力亲和 · 现代女声', gender: 'female' },
    { id: 'shimmer', name: 'Shimmer', description: '清亮柔和 · 细腻女声', gender: 'female' },
    { id: 'ash', name: 'Ash', description: '低调柔和 · 随性声线', gender: 'neutral' },
    { id: 'coral', name: 'Coral', description: '温暖明朗 · 叙事女声', gender: 'female' },
    { id: 'sage', name: 'Sage', description: '沉静舒缓 · 知性沉稳', gender: 'neutral' },
  ],
  siliconflow: [
    { id: 'alex', name: 'Alex', description: '沉稳青年男声', gender: 'male' },
    { id: 'benjamin', name: 'Benjamin', description: '磁性成熟男声', gender: 'male' },
    { id: 'claire', name: 'Claire', description: '亲切知性女声', gender: 'female' },
    { id: 'david', name: 'David', description: '阳光活力男声', gender: 'male' },
    { id: 'diana', name: 'Diana', description: '温柔甜美女性', gender: 'female' },
    { id: 'eric', name: 'Eric', description: '清晰专业播音', gender: 'male' },
  ],
  minimax: [
    { id: 'female-tianmei', name: '甜美女声', description: '元气甜美播音', gender: 'female' },
    { id: 'female-yujie', name: '御姐知性', description: '成熟干练女声', gender: 'female' },
    { id: 'male-qn-qingse', name: '青涩青年', description: '阳光学生声线', gender: 'male' },
    { id: 'presenter_male', name: '专业播音男', description: '新闻主持声线', gender: 'male' },
    { id: 'presenter_female', name: '专业播音女', description: '温润主持女声', gender: 'female' },
    { id: 'audiobook_male_1', name: '有声书评书男', description: '小说演播男声', gender: 'male' },
    { id: 'audiobook_female_1', name: '有声书温婉女', description: '长篇叙事女声', gender: 'female' },
  ],
};

/**
 * 从模型服务商或端点拉取可用音色列表
 * 1. 优先尝试探测远端 /audio/voices 或 /voices 端点
 * 2. 端点无独立接口时，智能匹配服务商的官方标准音色库
 */
export async function fetchVoicesFromEndpoint(
  baseUrl: string,
  apiKey?: string | null,
  model?: string | null
): Promise<RemoteVoiceCandidate[]> {
  const normalizedBase = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const lowerBase = normalizedBase.toLowerCase();
  const lowerModel = (model || '').toLowerCase();

  // 1. 判断已知模型服务商类型
  let matchedProvider = 'openai';
  if (lowerBase.includes('xiaomi') || lowerBase.includes('mimo') || lowerModel.includes('mimo')) {
    matchedProvider = 'mimo';
    // 小米 MiMo 使用专用 Chat Completions 音频通道，无独立 /voices 路由，直接返回官方声线集合以实现 0ms 秒级响应
    return KNOWN_PROVIDER_VOICES.mimo;
  } else if (lowerBase.includes('siliconflow') || lowerModel.includes('cosyvoice')) {
    matchedProvider = 'siliconflow';
  } else if (lowerBase.includes('minimax') || lowerModel.includes('speech-01')) {
    matchedProvider = 'minimax';
  }

  // 2. 尝试探测远端自定义 voices 端点 (自动去重，避免重复请求)
  const candidateUrls = Array.from(
    new Set([
      normalizedBase.endsWith('/v1') ? `${normalizedBase}/audio/voices` : `${normalizedBase}/v1/audio/voices`,
      normalizedBase.endsWith('/v1') ? `${normalizedBase}/voices` : `${normalizedBase}/v1/voices`,
      `${normalizedBase}/voices`,
    ])
  );

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  for (const url of candidateUrls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const resp = await fetch(url, { method: 'GET', headers, signal: controller.signal });
      clearTimeout(timer);
      if (resp.ok) {
        const json = await resp.json();
        const rawList = Array.isArray(json?.data) ? json.data : Array.isArray(json?.voices) ? json.voices : Array.isArray(json) ? json : null;
        if (rawList && rawList.length > 0) {
          const parsed: RemoteVoiceCandidate[] = rawList.map((item: any) => {
            if (typeof item === 'string') {
              return { id: item, name: item };
            }
            return {
              id: item.id || item.voice_id || item.voiceId || item.name,
              name: item.name || item.display_name || item.voice_name || item.id,
              description: item.description || item.style || undefined,
              gender: item.gender,
            };
          }).filter((v: RemoteVoiceCandidate) => Boolean(v.id));
          if (parsed.length > 0) {
            return parsed;
          }
        }
      }
    } catch {
      clearTimeout(timer);
    }
  }

  // 3. 远端未开放专用 voices 路由时，返回匹配服务商的官方标准音色库
  return KNOWN_PROVIDER_VOICES[matchedProvider] || KNOWN_PROVIDER_VOICES.openai;
}

export class OpenAiCompatEngine implements TtsEngine {
  readonly kind = 'openai_compat' as const;

  async synthesizeToFile(request: TtsSynthesisRequest): Promise<TtsSynthesisResult> {
    const isMimo = isMimoTts(request.model, request.baseUrl);
    const endpoint = isMimo ? normalizeMimoUrl(request.baseUrl) : normalizeOpenAiTtsUrl(request.baseUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, audio/mpeg, audio/wav, */*',
    };
    if (request.apiKey?.trim()) {
      headers.Authorization = `Bearer ${request.apiKey.trim()}`;
      if (isMimo) {
        headers['api-key'] = request.apiKey.trim();
      }
    }

    const textToSpeak = request.ttsScript?.trim() || request.text;
    const effectiveStyle = request.styleOverride?.trim() || request.style?.trim() || '自然流畅的口语对白风格';
    // 对于小米 MiMo：若有动态语气覆盖，在 assistant content 头部注入 <style> 标签双重强化语气与副语言（如叹气、哈欠）拟声表现
    const mimoAssistantContent = request.styleOverride?.trim()
      ? `<style>${request.styleOverride.trim()}</style>${textToSpeak}`
      : textToSpeak;

    const payload: Record<string, any> = isMimo
      ? {
          model: request.model || 'mimo-v2.5-tts',
          messages: [
            { role: 'user', content: effectiveStyle },
            { role: 'assistant', content: mimoAssistantContent },
          ],
          audio: {
            voice: request.voiceId || '冰糖',
            format: 'mp3',
          },
        }
      : {
          model: request.model || 'tts-1',
          input: textToSpeak,
          voice: request.voiceId || 'alloy',
          response_format: 'mp3',
          speed: Math.max(0.25, Math.min(4.0, request.rate || 1.0)),
        };

    const controller = new AbortController();
    const timeout = request.timeoutMs || 35000;
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        let errorDetail = '';
        try {
          const errJson = await response.json();
          errorDetail = errJson?.error?.message || errJson?.message || '';
        } catch {
          errorDetail = await response.text().catch(() => '');
        }
        throw new Error(`云端 TTS 报错 (HTTP ${response.status}): ${errorDetail || response.statusText}`);
      }

      let byteSize = 0;
      if (isMimo) {
        // 小米 MiMo 通过 Chat Completions 返回 choices[0].message.audio.data (Base64 MP3)
        const json = await response.json();
        const base64Data = json?.choices?.[0]?.message?.audio?.data;
        if (!base64Data || typeof base64Data !== 'string') {
          const detail = json?.error?.message || json?.message || '返回数据中缺少音频内容';
          throw new Error(`小米 MiMo 响应异常: ${detail}`);
        }
        await FileSystem.writeAsStringAsync(request.outputPath, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
        byteSize = Math.round(base64Data.length * 0.75);
      } else {
        // 标准 OpenAI / SiliconFlow / MiniMax 返回纯音频二进制流
        const arrayBuffer = await response.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);
        await FileSystem.writeAsStringAsync(request.outputPath, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        byteSize = arrayBuffer.byteLength;
      }

      const fileInfo = await FileSystem.getInfoAsync(request.outputPath);
      if (fileInfo.exists && typeof fileInfo.size === 'number') {
        byteSize = fileInfo.size;
      }

      // 根据实际字节大小及语速推算时长 (MP3 64kbps 约 8000 字节/秒)
      const calculatedDurationMs = Math.round((byteSize / 8000) * 1000);
      const textDurationEstimate = Math.round((request.text.length * 240) / Math.max(0.5, request.rate || 1.0));
      const durationMs = Math.max(1000, Math.min(calculatedDurationMs || textDurationEstimate, 120000));

      return {
        filePath: request.outputPath,
        durationMs,
        byteSize,
        engineUsed: 'openai_compat',
      };
    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') {
        throw new Error(`云端 TTS 合成请求超时 (${Math.round(timeout / 1000)}s)，云端服务响应较慢，请稍后重试。`);
      }
      throw err;
    }
  }
}

export const openAiCompatEngine = new OpenAiCompatEngine();
