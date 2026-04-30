function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatUpdatedLabel(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return '最近更新';
  }

  const now = new Date();
  const isSameDay =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();

  if (isSameDay) {
    return `今天 ${pad(date.getHours())}:${pad(date.getMinutes())} 更新`;
  }

  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} 更新`;
}

export function formatDateTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return '未知时间';
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function formatDate(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return '未知日期';
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatFileSize(sizeInBytes: number): string {
  if (!Number.isFinite(sizeInBytes) || sizeInBytes <= 0) {
    return '0 B';
  }

  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`;
  }

  if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatImageDimensions(width: number, height: number): string {
  if (width <= 0 || height <= 0) {
    return '未知尺寸';
  }

  return `${width} × ${height}`;
}

export function getIpInitials(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    return 'IP';
  }

  return normalized.slice(0, 2).toUpperCase();
}
