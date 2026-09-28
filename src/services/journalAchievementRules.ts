export interface JournalRound {
  userCreatedAt: string;
  assistantCreatedAt: string;
  userStatus?: string;
  assistantStatus?: string;
  userMessageId?: string;
}

export interface JournalMessage {
  createdAt: string;
  role: 'user' | 'assistant' | 'system';
  status: string;
}

export function isValidRound(round: JournalRound): boolean {
  return (
    round.userStatus === undefined || round.userStatus === 'completed'
  ) && (
    round.assistantStatus === undefined || round.assistantStatus === 'completed'
  ) && Boolean(round.userCreatedAt && round.assistantCreatedAt);
}

export function parseLocalHour(date: Date, timeZoneOffsetMinutes = 480): number {
  const localMs = date.getTime() + timeZoneOffsetMinutes * 60 * 1000;
  return new Date(localMs).getUTCHours();
}

export function hasDeepNightRounds(
  rounds: JournalRound[],
  timeZoneOffsetMinutes = 480,
): JournalRound | null {
  const validNightRounds = rounds.filter((round) => {
    if (!isValidRound(round)) return false;
    const hour = parseLocalHour(new Date(round.userCreatedAt), timeZoneOffsetMinutes);
    return hour >= 1 && hour < 4;
  });
  return validNightRounds.length >= 20 ? validNightRounds[19] : null;
}

export function hasContinuousRounds(
  rounds: JournalRound[],
  minimumRounds: number,
  windowMs = 60 * 60 * 1000,
  maximumGapMs = 3 * 60 * 1000,
): JournalRound | null {
  const validRounds = rounds
    .filter(isValidRound)
    .sort((left, right) => left.userCreatedAt.localeCompare(right.userCreatedAt));

  for (let start = 0; start < validRounds.length; start += 1) {
    let count = 1;
    const startAt = new Date(validRounds[start].userCreatedAt).getTime();
    let previousAt = startAt;

    for (let index = start + 1; index < validRounds.length; index += 1) {
      const currentAt = new Date(validRounds[index].userCreatedAt).getTime();
      if (currentAt - previousAt > maximumGapMs || currentAt - startAt > windowMs) {
        break;
      }
      count += 1;
      previousAt = currentAt;
      if (count >= minimumRounds) return validRounds[index];
    }
  }

  return null;
}

export function hasCrossDateContinuousRounds(
  rounds: JournalRound[],
  timeZoneOffsetMinutes = 480,
): JournalRound | null {
  const validRounds = rounds
    .filter(isValidRound)
    .sort((left, right) => left.userCreatedAt.localeCompare(right.userCreatedAt));
  for (let start = 0; start < validRounds.length; start += 1) {
    const startAt = new Date(validRounds[start].userCreatedAt).getTime();
    let previousAt = startAt;
    const localDates = new Set<string>();
    for (let index = start; index < validRounds.length; index += 1) {
      const current = validRounds[index];
      const currentAt = new Date(current.userCreatedAt).getTime();
      if (currentAt - previousAt > 3 * 60 * 1000 || currentAt - startAt > 60 * 60 * 1000) break;
      const localMs = currentAt + timeZoneOffsetMinutes * 60 * 1000;
      localDates.add(new Date(localMs).toISOString().slice(0, 10));
      if (index - start + 1 >= 25 && localDates.size >= 2) return current;
      previousAt = currentAt;
    }
  }
  return null;
}

export function hasSevenConsecutiveDates(
  roundsByDate: Map<string, number>,
  minimumRoundsPerDate = 3,
): string | null {
  const eligibleDates = [...roundsByDate.entries()]
    .filter(([, rounds]) => rounds >= minimumRoundsPerDate)
    .map(([date]) => date)
    .sort();

  for (let index = 0; index <= eligibleDates.length - 7; index += 1) {
    let consecutive = true;
    for (let offset = 1; offset < 7; offset += 1) {
      const previous = new Date(`${eligibleDates[index + offset - 1]}T00:00:00Z`).getTime();
      const current = new Date(`${eligibleDates[index + offset]}T00:00:00Z`).getTime();
      if (current - previous !== 24 * 60 * 60 * 1000) {
        consecutive = false;
        break;
      }
    }
    if (consecutive) return eligibleDates[index + 6];
  }
  return null;
}

export function hasDateInLocalHour(
  date: string,
  startHour: number,
  endHour: number,
  timeZoneOffsetMinutes = 480,
): boolean {
  const hour = parseLocalHour(new Date(date), timeZoneOffsetMinutes);
  return hour >= startHour && hour < endHour;
}

export function countEffectiveRows<T extends { deletedAt?: string | null; status?: string }>(
  rows: T[],
  validStatuses?: string[],
): number {
  return rows.filter((row) => {
    if (row.deletedAt) return false;
    return !validStatuses || !row.status || validStatuses.includes(row.status);
  }).length;
}

export function hasThreshold(count: number, threshold: number): boolean {
  return Number.isFinite(count) && count >= threshold;
}
