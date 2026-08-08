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

function validTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function resolveMessageTimestamp(message: AiMessageRecord): string | null {
  return validTimestamp(message.completedAt) ?? validTimestamp(message.createdAt);
}

function compareMessages(left: AiMessageRecord, right: AiMessageRecord): number {
  const timestampCompare = (resolveMessageTimestamp(left) ?? '').localeCompare(resolveMessageTimestamp(right) ?? '');
  if (timestampCompare !== 0) {
    return timestampCompare;
  }
  const roleCompare = (left.role === 'user' ? 0 : left.role === 'assistant' ? 1 : 2) - (right.role === 'user' ? 0 : right.role === 'assistant' ? 1 : 2);
  return roleCompare || left.id.localeCompare(right.id);
}

function preferCanonicalMessage(existing: AiMessageRecord, candidate: AiMessageRecord): AiMessageRecord {
  // Conflicting duplicate IDs select the newest valid update, then newest message timestamp, then version hash.
  const updatedAtCompare = (validTimestamp(candidate.updatedAt) ?? '').localeCompare(validTimestamp(existing.updatedAt) ?? '');
  if (updatedAtCompare !== 0) {
    return updatedAtCompare > 0 ? candidate : existing;
  }
  const timestampCompare = (resolveMessageTimestamp(candidate) ?? '').localeCompare(resolveMessageTimestamp(existing) ?? '');
  if (timestampCompare !== 0) {
    return timestampCompare > 0 ? candidate : existing;
  }
  return hashCompanionMessageVersion(candidate).localeCompare(hashCompanionMessageVersion(existing)) > 0 ? candidate : existing;
}

function completedConversationMessages(messages: AiMessageRecord[]): AiMessageRecord[] {
  const unique = new Map<string, AiMessageRecord>();
  for (const message of messages) {
    if (message.status === 'completed' && (message.role === 'user' || message.role === 'assistant') && resolveMessageTimestamp(message)) {
      const existing = unique.get(message.id);
      unique.set(message.id, existing ? preferCanonicalMessage(existing, message) : message);
    }
  }
  return [...unique.values()].sort(compareMessages);
}

function stableMessages(messages: AiMessageRecord[]): AiMessageRecord[] {
  const unique = new Map<string, AiMessageRecord>();
  for (const message of messages) {
    const existing = unique.get(message.id);
    unique.set(message.id, existing ? preferCanonicalMessage(existing, message) : message);
  }
  return [...unique.values()].sort(compareMessages);
}

function formattedMessageLength(message: AiMessageRecord): number {
  return `${formatCompanionBeijingTimestamp(resolveMessageTimestamp(message) ?? message.createdAt)} ${message.role === 'user' ? '用户' : '角色'}：${message.content}`.length;
}

function unitLength(unit: SnapshotUnit): number {
  return unit.messages.reduce((total, message) => total + formattedMessageLength(message), 0);
}

function normalizeRoundLimit(value: number | undefined, fallback: number): number {
  return Math.max(0, Math.floor(value ?? fallback));
}

function newestRounds<T>(rounds: T[], count: number): T[] {
  return count > 0 ? rounds.slice(-count) : [];
}

function isValidDiaryDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
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
          completedAt: resolveMessageTimestamp(assistantMessages.at(-1)!)!,
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
      completedAt: resolveMessageTimestamp(assistantMessages.at(-1)!)!,
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
  if (!isValidDiaryDate(input.diaryDate)) {
    return snapshotFromUnits({ background: [], focus: [], maxSourceCharacters: input.maxSourceCharacters });
  }
  const roundLimit = normalizeRoundLimit(input.roundLimit, 30);
  const rounds = pairCompletedConversationRounds(input.messages);
  const focusRounds = newestRounds(
    rounds.filter((round) => formatCompanionBeijingTimestamp(round.completedAt).slice(0, 10) === input.diaryDate),
    roundLimit
  );
  const focusIds = new Set(focusRounds.map((round) => round.userMessage.id));
  const backgroundRounds = rounds
    .filter((round) => formatCompanionBeijingTimestamp(round.completedAt).slice(0, 10) < input.diaryDate && !focusIds.has(round.userMessage.id));
  const selectedBackgroundRounds = newestRounds(backgroundRounds, Math.max(0, roundLimit - focusRounds.length));
  return snapshotFromUnits({
    background: selectedBackgroundRounds.map((round) => ({ messages: round.messages, protected: false, round: true })),
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
  const allFocusRounds = rounds.filter((round) => round.messages.some((message) => triggerIds.has(message.id)));
  const completeRoundMessageIds = new Set(rounds.flatMap((round) => round.messages.map((message) => message.id)));
  const triggerOnlyMessages = messages.filter((message) => triggerIds.has(message.id) && !completeRoundMessageIds.has(message.id));
  const roundLimit = normalizeRoundLimit(input.roundLimit, 20);
  const focusRounds = newestRounds(allFocusRounds, roundLimit);
  const backgroundRounds = newestRounds(
    rounds.filter((round) => !allFocusRounds.includes(round)),
    Math.max(0, roundLimit - focusRounds.length)
  );
  return snapshotFromUnits({
    background: backgroundRounds.map((round) => ({ messages: round.messages, protected: false, round: true })),
    focus: [
      ...focusRounds.map((round) => ({ messages: round.messages, protected: true, round: true })),
      ...triggerOnlyMessages.map((message) => ({ messages: [message], protected: true, round: false })),
    ],
    maxSourceCharacters: input.maxSourceCharacters,
  });
}

export function formatCompanionBeijingTimestamp(value: string): string {
  const timestamp = validTimestamp(value);
  if (!timestamp) {
    return 'Invalid date';
  }
  const parts = Object.fromEntries(beijingFormatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
