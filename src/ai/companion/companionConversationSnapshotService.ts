import type { AiMessageRecord } from '../../database/repositories/aiThreadRepository';

import { hashCompanionMessageVersion, hashCompanionText } from './companionRuntimeValidation';

export interface CompanionConversationRound {
  messages: AiMessageRecord[];
  userMessage: AiMessageRecord;
  assistantMessages: AiMessageRecord[];
  completedAt: string;
}

export interface CompanionConversationSnapshot {
  focusMessages: AiMessageRecord[];
  backgroundMessages: AiMessageRecord[];
  sourceMessages: AiMessageRecord[];
  sourceMessageIds: string[];
  sourceMessageVersionHashes: string[];
  sourceSnapshotHash: string;
  anchorMessageId: string | null;
  roundCount: number;
  focusRoundCount: number;
  backgroundRoundCount: number;
  sourceTrimmed: boolean;
}

type SnapshotUnit = {
  messages: AiMessageRecord[];
  protected: boolean;
  round: boolean;
};

const beijingFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
});

function compareMessages(left: AiMessageRecord, right: AiMessageRecord): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function completedConversationMessages(messages: AiMessageRecord[]): AiMessageRecord[] {
  const unique = new Map<string, AiMessageRecord>();
  for (const message of messages) {
    if (message.status === 'completed' && (message.role === 'user' || message.role === 'assistant') && !unique.has(message.id)) {
      unique.set(message.id, message);
    }
  }
  return [...unique.values()].sort(compareMessages);
}

function stableMessages(messages: AiMessageRecord[]): AiMessageRecord[] {
  const unique = new Map<string, AiMessageRecord>();
  for (const message of messages) {
    if (!unique.has(message.id)) {
      unique.set(message.id, message);
    }
  }
  return [...unique.values()].sort(compareMessages);
}

function formattedMessageLength(message: AiMessageRecord): number {
  return `${formatCompanionBeijingTimestamp(message.createdAt)} ${message.role === 'user' ? '用户' : '角色'}：${message.content}`.length;
}

function unitLength(unit: SnapshotUnit): number {
  return unit.messages.reduce((total, message) => total + formattedMessageLength(message), 0);
}

function normalizeRoundLimit(value: number | undefined, fallback: number): number {
  return Math.max(0, Math.floor(value ?? fallback));
}

function trimUnits(input: { focus: SnapshotUnit[]; background: SnapshotUnit[]; maxSourceCharacters: number }): { focus: SnapshotUnit[]; background: SnapshotUnit[]; trimmed: boolean } {
  const focus = [...input.focus];
  const background = [...input.background];
  const budget = Math.max(0, Math.floor(input.maxSourceCharacters));
  let total = [...focus, ...background].reduce((sum, unit) => sum + unitLength(unit), 0);
  let trimmed = false;
  while (total > budget && background.length > 0) {
    total -= unitLength(background.shift()!);
    trimmed = true;
  }
  while (total > budget) {
    const removable = focus.findIndex((unit) => !unit.protected);
    if (removable < 0) {
      break;
    }
    total -= unitLength(focus.splice(removable, 1)[0]);
    trimmed = true;
  }
  return { background, focus, trimmed };
}

function snapshotFromUnits(input: {
  focus: SnapshotUnit[];
  background: SnapshotUnit[];
  maxSourceCharacters: number;
}): CompanionConversationSnapshot {
  const trimmed = trimUnits(input);
  const focusMessages = stableMessages(trimmed.focus.flatMap((unit) => unit.messages));
  const backgroundMessages = stableMessages(trimmed.background.flatMap((unit) => unit.messages));
  const sourceMessages = stableMessages([...focusMessages, ...backgroundMessages]);
  const sourceMessageIds = sourceMessages.map((message) => message.id);
  const sourceMessageVersionHashes = sourceMessages.map((message) => hashCompanionMessageVersion(message));
  return {
    anchorMessageId: sourceMessageIds.at(-1) ?? null,
    backgroundMessages,
    backgroundRoundCount: trimmed.background.filter((unit) => unit.round).length,
    focusMessages,
    focusRoundCount: trimmed.focus.filter((unit) => unit.round).length,
    roundCount: trimmed.focus.filter((unit) => unit.round).length + trimmed.background.filter((unit) => unit.round).length,
    sourceMessageIds,
    sourceMessageVersionHashes,
    sourceMessages,
    sourceSnapshotHash: hashCompanionText(sourceMessageIds.map((id, index) => `${id}:${sourceMessageVersionHashes[index]}`).join('\u001F')),
    sourceTrimmed: trimmed.trimmed,
  };
}

export function pairCompletedConversationRounds(messages: AiMessageRecord[]): CompanionConversationRound[] {
  const rounds: CompanionConversationRound[] = [];
  let current: AiMessageRecord[] | null = null;
  for (const message of completedConversationMessages(messages)) {
    if (message.role === 'user') {
      if (current?.some((item) => item.role === 'assistant')) {
        const assistantMessages = current.filter((item) => item.role === 'assistant');
        rounds.push({
          assistantMessages,
          completedAt: assistantMessages.at(-1)?.completedAt ?? assistantMessages.at(-1)!.createdAt,
          messages: current,
          userMessage: current[0],
        });
      }
      current = [message];
    } else if (current) {
      current.push(message);
    }
  }
  if (current?.some((item) => item.role === 'assistant')) {
    const assistantMessages = current.filter((item) => item.role === 'assistant');
    rounds.push({
      assistantMessages,
      completedAt: assistantMessages.at(-1)?.completedAt ?? assistantMessages.at(-1)!.createdAt,
      messages: current,
      userMessage: current[0],
    });
  }
  return rounds;
}

export function buildDiaryConversationSnapshot(input: {
  messages: AiMessageRecord[];
  diaryDate: string;
  roundLimit?: number;
  maxSourceCharacters: number;
}): CompanionConversationSnapshot {
  const roundLimit = normalizeRoundLimit(input.roundLimit, 30);
  const rounds = pairCompletedConversationRounds(input.messages);
  const focusRounds = rounds.filter((round) => formatCompanionBeijingTimestamp(round.completedAt).slice(0, 10) === input.diaryDate).slice(-roundLimit);
  const focusIds = new Set(focusRounds.map((round) => round.userMessage.id));
  const backgroundRounds = rounds
    .filter((round) => formatCompanionBeijingTimestamp(round.completedAt).slice(0, 10) < input.diaryDate && !focusIds.has(round.userMessage.id))
    .slice(-Math.max(0, roundLimit - focusRounds.length));
  return snapshotFromUnits({
    background: backgroundRounds.map((round) => ({ messages: round.messages, protected: false, round: true })),
    focus: focusRounds.map((round) => ({ messages: round.messages, protected: false, round: true })),
    maxSourceCharacters: input.maxSourceCharacters,
  });
}

export function buildDreamConversationSnapshot(input: {
  messages: AiMessageRecord[];
  triggerMessageIds: string[];
  roundLimit?: number;
  maxSourceCharacters: number;
}): CompanionConversationSnapshot {
  const triggerIds = new Set(input.triggerMessageIds);
  const messages = completedConversationMessages(input.messages);
  const rounds = pairCompletedConversationRounds(messages);
  const focusRounds = rounds.filter((round) => round.messages.some((message) => triggerIds.has(message.id)));
  const roundMessageIds = new Set(focusRounds.flatMap((round) => round.messages.map((message) => message.id)));
  const triggerOnlyMessages = messages.filter((message) => triggerIds.has(message.id) && !roundMessageIds.has(message.id));
  const roundLimit = normalizeRoundLimit(input.roundLimit, 20);
  const backgroundRounds = rounds
    .filter((round) => !focusRounds.includes(round))
    .slice(-Math.max(0, roundLimit - focusRounds.length));
  return snapshotFromUnits({
    background: backgroundRounds.map((round) => ({ messages: round.messages, protected: false, round: true })),
    focus: [
      ...focusRounds.map((round) => ({ messages: round.messages, protected: false, round: true })),
      ...triggerOnlyMessages.map((message) => ({ messages: [message], protected: true, round: false })),
    ],
    maxSourceCharacters: input.maxSourceCharacters,
  });
}

export function formatCompanionBeijingTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const parts = Object.fromEntries(beijingFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
