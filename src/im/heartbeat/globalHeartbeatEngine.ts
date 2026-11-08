import { AppState, type AppStateStatus } from 'react-native';
import {
  revealPendingMessages,
  getActiveStagedThreadIds,
  getThreadLivingState,
  getDuePendingPings,
  getInterruptedUserThreads,
} from '../repository/imThreadRepository';
import type { PixorySpace } from '../../database';

export type GlobalHeartbeatListener = (threadId: string, space: PixorySpace) => void;

/**
 * 全局伴聊心跳、静默唤醒与断联补回引擎 (Global Heartbeat Engine)
 * 职责：
 * 1. 摆脱单个聊天界面的生命周期束缚，即使退出聊天页、切去其他 Tab 也能准时显影到期的心跳与连发气泡；
 * 2. 监听 AppState，切回前台时瞬时扫描并显影到期消息、补偿被系统杀后台错过的预约闹钟与中断回复；
 * 3. 前台活跃期间每 20 秒轮询，显影后广播事件通知会话列表更新预览气泡与未读红点；
 * 4. 无需系统通知权限（POST_NOTIFICATIONS）亦 100% 静默执行落库生成，确保用户下次打开必见新消息。
 */
export class GlobalHeartbeatEngine {
  static readonly shared = new GlobalHeartbeatEngine();

  private timer: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private listeners = new Set<GlobalHeartbeatListener>();
  private openThreadCounts = new Map<string, number>();
  private personalSpaceUnlocked = false;
  private isScanning = false;

  private constructor() {}

  /**
   * 同步私密空间解锁/锁定状态（隐私隔离核心边界）
   * - 锁定时：严禁轮询或打开 pixory_personal.sqlite，并立即熔断所有进行中的私密空间流与唤醒任务；
   * - 解锁时：立即触发一次静默追平扫描，恢复锁定期间错过的预埋气泡与预约问候。
   */
  setPersonalSpaceUnlocked(unlocked: boolean): void {
    const prev = this.personalSpaceUnlocked;
    this.personalSpaceUnlocked = unlocked;

    if (!unlocked) {
      void this.suspendPersonalSpace();
      return;
    }

    if (!prev && unlocked) {
      void this.scanAndReveal();
    }
  }

  async suspendPersonalSpace(): Promise<void> {
    this.personalSpaceUnlocked = false;
    for (const k of Array.from(this.openThreadCounts.keys())) {
      if (k.startsWith('personal:')) {
        this.openThreadCounts.delete(k);
      }
    }
    try {
      const { suspendImSpaceStreams } = await import('../services/imBackgroundStreamService');
      suspendImSpaceStreams('personal');
    } catch {
      // 容错静默
    }
  }

  isPersonalSpaceUnlocked(): boolean {
    return this.personalSpaceUnlocked;
  }

  markThreadOpen(space: PixorySpace, threadId: string): void {
    const key = `${space}:${threadId}`;
    this.openThreadCounts.set(key, (this.openThreadCounts.get(key) ?? 0) + 1);
  }

  markThreadClosed(space: PixorySpace, threadId: string): void {
    const key = `${space}:${threadId}`;
    const next = (this.openThreadCounts.get(key) ?? 0) - 1;
    if (next <= 0) {
      this.openThreadCounts.delete(key);
    } else {
      this.openThreadCounts.set(key, next);
    }
  }

  setActiveOpenThread(space: PixorySpace, threadId: string | null): void {
    const prefix = `${space}:`;
    for (const k of Array.from(this.openThreadCounts.keys())) {
      if (k.startsWith(prefix)) {
        this.openThreadCounts.delete(k);
      }
    }
    if (threadId) {
      this.openThreadCounts.set(`${space}:${threadId}`, 1);
    }
  }

  isThreadActivelyOpen(space: PixorySpace, threadId: string): boolean {
    return (this.openThreadCounts.get(`${space}:${threadId}`) ?? 0) > 0;
  }

  start(): void {
    if (this.timer) return;

    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange
    );

    // 每 20 秒扫描一次，兼顾省电与脱钩气泡/预约闹钟准时到达
    this.timer = setInterval(() => {
      void this.scanAndReveal();
    }, 20000);

    // 启动时立即扫描一次（杀后台重启后瞬时补偿）
    void this.scanAndReveal();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  subscribe(listener: GlobalHeartbeatListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notifyListeners(threadId: string, space: PixorySpace): void {
    for (const listener of this.listeners) {
      try {
        listener(threadId, space);
      } catch {
        // 监听者容错
      }
    }
  }

  private handleAppStateChange = (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      void this.scanAndReveal();
    }
  };

  async scanAndReveal(): Promise<void> {
    if (this.isScanning) return;
    this.isScanning = true;

    try {
      const now = Date.now();
      const activeSpaces: PixorySpace[] = this.personalSpaceUnlocked
        ? ['normal', 'personal']
        : ['normal'];

      for (const space of activeSpaces) {
        // 1. 扫描短时预埋气泡与脱钩连发气泡显影（未打开窗口时自动累加未读红点）
        const threadIds = await getActiveStagedThreadIds(space).catch(() => []);
        for (const threadId of threadIds) {
          const livingState = await getThreadLivingState(space, threadId).catch(() => null);
          const incrementUnread = !this.isThreadActivelyOpen(space, threadId);
          const revealedCount = await revealPendingMessages(space, threadId, now, livingState, {
            incrementUnread,
          }).catch(() => 0);
          if (revealedCount > 0) {
            this.notifyListeners(threadId, space);
            // 普通空间且未在前台会话窗口内时，触发 Android 原生通知栏提醒（遵守免打扰与隐私脱敏设置）
            if (space === 'normal' && !this.isThreadActivelyOpen(space, threadId)) {
              try {
                const { initDatabase } = await import('../../database');
                const { postCompanionNotificationSafely } = await import('../services/imNotificationManager');
                const db = await initDatabase(space);
                const tRow = await db.getFirstAsync<{ title?: string; lastMessagePreview?: string }>(
                  'SELECT title, lastMessagePreview FROM ai_threads WHERE id = ?',
                  [threadId]
                );
                if (tRow?.lastMessagePreview) {
                  const { formatMessagePreview } = await import('../../utils/formatMessagePreview');
                  const safePreview = formatMessagePreview(tRow.lastMessagePreview, '新消息');
                  void postCompanionNotificationSafely(space, threadId, tRow.title || '新消息', safePreview);
                }
              } catch {}
            }
          }
        }

        // 2. 扫描系统强杀后台导致“用户已发消息但伴侣未完成生成”的断联会话并静默补回
        if (typeof getInterruptedUserThreads === 'function') {
          const interruptedList = await getInterruptedUserThreads(space, now).catch(() => []);
          if (interruptedList.length > 0) {
            const { recoverInterruptedUserReply } = await import('../services/imBackgroundStreamService');
            for (const item of interruptedList) {
              try {
                await recoverInterruptedUserReply(space, item.threadId, now);
              } catch {
                // 容错静默
              }
            }
          }
        }

        // 3. 扫描长时预约主动闹钟唤醒（含无通知权限与杀后台逾期追平）
        const duePings = await getDuePendingPings(space, now).catch(() => []);
        if (duePings.length > 0) {
          const { executeWakeupGeneration } = await import('../services/imWakeupGenerationService');
          for (const due of duePings) {
            try {
              await executeWakeupGeneration(space, due.threadId, { isHeadless: false, now });
            } catch {
              // 容错静默
            }
          }
        }
      }
    } finally {
      this.isScanning = false;
    }
  }
}
