import type { CompanionMemoryRecord, MemoryRecallCandidate } from '../../core/memory/memoryTypes';

export const LAYER_2_MAX_TOKENS = 900;
export const LAYER_4_MAX_TOKENS = 360;

/**
 * 根据对话深度与模型上下文窗口自适应解析预算
 */
export function resolveBudgets(
  threadTurns?: number,
  _modelCtxHint?: number
): { layer2MaxTokens: number; layer4MaxTokens: number } {
  const turns = threadTurns ?? 0;
  if (turns < 10) {
    return { layer2MaxTokens: 600, layer4MaxTokens: 250 };
  }
  return { layer2MaxTokens: LAYER_2_MAX_TOKENS, layer4MaxTokens: LAYER_4_MAX_TOKENS };
}

/**
 * 极速高精度的中英混合 Token 估算器
 * CJK 汉字按 0.65 tok/char，ASCII 单词及标点按 0.28 tok/char 估算
 */
export function estimateImTokens(text: string | null | undefined): number {
  if (!text) return 0;
  let cjkCount = 0;
  let asciiCount = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x4e00 && code <= 0x9fff) {
      cjkCount++;
    } else {
      asciiCount++;
    }
  }

  return Math.ceil(cjkCount * 0.65 + asciiCount * 0.28);
}

/**
 * 贪婪控制 Layer 2 核心画像预算（<= 550 tokens）
 * 优先级：置顶 (isPinned) > 重要度 (importance) > 归因置信度 (confidence) > 最近使用时间
 */
export function fitLayer2CoreFacts(
  facts: CompanionMemoryRecord[],
  maxTokens: number = LAYER_2_MAX_TOKENS
): CompanionMemoryRecord[] {
  if (!facts || facts.length === 0) return [];

  const sorted = [...facts].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (a.importance !== b.importance) return b.importance - a.importance;
    const confA = a.confidence ?? 0.85;
    const confB = b.confidence ?? 0.85;
    if (confA !== confB) return confB - confA;
    return b.lastAccessedAt - a.lastAccessedAt;
  });

  const selected: CompanionMemoryRecord[] = [];
  let currentTokens = 0;

  for (const item of sorted) {
    const itemTok = estimateImTokens(`• ${item.content}\n`);
    if (currentTokens + itemTok <= maxTokens) {
      selected.push(item);
      currentTokens += itemTok;
    }
  }

  return selected;
}

/**
 * 贪婪控制 Layer 4 动态召回记忆预算（<= 180 tokens）
 */
export function fitLayer4Memories(
  recalled: MemoryRecallCandidate[],
  maxTokens: number = LAYER_4_MAX_TOKENS
): MemoryRecallCandidate[] {
  if (!recalled || recalled.length === 0) return [];

  const sorted = [...recalled].sort((a, b) => b.score - a.score);
  const selected: MemoryRecallCandidate[] = [];
  let currentTokens = 0;

  for (const item of sorted) {
    const itemTok = estimateImTokens(`- ${item.content}\n`);
    if (currentTokens + itemTok <= maxTokens) {
      selected.push(item);
      currentTokens += itemTok;
    }
  }

  return selected;
}
