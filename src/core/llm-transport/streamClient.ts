import { fetch as expoFetch } from 'expo/fetch';
import type {
  ILlmStreamClient,
  LlmRole,
  LlmTokenUsage,
  LlmTransportMessage,
  LlmTransportOptions,
} from './types';

function resolveChatEndpoint(baseUrl: string, protocol?: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (protocol === 'anthropic') {
    if (trimmed.endsWith('/v1/messages') || trimmed.endsWith('/messages')) {
      return trimmed;
    }
    if (trimmed.endsWith('/v1')) {
      return `${trimmed}/messages`;
    }
    return `${trimmed}/v1/messages`;
  }

  if (trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

function parseTokenUsage(rawUsage: any): LlmTokenUsage | undefined {
  if (!rawUsage || typeof rawUsage !== 'object') return undefined;

  const promptTokens =
    typeof rawUsage.prompt_tokens === 'number'
      ? rawUsage.prompt_tokens
      : typeof rawUsage.input_tokens === 'number'
        ? rawUsage.input_tokens
        : undefined;

  const completionTokens =
    typeof rawUsage.completion_tokens === 'number'
      ? rawUsage.completion_tokens
      : typeof rawUsage.output_tokens === 'number'
        ? rawUsage.output_tokens
        : undefined;

  const totalTokens =
    typeof rawUsage.total_tokens === 'number'
      ? rawUsage.total_tokens
      : promptTokens !== undefined && completionTokens !== undefined
        ? promptTokens + completionTokens
        : undefined;

  const cachedPromptTokens =
    typeof rawUsage.prompt_cache_hit_tokens === 'number'
      ? rawUsage.prompt_cache_hit_tokens // DeepSeek
      : typeof rawUsage.prompt_tokens_details?.cached_tokens === 'number'
        ? rawUsage.prompt_tokens_details.cached_tokens // OpenAI
        : typeof rawUsage.cache_read_input_tokens === 'number'
          ? rawUsage.cache_read_input_tokens // Anthropic
          : undefined;

  const cacheHitRatio =
    promptTokens && promptTokens > 0 && cachedPromptTokens !== undefined
      ? Math.min(1, Math.max(0, cachedPromptTokens / promptTokens))
      : undefined;

  return {
    promptTokens,
    completionTokens,
    cachedPromptTokens,
    totalTokens,
    cacheHitRatio,
  };
}

function parseSseLine(line: string): { delta: string | null; reasoning?: string | null; usage?: LlmTokenUsage } {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return { delta: null };
  const payload = trimmed.slice(5).trim();
  if (payload === '[DONE]') return { delta: null };

  try {
    const json = JSON.parse(payload);
    let delta: string | null = null;
    let reasoning: string | null = null;

    // OpenAI / DeepSeek delta & reasoning
    const openAiDelta = json.choices?.[0]?.delta?.content;
    const openAiReasoning = json.choices?.[0]?.delta?.reasoning_content ?? json.choices?.[0]?.delta?.reasoning;

    if (typeof openAiReasoning === 'string' && openAiReasoning.length > 0) {
      reasoning = openAiReasoning;
    }

    if (typeof openAiDelta === 'string' && openAiDelta.length > 0) {
      delta = openAiDelta;
    } else if (typeof openAiDelta === 'string') {
      delta = openAiDelta;
    } else if (json.type === 'content_block_delta' && json.delta?.text) {
      // Anthropic delta
      delta = json.delta.text;
    }

    const usage = parseTokenUsage(json.usage || json.message?.usage);
    return { delta, reasoning, usage };
  } catch {
    return { delta: null };
  }
}

export class LlmStreamClient implements ILlmStreamClient {
  async *streamText(
    messages: LlmTransportMessage[],
    options: LlmTransportOptions
  ): AsyncIterable<string> {
    const baseUrl = options.baseUrl || 'https://api.deepseek.com';
    const endpoint = resolveChatEndpoint(baseUrl, options.protocol);
    const fetchFn = typeof expoFetch === 'function' ? expoFetch : fetch;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.apiKey) {
      if (options.protocol === 'anthropic') {
        headers['x-api-key'] = options.apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers.Authorization = `Bearer ${options.apiKey}`;
      }
    }

    let bodyObj: any;
    if (options.protocol === 'anthropic') {
      const systemMsgs = messages.filter((m) => m.role === 'system');
      const nonSystemMsgs = messages.filter((m) => m.role !== 'system');
      const systemPrompt = systemMsgs.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n\n');

      bodyObj = {
        model: options.modelId,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: nonSystemMsgs,
        stream: true,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
      };
    } else {
      bodyObj = {
        model: options.modelId,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        temperature: options.temperature ?? 0.7,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      };
    }

    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyObj),
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
    let inReasoning = false;

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
          const { delta, reasoning, usage } = parseSseLine(line);
          if (usage && options.onUsage) {
            options.onUsage(usage);
          }
          if (reasoning) {
            if (!inReasoning) {
              inReasoning = true;
              yield '<think>';
            }
            yield reasoning;
          }
          if (delta) {
            if (inReasoning) {
              inReasoning = false;
              yield '</think>';
            }
            yield delta;
          }
        }
      }

      if (buffer) {
        const { delta, reasoning, usage } = parseSseLine(buffer);
        if (usage && options.onUsage) {
          options.onUsage(usage);
        }
        if (reasoning) {
          if (!inReasoning) {
            inReasoning = true;
            yield '<think>';
          }
          yield reasoning;
        }
        if (delta) {
          if (inReasoning) {
            inReasoning = false;
            yield '</think>';
          }
          yield delta;
        }
      }

      if (inReasoning) {
        inReasoning = false;
        yield '</think>';
      }
    } finally {
      reader.releaseLock?.();
    }
  }

  async completeText(
    messages: LlmTransportMessage[],
    options: LlmTransportOptions
  ): Promise<{ text: string; usage?: LlmTokenUsage }> {
    const baseUrl = options.baseUrl || 'https://api.deepseek.com';
    const endpoint = resolveChatEndpoint(baseUrl, options.protocol);
    const fetchFn = typeof expoFetch === 'function' ? expoFetch : fetch;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.apiKey) {
      if (options.protocol === 'anthropic') {
        headers['x-api-key'] = options.apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers.Authorization = `Bearer ${options.apiKey}`;
      }
    }

    let bodyObj: any;
    if (options.protocol === 'anthropic') {
      const systemMsgs = messages.filter((m) => m.role === 'system');
      const nonSystemMsgs = messages.filter((m) => m.role !== 'system');
      const systemPrompt = systemMsgs.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n\n');

      bodyObj = {
        model: options.modelId,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: nonSystemMsgs,
        stream: false,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.3,
      };
    } else {
      bodyObj = {
        model: options.modelId,
        messages,
        stream: false,
        temperature: options.temperature ?? 0.3,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      };
    }

    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyObj),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`LLM completion error (${response.status}): ${errText.slice(0, 200)}`);
    }

    const json = await response.json();
    let text = '';
    if (options.protocol === 'anthropic') {
      const textBlock = json.content?.find((c: any) => c.type === 'text');
      text = textBlock?.text || '';
    } else {
      const msg = json.choices?.[0]?.message;
      const reasoning = msg?.reasoning_content ?? msg?.reasoning;
      const content = msg?.content || '';
      if (reasoning && typeof reasoning === 'string' && reasoning.length > 0) {
        text = `<think>${reasoning}</think>${content}`;
      } else {
        text = content;
      }
    }

    const usage = parseTokenUsage(json.usage);
    if (usage && options.onUsage) {
      options.onUsage(usage);
    }

    return { text, usage };
  }
}

export const streamClient = new LlmStreamClient();
