export type SystemTimeResult = { text: string; timeZone: string; sampledAt: string; stages: string[] };

export function buildSystemAssistantClockContext(now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const local = new Intl.DateTimeFormat('zh-CN', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(now);
  return `【本轮设备时间】${local}；时区 ${timeZone}；UTC ${now.toISOString()}。以本轮采样为准，不是联网校时。`;
}

const CITY_TIME_ZONES: ReadonlyArray<readonly [RegExp, string, string]> = [
  [/北京|上海|中国|北京时间/, 'Asia/Shanghai', '北京'],
  [/香港/, 'Asia/Hong_Kong', '香港'], [/台北|台湾/, 'Asia/Taipei', '台北'],
  [/东京|日本/, 'Asia/Tokyo', '东京'], [/首尔|韩国/, 'Asia/Seoul', '首尔'],
  [/新加坡/, 'Asia/Singapore', '新加坡'], [/伦敦|英国/, 'Europe/London', '伦敦'],
  [/巴黎|法国/, 'Europe/Paris', '巴黎'], [/柏林|德国/, 'Europe/Berlin', '柏林'],
  [/纽约/, 'America/New_York', '纽约'], [/洛杉矶/, 'America/Los_Angeles', '洛杉矶'],
  [/悉尼/, 'Australia/Sydney', '悉尼'], [/墨尔本/, 'Australia/Melbourne', '墨尔本'],
  [/迪拜/, 'Asia/Dubai', '迪拜'], [/孟买|新德里|印度/, 'Asia/Kolkata', '印度'],
];

export function resolveSystemAssistantTimeRequest(request: string, now = new Date(), localTimeZone?: string): SystemTimeResult | null {
  const text = request.trim();
  if (text.length > 100 || /创建|角色|提醒|闹钟|天气|搜索|查证|过去|昨天|明天|如果|例如|[“"「`]/.test(text)) return null;
  const wantsTime = /(?:现在|当前|此刻|当地|时间|时区|几点|日期|几号|星期几|周几)/.test(text)
    && /几点|几号|星期几|周几|(?:现在|当前|今天|此刻).{0,12}(?:时间|日期)|(?:查|告诉|看).{0,12}(?:时间|日期)|时间[？?]?\s*$/.test(text);
  if (!wantsTime) return null;
  const local = localTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const matches = CITY_TIME_ZONES.filter(([pattern]) => pattern.test(text));
  const explicit = text.match(/\b(?:Africa|America|Antarctica|Asia|Atlantic|Australia|Europe|Indian|Pacific)\/[A-Za-z_]+(?:\/[A-Za-z_]+)?\b/)?.[0];
  const offsetTokens = text.match(/\b(?:UTC|GMT)(?:[+-][A-Za-z0-9:._]*)?(?![A-Za-z0-9_])/gi) ?? [];
  const offsets = offsetTokens[0]?.match(/^(?:UTC|GMT)(?:([+-])(\d{1,2})(?::?(\d{2}))?)?$/i);
  if (offsetTokens.length && !offsets) {
    return { text: '请提供有效时区，例如 UTC+08:00。', timeZone: local, sampledAt: now.toISOString(), stages: ['时区无效'] };
  }
  if (new Set(matches.map(([, zone]) => zone)).size > 1 || offsetTokens.length > 1
    || offsets && (explicit || matches.length) || /美国|加拿大|俄罗斯/.test(text) && !matches.length && !explicit) {
    return { text: '要查询哪个城市的时间？', timeZone: local, sampledAt: now.toISOString(), stages: ['等待选择时区'] };
  }
  let zone = explicit ?? matches[0]?.[1] ?? local;
  let label = explicit ?? matches[0]?.[2] ?? '当地';
  let sample = now;
  if (offsets) {
    const hours = Number(offsets[2] ?? 0);
    const minutes = Number(offsets[3] ?? 0);
    if (hours > 14 || minutes > 59 || hours === 14 && minutes !== 0) {
      return { text: '请提供有效时区，例如 UTC+08:00。', timeZone: local, sampledAt: now.toISOString(), stages: ['时区无效'] };
    }
    const offsetMinutes = (hours * 60 + minutes) * (offsets[1] === '-' ? -1 : 1);
    sample = new Date(now.getTime() + offsetMinutes * 60_000);
    label = offsets[0].toUpperCase();
    zone = 'UTC';
  } else if (!explicit && !matches.length
    && text.replace(/(?:请|帮我|麻烦|告诉我|查一下|查询|查看|查|看看|看一下|我想知道|一下|的|是|现在|当前|此刻|今天|当地|本地|我的|这里|时间|日期|时区|几点|几号|星期几|周几|多少|什么|了|呢|啊|吗|呀|[？?，,。！!\s])/g, '')) {
    return { text: '请提供城市对应的标准时区，例如 Europe/Paris。', timeZone: local, sampledAt: now.toISOString(), stages: ['等待选择时区'] };
  }
  try {
    const value = new Intl.DateTimeFormat('zh-CN', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).format(sample);
    return { text: `${label}：${value}${offsets ? '' : `（${zone}）`}`,
      timeZone: offsets ? label : zone, sampledAt: now.toISOString(), stages: ['读取设备时间', '核对时区', '时间已查询'] };
  } catch {
    return { text: '无法识别这个时区，请提供标准时区名称。', timeZone: zone,
      sampledAt: now.toISOString(), stages: ['时区无效'] };
  }
}
