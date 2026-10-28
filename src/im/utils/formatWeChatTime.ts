/**
 * 微信经典时间格式化算法 (WeChat Authentic Time Formatter)
 *
 * 核心规范：
 * 严格以当地自然日 00:00:00 为分界线。
 *
 * 支持两种模式：
 * - 'list': 侧边栏通讯录 / 会话流列表模式
 * - 'chat': 右侧聊天窗口模式
 *
 * 规则矩阵：
 * 1. 今天 (自然日当天)：
 *    - list: HH:mm
 *    - chat: HH:mm
 * 2. 昨天 (上一个自然日)：
 *    - list: 昨天
 *    - chat: 昨天 HH:mm
 * 3. 7天内 (大前天起至 7 个自然日内)：
 *    - list: 星期X
 *    - chat: 星期X HH:mm
 * 4. 今年内 (大于等于 7 个自然日且同年)：
 *    - list: M月D日
 *    - chat: M月D日 HH:mm
 * 5. 跨年 (非同年)：
 *    - list: YYYY-MM-DD
 *    - chat: YYYY年M月D日 HH:mm
 */

export type WeChatTimeMode = 'list' | 'chat';

const WEEK_DAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'] as const;

export function formatWeChatTime(
  timestamp: string | number | Date | null | undefined,
  mode: WeChatTimeMode = 'list',
  referenceNow?: number | Date
): string {
  if (!timestamp) return '';

  const target = new Date(timestamp);
  if (isNaN(target.getTime())) return '';

  const current = referenceNow ? new Date(referenceNow) : new Date();

  // 以本地自然日 00:00:00 零点进行绝对对齐
  const todayStart = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  const targetDayStart = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();

  // 计算相差自然日（未来时间归零容错）
  const dayDiff = Math.max(0, Math.round((todayStart - targetDayStart) / (24 * 60 * 60 * 1000)));

  const pad2 = (n: number) => n.toString().padStart(2, '0');
  const hhmm = `${pad2(target.getHours())}:${pad2(target.getMinutes())}`;
  const month = target.getMonth() + 1;
  const date = target.getDate();
  const year = target.getFullYear();

  // 1. 今天
  if (dayDiff === 0) {
    return hhmm;
  }

  // 2. 昨天
  if (dayDiff === 1) {
    return mode === 'list' ? '昨天' : `昨天 ${hhmm}`;
  }

  // 3. 7天内
  if (dayDiff < 7) {
    const weekStr = WEEK_DAYS[target.getDay()] || '星期一';
    return mode === 'list' ? weekStr : `${weekStr} ${hhmm}`;
  }

  // 4. 今年内
  if (year === current.getFullYear()) {
    return mode === 'list' ? `${month}月${date}日` : `${month}月${date}日 ${hhmm}`;
  }

  // 5. 跨年
  const yyyymmdd = `${year}-${pad2(month)}-${pad2(date)}`;
  return mode === 'list' ? yyyymmdd : `${year}年${month}月${date}日 ${hhmm}`;
}
