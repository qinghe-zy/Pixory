import type {
  AiStreamEvent,
  AiToolCall,
} from '../../../ai/providers/base';
import type {
  AgentContentPart,
  AgentMessage,
  AgentTextPart,
  AgentThinkingPart,
  AgentRedactedThinkingPart,
  AgentToolCallPart,
  AgentToolCall,
} from '../kernel/agentTypes';

export interface AccumulatedToolCall {
  id: string;
  name: string;
  arguments: string;
  parsedArguments?: Record<string, any>;
  parseError?: string;
  healed?: boolean;
}

export interface AgentTurnOutput {
  answerText: string;
  thinking?: { thinking: string; signature?: string };
  redactedThinking?: { data: string };
  toolCalls: AccumulatedToolCall[];
  parts: AgentContentPart[];
  finishReason?: string;
  usage?: unknown;
}

/**
 * 针对流式传输中断或截断场景的 JSON 启发式自愈算法
 * 尝试修复未闭合的引号、方括号与花括号
 */
export function tryHealJson(raw: string): { ok: true; parsed: Record<string, any>; healed: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, parsed: {}, healed: '{}' };
  }

  // 1. 先尝试直接解析
  try {
    const direct = JSON.parse(trimmed);
    if (typeof direct === 'object' && direct !== null) {
      return { ok: true, parsed: direct, healed: trimmed };
    }
  } catch {
    // 进入自愈流程
  }

  // 2. 分析语法栈状态
  let inString = false;
  let escaped = false;
  const stack: ('{' | '[')[] = [];

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === '{') {
      stack.push('{');
    } else if (ch === '[') {
      stack.push('[');
    } else if (ch === '}') {
      if (stack.length > 0 && stack[stack.length - 1] === '{') {
        stack.pop();
      }
    } else if (ch === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === '[') {
        stack.pop();
      }
    }
  }

  let candidate = trimmed;
  // 若字符串未闭合，补全闭合双引号
  if (inString) {
    candidate += '"';
  }

  // 若尾部有悬空冒号（如 {"key": ），补全 null 值
  candidate = candidate.replace(/:\s*$/, ': null');

  // 若尾部有悬空逗号，移除逗号
  candidate = candidate.replace(/,\s*$/, '');

  // 逆序闭合括号栈
  while (stack.length > 0) {
    const openChar = stack.pop();
    if (openChar === '{') {
      candidate += '}';
    } else if (openChar === '[') {
      candidate += ']';
    }
  }

  try {
    const healedParsed = JSON.parse(candidate);
    if (typeof healedParsed === 'object' && healedParsed !== null) {
      return { ok: true, parsed: healedParsed, healed: candidate };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return { ok: false, error: 'Healed JSON is not an object' };
}

interface MutableToolCallRecord {
  id: string;
  name: string;
  argumentsChunks: string[];
}

/**
 * 流式工具调用累积器 (Stream Tool Accumulator)
 *
 * 职责：
 * 1. 逐 chunk 捕获 answer_delta、thinking_delta 与 thinking_signature；
 * 2. 稳定归并并行工具调用（按 index 或 id 聚合碎片 arguments）；
 * 3. 流结束时实施安全 JSON 解析与容错自愈，绝不崩溃；
 * 4. 封装标准 AgentTurnOutput 与 AgentMessage。
 */
export class StreamToolAccumulator {
  private answerChunks: string[] = [];
  private thinkingChunks: string[] = [];
  private signatureChunks: string[] = [];
  private redactedThinkingData: string | null = null;
  private toolCallByIndex: Map<number, MutableToolCallRecord> = new Map();
  private toolCallIdToIndex: Map<string, number> = new Map();
  private nextAutoIndex = 0;
  private finishReason?: string;
  private usageMetadata?: unknown;
  private isFinalized = false;
  private cachedOutput: AgentTurnOutput | null = null;

  /**
   * 处理流式单步事件
   */
  public processEvent(event: AiStreamEvent): void {
    if (this.isFinalized) {
      return;
    }

    switch (event.type) {
      case 'answer_delta':
        if (event.text) {
          this.answerChunks.push(event.text);
        }
        break;

      case 'reasoning_delta':
      case 'thinking_delta':
        if (event.text) {
          this.thinkingChunks.push(event.text);
        }
        break;

      case 'thinking_signature':
        if (event.signature) {
          this.signatureChunks.push(event.signature);
        }
        break;

      case 'tool_call_delta': {
        const index = this.resolveToolIndex(event.index, event.toolCallId);
        let record = this.toolCallByIndex.get(index);
        if (!record) {
          record = {
            id: event.toolCallId || `call_${Date.now()}_${index}`,
            name: event.name || '',
            argumentsChunks: [],
          };
          this.toolCallByIndex.set(index, record);
          if (record.id) {
            this.toolCallIdToIndex.set(record.id, index);
          }
        } else {
          if (event.toolCallId && !record.id) {
            record.id = event.toolCallId;
            this.toolCallIdToIndex.set(record.id, index);
          }
          if (event.name && !record.name) {
            record.name = event.name;
          }
        }

        if (event.argumentsDelta) {
          record.argumentsChunks.push(event.argumentsDelta);
        }
        break;
      }

      case 'tool_call_complete': {
        const complete = event.toolCall;
        const index = this.resolveToolIndex(undefined, complete.id);
        const record: MutableToolCallRecord = {
          id: complete.id,
          name: complete.name,
          argumentsChunks: [complete.arguments || '{}'],
        };
        this.toolCallByIndex.set(index, record);
        this.toolCallIdToIndex.set(complete.id, index);
        break;
      }

      case 'provider_usage':
        this.usageMetadata = event.rawUsage;
        break;

      case 'completed':
        if (event.finishReason) {
          this.finishReason = event.finishReason;
        } else if (!this.finishReason) {
          this.finishReason = 'stop';
        }
        break;

      case 'error':
        // 错误记录在 finishReason 中，保留已有文本
        this.finishReason = `error: ${event.message}`;
        break;
    }
  }

  /**
   * 手动注入 Redacted Thinking (针对 Claude 等安全截断)
   */
  public setRedactedThinking(data: string): void {
    this.redactedThinkingData = data;
  }

  /**
   * 解析工具调用对应索引
   */
  private resolveToolIndex(explicitIndex?: number, toolCallId?: string): number {
    if (typeof explicitIndex === 'number') {
      if (toolCallId) {
        this.toolCallIdToIndex.set(toolCallId, explicitIndex);
      }
      return explicitIndex;
    }
    if (toolCallId && this.toolCallIdToIndex.has(toolCallId)) {
      return this.toolCallIdToIndex.get(toolCallId)!;
    }
    const idx = this.nextAutoIndex++;
    if (toolCallId) {
      this.toolCallIdToIndex.set(toolCallId, idx);
    }
    return idx;
  }

  /**
   * 结束流并组装完整的结构化输出
   */
  public finalize(): AgentTurnOutput {
    if (this.isFinalized && this.cachedOutput) {
      return this.cachedOutput;
    }

    const answerText = this.answerChunks.join('');
    const thinkingText = this.thinkingChunks.join('');
    const signatureText = this.signatureChunks.join('');

    const thinking: { thinking: string; signature?: string } | undefined =
      thinkingText.length > 0 || signatureText.length > 0
        ? {
            thinking: thinkingText,
            ...(signatureText ? { signature: signatureText } : {}),
          }
        : undefined;

    const redactedThinking: { data: string } | undefined =
      this.redactedThinkingData ? { data: this.redactedThinkingData } : undefined;

    // 按 index 排序工具调用
    const sortedIndices = Array.from(this.toolCallByIndex.keys()).sort((a, b) => a - b);
    const accumulatedCalls: AccumulatedToolCall[] = [];

    for (const idx of sortedIndices) {
      const rec = this.toolCallByIndex.get(idx)!;
      const rawArgs = rec.argumentsChunks.join('');
      const healResult = tryHealJson(rawArgs);

      if (healResult.ok) {
        accumulatedCalls.push({
          id: rec.id,
          name: rec.name,
          arguments: healResult.healed,
          parsedArguments: healResult.parsed,
          healed: healResult.healed !== rawArgs.trim(),
        });
      } else {
        accumulatedCalls.push({
          id: rec.id,
          name: rec.name,
          arguments: rawArgs,
          parseError: healResult.error,
        });
      }
    }

    // 组装 parts
    const parts: AgentContentPart[] = [];
    if (thinking) {
      parts.push({
        type: 'thinking',
        thinking: thinking.thinking,
        ...(thinking.signature ? { signature: thinking.signature } : {}),
      });
    }
    if (redactedThinking) {
      parts.push({
        type: 'redacted_thinking',
        data: redactedThinking.data,
      });
    }
    if (answerText.length > 0) {
      parts.push({
        type: 'text',
        text: answerText,
      });
    }
    for (const call of accumulatedCalls) {
      parts.push({
        type: 'tool_call',
        toolCall: {
          id: call.id,
          name: call.name,
          arguments: call.arguments,
        },
      });
    }

    this.isFinalized = true;
    this.cachedOutput = {
      answerText,
      thinking,
      redactedThinking,
      toolCalls: accumulatedCalls,
      parts,
      finishReason: this.finishReason,
      usage: this.usageMetadata,
    };

    return this.cachedOutput;
  }

  /**
   * 将当前轮次结果转为标准的 Assistant AgentMessage
   */
  public toAssistantMessage(messageId?: string): AgentMessage {
    const output = this.finalize();
    const structuredToolCalls: AgentToolCall[] = output.toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments,
    }));

    return {
      id: messageId || `msg_asst_${Date.now()}`,
      role: 'assistant',
      content: output.parts,
      toolCalls: structuredToolCalls.length > 0 ? structuredToolCalls : undefined,
      timestamp: Date.now(),
    };
  }
}
