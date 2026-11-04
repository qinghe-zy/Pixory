/**
 * Agent 抽象协议与核心类型定义 (提供商中立 - 零宿主依赖)
 *
 * 遵循 FCIS 纯函数内核原则:
 * 1. 统一表征多轮工具调用、思考链 (Thinking)、加密签名 (Signature) 与工具执行结果;
 * 2. 严格脱钩具体 SDK (OpenAI/Anthropic/Google GenAI)，作为编排内核的标准数据交换格式。
 */

export type AgentRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AgentThinkingPart {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

export interface AgentRedactedThinkingPart {
  type: 'redacted_thinking';
  data: string;
}

export interface AgentTextPart {
  type: 'text';
  text: string;
}

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: string; // JSON 字符串
}

export interface AgentToolCallPart {
  type: 'tool_call';
  toolCall: AgentToolCall;
}

export interface AgentToolResultPart {
  type: 'tool_result';
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export type AgentContentPart =
  | AgentTextPart
  | AgentThinkingPart
  | AgentRedactedThinkingPart
  | AgentToolCallPart
  | AgentToolResultPart;

export interface AgentMessage {
  id: string;
  role: AgentRole;
  content: AgentContentPart[] | string;
  toolCalls?: AgentToolCall[]; // Assistant 角色专用的结构化工具调用
  toolCallId?: string;         // Tool 角色专用的关联工具调用 ID
  isError?: boolean;
  timestamp?: number;
}

/**
 * 工具调用审计记录 (用于循环熔断与幂等性校验)
 */
export interface ToolInvocationFingerprintInput {
  toolName: string;
  args: Record<string, any> | string;
  vfsTreeHash?: string;       // 当前沙箱文件系统的 MVCC 版本快照哈希
  resultSummaryHash?: string; // 该次执行产生的结果摘要哈希
}

/**
 * 循环检测状态机
 */
export interface LoopDetectionState {
  history: string[]; // 最近 N 次工具执行的指纹序列
  maxHistoryLength: number;
}

/**
 * 上下文背包配置
 */
export interface ContextPackerConfig {
  highWatermarkTokens: number; // 触发脱水的高水位阈值 (例如 60000)
  lowWatermarkTokens: number;  // 脱水目标低水位阈值 (例如 40000)
  recentProtectedTurns: number; // 最近必须完全保留原样的轮次数 (默认 2)
  heuristicCharsPerToken: number; // 字符转 token 估算比率 (中文约 1.5 chars/token, 英文约 4 chars/token)
}
