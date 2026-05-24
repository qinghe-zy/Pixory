import type { AiMessageRecord } from '../database/repositories/aiThreadRepository';

export interface AiContextBudgetResult {
  messages: AiMessageRecord[];
  trimmed: boolean;
  estimatedTokens: number;
}

const DEFAULT_CONTEXT_BUDGET_TOKENS = 12000;

export function estimatePromptTokens(value: string): number {
  return Math.ceil(value.length / 3);
}

export function getConservativeContextBudget(modelContextWindowTokens?: number | null): number {
  if (!modelContextWindowTokens || modelContextWindowTokens <= 0) {
    return DEFAULT_CONTEXT_BUDGET_TOKENS;
  }
  return Math.max(2400, Math.floor(modelContextWindowTokens * 0.7));
}

export function trimMessagesToContextBudget(input: {
  messages: AiMessageRecord[];
  protectedPrompt: string;
  modelContextWindowTokens?: number | null;
}): AiContextBudgetResult {
  const budget = getConservativeContextBudget(input.modelContextWindowTokens);
  const protectedTokens = estimatePromptTokens(input.protectedPrompt);
  const selected: AiMessageRecord[] = [];
  let estimatedTokens = protectedTokens;
  for (const message of [...input.messages].reverse()) {
    const nextTokens = estimatePromptTokens(message.content);
    if (estimatedTokens + nextTokens > budget) {
      break;
    }
    selected.push(message);
    estimatedTokens += nextTokens;
  }
  selected.reverse();
  return {
    estimatedTokens,
    messages: selected,
    trimmed: selected.length < input.messages.length,
  };
}
