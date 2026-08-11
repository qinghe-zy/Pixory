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

function isCjkCodeUnit(code: number): boolean {
  return (
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0xac00 && code <= 0xd7af)
  );
}

function estimatePromptTokensFromCounts(cjkChars: number, totalChars: number): number {
  const nonCjkChars = Math.max(0, totalChars - cjkChars);
  return Math.max(1, Math.ceil(cjkChars * 0.8) + Math.ceil(nonCjkChars / 4));
}

export function estimatePromptTokens(value: string): number {
  let cjkChars = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (isCjkCodeUnit(value.charCodeAt(index))) {
      cjkChars += 1;
    }
  }
  return estimatePromptTokensFromCounts(cjkChars, value.length);
}

function findMaxPrefixForTokenBudget(value: string, maxTokens: number): number {
  let cjkChars = 0;
  let acceptedLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (isCjkCodeUnit(value.charCodeAt(index))) {
      cjkChars += 1;
    }
    const length = index + 1;
    if (estimatePromptTokensFromCounts(cjkChars, length) > maxTokens) {
      break;
    }
    acceptedLength = length;
  }
  return acceptedLength;
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
  const minimumLength = Math.min(minChars, value.length);
  const minimumFits =
    minimumLength > 0 &&
    estimatePromptTokens(value.slice(0, minimumLength)) <= contentMaxTokens;
  const acceptedLength = findMaxPrefixForTokenBudget(value, contentMaxTokens);
  const finalLength = minimumFits
    ? Math.max(minimumLength, acceptedLength)
    : acceptedLength;
  const trimmed = value.slice(0, finalLength).trimEnd();
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
