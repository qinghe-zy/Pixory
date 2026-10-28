/**
 * 伴侣聊天拟人打字节律与行为配置引擎 (PacingProfile)
 *
 * 紧凑灵动节奏设计：
 * 1. 首句极速就绪（150ms~250ms），早点接收消息，彻底告别沉闷傻等。
 * 2. 后续分句紧凑阶梯推进（200ms~700ms，约 18ms/字），保留真人分句发送的视觉层次感。
 */

export type ImIntervalMode = 'fast' | 'medium' | 'slow' | 'custom' | 'random';
export type ImCharSpeedGear = 'fast' | 'medium' | 'slow' | 'custom';

export interface ImGlobalPacingSettings {
  intervalMode: ImIntervalMode;
  customIntervalMs: number;
  charDelayEnabled: boolean;
  charSpeedGear: ImCharSpeedGear;
  customCharSpeedMs: number;
  debounceWaitSec: number;
  globalHeartbeatEnabled: boolean;
  globalProactiveEnabled: boolean;
}

export const DEFAULT_IM_GLOBAL_SETTINGS: ImGlobalPacingSettings = {
  intervalMode: 'medium',
  customIntervalMs: 350,
  charDelayEnabled: false,
  charSpeedGear: 'medium',
  customCharSpeedMs: 50,
  debounceWaitSec: 2,
  globalHeartbeatEnabled: true,
  globalProactiveEnabled: true,
};

export interface ImPacingConfig {
  typingSpeedMsPerChar: number;
  minBubbleDelayMs: number;
  maxBubbleDelayMs: number;
  userInputDebounceMs: number;
  maxBurstCount: number;
}

export const DEFAULT_PACING_CONFIG: ImPacingConfig = {
  typingSpeedMsPerChar: 18,
  minBubbleDelayMs: 200,
  maxBubbleDelayMs: 700,
  userInputDebounceMs: 2000,
  maxBurstCount: 4,
};

/**
 * 根据全局设置、字符数与首句标志计算显影延迟
 * 首句极速上屏 (150~250ms)，后续分句按选定档位紧凑弹出
 */
export function calculateBubbleTypingDelay(
  text: string,
  settings: ImGlobalPacingSettings | ImPacingConfig = DEFAULT_IM_GLOBAL_SETTINGS,
  isFirstBubble: boolean = false,
  options?: { isOccupied?: boolean; dampingMultiplier?: number }
): number {
  const multiplier = options?.dampingMultiplier ?? (options?.isOccupied ? 1.5 : 1.0);
  if (isFirstBubble) {
    const base = Math.round(150 + Math.random() * 100);
    return Math.round(base * multiplier);
  }

  const global = ('intervalMode' in settings) ? settings : DEFAULT_IM_GLOBAL_SETTINGS;
  let baseInterval = 350;
  switch (global.intervalMode) {
    case 'fast':
      baseInterval = 200;
      break;
    case 'medium':
      baseInterval = 350;
      break;
    case 'slow':
      baseInterval = 600;
      break;
    case 'random':
      baseInterval = Math.round(200 + Math.random() * 300);
      break;
    case 'custom':
      baseInterval = Math.max(100, global.customIntervalMs || 350);
      break;
  }

  if (!global.charDelayEnabled) {
    return Math.round(baseInterval * multiplier);
  }

  let charSpeed = 50;
  switch (global.charSpeedGear) {
    case 'fast':
      charSpeed = 20;
      break;
    case 'medium':
      charSpeed = 50;
      break;
    case 'slow':
      charSpeed = 80;
      break;
    case 'custom':
      charSpeed = Math.max(5, global.customCharSpeedMs || 50);
      break;
  }

  const charDelay = text.trim().length * charSpeed;
  return Math.min(3500, Math.round((baseInterval + charDelay) * multiplier));
}

/**
 * 伴侣连发序列阶梯时间戳规划
 */
export function scheduleBurstTimeline(
  sentences: string[],
  baseTime: number = Date.now(),
  settings: ImGlobalPacingSettings = DEFAULT_IM_GLOBAL_SETTINGS
): Array<{ text: string; visibleAt: number; delayMs: number }> {
  let currentTime = baseTime;
  const limited = sentences.slice(0, 4);

  return limited.map((text, idx) => {
    const isFirstBubble = idx === 0;
    const delay = calculateBubbleTypingDelay(text, settings, isFirstBubble);
    currentTime += delay;
    return {
      text,
      visibleAt: currentTime,
      delayMs: delay,
    };
  });
}
