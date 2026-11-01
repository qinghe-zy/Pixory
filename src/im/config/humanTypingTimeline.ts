/**
 * 真人拟真打字节律与时间线引擎 (HumanTypingTimeline)
 * 模拟真人打字心理模型：首句阅读思考、长短句动态击键、思考停顿与快速连发
 */

import type { ImGlobalPacingSettings, ImPacingConfig } from './pacingProfile';
import { DEFAULT_IM_GLOBAL_SETTINGS } from './pacingProfile';

export interface HumanTypingOptions {
  userTextLength?: number;
  isOccupied?: boolean;
  isSleeping?: boolean;
  dampingMultiplier?: number;
  burstIndex?: number;
  totalBurstCount?: number;
  rng?: () => number;
}

/**
 * 计算单个气泡的拟人打字/思考延迟
 */
export function calculateHumanTypingDelay(
  text: string,
  settings: ImGlobalPacingSettings | ImPacingConfig = DEFAULT_IM_GLOBAL_SETTINGS,
  isFirstBubble: boolean = false,
  options?: HumanTypingOptions
): number {
  const rng = options?.rng || Math.random;
  const global = 'intervalMode' in settings ? settings : DEFAULT_IM_GLOBAL_SETTINGS;

  // 1. 速度倍率
  let gearMultiplier = 1.0;
  switch (global.intervalMode) {
    case 'fast':
      gearMultiplier = 0.65;
      break;
    case 'medium':
      gearMultiplier = 1.0;
      break;
    case 'slow':
      gearMultiplier = 1.55;
      break;
    case 'random':
      gearMultiplier = 0.7 + rng() * 0.7;
      break;
    case 'custom':
      gearMultiplier = Math.max(0.3, Math.min(3.0, (global.customIntervalMs || 320) / 320));
      break;
  }

  const damping = options?.dampingMultiplier ?? 1.0;

  // 2. 首条气泡延迟：阅读对方输入 + 构思第1句话
  if (isFirstBubble) {
    // 伴侣忙碌状态下的真实延迟（5s ~ 35s）
    if (options?.isOccupied) {
      const busyDelay = 5000 + Math.floor(rng() * 25000);
      return Math.round(busyDelay * gearMultiplier);
    }
    if (options?.isSleeping) {
      return Math.round((20000 + rng() * 30000) * gearMultiplier);
    }

    // 正常首句：基准阅读与思考耗时
    const readChars = options?.userTextLength ?? 10;
    const baseCognitive = 350 + Math.min(1800, readChars * 22);
    const jitter = 0.85 + rng() * 0.3; // 85% ~ 115% 抖动
    const firstDelay = Math.round(baseCognitive * jitter * gearMultiplier * damping);
    return Math.max(200, Math.min(2400, firstDelay));
  }

  // 3. 后续分句气泡延迟：真实击键 + 偶发停顿/顺势连发
  const charCount = text.trim().length;

  // 模拟打字速度：基准每个字符约 75ms ~ 110ms
  const baseCharSpeed = 75 + rng() * 35;
  let typingDuration = charCount * baseCharSpeed;

  const eventRoll = rng();
  if (eventRoll < 0.12) {
    // 12% 概率：极速顺发（脑海已有成句，随手按下发送，< 260ms）
    typingDuration = 120 + rng() * 140;
  } else if (eventRoll > 0.86) {
    // 14% 概率：思考停顿（犹豫措辞或停顿一下，额外加 1200ms ~ 2800ms）
    typingDuration += 1200 + rng() * 1600;
  }

  // 叠加间隔底色
  const baseInterBubbleGap = 200 + rng() * 180;
  let finalDelay = (baseInterBubbleGap + typingDuration) * gearMultiplier * damping;

  // 单条气泡软上限 clamp 到 180ms ~ 4500ms
  finalDelay = Math.max(180, Math.min(4500, Math.round(finalDelay)));
  return finalDelay;
}

/**
 * 为一组连发气泡规划完整时间线，并施加总时长软上限保护（<= 14秒）
 */
export function scheduleHumanBurstTimeline(
  sentences: string[],
  baseTime: number = Date.now(),
  settings: ImGlobalPacingSettings = DEFAULT_IM_GLOBAL_SETTINGS,
  options?: HumanTypingOptions
): Array<{ text: string; visibleAt: number; delayMs: number }> {
  let currentTime = baseTime;
  const limited = sentences.slice(0, 5);

  const rawDelays: number[] = limited.map((text, idx) => {
    return calculateHumanTypingDelay(text, settings, idx === 0, {
      ...options,
      burstIndex: idx,
      totalBurstCount: limited.length,
    });
  });

  // 如果总耗时超过 14s 软上限，按比例适度压缩后续分句，避免用户等待过久
  const totalRawDuration = rawDelays.reduce((sum, d) => sum + d, 0);
  const MAX_TOTAL_BURST_MS = 14000;
  let scaleFactor = 1.0;
  if (totalRawDuration > MAX_TOTAL_BURST_MS && limited.length > 1) {
    const firstDelay = rawDelays[0];
    const subsequentSum = totalRawDuration - firstDelay;
    const allowedSubsequent = Math.max(2000, MAX_TOTAL_BURST_MS - firstDelay);
    scaleFactor = allowedSubsequent / subsequentSum;
  }

  return limited.map((text, idx) => {
    let delay = rawDelays[idx];
    if (idx > 0 && scaleFactor < 1.0) {
      delay = Math.max(160, Math.round(delay * scaleFactor));
    }
    currentTime += delay;
    return {
      text,
      visibleAt: currentTime,
      delayMs: delay,
    };
  });
}
