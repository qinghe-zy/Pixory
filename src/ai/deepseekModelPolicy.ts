import type { AiProviderType } from './types';

export const DEEPSEEK_RETIRED_MODEL_IDS = ['deepseek-chat', 'deepseek-reasoner'] as const;
export const DEEPSEEK_OFFICIAL_MODEL_IDS = ['deepseek-v4-flash', 'deepseek-v4-pro'] as const;
export const DEEPSEEK_OFFICIAL_VISION_MODEL_IDS = ['deepseek-v4-flash-vision-exp'] as const;

export function isOfficialDeepSeekEndpoint(baseUrl: string | null | undefined): boolean {
  if (!baseUrl) {
    return false;
  }
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'api.deepseek.com';
  } catch {
    return false;
  }
}

export function isOfficialDeepSeekProvider(input: {
  providerType: AiProviderType;
  baseUrl?: string | null;
}): boolean {
  return input.providerType === 'deepseek' && isOfficialDeepSeekEndpoint(input.baseUrl);
}

export function isRetiredDeepSeekModel(modelId: string | null | undefined): boolean {
  const normalized = modelId?.trim().toLowerCase();
  return Boolean(normalized && DEEPSEEK_RETIRED_MODEL_IDS.includes(normalized as typeof DEEPSEEK_RETIRED_MODEL_IDS[number]));
}

export function isAllowedOfficialDeepSeekModel(modelId: string | null | undefined): boolean {
  const normalized = modelId?.trim().toLowerCase();
  return Boolean(
    normalized
      && DEEPSEEK_OFFICIAL_MODEL_IDS.includes(normalized as typeof DEEPSEEK_OFFICIAL_MODEL_IDS[number])
  );
}

export function isAllowedOfficialDeepSeekVisionModel(modelId: string | null | undefined): boolean {
  const normalized = modelId?.trim().toLowerCase();
  return Boolean(normalized && DEEPSEEK_OFFICIAL_VISION_MODEL_IDS.includes(normalized as typeof DEEPSEEK_OFFICIAL_VISION_MODEL_IDS[number]));
}

export function isOfficialDeepSeekV4Model(input: {
  providerType: AiProviderType;
  baseUrl?: string | null;
  modelId: string;
}): boolean {
  return isOfficialDeepSeekProvider(input) && isAllowedOfficialDeepSeekModel(input.modelId);
}

export function migrateDeprecatedDeepSeekModel(
  modelId: string | null | undefined,
  baseUrl?: string | null,
): { modelId: 'deepseek-v4-flash'; thinkingDisabled: boolean } | null {
  if (!isOfficialDeepSeekEndpoint(baseUrl) || !isRetiredDeepSeekModel(modelId)) {
    return null;
  }
  return {
    modelId: 'deepseek-v4-flash',
    thinkingDisabled: modelId?.trim().toLowerCase() === 'deepseek-chat',
  };
}
