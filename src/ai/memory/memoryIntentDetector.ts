import type { MemoryIntent } from './memoryTypes';

export interface MemoryIntentObservation {
  intent: MemoryIntent;
  explicitUserAction: boolean;
  targetText: string | null;
  payload: Record<string, unknown>;
}

const ACTION_PATTERNS: Array<{ intent: MemoryIntent; pattern: RegExp }> = [
  { intent: 'forget', pattern: /(?:忘掉|忘记|别记|不要记住).{0,100}/u },
  { intent: 'forget', pattern: /(?:清除|删除).{0,60}(?:记忆|你记得的|我的偏好|关于我的信息)/u },
  { intent: 'correction', pattern: /(?:纠正|更正|改成).{2,100}/u },
  { intent: 'correction', pattern: /(?:之前|刚才).{0,50}(?:说错了?|说得不对|不是).{0,80}/u },
  { intent: 'correction', pattern: /不是.{1,60}而是.{1,60}|不再.{1,80}/u },
  { intent: 'safety', pattern: /(?:过敏|禁忌|不能接触|不要给我|安全边界).{1,100}/u },
  { intent: 'confirm', pattern: /(?:记住|请记住|以后默认|默认都).{2,100}/u },
  { intent: 'recall', pattern: /(?:你还记得|记得我|我之前说过|刚才说的).{1,80}/u },
];

export function detectMemoryIntent(message: string): MemoryIntentObservation {
  const normalized = message.replace(/\s+/gu, ' ').trim();
  if (!normalized) {
    return { explicitUserAction: false, intent: 'none', payload: {}, targetText: null };
  }
  const match = ACTION_PATTERNS.find((candidate) => candidate.pattern.test(normalized));
  if (!match) {
    return { explicitUserAction: false, intent: 'none', payload: {}, targetText: null };
  }
  const targetText = normalized.slice(0, 180);
  return {
    explicitUserAction: match.intent !== 'recall',
    intent: match.intent,
    payload: {
      detectorVersion: 'intent-v1',
    },
    targetText,
  };
}

export const MemoryIntentDetector = {
  detect: detectMemoryIntent,
};
