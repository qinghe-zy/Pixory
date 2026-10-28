import type { CompanionMemoryRecord, MemoryRecallCandidate } from './memoryTypes';

export const TEMPORAL_KEYWORDS = [
  '今天', '明天', '后天', '昨晚', '刚才', '待会', '周末', '下周',
  '早上', '中午', '晚上', '答辩', '考试', '出差', '约会', '生日'
];

/**
 * 安全净化并提取 FTS 搜索词（彻底剥离标点符号与特殊运算符，防语法 Crash，支持双字词）
 */
export function sanitizeAndExtractFtsTerms(text: string): string[] {
  const clean = text.replace(/[^\p{L}\p{N}\s]+/gu, ' ').trim();
  if (!clean) return [];

  const rawWords = clean.split(/\s+/).filter(Boolean);
  const terms: string[] = [];

  for (const word of rawWords) {
    if (word.length >= 2 && word.length <= 4) {
      terms.push(word);
    } else if (word.length > 4) {
      for (let size = 2; size <= 3; size += 1) {
        for (let i = 0; i <= word.length - size; i += 1) {
          terms.push(word.slice(i, i + size));
        }
      }
    }
  }

  return [...new Set(terms)].slice(0, 8);
}

export function scoreCompanionMemory(
  memory: CompanionMemoryRecord,
  userInput: string,
  now: number = Date.now(),
  ftsMatchedIds: Set<string> = new Set()
): MemoryRecallCandidate | null {
  const lowerInput = userInput.toLowerCase();

  // 通道 1: 扩充词匹配 (expanded_triggers)
  let triggerMatched = 0;
  for (const trigger of memory.triggerKeywords) {
    if (trigger && lowerInput.includes(trigger.toLowerCase())) {
      triggerMatched += 1;
    }
  }
  const iTrigger = triggerMatched > 0 ? Math.min(1.0, 0.6 + triggerMatched * 0.2) : 0;

  // 通道 2: FTS5 命中
  const iFts = ftsMatchedIds.has(memory.id) ? 1.0 : 0;

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

  // 基础综合得分 (权重分布: 0.45, 0.25, 0.15, 0.15)
  const baseChannelScore =
    0.45 * iTrigger + 0.25 * iFts + 0.15 * iEntity + 0.15 * iTemporal;

  if (baseChannelScore <= 0) {
    return null;
  }

  // 时间衰减因子 (半衰期衰减: 0.995 ^ hours)
  const deltaHours = Math.max(0, (now - memory.lastAccessedAt) / 3600000);
  const timeDecay = Math.pow(0.995, Math.min(deltaHours, 720)); // 最多衰减 30 天

  // 重要性放大因子: 0.5 + 0.5 * (importance / 10)
  const importanceFactor = 0.5 + 0.5 * (Math.max(1, Math.min(10, memory.importance)) / 10);

  const finalScore = baseChannelScore * timeDecay * importanceFactor;

  let matchedChannel: MemoryRecallCandidate['matchedChannel'] = 'trigger';
  if (iTrigger > 0) matchedChannel = 'trigger';
  else if (iFts > 0) matchedChannel = 'fts';
  else if (iEntity > 0) matchedChannel = 'entity';
  else if (iTemporal > 0) matchedChannel = 'temporal';

  return {
    id: memory.id,
    content: memory.content,
    tier: memory.tier,
    category: memory.category,
    score: Number(finalScore.toFixed(4)),
    matchedChannel,
  };
}
