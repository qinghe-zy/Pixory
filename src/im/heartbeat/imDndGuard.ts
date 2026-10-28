/**
 * 伴聊夜间免打扰守卫 (Night DND Guard)
 * 严格执行双层仲裁法则：单伴侣专属设置 > 全局伴聊设置 > 出厂默认值
 * 全局设置绝对不能覆盖单伴侣自定义！
 */

export interface EffectiveDndConfig {
  enabled: boolean;
  startTime: string; // "HH:mm", 默认 "23:00"
  endTime: string;   // "HH:mm", 默认 "07:30"
  source: 'custom_override' | 'global' | 'default';
}

export interface ThreadDndSettings {
  dndOverrideEnabled?: boolean | null;
  dndStartTime?: string | null;
  dndEndTime?: string | null;
}

export interface GlobalDndSettings {
  enabled?: boolean;
  startTime?: string;
  endTime?: string;
}

export const DEFAULT_DND_CONFIG: EffectiveDndConfig = {
  enabled: true,
  startTime: '23:00',
  endTime: '07:30',
  source: 'default',
};

export function resolveEffectiveDnd(
  threadSettings?: ThreadDndSettings | null,
  globalSettings?: GlobalDndSettings | null
): EffectiveDndConfig {
  if (threadSettings?.dndOverrideEnabled !== undefined && threadSettings?.dndOverrideEnabled !== null) {
    return {
      enabled: Boolean(threadSettings.dndOverrideEnabled),
      startTime: threadSettings.dndStartTime || globalSettings?.startTime || DEFAULT_DND_CONFIG.startTime,
      endTime: threadSettings.dndEndTime || globalSettings?.endTime || DEFAULT_DND_CONFIG.endTime,
      source: 'custom_override',
    };
  }

  if (globalSettings?.enabled !== undefined) {
    return {
      enabled: Boolean(globalSettings.enabled),
      startTime: globalSettings.startTime || DEFAULT_DND_CONFIG.startTime,
      endTime: globalSettings.endTime || DEFAULT_DND_CONFIG.endTime,
      source: 'global',
    };
  }

  return DEFAULT_DND_CONFIG;
}

export function parseMinutesFromMidnight(timeStr: string): number {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

export function isTimestampInDnd(timestamp: number, dnd: EffectiveDndConfig): boolean {
  if (!dnd.enabled) return false;

  const date = new Date(timestamp);
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const startMin = parseMinutesFromMidnight(dnd.startTime);
  const endMin = parseMinutesFromMidnight(dnd.endTime);

  if (startMin < endMin) {
    return currentMinutes >= startMin && currentMinutes < endMin;
  } else {
    return currentMinutes >= startMin || currentMinutes < endMin;
  }
}

export function shiftTimestampPastDnd(
  timestamp: number,
  dnd: EffectiveDndConfig,
  randomJitterMinutes = 20
): number {
  if (!isTimestampInDnd(timestamp, dnd)) {
    return timestamp;
  }

  const date = new Date(timestamp);
  const parts = dnd.endTime.split(':');
  const endH = parseInt(parts[0] || '7', 10);
  const endM = parseInt(parts[1] || '30', 10);
  const target = new Date(date);
  target.setHours(isNaN(endH) ? 7 : endH, isNaN(endM) ? 30 : endM, 0, 0);

  if (target.getTime() <= timestamp) {
    target.setDate(target.getDate() + 1);
  }

  const jitterMs = Math.floor((5 + Math.random() * randomJitterMinutes) * 60 * 1000);
  return target.getTime() + jitterMs;
}
