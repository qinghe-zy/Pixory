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

// 中英文圆括号舞台动作描述正则（例如：（轻笑）、（眨了眨眼）、(叹气)）
const STAGE_ACTION_REGEX = /[（\(][^）\(\n]{1,24}[）\)]/g;

/**
 * 本地质检与拟人净化：剥离舞台动作与客服腔
 */
export function sanitizeCompanionBubble(rawText: string): string {
  let cleaned = rawText;

  // 1. 剔除舞台括号动作
  cleaned = cleaned.replace(STAGE_ACTION_REGEX, '');

  // 2. 剔除客服腔与 AI 机械语录
  cleaned = cleaned.replace(ROBOTIC_CLICHE_REGEX, '');

  // 3. 整理连续多余空格
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

/**
 * 问句率上限检测：
 * 若最近 10 轮中超过 40% 以问号收尾，返回注入 Layer 4 的控温提示
 */
export function detectExcessiveQuestions(recentAssistantLastBubbles: string[]): string | null {
  const windowSlice = recentAssistantLastBubbles.slice(-10);
  if (windowSlice.length < 5) return null;

  let questionCount = 0;
  for (const text of windowSlice) {
    const trimmed = text.trim();
    if (/[?？]$/.test(trimmed) || /(吗|呢|好不好|对吧)[~～！!。]*$/.test(trimmed)) {
      questionCount += 1;
    }
  }

  const ratio = questionCount / windowSlice.length;
  if (ratio >= 0.4) {
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
