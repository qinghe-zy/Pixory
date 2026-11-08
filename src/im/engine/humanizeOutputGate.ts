/**
 * 伴侣聊天拟人度与反机械质检引擎 (HumanizeOutputGate)
 *
 * 核心目标：
 * 1. 过滤模型偶发的“舞台括号动作”（如（轻笑）、(揉了揉眼)）与客服腔句式（“有什么可以帮您”）；
 * 2. 统计首句开场词多样性，防止伴侣千篇一律以“哈哈”、“好呀”、“嗯嗯”开头；
 * 3. 监控问句率，防止伴侣每句话都以问句查户口结尾；
 * 4. 相似度熔断，拦截与前几句高度重复的废话气泡。
 */

// 常见客服/AI自指机械句式正则（包含紧随其后的语气词与问号）
const ROBOTIC_CLICHE_REGEX = /(?:[，,、\s]*)?(?:有什么可以帮[您你]|希望对[您你]有[所]?帮助|作为(?:一个)?(?:AI|人工智能|语言模型)|祝[您你]生活愉快|请随时告诉我)[的吗吧呢呀]*[？?]?/gi;

// 中英文圆括号舞台动作与内心独白描述正则（例如：（轻笑）、（眨了眨眼）、(叹气)、(长段内心独白)）
const STAGE_ACTION_REGEX = /[（\(][^）\(\n]+[）\)]/g;

// 协议控制标签残留剥离（防技术指令与协议标签泄露兜底，无视位置与换行全面拦截）
const DANGLING_PROTOCOL_TAG_REGEX = /[\[【]\s*(?:VOICE|语音|STICKER|表情|STATUS|MOOD|HEARTBEAT|NUDGE|PING|DOCUMENT|DOC)\s*(?:[:：]|[\]】]\s*[:：]?)\s*/gi;
const UNRESOLVED_VOICE_TAG_REGEX = /[\[【]\s*(?:VOICE|语音)\s*(?:[:：]\s*(?:[^|\]】]+?\|)?\s*([^\]】]+?)\s*[\]】]|[\]】]\s*[:：]?\s*(?:[^|\[\]【】\n]+?\|)?\s*([^\[\]【】\n]+))/gi;

/**
 * 本地质检与拟人净化：剥离舞台动作与客服腔
 * 当 preserveInlineStageActions = true 时，保留简短神态动作描写（如“（靠在窗边打了个哈欠）”），增强文学质感与陪伴画面感
 */
export function sanitizeCompanionBubble(
  rawText: string,
  options?: { preserveInlineStageActions?: boolean }
): string {
  let cleaned = rawText;

  // 1. 舞台动作处理：若未显式开启保留，则剥离括号动作
  if (!options?.preserveInlineStageActions) {
    cleaned = cleaned.replace(STAGE_ACTION_REGEX, '');
  }

  // 2. 剔除客服腔与 AI 机械语录
  cleaned = cleaned.replace(ROBOTIC_CLICHE_REGEX, '');

  // 3. 防御性解构或剔除残存的协议标签（无论在首位或中间，无论是否跨行，均脱壳提取纯净台词）
  cleaned = cleaned.replace(UNRESOLVED_VOICE_TAG_REGEX, (_m, p1, p2) => (p1 || p2 || '').trim());
  cleaned = cleaned.replace(DANGLING_PROTOCOL_TAG_REGEX, '');

  // 4. 整理连续多余空格
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ').trim();

  return cleaned;
}

/**
 * 提取句子开头的 2~3 字特征词（如“哈哈”、“好呀”、“嗯嗯”）
 */
export function extractStarterToken(text: string): string | null {
  const trimmed = text.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  if (trimmed.length < 2) return null;
  return trimmed.slice(0, 2);
}

/**
 * 开场词多样性窗口检测：
 * 若最近 8 轮中同一开场词出现 >= 3 次，返回注入 Layer 4 的抑制提示
 */
export function detectRepetitiveStarters(recentFirstBubbles: string[]): string | null {
  if (recentFirstBubbles.length < 4) return null;

  const counts: Record<string, number> = {};
  for (const bubble of recentFirstBubbles.slice(-8)) {
    const starter = extractStarterToken(bubble);
    if (starter) {
      counts[starter] = (counts[starter] || 0) + 1;
      if (counts[starter] >= 3) {
        return `【表达多样性提示】近期你已多次以「${starter}」开头，本轮请换一种更自然贴切的接话方式，避免口头禅机械复读。`;
      }
    }
  }

  return null;
}

const QUESTION_ENDING_REGEX = /(?:[?？]$|(?:吗|呢|好不好|对吧|是不是|去哪了|吃了吗)[~～！!。]*$)/;

export function isQuestionEnding(text: string): boolean {
  return QUESTION_ENDING_REGEX.test(text.trim());
}

/**
 * 问句率上限检测：
 * 1. 连续 2 轮问句即刻熔断（消除冷启动盲区，严防开局查户口）
 * 2. 窗口内问句占比超过 40% 触发控温提示
 */
export function detectExcessiveQuestions(recentAssistantLastBubbles: string[]): string | null {
  if (!recentAssistantLastBubbles || recentAssistantLastBubbles.length === 0) return null;

  // 1. 连续 2 轮问号即刻熔断（零冷启动盲区，杜绝连环追问）
  const lastTwo = recentAssistantLastBubbles.slice(-2);
  if (lastTwo.length >= 2 && isQuestionEnding(lastTwo[0]) && isQuestionEnding(lastTwo[1])) {
    return `【互动节律提示】你已连续多句以提问收尾。本轮回复请以陈述、倾听共情、微吐槽或顺势分享收尾，禁止再以疑问句结尾盘问对方。`;
  }

  const windowSlice = recentAssistantLastBubbles.slice(-10);
  let questionCount = 0;
  for (const text of windowSlice) {
    if (isQuestionEnding(text)) {
      questionCount += 1;
    }
  }

  const ratio = questionCount / windowSlice.length;
  if (windowSlice.length >= 3 && ratio >= 0.4) {
    return `【互动节律提示】近期你向对方抛出问句的频率偏高。本轮回复请以陈述、倾听共情、微吐槽或顺势分享收尾，禁止再以疑问句结尾盘问对方。`;
  }

  return null;
}

/**
 * 简易 2-Gram Dice 文本相似度计算
 */
function computeDiceSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length < 2 || b.length < 2) return 0;

  const getBigrams = (str: string) => {
    const set = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      set.add(str.slice(i, i + 2));
    }
    return set;
  };

  const setA = getBigrams(a);
  const setB = getBigrams(b);
  let intersection = 0;

  for (const item of setA) {
    if (setB.has(item)) intersection += 1;
  }

  return (2 * intersection) / (setA.size + setB.size);
}

/**
 * 相似度重复熔断检测：
 * 若新生成的气泡与最近历史中的 assistant 气泡相似度超过阈值 (0.82)，则判定为机械复读
 */
export function isDuplicateBubble(
  candidateText: string,
  recentAssistantTexts: string[],
  threshold: number = 0.82
): boolean {
  const cleanCandidate = candidateText.replace(/[^\p{L}\p{N}]+/gu, '');
  if (cleanCandidate.length < 4) return false;

  for (const existing of recentAssistantTexts.slice(-6)) {
    const cleanExisting = existing.replace(/[^\p{L}\p{N}]+/gu, '');
    if (computeDiceSimilarity(cleanCandidate, cleanExisting) >= threshold) {
      return true;
    }
  }

  return false;
}
