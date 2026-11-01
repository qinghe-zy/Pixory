/**
 * Core LLM Transport Types (Stateless Micro-Kernel)
 *
 * 物理隔离架构规范：
 * 本模块为无状态、纯协议级底层接口契约。
 * 严禁依赖任何上层业务模块（如 src/ai 或 src/im）。
 */

export type LlmRole = 'system' | 'user' | 'assistant';

export type LlmMessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type LlmMessageContent = string | LlmMessageContentPart[];

export interface LlmTransportMessage {
  role: LlmRole;
  content: LlmMessageContent;
}

export interface LlmTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  cachedPromptTokens?: number;
  totalTokens?: number;
  cacheHitRatio?: number;
}

export interface LlmTransportOptions {
  providerId: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  protocol?: 'openai_compatible' | 'gemini' | 'anthropic';
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  onUsage?: (usage: LlmTokenUsage) => void;
}

export interface ILlmStreamClient {
  /**
   * 纯协议级流式文本传输接口，返回异步文本块迭代器
   */
  streamText(
    messages: LlmTransportMessage[],
    options: LlmTransportOptions
  ): AsyncIterable<string>;

  /**
   * 纯协议级非流式文本传输接口（专用于后台记忆提取、压缩与息屏静默生成）
   */
  completeText(
    messages: LlmTransportMessage[],
    options: LlmTransportOptions
  ): Promise<{ text: string; usage?: LlmTokenUsage }>;
}
