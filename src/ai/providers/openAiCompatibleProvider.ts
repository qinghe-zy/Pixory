import { assertOkResponse, normalizeBaseUrl, type AiChatRequest, type AiProviderAdapter, type AiStreamEvent } from './base';

interface OpenAiModelListResponse {
  data?: Array<{ id?: string }>;
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

async function readStreamingResponse(response: Response, onEvent: (event: AiStreamEvent) => void): Promise<void> {
  const body = response.body as unknown as { getReader?: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> } } | null;
  if (!body?.getReader) {
    const text = await response.text();
    for (const line of text.split('\n')) {
      for (const event of parseOpenAiStreamLine(line)) {
        onEvent(event);
      }
    }
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      for (const event of parseOpenAiStreamLine(line)) {
        onEvent(event);
      }
    }
  }
  if (buffer) {
    for (const event of parseOpenAiStreamLine(buffer)) {
      onEvent(event);
    }
  }
}

export const openAiCompatibleProvider: AiProviderAdapter = {
  async testConnection(input) {
    const response = await fetch(`${normalizeBaseUrl(input.baseUrl)}/models`, {
      headers: { Authorization: `Bearer ${input.apiKey}` },
    });
    await assertOkResponse(response, 'AI provider connection failed');
  },

  async listModels(input) {
    const response = await fetch(`${normalizeBaseUrl(input.baseUrl)}/models`, {
      headers: { Authorization: `Bearer ${input.apiKey}` },
    });
    await assertOkResponse(response, 'AI model list sync failed');
    const json = (await response.json()) as OpenAiModelListResponse;
    return (json.data ?? []).map((model) => model.id).filter((modelId): modelId is string => Boolean(modelId));
  },

  async streamChat(input: AiChatRequest, onEvent) {
    try {
      const response = await fetch(`${normalizeBaseUrl(input.baseUrl)}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: input.modelId,
          stream: true,
          messages: [
            { role: 'system', content: input.systemPrompt },
            ...input.history,
            { role: 'user', content: input.userPrompt },
          ],
        }),
      });
      await assertOkResponse(response, 'AI chat request failed');
      await readStreamingResponse(response, onEvent);
      onEvent({ type: 'completed' });
    } catch (error) {
      onEvent({ type: 'error', message: error instanceof Error ? error.message : 'AI chat request failed' });
    }
  },
};
