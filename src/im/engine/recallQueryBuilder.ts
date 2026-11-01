/**
 * 记忆召回查询强化构建器 (RecallQueryBuilder)
 * 解决用户输入极短（如“嗯”、“然后呢”、“哈哈”）时召回为空的痛点，
 * 智能结合近期上下文实体，并增加记忆短期冷却防重复机制。
 */

import type { ImMessage } from '../types';

export interface BuildRecallQueryOptions {
  currentUserInput: string;
  recentMessages?: ImMessage[];
  recentlyRecalledIds?: Set<string>;
}

const STOP_WORDS = new Set([
  '嗯', '啊', '哦', '哈', '哈哈', '好的', '然后呢', '怎么了', '对呀',
  '是的', '没有', '好吧', '这样啊', '知道了', '为什么', '什么', '可以',
  '行', '好的呢', 'okk', 'ok', 'yes', 'no'
]);

/**
 * 提取文本中的潜在实体与名词关键词（轻量纯规则，0 模型开销）
 */
function extractSalientTokens(text: string): string[] {
  if (!text) return [];
  // 过滤掉内部协议标签
  const clean = text.replace(/\[(STATUS|PING|HEARTBEAT|NUDGE|STAGE)[^\]]*\]/gi, '').trim();
  // 提取 2~8 字符的连续汉字/英文单词
  const matches = clean.match(/[\u4e00-\u9fa5]{2,8}|[a-zA-Z]{3,15}/g) || [];
  return matches.filter((token) => !STOP_WORDS.has(token.toLowerCase()));
}

/**
 * 构建高召回率的复合检索查询词
 */
export function buildEffectiveRecallQuery(options: BuildRecallQueryOptions): string {
  const input = options.currentUserInput.trim();
  const tokens = extractSalientTokens(input);

  // 如果当前输入本身具有实质内容（包含 2 个及以上实体词或长度超过 6 个字）
  if (input.length > 6 && tokens.length > 0) {
    return input;
  }

  // 当前输入偏短（如“嗯”、“然后呢”），向后回溯最近 2 轮对话中的实体上下文
  const history = options.recentMessages || [];
  const contextTokens: string[] = [...tokens];

  for (let i = history.length - 1; i >= 0 && contextTokens.length < 5; i--) {
    const msg = history[i];
    if (msg.type !== 'text' || !msg.content) continue;
    const salient = extractSalientTokens(msg.content);
    for (const t of salient) {
      if (!contextTokens.includes(t)) {
        contextTokens.push(t);
        if (contextTokens.length >= 5) break;
      }
    }
  }

  if (contextTokens.length === 0) {
    return input;
  }

  // 拼接合成检索词
  return `${input} ${contextTokens.join(' ')}`.trim();
}

/**
 * 记忆近期使用冷却过滤器：防止最近几轮反复提起同一条记忆
 */
export function filterCooldownRecalledMemories<T extends { id: string }>(
  items: T[],
  recentlyRecalledIds?: Set<string>,
  maxAllowed: number = 3
): T[] {
  if (!recentlyRecalledIds || recentlyRecalledIds.size === 0) {
    return items.slice(0, maxAllowed);
  }

  // 优先保留不在近期已用列表中的记忆
  const fresh = items.filter((item) => !recentlyRecalledIds.has(item.id));
  const cooling = items.filter((item) => recentlyRecalledIds.has(item.id));

  const result = [...fresh, ...cooling];
  return result.slice(0, maxAllowed);
}
