import type { AgentContentPart, AgentMessage } from '../kernel/agentTypes';

/**
 * 单循环高效提取纯文本内容 (遵循 react-best-practices js-combine-iterations 规范，避免多重中间数组创建)
 */
export function extractTextContent(content: AgentContentPart[] | string): string {
  if (typeof content === 'string') {
    return content;
  }
  let result = '';
  for (let i = 0; i < content.length; i++) {
    const part = content[i];
    if (part.type === 'text') {
      result += part.text;
    }
  }
  return result;
}

export interface ExtractedToolResult {
  toolCallId: string;
  content: string;
  isError: boolean;
}

/**
 * 统一从消息中提取工具执行结果与 ID，消除各 Provider 适配器中的重复样板代码
 */
export function extractToolResult(msg: AgentMessage): ExtractedToolResult {
  let toolCallId = msg.toolCallId || '';
  let content = '';
  let isError = msg.isError || false;

  if (typeof msg.content === 'string') {
    content = msg.content;
  } else if (Array.isArray(msg.content)) {
    for (let i = 0; i < msg.content.length; i++) {
      const part = msg.content[i];
      if (part.type === 'tool_result') {
        if (!toolCallId) {
          toolCallId = part.toolCallId;
        }
        content += part.content;
        if (part.isError) {
          isError = true;
        }
      } else if (part.type === 'text') {
        content += part.text;
      }
    }
  }

  return {
    toolCallId: toolCallId || 'call_fallback',
    content,
    isError,
  };
}

/**
 * 安全解析 JSON 字符串为对象，解析失败时返回包装对象而非抛错
 */
export function parseJsonSafely(jsonStr: string): Record<string, any> {
  const trimmed = jsonStr ? jsonStr.trim() : '';
  if (!trimmed) {
    return {};
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
    return { value: parsed };
  } catch {
    return { raw: jsonStr };
  }
}
