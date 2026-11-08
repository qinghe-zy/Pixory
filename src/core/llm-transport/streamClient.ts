import type {
  ILlmStreamClient,
  LlmRole,
  LlmTokenUsage,
  LlmTransportMessage,
  LlmTransportOptions,
} from './types';

const resolveFetchFn = (): typeof fetch => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const expoMod = require('expo/fetch');
    if (typeof expoMod?.fetch === 'function') return expoMod.fetch;
  } catch {}
  return globalThis.fetch;
};

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

function parseSseLine(line: string): { delta: string | null; reasoning?: string | null; usage?: LlmTokenUsage; isDone?: boolean; finishReason?: string | null } {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return { delta: null };
  const payload = trimmed.slice(5).trim();
  if (payload === '[DONE]') return { delta: null, isDone: true, finishReason: 'stop' };

  try {
    const json = JSON.parse(payload);
    let delta: string | null = null;
    let reasoning: string | null = null;
    let isDone = false;
    let finishReason: string | null = null;

    // OpenAI / DeepSeek delta & reasoning
    const choice = json.choices?.[0];
    const openAiDelta = choice?.delta?.content;
    const openAiReasoning = choice?.delta?.reasoning_content ?? choice?.delta?.reasoning;
    if (choice?.finish_reason && choice.finish_reason !== 'null') {
      isDone = true;
      finishReason = String(choice.finish_reason);
    }

    if (typeof openAiReasoning === 'string' && openAiReasoning.length > 0) {
      reasoning = openAiReasoning;
    }

    if (typeof openAiDelta === 'string') {
      delta = openAiDelta;
    } else if (json.type === 'content_block_delta' && json.delta?.text) {
      // Anthropic delta
      delta = json.delta.text;
    } else if (json.type === 'message_delta' && json.delta?.stop_reason) {
      isDone = true;
      finishReason = String(json.delta.stop_reason);
    } else if (json.type === 'message_stop') {
      isDone = true;
      finishReason = 'stop';
    }

    const usage = parseTokenUsage(json.usage || json.message?.usage);
    return { delta, reasoning, usage, isDone, finishReason };
  } catch {
    return { delta: null };
  }
}

export function mergeLayer4IntoUserContent(
  userContent: string | Array<{ type: string; text?: string; image_url?: any }>,
  anchorText: string
): string | Array<{ type: string; text?: string; image_url?: any }> {
  if (!anchorText || !anchorText.trim()) return userContent;
  const wrapped = `\n<context_anchor>\n${anchorText.trim()}\n</context_anchor>\n`;
  if (typeof userContent === 'string') {
    return `${wrapped}${userContent}`.trim();
  }
  if (Array.isArray(userContent)) {
    let merged = false;
    const cloned = userContent.map((item) => {
      if (item.type === 'text' && !merged) {
        merged = true;
        return { ...item, text: `${wrapped}${item.text || ''}`.trim() };
      }
      return item;
    });
    if (!merged) {
      cloned.unshift({ type: 'text', text: wrapped.trim() });
    }
    return cloned;
  }
  return userContent;
}

/**
 * 传输层消息合规化与前缀缓存收敛器：
 * 1. 确保开头的 system 节点（Layer 1 / Layer 2）保持绝对纯净。
 * 2. 若中间出现后置的 system 节点（如 Layer 4 场记层），安全折叠进末尾 user 节点（使用 <context_anchor>），
 *    防止 OpenAI / DeepSeek / Gemini 等网关因后置 system 报 400 校验错误。
 * 3. 针对 Anthropic 协议，构造支持 cache_control 的结构。
 */
export function normalizeMessagesForTransport(
  messages: LlmTransportMessage[],
  protocol?: string
): {
  normalizedMessages: LlmTransportMessage[];
  anthropicSystem?: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
  anthropicMessages?: any[];
} {
  // 分离头部 system 与后续消息
  let firstNonSystemIdx = messages.findIndex((m) => m.role !== 'system');
  if (firstNonSystemIdx === -1) {
    firstNonSystemIdx = messages.length;
  }

  const leadingSystemMsgs = messages.slice(0, firstNonSystemIdx);
  const remainderMsgs = messages.slice(firstNonSystemIdx);

  // 检查 remainderMsgs 中是否有 trailing system（如 Layer 4）
  const trailingSystemMsgs = remainderMsgs.filter((m) => m.role === 'system');
  const nonSystemRemainder = remainderMsgs.filter((m) => m.role !== 'system');

  let normalizedRemainder = nonSystemRemainder;
  if (trailingSystemMsgs.length > 0) {
    const trailingSystemText = trailingSystemMsgs
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .filter(Boolean)
      .join('\n\n');

    let lastUserIdx = -1;
    for (let i = normalizedRemainder.length - 1; i >= 0; i--) {
      if (normalizedRemainder[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }

    if (lastUserIdx !== -1) {
      normalizedRemainder = normalizedRemainder.map((msg, idx) => {
        if (idx === lastUserIdx) {
          return {
            ...msg,
            content: mergeLayer4IntoUserContent(msg.content as any, trailingSystemText) as any,
          };
        }
        return msg;
      });
    } else {
      normalizedRemainder = [
        ...normalizedRemainder,
        {
          role: 'user',
          content: `<context_anchor>\n${trailingSystemText}\n</context_anchor>`,
        },
      ];
    }
  }

  // 严格保证角色交替 (Roles Must Alternate Guard):
  // 遍历 normalizedRemainder，将连续相同的角色节点安全合并（使用 \n），从根源杜绝 DeepSeek/Claude 400 Bad Request
  const alternatingRemainder: LlmTransportMessage[] = [];
  for (const msg of normalizedRemainder) {
    const prev = alternatingRemainder[alternatingRemainder.length - 1];
    if (prev && prev.role === msg.role) {
      if (typeof prev.content === 'string' && typeof msg.content === 'string') {
        prev.content = `${prev.content}\n${msg.content}`;
      } else {
        const prevParts = typeof prev.content === 'string' ? [{ type: 'text', text: prev.content }] : prev.content;
        const msgParts = typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : msg.content;
        prev.content = [...prevParts, ...msgParts] as any;
      }
    } else {
      alternatingRemainder.push({ ...msg });
    }
  }

  const normalizedMessages: LlmTransportMessage[] = [
    ...leadingSystemMsgs,
    ...alternatingRemainder,
  ];

  if (protocol === 'anthropic') {
    const systemPromptText = leadingSystemMsgs
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join('\n\n');

    const anthropicSystem: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = systemPromptText
      ? [
          {
            type: 'text',
            text: systemPromptText,
            cache_control: { type: 'ephemeral' },
          },
        ]
      : [];

    const anthropicMessages = alternatingRemainder.map((m, idx, arr) => {
      const isSecondCheckpoint = arr.length >= 4 && idx === arr.length - 2;
      if (typeof m.content === 'string') {
        if (isSecondCheckpoint) {
          return {
            role: m.role,
            content: [
              {
                type: 'text',
                text: m.content,
                cache_control: { type: 'ephemeral' },
              },
            ],
          };
        }
        return { role: m.role, content: m.content };
      }
      if (Array.isArray(m.content)) {
        if (isSecondCheckpoint && m.content.length > 0) {
          const clonedParts = [...m.content];
          const lastPart = clonedParts[clonedParts.length - 1];
          clonedParts[clonedParts.length - 1] = {
            ...lastPart,
            cache_control: { type: 'ephemeral' },
          } as any;
          return { role: m.role, content: clonedParts };
        }
        return { role: m.role, content: m.content };
      }
      return m;
    });

    return {
      normalizedMessages,
      anthropicSystem,
      anthropicMessages,
    };
  }

  return { normalizedMessages };
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
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!abortSignal?.aborted) {
        return await fetchFn(endpoint, init);
      }
    }
    return res;
  } catch (err: any) {
    if (abortSignal?.aborted) {
      throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (abortSignal?.aborted) {
      throw err;
    }
    return await fetchFn(endpoint, init);
  }
}

export const REASONING_MODEL_REGEX =
  /r1|reasoner|reasoning|thinking|qwq|o1|o3|deepseek-v4|gpt-5|gemini-2\.5|claude-sonnet-4\.5|claude-haiku-4\.5/i;

export function isReasoningModelTarget(modelId: string | null | undefined, supportsThinking?: boolean): boolean {
  return Boolean(supportsThinking) || REASONING_MODEL_REGEX.test(modelId || '');
}

export const isReasoningModel = isReasoningModelTarget;

export class LlmStreamClient implements ILlmStreamClient {
  async *streamText(
    messages: LlmTransportMessage[],
    options: LlmTransportOptions
  ): AsyncIterable<string> {
    const baseUrl = options.baseUrl || 'https://api.deepseek.com';
    const endpoint = resolveChatEndpoint(baseUrl, options.protocol);
    const fetchFn = resolveFetchFn();

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

    const isReasoningModel = isReasoningModelTarget(options.modelId, options.supportsThinking);
    const isOpenAiOSeries = /^(?:o1|o3)(?:-|$)/i.test(options.modelId || '');
    const defaultBudget = isReasoningModel ? 8192 : 4096;
    const tokenBudget = options.maxTokens ?? defaultBudget;
    const supportsStreamOptions = /api\.openai\.com|api\.deepseek\.com/i.test(baseUrl);

    let bodyObj: any;
    if (options.protocol === 'anthropic') {
      const normalized = normalizeMessagesForTransport(messages, 'anthropic');
      bodyObj = {
        model: options.modelId,
        ...(normalized.anthropicSystem && normalized.anthropicSystem.length > 0
          ? { system: normalized.anthropicSystem }
          : {}),
        messages: normalized.anthropicMessages,
        stream: true,
        max_tokens: tokenBudget,
        ...(isReasoningModel ? {} : { temperature: options.temperature ?? 0.7 }),
      };
    } else {
      const normalized = normalizeMessagesForTransport(messages, options.protocol);
      bodyObj = {
        model: options.modelId,
        messages: normalized.normalizedMessages,
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
          let stallTimer: ReturnType<typeof setTimeout> | undefined;
          // 推理模型首字冷启动/深度思考（TTFT）放宽至 75s 超时宽限，收到首块数据后恢复 45s 停滞保护
          const stallTimeoutMs = !sawAnyContent && isReasoningModel ? 75000 : 45000;
          const stallPromise = new Promise<never>((_, reject) => {
            stallTimer = setTimeout(() => {
              reject(new Error('LLM stream read stall timeout (45s without data)'));
            }, stallTimeoutMs);
          });
          try {
            readResult = await Promise.race([reader.read(), stallPromise]);
          } finally {
            if (stallTimer) clearTimeout(stallTimer);
          }
        } catch (readErr) {
          // 若已经收到显式 [DONE] 或停机信号，服务端的连接关闭属于正常结束
          if (sawDone) {
            break;
          }
          try {
            await reader.cancel?.().catch(() => {});
          } catch {}
          throw readErr;
        }
        const { done, value } = readResult;
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const { delta, reasoning, usage, isDone, finishReason } = parseSseLine(line);
          if (finishReason && options.onFinishReason) {
            options.onFinishReason(finishReason);
          }
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
        const { delta, reasoning, usage, finishReason } = parseSseLine(buffer);
        if (finishReason && options.onFinishReason) {
          options.onFinishReason(finishReason);
        }
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
    const fetchFn = resolveFetchFn();

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

    const isReasoningModel = isReasoningModelTarget(options.modelId, options.supportsThinking);
    const isOpenAiOSeries = /^(?:o1|o3)(?:-|$)/i.test(options.modelId || '');
    const defaultBudget = isReasoningModel ? 8192 : 4096;
    const tokenBudget = options.maxTokens ?? defaultBudget;

    let bodyObj: any;
    if (options.protocol === 'anthropic') {
      const normalized = normalizeMessagesForTransport(messages, 'anthropic');
      bodyObj = {
        model: options.modelId,
        ...(normalized.anthropicSystem && normalized.anthropicSystem.length > 0
          ? { system: normalized.anthropicSystem }
          : {}),
        messages: normalized.anthropicMessages,
        stream: false,
        max_tokens: tokenBudget,
        ...(isReasoningModel ? {} : { temperature: options.temperature ?? 0.3 }),
      };
    } else {
      const normalized = normalizeMessagesForTransport(messages, options.protocol);
      bodyObj = {
        model: options.modelId,
        messages: normalized.normalizedMessages,
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
