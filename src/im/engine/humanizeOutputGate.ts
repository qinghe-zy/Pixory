/**
 * 伴侣聊天拟人度与反机械质检引擎 (HumanizeOutputGate)
 *
 * 核心目标：
 * 1. 按需过滤舞台括号动作（默认保留以增强陪伴画面感，TTS 纯语音脚本场景显式剥离）；
 * 2. 清理所有残留技术控制标签与深度思考标签，杜绝内部协议泄露到气泡正文；
 * 3. 监控连续追问节律，仅在连续 >= 3 轮发问时注入温和非命令式对话流向提示；
 * 4. 相似度熔断，拦截与前几句高度重复的废话气泡。
 */

// 中英文圆括号舞台动作与内心独白描述正则（例如：（轻笑）、（眨了眨眼）、(叹气)、(长段内心独白)）
const STAGE_ACTION_REGEX = /[（\(][^）\(\n]+[）\)]/g;

// 深度思考残留块与孤儿开闭标签清理
const THINK_BLOCK_REGEX = /<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/gi;
const RESIDUAL_THINK_TAG_REGEX = /<\/?(?:think|thought)\s*\/?>/gi;

// 协议控制标签全量与残留剥离（防技术指令与协议标签泄露兜底，无视位置与换行全面拦截）
const UNRESOLVED_VOICE_TAG_REGEX = /[\[【]\s*(?:VOICE|语音)\s*(?:[:：]\s*(?:[^|\]】]+?\|)?\s*([^\]】]+?)\s*[\]】]|[\]】]\s*[:：]?\s*(?:[^|\[\]【】\n]+?\|)?\s*([^\[\]【】\n]+))/gi;
const EMPTY_OR_MALFORMED_VOICE_TAG_REGEX = /[\[【]\s*(?:VOICE|语音)(?:\s*[:：][^\]】\n]*)?[\]】]/gi;
const PROTOCOL_CONTROL_TAG_REGEX =
  /[\[【]\s*(?:STATUS|MOOD|HEARTBEAT|NUDGE|NEXT_FOLLOWUP|STAGE_FOLLOWUP|PASS|PING|MEMORY_RECALL|MEMORY_NOTE)(?:\s*[:：][^\]】\n]{0,340})?\s*[\]】]/gi;
const RESIDUAL_STICKER_TAG_REGEX =
  /[\[【]\s*(?:STICKER|表情)(?:\s*[:：][^\]】\n]{0,160})?[\]】]/gi;
const DANGLING_PROTOCOL_TAG_REGEX =
  /[\[【]\s*(?:VOICE|语音|STICKER|表情|STATUS|MOOD|HEARTBEAT|NUDGE|NEXT_FOLLOWUP|STAGE_FOLLOWUP|PASS|PING|MEMORY_RECALL|MEMORY_NOTE|DOCUMENT|DOC|DOCUMENT_PATCH|DOC_PATCH)\s*(?:[:：]|[\]】]\s*[:：]?)\s*/gi;

/**
 * 本地质检与协议清理：
 * 默认保留内联神态/舞台动作（preserveInlineStageActions 默认为 true），仅在显式传入 false（如 TTS 脚本）时剥离括号动作。
 */
export function sanitizeCompanionBubble(
  rawText: string,
  options?: { preserveInlineStageActions?: boolean }
): string {
  let cleaned = rawText;

  // 1. 舞台动作处理：仅当显式传入 preserveInlineStageActions === false 时剥离括号动作
  if (options?.preserveInlineStageActions === false) {
    cleaned = cleaned.replace(STAGE_ACTION_REGEX, '');
  }

  // 2. 清理残留深度思考块及孤儿 <think> / </think> / <thought> 标签
  cleaned = cleaned.replace(THINK_BLOCK_REGEX, '');
  cleaned = cleaned.replace(RESIDUAL_THINK_TAG_REGEX, '');

  // 3. 防御性解构或剔除残存的协议标签（无论在首位或中间，无论是否跨行，均脱壳提取纯净台词或安全剥离）
  cleaned = cleaned.replace(UNRESOLVED_VOICE_TAG_REGEX, (_m, p1, p2) => (p1 || p2 || '').trim());
  cleaned = cleaned.replace(EMPTY_OR_MALFORMED_VOICE_TAG_REGEX, '');
  cleaned = cleaned.replace(PROTOCOL_CONTROL_TAG_REGEX, '');
  cleaned = cleaned.replace(RESIDUAL_STICKER_TAG_REGEX, '');
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
 * 开场词多样性窗口检测（已停用，保留导出签名以维持旧调用方兼容）
 */
export function detectRepetitiveStarters(_recentFirstBubbles: string[]): string | null {
  return null;
}

const QUESTION_ENDING_REGEX = /(?:[?？]$|(?:吗|呢|好不好|对吧|是不是|去哪了|吃了吗)[~～！!。]*$)/;

export function isQuestionEnding(text: string): boolean {
  return QUESTION_ENDING_REGEX.test(text.trim());
}

/**
 * 问句节律检测：仅在最近连续 3 轮以上都以问句结尾时给出温和的对话流向提示
 */
export function detectExcessiveQuestions(recentAssistantLastBubbles: string[]): string | null {
  if (!recentAssistantLastBubbles || recentAssistantLastBubbles.length < 3) return null;

  const lastThree = recentAssistantLastBubbles.slice(-3);
  if (lastThree.every((text) => isQuestionEnding(text))) {
    return '[对话流向提示: 近期已连续多轮向对方发问，本轮可自然陈述自身看法、反应或状态，无需刻意在句末抛问题]';
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
