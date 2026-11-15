import type { CompanionMemoryRecord } from '../../core/memory/memoryTypes';
import {
  checkCommitmentFollowupStatus,
  extractCommitmentFromUserText,
  type ExtractedCommitment,
} from './commitmentExtractor';
import { ACTIVE_ARC_MAX_TOKENS, estimateImTokens } from './imTokenBudgetController';

export const ACTIVE_ARC_SLOT_CATEGORY = 'active_arc_ledger';
export const ACTIVE_ARC_SLOT_MAX_ITEMS = 10;

export type ActiveArcStatus = 'pending' | 'done';

export interface ActiveArcEntry {
  id: string;
  title: string;
  dueAt: number;
  rawTimeExpr: string;
  sourceText: string;
  status: ActiveArcStatus;
  createdAt: number;
  updatedAt: number;
}

export interface ActiveArcStorageOptions {
  alreadySieved?: boolean;
  skipPrefetchInvalidation?: boolean;
}

export interface ActiveArcStoragePort {
  listMemories: (
    roleCardId: string,
    space: 'normal' | 'personal',
    tier?: CompanionMemoryRecord['tier']
  ) => Promise<CompanionMemoryRecord[]>;
  saveMemory: (
    record: CompanionMemoryRecord,
    space: 'normal' | 'personal',
    options?: ActiveArcStorageOptions
  ) => Promise<void>;
  updateMemoryContent: (
    id: string,
    newContent: string,
    space: 'normal' | 'personal',
    options?: ActiveArcStorageOptions
  ) => Promise<void>;
  buildSlotId?: (roleCardId: string, space: 'normal' | 'personal', slotKey: string) => string;
}

/**
 * 安全反序列化动态 Arc 账本槽位内容，容忍历史坏 JSON 或非数组格式，绝不抛出异常
 */
export function parseArcSlotPayload(rawContent: string | null | undefined): ActiveArcEntry[] {
  if (!rawContent || typeof rawContent !== 'string') return [];
  try {
    const parsed = JSON.parse(rawContent);
    if (!Array.isArray(parsed)) return [];
    const cleaned: ActiveArcEntry[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        typeof item.title === 'string' &&
        item.title.trim().length > 0 &&
        typeof item.dueAt === 'number' &&
        Number.isFinite(item.dueAt)
      ) {
        cleaned.push({
          id: typeof item.id === 'string' && item.id ? item.id : `arc_${item.dueAt}`,
          title: item.title.trim().slice(0, 60),
          dueAt: item.dueAt,
          rawTimeExpr: typeof item.rawTimeExpr === 'string' ? item.rawTimeExpr : '',
          sourceText: typeof item.sourceText === 'string' ? item.sourceText.slice(0, 100) : '',
          status: item.status === 'done' ? 'done' : 'pending',
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : item.dueAt,
          updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : item.dueAt,
        });
      }
    }
    return cleaned;
  } catch {
    return [];
  }
}

export function formatArcSlotPayload(entries: ActiveArcEntry[]): string {
  const sorted = [...entries]
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(-ACTIVE_ARC_SLOT_MAX_ITEMS);
  return JSON.stringify(sorted);
}

/**
 * 将新抽取的用户约定幂等合并进动态账本（去重同名/同日近似约定并淘汰超 48h 过期项）
 */
export function upsertCommitmentIntoArcs(
  existing: ActiveArcEntry[],
  commitment: ExtractedCommitment,
  nowMs: number = Date.now()
): ActiveArcEntry[] {
  const fresh = existing.filter((entry) => {
    if (entry.status === 'done' && nowMs - entry.updatedAt > 12 * 3600 * 1000) return false;
    return nowMs - entry.dueAt <= 48 * 3600 * 1000;
  });

  const normalizedTitle = commitment.title.trim().toLowerCase();
  const existingIdx = fresh.findIndex(
    (entry) =>
      entry.status !== 'done' &&
      (entry.title.trim().toLowerCase() === normalizedTitle ||
        normalizedTitle.includes(entry.title.trim().toLowerCase())) &&
      Math.abs(entry.dueAt - commitment.dueAt) <= 18 * 3600 * 1000
  );

  if (existingIdx !== -1) {
    const current = fresh[existingIdx];
    fresh[existingIdx] = {
      ...current,
      title: commitment.title.trim(),
      dueAt: commitment.dueAt,
      rawTimeExpr: commitment.rawTimeExpr,
      sourceText: commitment.sourceText.slice(0, 100),
      updatedAt: nowMs,
    };
    return fresh;
  }

  fresh.push({
    id: `arc_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
    title: commitment.title.trim().slice(0, 60),
    dueAt: commitment.dueAt,
    rawTimeExpr: commitment.rawTimeExpr,
    sourceText: commitment.sourceText.slice(0, 100),
    status: 'pending',
    createdAt: nowMs,
    updatedAt: nowMs,
  });

  return fresh;
}

/**
 * 渲染注入 Layer 4 瞬态感知区的“当前活跃待办/承诺关怀账本”（严格 <= maxTokens）
 * 解耦静态画像 (Layer 2) 与高频变化的近期进行时约定 (Layer 4)
 */
export function buildActiveArcLedgerNotice(
  l1Slots: CompanionMemoryRecord[],
  nowMs: number = Date.now(),
  maxTokens: number = ACTIVE_ARC_MAX_TOKENS
): string | null {
  if (!l1Slots || l1Slots.length === 0 || maxTokens <= 20) {
    return null;
  }

  const arcSlots = l1Slots.filter((slot) => slot.category === ACTIVE_ARC_SLOT_CATEGORY);
  if (arcSlots.length === 0) return null;

  const allEntries: ActiveArcEntry[] = [];
  for (const slot of arcSlots) {
    allEntries.push(...parseArcSlotPayload(slot.content));
  }

  const activeItems = allEntries
    .filter((entry) => entry.status !== 'done')
    .map((entry) => ({
      entry,
      windowStatus: checkCommitmentFollowupStatus(entry.dueAt, nowMs),
    }))
    .filter(({ entry, windowStatus }) => {
      if (windowStatus === 'expired') return false;
      // 展示处于待关怀窗口的事项，或未来 5 天内即将发生的进行时约定
      const futureDelta = entry.dueAt - nowMs;
      return (
        windowStatus === 'imminent' ||
        windowStatus === 'post_check' ||
        (futureDelta > 0 && futureDelta <= 5 * 24 * 3600 * 1000)
      );
    })
    .sort((a, b) => {
      const prio = (s: string) => (s === 'imminent' || s === 'post_check' ? 0 : 1);
      const diff = prio(a.windowStatus) - prio(b.windowStatus);
      if (diff !== 0) return diff;
      return a.entry.dueAt - b.entry.dueAt;
    });

  if (activeItems.length === 0) return null;

  const lines: string[] = [];
  let runningText = '[近期进行时约定与待关怀账本]';

  for (const { entry, windowStatus } of activeItems) {
    let statusLabel = `即将到来(${entry.rawTimeExpr || '近期'})`;
    if (windowStatus === 'imminent') {
      statusLabel = '距离约定时间不足45分钟';
    } else if (windowStatus === 'post_check') {
      statusLabel = '刚过约定时间';
    }
    const line = `- [${statusLabel}] ${entry.title}`;
    const candidateText = `${runningText}\n${line}`;
    if (estimateImTokens(candidateText) > maxTokens) {
      break;
    }
    lines.push(line);
    runningText = candidateText;
  }

  return lines.length > 0 ? runningText : null;
}

function createDefaultActiveArcStorage(): ActiveArcStoragePort {
  // 运行时延迟加载避免本服务被纯算法单元测试加载时引入 sqlite 依赖
  const repo = require('../../core/memory/memoryRepository').memoryRepository;
  return {
    listMemories: (roleCardId, space, tier) => repo.listMemories(roleCardId, space, tier),
    saveMemory: (record, space, opts) => repo.saveMemory(record, space, opts),
    // 修复参数顺序错位：memoryRepository.updateMemoryContent 签名为 (space, id, newContent, options)
    updateMemoryContent: (id, newContent, space, opts) =>
      repo.updateMemoryContent(space, id, newContent, opts),
    buildSlotId: typeof repo.buildCompanionL1SlotId === 'function' ? repo.buildCompanionL1SlotId : undefined,
  };
}

/**
 * 生产链路单轮用户发言承诺捕获与 L1_SLOT 账本落库
 */
export async function ingestUserTurnCommitment(
  roleCardId: string,
  space: 'normal' | 'personal',
  userText: string,
  options: { storage?: ActiveArcStoragePort; nowMs?: number; skipPrefetchInvalidation?: boolean } = {}
): Promise<ActiveArcEntry | null> {
  const nowMs = options.nowMs ?? Date.now();
  const extracted = extractCommitmentFromUserText(userText, nowMs);
  if (!extracted) {
    return null;
  }

  const storage = options.storage ?? createDefaultActiveArcStorage();
  const writeOptions: ActiveArcStorageOptions = {
    alreadySieved: true,
    skipPrefetchInvalidation: options.skipPrefetchInvalidation,
  };

  const l1Slots = await storage.listMemories(roleCardId, space, 'L1_SLOT');
  const existingSlot = l1Slots.find((s) => s.category === ACTIVE_ARC_SLOT_CATEGORY);
  const currentEntries = existingSlot ? parseArcSlotPayload(existingSlot.content) : [];
  const nextEntries = upsertCommitmentIntoArcs(currentEntries, extracted, nowMs);
  const serialized = formatArcSlotPayload(nextEntries);

  if (existingSlot) {
    await storage.updateMemoryContent(existingSlot.id, serialized, space, writeOptions);
  } else {
    const slotId =
      typeof storage.buildSlotId === 'function'
        ? storage.buildSlotId(roleCardId, space, ACTIVE_ARC_SLOT_CATEGORY)
        : `slot_${roleCardId}_${space}_${ACTIVE_ARC_SLOT_CATEGORY}`;
    await storage.saveMemory(
      {
        id: slotId,
        roleCardId,
        space,
        tier: 'L1_SLOT',
        category: ACTIVE_ARC_SLOT_CATEGORY,
        content: serialized,
        triggerKeywords: [extracted.title, extracted.rawTimeExpr],
        entities: [extracted.title],
        importance: 7,
        hitCount: 0,
        isPinned: false,
        createdAt: nowMs,
        lastAccessedAt: nowMs,
        sourceMode: 'im',
      },
      space,
      writeOptions
    );
  }

  return nextEntries[nextEntries.length - 1] || null;
}
