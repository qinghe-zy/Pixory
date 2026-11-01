import type { PixorySpace } from '../../database';
import type { LlmTokenUsage } from '../../core/llm-transport/types';
import { imEpochRepository } from '../repository/imEpochRepository';

export interface ImUsageTelemetryRecord {
  space: PixorySpace;
  threadId: string;
  modelId: string;
  epochVersion: number;
  // 上一轮即时表现
  lastPromptTokens: number;
  lastCompletionTokens: number;
  lastCachedPromptTokens: number;
  lastCacheHitRatio: number;
  lastTimestamp: number;
  // 全程累计检测数据
  totalTurns: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCachedPromptTokens: number;
  overallCacheHitRatio: number;
}

const telemetryStore = new Map<string, ImUsageTelemetryRecord>();
const telemetrySubscribers = new Map<string, Set<(rec: ImUsageTelemetryRecord) => void>>();

export const imUsageTelemetry = {
  recordTurnUsage(
    space: PixorySpace,
    threadId: string,
    usage: LlmTokenUsage | undefined,
    modelId: string = 'unknown',
    epochVersion: number = 1
  ): void {
    if (!threadId) return;
    const key = `${space}:${threadId}`;
    const promptTokens = usage?.promptTokens ?? 0;
    const completionTokens = usage?.completionTokens ?? 0;
    const cachedTokens = usage?.cachedPromptTokens ?? 0;
    const hitRatio = usage?.cacheHitRatio ?? (promptTokens > 0 ? cachedTokens / promptTokens : 0);

    const prev = telemetryStore.get(key);
    const totalTurns = (prev?.totalTurns ?? 0) + 1;
    const totalPromptTokens = (prev?.totalPromptTokens ?? 0) + promptTokens;
    const totalCompletionTokens = (prev?.totalCompletionTokens ?? 0) + completionTokens;
    const totalCachedPromptTokens = (prev?.totalCachedPromptTokens ?? 0) + cachedTokens;
    const overallCacheHitRatio =
      totalPromptTokens > 0
        ? Number((totalCachedPromptTokens / totalPromptTokens).toFixed(3))
        : 0;

    const record: ImUsageTelemetryRecord = {
      space,
      threadId,
      modelId,
      epochVersion,
      lastPromptTokens: promptTokens,
      lastCompletionTokens: completionTokens,
      lastCachedPromptTokens: cachedTokens,
      lastCacheHitRatio: Number(hitRatio.toFixed(3)),
      lastTimestamp: Date.now(),
      totalTurns,
      totalPromptTokens,
      totalCompletionTokens,
      totalCachedPromptTokens,
      overallCacheHitRatio,
    };

    telemetryStore.set(key, record);

    // 持久化至 SQLite ai_im_epoch_states (确保关闭抽屉或重启 App 仍能即时查阅)
    void imEpochRepository.saveTelemetry(space, threadId, JSON.stringify(record));

    // 通知活跃订阅者（设置抽屉动态刷新）
    const subs = telemetrySubscribers.get(key);
    if (subs) {
      for (const listener of subs) {
        try {
          listener(record);
        } catch {}
      }
    }
  },

  getTurnUsageTelemetry(space: PixorySpace, threadId: string): ImUsageTelemetryRecord | null {
    if (!threadId) return null;
    return telemetryStore.get(`${space}:${threadId}`) ?? null;
  },

  async loadTurnUsageTelemetry(space: PixorySpace, threadId: string): Promise<ImUsageTelemetryRecord | null> {
    if (!threadId) return null;
    const key = `${space}:${threadId}`;
    const cached = telemetryStore.get(key);
    if (cached) return cached;

    const raw = await imEpochRepository.loadTelemetry(space, threadId);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as ImUsageTelemetryRecord;
      if (parsed && typeof parsed === 'object') {
        if (parsed.totalTurns === undefined) {
          parsed.totalTurns = 1;
          parsed.totalPromptTokens = parsed.lastPromptTokens || 0;
          parsed.totalCompletionTokens = parsed.lastCompletionTokens || 0;
          parsed.totalCachedPromptTokens = parsed.lastCachedPromptTokens || 0;
          parsed.overallCacheHitRatio = parsed.lastCacheHitRatio || 0;
        }
        telemetryStore.set(key, parsed);
        return parsed;
      }
    } catch {}

    return null;
  },

  subscribe(key: string, listener: (rec: ImUsageTelemetryRecord) => void): () => void {
    let set = telemetrySubscribers.get(key);
    if (!set) {
      set = new Set();
      telemetrySubscribers.set(key, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set && set.size === 0) {
        telemetrySubscribers.delete(key);
      }
    };
  },
};
