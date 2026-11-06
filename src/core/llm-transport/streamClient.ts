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

function parseSseLine(line: string): { delta: string | null; reasoning?: string | null; usage?: LlmTokenUsage; isDone?: boolean } {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return { delta: null };
  const payload = trimmed.slice(5).trim();
  if (payload === '[DONE]') return { delta: null, isDone: true };

  try {
    const json = JSON.parse(payload);
    let delta: string | null = null;
    let reasoning: string | null = null;
    let isDone = false;

    // OpenAI / DeepSeek delta & reasoning
    const choice = json.choices?.[0];
    const openAiDelta = choice?.delta?.content;
    const openAiReasoning = choice?.delta?.reasoning_content ?? choice?.delta?.reasoning;
    if (choice?.finish_reason && choice.finish_reason !== 'null') {
      isDone = true;
    }

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
    } else if (json.type === 'message_stop') {
      isDone = true;
    }

    const usage = parseTokenUsage(json.usage || json.message?.usage);
    return { delta, reasoning, usage, isDone };
  } catch {
    return { delta: null };
  }
}

/**
 * 传输层 1-Shot 快速透明重试控制器
 * 捕获网络握手微抖动或网关瞬时 502/503/504 换机抖动，退避 350ms 后静默重试一次
 */
async function fetchWithOneShotRetry(
  fetchFn: (url: any, init?: any) => Promise<any>,
  endpoint: string,
  init: RequestInit,
  abortSignal?: AbortSignal
): Promise<Response> {
  try {
    const res = await fetchFn(endpoint, init);
    if (!res.ok && [502, 503, 504].includes(res.status) && !abortSignal?.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (!abortSignal?.aborted) {
        return await fetchFn(endpoint, init);
      }
    }
    return res;
  } catch (err: any) {
    if (abortSignal?.aborted) {
      throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (abortSignal?.aborted) {
      throw err;
    }
    return await fetchFn(endpoint, init);
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
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    };
    if (options.apiKey) {
      if (options.protocol === 'anthropic') {
        headers['x-api-key'] = options.apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers.Authorization = `Bearer ${options.apiKey}`;
      }
    }

    const isReasoningModel = /r1|reasoner|reasoning|thinking|qwq|o1|o3/i.test(options.modelId || '');
    const isOpenAiOSeries = /^(?:o1|o3)(?:-|$)/i.test(options.modelId || '');
    const defaultBudget = isReasoningModel ? 8192 : 4096;
    const tokenBudget = options.maxTokens ?? defaultBudget;
    const supportsStreamOptions = /api\.openai\.com|api\.deepseek\.com/i.test(baseUrl);

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
        max_tokens: tokenBudget,
        ...(isReasoningModel ? {} : { temperature: options.temperature ?? 0.7 }),
      };
    } else {
      bodyObj = {
        model: options.modelId,
        messages,
        stream: true,
        ...(supportsStreamOptions ? { stream_options: { include_usage: true } } : {}),
        ...(isReasoningModel ? {} : { temperature: options.temperature ?? 0.7 }),
        ...(isOpenAiOSeries ? { max_completion_tokens: tokenBudget } : { max_tokens: tokenBudget }),
      };
    }

    const response = await fetchWithOneShotRetry(
      fetchFn,
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyObj),
        signal: options.abortSignal,
      },
      options.abortSignal
    );

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
    let sawAnyContent = false;
    let sawDone = false;

    try {
      while (!sawDone) {
        if (options.abortSignal?.aborted) {
          break;
        }
        let readResult: { done: boolean; value?: Uint8Array };
        try {
          readResult = await reader.read();
        } catch (readErr) {
          // 若已经收到部分内容，服务端的连接静默关闭属于正常结束，不抛出异常打断对话
          if (sawAnyContent || sawDone) {
            break;
          }
          throw readErr;
        }
        const { done, value } = readResult;
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const { delta, reasoning, usage, isDone } = parseSseLine(line);
          if (isDone) {
            sawDone = true;
          }
          if (usage && options.onUsage) {
            options.onUsage(usage);
          }
          if (reasoning) {
            sawAnyContent = true;
            if (!inReasoning) {
              inReasoning = true;
              yield '<think>';
            }
            yield reasoning;
          }
          if (delta) {
            sawAnyContent = true;
            let cleanDelta = delta;
            if (inReasoning) {
              inReasoning = false;
              yield '</think>';
              if (/^<think>/i.test(cleanDelta)) {
                cleanDelta = cleanDelta.replace(/^<think>/i, '');
              }
            }
            if (cleanDelta.length > 0) {
              yield cleanDelta;
            }
          }
          if (sawDone) break;
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
          let cleanDelta = delta;
          if (inReasoning) {
            inReasoning = false;
            yield '</think>';
            if (/^<think>/i.test(cleanDelta)) {
              cleanDelta = cleanDelta.replace(/^<think>/i, '');
            }
          }
          if (cleanDelta.length > 0) {
            yield cleanDelta;
          }
        }
      }

      if (inReasoning) {
        inReasoning = false;
        yield '</think>';
      }
    } finally {
      try {
        reader.releaseLock?.();
      } catch {}
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

    const isReasoningModel = /r1|reasoner|reasoning|thinking|qwq|o1|o3/i.test(options.modelId || '');
    const isOpenAiOSeries = /^(?:o1|o3)(?:-|$)/i.test(options.modelId || '');
    const defaultBudget = isReasoningModel ? 8192 : 4096;
    const tokenBudget = options.maxTokens ?? defaultBudget;

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
        max_tokens: tokenBudget,
        ...(isReasoningModel ? {} : { temperature: options.temperature ?? 0.3 }),
      };
    } else {
      bodyObj = {
        model: options.modelId,
        messages,
        stream: false,
        ...(isReasoningModel ? {} : { temperature: options.temperature ?? 0.3 }),
        ...(isOpenAiOSeries ? { max_completion_tokens: tokenBudget } : { max_tokens: tokenBudget }),
      };
    }

    const response = await fetchWithOneShotRetry(
      fetchFn,
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyObj),
        signal: options.abortSignal,
      },
      options.abortSignal
    );

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
