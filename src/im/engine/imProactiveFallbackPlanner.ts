import type { ImCompanionLivingState } from '../types';
import type { EffectiveDndConfig } from '../heartbeat/imDndGuard';
import type { ImProactiveFrequencyGear } from '../repository/imSettingsRepository';
import { evaluateProactivePacing } from '../heartbeat/proactivePacingGuard';
import { detectSituationalDelay } from './proactiveTimingEvaluator';
import { isTimeInSleepPeriod, getNextMorning730 } from './naturalTimeParser';

export interface FallbackPingPlan {
  targetTimestamp: number;
  intent: string;
}

/**
 * 分时段生成自然拟真的初始/刷新伴侣在场状态 (16~30字，确保进入聊天页 0 秒点亮顶栏与跑马灯)
 */
export function buildDefaultLivingState(
  now: number = Date.now(),
  prev?: ImCompanionLivingState | null
): ImCompanionLivingState {
  const d = new Date(now);
  const h = d.getHours();

  let statusText = '正在处理手头的日常琐事，随时留意着这边的动静';
  let activityLoad: ImCompanionLivingState['activityLoad'] = 'free';

  if (h >= 6 && h < 9) {
    statusText = '清晨刚醒来梳理心绪，准备开始一天的日常琐事';
  } else if (h >= 9 && h < 12) {
    statusText = '正在专心处理手头的正事与杂务，间隙留意着动静';
  } else if (h >= 12 && h < 14) {
    statusText = '刚吃过饭靠着稍作休整与放空，随时准备陪你闲聊';
  } else if (h >= 14 && h < 18) {
    statusText = '忙碌了一阵正坐着喝水歇口气，静静等候你的消息';
  } else if (h >= 18 && h < 21) {
    statusText = '天色渐暗慢悠悠放松下来，享受属于自己的独处时间';
  } else if (h >= 21 && h < 24) {
    statusText = '周围安静下来了，在一旁静静独处与放空思绪等你';
  } else {
    statusText = '夜色已深有些犯困了，安静休憩着等你的消息回复';
  }

  return {
    statusText,
    activityLoad,
    privacyContext: 'private',
    deviceAccess: 'available',
    startedAt: now,
    validUntil: now + 90 * 60 * 1000,
    alterValue: prev?.alterValue ?? 0,
    recentTrajectory: prev?.recentTrajectory ?? [],
  };
}

/**
 * 判断持久化的 LivingState 是否缺失或已严重过期 (> 3 小时) 需自动温和刷新
 */
export function shouldSeedOrRefreshLivingState(
  state: ImCompanionLivingState | null | undefined,
  now: number = Date.now()
): boolean {
  if (!state || !state.statusText?.trim()) return true;
  if (state.activityLoad === 'sleeping' && !isTimeInSleepPeriod(now)) return true;
  return now - state.validUntil > 3 * 3600 * 1000;
}

/**
 * 系统级主动联系闹钟保底规划器 (System Fallback Proactive Ping Planner)
 *
 * 当大模型本轮未自觉输出 [PING: ...] 标签时，由系统结合：
 * 1. 伴侣个性化主动频次档位 (frequent / balanced / calm / silent)；
 * 2. 三阶情感退避与 72h 断连休眠守卫；
 * 3. 用户最新话语中的情境暗示（洗澡/开会/上课/补觉）；
 * 4. 伴侣自身生活负荷 (occupied / away)；
 * 5. 深夜免打扰作息钳位 (支持伴侣独立 DND 与全局 DND)
 * 自动落盘下次主动联系时间，彻底杜绝“模型漏打标签即永久失联”！
 */
export function planFallbackProactivePing(params: {
  consecutiveUnreplied: number;
  lastUserInteractionAt: number | null | undefined;
  lastUserText?: string | null;
  livingState?: ImCompanionLivingState | null;
  now?: number;
  dndConfig?: EffectiveDndConfig | null;
  proactiveFrequencyGear?: ImProactiveFrequencyGear | null;
}): FallbackPingPlan | null {
  if (params.proactiveFrequencyGear === 'silent') {
    return null;
  }

  const now = params.now ?? Date.now();
  const pacing = evaluateProactivePacing(
    params.consecutiveUnreplied,
    params.lastUserInteractionAt,
    now
  );

  if (!pacing.allowHeartbeat) {
    return null;
  }

  let delayMs = pacing.suggestedDelayMs;
  let intent = '日常主动关心对方近况或自然分享此刻生活小事';

  // 若用户刚提到洗澡/开会/上课/睡觉等明确情境且为首轮未回，精准贴合情境时长
  if (params.consecutiveUnreplied === 0 && params.lastUserText) {
    const sit = detectSituationalDelay(params.lastUserText);
    if (sit) {
      delayMs = sit.delayMs;
      if (sit.scenario === 'bath') intent = '跟进对方洗完澡后的动向，依人设自然接话或关照';
      else if (sit.scenario === 'meeting') intent = '跟进对方开完会/忙完手头事宜的进展，依据人设自然交谈';
      else if (sit.scenario === 'study') intent = '跟进对方下课或自习结束后的动向，依人设自然交流';
      else if (sit.scenario === 'meal') intent = '跟进对方吃完饭后的动向，自然分享或闲聊';
      else if (sit.scenario === 'commute') intent = '跟进对方安全抵达目的地的动向，自然问询';
      else if (sit.scenario === 'sleep') intent = '留意对方睡醒动向，依人设轻声问候';
    }
  } else if (pacing.tier === 2) {
    intent = '隔了几个小时温和分享一件生活小事，不给回复压力';
  } else if (pacing.tier === 3) {
    intent = '新一天清晨轻声早安问候';
  }

  // 根据伴侣个性化主动频次档位微调延时
  if (params.proactiveFrequencyGear === 'frequent') {
    delayMs = Math.round(delayMs * 0.6);
  } else if (params.proactiveFrequencyGear === 'calm') {
    delayMs = Math.round(delayMs * 1.6);
  }

  let targetTimestamp = now + Math.max(15 * 60 * 1000, delayMs);

  // 若伴侣自身处于忙碌或脱手，推迟到忙完后 5 分钟
  if (
    params.livingState &&
    (params.livingState.activityLoad === 'occupied' || params.livingState.deviceAccess === 'away') &&
    params.livingState.validUntil > targetTimestamp
  ) {
    targetTimestamp = params.livingState.validUntil + 5 * 60 * 1000;
  }

  // 若目标时间落入免打扰期，自动对齐至次晨苏醒时间
  if (
    isTimeInSleepPeriod(targetTimestamp, params.dndConfig) ||
    params.livingState?.activityLoad === 'sleeping'
  ) {
    const baseMorning = getNextMorning730(targetTimestamp, params.dndConfig);
    const jitterMs = ((targetTimestamp % 35) + 5) * 60 * 1000;
    targetTimestamp = baseMorning + jitterMs;
    intent = '早安问候与新一天日常关心';
  }

  return {
    targetTimestamp,
    intent,
  };
}
