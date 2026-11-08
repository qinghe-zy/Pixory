/**
 * 伴侣语气同步与交互节奏趋同引擎 (StyleEntrainment)
 *
 * 依据语言风格匹配理论（Linguistic Style Matching）：
 * 亲近关系中，伴侣的回复篇幅、标点符号偏好和用词习惯会随着沟通自然趋同，
 * 避免“用户发 4 个字，AI 劈头盖脸回 200 字论文”的强烈机械落差。
 */

import type { ImMessage } from '../types';

export interface UserStyleProfile {
  avgLength: number;
  frequentPunctuation: string[];
  prefersShortSentences: boolean;
  usesEmoji: boolean;
  styleSummary: string;
}

const EMOJI_OR_KAOMOJI_REGEX = /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]|[（(][^）)\n]{1,8}[）)]|orz|TAT|QwQ|QAQ|owo/u;

/**
 * 分析用户近期消息习惯（最近 20 条以内）
 */
export function analyzeUserStyle(userMessages: ImMessage[]): UserStyleProfile {
  if (userMessages.length === 0) {
    return {
      avgLength: 15,
      frequentPunctuation: [],
      prefersShortSentences: false,
      usesEmoji: false,
      styleSummary: '自然日常沟通',
    };
  }

  const recent = userMessages.slice(-20);
  let totalChars = 0;
  let emojiCount = 0;
  let waveCount = 0;
  let ellipsisCount = 0;
  let exclamationCount = 0;

  for (const msg of recent) {
    const text = msg.content || '';
    totalChars += text.length;
    if (EMOJI_OR_KAOMOJI_REGEX.test(text)) emojiCount += 1;
    if (/[~～]/.test(text)) waveCount += 1;
    if (/[…\.]{2,}/.test(text)) ellipsisCount += 1;
    if (/[!！]/.test(text)) exclamationCount += 1;
  }

  const avgLength = Math.round(totalChars / recent.length);
  const prefersShortSentences = avgLength <= 10;
  const usesEmoji = emojiCount / recent.length >= 0.25;

  const frequentPunctuation: string[] = [];
  if (waveCount / recent.length >= 0.2) frequentPunctuation.push('~');
  if (ellipsisCount / recent.length >= 0.2) frequentPunctuation.push('…');
  if (exclamationCount / recent.length >= 0.2) frequentPunctuation.push('!');

  const summaryParts: string[] = [];
  if (prefersShortSentences) {
    summaryParts.push('喜欢发短句(约6~10字)');
  } else if (avgLength >= 35) {
    summaryParts.push('表达细腻(长句较多)');
  }

  if (usesEmoji) {
    summaryParts.push('爱用表情');
  }

  if (frequentPunctuation.includes('~')) {
    summaryParts.push('语气随和爱带波浪号');
  } else if (frequentPunctuation.includes('!')) {
    summaryParts.push('情绪饱满活泼');
  }

  const styleSummary = summaryParts.length > 0 ? summaryParts.join('、') : '干脆利落自然';

  return {
    avgLength,
    frequentPunctuation,
    prefersShortSentences,
    usesEmoji,
    styleSummary,
  };
}

/**
 * 生成装配进 Layer 4 尾部的动态步调指导指令（0 额外开销，不碰 Layer 1~3 前缀缓存）
 */
export function buildStyleEntrainmentPrompt(
  currentTurnUserInput: string,
  profile: UserStyleProfile
): string | null {
  const inputLen = currentTurnUserInput.trim().length;

  const notes: string[] = [];

  // 1. 本轮输入长度对称性自适应
  if (inputLen > 0 && inputLen <= 8) {
    notes.push('对方发话简练，请用精炼短气泡轻松接话，切勿长篇大论');
  } else if (inputLen >= 50) {
    notes.push('对方正在长段倾诉心事，请认真顺应对方的话题，随内容自然展开回复');
  }

  // 2. 长期语言习惯镜像贴近
  if (profile.prefersShortSentences && inputLen <= 15) {
    notes.push(`对方习惯短句沟通，保持自然精炼`);
  }

  if (notes.length === 0) return null;

  return `【步调对称参考】${notes.join('；')}。自然契合彼此交流默契，勿刻意拘束。`;
}
