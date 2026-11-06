import type { SQLiteDatabase } from 'expo-sqlite';
import type { PixorySpace } from '../database';
import type { ResolveVoiceProfileContext } from './voiceProfileResolver';
import type { VoiceEngineKind, VoicePresetRecord } from './types';
import { sanitizeTextForTts } from './textSanitizer';
import { resolveVoiceProfile } from './voiceProfileResolver';
import {
  buildVoiceCacheKey,
  ensureVoiceCacheDirectory,
  getCachedAudioRecord,
  saveCachedAudioRecord,
} from './voiceAudioCache';
import { getVoicePresetApiKey } from './voiceSecureStore';
import { resolveDeveloperMimoKey } from './developerVoiceSecurity';
import { executeFallbackChain } from './fallbackChain';
import { voicePlayer, type VoicePlaybackState } from './voicePlayer';

export interface VoiceServiceContext extends Partial<ResolveVoiceProfileContext> {
  db?: SQLiteDatabase | null;
  space: PixorySpace;
  directPreset?: VoicePresetRecord;
  directApiKey?: string;
}

export interface PreparedAudioResult {
  audioUri: string;
  durationMs: number;
  engineUsed: VoiceEngineKind;
  isCached: boolean;
}

export const voiceService = {
  /**
   * 预合成音频（不立即自动播放）
   * 伴聊发送语音条、长按预加载等场景核心复用此接口
   */
  async prepareAudio(
    rawText: string,
    context: VoiceServiceContext
  ): Promise<PreparedAudioResult> {
    const cleanText = sanitizeTextForTts(rawText);
    if (!cleanText) {
      throw new Error('经过净化清洗后，没有可朗读的有效文本内容。');
    }

    const { db, space } = context;

    // 1. 解析当前生效的音色配置与覆盖参数（支持直接传入草稿预设进行试听）
    const profile = context.directPreset
      ? {
          preset: context.directPreset,
          effectiveRate: context.directPreset.rate ?? 1.0,
          effectivePitch: context.directPreset.pitch ?? 0.0,
          effectiveStyle: context.directPreset.style,
          voiceBubbleEnabled: true,
          autoReadEnabled: false,
          sourceScope: 'global' as const,
        }
      : await resolveVoiceProfile(db!, space, context as ResolveVoiceProfileContext);

    // 2. 计算 CAS 缓存指纹键
    const cacheKey = buildVoiceCacheKey(
      cleanText,
      profile.preset,
      profile.effectiveRate,
      profile.effectivePitch,
      profile.effectiveStyle
    );

    // 3. 优先命中本地物理缓存 (0ms 秒开)
    const cached = db ? await getCachedAudioRecord(db, cacheKey) : null;
    if (cached) {
      return {
        audioUri: cached.filePath,
        durationMs: cached.durationMs,
        engineUsed: cached.engineKind,
        isCached: true,
      };
    }

    // 4. 未命中时，准备目标文件输出目录
    const dir = await ensureVoiceCacheDirectory(space);
    const extension = profile.preset.engineKind === 'native' ? 'wav' : 'mp3';
    const outputPath = `${dir}${cacheKey}.${extension}`;

    // 5. 若为云端模型，按空间安全读取 API Key 或优先使用草稿直传 Key (支持多级预设回退与开发者内置授权)
    let apiKey: string | undefined = context.directApiKey?.trim() || undefined;
    if (!apiKey && profile.preset.engineKind === 'openai_compat') {
      let key = await getVoicePresetApiKey(space, profile.preset.id);
      if (!key) {
        key =
          (await getVoicePresetApiKey(space, 'mimo-global')) ||
          (await getVoicePresetApiKey(space, 'custom-openai-compat')) ||
          (await getVoicePresetApiKey(space, 'mimo-bingtang'));
      }
      if (key) apiKey = key;
    }
    if (!apiKey && profile.preset.engineKind === 'openai_compat') {
      const devKey = resolveDeveloperMimoKey(profile.preset.model, profile.preset.baseUrl);
      if (devKey) apiKey = devKey;
    }

    // 超长文本保护：移动端语音合成最适合自然的段落朗读。若超出 360 字，在句末标点自然断句，避免云端模型因超长 token 挂起或报 400 错误
    let textToSynthesize = cleanText;
    if (textToSynthesize.length > 360) {
      const match = textToSynthesize.slice(0, 360).match(/.*[。！？\n；]/);
      if (match && match[0].length >= 100) {
        textToSynthesize = match[0];
      } else {
        textToSynthesize = textToSynthesize.slice(0, 350) + '。';
      }
    }

    // 动态自适应超时：针对长聊天 AI 回复，根据字数动态放宽超时时间（基础 25 秒，每字 +180ms，上限 75 秒），彻底杜绝虚假超时截断
    const dynamicTimeoutMs = Math.max(25000, Math.min(75000, Math.round(textToSynthesize.length * 180)));

    // 6. 执行三重平滑降级链
    const result = await executeFallbackChain(
      {
        text: textToSynthesize,
        outputPath,
        voiceId: profile.preset.voiceId,
        rate: profile.effectiveRate,
        pitch: profile.effectivePitch,
        style: profile.effectiveStyle,
        timeoutMs: dynamicTimeoutMs,
        apiKey,
        baseUrl: profile.preset.baseUrl ?? undefined,
        model: profile.preset.model ?? undefined,
        space,
      },
      profile.preset
    );

    // 7. 写入本地物理缓存索引表
    if (db) {
      await saveCachedAudioRecord(db, {
        cacheKey,
        filePath: result.filePath,
        durationMs: result.durationMs,
        byteSize: result.byteSize,
        engineKind: result.engineUsed,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      });
    }

    return {
      audioUri: result.filePath,
      durationMs: result.durationMs,
      engineUsed: result.engineUsed,
      isCached: false,
    };
  },

  /** 会话防并发与取消票据 */
  _activeSpeakTicket: 0,

  /**
   * 合成并立即播放（长聊小喇叭、伴聊气泡点击朗读调用）
   */
  async speak(
    rawText: string,
    context: VoiceServiceContext,
    playbackId?: string
  ): Promise<void> {
    const playId = playbackId || `${context.threadId}_${rawText.slice(0, 16)}`;

    // 若当前正在播放此段音频，则再次点击为停止
    if (voicePlayer.isPlaying(playId)) {
      await this.stop();
      return;
    }

    const ticket = ++this._activeSpeakTicket;

    const { audioUri } = await this.prepareAudio(rawText, context);

    // 校验准备期间是否已被取消或停止（例如用户在转圈时点击了取消或退出了页面）
    if (ticket !== this._activeSpeakTicket) {
      return;
    }

    await voicePlayer.play(audioUri, playId);
  },

  /**
   * 直接播放已有物理音频文件（伴聊录音原声播放等）
   */
  async playAudio(audioUri: string, playbackId?: string): Promise<void> {
    this._activeSpeakTicket++;
    await voicePlayer.play(audioUri, playbackId);
  },

  /**
   * 停止当前所有正在进行的音频播放及待播放任务
   */
  async stop(): Promise<void> {
    this._activeSpeakTicket++;
    await voicePlayer.stop();
  },

  /**
   * 查询当前是否正在播放指定音频
   */
  isPlaying(id?: string): boolean {
    return voicePlayer.isPlaying(id);
  },

  /**
   * 订阅播放器实时状态变化
   */
  subscribe(listener: (state: VoicePlaybackState) => void): () => void {
    return voicePlayer.subscribe(listener);
  },

  /**
   * 获取当前播放器状态快照
   */
  getPlaybackState(): VoicePlaybackState {
    return voicePlayer.getState();
  },
};
