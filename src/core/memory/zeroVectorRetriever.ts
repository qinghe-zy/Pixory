import { initDatabase, type PixorySpace } from '../../database';
import { memoryRepository } from './memoryRepository';
import { scoreCompanionMemory, sanitizeAndExtractFtsTerms } from './memoryScorer';
import type { MemoryRecallCandidate } from './memoryTypes';

export { scoreCompanionMemory, sanitizeAndExtractFtsTerms };

export async function retrieveRelevantMemories(
  roleCardId: string,
  space: PixorySpace,
  userInput: string,
  limit: number = 3
): Promise<MemoryRecallCandidate[]> {
  const db = await initDatabase(space);

  // 1. 获取该角色下的全部 L2 记忆 (通常在 50~200 条，内存耗时 < 0.3ms)
  const memories = await memoryRepository.listMemories(roleCardId, space, 'L2_EPISODIC');
  if (memories.length === 0) {
    return [];
  }

  // 2. FTS5 安全匹配 (通道 2)
  const ftsIds = new Set<string>();
  const terms = sanitizeAndExtractFtsTerms(userInput);
  if (terms.length > 0) {
    try {
      const ftsQuery = terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ');
      const ftsRows = await db.getAllAsync<{ memory_id: string }>(
        'SELECT memory_id FROM ai_companion_memories_fts WHERE ai_companion_memories_fts MATCH ? LIMIT 10',
        ftsQuery
      );
      for (const r of ftsRows) {
        ftsIds.add(r.memory_id);
      }
    } catch {
      // 容错: 若 FTS 语法解析异常直接降级，依赖内存通道
    }
  }

  // 3. 多通道综合打分
  const candidates: MemoryRecallCandidate[] = [];
  const now = Date.now();
  for (const mem of memories) {
    const scored = scoreCompanionMemory(mem, userInput, now, ftsIds);
    if (scored && scored.score > 0.05) {
      candidates.push(scored);
    }
  }

  // 4. 排序并取 Top N
  candidates.sort((a, b) => b.score - a.score);
  const topResults = candidates.slice(0, limit);

  // 5. 异步回写访问计数 (零等待)
  if (topResults.length > 0) {
    memoryRepository.recordHits(topResults.map((r) => r.id), space).catch(() => {});
  }

  return topResults;
}
