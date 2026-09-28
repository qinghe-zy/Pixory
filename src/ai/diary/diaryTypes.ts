export const DIARY_TIME_ZONE = 'Asia/Shanghai';

export const DIARY_THEME_KEYS = ['sage', 'rainwater', 'rose', 'lavender', 'celadon'] as const;
export type DiaryThemeKey = (typeof DIARY_THEME_KEYS)[number];

export const DIARY_BODY_FONT_KEYS = ['wenkai', 'xiaowei'] as const;
export type DiaryBodyFontKey = (typeof DIARY_BODY_FONT_KEYS)[number];

export type DiaryTriggerKind = 'auto_early_evening' | 'auto_late_evening' | 'auto_idle_monologue' | 'manual';

export type DiaryTriggerDecision =
  | { kind: DiaryTriggerKind; diaryDate: string }
  | { kind: 'show_manual_hint'; diaryDate: string }
  | { kind: 'none' };

export interface DiaryTriggerInput {
  now: string | Date;
  hasCurrentDiary: boolean;
  hasDayChat: boolean;
  isSessionActive: boolean;
  lastInteractionAt?: string | null;
  lastRealInteractionAt?: string | null;
  sessionStartedAt?: string | null;
}

interface BeijingDateTimeParts {
  date: string;
  hour: number;
  minute: number;
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function beijingDateTimeParts(value: string | Date): BeijingDateTimeParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DIARY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(toDate(value));
  const valueFor = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';

  return {
    date: `${valueFor('year')}-${valueFor('month')}-${valueFor('day')}`,
    hour: Number(valueFor('hour')),
    minute: Number(valueFor('minute')),
  };
}

export function beijingDiaryDate(value: string | Date): string {
  return beijingDateTimeParts(value).date;
}

export function beijingTimeLabel(value: string | Date): string {
  const parts = beijingDateTimeParts(value);
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function beijingDiaryDayBounds(diaryDate: string): { startIso: string; endIso: string } {
  const [year, month, day] = diaryDate.split('-').map(Number);
  if (![year, month, day].every(Number.isInteger)) {
    throw new Error(`Invalid Beijing diary date: ${diaryDate}`);
  }
  const startMs = Date.UTC(year, month - 1, day, -8, 0, 0);
  const endMs = startMs + 24 * 60 * 60 * 1_000;
  return { startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() };
}

function minutesBetween(later: string | Date, earlier?: string | null): number {
  if (!earlier) {
    return 0;
  }
  return Math.max(0, Math.floor((toDate(later).getTime() - toDate(earlier).getTime()) / 60_000));
}

function sessionStartedBeforeLateCutoff(sessionStartedAt?: string | null): boolean {
  if (!sessionStartedAt) {
    return false;
  }
  const parts = beijingDateTimeParts(sessionStartedAt);
  return parts.hour < 23 || (parts.hour === 23 && parts.minute < 50);
}

function hasRecentRealInteraction(now: string | Date, lastRealInteractionAt?: string | null): boolean {
  return Boolean(lastRealInteractionAt) && toDate(now).getTime() - toDate(lastRealInteractionAt as string).getTime() <= 24 * 60 * 60 * 1_000;
}

export function decideDiaryTrigger(input: DiaryTriggerInput): DiaryTriggerDecision {
  if (input.hasCurrentDiary) {
    return { kind: 'none' };
  }

  const now = beijingDateTimeParts(input.now);
  const nowMinutes = now.hour * 60 + now.minute;
  const quietMinutes = minutesBetween(input.now, input.lastInteractionAt);

  // A conversation begun before 23:50 can naturally end after midnight. It
  // still belongs to the earlier Beijing diary date; there is deliberately no
  // arbitrary 00:30 cut-off.
  if (input.hasDayChat && input.sessionStartedAt && sessionStartedBeforeLateCutoff(input.sessionStartedAt)) {
    const sessionDiaryDate = beijingDiaryDate(input.sessionStartedAt);
    if (sessionDiaryDate !== now.date && !input.isSessionActive && quietMinutes >= 10) {
      return { kind: 'auto_late_evening', diaryDate: sessionDiaryDate };
    }
  }

  if (!input.hasDayChat && nowMinutes >= 22 * 60 + 30 && hasRecentRealInteraction(input.now, input.lastRealInteractionAt)) {
    return { kind: 'auto_idle_monologue', diaryDate: now.date };
  }

  if (input.hasDayChat && nowMinutes >= 22 * 60 && nowMinutes < 22 * 60 + 30 && quietMinutes >= 30) {
    return { kind: 'auto_early_evening', diaryDate: now.date };
  }

  if (input.hasDayChat && nowMinutes >= 22 * 60 + 30 && nowMinutes < 23 * 60 + 50 && quietMinutes >= 10) {
    return { kind: 'auto_late_evening', diaryDate: now.date };
  }

  if (input.hasDayChat && nowMinutes >= 23 * 60 + 50 && sessionStartedBeforeLateCutoff(input.sessionStartedAt)) {
    const diaryDate = beijingDiaryDate(input.sessionStartedAt as string);
    if (input.isSessionActive) {
      return { kind: 'show_manual_hint', diaryDate };
    }
    if (quietMinutes >= 10) {
      return { kind: 'auto_late_evening', diaryDate };
    }
  }

  return { kind: 'none' };
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function resolveStableChoice<T extends string>(values: readonly T[], seed: string): T {
  return values[stableHash(seed) % values.length];
}

export function resolveDiaryTheme(space: string, roleCardId: string, diaryDate: string): DiaryThemeKey {
  return resolveStableChoice(DIARY_THEME_KEYS, `${space}:${roleCardId}:${diaryDate}`);
}

export function resolveDiaryBodyFont(space: string, roleCardId: string, diaryDate: string): DiaryBodyFontKey {
  return resolveStableChoice(DIARY_BODY_FONT_KEYS, `font:${space}:${roleCardId}:${diaryDate}`);
}
