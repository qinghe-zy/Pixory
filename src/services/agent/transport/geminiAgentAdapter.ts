import { fetch as expoFetch } from 'expo/fetch';
import {
  assertOkResponse,
  providerEndpoint,
  type AgentTurnRequest,
  type AiStreamEvent,
  type AiStreamEventHandler,
  type AiToolDefinition,
} from '../../../ai/providers/base';
import type {
  AgentMessage,
  AgentContentPart,
  AgentToolCall,
} from '../kernel/agentTypes';
import {
  extractTextContent,
  extractToolResult,
  parseJsonSafely,
} from './agentTransportUtils';
import { streamSseReader } from './sseStreamReader';

/**
 * 组装 Google Gemini (GenAI REST API) 专用的 HTTP 请求 Payload
 *
 * 核心关键：
 * 1. 结构化 functionDeclarations 声明；
 * 2. 区分 user 与 model 角色（Gemini 不接受 assistant/system 角色名）；
 * 3. 严格回传 functionCall 与 functionResponse（functionResponse.name 严格对齐函数声明名）；
 * 4. 附着保留 thoughtSignature（避免多轮上下文丢失思考签名）。
 */
export function buildGeminiAgentPayload(input: AgentTurnRequest): Record<string, unknown> {
  const contents: Array<{ role: 'user' | 'model'; parts: any[] }> = [];

  // 构建 toolCallId -> functionName 快速映射表，保证 functionResponse.name 严格对齐 Gemini 规范
  const toolCallIdToNameMap = new Map<string, string>();
  if (input.tools) {
    for (let i = 0; i < input.tools.length; i++) {
      const t = input.tools[i];
      toolCallIdToNameMap.set(t.name, t.name);
    }
  }

  // 预扫描历史记录中的 toolCall 命名
  for (let i = 0; i < input.messages.length; i++) {
    const msg = input.messages[i];
    if (msg.toolCalls) {
      for (let j = 0; j < msg.toolCalls.length; j++) {
        const tc = msg.toolCalls[j];
        toolCallIdToNameMap.set(tc.id, tc.name);
      }
    }
    if (Array.isArray(msg.content)) {
      for (let j = 0; j < msg.content.length; j++) {
        const p = msg.content[j];
        if (p.type === 'tool_call') {
          toolCallIdToNameMap.set(p.toolCall.id, p.toolCall.name);
        }
      }
    }
  }

  for (const msg of input.messages) {
    if (msg.role === 'system') {
      // 系统提示词独立在 systemInstruction，历史中的系统信息并入 user
      contents.push({
        role: 'user',
        parts: [{ text: extractTextContent(msg.content) }],
      });
    } else if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }],
        });
      } else {
        const parts: any[] = [];
        for (let i = 0; i < msg.content.length; i++) {
          const p = msg.content[i];
          if (p.type === 'text') {
            parts.push({ text: p.text });
          } else if (p.type === 'tool_result') {
            const funcName = toolCallIdToNameMap.get(p.toolCallId) || p.toolCallId || 'unnamed_tool';
            const resObj = parseJsonSafely(p.content);
            parts.push({
              functionResponse: {
                name: funcName,
                response: { output: resObj, isError: p.isError || false },
              },
            });
          }
        }
        contents.push({ role: 'user', parts });
      }
    } else if (msg.role === 'assistant') {
      const parts: any[] = [];
      const handledToolCallIds = new Set<string>();

      if (typeof msg.content === 'string') {
        if (msg.content) {
          parts.push({ text: msg.content });
        }
      } else if (Array.isArray(msg.content)) {
        for (let i = 0; i < msg.content.length; i++) {
          const p = msg.content[i];
          if (p.type === 'thinking') {
            if (p.signature) {
              parts.push({
                text: p.thinking,
                thoughtSignature: p.signature,
              });
            } else if (p.thinking) {
              parts.push({ text: p.thinking, thought: true });
            }
          } else if (p.type === 'text') {
            parts.push({ text: p.text });
          } else if (p.type === 'tool_call') {
            handledToolCallIds.add(p.toolCall.id);
            toolCallIdToNameMap.set(p.toolCall.id, p.toolCall.name);
            parts.push({
              functionCall: {
                name: p.toolCall.name,
                args: parseJsonSafely(p.toolCall.arguments),
              },
            });
          }
        }
      }

      // 兜底补全未包含在 parts 里的 msg.toolCalls
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (let i = 0; i < msg.toolCalls.length; i++) {
          const tc = msg.toolCalls[i];
          if (!handledToolCallIds.has(tc.id)) {
            toolCallIdToNameMap.set(tc.id, tc.name);
            parts.push({
              functionCall: {
                name: tc.name,
                args: parseJsonSafely(tc.arguments),
              },
            });
          }
        }
      }

      contents.push({ role: 'model', parts });
    } else if (msg.role === 'tool') {
      const toolRes = extractToolResult(msg);
      const funcName = toolCallIdToNameMap.get(toolRes.toolCallId) || toolRes.toolCallId || 'unnamed_tool';
      const resObj = parseJsonSafely(toolRes.content);

      const responsePart = {
        functionResponse: {
          name: funcName,
          response: { output: resObj, isError: toolRes.isError },
        },
      };

      const prev = contents[contents.length - 1];
      if (prev && prev.role === 'user') {
        prev.parts.push(responsePart);
      } else {
        contents.push({
          role: 'user',
          parts: [responsePart],
        });
      }
    }
  }

  const payload: Record<string, unknown> = {
    contents,
  };

  if (input.systemPrompt && input.systemPrompt.trim()) {
    payload.systemInstruction = {
      parts: [{ text: input.systemPrompt }],
    };
  }

  if (input.tools && input.tools.length > 0) {
    payload.tools = [
      {
        functionDeclarations: input.tools.map((t: AiToolDefinition) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];
  }

  const generationConfig: Record<string, unknown> = {};
  if (typeof input.maxOutputTokens === 'number') {
    generationConfig.maxOutputTokens = input.maxOutputTokens;
  }
  if (typeof input.temperature === 'number') {
    generationConfig.temperature = input.temperature;
  }
  if (input.thinkingBudget && input.thinkingBudget > 0 && !input.thinkingDisabled) {
    generationConfig.thinkingConfig = {
      thinkingBudget: input.thinkingBudget,
    };
  }
  if (Object.keys(generationConfig).length > 0) {
    payload.generationConfig = generationConfig;
  }

  return payload;
}

/**
 * 解析 Gemini 响应 Chunk 对象（支持 SSE 或直接 JSON 解析）
 */
export function parseGeminiAgentChunk(chunk: unknown): AiStreamEvent[] {
  if (!chunk || typeof chunk !== 'object') {
    return [];
  }

  const events: AiStreamEvent[] = [];
  const rawObj = chunk as Record<string, any>;

  // Token 消耗统计
  if (rawObj.usageMetadata) {
    events.push({ type: 'provider_usage', rawUsage: rawObj.usageMetadata });
  }

  const candidate = rawObj.candidates?.[0];
  if (!candidate) {
    return events;
  }

  const parts = candidate.content?.parts;
  if (Array.isArray(parts)) {
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      // 1. 思考链签名 (thoughtSignature)
      if (part.thoughtSignature && typeof part.thoughtSignature === 'string') {
        events.push({ type: 'thinking_signature', signature: part.thoughtSignature });
      }

      // 2. 思考链文本 (thought: true 或独立的思考块)
      if (part.thought === true && typeof part.text === 'string' && part.text) {
        events.push({ type: 'thinking_delta', text: part.text });
      } else if (typeof part.text === 'string' && part.text) {
        // 常规回答
        events.push({ type: 'answer_delta', text: part.text });
      }

      // 3. 函数调用 (functionCall)
      if (part.functionCall) {
        const fn = part.functionCall;
        const callId = fn.id || `call_gemini_${Date.now()}_${i}`;
        const argsJson = JSON.stringify(fn.args || {});
        events.push({
          type: 'tool_call_complete',
          toolCall: {
            id: callId,
            name: fn.name || '',
            arguments: argsJson,
          },
        });
      }
    }
  }

  if (candidate.finishReason) {
    events.push({ type: 'completed', finishReason: candidate.finishReason });
  }

  return events;
}

/**
 * 解析 Gemini SSE 字符串单行
 */
export function parseGeminiAgentStreamLine(line: string): AiStreamEvent[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) {
    return [];
  }
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === '[DONE]') {
    return [];
  }
  try {
    const obj = JSON.parse(payload);
    return parseGeminiAgentChunk(obj);
  } catch {
    return [];
  }
}

/**
 * 执行 Gemini 协议的 Agent 单轮流式会话
 */
export async function streamGeminiAgentTurn(
  input: AgentTurnRequest,
  onEvent: AiStreamEventHandler,
  fetchImpl: typeof fetch = (expoFetch as unknown as typeof fetch),
): Promise<void> {
  const payload = buildGeminiAgentPayload(input);
  const endpoint = providerEndpoint(
    input.baseUrl,
    `/v1beta/models/${encodeURIComponent(input.modelId)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(input.apiKey)}`,
  );

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: input.signal,
  });

  await assertOkResponse(response, `Gemini 请求失败 (${response.status})`);

  if (!response.body) {
    throw new Error('Gemini 响应体为空');
  }

  await streamSseReader(response.body, parseGeminiAgentStreamLine, onEvent);
}
