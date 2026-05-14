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

function titleForProviderError(fallbackMessage: string): string {
  if (/model list|models/i.test(fallbackMessage)) {
    return '模型列表获取失败';
  }
  if (/connection/i.test(fallbackMessage)) {
    return '模型商连接失败';
  }
  return 'AI 请求失败';
}

function extractProviderErrorMessage(detail: string): string | null {
  const trimmed = detail.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const error = record.error;
      if (error && typeof error === 'object') {
        const errorRecord = error as Record<string, unknown>;
        if (typeof errorRecord.message === 'string') {
          return errorRecord.message;
        }
      }
      if (typeof record.message === 'string') {
        return record.message;
      }
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

function friendlyProviderErrorMessage(detail: string, fallbackMessage: string): string {
  const message = extractProviderErrorMessage(detail);
  if (!message) {
    return titleForProviderError(fallbackMessage);
  }

  const lower = message.toLowerCase();
  if (lower.includes('insufficient balance') || lower.includes('insufficient quota') || lower.includes('quota exceeded')) {
    return '余额或额度不足，请检查模型商账户后重试。';
  }
  if (lower.includes('invalid api key') || lower.includes('unauthorized') || lower.includes('authentication')) {
    return 'API Key 无效或无权限，请检查模型账号设置。';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return '请求过于频繁，请稍后重试。';
  }
  if (lower.includes('model') && (lower.includes('not found') || lower.includes('invalid'))) {
    return '当前模型不可用，请切换模型后重试。';
  }

  return `${titleForProviderError(fallbackMessage)}：${message.slice(0, 120)}`;
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
  throw new Error(friendlyProviderErrorMessage(detail, fallbackMessage));
}
