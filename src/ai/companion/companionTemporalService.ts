import type { ParsedTemporalAnchor } from './companionTypes';

export const COMPANION_TEMPORAL_PARSER_VERSION = 'companion-temporal-v1';
const FALLBACK_TIME_ZONE = 'Asia/Shanghai';

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export function resolveCompanionTimeZone(candidate?: string | null): string {
  const value = candidate?.trim() || FALLBACK_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

function partsInZone(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit', hour: '2-digit', hourCycle: 'h23', minute: '2-digit', month: '2-digit', second: '2-digit', timeZone, year: 'numeric',
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { day: read('day'), hour: read('hour'), minute: read('minute'), month: read('month'), second: read('second'), year: read('year') };
}

function localAsUtc(parts: LocalParts, millisecond = 0): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, millisecond);
}

function zonedLocalToUtc(parts: LocalParts, timeZone: string, millisecond = 0): Date {
  const target = localAsUtc(parts, millisecond);
  let guess = target;
  for (let index = 0; index < 3; index += 1) {
    const rendered = partsInZone(new Date(guess), timeZone);
    guess += target - localAsUtc(rendered, millisecond);
  }
  return new Date(guess);
}

function addLocalDays(parts: LocalParts, days: number): LocalParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, parts.hour, parts.minute, parts.second));
  return { day: date.getUTCDate(), hour: parts.hour, minute: parts.minute, month: date.getUTCMonth() + 1, second: parts.second, year: date.getUTCFullYear() };
}

function dateKey(parts: Pick<LocalParts, 'year' | 'month' | 'day'>): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function nextOccurrenceYear(now: LocalParts, month: number, day: number): number | null {
  if (!isValidDate(2000, month, day)) return null;
  const alreadyPassed = month < now.month || (month === now.month && day < now.day);
  const firstYear = now.year + (alreadyPassed ? 1 : 0);
  for (let year = firstYear; year <= firstYear + 8; year += 1) {
    if (isValidDate(year, month, day)) return year;
  }
  return null;
}

function rangeForLocalDate(parts: LocalParts, timeZone: string, timeWord?: string): { startAtUtc: string; endAtUtc: string; precision: ParsedTemporalAnchor['precision'] } {
  const hours: Record<string, [number, number]> = { 上午: [8, 11], 早上: [6, 10], 中午: [11, 13], 下午: [13, 17], 晚上: [18, 23] };
  const [startHour, endHour] = timeWord && hours[timeWord] ? hours[timeWord] : [0, 23];
  const start = zonedLocalToUtc({ ...parts, hour: startHour, minute: 0, second: 0 }, timeZone, 0);
  const end = zonedLocalToUtc({ ...parts, hour: endHour, minute: 59, second: 59 }, timeZone, 999);
  return { endAtUtc: end.toISOString(), precision: timeWord ? 'hour' : 'day', startAtUtc: start.toISOString() };
}

function nextWeekday(parts: LocalParts, targetDay: number, forceNextWeek: boolean): LocalParts {
  const currentDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  let delta: number;
  if (forceNextWeek) {
    const daysUntilNextMonday = (8 - currentDay) % 7 || 7;
    delta = daysUntilNextMonday + (targetDay === 0 ? 6 : targetDay - 1);
  } else {
    delta = (targetDay - currentDay + 7) % 7;
    if (delta === 0) delta = 7;
  }
  return addLocalDays(parts, delta);
}

export function parseTemporalPhrases(
  text: string,
  options: { now: string | Date; timeZone?: string | null },
): ParsedTemporalAnchor[] {
  const timeZone = resolveCompanionTimeZone(options.timeZone);
  const nowDate = options.now instanceof Date ? options.now : new Date(options.now);
  if (Number.isNaN(nowDate.getTime())) return [];
  const now = partsInZone(nowDate, timeZone);
  const results: ParsedTemporalAnchor[] = [];
  const occupied: Array<[number, number]> = [];
  const push = (match: RegExpMatchArray, local: LocalParts, type: ParsedTemporalAnchor['type'], recurrenceRule: string | null = null, timeWord?: string) => {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (occupied.some(([left, right]) => start < right && end > left)) return;
    occupied.push([start, end]);
    const range = rangeForLocalDate(local, timeZone, timeWord);
    results.push({
      endAtUtc: range.endAtUtc,
      localDateKey: dateKey(local),
      parseTimeZone: timeZone,
      parserVersion: COMPANION_TEMPORAL_PARSER_VERSION,
      precision: recurrenceRule ? 'week' : range.precision,
      rawText: match[0],
      recurrenceRule,
      sourceEnd: end,
      sourceStart: start,
      startAtUtc: range.startAtUtc,
      type,
    });
  };

  for (const match of text.matchAll(/截止\s*(\d{1,2})月(\d{1,2})日/gu)) {
    const month = Number(match[1]); const day = Number(match[2]);
    const year = nextOccurrenceYear(now, month, day);
    if (year != null) push(match, { ...now, day, month, year }, 'deadline');
  }
  const weekdayMap: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
  const weekdayCode: Record<string, string> = { 一: 'MO', 二: 'TU', 三: 'WE', 四: 'TH', 五: 'FR', 六: 'SA', 日: 'SU', 天: 'SU' };
  for (const match of text.matchAll(/每周([一二三四五六日天])/gu)) {
    push(match, nextWeekday(now, weekdayMap[match[1]], false), 'recurrence', `FREQ=WEEKLY;BYDAY=${weekdayCode[match[1]]}`);
  }
  for (const match of text.matchAll(/(\d{1,2})月(\d{1,2})日[^。！？]{0,12}(?:周年|纪念日)/gu)) {
    const month = Number(match[1]); const day = Number(match[2]);
    const year = nextOccurrenceYear(now, month, day);
    if (year != null) push(match, { ...now, day, month, year }, 'anniversary', 'FREQ=YEARLY');
  }
  for (const match of text.matchAll(/下周([一二三四五六日天])/gu)) {
    push(match, nextWeekday(now, weekdayMap[match[1]], true), 'point');
  }
  for (const match of text.matchAll(/(今天|明天|后天)(早上|上午|中午|下午|晚上)?/gu)) {
    const delta = match[1] === '明天' ? 1 : match[1] === '后天' ? 2 : 0;
    push(match, addLocalDays(now, delta), 'point', null, match[2]);
  }
  for (const match of text.matchAll(/(?<!截止\s)(\d{1,2})月(\d{1,2})日/gu)) {
    const month = Number(match[1]); const day = Number(match[2]);
    const year = nextOccurrenceYear(now, month, day);
    if (year != null) push(match, { ...now, day, month, year }, 'point');
  }
  return results.sort((left, right) => left.sourceStart - right.sourceStart || left.type.localeCompare(right.type));
}

export function advanceRecurringTemporalAnchor(input: {
  mentionedAt: string;
  parseTimeZone: string;
  rawText: string;
  type: 'anniversary' | 'recurrence';
}): ParsedTemporalAnchor | null {
  const candidates = parseTemporalPhrases(input.rawText, {
    now: input.mentionedAt,
    timeZone: input.parseTimeZone,
  });
  return candidates.find((candidate) => candidate.type === input.type) ?? null;
}

export const CompanionTemporalService = { advanceRecurring: advanceRecurringTemporalAnchor, parse: parseTemporalPhrases, resolveTimeZone: resolveCompanionTimeZone };
