import { initDatabase, type PixorySpace } from '../../database/index';
import {
  buildEntityCooccurrenceGraph,
  extractLightEntitiesFromText,
  runPersonalizedPageRank,
  type EntityCooccurrenceGraph,
} from './memoryEntityGraphService';
import { getWarmedMemoryContext } from './memoryPrefetchService';
import { memoryRepository } from './memoryRepository';
import {
  compute2GramJaccardSimilarity,
  scoreCompanionMemory,
  sanitizeAndExtractFtsTerms,
} from './memoryScorer';
import type {
  CompanionMemoryRecord,
  MemoryRecallCandidate,
  TurnMemoryIntentProfile,
} from './memoryTypes';

export { compute2GramJaccardSimilarity, scoreCompanionMemory, sanitizeAndExtractFtsTerms };

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

export interface RetrieveRelevantMemoriesOptions {
  preloadedMemories?: CompanionMemoryRecord[];
  prebuiltGraph?: EntityCooccurrenceGraph;
  skipFtsQuery?: boolean;
  /** 仅用于前瞻注入预检索：禁止在模型实际回复/回显前提前递增 hit_count，避免与 verifyAndRecordEchoHits 重复累加 */
  skipHitRecording?: boolean;
}

export async function retrieveRelevantMemories(
  roleCardId: string,
  space: PixorySpace,
  userInput: string,
  limit: number = 3,
  intentProfile?: TurnMemoryIntentProfile,
  options?: RetrieveRelevantMemoriesOptions
): Promise<MemoryRecallCandidate[]> {
  // 意图路由门控：若判定为极短闲聊/语气词，直接 0 召回（0 检索开销、0 噪音）
  if (intentProfile && intentProfile.topK === 0) {
    return [];
  }

  const effectiveLimit = intentProfile ? intentProfile.topK : limit;
  const scoreThreshold = intentProfile?.scoreThreshold ?? 0.18;

  // 1. 优先命中异步预热缓存中的该角色 L2 记忆与实体共现图，未命中再回退读取仓储
  const warmed = options?.preloadedMemories
    ? null
    : getWarmedMemoryContext(space, roleCardId);
  const memories =
    options?.preloadedMemories ??
    warmed?.l2Memories ??
    (await memoryRepository.listMemories(roleCardId, space, 'L2_EPISODIC'));

  if (memories.length === 0) {
    return [];
  }

  const graph =
    options?.prebuiltGraph ??
    warmed?.graph ??
    buildEntityCooccurrenceGraph(memories);

  // 2. FTS5 安全匹配 (通道 2)
  const ftsIds = new Set<string>();
  const terms = sanitizeAndExtractFtsTerms(userInput);
  if (terms.length > 0 && !options?.skipFtsQuery) {
    try {
      const db = await initDatabase(space);
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

  // 3. 提取输入种子实体并运行 Personalized PageRank (通道 5: 1~2 跳实体图谱扩散)
  const lowerInput = userInput.toLowerCase();
  const seedEntities = new Set<string>(extractLightEntitiesFromText(userInput, terms));
  for (const node of graph.adj.keys()) {
    if (node.length >= 2 && lowerInput.includes(node)) {
      seedEntities.add(node);
    }
  }
  const pprEntityScores = runPersonalizedPageRank(graph, Array.from(seedEntities), {
    damping: 0.85,
    iterations: 6,
    topK: 15,
  });

  // 4. 多通道综合打分 (包含通道 5 图谱 1~2 跳扩散加分)
  const candidates: MemoryRecallCandidate[] = [];
  const now = Date.now();
  for (const mem of memories) {
    const scored = scoreCompanionMemory(mem, userInput, now, ftsIds, terms, pprEntityScores);
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

    // 检索激活断头台（Forgetting Floor）：解耦判定时间衰减与相关性，杜绝模糊记忆或图谱桥接记忆被误杀
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

  // 5. 排序并通过 MMR 多样性筛选 Top N
  candidates.sort((a, b) => b.score - a.score);
  const topResults = selectDiverseMemoriesMMR(candidates, effectiveLimit);

  // 6. 最终选定集闭环回写：仅对真正通过漏斗进入 Top-K 且相关度充沛 (baseRelevance >= 0.45) 的记忆累加命中
  const hitsToRecord = topResults
    .filter((r) => (r.baseRelevance !== undefined ? r.baseRelevance >= 0.45 : r.score >= 0.25))
    .map((r) => r.id);
  if (hitsToRecord.length > 0 && !options?.skipHitRecording && !options?.skipFtsQuery) {
    memoryRepository.recordHits(hitsToRecord, space).catch(() => {});
  }

  return topResults;
}
