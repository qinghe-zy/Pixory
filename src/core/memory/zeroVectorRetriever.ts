import { initDatabase, type PixorySpace } from '../../database/index';
import { memoryRepository } from './memoryRepository';
import { scoreCompanionMemory, sanitizeAndExtractFtsTerms } from './memoryScorer';
import type { MemoryRecallCandidate, TurnMemoryIntentProfile } from './memoryTypes';

export { scoreCompanionMemory, sanitizeAndExtractFtsTerms };

/**
 * 计算两个文本片段的 2-gram Jaccard 相似度 (0~1.0)
 */
export function compute2GramJaccardSimilarity(textA: string, textB: string): number {
  if (!textA || !textB) return 0;
  const setA = new Set<string>();
  const setB = new Set<string>();
  for (let i = 0; i < textA.length - 1; i++) setA.add(textA.slice(i, i + 2));
  for (let i = 0; i < textB.length - 1; i++) setB.add(textB.slice(i, i + 2));
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const gram of setA) {
    if (setB.has(gram)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * 最大边际相关性多样性选择器 (Maximal Marginal Relevance, lambda=0.72)
 * 兼顾高相关度打分与语义去重，杜绝多条相似记忆重复挤占 Layer 4 上下文预算
 */
export function selectDiverseMemoriesMMR(
  candidates: MemoryRecallCandidate[],
  limit: number,
  lambda: number = 0.72
): MemoryRecallCandidate[] {
  if (candidates.length <= limit) return candidates;

  const selected: MemoryRecallCandidate[] = [];
  const remaining = [...candidates];

  // 首条选择绝对打分最高的代表性记忆
  selected.push(remaining.shift()!);

  while (selected.length < limit && remaining.length > 0) {
    let bestIdx = -1;
    let bestMmrScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      let maxSim = 0;
      for (const sel of selected) {
        const sim = compute2GramJaccardSimilarity(candidate.content, sel.content);
        if (sim > maxSim) maxSim = sim;
      }

      // MMR(c) = lambda * Score(c) - (1 - lambda) * maxSim
      const mmrScore = lambda * candidate.score - (1 - lambda) * maxSim;
      if (mmrScore > bestMmrScore) {
        bestMmrScore = mmrScore;
        bestIdx = i;
      }
    }

    if (bestIdx !== -1) {
      selected.push(remaining.splice(bestIdx, 1)[0]);
    } else {
      break;
    }
  }

  return selected;
}

export async function retrieveRelevantMemories(
  roleCardId: string,
  space: PixorySpace,
  userInput: string,
  limit: number = 3,
  intentProfile?: TurnMemoryIntentProfile
): Promise<MemoryRecallCandidate[]> {
  // 意图路由门控：若判定为极短闲聊/语气词，直接 0 召回（0 检索开销、0 噪音）
  if (intentProfile && intentProfile.topK === 0) {
    return [];
  }

  const effectiveLimit = intentProfile ? intentProfile.topK : limit;
  const scoreThreshold = intentProfile?.scoreThreshold ?? 0.18;

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

  // 3. 多通道综合打分 (复用已提取的中文实词 N-Gram，避免循环内重复切词)
  const candidates: MemoryRecallCandidate[] = [];
  const now = Date.now();
  for (const mem of memories) {
    const scored = scoreCompanionMemory(mem, userInput, now, ftsIds, terms);
    if (!scored) continue;

    let adjustedScore = scored.score;
    if (intentProfile?.boostCategory === 'preference' || intentProfile?.boostCategory === 'fact') {
      if (mem.tier === 'L2_FACT') adjustedScore *= 1.25;
    } else if (intentProfile?.boostCategory === 'episode') {
      if (mem.tier === 'L2_EPISODE' || mem.tier === 'L2_EPISODIC') adjustedScore *= 1.25;
    } else if (intentProfile?.boostCategory === 'diary') {
      if (mem.category.includes('diary') || mem.tier === 'L2_EPISODE' || mem.tier === 'L2_EPISODIC') {
        adjustedScore *= 1.35;
      }
    }

    // 检索激活断头台（Forgetting Floor）：解耦判定时间衰减与相关性，杜绝模糊记忆被误杀
    const decayFactor = scored.decayFactor !== undefined ? scored.decayFactor : 1.0;
    const baseRelevance = scored.baseRelevance !== undefined ? scored.baseRelevance : 1.0;
    const isForgotten = decayFactor < 0.30 || baseRelevance < 0.35 || adjustedScore < 0.12;
    if (isForgotten) {
      continue;
    }

    if (adjustedScore >= scoreThreshold) {
      candidates.push({
        ...scored,
        score: Number(adjustedScore.toFixed(4)),
      });
    }
  }

  // 4. 排序并通过 MMR 多样性筛选 Top N
  candidates.sort((a, b) => b.score - a.score);
  const topResults = selectDiverseMemoriesMMR(candidates, effectiveLimit);

  // 5. 最终选定集闭环回写：仅对真正通过漏斗进入 Top-K 且相关度充沛 (baseRelevance >= 0.45) 的记忆累加命中
  const hitsToRecord = topResults
    .filter((r) => (r.baseRelevance !== undefined ? r.baseRelevance >= 0.45 : r.score >= 0.25))
    .map((r) => r.id);
  if (hitsToRecord.length > 0) {
    memoryRepository.recordHits(hitsToRecord, space).catch(() => {});
  }

  return topResults;
}
