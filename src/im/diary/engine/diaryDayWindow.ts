/**
 * 伴侣手账日记本地时区窗口与对话清洗引擎 (DiaryDayWindow)
 * 彻底解决 UTC 日期与本地时区 (UTC+8) 凌晨 00:00~08:00 错位把今天记到昨天的缺陷，
 * 并提供高质量、无非对话杂音的真实交互语料筛选。
 */

export interface LocalDayRange {
  dateStr: string; // YYYY-MM-DD
  startUtcMs: number;
  endUtcMs: number;
  startIso: string;
  endIso: string;
}

/**
 * 获取本地时间的 YYYY-MM-DD 字符串 (杜绝 toISOString 导致的 UTC 错位)
 */
export function toLocalDateStr(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 根据 YYYY-MM-DD 解析出本地当天的起止绝对时间戳与 ISO 字符串
 */
export function getLocalDayRange(dateStr: string): LocalDayRange {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10) || new Date().getFullYear();
  const month = parseInt(parts[1], 10) || (new Date().getMonth() + 1);
  const day = parseInt(parts[2], 10) || new Date().getDate();

  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);

  return {
    dateStr,
    startUtcMs: start.getTime(),
    endUtcMs: end.getTime(),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

const TAG_STRIP_REGEX = /\[(STATUS|NEXT_FOLLOWUP|STAGE_FOLLOWUP|HEARTBEAT|PING|NUDGE):[^\]]+\]|\[PASS\]|\[NUDGE\]/gi;

/**
 * 清洗并提取手账日记专属的对话语料：
 * 1. 过滤系统通知、日记卡片、拍一拍等非对话消息；
 * 2. 剥离模型内部协议标签；
 * 3. 超长对话智能保留精彩首尾，中间紧凑抽样。
 */
export function selectDiaryDialogue(
  messages: Array<{ role: string; content: string; type?: string; createdAt?: string }>,
  budgetChars: number = 3600
): string {
  if (!messages || messages.length === 0) return '';

  const validDialogue: Array<{ role: string; content: string }> = [];

  for (const msg of messages) {
    if (msg.type === 'diary_card' || msg.type === 'notice' || msg.type === 'system') {
      continue;
    }

    let clean = (msg.content || '').replace(TAG_STRIP_REGEX, '').trim();
    if (!clean || clean.startsWith('{"type":"diary_card"') || clean.startsWith('[系统提示:')) {
      continue;
    }

    validDialogue.push({
      role: msg.role === 'user' ? '用户' : '伴侣',
      content: clean,
    });
  }

  if (validDialogue.length === 0) return '';

  const formatLine = (item: { role: string; content: string }) => `${item.role}: ${item.content}`;
  const totalLength = validDialogue.reduce((sum, item) => sum + item.content.length, 0);

  if (totalLength <= budgetChars) {
    return validDialogue.map(formatLine).join('\n');
  }

  // 对话超长时：保留前 30% 对话 (开端起意) + 后 50% 对话 (最新心境)
  const headCount = Math.max(3, Math.floor(validDialogue.length * 0.3));
  const tailCount = Math.max(5, Math.floor(validDialogue.length * 0.5));

  const head = validDialogue.slice(0, headCount).map(formatLine);
  const tail = validDialogue.slice(-tailCount).map(formatLine);

  return `${head.join('\n')}\n... (中间日常互动已精炼沉淀) ...\n${tail.join('\n')}`;
}
