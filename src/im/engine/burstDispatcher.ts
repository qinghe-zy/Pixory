import { AppState, type AppStateStatus } from 'react-native';
import { type PixorySpace } from '../../database';
import {
  getNextPendingVisibleAt,
  getNextPendingVisibleRow,
  insertImMessage,
  revealPendingMessages,
} from '../repository/imThreadRepository';
import type { ImMessage } from '../types';
import { calculateBubbleTypingDelay, DEFAULT_PACING_CONFIG, type ImPacingConfig } from '../config/pacingProfile';
import { calculateHumanTypingDelay, type HumanTypingOptions } from '../config/humanTypingTimeline';
import { sanitizeCompanionBubble } from './humanizeOutputGate';

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
  private currentBurstGroupId: string | null = null;
  private accumulatedDelay: number = 0;
  private dispatchedCountInBurst: number = 0;

  constructor(
    threadId: string,
    space: PixorySpace,
    config: ImPacingConfig = DEFAULT_PACING_CONFIG
  ) {
    this.threadId = threadId;
    this.space = space;
    this.config = config;
  }

  beginBurst(): string {
    this.currentBurstGroupId = `burst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.accumulatedDelay = 0;
    this.dispatchedCountInBurst = 0;
    return this.currentBurstGroupId;
  }

  cancelPendingBurst(): void {
    this.currentBurstGroupId = null;
    this.accumulatedDelay = 0;
    this.dispatchedCountInBurst = 0;
  }

  async dispatchSentence(
    text: string,
    ticker?: VisibilityTicker,
    options?: { isOccupied?: boolean; userTextLength?: number; useHumanTimeline?: boolean }
  ): Promise<ImMessage> {
    if (!this.currentBurstGroupId) {
      this.beginBurst();
    }

    const cleaned = sanitizeCompanionBubble(text);
    const effectiveText = cleaned.trim() || text.trim();

    const isFirst = this.dispatchedCountInBurst === 0;
    const delay = options?.useHumanTimeline
      ? calculateHumanTypingDelay(effectiveText, this.config, isFirst, {
          isOccupied: options.isOccupied,
          userTextLength: options.userTextLength,
          burstIndex: this.dispatchedCountInBurst,
        })
      : calculateBubbleTypingDelay(effectiveText, this.config, isFirst, options);
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
    ticker?.scheduleNextTick().catch(() => {});
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
}
