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
} from './agentTransportUtils';
import { streamSseReader } from './sseStreamReader';

export { extractTextContent };

/**
 * 组装 OpenAI / DeepSeek 兼容的 HTTP 请求 Payload
 */
export function buildOpenAiAgentPayload(input: AgentTurnRequest): Record<string, unknown> {
  const messages: Array<Record<string, unknown>> = [];

  // 1. 系统提示词
  if (input.systemPrompt && input.systemPrompt.trim()) {
    messages.push({
      role: 'system',
      content: input.systemPrompt,
    });
  }

  // 2. 转换各轮次历史消息
  for (const msg of input.messages) {
    if (msg.role === 'system') {
      messages.push({
        role: 'system',
        content: extractTextContent(msg.content),
      });
    } else if (msg.role === 'user') {
      messages.push({
        role: 'user',
        content: extractTextContent(msg.content),
      });
    } else if (msg.role === 'assistant') {
      const text = extractTextContent(msg.content);
      const asstEntry: Record<string, unknown> = {
        role: 'assistant',
        content: text || null,
      };

      // 提取工具调用
      const toolCalls: AgentToolCall[] = msg.toolCalls ? [...msg.toolCalls] : [];
      if (toolCalls.length === 0 && Array.isArray(msg.content)) {
        for (const p of msg.content) {
          if (p.type === 'tool_call') {
            toolCalls.push(p.toolCall);
          }
        }
      }

      if (toolCalls.length > 0) {
        asstEntry.tool_calls = toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        }));
      }

      messages.push(asstEntry);
    } else if (msg.role === 'tool') {
      const toolRes = extractToolResult(msg);
      messages.push({
        role: 'tool',
        tool_call_id: toolRes.toolCallId,
        content: toolRes.isError ? `Error: ${toolRes.content}` : toolRes.content,
      });
    }
  }

  const payload: Record<string, unknown> = {
    model: input.modelId,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (typeof input.maxOutputTokens === 'number') {
    payload.max_tokens = input.maxOutputTokens;
  }
  if (typeof input.temperature === 'number') {
    payload.temperature = input.temperature;
  }

  if (input.tools && input.tools.length > 0) {
    payload.tools = input.tools.map((t: AiToolDefinition) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
    payload.tool_choice = 'auto';
  }

  return payload;
}

/**
 * 解析 OpenAI / DeepSeek SSE 流中的单行数据
 */
export function parseOpenAiAgentStreamLine(line: string): AiStreamEvent[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) {
    return [];
  }
  const payload = trimmed.slice(5).trim();
  if (!payload) {
    return [];
  }
  if (payload === '[DONE]') {
    return [{ type: 'completed' }];
  }

  try {
    const parsed = JSON.parse(payload);
    const events: AiStreamEvent[] = [];

    // 1. Token 消耗统计
    if (parsed.usage) {
      events.push({ type: 'provider_usage', rawUsage: parsed.usage });
    }

    const choice = parsed.choices?.[0];
    if (!choice) {
      return events;
    }

    const delta = choice.delta;
    if (delta) {
      // 2. 捕获 DeepSeek / 推理模型的思考链流 (reasoning_content / reasoning)
      const reasoning = delta.reasoning_content ?? delta.reasoning;
      if (typeof reasoning === 'string' && reasoning.length > 0) {
        events.push({ type: 'thinking_delta', text: reasoning });
      }

      // 3. 捕获常规回答文本流
      if (typeof delta.content === 'string' && delta.content.length > 0) {
        events.push({ type: 'answer_delta', text: delta.content });
      }

      // 4. 捕获工具调用切片 (tool_calls)
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          events.push({
            type: 'tool_call_delta',
            index: typeof tc.index === 'number' ? tc.index : 0,
            toolCallId: tc.id,
            name: tc.function?.name,
            argumentsDelta: tc.function?.arguments,
          });
        }
      }
    }

    // 5. 结束原因
    if (choice.finish_reason) {
      events.push({ type: 'completed', finishReason: choice.finish_reason });
    }

    return events;
  } catch {
    return [];
  }
}

/**
 * 执行 OpenAI / DeepSeek 协议的 Agent 单轮流式会话
 */
export async function streamOpenAiAgentTurn(
  input: AgentTurnRequest,
  onEvent: AiStreamEventHandler,
  fetchImpl: typeof fetch = (expoFetch as unknown as typeof fetch),
): Promise<void> {
  const payload = buildOpenAiAgentPayload(input);
  const endpoint = providerEndpoint(input.baseUrl, '/chat/completions');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${input.apiKey}`,
  };

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: input.signal,
  });

  await assertOkResponse(response, `OpenAI/DeepSeek 请求失败 (${response.status})`);

  if (!response.body) {
    throw new Error('OpenAI/DeepSeek 响应体为空');
  }

  await streamSseReader(response.body, parseOpenAiAgentStreamLine, onEvent);
}
