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
  globalDndEnabled?: boolean;
  globalDndStartTime?: string;
  globalDndEndTime?: string;
  globalVoiceReplyEnabled?: boolean;
}

export const DEFAULT_IM_GLOBAL_SETTINGS: ImGlobalPacingSettings = {
  intervalMode: 'medium',
  customIntervalMs: 320,
  charDelayEnabled: false,
  charSpeedGear: 'medium',
  customCharSpeedMs: 40,
  debounceWaitSec: 0,
  globalHeartbeatEnabled: true,
  globalProactiveEnabled: true,
  globalDndEnabled: true,
  globalDndStartTime: '23:00',
  globalDndEndTime: '07:30',
  globalVoiceReplyEnabled: true,
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
  minBubbleDelayMs: 180,
  maxBubbleDelayMs: 600,
  userInputDebounceMs: 0,
  maxBurstCount: 4,
};

/**
 * 根据全局设置、字符数与首句标志计算显影延迟
 * 首句零等待极速上屏 (0ms)，后续分句紧凑阶梯推进 (180ms~600ms)
 */
export function calculateBubbleTypingDelay(
  text: string,
  settings: ImGlobalPacingSettings | ImPacingConfig = DEFAULT_IM_GLOBAL_SETTINGS,
  isFirstBubble: boolean = false,
  options?: { isOccupied?: boolean; dampingMultiplier?: number }
): number {
  if (isFirstBubble) {
    return 0;
  }

  const multiplier = options?.dampingMultiplier ?? (options?.isOccupied ? 1.4 : 1.0);
  const global = ('intervalMode' in settings) ? settings : DEFAULT_IM_GLOBAL_SETTINGS;
  let baseInterval = 320;
  switch (global.intervalMode) {
    case 'fast':
      baseInterval = 180;
      break;
    case 'medium':
      baseInterval = 320;
      break;
    case 'slow':
      baseInterval = 550;
      break;
    case 'random':
      baseInterval = Math.round(180 + Math.random() * 240);
      break;
    case 'custom':
      baseInterval = Math.max(80, global.customIntervalMs || 320);
      break;
  }

  if (!global.charDelayEnabled) {
    return Math.round(baseInterval * multiplier);
  }

  let charSpeed = 40;
  switch (global.charSpeedGear) {
    case 'fast':
      charSpeed = 18;
      break;
    case 'medium':
      charSpeed = 40;
      break;
    case 'slow':
      charSpeed = 70;
      break;
    case 'custom':
      charSpeed = Math.max(5, global.customCharSpeedMs || 40);
      break;
  }

  const charDelay = text.trim().length * charSpeed;
  return Math.min(2500, Math.round((baseInterval + charDelay) * multiplier));
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
