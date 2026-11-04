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
 * 组装 Claude (Anthropic Messages API) 专用的 HTTP 请求 Payload
 *
 * 核心关键：
 * 1. 严格回传历史 assistant 消息中的 thinking 块与 signature 签名；
 * 2. 多轮工具调用结果严格包装在 role: 'user' 的 tool_result 块中；
 * 3. 并行 tool_result 支持合并在同一轮 user 消息中。
 */
export function buildClaudeAgentPayload(input: AgentTurnRequest): Record<string, unknown> {
  const claudeMessages: Array<{ role: 'user' | 'assistant'; content: any }> = [];

  for (const msg of input.messages) {
    if (msg.role === 'system') {
      // Claude 系统提示词独立在顶级 system 字段，如历史中出现转换为 user 消息
      claudeMessages.push({
        role: 'user',
        content: extractTextContent(msg.content),
      });
    } else if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        claudeMessages.push({
          role: 'user',
          content: msg.content,
        });
      } else {
        const blocks: any[] = [];
        for (let i = 0; i < msg.content.length; i++) {
          const p = msg.content[i];
          if (p.type === 'text') {
            blocks.push({ type: 'text', text: p.text });
          } else if (p.type === 'tool_result') {
            blocks.push({
              type: 'tool_result',
              tool_use_id: p.toolCallId,
              content: p.content,
              ...(p.isError ? { is_error: true } : {}),
            });
          }
        }
        claudeMessages.push({
          role: 'user',
          content: blocks.length === 1 && blocks[0].type === 'text' ? blocks[0].text : blocks,
        });
      }
    } else if (msg.role === 'assistant') {
      const blocks: any[] = [];
      const handledToolCallIds = new Set<string>();

      if (typeof msg.content === 'string') {
        if (msg.content) {
          blocks.push({ type: 'text', text: msg.content });
        }
      } else if (Array.isArray(msg.content)) {
        for (let i = 0; i < msg.content.length; i++) {
          const p = msg.content[i];
          if (p.type === 'thinking') {
            blocks.push({
              type: 'thinking',
              thinking: p.thinking,
              ...(p.signature ? { signature: p.signature } : {}),
            });
          } else if (p.type === 'redacted_thinking') {
            blocks.push({
              type: 'redacted_thinking',
              data: p.data,
            });
          } else if (p.type === 'text') {
            blocks.push({
              type: 'text',
              text: p.text,
            });
          } else if (p.type === 'tool_call') {
            handledToolCallIds.add(p.toolCall.id);
            blocks.push({
              type: 'tool_use',
              id: p.toolCall.id,
              name: p.toolCall.name,
              input: parseJsonSafely(p.toolCall.arguments),
            });
          }
        }
      }

      // 兜底补全未包含在 parts 里的 msg.toolCalls，防止调用遗漏
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (let i = 0; i < msg.toolCalls.length; i++) {
          const tc = msg.toolCalls[i];
          if (!handledToolCallIds.has(tc.id)) {
            blocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: parseJsonSafely(tc.arguments),
            });
          }
        }
      }

      claudeMessages.push({
        role: 'assistant',
        content: blocks,
      });
    } else if (msg.role === 'tool') {
      const toolRes = extractToolResult(msg);
      const toolResultBlock = {
        type: 'tool_result',
        tool_use_id: toolRes.toolCallId,
        content: toolRes.content,
        ...(toolRes.isError ? { is_error: true } : {}),
      };

      // 若上一条已经是 user 消息且也是 tool_result 集合，则直接合并（支持并行调用回传）
      const prevMsg = claudeMessages[claudeMessages.length - 1];
      if (prevMsg && prevMsg.role === 'user' && Array.isArray(prevMsg.content)) {
        prevMsg.content.push(toolResultBlock);
      } else {
        claudeMessages.push({
          role: 'user',
          content: [toolResultBlock],
        });
      }
    }
  }

  // 组装系统提示词（支持 Prompt Caching Ephemeral 块）
  let system: any = undefined;
  if (input.providerCachePolicy?.anthropicSystemBlocks?.length) {
    system = input.providerCachePolicy.anthropicSystemBlocks
      .filter((b) => b.text.trim())
      .map((b) => ({
        type: 'text' as const,
        text: b.text,
        ...(b.cacheControl ? { cache_control: { type: 'ephemeral' as const } } : {}),
      }));
  } else if (input.systemPrompt && input.systemPrompt.trim()) {
    system = input.systemPrompt;
  }

  const payload: Record<string, unknown> = {
    model: input.modelId,
    max_tokens: input.maxOutputTokens || 4096,
    messages: claudeMessages,
    stream: true,
  };

  if (system) {
    payload.system = system;
  }

  // Claude 工具定义 input_schema
  if (input.tools && input.tools.length > 0) {
    payload.tools = input.tools.map((t: AiToolDefinition) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  // Claude 3.7+ Extended Thinking
  if (input.thinkingBudget && input.thinkingBudget > 0 && !input.thinkingDisabled) {
    payload.thinking = {
      type: 'enabled',
      budget_tokens: input.thinkingBudget,
    };
  }

  return payload;
}

/**
 * 解析 Claude SSE 流中的单行数据
 */
export function parseClaudeAgentStreamLine(line: string): AiStreamEvent[] {
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
    const events: AiStreamEvent[] = [];

    if (parsed.type === 'message_start' && parsed.message?.usage) {
      events.push({ type: 'provider_usage', rawUsage: parsed.message.usage });
    }

    if (parsed.type === 'content_block_start') {
      const block = parsed.content_block;
      const index = typeof parsed.index === 'number' ? parsed.index : 0;
      if (block?.type === 'tool_use') {
        events.push({
          type: 'tool_call_delta',
          index,
          toolCallId: block.id,
          name: block.name,
          argumentsDelta: '',
        });
      }
    }

    if (parsed.type === 'content_block_delta') {
      const delta = parsed.delta;
      const index = typeof parsed.index === 'number' ? parsed.index : 0;
      if (delta) {
        if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          events.push({ type: 'thinking_delta', text: delta.thinking });
        } else if (delta.type === 'signature_delta' && typeof delta.signature === 'string') {
          events.push({ type: 'thinking_signature', signature: delta.signature });
        } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          events.push({
            type: 'tool_call_delta',
            index,
            argumentsDelta: delta.partial_json,
          });
        } else if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          events.push({ type: 'answer_delta', text: delta.text });
        }
      }
    }

    if (parsed.type === 'message_delta') {
      if (parsed.usage) {
        events.push({ type: 'provider_usage', rawUsage: parsed.usage });
      }
      if (parsed.delta?.stop_reason) {
        events.push({ type: 'completed', finishReason: parsed.delta.stop_reason });
      }
    }

    if (parsed.type === 'message_stop') {
      events.push({ type: 'completed' });
    }

    return events;
  } catch {
    return [];
  }
}

/**
 * 执行 Claude 协议的 Agent 单轮流式会话
 */
export async function streamClaudeAgentTurn(
  input: AgentTurnRequest,
  onEvent: AiStreamEventHandler,
  fetchImpl: typeof fetch = (expoFetch as unknown as typeof fetch),
): Promise<void> {
  const payload = buildClaudeAgentPayload(input);
  const endpoint = providerEndpoint(input.baseUrl, '/v1/messages');

  const headers: Record<string, string> = {
    'x-api-key': input.apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  };

  if (input.providerCachePolicy?.anthropicSystemBlocks?.length) {
    headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: input.signal,
  });

  await assertOkResponse(response, `Claude 请求失败 (${response.status})`);

  if (!response.body) {
    throw new Error('Claude 响应体为空');
  }

  await streamSseReader(response.body, parseClaudeAgentStreamLine, onEvent);
}
