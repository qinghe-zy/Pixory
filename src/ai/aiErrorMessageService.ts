import { classifyAiProviderError, toUserProviderErrorMessage } from './aiProviderErrorClassifier';

export function normalizeAiErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const reason = classifyAiProviderError({ body: raw, error, fallbackKind: raw.trim() ? 'unknown' : 'empty_response' });
  return toUserProviderErrorMessage(reason);
}
