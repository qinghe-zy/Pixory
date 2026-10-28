import type { ActivityLoad, PrivacyContext, DeviceAccess } from '../types';

export interface ParsedStatusTag {
  statusText: string;
  activityLoad?: ActivityLoad;
  privacyContext?: PrivacyContext;
  deviceAccess?: DeviceAccess;
  alterDelta?: number;
}

export interface ParsedHeartbeatTag {
  delayMs: number;
  message: string;
}

/**
 * 解析大模型返回的 [STATUS: 动作描述 | load=... | privacy=... | device=... | alter=...]
 */
export function parseStatusTag(text: string): ParsedStatusTag | null {
  const match = text.match(/\[STATUS:\s*([^\]]+)\]/i);
  if (!match) return null;
  const inner = match[1].trim();
  const parts = inner.split('|').map((p) => p.trim());
  const statusText = parts[0] || '在线';
  const result: ParsedStatusTag = { statusText };

  for (let i = 1; i < parts.length; i++) {
    const [rawKey, rawVal] = parts[i].split('=').map((s) => s.trim().toLowerCase());
    if (rawKey === 'load' && (rawVal === 'free' || rawVal === 'occupied' || rawVal === 'sleeping')) {
      result.activityLoad = rawVal;
    } else if (rawKey === 'privacy' && (rawVal === 'private' || rawVal === 'public')) {
      result.privacyContext = rawVal;
    } else if (rawKey === 'device' && (rawVal === 'available' || rawVal === 'limited' || rawVal === 'away')) {
      result.deviceAccess = rawVal;
    } else if (rawKey === 'alter') {
      const delta = parseInt(rawVal, 10);
      if (!isNaN(delta)) {
        result.alterDelta = Math.max(-1, Math.min(1, delta));
      }
    }
  }
  return result;
}

/**
 * 解析 [HEARTBEAT: delay | message] 预埋气泡信封
 */
export function parseHeartbeatTag(text: string): ParsedHeartbeatTag | null {
  const match = text.match(/\[HEARTBEAT:\s*([^|\]]+)\|\s*([^\]]+)\]/i);
  if (!match) return null;
  const rawDelay = match[1].trim().toLowerCase();
  const message = match[2].trim();
  let delayMs = 15 * 60 * 1000;

  if (rawDelay.endsWith('m')) {
    delayMs = Math.max(1, parseInt(rawDelay, 10)) * 60 * 1000;
  } else if (rawDelay.endsWith('h')) {
    delayMs = Math.max(1, parseInt(rawDelay, 10)) * 3600 * 1000;
  } else if (rawDelay.endsWith('s')) {
    delayMs = Math.max(1, parseInt(rawDelay, 10)) * 1000;
  } else {
    const num = parseInt(rawDelay, 10);
    if (!isNaN(num)) delayMs = num * 60 * 1000;
  }

  return { delayMs, message };
}

/**
 * ScriptCommit 出站自洽守卫
 *
 * 核心规则：
 * 1. 若伴侣进入 sleeping，丢弃近期心跳（或推迟至次晨），杜绝“刚说睡了 15 分钟后又发消息”；
 * 2. 若伴侣处于 occupied 或 away，强制 heartBeat.delayMs >= (validUntil - now)，确保忙完后才联系。
 */
export function validateHeartbeatConsistency(
  heartbeat: ParsedHeartbeatTag | null,
  livingState: { activityLoad: ActivityLoad; deviceAccess: DeviceAccess; validUntil: number },
  now: number = Date.now()
): ParsedHeartbeatTag | null {
  if (!heartbeat) return null;

  // 1. 睡觉期间拦截丢弃近期心跳
  if (livingState.activityLoad === 'sleeping') {
    return null;
  }

  // 2. 忙碌或脱手状态，必须等任务自然结束后才触发
  const remainingBusyMs = Math.max(0, livingState.validUntil - now);
  if (
    (livingState.activityLoad === 'occupied' || livingState.deviceAccess === 'away') &&
    remainingBusyMs > 0
  ) {
    if (heartbeat.delayMs < remainingBusyMs) {
      return {
        ...heartbeat,
        delayMs: remainingBusyMs + 5 * 60 * 1000, // 忙完后 5 分钟联系
      };
    }
  }

  return heartbeat;
}
