import { compileEntityKnowledgeCluster } from '../../../core/memory/memoryMetabolismService';
import { invalidateRoleMemoryPrefetch } from '../../../core/memory/memoryPrefetchService';
import { memoryRepository } from '../../../core/memory/memoryRepository';
import { calculateMemorySimilarity } from '../../../core/memory/memorySieveGatekeeper';
import { initDatabase, type PixorySpace } from '../../../database/index';
import type { DiaryMemoryMetadata } from '../types';
import { setThreadPendingDiaryHook } from '../../repository/imThreadRepository';

const DIARY_MEMORY_SIMILARITY_THRESHOLD = 0.78;

function computeSimilaritySafe(a: string, b: string): number {
  if (typeof calculateMemorySimilarity === 'function') {
    return calculateMemorySimilarity(a, b);
  }
  if (!a || !b) return 0;
  const normalize = (t: string) => t.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  const normA = normalize(a);
  const normB = normalize(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  const setA = new Set(normA.split(''));
  const setB = new Set(normB.split(''));
  let hit = 0;
  for (const ch of setA) {
    if (setB.has(ch)) hit++;
  }
  return Number(((2 * hit) / (setA.size + setB.size)).toFixed(3));
}

export interface HarvestDiaryResult {
  factsCreated: number;
  episodesCreated: number;
  hookStored: string | null;
}

/**
 * 手账日记记忆反哺收割机 (Diary Memory Harvester)
 *
 * 核心职责：
 * 消除伴侣“日记失忆”漏洞。伴侣深夜在私密手账日记中提炼的：
 * 1. 用户偏好与习惯 (userPreferences) -> 沉淀为 SQLite 永久 L2_FACT 原子设定；
 * 2. 核心互动事件 (summary) -> 沉淀为 SQLite 永久 L2_EPISODE 情节事实；
 * 3. 待触发钩子 (hooks) -> 存入 ai_threads.pending_diary_hook，次日清晨作为 Zone 4 瞬态提示词注入对话。
 */
export async function harvestDiaryMemoryToL2(params: {
  space: PixorySpace;
  threadId: string;
  roleCardId: string;
  diaryDate: string;
  metadata: DiaryMemoryMetadata | null;
}): Promise<HarvestDiaryResult> {
  if (!params.metadata) {
    return { factsCreated: 0, episodesCreated: 0, hookStored: null };
  }

  const { space, threadId, roleCardId, diaryDate, metadata } = params;
  let factsCreated = 0;
  let episodesCreated = 0;
  const now = Date.now();
  const entities = metadata.keyEntities || [];

  const existingRecords =
    typeof memoryRepository.listMemories === 'function'
      ? await memoryRepository.listMemories(roleCardId, space).catch(() => [])
      : [];
  const activeFacts = existingRecords.filter(
    (m) => !m.deletedAt && !m.supersededBy && m.tier === 'L2_FACT'
  );
  const activeEpisodes = existingRecords.filter(
    (m) =>
      !m.deletedAt &&
      !m.supersededBy &&
      (m.tier === 'L2_EPISODE' || m.tier === 'L2_EPISODIC')
  );
  let didUpdateExisting = false;

  const findSimilarRecord = (
    pool: Array<{ id?: string; content: string }>,
    candidateContent: string,
    stripPrefixRegex?: RegExp
  ) => {
    const candidateBody = stripPrefixRegex
      ? candidateContent.replace(stripPrefixRegex, '').trim()
      : candidateContent;
    for (const item of pool) {
      if (computeSimilaritySafe(item.content, candidateContent) >= DIARY_MEMORY_SIMILARITY_THRESHOLD) {
        return item;
      }
      if (stripPrefixRegex) {
        const existingBody = item.content.replace(stripPrefixRegex, '').trim();
        if (
          existingBody &&
          candidateBody &&
          computeSimilaritySafe(existingBody, candidateBody) >= DIARY_MEMORY_SIMILARITY_THRESHOLD
        ) {
          return item;
        }
      }
    }
    return null;
  };

  // 1. 沉淀用户习惯与偏好 -> L2_FACT (带相似度去重合并与扩展概念词)
  if (Array.isArray(metadata.userPreferences) && metadata.userPreferences.length > 0) {
    for (const pref of metadata.userPreferences) {
      const cleanPref = pref?.trim();
      if (!cleanPref) continue;

      const candidateContent = `用户偏好: ${cleanPref}`;
      const matched = findSimilarRecord(activeFacts, candidateContent, /^用户偏好:\s*/);
      if (matched) {
        if (
          matched.id &&
          candidateContent.length > matched.content.length + 4 &&
          typeof memoryRepository.updateMemoryContent === 'function'
        ) {
          await memoryRepository.updateMemoryContent(space, matched.id, candidateContent, {
            skipPrefetchInvalidation: true,
          });
          matched.content = candidateContent;
          didUpdateExisting = true;
        }
        continue;
      }

      // 提取核心关键词作为检索 triggers
      const triggers = Array.from(
        new Set([...entities, cleanPref.slice(0, 10), '偏好', '习惯'])
      );

      const factId = `mem_fact_diary_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const record = {
        id: factId,
        roleCardId,
        space,
        tier: 'L2_FACT' as const,
        category: 'user_preference',
        content: candidateContent,
        triggerKeywords: triggers,
        entities,
        importance: 8,
        hitCount: 0,
        isPinned: false,
        createdAt: now,
        lastAccessedAt: now,
        sourceMode: 'im' as const,
      };
      await memoryRepository.saveMemory(record, space);
      activeFacts.push(record);
      factsCreated++;
    }
  }

  // 2. 沉淀当日核心事件纪事 -> L2_EPISODE (仅同日内相似度去重合并，保留跨日期的多天情景以供知识簇聚类编译)
  if (metadata.summary && metadata.summary.trim()) {
    const cleanSummary = metadata.summary.trim();
    const candidateContent = `${diaryDate} 手账纪事: ${cleanSummary}`;
    const sameDayEpisodes = activeEpisodes.filter((m) =>
      m.content.startsWith(`${diaryDate} `)
    );
    const matched = findSimilarRecord(
      sameDayEpisodes,
      candidateContent,
      /^\d{4}-\d{2}-\d{2}\s*手账纪事:\s*/
    );

    if (matched) {
      if (
        matched.id &&
        candidateContent.length > matched.content.length + 4 &&
        typeof memoryRepository.updateMemoryContent === 'function'
      ) {
        await memoryRepository.updateMemoryContent(space, matched.id, candidateContent, {
          skipPrefetchInvalidation: true,
        });
        matched.content = candidateContent;
        didUpdateExisting = true;
      }
    } else {
      const triggers = Array.from(
        new Set([...entities, diaryDate, '手账', '日记', '那天'])
      );

      const episodeId = `mem_ep_diary_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const record = {
        id: episodeId,
        roleCardId,
        space,
        tier: 'L2_EPISODE' as const,
        category: 'daily_diary_summary',
        content: candidateContent,
        triggerKeywords: triggers,
        entities,
        importance: 7,
        hitCount: 0,
        isPinned: false,
        createdAt: now,
        lastAccessedAt: now,
        sourceMode: 'im' as const,
      };
      await memoryRepository.saveMemory(record, space);
      activeEpisodes.push(record);
      episodesCreated++;
    }
  }

  // 3. 记录次日未闭合话题钩子 -> 写入 ai_threads.pending_diary_hook
  const hook = metadata.hooks?.[0]?.trim() || null;
  if (hook) {
    await setThreadPendingDiaryHook(space, threadId, hook);
  }

  // 4. 事件驱动知识编译：若手账反哺新增或更新了长期记忆，即时凝聚知识簇并刷新预热图谱
  if (factsCreated > 0 || episodesCreated > 0 || didUpdateExisting) {
    try {
      if (typeof invalidateRoleMemoryPrefetch === 'function') {
        invalidateRoleMemoryPrefetch(space, roleCardId);
      }
      const db = await initDatabase(space);
      if (typeof compileEntityKnowledgeCluster === 'function') {
        await compileEntityKnowledgeCluster(db, roleCardId, space, {
          entityHint: entities,
          nowMs: now,
        });
      }
    } catch {
      // 非阻断降级：部分单测环境仅注入 memoryRepository 桩对象而不提供 sqlite 连接
    }
  }

  return {
    factsCreated,
    episodesCreated,
    hookStored: hook,
  };
}
