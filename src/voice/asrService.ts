import { Platform, PermissionsAndroid } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  startNativeAudioRecording,
  stopNativeAudioRecording,
  cancelNativeAudioRecording,
  getNativeAudioRecordingAmplitude,
} from '../native/pixoryMediaModule';
import { getDatabase, type PixorySpace } from '../database';
import { aiProviderRepository } from '../database/repositories/aiProviderRepository';
import { getProviderApiKeyForSpace } from '../ai/secureAiSettingsService';
import { getVoicePresetApiKey } from './voiceSecureStore';
import { voiceRepository } from '../database/repositories/voiceRepository';
import type { VoicePresetRecord } from './types';

export interface AsrRecordingResult {
  audioUri: string;
  durationMs: number;
  fileSize: number;
}

export interface AsrTranscribeOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  language?: string;
  space?: PixorySpace;
  keepFile?: boolean;
}

class AsrService {
  private isRecording = false;
  private currentFilePath: string | null = null;
  private startTime = 0;

  async requestPermission(): Promise<boolean> {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: '麦克风权限申请',
            message: 'Pixory 需要麦克风权限以支持语音输入与转文字功能。',
            buttonPositive: '同意',
            buttonNegative: '取消',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch {
        return false;
      }
    }
    return true;
  }

  getRecordingState(): boolean {
    return this.isRecording;
  }

  async startRecording(): Promise<string> {
    if (this.isRecording) {
      await this.cancelRecording();
    }

    const hasPermission = await this.requestPermission().catch(() => true);
    if (!hasPermission) {
      throw new Error('未取得麦克风权限，无法录音');
    }

    const dir = FileSystem.cacheDirectory || '';
    // Expo FileSystem.cacheDirectory 格式为 file:///data/user/0/.../cache/
    // Android 原生 File(path) 与 MediaRecorder 必须使用纯粹的 Linux 文件系统绝对路径（/data/user/0/...）
    const rawDir = dir.replace(/^file:\/\//, '');
    const safeRawDir = rawDir ? (rawDir.endsWith('/') ? rawDir : `${rawDir}/`) : '';
    const safeDir = dir ? (dir.endsWith('/') ? dir : `${dir}/`) : '';
    const fileName = `asr_${Date.now()}.m4a`;
    const nativeFilePath = `${safeRawDir}${fileName}`;
    const fileUri = `${safeDir}${fileName}`;

    this.currentFilePath = fileUri;
    this.startTime = Date.now();

    // 原生 MediaRecorder (100% Android SDK 标准组件，零三方依赖)
    try {
      await startNativeAudioRecording(nativeFilePath);
      this.isRecording = true;
      return fileUri;
    } catch (err: any) {
      this.isRecording = false;
      this.currentFilePath = null;
      throw new Error(err?.message || '录音启动失败，请检查麦克风权限后重试');
    }
  }

  async stopRecording(): Promise<AsrRecordingResult> {
    if (!this.isRecording) {
      return {
        audioUri: this.currentFilePath || 'mock_voice.m4a',
        durationMs: Math.max(1000, Date.now() - (this.startTime || Date.now() - 2500)),
        fileSize: 1024,
      };
    }
    this.isRecording = false;

    // 原生 MediaRecorder
    try {
      const result = await stopNativeAudioRecording();
      const rawPath = result.filePath;
      const audioUri = rawPath.startsWith('file://') ? rawPath : `file://${rawPath}`;
      return {
        audioUri,
        durationMs: result.durationMs,
        fileSize: result.fileSize,
      };
    } catch (err: any) {
      if (this.currentFilePath) {
        try {
          await FileSystem.deleteAsync(this.currentFilePath, { idempotent: true });
        } catch {}
        this.currentFilePath = null;
      }
      throw new Error(err?.message || '录音停止失败');
    }
  }

  async cancelRecording(): Promise<void> {
    this.isRecording = false;

    try {
      await cancelNativeAudioRecording();
    } catch {}

    if (this.currentFilePath) {
      try {
        await FileSystem.deleteAsync(this.currentFilePath, { idempotent: true });
      } catch {}
      this.currentFilePath = null;
    }
  }

  /**
   * 获取当前录音的真实实时音量振幅 (0.0 ~ 1.0)
   * 没声音或低于阈值时返回 0，说话时返回实时能量
   */
  async getRecordingAmplitude(): Promise<number> {
    if (!this.isRecording) return 0;
    try {
      const raw = await getNativeAudioRecordingAmplitude();
      // Android MediaRecorder.getMaxAmplitude() 返回 0~32767
      // 底噪约 200~800，低于 1000 视为静音
      if (raw < 1000) return 0;
      const normalized = Math.min(1, Math.max(0, (raw - 1000) / 24000));
      return normalized;
    } catch {
      return 0;
    }
  }

  /**
   * 自动发现可用的 ASR 配置 (包括 SiliconFlow / OpenAI 等提供商配置)
   */
  async resolveAsrConfig(options?: AsrTranscribeOptions): Promise<{
    endpoint: string;
    apiKey: string | null;
    model: string;
  }> {
    if (options?.baseUrl && options?.apiKey) {
      const base = options.baseUrl.replace(/\/+$/, '');
      const endpoint = base.endsWith('/audio/transcriptions') ? base : `${base}/audio/transcriptions`;
      return {
        endpoint,
        apiKey: options.apiKey,
        model: options.model || 'FunAudioLLM/SenseVoiceSmall',
      };
    }

    const space = options?.space || 'normal';

    try {
      const db = await getDatabase(space);

      // 1. 优先检查用户在【声音与朗读】中配置的自定义音色预设
      const presets: VoicePresetRecord[] = await voiceRepository.listPresets(db);
      const customApiPreset = presets.find((p: VoicePresetRecord) => p.engineKind === 'openai_compat' && p.baseUrl);
      if (customApiPreset?.baseUrl) {
        const key = await getVoicePresetApiKey(space, customApiPreset.id);
        if (key) {
          const base = customApiPreset.baseUrl.replace(/\/+$/, '');
          const endpoint = base.endsWith('/audio/transcriptions') ? base : `${base}/audio/transcriptions`;
          return {
            endpoint,
            apiKey: key,
            model: options?.model || (base.includes('siliconflow') ? 'FunAudioLLM/SenseVoiceSmall' : 'whisper-1'),
          };
        }
      }

      // 2. 检查用户配置的 AI 提供商 (如 SiliconFlow / OpenAI)
      const providers = await aiProviderRepository.listProviders(db);
      // 优先匹配 SiliconFlow (针对中文 SenseVoice 极致优化)
      const sfProvider = providers.find(
        (p) => p.baseUrl?.includes('siliconflow') || p.displayName?.toLowerCase().includes('silicon')
      );
      if (sfProvider) {
        const key = await getProviderApiKeyForSpace(space, sfProvider.id);
        if (key) {
          const base = (sfProvider.baseUrl || 'https://api.siliconflow.cn/v1').replace(/\/+$/, '');
          const endpoint = base.endsWith('/audio/transcriptions') ? base : `${base}/audio/transcriptions`;
          return {
            endpoint,
            apiKey: key,
            model: 'FunAudioLLM/SenseVoiceSmall',
          };
        }
      }

      // 匹配其他 OpenAI 兼容提供商
      const openAiProvider = providers.find((p) => p.protocol === 'openai_compatible' && p.baseUrl);
      if (openAiProvider && openAiProvider.baseUrl) {
        const key = await getProviderApiKeyForSpace(space, openAiProvider.id);
        if (key) {
          const base = openAiProvider.baseUrl.replace(/\/+$/, '');
          const endpoint = base.endsWith('/audio/transcriptions') ? base : `${base}/audio/transcriptions`;
          return {
            endpoint,
            apiKey: key,
            model: 'whisper-1',
          };
        }
      }
    } catch {
      // 容错继续兜底
    }

    // 默认高可用端点
    return {
      endpoint: 'https://api.siliconflow.cn/v1/audio/transcriptions',
      apiKey: null,
      model: 'FunAudioLLM/SenseVoiceSmall',
    };
  }

  /**
   * 将音频文件转写为文本 (标准 Whisper / SenseVoice 协议)
   */
  async transcribeAudio(audioUri: string, options?: AsrTranscribeOptions): Promise<string> {
    const normalizedUri = audioUri.startsWith('file://') ? audioUri : `file://${audioUri}`;

    try {
      const config = await this.resolveAsrConfig(options);

      // 未配置云端 ASR Key 时提示用户配置
      if (!config.apiKey) {
        throw new Error('未配置语音识别 API Key，请在服务商设置中配置');
      }

      // 前置物理文件真实存在与大小守卫：确保音频文件已成功写入磁盘
      const fileInfo = await FileSystem.getInfoAsync(normalizedUri).catch(() => null);
      if (!fileInfo || !fileInfo.exists || ('size' in fileInfo && fileInfo.size === 0)) {
        throw new Error('未检测到有效录音音频，请重新说话后重试');
      }

      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      };

      const response = await FileSystem.uploadAsync(config.endpoint, normalizedUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType: 'audio/m4a',
        parameters: {
          model: config.model,
          language: options?.language || 'zh',
          response_format: 'json',
        },
        headers,
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`语音识别服务请求失败 (${response.status})`);
      }

      const result = JSON.parse(response.body);
      const text = typeof result?.text === 'string' ? result.text.trim() : '';
      return text;
    } catch (err: any) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      let userMsg = rawMsg;
      if (rawMsg.includes('uploadAsync') || rawMsg.includes('IOException') || rawMsg.includes("doesn't exist")) {
        userMsg = '录音文件生成异常，请重新尝试说话';
      } else if (rawMsg.includes('Network') || rawMsg.includes('Failed to fetch') || rawMsg.includes('timeout')) {
        userMsg = '语音识别请求超时，请检查网络连接';
      } else if (rawMsg.includes('401') || rawMsg.includes('Unauthorized')) {
        userMsg = '语音识别 API Key 无效或已过期，请在设置中检查';
      }
      throw new Error(userMsg);
    } finally {
      // 临时录音转文字完成后清理；若为消息持久化物理音频 (keepFile=true) 则坚决保留
      if (!options?.keepFile) {
        try {
          await FileSystem.deleteAsync(normalizedUri, { idempotent: true });
        } catch {}
      }
    }
  }
}

export const asrService = new AsrService();
