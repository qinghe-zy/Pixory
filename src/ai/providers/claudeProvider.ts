import { assertOkResponse, normalizeBaseUrl, type AiChatRequest, type AiProviderAdapter, type AiStreamEvent } from './base';

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
    if (parsed.type === 'content_block_delta') {
      const text = parsed.delta?.text;
      return typeof text === 'string' && text ? [{ type: 'answer_delta', text }] : [];
    }
    if (parsed.type === 'message_delta' && parsed.delta?.stop_reason) {
      return [{ type: 'completed', finishReason: parsed.delta.stop_reason }];
    }
  } catch {
    return [];
  }
  return [];
}

async function readClaudeStreamingResponse(response: Response, onEvent: (event: AiStreamEvent) => void): Promise<void> {
  const body = response.body as unknown as { getReader?: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> } } | null;
  if (!body?.getReader) {
    const text = await response.text();
    for (const line of text.split('\n')) {
      for (const event of parseClaudeStreamLine(line)) {
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
      for (const event of parseClaudeStreamLine(line)) {
        onEvent(event);
      }
    }
  }
}

export const claudeProvider: AiProviderAdapter = {
  async testConnection(input) {
    const response = await fetch(`${normalizeBaseUrl(input.baseUrl)}/v1/models`, {
      headers: anthropicHeaders(input.apiKey),
    });
    await assertOkResponse(response, 'Claude connection failed');
  },

  async listModels(input) {
    const response = await fetch(`${normalizeBaseUrl(input.baseUrl)}/v1/models`, {
      headers: anthropicHeaders(input.apiKey),
    });
    await assertOkResponse(response, 'Claude model list sync failed');
    const json = (await response.json()) as ClaudeModelsResponse;
    return (json.data ?? []).map((model) => model.id).filter((modelId): modelId is string => Boolean(modelId));
  },

  async streamChat(input: AiChatRequest, onEvent) {
    try {
      const response = await fetch(`${normalizeBaseUrl(input.baseUrl)}/v1/messages`, {
        method: 'POST',
        headers: anthropicHeaders(input.apiKey),
        body: JSON.stringify({
          model: input.modelId,
          max_tokens: 2048,
          stream: true,
          system: input.systemPrompt,
          messages: [
            ...input.history,
            { role: 'user', content: input.userPrompt },
          ],
        }),
      });
      await assertOkResponse(response, 'Claude chat request failed');
      await readClaudeStreamingResponse(response, onEvent);
      onEvent({ type: 'completed' });
    } catch (error) {
      onEvent({ type: 'error', message: error instanceof Error ? error.message : 'Claude chat request failed' });
    }
  },

  async embedText() {
    throw new Error('Claude does not provide a Pixory-supported embedding API.');
  },
};
