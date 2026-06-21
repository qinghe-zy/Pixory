import { fetch as expoFetch } from 'expo/fetch';

import {
  assertOkResponse,
  isAbortError,
  normalizeBaseUrl,
  type AiChatRequest,
  type AiProviderAdapter,
  type AiStreamEvent,
  type AiStreamEventHandler,
} from './base';

interface OpenAiModelListResponse {
  data?: Array<{ id?: string }>;
}

interface OpenAiEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
}

function parseOpenAiStreamLine(line: string): AiStreamEvent[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) {
    return [];
  }
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === '[DONE]') {
    return payload === '[DONE]' ? [{ type: 'completed' }] : [];
  }
  try {
    const parsed = JSON.parse(payload);
    if (parsed.usage) {
      return [{ type: 'provider_usage', rawUsage: parsed.usage }];
    }
    const delta = parsed.choices?.[0]?.delta ?? {};
    const events: AiStreamEvent[] = [];
    const reasoningText = delta.reasoning_content ?? delta.reasoning ?? delta.reasoningText;
    if (typeof reasoningText === 'string' && reasoningText) {
      events.push({ type: 'reasoning_delta', text: reasoningText });
    }
    if (typeof delta.content === 'string' && delta.content) {
      events.push({ type: 'answer_delta', text: delta.content });
    }
    const finishReason = parsed.choices?.[0]?.finish_reason;
    if (finishReason) {
      events.push({ type: 'completed', finishReason });
    }
    return events;
  } catch {
    return [];
  }
}

function parseOpenAiChatCompletionJson(text: string): AiStreamEvent[] {
  try {
    const parsed = JSON.parse(text);
    const events: AiStreamEvent[] = [];
    if (parsed.usage) {
      events.push({ type: 'provider_usage', rawUsage: parsed.usage });
    }
    const message = parsed.choices?.[0]?.message ?? {};
    const reasoningText = message.reasoning_content ?? message.reasoning ?? message.reasoningText;
    if (typeof reasoningText === 'string' && reasoningText) {
      events.push({ type: 'reasoning_delta', text: reasoningText });
    }
    if (typeof message?.content === 'string' && message.content) {
      events.push({ type: 'answer_delta', text: message.content });
    }
    const finishReason = parsed.choices?.[0]?.finish_reason;
    if (finishReason) {
      events.push({ type: 'completed', finishReason });
    }
    return events;
  } catch {
    return [];
  }
}

async function readStreamingResponse(response: Response, onEvent: AiStreamEventHandler, signal?: AbortSignal): Promise<void> {
  const body = response.body as unknown as { getReader?: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> } } | null;
  if (!body?.getReader) {
    const text = await response.text();
    if (signal?.aborted) {
      return;
    }
    const events = text.includes('data:')
      ? text.split('\n').flatMap(parseOpenAiStreamLine)
      : parseOpenAiChatCompletionJson(text);
    for (const event of events) {
      await onEvent(event);
    }
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let rawText = '';
  let sawSseLine = false;
  while (true) {
    if (signal?.aborted) {
      return;
    }
    const { done, value } = await reader.read();
    if (signal?.aborted) {
      return;
    }
    if (done) {
      break;
    }
    const chunk = decoder.decode(value, { stream: true });
    rawText += chunk;
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim().startsWith('data:')) {
        sawSseLine = true;
      }
      const events = parseOpenAiStreamLine(line);
      for (const event of events) {
        await onEvent(event);
      }
    }
  }
  if (buffer) {
    if (buffer.trim().startsWith('data:')) {
      sawSseLine = true;
    }
    const events = parseOpenAiStreamLine(buffer);
    for (const event of events) {
      await onEvent(event);
    }
  }
  if (!sawSseLine && rawText) {
    for (const event of parseOpenAiChatCompletionJson(rawText)) {
      await onEvent(event);
    }
  }
}

function shouldDisableDeepSeekThinking(input: AiChatRequest): boolean {
  if (!input.thinkingDisabled) {
    return false;
  }
  try {
    const host = new URL(normalizeBaseUrl(input.baseUrl)).hostname.toLowerCase();
    return host === 'api.deepseek.com' && /^deepseek-v4-/i.test(input.modelId);
  } catch {
    return false;
  }
}

function supportsOpenAiReasoningNone(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  if (normalized.includes('-pro')) {
    return false;
  }
  const gpt5Match = /^gpt-5\.(\d+)/.exec(normalized);
  if (gpt5Match) {
    return Number(gpt5Match[1]) >= 1;
  }
  return /^gpt-(?:[6-9]|\d{2,})\b/.test(normalized);
}

function shouldDisableOpenAiReasoning(input: AiChatRequest): boolean {
  if (!input.thinkingDisabled) {
    return false;
  }
  try {
    const host = new URL(normalizeBaseUrl(input.baseUrl)).hostname.toLowerCase();
    return host === 'api.openai.com' && supportsOpenAiReasoningNone(input.modelId);
  } catch {
    return false;
  }
}

export const openAiCompatibleProvider: AiProviderAdapter = {
  async testConnection(input) {
    const response = await expoFetch(`${normalizeBaseUrl(input.baseUrl)}/models`, {
      headers: { Authorization: `Bearer ${input.apiKey}` },
    });
    await assertOkResponse(response, 'AI provider connection failed');
  },

  async listModels(input) {
    const response = await expoFetch(`${normalizeBaseUrl(input.baseUrl)}/models`, {
      headers: { Authorization: `Bearer ${input.apiKey}` },
    });
    await assertOkResponse(response, 'AI model list sync failed');
    const json = (await response.json()) as OpenAiModelListResponse;
    return (json.data ?? []).map((model) => model.id).filter((modelId): modelId is string => Boolean(modelId));
  },

  async streamChat(input: AiChatRequest, onEvent) {
    try {
      const body: Record<string, unknown> = {
        model: input.modelId,
        stream: true,
        messages: [
          { role: 'system', content: input.systemPrompt },
          ...input.history,
          { role: 'user', content: input.userPrompt },
        ],
      };
      if (input.providerCachePolicy?.openAiIncludeUsage) {
        body.stream_options = { include_usage: true };
      }
      if (input.providerCachePolicy?.openAiPromptCacheKey) {
        body.prompt_cache_key = input.providerCachePolicy.openAiPromptCacheKey;
      }
      if (shouldDisableOpenAiReasoning(input)) {
        body.reasoning_effort = 'none';
      }
      if (shouldDisableDeepSeekThinking(input)) {
        body.thinking = { type: 'disabled' };
      }
      const response = await expoFetch(`${normalizeBaseUrl(input.baseUrl)}/chat/completions`, {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${input.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: input.signal,
        body: JSON.stringify(body),
      });
      await assertOkResponse(response, 'AI chat request failed');
      await readStreamingResponse(response, onEvent, input.signal);
      if (input.signal?.aborted) {
        return;
      }
      await onEvent({ type: 'completed' });
    } catch (error) {
      if (input.signal?.aborted || isAbortError(error)) {
        return;
      }
      await onEvent({ type: 'error', message: error instanceof Error ? error.message : 'AI chat request failed' });
    }
  },

  async embedText(input) {
    const response = await expoFetch(`${normalizeBaseUrl(input.baseUrl)}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: input.text,
        model: input.modelId,
      }),
    });
    await assertOkResponse(response, 'AI embedding request failed');
    const json = (await response.json()) as OpenAiEmbeddingResponse;
    return json.data?.[0]?.embedding?.filter((value): value is number => typeof value === 'number') ?? [];
  },
};
