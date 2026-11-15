import type { CompanionMemoryRecord } from '../../core/memory/memoryTypes';
import { normalizeGraphEntity } from '../../core/memory/memoryEntityGraphService';
import {
  ACTIVE_ARC_MAX_TOKENS,
  estimateImTokens,
  fitLayer2CoreFacts,
  fitLayer4Memories,
  LAYER_2_CATALOG_MAX_TOKENS,
  LAYER_2_MAX_TOKENS,
  LAYER_4_MAX_TOKENS,
  resolveBudgets,
  type ResolvedImBudgets,
} from './imContextBuilder';

export {
  ACTIVE_ARC_MAX_TOKENS,
  estimateImTokens,
  fitLayer2CoreFacts,
  fitLayer4Memories,
  LAYER_2_CATALOG_MAX_TOKENS,
  LAYER_2_MAX_TOKENS,
  LAYER_4_MAX_TOKENS,
  resolveBudgets,
  type ResolvedImBudgets,
};

/**
 * 从 L2 记忆集合构建严格封顶的 L2 话题目录索引（Index Catalog）
 *
 * 作用：在不全量灌入原文导致 Token 爆炸的前提下，为伴侣模型提供“记忆版图目录”，
 * 令模型知道有哪些深层实体/事件可感知，并可在必要时主动发起 [MEMORY_RECALL: 关键词] 下钻。
 */
export function buildTopicIndexCatalog(
  l2Memories: CompanionMemoryRecord[],
  excludeCoreFacts: CompanionMemoryRecord[] = [],
  maxTokens: number = LAYER_2_CATALOG_MAX_TOKENS
): string {
  if (!l2Memories || l2Memories.length === 0 || maxTokens <= 20) {
    return '';
  }

  const excludedIds = new Set(excludeCoreFacts.map((f) => f.id));
  const entityAgg = new Map<
    string,
    { label: string; count: number; maxImportance: number; pinnedBonus: number }
  >();

  for (const mem of l2Memories) {
    if (!mem || excludedIds.has(mem.id)) continue;
    const rawTags =
      Array.isArray(mem.entities) && mem.entities.length > 0
        ? mem.entities
        : (mem.triggerKeywords || []).slice(0, 3);

    const seenInMem = new Set<string>();
    for (const rawTag of rawTags) {
      const norm = normalizeGraphEntity(rawTag);
      if (!norm || seenInMem.has(norm)) continue;
      seenInMem.add(norm);
      const label = rawTag.replace(/^entity:/i, '').trim() || norm;
      const prev = entityAgg.get(norm);
      const imp = Number.isFinite(mem.importance) ? mem.importance : 5;
      const pin = mem.isPinned ? 2 : 0;
      if (prev) {
        prev.count += 1;
        prev.maxImportance = Math.max(prev.maxImportance, imp);
        prev.pinnedBonus = Math.max(prev.pinnedBonus, pin);
      } else {
        entityAgg.set(norm, {
          label,
          count: 1,
          maxImportance: imp,
          pinnedBonus: pin,
        });
      }
    }
  }

  if (entityAgg.size === 0) {
    return '';
  }

  const ranked = Array.from(entityAgg.values()).sort((a, b) => {
    const scoreA = a.count * 2 + a.maxImportance * 0.5 + a.pinnedBonus;
    const scoreB = b.count * 2 + b.maxImportance * 0.5 + b.pinnedBonus;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.label.localeCompare(b.label, 'zh-Hans-CN');
  });

  const prefix = '已知话题/实体目录：';
  const chips: string[] = [];
  let currentText = '';

  for (const item of ranked) {
    const chip = item.count > 1 ? `${item.label}(×${item.count})` : item.label;
    const nextText = chips.length === 0 ? `${prefix}${chip}` : `${currentText} · ${chip}`;
    if (estimateImTokens(nextText) > maxTokens) {
      break;
    }
    chips.push(chip);
    currentText = nextText;
  }

  return currentText;
}
