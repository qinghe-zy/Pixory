import type { CompanionMemoryRecord, MemoryRecallCandidate } from './memoryTypes';

export const TEMPORAL_KEYWORDS = [
  '今天', '明天', '后天', '大后天', '昨晚', '刚才', '待会', '周末', '下周', '这周',
  '早上', '中午', '下午', '晚上', '夜里', '答辩', '考试', '出差', '约会', '生日', '纪念日', '月底', '下个月'
];

const NON_WORD_REGEX = /[^\p{L}\p{N}\s]+/gu;
const CN_STOP_CHARS_REGEX = /[的了呢啊吗吧呀哦嗯哈唔噢哎喂我你他她它是在有就都也很去把被让给和与跟对向往从到得着过]+/g;

/**
 * 安全净化并提取 FTS 搜索词（剥离标点符号与高频口语虚词，防语法 Crash，兼顾句首与句尾核心宾语实体）
 */
export function sanitizeAndExtractFtsTerms(text: string): string[] {
  const clean = text.replace(NON_WORD_REGEX, ' ').trim();
  if (!clean) return [];

  // 先按空格与高频虚词切分出实义片段，避免整句 15 字连成一串导致句尾核心词被截断
  const rawClauses = clean
    .split(/\s+/)
    .flatMap((part) => {
      const stripped = part.replace(CN_STOP_CHARS_REGEX, ' ').trim();
      return stripped ? stripped.split(/\s+/) : [part];
    })
    .filter((w) => w.length >= 2);

  const headTerms: string[] = [];
  const tailTerms: string[] = [];

  for (const word of rawClauses) {
    if (word.length >= 2 && word.length <= 4) {
      headTerms.push(word);
    } else if (word.length > 4) {
      const subTerms: string[] = [];
      for (let size = 2; size <= 3; size += 1) {
        for (let i = 0; i <= word.length - size; i += 1) {
          subTerms.push(word.slice(i, i + size));
        }
      }
      // 兼顾句首主语与句尾宾语（中文核心实体多位于句尾）
      const half = Math.ceil(subTerms.length / 2);
      headTerms.push(...subTerms.slice(0, half));
      tailTerms.push(...subTerms.slice(half).reverse());
    }
  }

  // 交错合并首尾词元，确保长句句尾实体 100% 纳入检索预算（容量扩充至 18）
  const interleaved: string[] = [];
  const maxLen = Math.max(headTerms.length, tailTerms.length);
  for (let i = 0; i < maxLen; i += 1) {
    if (i < headTerms.length) interleaved.push(headTerms[i]);
    if (i < tailTerms.length) interleaved.push(tailTerms[i]);
  }

  return [...new Set(interleaved)].slice(0, 18);
}

export function scoreCompanionMemory(
  memory: CompanionMemoryRecord,
  userInput: string,
  now: number = Date.now(),
  ftsMatchedIds: Set<string> = new Set(),
  precomputedTerms?: string[]
): MemoryRecallCandidate | null {
  const lowerInput = userInput.toLowerCase();
  const lowerContent = memory.content.toLowerCase();

  // 通道 1: 扩充词匹配 (expanded_triggers)
  let triggerMatched = 0;
  for (const trigger of memory.triggerKeywords) {
    if (trigger && lowerInput.includes(trigger.toLowerCase())) {
      triggerMatched += 1;
    }
  }
  const iTrigger = triggerMatched > 0 ? Math.min(1.0, 0.6 + triggerMatched * 0.2) : 0;

  // 通道 2: FTS5 命中 + 中文无分词 N-Gram 内存直连兜底 (补偿 SQLite unicode61 不切中文正文的问题)
  let iFts = ftsMatchedIds.has(memory.id) ? 1.0 : 0;
  if (iFts === 0) {
    const terms = precomputedTerms ?? sanitizeAndExtractFtsTerms(userInput);
    let ngramHits = 0;
    for (const term of terms) {
      if (term.length >= 2 && lowerContent.includes(term.toLowerCase())) {
        ngramHits += 1;
      }
    }
    if (ngramHits > 0) {
      iFts = Math.min(1.0, 0.55 + ngramHits * 0.2);
    }
  }

  // 通道 3: 实体共现 (Entity Co-occurrence)
  let entityMatched = 0;
  for (const entity of memory.entities) {
    const cleanEntity = entity.replace(/^entity:/, '').toLowerCase();
    if (cleanEntity && lowerInput.includes(cleanEntity)) {
      entityMatched += 1;
    }
  }
  const iEntity = entityMatched > 0 ? 1.0 : 0;

  // 通道 4: 时空意图检测 (Temporal Intent)
  const hasTemporalWord = TEMPORAL_KEYWORDS.some((kw) => lowerInput.includes(kw));
  const isPendingOrEvent =
    memory.category.includes('ongoing') ||
    memory.category.includes('pending') ||
    memory.content.includes('约定') ||
    memory.content.includes('计划');
  const iTemporal = hasTemporalWord && isPendingOrEvent ? 1.0 : 0;

  // 基础多通道归一化打分：结合强命中通道与加权求和，杜绝单一有效通道被数学稀释
  const maxChannel = Math.max(iTrigger, iFts, iEntity, iTemporal);
  const weightedSum = 0.35 * iTrigger + 0.35 * iFts + 0.15 * iEntity + 0.15 * iTemporal;
  const baseChannelScore = 0.6 * maxChannel + 0.4 * weightedSum;

  if (baseChannelScore <= 0) {
    return null;
  }

  // 差异化时间衰减因子 (L2_FACT 长期事实慢衰减 0.999，L2_EPISODE 情节衰减 0.996)
  const isFact = memory.tier === 'L2_FACT';
  const decayRate = isFact ? 0.999 : 0.996;
  const deltaHours = Math.max(0, (now - memory.lastAccessedAt) / 3600000);
  let timeDecay = Math.pow(decayRate, Math.min(deltaHours, 720)); // 最多衰减 30 天

  // 艾宾浩斯稳定性遗忘保护：核心重要度 (>=8) 衰减底线不低于 0.60；一般重要度 (>=6) 不低于 0.40
  if (memory.importance >= 8) {
    timeDecay = Math.max(0.6, timeDecay);
  } else if (memory.importance >= 6) {
    timeDecay = Math.max(0.4, timeDecay);
  }

  // 重要性放大因子: 0.5 + 0.5 * (importance / 10)
  const importanceFactor = 0.5 + 0.5 * (Math.max(1, Math.min(10, memory.importance)) / 10);

  // 置信度因子 (0.8 ~ 1.0)
  const conf = memory.confidence !== undefined ? memory.confidence : 0.85;
  const confidenceFactor = 0.8 + 0.2 * Math.min(1.0, Math.max(0.5, conf));

  // 命中频次强化 (上限 1.25)
  const hitCount = memory.hitCount || 0;
  const hitCountFactor = Math.min(1.25, 1 + 0.06 * Math.log(1 + hitCount));

  // 置顶优先稳态增益 (1.25)
  const pinnedFactor = memory.isPinned ? 1.25 : 1.0;

  const finalScore = baseChannelScore * timeDecay * importanceFactor * confidenceFactor * hitCountFactor * pinnedFactor;

  let matchedChannel: MemoryRecallCandidate['matchedChannel'] = 'trigger';
  if (iTrigger >= iFts && iTrigger >= iEntity && iTrigger >= iTemporal && iTrigger > 0) {
    matchedChannel = 'trigger';
  } else if (iFts >= iTrigger && iFts >= iEntity && iFts >= iTemporal && iFts > 0) {
    matchedChannel = 'fts';
  } else if (iEntity > 0) {
    matchedChannel = 'entity';
  } else if (iTemporal > 0) {
    matchedChannel = 'temporal';
  }

  return {
    id: memory.id,
    content: memory.content,
    tier: memory.tier,
    category: memory.category,
    score: Number(finalScore.toFixed(4)),
    matchedChannel,
  };
}
