/**
 * Proactive Timing Evaluator (伴侣自主追聊与时钟感知决策机)
 *
 * 核心能力：
 * 1. 情境化时长解析 (开会、洗澡、做饭、自习、通勤、午休等场景智能映射)；
 * 2. 大模型自主决断解析 ([REPLY: ...] / [NEXT_FOLLOWUP: 1m] / [STAGE_FOLLOWUP: 45m | 留言] / [PASS])；
 * 3. 两段式追聊状态时钟机 (Stage 1: 1分钟静默判定 -> Stage 2: 追问后再次1分钟静默二次留白决断)。
 */

export interface SituationalDelayResult {
  delayMs: number;
  scenario: 'meeting' | 'bath' | 'meal' | 'study' | 'commute' | 'sleep';
  suggestedHook?: string;
}

export interface ProactiveDecisionResult {
  action: 'immediate_reply' | 'stage_future' | 'pass';
  cleanText?: string;
  nextFollowupMs?: number;
  stagedDelayMs?: number;
  stagedText?: string;
  nudgeAction?: string | null;
  reason?: string;
}

// 模块级提升的正则常量 (js-hoist-regexp)
const CN_DURATION_REGEX = /^(\d+)\s*(秒|分钟|分|小时|天)$/;
const EN_DURATION_REGEX = /^(\d+)\s*([smhd])$/;

const SCENARIO_MEETING_REGEX = /(开会|晨会|周会|例会|汇报工作|面谈)/i;
const SCENARIO_BATH_REGEX = /(去洗澡|洗个澡|冲个澡|去冲凉|冲凉去|洗头发)/i;
const SCENARIO_MEAL_REGEX = /(去做饭|去煮面|去炒菜|下厨|去吃午饭|去吃晚饭|吃饭去啦|吃饭去了)/i;
const SCENARIO_STUDY_REGEX = /(去自习|上课去|写作业|去图书馆|刷题|复习去)/i;
const SCENARIO_COMMUTE_REGEX = /(在开车|在赶路|进地铁|坐公交|路上堵车|准备出发)/i;
const SCENARIO_SLEEP_REGEX = /(去睡午觉|午休一下|小眯一会儿|补个觉|躺会儿)/i;

const STAGE_FOLLOWUP_TAG_REGEX = /\[STAGE_FOLLOWUP:\s*([^\|\]]+)\|\s*([^\]]+)\]/i;
const NEXT_FOLLOWUP_TAG_REGEX = /\[NEXT_FOLLOWUP:\s*([^\]]+)\]/i;
const NUDGE_TAG_REGEX = /\[NUDGE:\s*([^\]]+)\]/i;
const SYSTEM_TAGS_STRIP_REGEX = /\[(NEXT_FOLLOWUP|NUDGE|STATUS):[^\]]+\]/gi;

/**
 * 将口语化或标准时间字符串解析为毫秒数
 * 支持: "1m", "45m", "2h", "1d", "60s", "30秒", "1分钟", "45分钟", "2小时", "pass", "none", "0"
 */
export function parseDelayStringToMs(delayStr: string): number {
  if (!delayStr) return 60000;
  const trimmed = delayStr.trim().toLowerCase();

  // 0. 特殊静默/放弃指令
  if (
    trimmed === 'pass' ||
    trimmed === 'none' ||
    trimmed === 'skip' ||
    trimmed === '0' ||
    trimmed === 'no' ||
    trimmed === '否' ||
    trimmed === '不需要' ||
    trimmed === '不用'
  ) {
    return 0;
  }

  // 1. 中文描述匹配
  const cnMatch = trimmed.match(CN_DURATION_REGEX);
  if (cnMatch && cnMatch[1] && cnMatch[2]) {
    const val = parseInt(cnMatch[1], 10);
    const unit = cnMatch[2];
    if (unit === '秒') return Math.max(10000, val * 1000);
    if (unit === '分钟' || unit === '分') return Math.max(30000, val * 60 * 1000);
    if (unit === '小时') return val * 3600 * 1000;
    if (unit === '天') return val * 86400 * 1000;
  }

  // 2. 简写英文字符匹配
  const enMatch = trimmed.match(EN_DURATION_REGEX);
  if (enMatch && enMatch[1] && enMatch[2]) {
    const val = parseInt(enMatch[1], 10);
    const unit = enMatch[2];
    if (unit === 's') return Math.max(10000, val * 1000);
    if (unit === 'm') return Math.max(30000, val * 60 * 1000);
    if (unit === 'h') return val * 3600 * 1000;
    if (unit === 'd') return val * 86400 * 1000;
  }

  // 纯数字当做秒或分钟 (<= 120 视作分钟，否则视作毫秒)
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num > 0) {
    if (num <= 120) return num * 60 * 1000;
    return num;
  }

  return 60000; // 默认 1 分钟
}

/**
 * 检测用户近邻消息中是否包含典型具有时长情境的行为（如洗澡、开会）
 */
export function detectSituationalDelay(userText: string): SituationalDelayResult | null {
  if (!userText || typeof userText !== 'string') return null;

  // 开会场景 (默认 45 分钟)
  if (SCENARIO_MEETING_REGEX.test(userText)) {
    return {
      delayMs: 45 * 60 * 1000,
      scenario: 'meeting',
      suggestedHook: '开完会了吗？辛苦啦~',
    };
  }

  // 洗澡场景 (默认 30 分钟)
  if (SCENARIO_BATH_REGEX.test(userText)) {
    return {
      delayMs: 30 * 60 * 1000,
      scenario: 'bath',
      suggestedHook: '洗好吹干头发了吗~？',
    };
  }

  // 烹饪/用餐场景 (默认 40 分钟)
  if (SCENARIO_MEAL_REGEX.test(userText)) {
    return {
      delayMs: 40 * 60 * 1000,
      scenario: 'meal',
      suggestedHook: '吃饱饱了吗？味道怎么样呀？',
    };
  }

  // 自习/上课场景 (默认 60 分钟)
  if (SCENARIO_STUDY_REGEX.test(userText)) {
    return {
      delayMs: 60 * 60 * 1000,
      scenario: 'study',
      suggestedHook: '学累了吗？记得喝口水休息下眼睛哦',
    };
  }

  // 通勤/赶路场景 (默认 35 分钟)
  if (SCENARIO_COMMUTE_REGEX.test(userText)) {
    return {
      delayMs: 35 * 60 * 1000,
      scenario: 'commute',
      suggestedHook: '顺利到达目的地了吗？注意安全呀',
    };
  }

  // 午休/补觉场景 (默认 90 分钟)
  if (SCENARIO_SLEEP_REGEX.test(userText)) {
    return {
      delayMs: 90 * 60 * 1000,
      scenario: 'sleep',
      suggestedHook: '睡醒了吗？感觉精力恢复了没~',
    };
  }

  return null;
}

/**
 * 解析大模型返回的追聊决策与时间标签
 */
export function parseProactiveDecision(rawText: string): ProactiveDecisionResult {
  if (!rawText || typeof rawText !== 'string') {
    return { action: 'pass', reason: 'empty_output' };
  }

  const trimmed = rawText.trim();

  // 1. 若大模型自主判定当前不宜打扰
  if (trimmed.startsWith('[PASS]') || trimmed.includes('[PASS]')) {
    return { action: 'pass', reason: 'ai_decided_pass' };
  }

  // 2. 检查是否输出预埋延时信封 [STAGE_FOLLOWUP: 45m | 留言内容]
  const stageMatch = trimmed.match(STAGE_FOLLOWUP_TAG_REGEX);
  if (stageMatch && stageMatch[1] && stageMatch[2]) {
    const delayMs = parseDelayStringToMs(stageMatch[1]);
    const stagedText = stageMatch[2].trim();
    return {
      action: 'stage_future',
      stagedDelayMs: delayMs,
      stagedText,
      reason: 'ai_staged_future_envelope',
    };
  }

  // 3. 提取伴侣希望下次观察的时间 [NEXT_FOLLOWUP: 30s] / [NEXT_FOLLOWUP: 1m] / [NEXT_FOLLOWUP: pass]
  let nextFollowupMs: number | undefined = undefined;
  const nextMatch = trimmed.match(NEXT_FOLLOWUP_TAG_REGEX);
  if (nextMatch && nextMatch[1]) {
    nextFollowupMs = parseDelayStringToMs(nextMatch[1]);
  }

  // 4. 提取 NUDGE 动作
  let nudgeAction: string | null = null;
  const nudgeMatch = trimmed.match(NUDGE_TAG_REGEX);
  if (nudgeMatch && nudgeMatch[1]) {
    nudgeAction = nudgeMatch[1].trim();
  }

  // 5. 过滤掉所有系统标签，得到纯粹干净的对话回复
  const clean = trimmed.replace(SYSTEM_TAGS_STRIP_REGEX, '').trim();

  if (clean.length === 0 && !nudgeAction) {
    return { action: 'pass', reason: 'no_content_after_strip' };
  }

  return {
    action: 'immediate_reply',
    cleanText: clean,
    nextFollowupMs,
    nudgeAction,
  };
}

/**
 * 构造 Stage 1 (顺势追话), Stage 2 (趣味互动), Stage 3 (体贴收束与后台衔接) 的前台自主追聊提示词指令
 * 遵循认知心理学与人际沟通边界，严禁强推现代甜宠/狭隘人设刻板印象，充分释放 AI 角色自主随机性。
 */
export function buildProactivePromptDirective(
  stage: 1 | 2 | 3,
  companionName: string,
  recentUserText?: string
): string {
  if (stage === 1) {
    return `[前台伴随情境 · Stage 1 (顺意延伸)]:
对方在聊天界面停留，视线仍在屏幕前。请依你自身鲜明的角色设定、当下心境与彼此相处界限：
1. 顺着刚才的话题或真实心声，由你自主决定随性发 1~2 个口语短句（用 [BR] 切分独立气泡，展现自然在场感）；
2. 可以补充一句见解、顺带吐槽，或在末尾俏皮附带 [NUDGE: 动作部位] 轻轻拍拍对方；
3. 句末可附带 [NEXT_FOLLOWUP: 30s]（或 45s/1m/pass）由你自主掌控下一轮观察；若你的性格偏向沉稳内敛或觉得本轮已圆满，可输出 [PASS] 保持舒适留白；绝不机械客套与连续查户口！`;
  }

  if (stage === 2) {
    return `[前台伴随情境 · Stage 2 (自然在场 · 微分享)]:
对方在聊天界面停留，暂未有新的打字。请以符合你身份背景与说话习惯的方式自然切入：
1. 以自身此刻的所见所感、身边小事或半截吐槽自然分享，用自我暴露留出接话口，严禁生硬提问或抛二选一选择题；
2. 可自然附带当前真实状态 [STATUS: ...]；
3. 若你的角色当前更适合沉思、忙碌或保持舒适沉默，可输出 [PASS] 体贴留白；若继续互动，用 [BR] 发送自然口语短气泡，句末可附带 [NEXT_FOLLOWUP: 1m]（或 pass）！`;
  }

  return `[前台伴随情境 · Stage 3 (体贴收束与后台衔接)]:
对方在聊天界面停留了较长时间依然未输入。请展现契合你人设的体贴与分寸感：
1. 输出一句符合你性格与彼此关系的自然收尾短句（不带施压感，如简短交代、安静守候或暂时道别）；
2. 句末必须附带后台预约闹钟（如 [PING: +15m | 简要意图]），确保从前台伴随平滑过渡到后台长效守护，永不断绝！`;
}
