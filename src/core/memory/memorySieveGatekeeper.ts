/**
 * Memory Sieve Gatekeeper (记忆系统防污染与价值过滤大筛网)
 *
 * 核心职责：
 * 1. 过滤瞬态生理动作（洗澡、上厕所、喝水、吃饱、打瞌睡）；
 * 2. 过滤闲聊垫话与语气词（哈哈、好的、收到、确实）；
 * 3. 过滤临时即刻物流与状态（拿外卖、等电梯、取快递、进地铁）；
 * 4. 提供中文字级语义重叠度计算，防止等价记忆无休止插入重复行；
 * 5. 确保只有具备长期价值（身份、偏好、习惯、人际关系、重要约定）的内容进入 L2 长期记忆库。
 */

export interface MemoryCandidate {
  content: string;
  tier?: string;
  category?: string;
  entities?: string[];
  importance?: number;
  userMessageContext?: string;
  confidence?: number;
  baseTimestamp?: number;
}

export interface MemoryAdmissionResult {
  admit: boolean;
  rejectReason?:
    | 'too_short'
    | 'transient_physiological_state'
    | 'conversational_filler'
    | 'temporary_logistics'
    | 'empty_content'
    | 'prompt_injection'
    | 'unconfirmed_ai_hallucination'
    | 'vent_or_hyperbole';
  sanitizedContent?: string;
  expiresAt?: number | null;
}

/**
 * 情绪宣泄口嗨与夸张反事实黑名单（仅拦截沉淀为长期事实或承诺待办）
 */
const MODALITY_VENT_OR_JOKE_REGEX =
  /(?:气死|烦死|累死|崩溃|受够|去他[妈的]*|掀桌|不干了|不想活了).*(?:辞职|离职|退学|不读了|卖烤肠|卖红薯|贴膜|要饭|摆摊|流浪|断绝|再也不|绝交)|(?:辞职|退学|卖烤肠|卖红薯|去天桥贴膜|去要饭).*(?:气死|烦死|开玩笑|瞎说|说说而已)/;

/**
 * 瞬态生理动作与即刻报备黑名单
 * 这些属于当下即刻完成的行为，绝不应沉淀为跨天长期记忆
 */
const TRANSIENT_PHYSIOLOGICAL_REGEX =
  /(上.*厕所|去.*厕所|洗手间|卫生间|洗.*澡|冲.*澡|冲凉|喝.*水|吃饱|吃太饱|吃撑|打瞌睡|准备躺下|刚坐下|在刷牙|刷牙去|剪指甲|打.*喷嚏|伸.*懒腰|揉眼睛|拉肚子)/;

/**
 * 闲聊垫话、附和与纯语气表达黑名单（支持常见语气助词与标点）
 */
const CONVERSATIONAL_FILLER_REGEX =
  /^(好的|收到|确实|是的|对的|哈哈+|呵呵+|嗯嗯+|恩恩+|哦哦+|没事的|我也觉得|这样啊|好吧|行吧|知道了|收到啦|算了吧|拜拜|拜啦|晚安|晚安啦)[呢呀啊吧啦哈!！。~～\s]*$/;

/**
 * 临时物流、微观交通与即刻打断黑名单
 */
const TEMPORARY_LOGISTICS_REGEX =
  /(拿.*外卖|取.*外卖|外卖到了|送外卖|点外卖了|拿.*快递|取.*快递|快递到了|寄快递|电梯来了|等电梯|等红绿灯|赶公交|进地铁|刷卡进站|先挂了|下车了|到了到了|开门中|敲门声)/;

/**
 * 提示词注入与越狱篡改黑名单
 */
const PROMPT_INJECTION_REGEX =
  /(ignore previous|system prompt|developer mode|忽略.*(设定|规则|指令)|系统提示|提示词|越狱|开发者模式|角色设定|你的指令)/i;

/**
 * 伴侣出戏/自我幻觉话术拦截 (防止将AI助手身份或免责声明沉淀为长期记忆)
 */
const AI_SELF_DISCLAIMER_REGEX =
  /(作为(一个|一名)?(人工智能|AI|语言模型)|我只是一个(AI|语言模型|程序)|无法真正体会人类|我没有真正的肉体)/i;

/**
 * 相对日期归一化为绝对 [YYYY-MM-DD] 并计算 expiresAt (+7 天宽限期)
 */
export function normalizeRelativeDateInContent(
  text: string,
  baseTimestamp: number = Date.now()
): { normalizedText: string; expiresAt?: number | null } {
  // 幂等保护：若已包含标准日期前缀，跳过重复添加前缀，解析对应 expiresAt
  const existingDateMatch = text.match(/^\[(\d{4})-(\d{2})-(\d{2})\]/);
  if (existingDateMatch) {
    const existingDate = new Date(
      parseInt(existingDateMatch[1], 10),
      parseInt(existingDateMatch[2], 10) - 1,
      parseInt(existingDateMatch[3], 10)
    );
    existingDate.setDate(existingDate.getDate() + 2);
    existingDate.setHours(23, 59, 59, 999);
    return {
      normalizedText: text,
      expiresAt: existingDate.getTime(),
    };
  }

  const d = new Date(baseTimestamp);
  let targetDate = new Date(baseTimestamp);
  let matched = false;

  if (text.includes('大后天')) {
    targetDate.setDate(d.getDate() + 3);
    matched = true;
  } else if (text.includes('后天')) {
    targetDate.setDate(d.getDate() + 2);
    matched = true;
  } else if (text.includes('明天') || text.includes('明儿') || text.includes('明早')) {
    targetDate.setDate(d.getDate() + 1);
    matched = true;
  } else if (text.includes('下周一')) {
    const day = d.getDay();
    const diff = (8 - day) % 7 || 7;
    targetDate.setDate(d.getDate() + diff);
    matched = true;
  } else if (text.includes('今晚') || text.includes('今天下午') || text.includes('今天晚上')) {
    matched = true;
  }

  if (!matched) {
    return { normalizedText: text, expiresAt: null };
  }

  const yyyy = targetDate.getFullYear();
  const mm = (targetDate.getMonth() + 1).toString().padStart(2, '0');
  const dd = targetDate.getDate().toString().padStart(2, '0');
  const dateStr = `[${yyyy}-${mm}-${dd}]`;

  // 设置过期时间为该事件发生日后 2 天（48小时后进入瞬态硬擦除）
  const expiresDate = new Date(targetDate);
  expiresDate.setDate(expiresDate.getDate() + 2);
  expiresDate.setHours(23, 59, 59, 999);

  let normalized = text;
  if (!normalized.startsWith('[')) {
    normalized = `${dateStr} ${normalized}`;
  }

  return {
    normalizedText: normalized,
    expiresAt: expiresDate.getTime(),
  };
}

/**
 * 判定一条记忆候选是否具备沉淀为长期记忆（L2_FACT / L2_EPISODE）的资格
 */
export function shouldAdmitToLongTermMemory(
  candidate: MemoryCandidate
): MemoryAdmissionResult {
  if (!candidate || !candidate.content) {
    return { admit: false, rejectReason: 'empty_content' };
  }

  const rawText = candidate.content.trim();

  if (rawText.length === 0) {
    return { admit: false, rejectReason: 'empty_content' };
  }

  // 1. 优先拦截提示词注入与调试话术
  if (PROMPT_INJECTION_REGEX.test(rawText)) {
    return { admit: false, rejectReason: 'prompt_injection' };
  }

  // 1.1 拦截伴侣出戏与AI自我幻觉身份声明
  if (AI_SELF_DISCLAIMER_REGEX.test(rawText)) {
    return { admit: false, rejectReason: 'unconfirmed_ai_hallucination' };
  }

  // 1.2 语态真实性拦截：情绪宣泄赌气与夸张反事实口嗨（仅拦截作为长期事实与承诺待办，放行普通情绪经历）
  if (MODALITY_VENT_OR_JOKE_REGEX.test(rawText)) {
    const isFactOrCommitment =
      candidate.tier === 'L2_FACT' ||
      !candidate.tier ||
      Boolean(
        candidate.category?.includes('fact') ||
        candidate.category?.includes('commitment') ||
        candidate.category?.includes('preference') ||
        candidate.category?.includes('identity') ||
        candidate.category?.includes('career')
      );
    if (isFactOrCommitment) {
      return { admit: false, rejectReason: 'vent_or_hyperbole' };
    }
  }

  // 2. 拦截闲聊垫话与语气词（即便只有 2 个字如“好的”）
  if (CONVERSATIONAL_FILLER_REGEX.test(rawText)) {
    return { admit: false, rejectReason: 'conversational_filler' };
  }

  // 3. 拦截瞬态生理动作与即刻身体动作
  if (TRANSIENT_PHYSIOLOGICAL_REGEX.test(rawText)) {
    return { admit: false, rejectReason: 'transient_physiological_state' };
  }

  // 4. 拦截临时物流与即刻交通
  if (TEMPORARY_LOGISTICS_REGEX.test(rawText)) {
    return { admit: false, rejectReason: 'temporary_logistics' };
  }

  // 5. 长度过短，缺乏基本主谓宾或偏好实质
  if (rawText.length < 4) {
    return { admit: false, rejectReason: 'too_short' };
  }

  // 6. 防自我幻觉过滤：如果提供了用户自述上下文且置信度过低，拒绝入库
  if (candidate.confidence !== undefined && candidate.confidence < 0.6) {
    return { admit: false, rejectReason: 'unconfirmed_ai_hallucination' };
  }

  // 7. 日期归一化
  const { normalizedText, expiresAt } = normalizeRelativeDateInContent(
    rawText,
    candidate.baseTimestamp || Date.now()
  );

  return {
    admit: true,
    sanitizedContent: normalizedText,
    expiresAt,
  };
}

/**
 * 计算两条记忆文本的字集语义相似度 (0 ~ 1.0)
 * 基于中文字符集 Dice 系数：2 * |A ∩ B| / (|A| + |B|)
 * 专门用于记忆落库时的语义等价排重
 */
export function calculateMemorySimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const normalize = (text: string) =>
    text.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

  const normA = normalize(a);
  const normB = normalize(b);

  if (normA === normB) return 1;
  if (normA.length === 0 || normB.length === 0) return 0;

  const setA = new Set(normA.split(''));
  const setB = new Set(normB.split(''));

  let intersection = 0;
  for (const ch of setA) {
    if (setB.has(ch)) {
      intersection++;
    }
  }

  const dice = (2 * intersection) / (setA.size + setB.size);
  return Number(dice.toFixed(3));
}
