import type { AiProviderType } from './types';

/**
 * Recognized model brand identifiers used for icon rendering.
 * 'default' means no recognized brand — render a generic AI icon.
 */
export type AiModelIconBrand = 'deepseek' | 'openai' | 'gemini' | 'claude' | 'grok' | 'zhipu' | 'default';

/**
 * Resolve the brand icon to display for a given provider/model combination.
 *
 * Recognition priority:
 * 1. providerType direct match (deepseek / openai / gemini / claude)
 * 2. modelId keyword match (covers relay/proxy stations forwarding known models)
 * 3. baseUrl keyword match (covers custom baseUrl pointing to a known provider)
 * 4. Fallback to 'default'
 */
export function resolveModelIconBrand(
  providerType: AiProviderType,
  modelId: string,
  baseUrl?: string | null,
): AiModelIconBrand {
  // --- Layer 1: providerType direct match ---
  if (providerType === 'deepseek') return 'deepseek';
  if (providerType === 'openai') return 'openai';
  if (providerType === 'gemini') return 'gemini';
  if (providerType === 'claude') return 'claude';

  // --- Layer 2: modelId keyword match (for relay stations / custom providers) ---
  const modelIdBrand = detectBrandFromModelId(modelId);
  if (modelIdBrand) return modelIdBrand;

  // --- Layer 3: baseUrl keyword match ---
  if (baseUrl) {
    const urlBrand = detectBrandFromBaseUrl(baseUrl);
    if (urlBrand) return urlBrand;
  }

  return 'default';
}

const MODEL_ID_PATTERNS: Array<{ pattern: RegExp; brand: AiModelIconBrand }> = [
  { pattern: /deepseek/i, brand: 'deepseek' },
  { pattern: /\b(gpt|o1|o3|o4|chatgpt|dall-?e)\b/i, brand: 'openai' },
  { pattern: /gemini/i, brand: 'gemini' },
  { pattern: /\b(claude|anthropic)\b/i, brand: 'claude' },
  { pattern: /grok/i, brand: 'grok' },
  { pattern: /\b(glm|zhipu|chatglm)\b/i, brand: 'zhipu' },
];

function detectBrandFromModelId(modelId: string): AiModelIconBrand | null {
  for (const { pattern, brand } of MODEL_ID_PATTERNS) {
    if (pattern.test(modelId)) return brand;
  }
  return null;
}

const BASE_URL_PATTERNS: Array<{ keyword: string; brand: AiModelIconBrand }> = [
  { keyword: 'deepseek', brand: 'deepseek' },
  { keyword: 'openai', brand: 'openai' },
  { keyword: 'googleapis', brand: 'gemini' },
  { keyword: 'anthropic', brand: 'claude' },
  { keyword: 'x.ai', brand: 'grok' },
  { keyword: 'xai', brand: 'grok' },
  { keyword: 'zhipu', brand: 'zhipu' },
  { keyword: 'bigmodel', brand: 'zhipu' },
];

function detectBrandFromBaseUrl(baseUrl: string): AiModelIconBrand | null {
  const normalized = baseUrl.toLowerCase();
  for (const { keyword, brand } of BASE_URL_PATTERNS) {
    if (normalized.includes(keyword)) return brand;
  }
  return null;
}
