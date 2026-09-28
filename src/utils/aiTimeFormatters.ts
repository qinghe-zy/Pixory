function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatAiMessageMinute(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) {
    return '';
  }
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

export function formatAiFullMinute(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) {
    return value ?? '';
  }
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

export function formatAiHistoryMinute(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) {
    return '未知时间';
  }
  return `${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}
