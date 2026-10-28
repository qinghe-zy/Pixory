import { fetch as expoFetch } from 'expo/fetch';
import type {
  ILlmStreamClient,
  LlmRole,
  LlmTransportMessage,
  LlmTransportOptions,
} from './types';

function resolveChatEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

function parseSseDelta(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;
  const payload = trimmed.slice(5).trim();
  if (payload === '[DONE]') return null;
  try {
    const json = JSON.parse(payload);
    // 兼容 OpenAI / DeepSeek
    const openAiDelta = json.choices?.[0]?.delta?.content;
    if (typeof openAiDelta === 'string') return openAiDelta;
    // 兼容 Anthropic / Claude
    if (json.type === 'content_block_delta' && json.delta?.text) {
      return json.delta.text;
    }
    return null;
  } catch {
    return null;
  }
}

export class LlmStreamClient implements ILlmStreamClient {
  async *streamText(
    messages: LlmTransportMessage[],
    options: LlmTransportOptions
  ): AsyncIterable<string> {
    const baseUrl = options.baseUrl || 'https://api.deepseek.com';
    const endpoint = resolveChatEndpoint(baseUrl);
    const fetchFn = typeof expoFetch === 'function' ? expoFetch : fetch;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.apiKey) {
      headers.Authorization = `Bearer ${options.apiKey}`;
    }

    const body = JSON.stringify({
      model: options.modelId,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
    });

    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers,
      body,
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`LLM stream error (${response.status}): ${errText.slice(0, 200)}`);
    }

    if (!response.body) {
      const fallbackText = await response.text();
      yield fallbackText;
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (options.abortSignal?.aborted) {
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const delta = parseSseDelta(line);
          if (delta) {
            yield delta;
          }
        }
      }

      if (buffer) {
        const delta = parseSseDelta(buffer);
        if (delta) {
          yield delta;
        }
      }
    } finally {
      reader.releaseLock?.();
    }
  }
}

export const streamClient = new LlmStreamClient();
