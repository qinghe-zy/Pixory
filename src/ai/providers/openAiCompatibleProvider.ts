import { fetch as expoFetch } from 'expo/fetch';

import {
  assertOkResponse,
  dispatchAiStreamEvent,
  type AiChatAttachment,
  isAbortError,
  normalizeBaseUrl,
  providerEndpoint,
  type AiChatRequest,
  type AiProviderAdapter,
  type AiStreamEvent,
  type AiStreamEventHandler,
} from './base';
import { classifyAiProviderError, toUserProviderErrorMessage } from '../aiProviderErrorClassifier';
import { assertDeepSeekInlineRequestBodyBytes, isOfficialDeepSeekVisionModel } from '../deepseekVisionPolicy';

interface OpenAiModelListResponse {
  data?: Array<{ id?: string }>;
}

interface OpenAiEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
}

interface OpenAiChatCompletionVerifyResponse {
  choices?: unknown[];
  id?: string;
}

type OpenAiMessageContent = string | Array<
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
>;

type OpenAiCompatibleFetchInit = {
  body?: string;
  headers?: Record<string, string>;
  method?: string;
  signal?: AbortSignal;
};

type OpenAiCompatibleFetchResult = {
  bodyText: string | null;
  response: Response;
};

function openAiCompatibleEndpointCandidates(baseUrl: string): string[] {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    return [normalizedBaseUrl];
  }
  const candidates = [normalizedBaseUrl];
  try {
    const parsed = new URL(normalizedBaseUrl);
    const path = parsed.pathname.replace(/\/+$/, '');
    if (!path || path === '') {
      parsed.pathname = '/v1';
      candidates.push(normalizeBaseUrl(parsed.toString()));
    }
  } catch {
    // Invalid URLs are handled by fetch/error classification at the call site.
  }
  return Array.from(new Set(candidates));
}

function shouldRetryWithNextEndpoint(response: Response, bodyKind?: 'bad_shape' | null): boolean {
  const status = response.status;
  return status === 404 || status === 405 || status >= 500 || bodyKind === 'bad_shape';
}

async function fetchOpenAiCompatibleResponse(
  baseUrl: string,
  path: string,
  init: OpenAiCompatibleFetchInit,
  shouldRetryBody?: (bodyText: string) => Promise<'bad_shape' | null>
): Promise<OpenAiCompatibleFetchResult> {
  const candidates = openAiCompatibleEndpointCandidates(baseUrl);
  let lastResult: OpenAiCompatibleFetchResult | null = null;
  for (const candidateBaseUrl of candidates) {
    const response = await expoFetch(providerEndpoint(candidateBaseUrl, path), init);
    const bodyText = response.ok && shouldRetryBody ? await response.text() : null;
    const result = { bodyText, response };
    lastResult = result;
    const bodyKind = bodyText !== null && shouldRetryBody ? await shouldRetryBody(bodyText) : null;
    if (!shouldRetryWithNextEndpoint(response, bodyKind) || candidateBaseUrl === candidates[candidates.length - 1]) {
      return result;
    }
  }
  return lastResult as OpenAiCompatibleFetchResult;
}

type OpenAiStreamLineParseResult = {
  events: AiStreamEvent[];
  isStreamPayload: boolean;
};

function parseOpenAiStreamLine(line: string, streamConfirmed = false): OpenAiStreamLineParseResult {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:') && !trimmed.startsWith('{')) {
    return { events: [], isStreamPayload: streamConfirmed };
  }
  const sseFramed = trimmed.startsWith('data:');
  const payload = sseFramed ? trimmed.slice(5).trim() : trimmed;
  if (!payload || payload === '[DONE]') {
    return {
      events: payload === '[DONE]' ? [{ type: 'completed' }] : [],
      isStreamPayload: sseFramed || streamConfirmed,
    };
  }
  try {
    const parsed = JSON.parse(payload);
    const choice = parsed.choices?.[0];
    const isStreamPayload = sseFramed || streamConfirmed || choice?.delta !== undefined || (
      choice?.message === undefined &&
      (choice?.finish_reason !== undefined || parsed.usage !== undefined)
    );
    if (!isStreamPayload) {
      return { events: [], isStreamPayload: false };
    }
    const events: AiStreamEvent[] = [];
    if (parsed.usage) {
      events.push({ type: 'provider_usage', rawUsage: parsed.usage });
    }
    const delta = choice?.delta ?? {};
    const reasoningText = delta.reasoning_content ?? delta.reasoning ?? delta.reasoningText;
    if (typeof reasoningText === 'string' && reasoningText) {
      events.push({ type: 'reasoning_delta', text: reasoningText });
    }
    if (typeof delta.content === 'string' && delta.content) {
      events.push({ type: 'answer_delta', text: delta.content });
    }
    const finishReason = choice?.finish_reason;
    if (finishReason) {
      events.push({ type: 'completed', finishReason });
    }
    return { events, isStreamPayload: true };
  } catch {
    return { events: [], isStreamPayload: sseFramed || streamConfirmed };
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

async function readStreamingResponse(response: Response, onEvent: AiStreamEventHandler, signal?: AbortSignal): Promise<boolean> {
  let sawCompletionEvent = false;
  const dispatchEvents = (events: AiStreamEvent[]): Promise<void> | void => {
    let pending: Promise<void> | undefined;
    for (const event of events) {
      if (event.type === 'completed') {
        if (sawCompletionEvent) {
          continue;
        }
        sawCompletionEvent = true;
      }
      if (pending) {
        pending = pending.then(() => dispatchAiStreamEvent(onEvent, event) || undefined);
        continue;
      }
      const next = dispatchAiStreamEvent(onEvent, event);
      if (next) {
        pending = next;
      }
    }
    return pending;
  };
  const body = response.body as unknown as { getReader?: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> } } | null;
  if (!body?.getReader) {
    const text = await response.text();
    if (signal?.aborted) {
      return false;
    }
    let sawStreamPayload = false;
    for (const line of text.split('\n')) {
      const parsedLine = parseOpenAiStreamLine(line, sawStreamPayload);
      if (parsedLine.isStreamPayload) {
        sawStreamPayload = true;
      }
      const pending = dispatchEvents(parsedLine.events);
      if (pending) await pending;
    }
    if (!sawStreamPayload && text.trim()) {
      const pending = dispatchEvents(parseOpenAiChatCompletionJson(text));
      if (pending) await pending;
    }
    return sawCompletionEvent;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let rawText = '';
  let sawStreamPayload = false;
  while (true) {
    if (signal?.aborted) {
      return false;
    }
    const { done, value } = await reader.read();
    if (signal?.aborted) {
      return false;
    }
    if (done) {
      break;
    }
    const chunk = decoder.decode(value, { stream: true });
    if (!sawStreamPayload) {
      rawText += chunk;
    }
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const parsedLine = parseOpenAiStreamLine(line, sawStreamPayload);
      if (parsedLine.isStreamPayload) {
        sawStreamPayload = true;
      }
      if (sawStreamPayload) {
        rawText = '';
      }
      const pending = dispatchEvents(parsedLine.events);
      if (pending) await pending;
    }
  }
  const trailing = decoder.decode();
  if (trailing) {
    if (!sawStreamPayload) {
      rawText += trailing;
    }
    buffer += trailing;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const parsedLine = parseOpenAiStreamLine(line, sawStreamPayload);
      if (parsedLine.isStreamPayload) {
        sawStreamPayload = true;
      }
      if (sawStreamPayload) {
        rawText = '';
      }
      const pending = dispatchEvents(parsedLine.events);
      if (pending) await pending;
    }
  }
  if (buffer) {
    const parsedLine = parseOpenAiStreamLine(buffer, sawStreamPayload);
    if (parsedLine.isStreamPayload) {
      sawStreamPayload = true;
    }
    if (sawStreamPayload) {
      rawText = '';
    }
    const pending = dispatchEvents(parsedLine.events);
    if (pending) await pending;
  }
  if (!sawStreamPayload && rawText) {
    const pending = dispatchEvents(parseOpenAiChatCompletionJson(rawText));
    if (pending) await pending;
  }
  return sawCompletionEvent;
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

function buildOpenAiUserContent(text: string, attachments?: AiChatAttachment[]): OpenAiMessageContent {
  if (!attachments?.length) {
    return text;
  }
  return [
    { type: 'text', text },
    ...attachments.map((attachment) => ({
      type: 'image_url' as const,
      image_url: { url: `data:${attachment.mimeType};base64,${attachment.base64Data}` },
    })),
  ];
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export const openAiCompatibleProvider: AiProviderAdapter = {
  async listModels(input) {
    const { response } = await fetchOpenAiCompatibleResponse(input.baseUrl, '/models', {
      headers: { Authorization: `Bearer ${input.apiKey}` },
      signal: input.signal,
    });
    await assertOkResponse(response, 'AI model list sync failed');
    const json = (await response.json()) as OpenAiModelListResponse;
    return (json.data ?? []).map((model) => model.id).filter((modelId): modelId is string => Boolean(modelId));
  },

  async verifyChatCompletion(input) {
    const verifyBody = JSON.stringify({
      model: input.modelId,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
      stream: false,
      temperature: 0,
    });
    const { bodyText, response } = await fetchOpenAiCompatibleResponse(
      input.baseUrl,
      '/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: input.signal,
        body: verifyBody,
      },
      async (text) => {
        try {
          const json = JSON.parse(text) as OpenAiChatCompletionVerifyResponse;
          return Boolean(json?.id || json?.choices) ? null : 'bad_shape';
        } catch {
          return 'bad_shape';
        }
      }
    );
    await assertOkResponse(response, 'AI provider connection failed');
    const text = bodyText ?? await response.text();
    let json: OpenAiChatCompletionVerifyResponse | null = null;
    try {
      json = JSON.parse(text) as OpenAiChatCompletionVerifyResponse;
    } catch {
      json = null;
    }
    if (!json || !Boolean(json?.id || json?.choices)) {
      throw new Error(toUserProviderErrorMessage(classifyAiProviderError({ body: text, fallbackKind: 'bad_shape', status: response.status })));
    }
  },

  async streamChat(input: AiChatRequest, onEvent) {
    try {
      const body: Record<string, unknown> = {
        model: input.modelId,
        stream: true,
        messages: [
          { role: 'system', content: input.systemPrompt },
          ...input.history,
          { role: 'user', content: buildOpenAiUserContent(input.userPrompt, input.attachments) },
        ],
      };
      if (input.providerCachePolicy?.openAiIncludeUsage) {
        body.stream_options = { include_usage: true };
      }
      if (input.providerCachePolicy?.openAiPromptCacheKey) {
        body.prompt_cache_key = input.providerCachePolicy.openAiPromptCacheKey;
      }
      if (input.maxOutputTokens) body.max_tokens = input.maxOutputTokens;
      if (input.responseFormat === 'json_object') body.response_format = { type: 'json_object' };
      if (shouldDisableOpenAiReasoning(input)) {
        body.reasoning_effort = 'none';
      }
      if (shouldDisableDeepSeekThinking(input)) {
        body.thinking = { type: 'disabled' };
      }
      const serializedBody = JSON.stringify(body);
      if (isOfficialDeepSeekVisionModel(input.modelId) && input.attachments?.length) assertDeepSeekInlineRequestBodyBytes(utf8ByteLength(serializedBody));
      const { response } = await fetchOpenAiCompatibleResponse(input.baseUrl, '/chat/completions', {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${input.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: input.signal,
        body: serializedBody,
      });
      await assertOkResponse(response, 'AI chat request failed');
      const sawCompletionEvent = await readStreamingResponse(response, onEvent, input.signal);
      if (input.signal?.aborted) {
        return;
      }
      if (!sawCompletionEvent) {
        await onEvent({ type: 'completed' });
      }
    } catch (error) {
      if (input.signal?.aborted || isAbortError(error)) {
        return;
      }
      await onEvent({ type: 'error', message: error instanceof Error ? error.message : 'AI chat request failed' });
    }
  },

  async embedText(input) {
    const { response } = await fetchOpenAiCompatibleResponse(input.baseUrl, '/embeddings', {
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
