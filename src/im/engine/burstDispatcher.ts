import { AppState, type AppStateStatus } from 'react-native';
import { type PixorySpace } from '../../database';
import {
  getNextPendingVisibleAt,
  insertImMessage,
} from '../repository/imThreadRepository';
import type { ImMessage } from '../types';
import { calculateBubbleTypingDelay, DEFAULT_PACING_CONFIG, type ImPacingConfig } from '../config/pacingProfile';

export class VisibilityTicker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<() => void> = new Set();
  private idleListeners: Set<() => void> = new Set();
  private threadId: string;
  private space: PixorySpace;
  private appStateSubscription: { remove: () => void } | null = null;

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
      this.notifyReveal();
      this.scheduleNextTick();
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
    return this.timer !== null;
  }

  async scheduleNextTick(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const nextVisibleAt = await getNextPendingVisibleAt(this.space, this.threadId);
    if (!nextVisibleAt) {
      this.notifyIdle();
      return;
    }

    const now = Date.now();
    const waitMs = Math.max(0, nextVisibleAt - now);

    this.timer = setTimeout(() => {
      this.notifyReveal();
      this.scheduleNextTick().catch(() => {});
    }, waitMs);
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.notifyIdle();
  }

  dispose() {
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

  async dispatchSentence(
    text: string,
    ticker?: VisibilityTicker,
    options?: { isOccupied?: boolean }
  ): Promise<ImMessage> {
    if (!this.currentBurstGroupId) {
      this.beginBurst();
    }

    const isFirst = this.dispatchedCountInBurst === 0;
    const delay = calculateBubbleTypingDelay(text, this.config, isFirst, options);
    this.accumulatedDelay += delay;
    this.dispatchedCountInBurst += 1;
    const visibleAt = Date.now() + this.accumulatedDelay;

    const message: ImMessage = {
      id: `msg_ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      threadId: this.threadId,
      burstGroupId: this.currentBurstGroupId || undefined,
      role: 'assistant',
      content: text,
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
    delayMs: number
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
    return message;
  }
}
