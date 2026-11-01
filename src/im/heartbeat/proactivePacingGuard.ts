/**
 * 三阶情感退避与 72h 断连休眠状态机 (Proactive Pacing & Hibernation Guard)
 *
 * 核心设计哲学：打扰与人设兼得。
 * 为杜绝伴侣在用户未回复时演变为“夺命连环 call”，结合人际交往心理学边界设立三阶退避：
 * 1. 第 1 轮未回复 (Tier 1): 30min ~ 2h 之间温和分享小事；
 * 2. 第 2 轮未回复 (Tier 2): 强制间隔 >= 4 小时体贴留白；
 * 3. 第 3 轮未回复 (Tier 3): 推迟至次日清晨轻声问候，之后进入静默等待；
 * 4. 72h 断连终极休眠 (Hibernating): 超过 72 小时无互动或连续 3 轮未回复，彻底停止主动发消息，直至用户主动破冰唤醒。
 */

export interface ProactivePacingDecision {
  allowHeartbeat: boolean;
  tier: 1 | 2 | 3;
  suggestedDelayMs: number;
  isHibernating: boolean;
  reason:
    | 'within_budget'
    | 'gentle_tier2'
    | 'morning_greeting_tier3'
    | 'hibernating_72h'
    | 'consecutive_limit_reached';
}

export const HIBERNATION_CUTOFF_MS = 72 * 3600 * 1000; // 72 小时
export const TIER2_MIN_DELAY_MS = 4 * 3600 * 1000;     // 4 小时
export const TIER1_MIN_DELAY_MS = 30 * 60 * 1000;      // 30 分钟

/**
 * 依据连续未回复次数与最后用户交互时间戳，计算下一次主动关怀的合规决策
 */
export function evaluateProactivePacing(
  consecutiveUnreplied: number,
  lastUserInteractionAt: number | null | undefined,
  now: number = Date.now()
): ProactivePacingDecision {
  // 若从未有过用户记录，初始化为当前时间
  const lastActive = lastUserInteractionAt && lastUserInteractionAt > 0 ? lastUserInteractionAt : now;
  const elapsedSinceUser = Math.max(0, now - lastActive);

  // 1. 超过 72 小时无互动 -> 强制进入休眠态，绝对停止主动发消息
  if (elapsedSinceUser >= HIBERNATION_CUTOFF_MS) {
    return {
      allowHeartbeat: false,
      tier: 3,
      suggestedDelayMs: 0,
      isHibernating: true,
      reason: 'hibernating_72h',
    };
  }

  // 2. 连续多次未回复 (>= 3): 绝不静默关闭，持续在 72h 内保持心跳（早晚或周期性轻声问候）
  if (consecutiveUnreplied >= 3) {
    const delay = Math.floor(6 * 3600 * 1000 + Math.random() * (6 * 3600 * 1000));
    return {
      allowHeartbeat: true,
      tier: 3,
      suggestedDelayMs: delay,
      isHibernating: false,
      reason: 'morning_greeting_tier3',
    };
  }

  // 3. 第 1 轮未回复 (consecutiveUnreplied == 0): 30min ~ 2h 之间温和分享
  if (consecutiveUnreplied === 0) {
    const delay = TIER1_MIN_DELAY_MS + Math.floor(Math.random() * (90 * 60 * 1000));
    return {
      allowHeartbeat: true,
      tier: 1,
      suggestedDelayMs: delay,
      isHibernating: false,
      reason: 'within_budget',
    };
  }

  // 4. 第 2 轮未回复 (consecutiveUnreplied == 1): 强制间隔 >= 4 小时体贴留白
  if (consecutiveUnreplied === 1) {
    const delay = TIER2_MIN_DELAY_MS + Math.floor(Math.random() * (2 * 3600 * 1000));
    return {
      allowHeartbeat: true,
      tier: 2,
      suggestedDelayMs: delay,
      isHibernating: false,
      reason: 'gentle_tier2',
    };
  }

  // 5. 第 3 轮未回复 (consecutiveUnreplied == 2): 推迟到次日清晨 (8~12 小时后) 轻声问候
  const delay = Math.floor(8 * 3600 * 1000 + Math.random() * (4 * 3600 * 1000));
  return {
    allowHeartbeat: true,
    tier: 3,
    suggestedDelayMs: delay,
    isHibernating: false,
    reason: 'morning_greeting_tier3',
  };
}
