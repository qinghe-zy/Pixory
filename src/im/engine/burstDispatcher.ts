import { AppState, type AppStateStatus } from 'react-native';
import { runWithDatabaseSpace, type PixorySpace } from '../../database';
import {
  getNextPendingVisibleAt,
  getNextPendingVisibleRow,
  insertImMessage,
  revealPendingMessages,
  updateImMessageVoice,
} from '../repository/imThreadRepository';
import type { ImMessage } from '../types';
import { calculateBubbleTypingDelay, DEFAULT_PACING_CONFIG, type ImPacingConfig } from '../config/pacingProfile';
import { calculateHumanTypingDelay } from '../config/humanTypingTimeline';
import { sanitizeCompanionBubble } from './humanizeOutputGate';
import { resolveSticker, resolveCompensationEmoji } from '../../components/emoji/StickerSemanticResolver';
import { CasBlobStore } from '../../services/agent/vfs/casBlobStore';
import { applyBatchSafely } from '../../services/sandbox/diff/fuzzyPatcher';
import {
  parseVoiceTag,
  tokenizeMultimodalSegment,
  type ParsedVoiceTag,
  type ParsedDocumentPatchTag,
} from './imTagParser';
import { voiceService } from '../../voice/voiceService';

const MAX_BURST_REVEAL_WINDOW_MS = 6000;

export function getStickerCooldownThreshold(style?: string | null): number {
  if (!style) return 3;
  const lower = style.toLowerCase();
  if (lower.includes('concise') || lower.includes('cool') || lower.includes('tsundere')) {
    return 5;
  }
  if (lower.includes('lively') || lower.includes('clingy') || lower.includes('playful')) {
    return 1;
  }
  return 3;
}

const INLINE_STAGE_ACTION_REGEX = /[（\(]([^）\)]+)[）\)]/;

export interface DispatchStickerOptions {
  personaStyle?: string | null;
  userTextLength?: number;
  useHumanTimeline?: boolean;
}

export interface DispatchStickerResult {
  dispatched: boolean;
  reason: 'cooldown_intercepted' | 'resolved_and_dispatched' | 'no_sticker_found' | 'burst_cancelled';
  message?: ImMessage;
  compensationEmoji?: string;
  stickerName?: string;
}

export class VisibilityTicker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<() => void> = new Set();
  private idleListeners: Set<() => void> = new Set();
  private threadId: string;
  private space: PixorySpace;
  private appStateSubscription: { remove: () => void } | null = null;
  private isDisposed: boolean = false;
  private isNextBurstTyping: boolean = false;

  constructor(threadId: string, space: PixorySpace) {
    this.threadId = threadId;
    this.space = space;
    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange
    );
  }

  private handleAppStateChange = (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      void revealPendingMessages(this.space, this.threadId, Date.now())
        .then(() => {
          this.notifyReveal();
          this.scheduleNextTick();
        })
        .catch(() => {});
    }
  };

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeIdle(listener: () => void): () => void {
    this.idleListeners.add(listener);
    return () => this.idleListeners.delete(listener);
  }

  private notifyReveal() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private notifyIdle() {
    for (const listener of this.idleListeners) {
      listener();
    }
  }

  isRevealing(): boolean {
    return this.timer !== null && this.isNextBurstTyping && !this.isDisposed;
  }

  async scheduleNextTick(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.isDisposed) return;

    const nextRow = await getNextPendingVisibleRow(this.space, this.threadId);
    if (!nextRow || this.isDisposed) {
      this.isNextBurstTyping = false;
      this.notifyIdle();
      return;
    }

    const now = Date.now();
    const waitMs = Math.max(0, nextRow.visibleAt - now);

    // 仅当下一条是切句气泡 (revealing) 且在 8 秒短时打字窗口内，才算作正在输入
    this.isNextBurstTyping = nextRow.deliveryStatus === 'revealing' && waitMs <= 8000;
    if (!this.isNextBurstTyping) {
      this.notifyIdle();
    }

    this.timer = setTimeout(async () => {
      if (this.isDisposed) return;
      await revealPendingMessages(this.space, this.threadId, Date.now()).catch(() => 0);
      if (this.isDisposed) return;
      this.notifyReveal();
      this.scheduleNextTick().catch(() => {});
    }, waitMs);
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.isNextBurstTyping = false;
    this.notifyIdle();
  }

  dispose() {
    this.isDisposed = true;
    this.isNextBurstTyping = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.appStateSubscription?.remove();
    this.listeners.clear();
    this.idleListeners.clear();
  }
}

export class BurstMessageDispatcher {
  private threadId: string;
  private space: PixorySpace;
  private config: ImPacingConfig;
  public voiceReplyEnabled: boolean = true;
  private currentBurstGroupId: string | null = null;
  private accumulatedDelay: number = 0;
  private dispatchedCountInBurst: number = 0;
  private turnsSinceLastSticker: number = 999;
  private lastPrecedingAction: string | null = null;
  private inFlightDispatches = new Set<Promise<unknown>>();
  private pendingFallbackCompensationEmoji: string | null = null;
  private dispatchQueue: Promise<void> = Promise.resolve();
  private burstEpoch: number = 0;

  constructor(
    threadId: string,
    space: PixorySpace,
    config: ImPacingConfig = DEFAULT_PACING_CONFIG
  ) {
    this.threadId = threadId;
    this.space = space;
    this.config = config;
  }

  private initBurstFieldsOnly(): string {
    this.currentBurstGroupId = `burst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.accumulatedDelay = 0;
    this.dispatchedCountInBurst = 0;
    this.lastPrecedingAction = null;
    this.pendingFallbackCompensationEmoji = null;
    return this.currentBurstGroupId;
  }

  private ensureActiveBurstGroup(): string {
    return this.currentBurstGroupId || this.initBurstFieldsOnly();
  }

  beginBurst(): string {
    this.burstEpoch += 1;
    return this.initBurstFieldsOnly();
  }

  cancelPendingBurst(): void {
    this.burstEpoch += 1;
    this.currentBurstGroupId = null;
    this.accumulatedDelay = 0;
    this.dispatchedCountInBurst = 0;
    this.lastPrecedingAction = null;
    this.pendingFallbackCompensationEmoji = null;
  }

  getDispatchedCountInBurst(): number {
    return this.dispatchedCountInBurst;
  }

  async waitForPendingDispatches(): Promise<void> {
    while (this.inFlightDispatches.size > 0) {
      await Promise.allSettled([...this.inFlightDispatches]);
    }
  }

  private trackDispatch<T>(fn: () => Promise<T>): Promise<T> {
    const p = fn();
    this.inFlightDispatches.add(p);
    const cleanup = () => {
      this.inFlightDispatches.delete(p);
    };
    p.then(cleanup, cleanup);
    return p;
  }

  private enqueueDispatch<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.dispatchQueue.then(fn, fn);
    this.dispatchQueue = run.then(
      () => undefined,
      () => undefined
    );
    return this.trackDispatch(() => run);
  }

  /**
   * 限制单轮连发的总显影时间窗不超过 MAX_BURST_REVEAL_WINDOW_MS (6000ms)。
   * 注：当首句命中忙碌态 (isOccupied) 产生约 ~5000ms 阅读延迟时，后续非首句气泡会快速贴近
   * 6000ms 上限，从而自动触发 180~300ms 紧凑压缩，保证角色回应一旦开口便连贯落完。
   */
  private applyBurstWindowCap(
    rawDelay: number,
    _modality: 'text' | 'sticker' | 'voice' | 'document',
    isFirst: boolean
  ): number {
    if (isFirst) {
      return rawDelay;
    }
    if (
      this.accumulatedDelay >= MAX_BURST_REVEAL_WINDOW_MS ||
      this.accumulatedDelay + rawDelay > MAX_BURST_REVEAL_WINDOW_MS
    ) {
      return 180 + Math.min(120, Math.round(rawDelay * 0.1));
    }
    return rawDelay;
  }

  private async dispatchTextAtom(
    rawText: string,
    ticker?: VisibilityTicker,
    options?: {
      isOccupied?: boolean;
      userTextLength?: number;
      useHumanTimeline?: boolean;
      voiceReplyEnabled?: boolean;
      personaStyle?: string | null;
    },
    internalOpts?: {
      capturedEpoch?: number;
      isFencedCodeBlock?: boolean;
    }
  ): Promise<ImMessage | null> {
    if (internalOpts?.capturedEpoch !== undefined && this.burstEpoch !== internalOpts.capturedEpoch) {
      return null;
    }

    const effectiveText = internalOpts?.isFencedCodeBlock
      ? rawText.trim()
      : sanitizeCompanionBubble(rawText).trim();
    if (!effectiveText) {
      return null;
    }

    if (!internalOpts?.isFencedCodeBlock) {
      const stageMatch = effectiveText.match(INLINE_STAGE_ACTION_REGEX);
      if (stageMatch) {
        this.lastPrecedingAction = stageMatch[1].trim();
      }
    }

    this.ensureActiveBurstGroup();

    const isFirst = this.dispatchedCountInBurst === 0;
    const rawDelay = options?.useHumanTimeline
      ? calculateHumanTypingDelay(effectiveText, this.config, isFirst, {
          isOccupied: options.isOccupied,
          userTextLength: options.userTextLength,
          burstIndex: this.dispatchedCountInBurst,
          modality: 'text',
        })
      : calculateBubbleTypingDelay(effectiveText, this.config, isFirst, options);
    const delay = this.applyBurstWindowCap(rawDelay, 'text', isFirst);
    this.accumulatedDelay += delay;
    this.dispatchedCountInBurst += 1;
    const visibleAt = Date.now() + this.accumulatedDelay;

    const message: ImMessage = {
      id: `msg_ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      threadId: this.threadId,
      burstGroupId: this.currentBurstGroupId || undefined,
      role: 'assistant',
      content: effectiveText,
      type: 'text',
      status: 'sent',
      deliveryStatus: 'revealing',
      visibleAt,
      createdAt: new Date(visibleAt).toISOString(),
    };

    await insertImMessage(this.space, message);
    if (internalOpts?.capturedEpoch !== undefined && this.burstEpoch !== internalOpts.capturedEpoch) {
      return null;
    }
    ticker?.scheduleNextTick().catch(() => {});
    return message;
  }

  async dispatchSentence(
    text: string,
    ticker?: VisibilityTicker,
    options?: {
      isOccupied?: boolean;
      userTextLength?: number;
      useHumanTimeline?: boolean;
      voiceReplyEnabled?: boolean;
      personaStyle?: string | null;
    }
  ): Promise<ImMessage | null> {
    const capturedEpoch = this.burstEpoch;
    return this.enqueueDispatch(async () => {
      if (this.burstEpoch !== capturedEpoch) {
        return null;
      }

      const trimmedSegment = text.trim();
      if (!trimmedSegment) {
        return null;
      }

      // 代码围栏整块保护：跳过多模态解构与协议正文中途改写，作为单个文本气泡原样发射
      if (trimmedSegment.startsWith('```') && trimmedSegment.endsWith('```')) {
        const msg = await this.dispatchTextAtom(trimmedSegment, ticker, options, {
          capturedEpoch,
          isFencedCodeBlock: true,
        });
        if (this.burstEpoch !== capturedEpoch) {
          return null;
        }
        if (msg) {
          this.pendingFallbackCompensationEmoji = null;
        }
        return msg;
      }

      const atoms = tokenizeMultimodalSegment(text);
      if (atoms.length === 0) {
        return null;
      }

      let lastMessage: ImMessage | null = null;

      for (let i = 0; i < atoms.length; i += 1) {
        if (this.burstEpoch !== capturedEpoch) {
          return null;
        }

        const atom = atoms[i];

        if (atom.kind === 'text') {
          const msg = await this.dispatchTextAtom(atom.payload, ticker, options, { capturedEpoch });
          if (this.burstEpoch !== capturedEpoch) {
            return null;
          }
          if (msg) {
            this.pendingFallbackCompensationEmoji = null;
            lastMessage = msg;
          }
          continue;
        }

        if (atom.kind === 'voice') {
          const allowed = options?.voiceReplyEnabled ?? this.voiceReplyEnabled;
          if (allowed) {
            const msg = await this.dispatchVoiceInternal(atom.payload, ticker, options, capturedEpoch);
            if (this.burstEpoch !== capturedEpoch) {
              return null;
            }
            if (msg) {
              this.pendingFallbackCompensationEmoji = null;
              lastMessage = msg;
            }
          } else {
            // 会话关闭语音回复时，平滑退化为普通文字对白气泡发射
            const parsedVoice = parseVoiceTag(atom.payload);
            const plainText = parsedVoice ? (parsedVoice.uiTranscript || parsedVoice.text || '').trim() : '';
            if (!plainText) {
              continue;
            }
            const msg = await this.dispatchTextAtom(plainText, ticker, options, { capturedEpoch });
            if (this.burstEpoch !== capturedEpoch) {
              return null;
            }
            if (msg) {
              this.pendingFallbackCompensationEmoji = null;
              lastMessage = msg;
            }
          }
          continue;
        }

        if (atom.kind === 'sticker') {
          const res = await this.dispatchStickerInternal(
            atom.payload,
            ticker,
            {
              personaStyle: options?.personaStyle,
              userTextLength: options?.userTextLength,
              useHumanTimeline: options?.useHumanTimeline,
            },
            capturedEpoch
          );
          if (this.burstEpoch !== capturedEpoch) {
            return null;
          }
          if (res.dispatched && res.message) {
            this.pendingFallbackCompensationEmoji = null;
            lastMessage = res.message;
          } else {
            const hasOtherEffectiveModality = atoms
              .slice(i + 1)
              .some((nextAtom) => {
                if (nextAtom.kind === 'voice') {
                  const parsedVoice = parseVoiceTag(nextAtom.payload);
                  return Boolean((parsedVoice?.uiTranscript || parsedVoice?.text || '').trim());
                }
                return nextAtom.kind === 'text' && sanitizeCompanionBubble(nextAtom.payload).trim().length > 0;
              });
            if (
              this.dispatchedCountInBurst === 0 &&
              !hasOtherEffectiveModality &&
              !this.pendingFallbackCompensationEmoji
            ) {
              this.pendingFallbackCompensationEmoji =
                res.compensationEmoji || resolveCompensationEmoji(atom.payload);
            }
          }
        }
      }

      return lastMessage;
    });
  }

  async flushPendingStickerCompensationIfEmpty(
    ticker?: VisibilityTicker,
    options?: { isOccupied?: boolean; userTextLength?: number; useHumanTimeline?: boolean }
  ): Promise<ImMessage | null> {
    const capturedEpoch = this.burstEpoch;
    return this.enqueueDispatch(async () => {
      if (this.burstEpoch !== capturedEpoch) {
        return null;
      }
      if (this.dispatchedCountInBurst === 0 && this.pendingFallbackCompensationEmoji) {
        const fallbackEmoji = this.pendingFallbackCompensationEmoji;
        this.pendingFallbackCompensationEmoji = null;
        return this.dispatchTextAtom(fallbackEmoji, ticker, options, { capturedEpoch });
      }
      this.pendingFallbackCompensationEmoji = null;
      return null;
    });
  }

  async dispatchVoice(
    voiceInput: string | ParsedVoiceTag,
    ticker?: VisibilityTicker,
    options?: { isOccupied?: boolean; userTextLength?: number; useHumanTimeline?: boolean }
  ): Promise<ImMessage | null> {
    const capturedEpoch = this.burstEpoch;
    return this.enqueueDispatch(() =>
      this.dispatchVoiceInternal(voiceInput, ticker, options, capturedEpoch)
    );
  }

  private async dispatchVoiceInternal(
    voiceInput: string | ParsedVoiceTag,
    ticker?: VisibilityTicker,
    options?: { isOccupied?: boolean; userTextLength?: number; useHumanTimeline?: boolean },
    capturedEpoch?: number
  ): Promise<ImMessage | null> {
    if (capturedEpoch !== undefined && this.burstEpoch !== capturedEpoch) {
      return null;
    }

    const voiceTag: ParsedVoiceTag = typeof voiceInput === 'string'
      ? (parseVoiceTag(voiceInput) || {
          text: sanitizeCompanionBubble(voiceInput, { preserveInlineStageActions: true }),
          rawTag: voiceInput,
          uiTranscript: sanitizeCompanionBubble(voiceInput, { preserveInlineStageActions: true }),
          ttsScript: sanitizeCompanionBubble(voiceInput, { preserveInlineStageActions: false }),
          styleDirective: undefined,
        })
      : voiceInput;

    const effectiveText = (voiceTag.uiTranscript || voiceTag.text || '').trim();
    if (!effectiveText) return null;

    this.ensureActiveBurstGroup();

    const inheritedStyle = voiceTag.styleDirective || this.lastPrecedingAction || undefined;
    const ttsScript = voiceTag.ttsScript || effectiveText;

    const isFirst = this.dispatchedCountInBurst === 0;
    const rawDelay = options?.useHumanTimeline
      ? calculateHumanTypingDelay(effectiveText, this.config, isFirst, {
          isOccupied: options.isOccupied,
          userTextLength: options.userTextLength,
          burstIndex: this.dispatchedCountInBurst,
          modality: 'voice',
        })
      : calculateBubbleTypingDelay(effectiveText, this.config, isFirst, options);
    const delay = this.applyBurstWindowCap(rawDelay, 'voice', isFirst);
    this.accumulatedDelay += delay;
    this.dispatchedCountInBurst += 1;
    this.pendingFallbackCompensationEmoji = null;
    const visibleAt = Date.now() + this.accumulatedDelay;

    const estDurationMs = Math.max(1000, Math.min(60000, Math.round(effectiveText.length * 240)));

    const message: ImMessage = {
      id: `msg_ai_voice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      threadId: this.threadId,
      burstGroupId: this.currentBurstGroupId || undefined,
      role: 'assistant',
      content: effectiveText,
      type: 'voice',
      voice: {
        audioUri: '',
        durationMs: estDurationMs,
        transcription: effectiveText,
        isPlayed: false,
        style: inheritedStyle,
      },
      status: 'sent',
      deliveryStatus: 'revealing',
      visibleAt,
      createdAt: new Date(visibleAt).toISOString(),
    };

    await insertImMessage(this.space, message);
    if (capturedEpoch !== undefined && this.burstEpoch !== capturedEpoch) {
      return null;
    }
    ticker?.scheduleNextTick().catch(() => {});

    // 后台异步预合成音频缓存，实现秒开播放，注入动态语气覆盖与发音脚本
    void runWithDatabaseSpace(this.space, async (db) => {
      try {
        const prep = await voiceService.prepareAudio(effectiveText, {
          db,
          space: this.space,
          scopeType: 'thread_im',
          threadId: this.threadId,
          ttsScript,
          styleOverride: inheritedStyle,
        });
        await updateImMessageVoice(this.space, message.id, {
          audioUri: prep.audioUri,
          durationMs: prep.durationMs || estDurationMs,
          transcription: effectiveText,
          style: inheritedStyle,
        });
      } catch {
        // 预合成静默失败不阻断气泡，待用户点击时走 fallbackChain 兜底
      }
    });

    return message;
  }

  async dispatchStagedHeartbeat(
    text: string,
    delayMs: number,
    ticker?: VisibilityTicker
  ): Promise<ImMessage> {
    const visibleAt = Date.now() + delayMs;
    const message: ImMessage = {
      id: `msg_hb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      threadId: this.threadId,
      role: 'assistant',
      content: text,
      type: 'text',
      status: 'sent',
      deliveryStatus: 'staged',
      visibleAt,
      createdAt: new Date(visibleAt).toISOString(),
    };
    await insertImMessage(this.space, message);
    ticker?.scheduleNextTick().catch(() => {});
    return message;
  }

  getTurnsSinceLastSticker(): number {
    return this.turnsSinceLastSticker;
  }

  setTurnsSinceLastSticker(turns: number): void {
    this.turnsSinceLastSticker = Math.max(0, turns);
  }

  advanceTurnWithoutSticker(): void {
    this.turnsSinceLastSticker += 1;
  }

  /**
   * 分发大表情贴纸（支持自由混排与窗口压缩）
   */
  async dispatchSticker(
    emotionWord: string,
    ticker?: VisibilityTicker,
    options?: DispatchStickerOptions
  ): Promise<DispatchStickerResult> {
    const capturedEpoch = this.burstEpoch;
    return this.enqueueDispatch(() =>
      this.dispatchStickerInternal(emotionWord, ticker, options, capturedEpoch)
    );
  }

  private async dispatchStickerInternal(
    emotionWord: string,
    ticker?: VisibilityTicker,
    options?: DispatchStickerOptions,
    capturedEpoch?: number
  ): Promise<DispatchStickerResult> {
    if (capturedEpoch !== undefined && this.burstEpoch !== capturedEpoch) {
      return {
        dispatched: false,
        reason: 'burst_cancelled',
        stickerName: emotionWord,
      };
    }

    // 解析具体贴纸（支持内置与外部导入库）
    const sticker = resolveSticker(emotionWord, { personaStyle: options?.personaStyle || undefined });
    if (!sticker) {
      this.turnsSinceLastSticker += 1;
      const compensation = resolveCompensationEmoji(emotionWord);
      return {
        dispatched: false,
        reason: 'no_sticker_found',
        compensationEmoji: compensation,
        stickerName: emotionWord,
      };
    }

    this.ensureActiveBurstGroup();

    const stickerBaseDelay = options?.useHumanTimeline
      ? calculateHumanTypingDelay('', this.config, this.dispatchedCountInBurst === 0, {
          modality: 'sticker',
          burstIndex: this.dispatchedCountInBurst,
        })
      : 250;
    const stickerDelay = this.applyBurstWindowCap(
      stickerBaseDelay,
      'sticker',
      this.dispatchedCountInBurst === 0
    );
    this.accumulatedDelay += stickerDelay;
    this.dispatchedCountInBurst += 1;
    this.pendingFallbackCompensationEmoji = null;
    const visibleAt = Date.now() + this.accumulatedDelay;

    const message: ImMessage = {
      id: `msg_ai_stk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      threadId: this.threadId,
      burstGroupId: this.currentBurstGroupId || undefined,
      role: 'assistant',
      content: sticker.name,
      type: 'sticker',
      imageUri: sticker.animatedUri,
      metadata: {
        sticker: {
          id: sticker.id,
          name: sticker.name,
          animatedUri: sticker.animatedUri,
          previewUri: sticker.previewUri,
          width: sticker.width,
          height: sticker.height,
        },
      },
      status: 'sent',
      deliveryStatus: 'revealing',
      visibleAt,
      createdAt: new Date(visibleAt).toISOString(),
    };

    await insertImMessage(this.space, message);
    if (capturedEpoch !== undefined && this.burstEpoch !== capturedEpoch) {
      return {
        dispatched: false,
        reason: 'burst_cancelled',
        stickerName: sticker.name,
      };
    }
    ticker?.scheduleNextTick().catch(() => {});

    // 成功发送，冷却计数归零
    this.turnsSinceLastSticker = 0;

    return {
      dispatched: true,
      reason: 'resolved_and_dispatched',
      message,
      stickerName: sticker.name,
    };
  }

  /**
   * 分发大模型生成的文档气泡卡片 (点击即开即读与导出)
   */
  async dispatchDocument(
    doc: { title: string; uri?: string; content: string; tocSkeleton?: Array<{ blockId: string; previewText: string }> },
    ticker?: VisibilityTicker
  ): Promise<ImMessage | null> {
    const capturedEpoch = this.burstEpoch;
    return this.enqueueDispatch(() =>
      this.dispatchDocumentInternal(doc, ticker, capturedEpoch)
    );
  }

  private async dispatchDocumentInternal(
    doc: { title: string; uri?: string; content: string; tocSkeleton?: Array<{ blockId: string; previewText: string }> },
    ticker?: VisibilityTicker,
    capturedEpoch?: number
  ): Promise<ImMessage | null> {
    if (capturedEpoch !== undefined && this.burstEpoch !== capturedEpoch) {
      return null;
    }

    let casHash: string | undefined;
    let casUri: string = doc.uri || doc.title;
    let contentToStore: string | Uint8Array = doc.content;

    // 若目标是 .docx 且当前正文为 Markdown 文本，自动编译为标准的 ECMA-376 OOXML Zip 二进制包
    const isDocxTarget = doc.title.toLowerCase().endsWith('.docx');
    if (isDocxTarget && typeof doc.content === 'string' && !doc.content.startsWith('PK')) {
      try {
        const { compileMarkdownToDocx } = await import('../../services/sandbox/docx/docxCompiler');
        contentToStore = await compileMarkdownToDocx(doc.content, doc.title);
      } catch {
        // 容错保持原正文
      }
      if (capturedEpoch !== undefined && this.burstEpoch !== capturedEpoch) {
        return null;
      }
    }

    try {
      const casStore = new CasBlobStore();
      const putRes = await casStore.putBlob(contentToStore, this.space);
      casHash = putRes.blobHash;
      casUri = casStore.getBlobPath(putRes.blobHash, this.space);
    } catch {
      // 容错静默
    }
    if (capturedEpoch !== undefined && this.burstEpoch !== capturedEpoch) {
      return null;
    }

    this.ensureActiveBurstGroup();

    // 文档卡片间隔 200ms 自然呈现（受窗口软上限保护）
    const docDelay = this.applyBurstWindowCap(200, 'document', this.dispatchedCountInBurst === 0);
    this.accumulatedDelay += docDelay;
    this.dispatchedCountInBurst += 1;
    this.pendingFallbackCompensationEmoji = null;
    const visibleAt = Date.now() + this.accumulatedDelay;

    const message: ImMessage = {
      id: `msg_ai_doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      threadId: this.threadId,
      burstGroupId: this.currentBurstGroupId || undefined,
      role: 'assistant',
      content: doc.title,
      type: 'document',
      metadata: {
        document: {
          title: doc.title,
          uri: casUri,
          casUri,
          casHash,
          size: typeof contentToStore === 'string' ? contentToStore.length : contentToStore.byteLength,
          sizeBytes: typeof contentToStore === 'string' ? contentToStore.length : contentToStore.byteLength,
          charCount: typeof doc.content === 'string' ? doc.content.length : undefined,
          tocSkeleton: doc.tocSkeleton,
          content: doc.content,
        },
      },
      status: 'sent',
      deliveryStatus: 'revealing',
      visibleAt,
      createdAt: new Date(visibleAt).toISOString(),
    };

    await insertImMessage(this.space, message);
    if (capturedEpoch !== undefined && this.burstEpoch !== capturedEpoch) {
      return null;
    }
    ticker?.scheduleNextTick().catch(() => {});
    return message;
  }

  /**
   * 执行局部补丁合成并分发派生文档气泡
   */
  async dispatchDocumentPatch(
    patch: ParsedDocumentPatchTag,
    ticker?: VisibilityTicker
  ): Promise<ImMessage | null> {
    const capturedEpoch = this.burstEpoch;
    return this.enqueueDispatch(() =>
      this.dispatchDocumentPatchInternal(patch, ticker, capturedEpoch)
    );
  }

  private async dispatchDocumentPatchInternal(
    patch: ParsedDocumentPatchTag,
    ticker?: VisibilityTicker,
    capturedEpoch?: number
  ): Promise<ImMessage | null> {
    if (capturedEpoch !== undefined && this.burstEpoch !== capturedEpoch) {
      return null;
    }

    if (!patch.operations || patch.operations.length === 0) {
      throw new Error(`文档补丁解析失败: 未提取到有效的 SEARCH/REPLACE 差量操作块`);
    }

    const casStore = new CasBlobStore();
    let baseContent = '';
    let derivedContent = '';

    try {
      const { initDatabase } = await import('../../database');
      const db = await initDatabase(this.space);
      if (capturedEpoch !== undefined && this.burstEpoch !== capturedEpoch) {
        return null;
      }
      const cleanBaseMsgId = (patch.baseMsgId || '').replace(/^['"]|['"]$/g, '').trim();

      // 1. 优先从当前空间查找底本消息
      let parentRow = await db.getFirstAsync<{ content: string }>(
        `SELECT content FROM ai_messages WHERE id = ? LIMIT 1;`,
        [cleanBaseMsgId]
      );

      // 2. 兜底容错：若模型将文件名或标题误当成了 baseMsgId，按标题检索最新底本
      if (!parentRow && cleanBaseMsgId.length >= 2) {
        parentRow = await db.getFirstAsync<{ content: string }>(
          `SELECT content FROM ai_messages
           WHERE threadId = ? AND (content LIKE '{"type":"document"%' OR content LIKE '{"document":%') AND content LIKE ?
           ORDER BY createdAt DESC LIMIT 1;`,
          [this.threadId, `%"title":"%${cleanBaseMsgId}%"%`]
        );
      }
      if (capturedEpoch !== undefined && this.burstEpoch !== capturedEpoch) {
        return null;
      }

      if (parentRow?.content) {
        try {
          const parsed = JSON.parse(parentRow.content);
          if (parsed.casHash) {
            baseContent = (await casStore.getBlobText(parsed.casHash, this.space)) || '';
          } else if (parsed.content) {
            baseContent = parsed.content;
          } else if (parsed.document?.casHash) {
            baseContent = (await casStore.getBlobText(parsed.document.casHash, this.space)) || '';
          } else if (parsed.document?.content) {
            baseContent = parsed.document.content;
          }
        } catch {
          baseContent = parentRow.content;
        }
      }
    } catch {}

    if (capturedEpoch !== undefined && this.burstEpoch !== capturedEpoch) {
      return null;
    }

    // 采用 IndexPreservingFuzzyPatcher 执行容错补丁
    if (baseContent && patch.operations.length > 0) {
      const hunks = patch.operations
        .filter((op) => op.op === 'replace' && op.search)
        .map((op, idx) => ({
          id: op.targetBlockId || `hunk_${idx}`,
          search: op.search,
          replace: op.replace,
        }));

      const appends = patch.operations.filter((op) => op.op === 'append' && op.replace);

      if (hunks.length > 0) {
        const patchResult = applyBatchSafely(baseContent, hunks);
        // 若全部 hunk 均未能匹配定位且无追加，严禁生成假修订
        if (patchResult.appliedCount === 0 && appends.length === 0) {
          throw new Error(`文档补丁应用失败: SEARCH 文本未能匹配到原文档有效内容 (0/${hunks.length} applied)`);
        }
        derivedContent = patchResult.resultText;
      } else {
        derivedContent = baseContent;
      }

      // 执行 append 追加
      for (const app of appends) {
        derivedContent = `${derivedContent.trim()}\n\n${app.replace.trim()}`;
      }
    } else {
      derivedContent = patch.patchContent;
    }

    let contentToStore: string | Uint8Array = derivedContent;
    const isDocxTarget = patch.title.toLowerCase().endsWith('.docx');
    if (isDocxTarget && typeof derivedContent === 'string' && !derivedContent.startsWith('PK')) {
      try {
        const { compileMarkdownToDocx } = await import('../../services/sandbox/docx/docxCompiler');
        contentToStore = await compileMarkdownToDocx(derivedContent, patch.title);
      } catch {
        // 容错保持原正文
      }
      if (capturedEpoch !== undefined && this.burstEpoch !== capturedEpoch) {
        return null;
      }
    }

    let casHash: string | undefined;
    let casUri: string = patch.title;
    try {
      const putRes = await casStore.putBlob(contentToStore, this.space);
      casHash = putRes.blobHash;
      casUri = casStore.getBlobPath(putRes.blobHash, this.space);
    } catch {}

    if (capturedEpoch !== undefined && this.burstEpoch !== capturedEpoch) {
      return null;
    }

    this.ensureActiveBurstGroup();

    const docDelay = this.applyBurstWindowCap(200, 'document', this.dispatchedCountInBurst === 0);
    this.accumulatedDelay += docDelay;
    this.dispatchedCountInBurst += 1;
    this.pendingFallbackCompensationEmoji = null;
    const visibleAt = Date.now() + this.accumulatedDelay;

    const message: ImMessage = {
      id: `msg_ai_doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      threadId: this.threadId,
      burstGroupId: this.currentBurstGroupId || undefined,
      role: 'assistant',
      content: patch.title,
      type: 'document',
      metadata: {
        document: {
          title: patch.title,
          uri: casUri,
          casUri,
          casHash,
          size: typeof contentToStore === 'string' ? contentToStore.length : contentToStore.byteLength,
          sizeBytes: typeof contentToStore === 'string' ? contentToStore.length : contentToStore.byteLength,
          charCount: typeof derivedContent === 'string' ? derivedContent.length : undefined,
          hasRevisions: true,
          derivedFromMsgId: patch.baseMsgId,
          content: derivedContent,
        },
      },
      status: 'sent',
      deliveryStatus: 'revealing',
      visibleAt,
      createdAt: new Date(visibleAt).toISOString(),
    };

    await insertImMessage(this.space, message);
    if (capturedEpoch !== undefined && this.burstEpoch !== capturedEpoch) {
      return null;
    }
    ticker?.scheduleNextTick().catch(() => {});
    return message;
  }
}
