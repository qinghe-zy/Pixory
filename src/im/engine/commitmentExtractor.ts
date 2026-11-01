/**
 * 伴侣对话承诺与待办提取器 (CommitmentExtractor)
 * 识别用户日常对话中带有明确时间节点的事项（如“明天下午面试”、“后天去体检”），
 * 沉淀为第一等公民的约定记忆，并在到期时点驱动主动式贴心关怀。
 */

import { parseNaturalTimeToTimestamp } from './naturalTimeParser';

export interface ExtractedCommitment {
  title: string;
  dueAt: number;
  rawTimeExpr: string;
  sourceText: string;
}

// 常见时间表达引导词
const TIME_PREFIX_REGEX = /(明早|明天早上|明天下午|明天晚上|明晚|明天|后天早上|后天下午|后天晚上|后天|今晚|下周[一二三四五六日天]?|周[一二三四五六日天](?:早上|下午|晚上)?|\d{1,2}点(?:半)?)/;

// 意图/动作引导词
const ACTION_LEAD_REGEX = /(?:准备|打算|要去|去|要|安排了|约了|得|得去|约好)?\s*([^\s,，。!！?？~]{2,25})/;

/**
 * 从单句中尝试抽取承诺/未来待办事宜
 */
export function extractCommitmentFromUserText(
  text: string,
  now: number = Date.now()
): ExtractedCommitment | null {
  if (!text || text.length < 4 || text.length > 80) return null;

  // 排除疑问句（用户问 AI“你明天有空吗”等）
  if (text.includes('吗') || text.includes('?') || text.includes('？') || text.includes('你明天') || text.includes('你后天')) {
    return null;
  }

  // 必须匹配到时间词
  const timeMatch = text.match(TIME_PREFIX_REGEX);
  if (!timeMatch || timeMatch.index === undefined) return null;

  const rawTimeExpr = timeMatch[1];
  const timeParsed = parseNaturalTimeToTimestamp(rawTimeExpr, now);
  if (!timeParsed || timeParsed.targetTimestamp <= now) {
    return null;
  }

  // 提取时间词后面的动作文本
  const afterTimeText = text.slice(timeMatch.index + rawTimeExpr.length).trim();
  if (!afterTimeText) return null;

  const actionMatch = afterTimeText.match(ACTION_LEAD_REGEX);
  if (!actionMatch || !actionMatch[1]) return null;

  let action = actionMatch[1].trim();
  // 清洗连词与标点
  action = action.replace(/^(去|要去|准备|打算|做|搞)/, '').trim();
  if (action.length < 2) return null;

  return {
    title: action,
    dueAt: timeParsed.targetTimestamp,
    rawTimeExpr,
    sourceText: text.trim(),
  };
}

/**
 * 判断某个待办事宜是否正处于主动关怀触发窗口
 * - 提前 30 分钟：临近提醒/打气（如“等下的面试放平心态哦”）
 * - 延后 2 小时内：事后关切（如“面试怎么样了，还顺利吗”）
 */
export function checkCommitmentFollowupStatus(
  dueAt: number,
  now: number = Date.now()
): 'none' | 'imminent' | 'post_check' | 'expired' {
  const diffMs = dueAt - now;

  // 提前 45 分钟 ~ 0 分钟
  if (diffMs > 0 && diffMs <= 45 * 60 * 1000) {
    return 'imminent';
  }

  // 到期后 0 ~ 2.5 小时
  if (diffMs <= 0 && diffMs >= -2.5 * 3600 * 1000) {
    return 'post_check';
  }

  // 超过 24 小时视为彻底已过期
  if (diffMs < -24 * 3600 * 1000) {
    return 'expired';
  }

  return 'none';
}
