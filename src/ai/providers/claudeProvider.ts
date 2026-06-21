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

interface ClaudeModelsResponse {
  data?: Array<{ id?: string }>;
}

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  };
}

function parseClaudeStreamLine(line: string): AiStreamEvent[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) {
    return [];
  }
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === '[DONE]') {
    return [];
  }
  try {
    const parsed = JSON.parse(payload);
    if (parsed.type === 'message_start' && parsed.message?.usage) {
      return [{ type: 'provider_usage', rawUsage: parsed.message.usage }];
    }
    if (parsed.type === 'content_block_delta') {
      const text = parsed.delta?.text;
      return typeof text === 'string' && text ? [{ type: 'answer_delta', text }] : [];
    }
    if (parsed.type === 'message_delta' && parsed.usage) {
      return [{ type: 'provider_usage', rawUsage: parsed.usage }];
    }
    if (parsed.type === 'message_delta' && parsed.delta?.stop_reason) {
      return [{ type: 'completed', finishReason: parsed.delta.stop_reason }];
    }
  } catch {
    return [];
  }
  return [];
}

function buildClaudeSystem(input: AiChatRequest): string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> {
  const blocks = input.providerCachePolicy?.anthropicSystemBlocks;
  if (!blocks?.length) {
    return input.systemPrompt;
  }
  return blocks
    .filter((block) => block.text.trim())
    .map((block) => ({
      type: 'text' as const,
      text: block.text,
      ...(block.cacheControl ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }));
}

async function flushClaudeBuffer(buffer: string, onEvent: AiStreamEventHandler): Promise<void> {
  if (!buffer.trim()) {
    return;
  }
  for (const event of parseClaudeStreamLine(buffer)) {
    await onEvent(event);
  }
}

async function readClaudeStreamingResponse(response: Response, onEvent: AiStreamEventHandler, signal?: AbortSignal): Promise<void> {
  const body = response.body as unknown as { getReader?: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> } } | null;
  if (!body?.getReader) {
    const text = await response.text();
    if (signal?.aborted) {
      return;
    }
    for (const line of text.split('\n')) {
      for (const event of parseClaudeStreamLine(line)) {
        await onEvent(event);
      }
    }
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
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
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      for (const event of parseClaudeStreamLine(line)) {
        await onEvent(event);
      }
    }
  }
  await flushClaudeBuffer(buffer, onEvent);
}

export const claudeProvider: AiProviderAdapter = {
  async listModels(input) {
    const response = await expoFetch(`${normalizeBaseUrl(input.baseUrl)}/v1/models`, {
      headers: anthropicHeaders(input.apiKey),
      signal: input.signal,
    });
    await assertOkResponse(response, 'Claude model list sync failed');
    const json = (await response.json()) as ClaudeModelsResponse;
    return (json.data ?? []).map((model) => model.id).filter((modelId): modelId is string => Boolean(modelId));
  },

  async verifyChatCompletion(input) {
    const response = await expoFetch(`${normalizeBaseUrl(input.baseUrl)}/v1/messages`, {
      method: 'POST',
      headers: anthropicHeaders(input.apiKey),
      signal: input.signal,
      body: JSON.stringify({
        model: input.modelId,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    await assertOkResponse(response, 'Claude connection failed');
  },

  async streamChat(input: AiChatRequest, onEvent) {
    try {
      const response = await expoFetch(`${normalizeBaseUrl(input.baseUrl)}/v1/messages`, {
        method: 'POST',
        headers: {
          ...anthropicHeaders(input.apiKey),
          Accept: 'text/event-stream',
        },
        signal: input.signal,
        body: JSON.stringify({
          model: input.modelId,
          max_tokens: 2048,
          stream: true,
          system: buildClaudeSystem(input),
          messages: [
            ...input.history,
            { role: 'user', content: input.userPrompt },
          ],
        }),
      });
      await assertOkResponse(response, 'Claude chat request failed');
      await readClaudeStreamingResponse(response, onEvent, input.signal);
      if (input.signal?.aborted) {
        return;
      }
      await onEvent({ type: 'completed' });
    } catch (error) {
      if (input.signal?.aborted || isAbortError(error)) {
        return;
      }
      await onEvent({ type: 'error', message: error instanceof Error ? error.message : 'Claude chat request failed' });
    }
  },

  async embedText() {
    throw new Error('Claude does not provide a Pixory-supported embedding API.');
  },
};
