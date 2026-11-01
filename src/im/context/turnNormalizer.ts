import type { ImMessage } from '../types';

export interface LogicalTurn {
  turnIndex: number;
  firstMessageId: string;
  lastMessageId: string;
  startTime: number;
  endTime: number;
  messages: ImMessage[];
}

export const TURN_TIME_GAP_THRESHOLD_MS = 5 * 60 * 1000; // 5分钟长沉默强制划分为新回合

function parseMessageTimestamp(msg: ImMessage): number {
  if (msg.visibleAt && msg.visibleAt > 0) return msg.visibleAt;
  if (msg.createdAt) {
    const t = new Date(msg.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  return 0;
}

/**
 * 将散落的 IM 气泡、多气泡 [BR]、拍一拍通知、长沉默归组为标准的「逻辑回合 (LogicalTurn)」
 *
 * 规则：
 * 1. 一次回合通常包含：用户主动发起的 1~N 条气泡 / 拍一拍动作 + 伴侣随后回复的 1~M 条气泡；
 * 2. 伴侣主动破冰（对话开局直接是伴侣问候）：独立封装为 Turn 0；
 * 3. 跨时段长沉默（相邻消息间隔 > 5 分钟）：即使连发也强制断开为新回合，防止跨天话题被粗暴合并；
 * 4. 严谨记录 firstMessageId 与 lastMessageId，为阶梯锚点提供稳定定位。
 */
export function groupMessagesIntoLogicalTurns(messages: ImMessage[]): LogicalTurn[] {
  if (!messages || messages.length === 0) return [];

  const turns: LogicalTurn[] = [];
  let currentBucket: ImMessage[] = [];
  let seenAssistantInTurn = false;

  for (const msg of messages) {
    // 过滤无有效内容的非显影消息
    if (!msg.content && msg.type !== 'system_notice') continue;

    const msgTime = parseMessageTimestamp(msg);

    if (currentBucket.length === 0) {
      currentBucket.push(msg);
      seenAssistantInTurn = msg.role === 'assistant';
      continue;
    }

    const prevMsg = currentBucket[currentBucket.length - 1];
    const prevTime = parseMessageTimestamp(prevMsg);
    const isTimeGapSplit = msgTime > 0 && prevTime > 0 && (msgTime - prevTime) > TURN_TIME_GAP_THRESHOLD_MS;

    // 是否达到新回合边界：
    // A. 当前桶内已经有助手回复，又收到了新的用户消息或系统动作；
    // B. 或者两条消息之间相隔超过 5 分钟（跨越了沉默空窗期）。
    const isUserAction = msg.role === 'user' || msg.type === 'system_notice';
    const isNewTurnBoundary = (seenAssistantInTurn && isUserAction) || isTimeGapSplit;

    if (isNewTurnBoundary) {
      turns.push(buildTurn(turns.length, currentBucket));
      currentBucket = [msg];
      seenAssistantInTurn = msg.role === 'assistant';
    } else {
      currentBucket.push(msg);
      if (msg.role === 'assistant') {
        seenAssistantInTurn = true;
      }
    }
  }

  if (currentBucket.length > 0) {
    turns.push(buildTurn(turns.length, currentBucket));
  }

  return turns;
}

function buildTurn(index: number, bucket: ImMessage[]): LogicalTurn {
  const first = bucket[0];
  const last = bucket[bucket.length - 1];
  return {
    turnIndex: index,
    firstMessageId: first.id,
    lastMessageId: last.id,
    startTime: parseMessageTimestamp(first),
    endTime: parseMessageTimestamp(last),
    messages: bucket,
  };
}
