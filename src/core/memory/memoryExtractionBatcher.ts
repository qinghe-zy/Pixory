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
  threadId?: string | null;
  chatProviderId?: string | null;
  chatModelId?: string | null;
  userMessage: string;
  assistantMessage?: string | null;
  existingFacts?: CompanionMemoryRecord[];
  isTyping?: () => boolean;
}

const MAX_BATCH_TURNS = 3;

/**
 * 统一构造伴聊记忆批量提炼队列 Key，保证会话页、遗忘清理与后台恢复使用完全一致的键规则
 */
export function buildMemoryBatcherKey(
  space: PixorySpace,
  roleCardId?: string | null,
  threadId?: string | null
): string {
  const scopeId = roleCardId?.trim() || threadId?.trim() || 'default';
  return `${space}:${scopeId}`;
}

/**
 * 伴聊连发空闲感知记忆提炼合并批处理器 (MemoryExtractionBatcher)
 *
 * 核心设计目标：
 * 1. 连发消息（Burst）防抖合并：在 4.5s 窗口内若连续收到用户与伴侣对话，合并最多 3 轮一次性送入提炼模型，
 *    消灭多轮并发提炼导致的 SUPERSEDE 竞态并节省 50%~70% 额外提炼开销；超出 3 轮时主动触发批刷，绝不静默丢弃；
 * 2. 连续输入打字挂起：若输入框仍有草稿（用户正在打字），防抖定时器自动挂起顺延，绝不在用户激烈交谈时抢占计算；
 * 3. 页面离开时安全落盘 (flush)。
 */
export class MemoryExtractionBatcher {
  private static instance: MemoryExtractionBatcher | null = null;
  private queues = new Map<string, QueuedExtractionTurn[]>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private latestParams = new Map<string, Omit<EnqueueBatchParams, 'userMessage' | 'assistantMessage'>>();
  private inFlightFlushes = new Map<string, Promise<number>>();
  private clearGenerations = new Map<string, number>();
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
    this.clearGenerations.set(key, (this.clearGenerations.get(key) ?? 0) + 1);
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    this.queues.delete(key);
    this.latestParams.delete(key);
  }

  public enqueue(params: EnqueueBatchParams): void {
    const key = buildMemoryBatcherKey(params.space, params.roleCardId, params.threadId);
    const nextMeta: Omit<EnqueueBatchParams, 'userMessage' | 'assistantMessage'> = {
      space: params.space,
      roleCardId: params.roleCardId,
      threadId: params.threadId,
      chatProviderId: params.chatProviderId,
      chatModelId: params.chatModelId,
      existingFacts: params.existingFacts,
      isTyping: params.isTyping,
    };

    const existingTimer = this.timers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.timers.delete(key);
    }

    let queue = this.queues.get(key);
    if (queue && queue.length >= MAX_BATCH_TURNS) {
      // 队列已达单批上限时立即刷出已积压轮次，再开启新批次，避免 queue.shift() 静默丢弃早期记忆
      const overflowBatch = queue.splice(0, queue.length);
      const batchMeta = this.latestParams.get(key) || nextMeta;
      void this.flushSnapshot(key, overflowBatch, batchMeta);
    }

    if (!queue) {
      queue = [];
      this.queues.set(key, queue);
    }

    queue.push({
      userMessage: params.userMessage,
      assistantMessage: params.assistantMessage,
    });

    this.latestParams.set(key, nextMeta);

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

  private flushSnapshot(
    key: string,
    queueSnapshot: QueuedExtractionTurn[],
    latest: Omit<EnqueueBatchParams, 'userMessage' | 'assistantMessage'>
  ): Promise<number> {
    const expectedGen = this.clearGenerations.get(key) ?? 0;
    const prev = this.inFlightFlushes.get(key) ?? Promise.resolve(0);

    const runPromise = prev
      .catch(() => 0)
      .then(async () => {
        if ((this.clearGenerations.get(key) ?? 0) !== expectedGen) {
          return 0;
        }
        const combinedUser = queueSnapshot
          .map((t, idx) => (queueSnapshot.length > 1 ? `[第${idx + 1}句] ${t.userMessage}` : t.userMessage))
          .join('\n');
        const combinedAssistant = queueSnapshot
          .map((t, idx) =>
            t.assistantMessage
              ? queueSnapshot.length > 1
                ? `[第${idx + 1}句回复] ${t.assistantMessage}`
                : t.assistantMessage
              : ''
          )
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
      });

    this.inFlightFlushes.set(key, runPromise);
    void runPromise.finally(() => {
      if (this.inFlightFlushes.get(key) === runPromise) {
        this.inFlightFlushes.delete(key);
      }
    });

    return runPromise;
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
      const pendingFlush = this.inFlightFlushes.get(key);
      if (pendingFlush) {
        await pendingFlush.catch(() => 0);
      }
      return 0;
    }

    return this.flushSnapshot(key, queue, latest);
  }

  public flushAll(): void {
    const allKeys = Array.from(this.queues.keys());
    for (const key of allKeys) {
      void this.flushKey(key);
    }
  }
}
