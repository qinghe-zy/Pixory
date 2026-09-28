import type { AiMessageRecord } from '../../database/repositories/aiThreadRepository';
import { formatCompanionBeijingTimestamp } from '../companion/companionConversationSnapshotService';

export interface DiaryPromptInput {
  roleContext: string;
  threadSummary?: string | null;
  standardContext?: string | null;
  focusMessages: AiMessageRecord[];
  backgroundMessages: AiMessageRecord[];
}

export interface DiaryPromptBuildResult {
  prompt: string;
  sourceMessages: AiMessageRecord[];
  sourceTrimmed: boolean;
}

function messageTimestamp(message: AiMessageRecord): string {
  const preferred = message.role === 'assistant' ? message.completedAt : message.createdAt;
  if (preferred && !Number.isNaN(new Date(preferred).getTime())) {
    return preferred;
  }
  return message.createdAt;
}

function roleLabel(message: AiMessageRecord): string {
  return message.role === 'assistant' ? '角色' : '用户';
}

function formatMessage(message: AiMessageRecord): string {
  return `[${formatCompanionBeijingTimestamp(messageTimestamp(message))}] ${roleLabel(message)}：${message.content.trim()}`;
}

export function buildDiaryPrompt(input: DiaryPromptInput): DiaryPromptBuildResult {
  const todayInteraction = input.focusMessages.length > 0
    ? input.focusMessages.map(formatMessage).join('\n')
    : '今天没有与用户完成的互动。不得编造今天用户说过、做过或经历过什么。';
  const relationshipBackground = input.backgroundMessages.length > 0
    ? input.backgroundMessages.map(formatMessage).join('\n')
    : '没有可用的过往完整互动。';
  const sections = [
    '[角色日记请求]',
    '写一篇只属于角色自己的私密日记，而不是对用户的回复或当天对话总结。',
    '必须始终使用角色第一人称，保持角色口吻、关系和世界观。',
    '通常不超过 300 个汉字；内容很丰富时可以自然略长，但不得重复、列清单或说教。',
    '不得提及 AI、模型、系统、提示词、上下文、记忆、数据、生成、token 等幕后概念。',
    '不能编造用户说过的话、互动、事实或具体时间。',
    '[角色设定]',
    input.roleContext.trim(),
    input.standardContext?.trim() ? `[角色状态]\n${input.standardContext.trim()}` : '',
    '[今日互动]',
    todayInteraction,
    '[过往关系背景]',
    '以下仅用于保持人物、关系和语境。不得写成今天发生的事，也不得声称用户今天说过这些内容。',
    input.threadSummary?.trim() ? `[当前脉络]\n${input.threadSummary.trim()}` : '',
    relationshipBackground,
    '[输出要求]',
    '只输出日记正文，不要标题、日期、引号、解释或 markdown。',
  ].filter(Boolean);

  return {
    prompt: sections.join('\n\n'),
    sourceMessages: [...input.backgroundMessages, ...input.focusMessages],
    sourceTrimmed: false,
  };
}
