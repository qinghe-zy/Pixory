import type { AiProviderProtocol, AiProviderType } from './types';
import { isOfficialDeepSeekEndpoint } from './deepseekModelPolicy';

export interface NormalizedProviderUsage {
  totalPromptTokens: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  cachedInputTokens: number | null;
  cacheMissInputTokens: number | null;
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
  cacheFieldsObserved: boolean;
  cachedTokenRatio: number | null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeProviderUsage(
  protocol: AiProviderProtocol,
  rawUsage: unknown,
  providerType?: AiProviderType,
  baseUrl?: string | null,
): NormalizedProviderUsage {
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
      cacheMissInputTokens: input_tokens,
      cacheCreationInputTokens,
      cacheReadInputTokens,
      // Preserve the legacy Anthropic aggregation semantics. DeepSeek is the
      // only provider whose native hit/miss fields have an explicit
      // "unobserved" state in this v1 path.
      cacheFieldsObserved: true,
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
      cacheMissInputTokens: totalPromptTokens === null ? null : Math.max(totalPromptTokens - cachedInputTokens, 0),
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: cachedInputTokens,
      // Preserve the legacy Gemini aggregation semantics. Native field
      // completeness is tracked only for official DeepSeek below.
      cacheFieldsObserved: true,
      cachedTokenRatio: totalPromptTokens && totalPromptTokens > 0 ? cachedInputTokens / totalPromptTokens : null,
    };
  }

  if (providerType === 'deepseek' && isOfficialDeepSeekEndpoint(baseUrl)) {
    const promptCacheHitTokens = numberOrNull(usage.prompt_cache_hit_tokens);
    const promptCacheMissTokens = numberOrNull(usage.prompt_cache_miss_tokens);
    const cacheHitObserved = 'prompt_cache_hit_tokens' in usage && promptCacheHitTokens !== null;
    const cacheMissObserved = 'prompt_cache_miss_tokens' in usage && promptCacheMissTokens !== null;
    const totalPromptTokens = numberOrNull(usage.prompt_tokens)
      ?? (promptCacheHitTokens !== null && promptCacheMissTokens !== null
        ? promptCacheHitTokens + promptCacheMissTokens
        : null);
    const cacheFieldsObserved = cacheHitObserved && cacheMissObserved;
    return {
      totalPromptTokens,
      promptTokens: totalPromptTokens,
      completionTokens: numberOrNull(usage.completion_tokens),
      cachedInputTokens: promptCacheHitTokens,
      cacheMissInputTokens: promptCacheMissTokens,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: promptCacheHitTokens,
      cacheFieldsObserved,
      cachedTokenRatio: totalPromptTokens
        && totalPromptTokens > 0
        && cacheFieldsObserved
        && promptCacheHitTokens !== null
        ? promptCacheHitTokens / totalPromptTokens
        : null,
    };
  }

  const totalPromptTokens = numberOrNull(usage.prompt_tokens);
  const promptTokensDetails = usage.prompt_tokens_details && typeof usage.prompt_tokens_details === 'object'
    ? usage.prompt_tokens_details as Record<string, unknown>
    : {};
  const cachedTokenField = numberOrNull(promptTokensDetails.cached_tokens);
  const cachedInputTokens = cachedTokenField ?? 0;
  return {
    totalPromptTokens,
    promptTokens: totalPromptTokens,
    completionTokens: numberOrNull(usage.completion_tokens),
    cachedInputTokens,
    cacheMissInputTokens: totalPromptTokens === null ? null : Math.max(totalPromptTokens - cachedInputTokens, 0),
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: cachedInputTokens,
    // Keep generic OpenAI-compatible providers unchanged: an absent
    // cached_tokens field still means the legacy zero-cache accounting.
    cacheFieldsObserved: true,
    cachedTokenRatio: totalPromptTokens && totalPromptTokens > 0 ? cachedInputTokens / totalPromptTokens : null,
  };
}
