import type {
  ImCompanionLivingState,
  AgencyCapacityResult,
  LivingStateTrajectoryItem,
  ActivityLoad,
  PrivacyContext,
  DeviceAccess,
} from '../types';

/**
 * 限制 Alter 情绪惯性在 [-5, +5] 区间
 */
export function clampAlterValue(val: number): number {
  return Math.max(-5, Math.min(5, Math.round(val)));
}

/**
 * Alter 情绪跨时间自然衰减 (Baseline Reversion)
 *
 * 核心规则：
 * 1. 每经过 4 小时，向 0 (平和基准) 衰减 50% (半衰期模型)
 * 2. 若跨越午夜经历跨夜睡眠，额外衰减 50%
 * 3. 杜绝永久抑郁或亢奋锁死
 */
export function decayAlterValue(
  alterValue: number,
  lastUpdatedAt: number,
  now: number = Date.now()
): number {
  if (alterValue === 0) return 0;
  const elapsedMs = Math.max(0, now - lastUpdatedAt);
  const fourHourPeriods = Math.floor(elapsedMs / (4 * 3600 * 1000));

  let current = alterValue;
  // 4 小时周期半衰
  for (let i = 0; i < fourHourPeriods; i++) {
    current = Math.trunc(current * 0.5);
    if (current === 0) break;
  }

  // 跨夜检测 (若日期不同且间隔超过 6 小时)
  const lastDate = new Date(lastUpdatedAt).toDateString();
  const currentDate = new Date(now).toDateString();
  if (lastDate !== currentDate && elapsedMs >= 6 * 3600 * 1000) {
    current = Math.trunc(current * 0.5);
  }

  const res = clampAlterValue(current);
  return res === 0 ? 0 : res;
}

/**
 * 物理行动容量守卫仲裁器 (Agency Capacity Evaluator)
 *
 * 核心规则（已修复无限静默死锁漏洞）：
 * 1. 睡眠状态由夜间免打扰守卫拦截；
 * 2. 关键守卫：若 now >= state.validUntil，说明忙碌/脱手已自然结束，立即放行并产生“刚忙完”联系时机；
 * 3. 仅在状态有效期内拦截 away/occupied，且建议延后时间对齐至 validUntil。
 */
export function evaluateAgencyCapacity(
  state: ImCompanionLivingState | undefined,
  disclosure: 'ordinary' | 'intimate' = 'ordinary',
  now: number = Date.now()
): AgencyCapacityResult {
  if (!state) {
    return { allowed: true, reason: 'capacity-available' };
  }

  // 1. 睡眠状态拦截
  if (state.activityLoad === 'sleeping') {
    return { allowed: false, reason: 'sleeping' };
  }

  // 2. 关键修复：若当前时间已超过 validUntil，说明脱手状态已结束，即刻放行
  if (now >= state.validUntil) {
    return { allowed: true, reason: 'capacity-available' };
  }

  // 3. 仅在状态有效期内执行容量限制，延后时间对齐至状态自然结束点
  const remainingMs = Math.max(5 * 60 * 1000, state.validUntil - now);

  if (state.deviceAccess === 'away') {
    return { allowed: false, reason: 'device-away', suggestedDelayMs: remainingMs };
  }

  if (state.activityLoad === 'occupied') {
    return { allowed: false, reason: 'schedule-occupied', suggestedDelayMs: remainingMs };
  }

  if (disclosure === 'intimate' && state.privacyContext === 'public') {
    return {
      allowed: false,
      reason: 'privacy-restricted',
      suggestedDelayMs: Math.min(remainingMs, 20 * 60 * 1000),
    };
  }

  return { allowed: true, reason: 'capacity-available' };
}

/**
 * 推进伴侣生活状态机 (State Transition & Trajectory Append)
 */
export function advanceLivingState(
  currentState: ImCompanionLivingState | undefined,
  update: {
    statusText: string;
    activityLoad?: ActivityLoad;
    privacyContext?: PrivacyContext;
    deviceAccess?: DeviceAccess;
    durationMs?: number;
    alterDelta?: number;
  },
  now: number = Date.now()
): ImCompanionLivingState {
  const durationMs = update.durationMs ?? 30 * 60 * 1000;
  const validUntil = now + durationMs;

  const trajectory = currentState?.recentTrajectory ? [...currentState.recentTrajectory] : [];

  // 将前一状态归档进日间轨迹
  if (currentState && currentState.statusText) {
    const item: LivingStateTrajectoryItem = {
      statusText: currentState.statusText,
      startedAt: currentState.startedAt,
      endedAt: now,
      activityLoad: currentState.activityLoad,
      privacyContext: currentState.privacyContext,
      deviceAccess: currentState.deviceAccess,
    };
    trajectory.push(item);
    if (trajectory.length > 10) {
      trajectory.shift();
    }
  }

  // 计算情绪惯性增量
  const baseAlter = currentState
    ? decayAlterValue(currentState.alterValue, currentState.startedAt, now)
    : 0;
  const delta = update.alterDelta ? Math.max(-1, Math.min(1, Math.round(update.alterDelta))) : 0;
  const newAlter = clampAlterValue(baseAlter + delta);

  return {
    statusText: update.statusText,
    activityLoad: update.activityLoad ?? currentState?.activityLoad ?? 'free',
    privacyContext: update.privacyContext ?? currentState?.privacyContext ?? 'private',
    deviceAccess: update.deviceAccess ?? currentState?.deviceAccess ?? 'available',
    startedAt: now,
    validUntil,
    alterValue: newAlter,
    recentTrajectory: trajectory,
  };
}
