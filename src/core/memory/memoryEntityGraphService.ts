import type { CompanionMemoryRecord } from './memoryTypes';

export type GraphMemoryNodeInput = Pick<
  CompanionMemoryRecord,
  'id' | 'content' | 'entities' | 'importance'
> & {
  triggerKeywords?: string[];
  hitCount?: number;
  isPinned?: boolean;
  tier?: CompanionMemoryRecord['tier'];
};

export interface EntityCooccurrenceGraph {
  adj: Map<string, Map<string, number>>;
  entityMemoryMap: Map<string, Set<string>>;
  entityLabels: Map<string, string>;
  nodeCount: number;
  edgeCount: number;
  memoryCount: number;
}

export interface PprEntityScore {
  entity: string;
  label: string;
  score: number;
  hop: 1 | 2;
  viaEntity: string;
}

export interface PprOptions {
  damping?: number;
  iterations?: number;
  maxSeedEntities?: number;
  topK?: number;
}

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  memoryCount: number;
  topEntities: Array<{ entity: string; degree: number; memoryCount: number }>;
}

const MAX_ENTITIES_PER_MEMORY = 16;
const MAX_EXTRACTED_ENTITIES = 12;

const GRAPH_ENTITY_STOPWORDS = new Set([
  '我', '你', '他', '她', '它', '我们', '你们', '他们', '她们', '自己',
  '今天', '昨天', '明天', '后天', '前天', '刚才', '现在', '最近', '以后', '之前', '之后',
  '早上', '中午', '下午', '晚上', '夜里', '周末', '下周', '这周',
  '事情', '东西', '时候', '地方', '问题', '感觉', '觉得', '知道', '以为', '希望', '喜欢', '讨厌',
  '可以', '应该', '可能', '有点', '一些', '很多', '非常', '特别', '真的', '已经', '还是', '但是', '因为', '所以',
  '这个', '那个', '什么', '怎么', '为什么', '哪里', '一直', '一起', '一下', '一次',
]);

const ENTITY_CONNECTIVE_SPLIT_REGEX = /[\s,，。、；;：:！!？?（）()【】\[\]「」"'‘’“”/\\|]+/;
// 多字常见词组（喜欢/看见）必须放在 alternation 中，避免字符类 [喜欢] 把“欢欢”“惊喜”等正常实体拆碎
const CN_FUNCTION_PARTICLES_REGEX =
  /(?:喜欢|看见|[的了呢啊吗吧呀哦嗯哈唔噢哎喂是在有就都也很去把被让给和与跟对向往从到得着过想说做看])+/g;
const LATIN_ENTITY_REGEX = /\b[A-Za-z][A-Za-z0-9_-]{1,23}\b/g;

/**
 * 规范化图谱实体名称，去除前缀与首尾标点，避免大小写/空白导致的幽灵分裂节点
 */
export function normalizeGraphEntity(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const stripped = raw
    .replace(/^entity:/i, '')
    .replace(/^[\s"'`#【\[\]()（）<>]+|[\s"'`#】\]\[()（）<>]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped || stripped.length < 2 || stripped.length > 32) {
    return '';
  }
  // 过滤纯数字或纯符号
  if (/^[\d\p{P}\p{S}\s]+$/u.test(stripped)) {
    return '';
  }
  const lower = stripped.toLowerCase();
  if (GRAPH_ENTITY_STOPWORDS.has(lower)) {
    return '';
  }
  return lower;
}

/**
 * 零 LLM 依赖的轻量实体抽取器：用于补齐手动记忆/遗留记忆缺失的实体标签，以及从用户输入抽取种子实体
 */
export function extractLightEntitiesFromText(
  text: string,
  extraKeywords: string[] = []
): string[] {
  const resultMap = new Map<string, string>();

  const pushCandidate = (raw: string) => {
    const norm = normalizeGraphEntity(raw);
    if (!norm || resultMap.has(norm)) return;
    resultMap.set(norm, raw.replace(/^entity:/i, '').trim() || norm);
  };

  for (const kw of extraKeywords) {
    if (resultMap.size >= MAX_EXTRACTED_ENTITIES) break;
    pushCandidate(kw);
  }

  if (text && typeof text === 'string') {
    const boundedText = text.slice(0, 600);

    // 1. 提取英文/数字混合标识实体（品牌、专有名词、模型/项目代号等）
    const latinMatches = boundedText.match(LATIN_ENTITY_REGEX) || [];
    for (const token of latinMatches) {
      if (resultMap.size >= MAX_EXTRACTED_ENTITIES) break;
      pushCandidate(token);
    }

    // 2. 基于标点与虚词切分提取中文紧凑短实体词组 (2..6 字)
    const clauses = boundedText.split(ENTITY_CONNECTIVE_SPLIT_REGEX);
    for (const clause of clauses) {
      if (!clause) continue;
      const trimmedClause = clause.trim();
      if (trimmedClause.length >= 2 && trimmedClause.length <= 6) {
        pushCandidate(trimmedClause);
      }
      const subParts = trimmedClause.split(CN_FUNCTION_PARTICLES_REGEX);
      for (const part of subParts) {
        if (resultMap.size >= MAX_EXTRACTED_ENTITIES) break;
        const cleanPart = part.trim();
        if (cleanPart.length >= 2 && cleanPart.length <= 6) {
          pushCandidate(cleanPart);
        } else if (cleanPart.length > 6) {
          // 对超长无空格中文片段取首尾核心 2-4 字实体窗口
          pushCandidate(cleanPart.slice(0, 3));
          pushCandidate(cleanPart.slice(-3));
          if (cleanPart.length >= 4) {
            pushCandidate(cleanPart.slice(-2));
            pushCandidate(cleanPart.slice(0, 2));
          }
        }
      }
      if (resultMap.size >= MAX_EXTRACTED_ENTITIES) break;
    }
  }

  return Array.from(resultMap.keys()).slice(0, MAX_EXTRACTED_ENTITIES);
}

/**
 * 统一解析记忆节点的标准化图谱实体集合（与建图、打分共享同一归一化视图，杜绝分歧）
 */
export function resolveMemoryGraphEntities(
  mem: Pick<GraphMemoryNodeInput, 'entities' | 'content' | 'triggerKeywords'>
): Array<{ norm: string; label: string }> {
  const rawList =
    Array.isArray(mem.entities) && mem.entities.length > 0
      ? mem.entities
      : extractLightEntitiesFromText(mem.content, mem.triggerKeywords || []);

  const result: Array<{ norm: string; label: string }> = [];
  const seen = new Set<string>();
  for (const raw of rawList) {
    const norm = normalizeGraphEntity(raw);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    const label = raw.replace(/^entity:/i, '').trim() || norm;
    result.push({ norm, label });
    if (result.length >= MAX_ENTITIES_PER_MEMORY) break;
  }
  return result;
}

/**
 * 从全量活跃记忆构建无向加权实体共现图
 */
export function buildEntityCooccurrenceGraph(
  memories: GraphMemoryNodeInput[]
): EntityCooccurrenceGraph {
  const adj = new Map<string, Map<string, number>>();
  const entityMemoryMap = new Map<string, Set<string>>();
  const entityLabels = new Map<string, string>();

  const ensureNode = (norm: string, label: string) => {
    if (!adj.has(norm)) {
      adj.set(norm, new Map<string, number>());
    }
    if (!entityMemoryMap.has(norm)) {
      entityMemoryMap.set(norm, new Set<string>());
    }
    if (!entityLabels.has(norm)) {
      entityLabels.set(norm, label);
    }
  };

  for (const mem of memories) {
    if (!mem || !mem.id) continue;

    const resolved = resolveMemoryGraphEntities(mem);
    const uniqueNodes: string[] = [];
    for (const { norm, label } of resolved) {
      ensureNode(norm, label);
      entityMemoryMap.get(norm)!.add(mem.id);
      uniqueNodes.push(norm);
    }

    if (uniqueNodes.length < 2) continue;

    const safeImportance = Number.isFinite(mem.importance)
      ? Math.max(1, Math.min(10, mem.importance))
      : 5;
    const pinnedWeight = mem.isPinned ? 1.2 : 1.0;
    const edgeWeight = (1 + 0.1 * safeImportance) * pinnedWeight;
    if (!Number.isFinite(edgeWeight) || edgeWeight <= 0) continue;

    for (let i = 0; i < uniqueNodes.length; i += 1) {
      for (let j = i + 1; j < uniqueNodes.length; j += 1) {
        const u = uniqueNodes[i];
        const v = uniqueNodes[j];
        if (u === v) continue;

        const uMap = adj.get(u)!;
        const vMap = adj.get(v)!;
        uMap.set(v, (uMap.get(v) || 0) + edgeWeight);
        vMap.set(u, (vMap.get(u) || 0) + edgeWeight);
      }
    }
  }

  let directedEdges = 0;
  for (const neighbors of adj.values()) {
    directedEdges += neighbors.size;
  }

  return {
    adj,
    entityMemoryMap,
    entityLabels,
    nodeCount: adj.size,
    edgeCount: Math.floor(directedEdges / 2),
    memoryCount: memories.length,
  };
}

/**
 * 在实体共现图上执行 Personalized PageRank，召回 1~2 跳关联潜伏实体及其桥接解释路径 (viaEntity)
 */
export function runPersonalizedPageRank(
  graph: EntityCooccurrenceGraph,
  seedEntities: string[],
  options: PprOptions = {}
): Map<string, PprEntityScore> {
  const result = new Map<string, PprEntityScore>();
  if (graph.nodeCount === 0 || seedEntities.length === 0) {
    return result;
  }

  const damping = Math.min(0.95, Math.max(0.5, options.damping ?? 0.85));
  const iterations = Math.min(12, Math.max(2, options.iterations ?? 6));
  const maxSeedEntities = Math.max(1, options.maxSeedEntities ?? 8);
  const topK = Math.max(1, options.topK ?? 15);

  // 1. 将输入种子实体映射到图节点（精确匹配优先，子串匹配次之）
  const seedWeights = new Map<string, number>();
  const graphNodes = Array.from(graph.adj.keys());

  for (const rawSeed of seedEntities) {
    const normSeed = normalizeGraphEntity(rawSeed);
    if (!normSeed) continue;

    if (graph.adj.has(normSeed)) {
      seedWeights.set(normSeed, Math.max(seedWeights.get(normSeed) || 0, 1.0));
    } else if (normSeed.length >= 2) {
      for (const node of graphNodes) {
        if (node.includes(normSeed) || normSeed.includes(node)) {
          seedWeights.set(node, Math.max(seedWeights.get(node) || 0, 0.65));
        }
      }
    }
    if (seedWeights.size >= maxSeedEntities) break;
  }

  if (seedWeights.size === 0) {
    return result;
  }

  let totalSeedWeight = 0;
  for (const w of seedWeights.values()) {
    totalSeedWeight += w;
  }
  if (totalSeedWeight <= 0 || !Number.isFinite(totalSeedWeight)) {
    return result;
  }

  // 个性化重启分布 p(node)
  const personalization = new Map<string, number>();
  let scores = new Map<string, number>();
  for (const node of graphNodes) {
    const p = (seedWeights.get(node) || 0) / totalSeedWeight;
    if (p > 0) {
      personalization.set(node, p);
      scores.set(node, p);
    } else {
      scores.set(node, 0);
    }
  }

  // 预计算每个节点的出边总权重（加权度），用于防除零守卫
  const outWeightSum = new Map<string, number>();
  for (const [node, neighbors] of graph.adj.entries()) {
    let sum = 0;
    for (const w of neighbors.values()) {
      if (Number.isFinite(w) && w > 0) sum += w;
    }
    outWeightSum.set(node, sum);
  }

  // 2. 幂迭代 (Power Iteration)
  for (let iter = 0; iter < iterations; iter += 1) {
    const nextScores = new Map<string, number>();
    let danglingMass = 0;

    for (const node of graphNodes) {
      const p = personalization.get(node) || 0;
      nextScores.set(node, (1 - damping) * p);
      if ((outWeightSum.get(node) || 0) <= 0) {
        danglingMass += scores.get(node) || 0;
      }
    }

    // 孤立节点质量全部回流给种子集合
    if (danglingMass > 0) {
      for (const [seedNode, p] of personalization.entries()) {
        nextScores.set(seedNode, (nextScores.get(seedNode) || 0) + damping * danglingMass * p);
      }
    }

    for (const [u, neighbors] of graph.adj.entries()) {
      const uScore = scores.get(u) || 0;
      const uTotal = outWeightSum.get(u) || 0;
      if (uScore <= 0 || uTotal <= 0) continue;

      for (const [v, edgeW] of neighbors.entries()) {
        if (!Number.isFinite(edgeW) || edgeW <= 0) continue;
        const transferred = damping * uScore * (edgeW / uTotal);
        if (Number.isFinite(transferred)) {
          nextScores.set(v, (nextScores.get(v) || 0) + transferred);
        }
      }
    }

    scores = nextScores;
  }

  // 3. 记录 1~2 跳最短跳数与最强桥接实体 (viaEntity)
  const hopMap = new Map<string, 1 | 2>();
  const viaMap = new Map<string, { via: string; weight: number }>();

  // 1-hop 邻接
  for (const seedNode of seedWeights.keys()) {
    const neighbors = graph.adj.get(seedNode);
    if (!neighbors) continue;
    for (const [n1, w] of neighbors.entries()) {
      if (seedWeights.has(n1)) continue;
      hopMap.set(n1, 1);
      const contrib = (scores.get(seedNode) || 0) * w;
      const prev = viaMap.get(n1);
      if (!prev || contrib > prev.weight) {
        viaMap.set(n1, { via: graph.entityLabels.get(seedNode) || seedNode, weight: contrib });
      }
    }
  }

  // 2-hop 邻接
  for (const [n1, hop] of Array.from(hopMap.entries())) {
    if (hop !== 1) continue;
    const neighbors = graph.adj.get(n1);
    if (!neighbors) continue;
    for (const [n2, w] of neighbors.entries()) {
      if (seedWeights.has(n2) || hopMap.get(n2) === 1) continue;
      hopMap.set(n2, 2);
      const contrib = (scores.get(n1) || 0) * w;
      const prev = viaMap.get(n2);
      if (!prev || contrib > prev.weight) {
        viaMap.set(n2, { via: graph.entityLabels.get(n1) || n1, weight: contrib });
      }
    }
  }

  // 4. 收集并归一化 1~2 跳激活分（排除已在输入文本中的种子自身）
  const rawCandidates: PprEntityScore[] = [];
  let maxNeighborScore = 0;

  for (const [node, hop] of hopMap.entries()) {
    const rawScore = scores.get(node) || 0;
    if (!Number.isFinite(rawScore) || rawScore <= 0) continue;
    if (rawScore > maxNeighborScore) maxNeighborScore = rawScore;
    rawCandidates.push({
      entity: node,
      label: graph.entityLabels.get(node) || node,
      score: rawScore,
      hop,
      viaEntity: viaMap.get(node)?.via || '',
    });
  }

  if (maxNeighborScore <= 0 || rawCandidates.length === 0) {
    return result;
  }

  rawCandidates.sort((a, b) => b.score - a.score);
  for (const item of rawCandidates.slice(0, topK)) {
    const normalized = Math.min(1.0, item.score / maxNeighborScore);
    if (!Number.isFinite(normalized) || normalized <= 0) continue;
    result.set(item.entity, {
      ...item,
      score: Number(normalized.toFixed(4)),
    });
  }

  return result;
}

/**
 * 统计当前图谱拓扑健康度与核心高频枢纽实体
 */
export function computeGraphStats(
  graph: EntityCooccurrenceGraph,
  topN: number = 5
): GraphStats {
  const entities: Array<{ entity: string; degree: number; memoryCount: number }> = [];
  for (const [node, neighbors] of graph.adj.entries()) {
    entities.push({
      entity: graph.entityLabels.get(node) || node,
      degree: neighbors.size,
      memoryCount: graph.entityMemoryMap.get(node)?.size || 0,
    });
  }
  entities.sort((a, b) => {
    if (b.memoryCount !== a.memoryCount) return b.memoryCount - a.memoryCount;
    return b.degree - a.degree;
  });

  return {
    nodeCount: graph.nodeCount,
    edgeCount: graph.edgeCount,
    memoryCount: graph.memoryCount,
    topEntities: entities.slice(0, Math.max(1, topN)),
  };
}
