import type { PixorySpace } from '../../database/index';
import { extractMemoryMutationsWithMemoryModel } from './memoryModelExtractor';
import type { CompanionMemoryRecord } from './memoryTypes';

export interface QueuedExtractionTurn {
  userMessage: string;
  assistantMessage?: string | null;
}

export interface EnqueueBatchParams {
  space: PixorySpace;
  roleCardId: string;
  chatProviderId?: string | null;
  chatModelId?: string | null;
  userMessage: string;
  assistantMessage?: string | null;
  existingFacts?: CompanionMemoryRecord[];
  isTyping?: () => boolean;
}

/**
 * 伴聊连发空闲感知记忆提炼合并批处理器 (MemoryExtractionBatcher)
 *
 * 核心设计目标：
 * 1. 连发消息（Burst）防抖合并：在 4.5s 窗口内若连续收到用户与伴侣对话，合并最多 3 轮一次性送入提炼模型，
 *    消灭多轮并发提炼导致的 SUPERSEDE 竞态并节省 50%~70% 额外提炼开销；
 * 2. 连续输入打字挂起：若输入框仍有草稿（用户正在打字），防抖定时器自动挂起顺延，绝不在用户激烈交谈时抢占计算；
 * 3. 页面离开时安全落盘 (flush)。
 */
export class MemoryExtractionBatcher {
  private static instance: MemoryExtractionBatcher | null = null;
  private queues = new Map<string, QueuedExtractionTurn[]>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private latestParams = new Map<string, Omit<EnqueueBatchParams, 'userMessage' | 'assistantMessage'>>();
  private extractorFn: typeof extractMemoryMutationsWithMemoryModel = extractMemoryMutationsWithMemoryModel;

  public static get shared(): MemoryExtractionBatcher {
    if (!this.instance) {
      this.instance = new MemoryExtractionBatcher();
    }
    return this.instance;
  }

  public setExtractorForTest(fn: typeof extractMemoryMutationsWithMemoryModel): void {
    this.extractorFn = fn;
  }

  public getPendingCount(key: string): number {
    return this.queues.get(key)?.length || 0;
  }

  /**
   * 清空指定会话的待提炼队列与定时器（用于主动命令遗忘或紧急回滚）
   */
  public clearKey(key: string): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    this.queues.delete(key);
    this.latestParams.delete(key);
  }

  public enqueue(params: EnqueueBatchParams): void {
    const key = `${params.space}:${params.roleCardId}`;
    let queue = this.queues.get(key);
    if (!queue) {
      queue = [];
      this.queues.set(key, queue);
    }

    queue.push({
      userMessage: params.userMessage,
      assistantMessage: params.assistantMessage,
    });

    // 限制单批最多合并最近 3 轮
    if (queue.length > 3) {
      queue.shift();
    }

    this.latestParams.set(key, {
      space: params.space,
      roleCardId: params.roleCardId,
      chatProviderId: params.chatProviderId,
      chatModelId: params.chatModelId,
      existingFacts: params.existingFacts,
      isTyping: params.isTyping,
    });

    const existingTimer = this.timers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.executeOrPostpone(key);
    }, 4500);

    this.timers.set(key, timer);
  }

  private executeOrPostpone(key: string): void {
    const latest = this.latestParams.get(key);
    if (latest?.isTyping && latest.isTyping()) {
      // 用户仍在输入框打字，再顺延 2 秒
      const postponeTimer = setTimeout(() => {
        this.executeOrPostpone(key);
      }, 2000);
      this.timers.set(key, postponeTimer);
      return;
    }

    void this.flushKey(key);
  }

  public async flushKey(key: string): Promise<number> {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }

    const queue = this.queues.get(key);
    const latest = this.latestParams.get(key);
    this.queues.delete(key);
    this.latestParams.delete(key);

    if (!queue || queue.length === 0 || !latest) {
      return 0;
    }

    // 合并多轮对话文本
    const combinedUser = queue
      .map((t, idx) => (queue.length > 1 ? `[第${idx + 1}句] ${t.userMessage}` : t.userMessage))
      .join('\n');
    const combinedAssistant = queue
      .map((t, idx) => (t.assistantMessage ? (queue.length > 1 ? `[第${idx + 1}句回复] ${t.assistantMessage}` : t.assistantMessage) : ''))
      .filter(Boolean)
      .join('\n');

    try {
      return await this.extractorFn({
        space: latest.space,
        roleCardId: latest.roleCardId,
        chatProviderId: latest.chatProviderId,
        chatModelId: latest.chatModelId,
        userMessage: combinedUser,
        assistantMessage: combinedAssistant,
        existingFacts: latest.existingFacts,
      });
    } catch {
      return 0;
    }
  }

  public flushAll(): void {
    const allKeys = Array.from(this.queues.keys());
    for (const key of allKeys) {
      void this.flushKey(key);
    }
  }
}
