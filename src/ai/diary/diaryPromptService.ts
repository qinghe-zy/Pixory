import type { AiMessageRecord } from '../../database/repositories/aiThreadRepository';

export interface DiaryPromptInput {
  roleContext: string;
  threadSummary?: string | null;
  standardContext?: string | null;
  messages: AiMessageRecord[];
  historyRoundLimit: number;
  maxSourceCharacters: number;
  hasDayChat: boolean;
}

export interface DiaryPromptBuildResult {
  prompt: string;
  sourceMessages: AiMessageRecord[];
  sourceTrimmed: boolean;
}

function messageTimestamp(message: AiMessageRecord): string {
  return message.completedAt ?? message.createdAt;
}

function roleLabel(message: AiMessageRecord): string {
  return message.role === 'assistant' ? '角色' : '用户';
}

function formatMessage(message: AiMessageRecord): string {
  return `[${messageTimestamp(message)}] ${roleLabel(message)}：${message.content.trim()}`;
}

function selectDayMessages(input: DiaryPromptInput): { messages: AiMessageRecord[]; trimmed: boolean } {
  const cap = Math.max(1, input.historyRoundLimit * 3);
  const candidates = input.messages.slice(-cap);
  let usedCharacters = 0;
  const selected: AiMessageRecord[] = [];

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    const size = formatMessage(candidate).length;
    if (selected.length > 0 && usedCharacters + size > input.maxSourceCharacters) {
      break;
    }
    usedCharacters += size;
    selected.unshift(candidate);
  }

  return {
    messages: selected,
    trimmed: selected.length !== input.messages.length,
  };
}

export function buildDiaryPrompt(input: DiaryPromptInput): DiaryPromptBuildResult {
  const selected = selectDayMessages(input);
  const sections = [
    '[角色日记请求]',
    '写一篇只属于角色自己的私密日记，而不是对用户的回复或当天对话总结。',
    '必须始终使用角色第一人称，保持角色口吻、关系和世界观。',
    '通常不超过 300 个汉字；内容很丰富时可以自然略长，但不得重复、列清单或说教。',
    '不得提及 AI、模型、系统、提示词、上下文、记忆、数据、生成、token 等幕后概念。',
    '不能编造用户说过的话、互动、事实或具体时间。没有当天聊天时，只能写符合人设的安静独白。',
    '[角色设定]',
    input.roleContext.trim(),
    input.standardContext?.trim() ? `[角色状态]\n${input.standardContext.trim()}` : '',
    input.threadSummary?.trim() ? `[当前脉络]\n${input.threadSummary.trim()}` : '',
    '[当日消息]',
    input.hasDayChat && selected.messages.length > 0
      ? selected.messages.map(formatMessage).join('\n')
      : '今天没有与用户完成的聊天记录。请只写角色自己的安静心绪，不要假装发生过互动。',
    '[输出要求]',
    '只输出日记正文，不要标题、日期、引号、解释或 markdown。',
  ].filter(Boolean);

  return {
    prompt: sections.join('\n\n'),
    sourceMessages: selected.messages,
    sourceTrimmed: selected.trimmed,
  };
}
