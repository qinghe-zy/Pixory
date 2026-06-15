import type { AiProviderProtocol } from './types';

export interface NormalizedProviderUsage {
  totalPromptTokens: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  cachedInputTokens: number | null;
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
  cachedTokenRatio: number | null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeProviderUsage(protocol: AiProviderProtocol, rawUsage: unknown): NormalizedProviderUsage {
  const usage = rawUsage && typeof rawUsage === 'object' ? rawUsage as Record<string, unknown> : {};

  if (protocol === 'anthropic') {
    const input_tokens = numberOrNull(usage.input_tokens) ?? 0;
    const cacheCreationInputTokens = numberOrNull(usage.cache_creation_input_tokens) ?? 0;
    const cacheReadInputTokens = numberOrNull(usage.cache_read_input_tokens) ?? 0;
    const cachedInputTokens = cacheReadInputTokens;
    const totalPromptTokens = input_tokens + cacheCreationInputTokens + cacheReadInputTokens;
    return {
      totalPromptTokens,
      promptTokens: input_tokens,
      completionTokens: numberOrNull(usage.output_tokens),
      cachedInputTokens,
      cacheCreationInputTokens,
      cacheReadInputTokens,
      cachedTokenRatio: totalPromptTokens > 0 ? cachedInputTokens / totalPromptTokens : null,
    };
  }

  if (protocol === 'gemini') {
    const totalPromptTokens = numberOrNull(usage.promptTokenCount);
    const cachedInputTokens = numberOrNull(usage.cachedContentTokenCount) ?? 0;
    return {
      totalPromptTokens,
      promptTokens: totalPromptTokens,
      completionTokens: numberOrNull(usage.candidatesTokenCount),
      cachedInputTokens,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: cachedInputTokens,
      cachedTokenRatio: totalPromptTokens && totalPromptTokens > 0 ? cachedInputTokens / totalPromptTokens : null,
    };
  }

  const totalPromptTokens = numberOrNull(usage.prompt_tokens);
  const promptTokensDetails = usage.prompt_tokens_details && typeof usage.prompt_tokens_details === 'object'
    ? usage.prompt_tokens_details as Record<string, unknown>
    : {};
  const cachedInputTokens = numberOrNull(promptTokensDetails.cached_tokens) ?? 0;
  return {
    totalPromptTokens,
    promptTokens: totalPromptTokens,
    completionTokens: numberOrNull(usage.completion_tokens),
    cachedInputTokens,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: cachedInputTokens,
    cachedTokenRatio: totalPromptTokens && totalPromptTokens > 0 ? cachedInputTokens / totalPromptTokens : null,
  };
}
