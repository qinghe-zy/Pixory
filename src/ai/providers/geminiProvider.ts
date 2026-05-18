import { fetch as expoFetch } from 'expo/fetch';

import {
  assertOkResponse,
  normalizeBaseUrl,
  type AiChatRequest,
  type AiProviderAdapter,
  type AiStreamEvent,
  type AiStreamEventHandler,
} from './base';

interface GeminiModelsResponse {
  models?: Array<{ name?: string }>;
}

interface GeminiEmbeddingResponse {
  embedding?: { values?: number[] };
}

async function emitGeminiTextFromChunk(chunk: unknown, onEvent: AiStreamEventHandler): Promise<void> {
  const candidate = (chunk as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  if (text) {
    await onEvent({ type: 'answer_delta', text });
  }
}

async function emitGeminiJsonChunk(rawJson: string, onEvent: AiStreamEventHandler): Promise<void> {
  try {
    await emitGeminiTextFromChunk(JSON.parse(rawJson), onEvent);
  } catch {
    // Incomplete chunks stay buffered before this point; malformed completed chunks are ignored.
  }
}

async function emitCompletedGeminiChunks(buffer: string, onEvent: AiStreamEventHandler): Promise<string> {
  let depth = 0;
  let start = -1;
  let consumed = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < buffer.length; index += 1) {
    const char = buffer[index];
    if (start < 0) {
      if (char === '{') {
        start = index;
        depth = 1;
      } else if (!/\s|,|\[|\]/.test(char)) {
        consumed = index + 1;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        await emitGeminiJsonChunk(buffer.slice(start, index + 1), onEvent);
        start = -1;
        consumed = index + 1;
      }
    }
  }

  return buffer.slice(start >= 0 ? start : consumed);
}

async function readGeminiStream(response: Response, onEvent: AiStreamEventHandler): Promise<void> {
  const body = response.body as unknown as { getReader?: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> } } | null;
  if (!body?.getReader) {
    const json = await response.json();
    const chunks = Array.isArray(json) ? json : [json];
    for (const chunk of chunks) {
      await emitGeminiTextFromChunk(chunk, onEvent);
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
    buffer = await emitCompletedGeminiChunks(buffer, onEvent);
  }
  const trimmed = buffer.trim();
  if (!trimmed) {
    return;
  }
  try {
    const parsed = JSON.parse(trimmed);
    const chunks = Array.isArray(parsed) ? parsed : [parsed];
    for (const chunk of chunks) {
      await emitGeminiTextFromChunk(chunk, onEvent);
    }
  } catch {
    await onEvent({ type: 'answer_delta', text: trimmed });
  }
}

export const geminiProvider: AiProviderAdapter = {
  async testConnection(input) {
    const response = await expoFetch(`${normalizeBaseUrl(input.baseUrl)}/v1beta/models?key=${encodeURIComponent(input.apiKey)}`);
    await assertOkResponse(response, 'Gemini connection failed');
  },

  async listModels(input) {
    const response = await expoFetch(`${normalizeBaseUrl(input.baseUrl)}/v1beta/models?key=${encodeURIComponent(input.apiKey)}`);
    await assertOkResponse(response, 'Gemini model list sync failed');
    const json = (await response.json()) as GeminiModelsResponse;
    return (json.models ?? [])
      .map((model) => model.name?.replace(/^models\//, ''))
      .filter((modelId): modelId is string => Boolean(modelId));
  },

  async streamChat(input: AiChatRequest, onEvent) {
    try {
      const response = await expoFetch(
        `${normalizeBaseUrl(input.baseUrl)}/v1beta/models/${encodeURIComponent(input.modelId)}:streamGenerateContent?key=${encodeURIComponent(input.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: input.systemPrompt }] },
            contents: [
              ...input.history.map((message) => ({
                role: message.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: message.content }],
              })),
              { role: 'user', parts: [{ text: input.userPrompt }] },
            ],
          }),
        }
      );
      await assertOkResponse(response, 'Gemini chat request failed');
      await readGeminiStream(response, onEvent);
      await onEvent({ type: 'completed' });
    } catch (error) {
      await onEvent({ type: 'error', message: error instanceof Error ? error.message : 'Gemini chat request failed' });
    }
  },

  async embedText(input) {
    const response = await expoFetch(
      `${normalizeBaseUrl(input.baseUrl)}/v1beta/models/${encodeURIComponent(input.modelId)}:embedContent?key=${encodeURIComponent(input.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text: input.text }] },
        }),
      }
    );
    await assertOkResponse(response, 'Gemini embedding request failed');
    const json = (await response.json()) as GeminiEmbeddingResponse;
    return json.embedding?.values?.filter((value): value is number => typeof value === 'number') ?? [];
  },
};
