export type AiStreamEvent =
  | { type: 'answer_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'completed'; finishReason?: string }
  | { type: 'error'; message: string };

export interface AiChatRequest {
  apiKey: string;
  baseUrl: string;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AiProviderAdapter {
  testConnection(input: { apiKey: string; baseUrl: string }): Promise<void>;
  listModels(input: { apiKey: string; baseUrl: string }): Promise<string[]>;
  streamChat(input: AiChatRequest, onEvent: (event: AiStreamEvent) => void): Promise<void>;
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
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
  throw new Error(detail ? `${fallbackMessage}: ${detail.slice(0, 180)}` : fallbackMessage);
}
