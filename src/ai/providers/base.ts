import type { AiProviderCachePolicy } from '../aiPromptCache';
import { classifyAiProviderError, toUserProviderErrorMessage } from '../aiProviderErrorClassifier';

export type AiStreamEvent =
  | { type: 'answer_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'provider_usage'; rawUsage: unknown }
  | { type: 'completed'; finishReason?: string }
  | { type: 'error'; message: string };

export type AiStreamEventHandler = (event: AiStreamEvent) => void | Promise<void>;

export interface AiChatRequest {
  apiKey: string;
  baseUrl: string;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  providerCachePolicy?: AiProviderCachePolicy;
  thinkingDisabled?: boolean;
  signal?: AbortSignal;
}

export interface AiProviderAdapter {
  listModels(input: { apiKey: string; baseUrl: string; signal?: AbortSignal }): Promise<string[]>;
  verifyChatCompletion(input: { apiKey: string; baseUrl: string; modelId: string; signal?: AbortSignal }): Promise<void>;
  streamChat(input: AiChatRequest, onEvent: AiStreamEventHandler): Promise<void>;
  embedText(input: { apiKey: string; baseUrl: string; modelId: string; text: string }): Promise<number[]>;
}

export function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  let withoutQuery = trimmed;
  try {
    const parsed = new URL(trimmed);
    parsed.search = '';
    parsed.hash = '';
    withoutQuery = parsed.toString();
  } catch {
    withoutQuery = trimmed.replace(/[?#].*$/, '');
  }
  return withoutQuery
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/+(chat\/completions|completions|models|embeddings)$/i, '')
    .replace(/\/+$/, '');
}

export function providerEndpoint(baseUrl: string, path: string): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message));
}

export async function assertOkResponse(response: Response, fallbackMessage: string): Promise<void> {
  if (response.ok) {
    return;
  }
  let detail = '';
  try {
    detail = await response.text();
  } catch {
    detail = '';
  }
  const reason = classifyAiProviderError({ body: detail, status: response.status });
  throw new Error(toUserProviderErrorMessage(reason) || fallbackMessage);
}
