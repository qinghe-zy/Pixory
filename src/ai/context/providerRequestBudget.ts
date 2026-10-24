import {
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  estimateCalibratedPromptTokens,
  estimatePromptTokens,
  type TokenCalibrationOptions,
} from '../aiContextBudget';

export interface RequestBudgetPolicy {
  isDeepSeek?: boolean;
  modelContextWindowTokens?: number | null;
  outputReserveTokens?: number;
  providerProtocol?: string;
}

export interface RequestBudgetReceipt {
  estimatedInputTokens: number;
  inputBudgetTokens: number;
  outputReserveTokens: number;
  capacityEstimated: boolean;
  tokenCountEstimated: true;
  fits: boolean;
}

export function requestInputBudget(policy: RequestBudgetPolicy): Omit<RequestBudgetReceipt, 'estimatedInputTokens' | 'fits'> {
  const known = Number.isFinite(policy.modelContextWindowTokens) && (policy.modelContextWindowTokens ?? 0) > 0;
  const capacity = known ? Math.floor(policy.modelContextWindowTokens!) : Math.min(DEFAULT_CONTEXT_WINDOW_TOKENS, 16_000);
  const outputReserveTokens = Math.max(1, Math.ceil(policy.outputReserveTokens ?? 2048));
  return {
    inputBudgetTokens: Math.max(0, Math.min(Math.floor(capacity * 0.7), capacity - outputReserveTokens)),
    outputReserveTokens, capacityEstimated: !known, tokenCountEstimated: true,
  };
}

function contentTokens(value: unknown, options?: TokenCalibrationOptions): number {
  if (typeof value === 'string') {
    return options ? estimateCalibratedPromptTokens(value, options) : estimatePromptTokens(value);
  }
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + contentTokens(item, options), 0);
  if (!value || typeof value !== 'object') return 0;
  const item = value as Record<string, unknown>;
  // Image encodings are bytes, not prompt text. Reserve separately; actual vision tokenization is provider-specific.
  if (item.type === 'image_url' || item.type === 'image' || item.inlineData) return 4096;
  let tokens = 0;
  for (const key of ['text', 'content', 'parts']) if (key in item) tokens += contentTokens(item[key], options);
  return tokens;
}

export function estimateCompiledRequestTokens(body: Record<string, unknown>, policy?: RequestBudgetPolicy): number {
  const options: TokenCalibrationOptions | undefined = policy && (policy.providerProtocol || policy.isDeepSeek !== undefined)
    ? { isDeepSeek: policy.isDeepSeek, providerProtocol: policy.providerProtocol }
    : undefined;
  const messages = body.messages ?? body.contents;
  let tokens = 256 + (Array.isArray(messages) ? messages.length * 16 : 0);
  tokens += contentTokens(messages, options) + contentTokens(body.system, options) + contentTokens(body.systemInstruction, options);
  const schema = body.response_format ?? body.output_config
    ?? (body.generationConfig as Record<string, unknown> | undefined)?.responseSchema;
  if (schema) tokens += estimatePromptTokens(JSON.stringify(schema));
  return tokens;
}

export function validateCompiledRequestBudget(body: Record<string, unknown>, policy?: RequestBudgetPolicy): RequestBudgetReceipt | null {
  if (!policy) return null;
  const budget = requestInputBudget(policy);
  const estimatedInputTokens = estimateCompiledRequestTokens(body, policy);
  const receipt = { ...budget, estimatedInputTokens, fits: estimatedInputTokens <= budget.inputBudgetTokens };
  if (!receipt.fits) throw new Error('最终请求超出模型输入预算，请减少附件、资料或本轮输入。未发送请求。');
  return receipt;
}
