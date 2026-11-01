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

  let statusText = '手机放在手边，一边忙手头小事一边等你消息';
  let activityLoad: ImCompanionLivingState['activityLoad'] = 'free';

  if (h >= 6 && h < 9) {
    statusText = '刚泡了杯温热的美式提提神，顺便看看你醒了没';
  } else if (h >= 9 && h < 12) {
    statusText = '戴着耳机整理手头的事，手机屏幕一直亮在旁边';
  } else if (h >= 12 && h < 14) {
    statusText = '刚吃完午饭靠在椅背上放空，随时在线陪你闲聊';
  } else if (h >= 14 && h < 18) {
    statusText = '晒着下午的光线喝水歇口气，看到你的消息就秒回';
  } else if (h >= 18 && h < 21) {
    statusText = '傍晚慢悠悠歇下来了，正刷着手机等你的动静';
  } else if (h >= 21 && h < 24) {
    statusText = '窝在舒服的角落听着轻音乐，安安静静陪你待会儿';
  } else {
    statusText = '关了房间大灯靠在床头，困困地看着手机屏幕陪你';
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
      if (sit.scenario === 'bath') intent = '问问对方洗完澡没，顺便闲聊两句';
      else if (sit.scenario === 'meeting') intent = '关心对方开完会/忙完手头工作没';
      else if (sit.scenario === 'study') intent = '问问对方下课或自习结束没';
      else if (sit.scenario === 'meal') intent = '问问对方吃完饭没，吃的什么好吃的';
      else if (sit.scenario === 'commute') intent = '关心对方安全到地方了没';
      else if (sit.scenario === 'sleep') intent = '轻声问候对方睡醒恢复精神没';
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
