import { memoryRepository } from '../../../core/memory/memoryRepository';
import type { PixorySpace } from '../../../database/index';
import type { DiaryMemoryMetadata } from '../types';
import { setThreadPendingDiaryHook } from '../../repository/imThreadRepository';

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

  // 1. 沉淀用户习惯与偏好 -> L2_FACT (带实体与扩展概念词)
  if (Array.isArray(metadata.userPreferences) && metadata.userPreferences.length > 0) {
    for (const pref of metadata.userPreferences) {
      const cleanPref = pref?.trim();
      if (!cleanPref) continue;

      // 提取核心关键词作为检索 triggers
      const triggers = Array.from(
        new Set([...entities, cleanPref.slice(0, 10), '偏好', '习惯'])
      );

      const factId = `mem_fact_diary_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await memoryRepository.saveMemory(
        {
          id: factId,
          roleCardId,
          space,
          tier: 'L2_FACT',
          category: 'user_preference',
          content: `用户偏好: ${cleanPref}`,
          triggerKeywords: triggers,
          entities,
          importance: 8,
          hitCount: 0,
          isPinned: false,
          createdAt: now,
          lastAccessedAt: now,
          sourceMode: 'im',
        },
        space
      );
      factsCreated++;
    }
  }

  // 2. 沉淀当日核心事件纪事 -> L2_EPISODE
  if (metadata.summary && metadata.summary.trim()) {
    const cleanSummary = metadata.summary.trim();
    const triggers = Array.from(
      new Set([...entities, diaryDate, '手账', '日记', '那天'])
    );

    const episodeId = `mem_ep_diary_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await memoryRepository.saveMemory(
      {
        id: episodeId,
        roleCardId,
        space,
        tier: 'L2_EPISODE',
        category: 'daily_diary_summary',
        content: `${diaryDate} 手账纪事: ${cleanSummary}`,
        triggerKeywords: triggers,
        entities,
        importance: 7,
        hitCount: 0,
        isPinned: false,
        createdAt: now,
        lastAccessedAt: now,
        sourceMode: 'im',
      },
      space
    );
    episodesCreated++;
  }

  // 3. 记录次日未闭合话题钩子 -> 写入 ai_threads.pending_diary_hook
  const hook = metadata.hooks?.[0]?.trim() || null;
  if (hook) {
    await setThreadPendingDiaryHook(space, threadId, hook);
  }

  return {
    factsCreated,
    episodesCreated,
    hookStored: hook,
  };
}
