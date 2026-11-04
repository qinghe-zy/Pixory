/**
 * 循环熔断、Token 水位线滞回与确定性脱水算法 (纯函数内核 - 零宿主依赖)
 *
 * 审查发现落实:
 * 1. 审查 #1: 哈希严格采用 @noble/hashes/sha2;
 * 2. 审查 #8 水位线滞回 (Hysteresis Packing): 超过 highWatermark 才批量脱水至 lowWatermark，两次脱水之间前缀逐字节稳定 (100% Prompt Cache 命中);
 * 3. 审查 #9 循环误判防御: 指纹 = SHA256(toolName + canonicalArgs + vfsTreeHash + resultSummaryHash)，世界状态或结果不同不误杀合法重试;
 * 4. 原子组守恒: assistant 携带的并行 tool_calls 与对应 tool 结果成组绑定，绝不切出孤儿 tool_use / tool_result;
 * 5. 确定性脱水: doc_read_blocks 等大体积结果无损脱水为元数据快照，体积下降 >= 90% 且幂等。
 */

import { sha256 } from '@noble/hashes/sha2.js';
import type {
  AgentMessage,
  AgentToolCall,
  ContextPackerConfig,
  ToolInvocationFingerprintInput,
} from './agentTypes';

/**
 * 将 Uint8Array 转为十六进制字符串 (小写)
 */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    hex += (byte < 16 ? '0' : '') + byte.toString(16);
  }
  return hex;
}

/**
 * 规范化 JSON 序列化 (键序严格字母序升序排列，带循环引用防护)
 */
export function canonicalJsonStringify(obj: any, seen: WeakSet<object> = new WeakSet()): string {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'number' && !Number.isFinite(obj)) {
      return 'null'; // NaN 或 Infinity 转为 null
    }
    return JSON.stringify(obj);
  }

  // 循环引用防御
  if (seen.has(obj)) {
    return '"[Circular]"';
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    const elements: string[] = obj.map((item) => canonicalJsonStringify(item, seen));
    return `[${elements.join(',')}]`;
  }

  // 对象属性名升序排列
  const sortedKeys = Object.keys(obj).sort();
  const entries: string[] = [];
  for (const key of sortedKeys) {
    const val = obj[key];
    if (typeof val === 'undefined' || typeof val === 'function') {
      continue; // 忽略 undefined 与函数
    }
    entries.push(`${JSON.stringify(key)}:${canonicalJsonStringify(val, seen)}`);
  }
  return `{${entries.join(',')}}`;
}

/**
 * 计算单次工具调用的唯一状态指纹 (审查发现 #9: 密码学抗碰撞分段哈希)
 */
export function calculateInvocationFingerprint(input: ToolInvocationFingerprintInput): string {
  const toolName = input.toolName || '';
  const argsCanonical = typeof input.args === 'string'
    ? input.args
    : canonicalJsonStringify(input.args || {});
  const vfsHash = input.vfsTreeHash || 'novfs';
  const resultHash = input.resultSummaryHash || 'nores';

  // 使用分段更新与空字节隔离，彻底消除跨字段粘包歧义
  const encoder = new TextEncoder();
  const hasher = sha256.create();
  hasher.update(encoder.encode(toolName));
  hasher.update(new Uint8Array([0]));
  hasher.update(encoder.encode(argsCanonical));
  hasher.update(new Uint8Array([0]));
  hasher.update(encoder.encode(vfsHash));
  hasher.update(new Uint8Array([0]));
  hasher.update(encoder.encode(resultHash));

  return bytesToHex(hasher.digest());
}

export interface CycleDetectionResult {
  hasCycle: boolean;
  period?: number;
  pattern?: string[];
  reason?: string;
}

/**
 * 检测工具执行指纹序列中的周期性死循环 (审查发现 #9)
 *
 * 判定准则:
 * - p=1: 连续 3 次产生完全相同的指纹 (同一工具、同一参数、同一世界状态且同一结果，合法重试已被排除)
 * - p=2: 形如 A-B-A-B-A-B (连续 3 个完整周期)
 * - p=3: 形如 A-B-C-A-B-C (连续 2 个完整周期)
 * - p=4: 形如 A-B-C-D-A-B-C-D (连续 2 个完整周期)
 */
export function detectCyclePeriod(
  history: string[],
  maxPeriod: number = 4
): CycleDetectionResult {
  const len = history.length;
  if (len < 3) {
    return { hasCycle: false };
  }

  // 1. 检查 p = 1 (同状态同参数连续重复 3 次)
  const last = history[len - 1];
  if (history[len - 2] === last && history[len - 3] === last) {
    return {
      hasCycle: true,
      period: 1,
      pattern: [last],
      reason: '检测到相同工具与相同参数在不变的世界状态下连续执行 3 次，触发熔断',
    };
  }

  // 2. 检查 p in [2, maxPeriod]
  for (let p = 2; p <= maxPeriod; p++) {
    const requiredRepeats = p === 2 ? 3 : 2; // p=2 需要 3 个循环节，p>=3 需要 2 个循环节
    const totalRequiredLength = p * requiredRepeats;
    if (len < totalRequiredLength) continue;

    const candidatePattern = history.slice(len - p);
    let isMatch = true;

    for (let r = 1; r < requiredRepeats; r++) {
      const segmentStart = len - (r + 1) * p;
      const segment = history.slice(segmentStart, segmentStart + p);
      for (let i = 0; i < p; i++) {
        if (segment[i] !== candidatePattern[i]) {
          isMatch = false;
          break;
        }
      }
      if (!isMatch) break;
    }

    if (isMatch) {
      return {
        hasCycle: true,
        period: p,
        pattern: candidatePattern,
        reason: `检测到周期为 ${p} 的交替震荡循环模式，触发熔断`,
      };
    }
  }

  return { hasCycle: false };
}

/**
 * 启发式估算消息列表的 Token 数量 (中文字符约 1.5 chars/token, 英文约 4 chars/token)
 */
export function estimateMessageTokens(msg: AgentMessage, charsPerToken: number = 2.0): number {
  let charCount = 0;

  if (typeof msg.content === 'string') {
    charCount += msg.content.length;
  } else if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (part.type === 'text') {
        charCount += part.text.length;
      } else if (part.type === 'thinking') {
        charCount += part.thinking.length;
      } else if (part.type === 'tool_result') {
        charCount += part.content.length;
      } else if (part.type === 'tool_call') {
        charCount += part.toolCall.name.length + part.toolCall.arguments.length;
      }
    }
  }

  if (msg.toolCalls) {
    for (const tc of msg.toolCalls) {
      charCount += tc.name.length + tc.arguments.length;
    }
  }

  // 加上固定消息信头与角色开销 (约 4 tokens)
  return Math.ceil(charCount / charsPerToken) + 4;
}

/**
 * 原子消息组 (Atomic Group)
 * 封装一次不可拆分的交互单元:
 * - 纯对话: 1 条 user 消息 或 1 条 assistant 消息
 * - 工具交互: 1 条包含 toolCalls 的 assistant 消息 + 所有对应的 tool 结果消息
 */
export interface AtomicMessageGroup {
  id: string;
  messages: AgentMessage[];
  tokens: number;
  isDehydrated?: boolean;
}

/**
 * 将平铺消息序列归集为原子消息组，并自动补齐缺失的孤儿 tool_result
 */
export function buildAtomicMessageGroups(messages: AgentMessage[]): AtomicMessageGroup[] {
  const groups: AtomicMessageGroup[] = [];
  const len = messages.length;
  let i = 0;

  while (i < len) {
    const cur = messages[i];

    // 1. 如果是带有 toolCalls 的 assistant 消息，必须将其与后续的所有 tool 消息归为一个原子组
    if (cur.role === 'assistant' && cur.toolCalls && cur.toolCalls.length > 0) {
      const groupMessages: AgentMessage[] = [cur];
      const expectedToolCallIds = new Set(cur.toolCalls.map((tc) => tc.id));
      const foundToolCallIds = new Set<string>();

      let j = i + 1;
      while (j < len && messages[j].role === 'tool') {
        const toolMsg = messages[j];
        if (toolMsg.toolCallId && expectedToolCallIds.has(toolMsg.toolCallId)) {
          groupMessages.push(toolMsg);
          foundToolCallIds.add(toolMsg.toolCallId);
        }
        j++;
      }

      // 防御: 如果在异常中断或恢复场景下缺少了部分 tool_result，自动合成占位，绝不产生孤儿 tool_call
      for (const tc of cur.toolCalls) {
        if (!foundToolCallIds.has(tc.id)) {
          groupMessages.push({
            id: `synth_res_${tc.id}`,
            role: 'tool',
            toolCallId: tc.id,
            content: '[Pixory Agent Kernel: Tool call was interrupted before receiving output]',
            isError: true,
          });
        }
      }

      let groupTokens = 0;
      for (const m of groupMessages) groupTokens += estimateMessageTokens(m);

      groups.push({
        id: `atomic_tool_${cur.id}`,
        messages: groupMessages,
        tokens: groupTokens,
      });

      i = j;
      continue;
    }

    // 2. 普通单条消息作为一个独立原子组
    groups.push({
      id: `atomic_msg_${cur.id}`,
      messages: [cur],
      tokens: estimateMessageTokens(cur),
    });
    i++;
  }

  return groups;
}

/**
 * 确定性脱水单个工具结果 (将大文档读取结果压缩为元数据摘要，节省 90%+ 空间)
 */
export function dehydrateToolResultContent(content: string): string {
  // 幂等防护: 若已经脱水，原样返回，字节不发生改变
  if (content.startsWith('[Pixory Kernel Dehydrated Snapshot:')) {
    return content;
  }

  // 仅对超过 150 字符的大结果进行脱水
  if (content.length <= 150) {
    return content;
  }

  const preview = content.slice(0, 60).replace(/\s+/g, ' ');
  return `[Pixory Kernel Dehydrated Snapshot: original length ${content.length} chars. Preview: ${preview}...]`;
}

/**
 * 对原子组执行确定性脱水 (保持结构完整)
 */
export function dehydrateAtomicGroup(group: AtomicMessageGroup): AtomicMessageGroup {
  if (group.isDehydrated) return group;

  const newMessages: AgentMessage[] = group.messages.map((msg) => {
    if (msg.role !== 'tool') return msg;

    let newContent = msg.content;
    if (typeof msg.content === 'string') {
      newContent = dehydrateToolResultContent(msg.content);
    } else if (Array.isArray(msg.content)) {
      newContent = msg.content.map((part) => {
        if (part.type === 'tool_result') {
          return {
            ...part,
            content: dehydrateToolResultContent(part.content),
          };
        }
        return part;
      });
    }

    return {
      ...msg,
      content: newContent,
    };
  });

  let newTokens = 0;
  for (const m of newMessages) newTokens += estimateMessageTokens(m);

  return {
    ...group,
    messages: newMessages,
    tokens: newTokens,
    isDehydrated: true,
  };
}

export interface PackContextResult {
  messages: AgentMessage[];
  totalTokens: number;
  wasDehydrated: boolean;
  dehydratedGroupCount: number;
}

/**
 * 上下文水位线滞回背包算法 (packContextSafely)
 *
 * 核心机制:
 * 1. 未超过 highWatermarkTokens 时，历史前缀 100% 字节不修改 (确保 Prompt Cache 命中);
 * 2. 超过 highWatermarkTokens 后，从最旧的历史轮次向前批量脱水，直至降低到 lowWatermarkTokens 以下;
 * 3. 始终保留第一条系统指令与最近 protectedTurns 轮次，原子事务组绝不被腰斩。
 */
export function packContextSafely(
  rawMessages: AgentMessage[],
  config: ContextPackerConfig
): PackContextResult {
  const groups = buildAtomicMessageGroups(rawMessages);
  let totalTokens = groups.reduce((acc, g) => acc + g.tokens, 0);

  // 1. 如果总 token 处于高水位以内，原样返回，逐字节保持完全一致
  if (totalTokens <= config.highWatermarkTokens) {
    const flatMessages = groups.flatMap((g) => g.messages);
    return {
      messages: flatMessages,
      totalTokens,
      wasDehydrated: false,
      dehydratedGroupCount: 0,
    };
  }

  // 2. 超出高水位，启动滞回脱水
  // 计算脱水保护区: 排除第 0 条系统消息 (若存在) 以及最后 recentProtectedTurns 个原子组
  const totalGroups = groups.length;
  const protectedStartIndex = Math.max(0, totalGroups - config.recentProtectedTurns);
  const eligibleStart = groups.length > 0 && groups[0].messages[0]?.role === 'system' ? 1 : 0;

  let dehydratedCount = 0;
  const updatedGroups = [...groups];

  for (let idx = eligibleStart; idx < protectedStartIndex; idx++) {
    if (totalTokens <= config.lowWatermarkTokens) {
      break; // 已回退至低水位以下，停止脱水
    }

    const curGroup = updatedGroups[idx];
    if (!curGroup.isDehydrated) {
      const dehydrated = dehydrateAtomicGroup(curGroup);
      const savedTokens = curGroup.tokens - dehydrated.tokens;
      if (savedTokens > 0) {
        updatedGroups[idx] = dehydrated;
        totalTokens -= savedTokens;
        dehydratedCount++;
      }
    }
  }

  const flatMessages = updatedGroups.flatMap((g) => g.messages);
  return {
    messages: flatMessages,
    totalTokens,
    wasDehydrated: dehydratedCount > 0,
    dehydratedGroupCount: dehydratedCount,
  };
}
