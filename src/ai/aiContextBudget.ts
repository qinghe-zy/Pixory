import type { AiMessageRecord } from '../database/repositories/aiThreadRepository';

export interface AiContextBudgetResult {
  messages: AiMessageRecord[];
  trimmed: boolean;
  estimatedTokens: number;
}

export interface PromptBudgetBlock {
  key: string;
  minChars?: number;
  priority: 'dynamic' | 'protected' | 'required' | 'stable';
  text: string;
}

export interface PromptBudgetResult {
  blocks: PromptBudgetBlock[];
  estimatedTokens: number;
  trimmed: boolean;
}

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 512_000;
const CJK_CHAR_PATTERN = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g;

export function estimatePromptTokens(value: string): number {
  const cjkChars = value.match(CJK_CHAR_PATTERN)?.length ?? 0;
  const nonCjkChars = Math.max(0, value.length - cjkChars);
  const cjkTokenEstimate = Math.ceil(cjkChars * 0.8);
  const asciiTokenEstimate = Math.ceil(nonCjkChars / 4);
  return Math.max(1, cjkTokenEstimate + asciiTokenEstimate);
}

export function getConservativeContextBudget(modelContextWindowTokens?: number | null): number {
  if (!Number.isFinite(modelContextWindowTokens) || !modelContextWindowTokens || modelContextWindowTokens <= 0) {
    return Math.floor(DEFAULT_CONTEXT_WINDOW_TOKENS * 0.7);
  }
  const targetBudget = Math.floor(modelContextWindowTokens * 0.7);
  return Math.min(modelContextWindowTokens, Math.max(1, targetBudget));
}

export function trimMessagesToContextBudget(input: {
  messages: AiMessageRecord[];
  protectedPrompt: string;
  modelContextWindowTokens?: number | null;
}): AiContextBudgetResult {
  const budget = getConservativeContextBudget(input.modelContextWindowTokens);
  const protectedTokens = estimatePromptTokens(input.protectedPrompt);
  const conversationRounds: AiMessageRecord[][] = [];
  let currentRound: AiMessageRecord[] | null = null;
  const flushCompleteRound = () => {
    if (currentRound?.some((message) => message.role === 'assistant')) {
      conversationRounds.push(currentRound);
    }
  };
  for (const message of input.messages) {
    if (message.role === 'user') {
      flushCompleteRound();
      currentRound = [message];
    } else if (message.role === 'assistant' && currentRound) {
      currentRound.push(message);
    }
  }
  flushCompleteRound();

  const selectedRounds: AiMessageRecord[][] = [];
  let estimatedTokens = protectedTokens;
  for (const round of [...conversationRounds].reverse()) {
    const roundTokens = round.reduce((sum, message) => sum + estimatePromptTokens(message.content), 0);
    if (estimatedTokens + roundTokens > budget) {
      break;
    }
    selectedRounds.push(round);
    estimatedTokens += roundTokens;
  }
  const selected = selectedRounds.reverse().flat();
  return {
    estimatedTokens,
    messages: selected,
    trimmed: selected.length < input.messages.length,
  };
}

function trimTextToTokenBudget(value: string, maxTokens: number, minChars = 0): string {
  if (!value || maxTokens <= 0) {
    return minChars > 0 ? value.slice(0, minChars) : '';
  }
  if (estimatePromptTokens(value) <= maxTokens) {
    return value;
  }
  const trimNotice = '\n[已因模型上下文窗口裁剪]';
  const noticeTokens = estimatePromptTokens(trimNotice);
  const contentMaxTokens = maxTokens > noticeTokens + 1 ? maxTokens - noticeTokens : maxTokens;
  const minCandidate = value.slice(0, Math.min(minChars, value.length));
  let low = minCandidate && estimatePromptTokens(minCandidate) <= contentMaxTokens ? minCandidate.length : 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (estimatePromptTokens(value.slice(0, mid)) <= contentMaxTokens) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  const trimmed = value.slice(0, low).trimEnd();
  if (trimmed.length >= value.length) {
    return trimmed;
  }
  const withNotice = `${trimmed}${trimNotice}`;
  return estimatePromptTokens(withNotice) <= maxTokens ? withNotice : trimmed;
}

export function fitPromptBlocksToContextBudget(input: {
  blocks: PromptBudgetBlock[];
  modelContextWindowTokens?: number | null;
}): PromptBudgetResult {
  const budget = getConservativeContextBudget(input.modelContextWindowTokens);
  const blocks = input.blocks.map((block) => ({ ...block }));
  let estimatedTokens = blocks.reduce((sum, block) => sum + estimatePromptTokens(block.text), 0);
  let trimmed = false;
  for (const priority of ['dynamic', 'protected', 'stable', 'required'] as const) {
    for (let index = blocks.length - 1; index >= 0 && estimatedTokens > budget; index -= 1) {
      const block = blocks[index];
      if (block.priority !== priority || !block.text) {
        continue;
      }
      if (block.priority === 'required') {
        continue;
      }
      const otherTokens = estimatedTokens - estimatePromptTokens(block.text);
      const availableTokens = Math.max(1, budget - otherTokens);
      const nextText = trimTextToTokenBudget(block.text, availableTokens, block.minChars ?? 0);
      if (nextText !== block.text) {
        block.text = nextText;
        estimatedTokens = blocks.reduce((sum, item) => sum + estimatePromptTokens(item.text), 0);
        trimmed = true;
      }
    }
  }
  return {
    blocks,
    estimatedTokens,
    trimmed: trimmed || estimatedTokens > budget,
  };
}
