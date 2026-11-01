import type { ImCompanionLivingState } from '../types';
import {
  type EffectiveDndConfig,
  isTimestampInDnd,
  shiftTimestampPastDnd,
  DEFAULT_DND_CONFIG,
} from '../heartbeat/imDndGuard';

export interface NaturalTimeParseResult {
  targetTimestamp: number;
  delayMs: number;
  isSpecificClock: boolean;
  normalizedDesc: string;
  wasClampedToMorning: boolean;
}

// 模块级提升的正则常量 (js-hoist-regexp)
const RELATIVE_EN_REGEX = /^\+?(\d+)\s*([smhd])$/i;
const RELATIVE_CN_REGEX = /^\+?(\d+)\s*(秒|分钟|分|小时|天)(?:后)?$/;
const CN_TEXT_RELATIVE_REGEX = /^(半|一|两|两个|三|四个?|十|半个)\s*(小时|分钟|分)(?:后)?$/;

const FUZZY_ANCHOR_REGEX = /^(今晚|夜里|明早|明天早上|次日早上|明儿早|明天中午|次日中午|明天下午|次日下午|明晚|明天晚上|次日晚上|后天早上|后天下午|后天晚上)$/;
const SPECIFIC_CLOCK_PREFIX_REGEX = /^(后天|大后天|明早|明天|次日|今晚|下午|上午)?\s*(\d{1,2})[:：](\d{2})$/;
const CN_CLOCK_TEXT_REGEX = /^(后天|大后天|明早|明天|次日|今晚|下午|上午)?\s*(\d{1,2}|一|两|二|三|四|五|六|七|八|九|十|十一|十二)\s*点(?:半|([0-5]?\d)分?)?$/;
const WEEKDAY_PREFIX_REGEX = /^(这周|本周|下周)?(周[一二三四五六日天]|星期[一二三四五六日天])\s*(早上|上午|中午|下午|晚上|夜里)?(?:\s*(\d{1,2})[:：点](\d{2})?)?$/;
const MULTI_SPACE_REGEX = /\s+/g;

const CN_NUM_MAP: Record<string, number> = {
  一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12,
};

const WEEKDAY_INDEX_MAP: Record<string, number> = {
  周日: 0, 周天: 0, 星期日: 0, 星期天: 0,
  周一: 1, 星期一: 1,
  周二: 2, 星期二: 2,
  周三: 3, 星期三: 3,
  周四: 4, 星期四: 4,
  周五: 5, 星期五: 5,
  周六: 6, 星期六: 6,
};

const FALLBACK_DND: EffectiveDndConfig = {
  enabled: true,
  startTime: '23:00',
  endTime: '07:30',
  source: 'default',
};

function safeIsTimestampInDnd(ts: number, dnd: EffectiveDndConfig): boolean {
  if (typeof isTimestampInDnd === 'function') {
    return isTimestampInDnd(ts, dnd);
  }
  if (!dnd || !dnd.enabled) return false;
  const d = new Date(ts);
  const min = d.getHours() * 60 + d.getMinutes();
  return min >= 23 * 60 || min < 7 * 60 + 30;
}

function safeShiftTimestampPastDnd(ts: number, dnd: EffectiveDndConfig, jitter = 15): number {
  if (typeof shiftTimestampPastDnd === 'function') {
    return shiftTimestampPastDnd(ts, dnd, jitter);
  }
  const d = new Date(ts);
  d.setHours(7, 30, 0, 0);
  if (d.getTime() <= ts) d.setDate(d.getDate() + 1);
  return d.getTime() + jitter * 60000;
}

/**
 * 将口语化、相对或绝对时间表达式高韧性解析为绝对时间戳，并结合双层作息免打扰进行自校准 (Clamping)
 */
export function parseNaturalTimeToTimestamp(
  rawInput: string,
  now: number = Date.now(),
  livingState?: ImCompanionLivingState,
  dndConfig?: EffectiveDndConfig | null
): NaturalTimeParseResult {
  const trimmed = (rawInput || '').trim().replace(MULTI_SPACE_REGEX, ' ');
  let targetTimestamp: number | null = null;
  let isSpecificClock = false;
  let normalizedDesc = trimmed;

  const nowDate = new Date(now);

  // 1. 相对英文简写: +20s, +45m, +2h, +1d, 45m
  const enMatch = trimmed.match(RELATIVE_EN_REGEX);
  if (enMatch && enMatch[1] && enMatch[2]) {
    const val = parseInt(enMatch[1], 10);
    const unit = enMatch[2].toLowerCase();
    let ms = 60000;
    if (unit === 's') ms = val * 1000;
    else if (unit === 'm') ms = val * 60 * 1000;
    else if (unit === 'h') ms = val * 3600 * 1000;
    else if (unit === 'd') ms = val * 86400 * 1000;
    targetTimestamp = now + ms;
  }

  // 2. 相对中文带数字: +45分钟, 45分钟后, 2小时后, +2小时
  if (!targetTimestamp) {
    const cnMatch = trimmed.match(RELATIVE_CN_REGEX);
    if (cnMatch && cnMatch[1] && cnMatch[2]) {
      const val = parseInt(cnMatch[1], 10);
      const unit = cnMatch[2];
      let ms = 60000;
      if (unit === '秒') ms = val * 1000;
      else if (unit === '分钟' || unit === '分') ms = val * 60 * 1000;
      else if (unit === '小时') ms = val * 3600 * 1000;
      else if (unit === '天') ms = val * 86400 * 1000;
      targetTimestamp = now + ms;
    }
  }

  // 3. 中文口语词: 半小时后, 一小时后, 两个小时后, 十分钟后
  if (!targetTimestamp) {
    const textMatch = trimmed.match(CN_TEXT_RELATIVE_REGEX);
    if (textMatch && textMatch[1] && textMatch[2]) {
      const numStr = textMatch[1];
      const unit = textMatch[2];
      let val = 1;
      if (numStr === '半' || numStr === '半个') val = 0.5;
      else if (numStr === '一') val = 1;
      else if (numStr === '两' || numStr === '两个') val = 2;
      else if (numStr === '三') val = 3;
      else if (numStr.startsWith('四')) val = 4;
      else if (numStr === '十') val = 10;

      const ms = unit.startsWith('分') ? val * 60 * 1000 : val * 3600 * 1000;
      targetTimestamp = now + ms;
    }
  }

  // 4. 模糊时段锚点映射
  if (!targetTimestamp) {
    const fuzzyMatch = trimmed.match(FUZZY_ANCHOR_REGEX);
    if (fuzzyMatch && fuzzyMatch[1]) {
      isSpecificClock = true;
      const anchor = fuzzyMatch[1];
      const target = new Date(now);

      if (anchor === '今晚' || anchor === '夜里') {
        target.setHours(22, 0, 0, 0);
        if (target.getTime() <= now + 30 * 60 * 1000) {
          targetTimestamp = now + 45 * 60 * 1000;
        } else {
          targetTimestamp = target.getTime();
        }
      } else if (anchor === '明早' || anchor === '明天早上' || anchor === '次日早上' || anchor === '明儿早') {
        target.setDate(target.getDate() + 1);
        target.setHours(8, 30, 0, 0);
        targetTimestamp = target.getTime();
      } else if (anchor === '明天中午' || anchor === '次日中午') {
        target.setDate(target.getDate() + 1);
        target.setHours(12, 30, 0, 0);
        targetTimestamp = target.getTime();
      } else if (anchor === '明天下午' || anchor === '次日下午') {
        target.setDate(target.getDate() + 1);
        target.setHours(15, 0, 0, 0);
        targetTimestamp = target.getTime();
      } else if (anchor === '明晚' || anchor === '明天晚上' || anchor === '次日晚上') {
        target.setDate(target.getDate() + 1);
        target.setHours(20, 30, 0, 0);
        targetTimestamp = target.getTime();
      } else if (anchor === '后天早上') {
        target.setDate(target.getDate() + 2);
        target.setHours(8, 30, 0, 0);
        targetTimestamp = target.getTime();
      } else if (anchor === '后天下午') {
        target.setDate(target.getDate() + 2);
        target.setHours(15, 0, 0, 0);
        targetTimestamp = target.getTime();
      } else if (anchor === '后天晚上') {
        target.setDate(target.getDate() + 2);
        target.setHours(20, 30, 0, 0);
        targetTimestamp = target.getTime();
      }
    }
  }

  // 5. 中文钟点表达: 明早8点半, 今晚10点, 下午3点20, 后天10点
  if (!targetTimestamp) {
    const cnClockMatch = trimmed.match(CN_CLOCK_TEXT_REGEX);
    if (cnClockMatch && cnClockMatch[2]) {
      isSpecificClock = true;
      const prefix = cnClockMatch[1] || '';
      const rawHour = cnClockMatch[2];
      let hh = CN_NUM_MAP[rawHour] ?? parseInt(rawHour, 10);
      let mm = 0;
      if (trimmed.includes('半')) {
        mm = 30;
      } else if (cnClockMatch[3]) {
        mm = parseInt(cnClockMatch[3], 10);
      }

      if ((prefix === '下午' || prefix === '今晚') && hh < 12) {
        hh += 12;
      }

      const target = new Date(now);
      target.setHours(hh, mm, 0, 0);

      if (prefix === '明早' || prefix === '明天' || prefix === '次日') {
        target.setDate(target.getDate() + 1);
      } else if (prefix === '后天') {
        target.setDate(target.getDate() + 2);
      } else if (prefix === '大后天') {
        target.setDate(target.getDate() + 3);
      } else if (target.getTime() <= now) {
        target.setDate(target.getDate() + 1);
      }
      targetTimestamp = target.getTime();
    }
  }

  // 6. 具体钟点表达式: 22:30, 明早08:30, 后天15:00
  if (!targetTimestamp) {
    const clockMatch = trimmed.match(SPECIFIC_CLOCK_PREFIX_REGEX);
    if (clockMatch && clockMatch[2] && clockMatch[3]) {
      isSpecificClock = true;
      const prefix = clockMatch[1] || '';
      let hh = parseInt(clockMatch[2], 10);
      const mm = parseInt(clockMatch[3], 10);

      if (prefix === '下午' && hh < 12) {
        hh += 12;
      }

      const target = new Date(now);
      target.setHours(hh, mm, 0, 0);

      if (prefix === '明早' || prefix === '明天' || prefix === '次日') {
        target.setDate(target.getDate() + 1);
      } else if (prefix === '后天') {
        target.setDate(target.getDate() + 2);
      } else if (prefix === '大后天') {
        target.setDate(target.getDate() + 3);
      } else if (target.getTime() <= now) {
        target.setDate(target.getDate() + 1);
      }
      targetTimestamp = target.getTime();
    }
  }

  // 7. 星期口语表达: 周五晚上, 下周三上午, 这周六下午
  if (!targetTimestamp) {
    const weekMatch = trimmed.match(WEEKDAY_PREFIX_REGEX);
    if (weekMatch && weekMatch[2]) {
      isSpecificClock = true;
      const weekWeekPrefix = weekMatch[1] || '这周';
      const weekdayStr = weekMatch[2];
      const timeOfDay = weekMatch[3] || '下午';
      const targetDayIndex = WEEKDAY_INDEX_MAP[weekdayStr] ?? 1;

      const target = new Date(now);
      const currentDayIndex = target.getDay();
      let dayDelta = targetDayIndex - currentDayIndex;

      if (weekWeekPrefix === '下周') {
        dayDelta += 7;
      } else if (dayDelta <= 0) {
        dayDelta += 7;
      }

      target.setDate(target.getDate() + dayDelta);

      let hh = 15;
      let mm = 0;
      if (weekMatch[4]) {
        hh = parseInt(weekMatch[4], 10);
        if (weekMatch[5]) mm = parseInt(weekMatch[5], 10);
      } else {
        if (timeOfDay === '早上' || timeOfDay === '上午') hh = 9;
        else if (timeOfDay === '中午') hh = 12;
        else if (timeOfDay === '下午') hh = 15;
        else if (timeOfDay === '晚上' || timeOfDay === '夜里') hh = 20;
      }

      target.setHours(hh, mm, 0, 0);
      targetTimestamp = target.getTime();
    }
  }

  // 8. 兜底保护：若无法识别，默认 60 分钟后
  if (!targetTimestamp || isNaN(targetTimestamp)) {
    targetTimestamp = now + 60 * 60 * 1000;
    normalizedDesc = '+60m';
  }

  // 9. 边界钳位：最小 10 秒，最大 7 天
  const minTimestamp = now + 10 * 1000;
  const maxTimestamp = now + 7 * 86400 * 1000;
  targetTimestamp = Math.max(minTimestamp, Math.min(maxTimestamp, targetTimestamp));

  let delayMs = targetTimestamp - now;

  // 10. 伴侣作息自校准 (DND & Living State Clamping):
  // 若目标时间落在免打扰区间 (单伴侣自定义 > 全局设置 > 默认 23:00~07:30) 且为跨时段 (> 30 分钟) 任务：
  // 顺延至清晨醒来后发送，避免惊扰
  let wasClampedToMorning = false;
  if (delayMs > 30 * 60 * 1000) {
    const effectiveDnd = dndConfig || DEFAULT_DND_CONFIG || FALLBACK_DND;
    if (safeIsTimestampInDnd(targetTimestamp, effectiveDnd) || livingState?.activityLoad === 'sleeping') {
      targetTimestamp = safeShiftTimestampPastDnd(targetTimestamp, effectiveDnd, 0);
      delayMs = targetTimestamp - now;
      wasClampedToMorning = true;
      normalizedDesc = `次日 ${effectiveDnd.endTime || '07:30'} (已结合人设作息自校准)`;
    }
  }

  return {
    targetTimestamp,
    delayMs,
    isSpecificClock,
    normalizedDesc,
    wasClampedToMorning,
  };
}

/**
 * 判定指定时间戳是否落在免打扰或睡眠区间
 */
export function isTimeInSleepPeriod(time: number = Date.now(), dndConfig?: EffectiveDndConfig | null): boolean {
  const dnd = dndConfig || DEFAULT_DND_CONFIG || FALLBACK_DND;
  return safeIsTimestampInDnd(time, dnd);
}

/**
 * 获取最近的次晨免打扰结束苏醒时间戳
 */
export function getNextMorning730(time: number = Date.now(), dndConfig?: EffectiveDndConfig | null): number {
  const dnd = dndConfig || DEFAULT_DND_CONFIG || FALLBACK_DND;
  return safeShiftTimestampPastDnd(time, dnd, 0);
}
