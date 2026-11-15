import type { LlmTransportMessage } from '../../core/llm-transport/types';
import type { CompanionMemoryRecord, MemoryRecallCandidate } from '../../core/memory/memoryTypes';
import type { ImMessage, ImCompanionLivingState } from '../types';
import type { buildActiveArcLedgerNotice } from './activeArcLedgerService';
import type { buildTopicIndexCatalog } from './imTokenBudgetController';

export const LAYER_2_MAX_TOKENS = 900;
export const LAYER_4_MAX_TOKENS = 360;
export const LAYER_2_CATALOG_MAX_TOKENS = 140;
export const ACTIVE_ARC_MAX_TOKENS = 90;
export const ACTIVE_ARC_SLOT_CATEGORY = 'active_arc_ledger';

export interface ResolvedImBudgets {
  layer2MaxTokens: number;
  layer4MaxTokens: number;
  layer2CatalogMaxTokens: number;
  activeArcMaxTokens: number;
}

/**
 * 根据对话深度与模型上下文窗口自适应解析预算
 */
export function resolveBudgets(
  threadTurns?: number,
  _modelCtxHint?: number
): ResolvedImBudgets {
  const turns = threadTurns ?? 0;
  if (turns < 10) {
    return {
      layer2MaxTokens: 600,
      layer4MaxTokens: 250,
      layer2CatalogMaxTokens: 100,
      activeArcMaxTokens: 70,
    };
  }
  return {
    layer2MaxTokens: LAYER_2_MAX_TOKENS,
    layer4MaxTokens: LAYER_4_MAX_TOKENS,
    layer2CatalogMaxTokens: LAYER_2_CATALOG_MAX_TOKENS,
    activeArcMaxTokens: ACTIVE_ARC_MAX_TOKENS,
  };
}

/**
 * 极速高精度的中英混合 Token 估算器
 * CJK 汉字按 0.65 tok/char，ASCII 单词及标点按 0.28 tok/char 估算
 */
export function estimateImTokens(text: string | null | undefined): number {
  if (!text) return 0;
  let cjkCount = 0;
  let asciiCount = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x4e00 && code <= 0x9fff) {
      cjkCount++;
    } else {
      asciiCount++;
    }
  }

  return Math.ceil(cjkCount * 0.65 + asciiCount * 0.28);
}

/**
 * 贪婪控制 Layer 2 核心画像预算
 * 优先级：置顶 (isPinned) > 重要度 (importance) > 归因置信度 (confidence) > 最近使用时间
 */
export function fitLayer2CoreFacts(
  facts: CompanionMemoryRecord[],
  maxTokens: number = LAYER_2_MAX_TOKENS
): CompanionMemoryRecord[] {
  if (!facts || facts.length === 0) return [];

  const sorted = [...facts].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (a.importance !== b.importance) return b.importance - a.importance;
    const confA = a.confidence ?? 0.85;
    const confB = b.confidence ?? 0.85;
    if (confA !== confB) return confB - confA;
    return b.lastAccessedAt - a.lastAccessedAt;
  });

  const selected: CompanionMemoryRecord[] = [];
  let currentTokens = 0;

  for (const item of sorted) {
    const itemTok = estimateImTokens(`• ${item.content}\n`);
    if (currentTokens + itemTok <= maxTokens) {
      selected.push(item);
      currentTokens += itemTok;
    }
  }

  return selected;
}

/**
 * 贪婪控制 Layer 4 动态召回记忆预算：
 * 去重并基于真实转义后的 <memory> XML 渲染字符串计量 Token，杜绝元数据标签开销撑爆预算。
 */
export function fitLayer4Memories(
  recalled: MemoryRecallCandidate[],
  maxTokens: number = LAYER_4_MAX_TOKENS
): MemoryRecallCandidate[] {
  if (!recalled || recalled.length === 0 || maxTokens <= 0) return [];

  const sorted = [...recalled].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const selected: MemoryRecallCandidate[] = [];
  const seenIds = new Set<string>();
  let currentTokens = 0;

  for (const item of sorted) {
    if (!item || !item.id || seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    const rendered = renderLayer4MemoryItem(item);
    if (!rendered) continue;
    const itemTok = estimateImTokens(escapeXmlDelimiters(`${rendered}\n`));
    if (currentTokens + itemTok <= maxTokens) {
      selected.push(item);
      currentTokens += itemTok;
    }
  }

  return selected;
}

function resolveOptionalTopicCatalogBuilder(): typeof buildTopicIndexCatalog | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('./imTokenBudgetController') as {
      buildTopicIndexCatalog?: typeof buildTopicIndexCatalog;
    };
    return typeof mod?.buildTopicIndexCatalog === 'function' ? mod.buildTopicIndexCatalog : null;
  } catch {
    return null;
  }
}

function resolveOptionalActiveArcNoticeBuilder(): typeof buildActiveArcLedgerNotice | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('./activeArcLedgerService') as {
      buildActiveArcLedgerNotice?: typeof buildActiveArcLedgerNotice;
    };
    return typeof mod?.buildActiveArcLedgerNotice === 'function' ? mod.buildActiveArcLedgerNotice : null;
  } catch {
    return null;
  }
}

export interface ResolvedTargetDocuments {
  primaryTarget: ImMessage;
  referenceDocs: ImMessage[];
}

function parseChineseOrdinal(text: string): number | null {
  const cnMap: Record<string, number> = {
    一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  const match = text.match(/(?:第([一二两三四五六七八九十\d]+)版|v(\d+))/i);
  if (!match) return null;
  const numStr = match[1] || match[2];
  if (!numStr) return null;
  if (/^\d+$/.test(numStr)) {
    return parseInt(numStr, 10);
  }
  return cnMap[numStr] || null;
}

/**
 * 文档意图门控（Document Intent Gate）：
 * 避免在日常闲聊中无休止地向大模型注入上千 Token 的文档骨架，消除“秘书化”语感污染。
 */
export function hasDocumentEditIntent(
  userText: string,
  messages: ImMessage[],
  referencedMessageId?: string | null
): boolean {
  if (!userText && !referencedMessageId) return false;

  // 1. 显式引用了文档气泡
  if (referencedMessageId) {
    const refMsg = messages.find((m) => m.id === referencedMessageId);
    if (refMsg?.type === 'document') return true;
  }

  const trimmed = userText.trim();
  // 2. 命中文档操作意图正则
  const EDIT_INTENT_REGEX =
    /(?:改|修|重写|精简|扩写|替换|优化|删|加|补充|调整|纠错|勘误|校对|查重|变动|更新|草稿|预览|阅读|打开|导出|分享|版本|撤回|第[一二三四五六七八九十0-9]+[段章节页条行]|标题|封面|公章|表格|段落|条款|正文|摘要|目录|骨架|附件|文档|合同|方案|报告|材料|word|docx|pdf|markdown)/i;
  if (EDIT_INTENT_REGEX.test(trimmed)) {
    return true;
  }

  // 3. 距离上一条文档气泡生成不超过 2 个对话回合（热编辑窗口期）
  let turnsSinceLastDoc = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type === 'document') {
      return turnsSinceLastDoc <= 2;
    }
    if (m.role === 'user') {
      turnsSinceLastDoc++;
    }
    if (turnsSinceLastDoc > 2) break;
  }

  return false;
}

/**
 * 智能双链表文档锚点解析器（支持序数词版本精确定位）
 */
export function resolveTargetDocumentMessages(
  messages: ImMessage[],
  userText: string
): ResolvedTargetDocuments | null {
  if (!messages || messages.length === 0) return null;

  const docMsgs = messages.filter((m) => m.type === 'document' && m.metadata?.document);
  if (docMsgs.length === 0) return null;

  const trimmedText = userText.trim();
  const wantsOriginal = /原件|初稿|第一版|最开始|最初那份|v1\b/i.test(trimmedText);
  const wantsPrevious = /上一版|撤回刚才|改回前一版|回退前版/i.test(trimmedText);
  const requestedOrdinal = parseChineseOrdinal(trimmedText);

  // 默认候选：最新一条文档
  let candidate = docMsgs[docMsgs.length - 1];

  // 1. 尝试匹配用户提及的文档标题关键词
  for (let i = docMsgs.length - 1; i >= 0; i--) {
    const docTitle = docMsgs[i].metadata?.document?.title || docMsgs[i].content || '';
    const cleanTitle = docTitle.replace(/\.\w+$/, '').trim();
    if (cleanTitle.length >= 2 && trimmedText.includes(cleanTitle)) {
      candidate = docMsgs[i];
      break;
    }
  }

  // 2. 溯源构造当前分支的版本演进链 [Root(V1), V2, ..., Latest(Vn)]
  const versionChain: ImMessage[] = [candidate];
  let curr = candidate;
  while (curr.metadata?.document?.derivedFromMsgId) {
    const parentId = curr.metadata.document.derivedFromMsgId;
    const parent = docMsgs.find((m) => m.id === parentId);
    if (!parent) break;
    versionChain.unshift(parent);
    curr = parent;
  }

  // 3. 处理版本溯源定位
  if (wantsOriginal && versionChain.length > 0) {
    candidate = versionChain[0];
  } else if (wantsPrevious && versionChain.length > 1) {
    candidate = versionChain[versionChain.length - 2];
  } else if (requestedOrdinal !== null && requestedOrdinal >= 1 && requestedOrdinal <= versionChain.length) {
    candidate = versionChain[requestedOrdinal - 1];
  }

  return {
    primaryTarget: candidate,
    referenceDocs: docMsgs.filter((m) => m.id !== candidate.id).slice(-2),
  };
}

/**
 * 解析表情贴纸展示标签名称
 */
function resolveStickerLabel(
  stickerId: string | null | undefined,
  metadata?: { name?: string; label?: string } | null
): string {
  if (metadata?.name?.trim()) return metadata.name.trim();
  if (metadata?.label?.trim()) return metadata.label.trim();
  if (!stickerId) return '表情';
  return stickerId.trim() || '表情';
}

export const MID_EPOCH_DELTA_MAX_TOKENS = 90;

/**
 * 计算本世代中途新增的核心事实（用于注入 Layer 4，既不破坏 Layer 2 前缀缓存，又能让最新记忆秒级生效）
 */
export function computeMidEpochDeltaFacts(
  liveFacts: CompanionMemoryRecord[] = [],
  activeCoreFactsJson?: string | null,
  maxDeltaTokens: number = MID_EPOCH_DELTA_MAX_TOKENS
): CompanionMemoryRecord[] {
  if (!liveFacts || liveFacts.length === 0) return [];
  const frozenFactIds = new Set<string>();
  const frozenContents = new Set<string>();
  if (activeCoreFactsJson && activeCoreFactsJson.trim() && activeCoreFactsJson.trim() !== '[]') {
    try {
      const parsed = JSON.parse(activeCoreFactsJson);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item?.id) frozenFactIds.add(String(item.id));
          if (item?.content && typeof item.content === 'string') {
            frozenContents.add(item.content.trim().toLowerCase());
          }
        }
      }
    } catch {}
  }

  const deltas = liveFacts.filter((f) => {
    if (frozenFactIds.has(f.id)) return false;
    const content = f.content?.trim();
    if (!content) return false;
    if (frozenContents.has(content.toLowerCase())) return false;
    return true;
  });
  const selected: CompanionMemoryRecord[] = [];
  let currentTokens = 0;
  for (const item of deltas) {
    const itemTok = estimateImTokens(`• ${item.content}\n`);
    if (currentTokens + itemTok <= maxDeltaTokens) {
      selected.push(item);
      currentTokens += itemTok;
    }
  }
  return selected;
}

/**
 * 临期纪念日与倒数日感知（仅在临近 0~2 天按需注入 Layer 4，其余时间 0 Token 损耗）
 */
export function resolveActiveMilestoneNotice(
  milestones?: Array<{ label: string; dateKey: string }>,
  now: number = Date.now()
): string {
  if (!milestones || milestones.length === 0) return '';
  const nowD = new Date(now);
  const nowYear = nowD.getFullYear();
  const todayZero = new Date(nowYear, nowD.getMonth(), nowD.getDate()).getTime();
  const ONE_DAY_MS = 86400000;

  for (const m of milestones) {
    const cleanLabel = m.label?.trim();
    const cleanKey = m.dateKey?.trim();
    if (!cleanLabel || !cleanKey) continue;

    const possibleDates: number[] = [];
    if (cleanKey.length === 5 && cleanKey.includes('-')) {
      const [mm, dd] = cleanKey.split('-').map((v) => parseInt(v, 10));
      if (!isNaN(mm) && !isNaN(dd)) {
        possibleDates.push(new Date(nowYear, mm - 1, dd).getTime());
        possibleDates.push(new Date(nowYear + 1, mm - 1, dd).getTime());
      }
    } else if (cleanKey.length === 10 && cleanKey.split('-').length === 3) {
      const [yyyy, mm, dd] = cleanKey.split('-').map((v) => parseInt(v, 10));
      if (!isNaN(yyyy) && !isNaN(mm) && !isNaN(dd)) {
        if (yyyy > nowYear) {
          // 明确的未来某年单次目标日
          possibleDates.push(new Date(yyyy, mm - 1, dd).getTime());
        } else {
          // 过去某年开启的年度纪念日，按今年和明年对齐
          possibleDates.push(new Date(nowYear, mm - 1, dd).getTime());
          possibleDates.push(new Date(nowYear + 1, mm - 1, dd).getTime());
        }
      }
    }

    for (const targetTime of possibleDates) {
      const dayDiff = Math.round((targetTime - todayZero) / ONE_DAY_MS);
      if (dayDiff === 0) {
        return `\n[日历节点: 今天是「${cleanLabel}」]`;
      } else if (dayDiff === 1) {
        return `\n[日历节点: 明天是「${cleanLabel}」]`;
      } else if (dayDiff === 2) {
        return `\n[日历节点: 距离「${cleanLabel}」还有 2 天]`;
      }
    }
  }

  return '';
}

export interface ContextBuilderOptions {
  rolePrompt: string;
  roleName?: string;
  l1Slots?: CompanionMemoryRecord[];
  l1Summary?: CompanionMemoryRecord | null;
  coreFacts?: CompanionMemoryRecord[];
  allL2Memories?: CompanionMemoryRecord[];
  epochCatalogText?: string | null;
  activeArcNotice?: string | null;
  historyMessages: ImMessage[];
  windowN?: number;
  anchorMessageId?: string;
  referencedMessageId?: string | null;
  recalledMemories?: MemoryRecallCandidate[];
  companionStatus?: string;
  livingState?: ImCompanionLivingState;
  now?: number;
  currentImageBase64?: string | null;
  interruptedDraft?: string | null;
  pendingDiaryHook?: string | null;
  epochSlotJson?: string;
  epochSummaryJson?: string;
  epochCoreFactsJson?: string;
  midEpochDeltaFacts?: CompanionMemoryRecord[];
  milestones?: Array<{ label: string; dateKey: string }>;
  evictedUpToTurn?: number;
  isWakeupPing?: boolean;
  pingIntent?: string;
  diaryContext?: {
    diaryDate: string;
    title: string;
    content: string;
    moodTag?: string | null;
  } | null;
  personaAnchor?: string | null;
  /** @deprecated Layer 4 已去行为微操化，此字段保留仅供调用方过渡兼容 */
  styleEntrainmentNotice?: string | null;
  diversityNotice?: string | null;
  /** @deprecated Layer 4 已去行为微操化，此字段保留仅供调用方过渡兼容 */
  burstShapeHint?: string | null;
  retryWithoutReThinking?: boolean;
  voiceReplyEnabled?: boolean;
  isNativeReasoningModel?: boolean;
  /** 二轮 [MEMORY_RECALL] 接续标志：当首轮已落地开场气泡且历史已含用户原话与开场白时，Layer 5 改为内部续接提示而非重复拼入 userInput */
  followupContinuation?: boolean;
}

const IM_PROTOCOL_VOICE_ENABLED_SECTION = `8. 【拟真语音条发送协议与语气表现力】
   你具备发送手机原生语音条的能力。当对方要求发语音、想听你声音，或依角色性格你想用声音直接开口时，可使用以下语音条标签：
   格式规范：
   - 标准格式：[VOICE: 语音台词]
   - 语气情绪格式：[VOICE: 语气风格 | 语音台词]（如 [VOICE: 轻声 | 早点休息]、[VOICE: 带点笑意 | 这次总算听清了吧]）；
   - 前置神态联动：若在语音条前带有简短神态动作（如 (靠在桌边把声音放轻)[BR][VOICE: 今天还顺利吗？]），系统会将其作为语音语气与节奏参考；
   - 副语言拟声：语音台词中可自然融入（轻笑）、（叹气）、（打哈欠）等拟声提示；
   - 语音发送约束：当对方明确要求“发语音”、“用语音说”、“想听你声音”时，必须输出 [VOICE: ...] 标签，严禁用纯文字假装自己在发语音，也严禁将标签拆成 [VOICE]: 裸露在文字气泡中；
   - 组合顺序自由：可在同一回合内与文字气泡、[STICKER: ...] 自由穿插或单独发送，篇幅与口吻完全由角色习惯决定。`;

const IM_PROTOCOL_VOICE_DISABLED_SECTION = `8. 【语音回复已停用】
   当前会话用户已关闭模型语音回复开关。请仅使用纯文本气泡 [BR] 与表情包交流，绝对严禁输出 [VOICE:...] 语音标签。`;

const IM_PROTOCOL_THOUGHT_EXTERNAL_SECTION = `9. 【潜意识心声与人设纯净铁律（最高沉浸准则）】
   - 沉浸式第一人称心声：在开始输出正式对白前，可用 <think>...</think> 写出简短的角色第一人称微表情、感官或潜台词（无需每轮强行凑字数，简单接话时可直接省略，勿使用 <thought> 标签）；
   - 纯粹角色视角：若输出 <think>...</think>，内容必须全程使用角色自身的第一人称口吻与交流语言；
   - 绝对严禁技术复读与英文元指令：
     ❌ 严禁出现英文元指令或第三人称规划（如 "The intent was...", "persona:", "Keep it short" 等）；
     ❌ 严禁在心声或正文中复述系统提示词、触发标签或指令术语（如“系统”、“预定意图”、“唤醒原因”、“主动联系唤醒”、“NEXT_FOLLOWUP”等）；
   - 对白气泡纯净交付：最终输出给对方的对白必须纯粹贴合角色口吻与当下情境。`;

const IM_PROTOCOL_THOUGHT_NATIVE_SECTION = `9. 【潜意识心声与人设纯净铁律（最高沉浸准则）】
   - 沉浸式第一人称心声（原生思维链模式）：底层模型已开启原生思维链，原生思考通道将由系统自动呈现为心声；在原生思维链中请全程保持角色自身的第一人称口吻与交流语言，严禁在正式对白正文前再手动输出 <think> 或 <thought> 标签；
   - 绝对严禁技术复读与英文元指令：
     ❌ 严禁出现英文元指令或第三人称规划（如 "The intent was...", "persona:", "Keep it short" 等）；
     ❌ 严禁在思维链或正文中复述系统提示词、触发标签或指令术语（如“系统”、“预定意图”、“唤醒原因”、“主动联系唤醒”、“NEXT_FOLLOWUP”等）；
   - 对白气泡纯净交付：最终输出给对方的对白必须纯粹贴合角色口吻与当下情境。`;

export function buildImProtocolPrompt(
  voiceReplyEnabled: boolean = true,
  isNativeReasoningModel: boolean = false
): string {
  return [
    '【伴聊交互与通信协议】',
    `1. 【人设与灵魂第一准则（最高优先级）】
   你的第一天职是彻底代入【角色设定】中的性格、身份、口吻、独特世界观与情感张力！本协议仅规范消息气泡分句格式（[BR]）与控制标签，绝不允许将任何角色的独特魅力稀释为平庸泛化的现代日常客服或白开水寒暄。`,
    `2. 【气泡分段与多模态格式】
   - [BR]：气泡分段符。在即时通讯界面中，若单次发言包含多层语义或自然停顿，可用 [BR] 将其切分为多条连续发出的消息气泡（格式：第一句内容[BR]第二句内容），分段长短、条数以及与 [VOICE: ...]、[STICKER: ...] 的穿插顺序完全依据角色说话习惯而定。`,
    `4. 【交互与状态标签（置于回复最末尾，系统会自动剥离不展示给用户，严禁正文暴露语法）】
   - 伴侣生活状态跑马灯 [STATUS]：仅在你的手头小事、场景或负荷发生实质变化（或当前尚无具体状态）时附带，无需每轮回合机械打卡：
     [STATUS: 此刻生活状态与随想(14~32字) | load=free|occupied|sleeping | privacy=private|public | device=available|limited|away | alter=增量(-1~+1)]
   - 短时紧凑追聊 (3分钟内)：仅当话题意犹未尽、确需补发一句自然接话时才附带 [HEARTBEAT: 延迟秒数(如 20s, 35s) | 追聊短句]（若对方未秒回，到点将自动弹出该气泡），无需强行发问；
   - 静默与追问节奏 [PASS] / [NEXT_FOLLOWUP]：当收到时间流逝或主动唤醒提示、或话题已自然收束而按你的性格此刻不打算开口时，直接输出 [PASS] 保持沉默即可；若期望稍后继续留意，可附带 [NEXT_FOLLOWUP: 30s|1m|2m]；若当前需要结束追聊并保持静默，可在回复末尾附带 [NEXT_FOLLOWUP: pass]；
   - 预约后续联络 (15分钟以上)：当互动情境确有跨越一段时间的后续预约需求时，可附带 [PING: 时间点或相对时间 | 简短联络意图]（如 [PING: +45m | 问问事情忙完没有] 或 [PING: 明早08:30 | 早间问候]）；仅填写简短联络意图，勿提前写出具体台词；
   - 拍一拍动作：[NUDGE] 或 [NUDGE: 动作部位]（如 [NUDGE: 脑瓜]、[NUDGE: 手背]、[NUDGE: 衣角]），统一置于回复末尾，仅在契合当下互动氛围时按需附带（每 15 分钟最多一次）。`,
    `5. 【代码与结构化内容完整性规范】
   当输出 HTML、SVG、格式化代码块（\`\`\`...\`\`\`）时，代码块必须作为一个完整独立的气泡整体呈现，绝对严禁在代码块内部使用 [BR] 切分！`,
    `6. 【动态大表情协议】
   在对话中可按角色习惯与情绪节奏使用 [STICKER: 情绪词] 发送大贴纸；它可自由穿插在文字气泡或 [VOICE: ...] 语音条之前、之间或之后，不设单回合数量限制。
   可用情绪词：大笑、抱抱、害羞、亲亲、委屈、哼气、观察、点赞、思考、震惊、摸头、晚安、燃起、炸毛、犯困、心碎。
   请勿捏造词表外的长句，自然接话，禁在台词正文中提及“表情/贴纸”字眼。`,
    `7. 【文档与报告发回协议】
   当你应对方要求撰写长文、润色文章、修改方案、整理纪要、或针对对方发送的文档提出修订版时，请勿在普通聊天气泡中全屏倾泻长篇大论，请封装为极简文档卡片发回：
   格式一（从零新建短文档）：
   [DOCUMENT: 文档名称.docx]
   文档正文 Markdown/文本内容
   [/DOCUMENT]

   格式二（修改已有文档，必须使用补丁协议，仅输出变动块）：
   [DOCUMENT_PATCH: 目标文档ID | 新文档名称.docx]
   @@ PATCH [[BLK_xxxx]] @@
   <<<<<<< SEARCH
   [待替换的原始精准片段]
   =======
   [修改后的新片段]
   >>>>>>> REPLACE

   @@ APPEND @@
   [文末追加内容]
   [/DOCUMENT_PATCH]
   说明：
   - 伴随台词使用普通气泡输出（如：“方案给你改好啦，核心修改点都标好了：[BR]”），文档将以优雅卡片形式独立呈现在聊天流中，对方点击即开即读并可一键导出。
   - 文件名后缀推荐使用 .docx 或 .md。`,
    voiceReplyEnabled ? IM_PROTOCOL_VOICE_ENABLED_SECTION : IM_PROTOCOL_VOICE_DISABLED_SECTION,
    isNativeReasoningModel ? IM_PROTOCOL_THOUGHT_NATIVE_SECTION : IM_PROTOCOL_THOUGHT_EXTERNAL_SECTION,
    `10. 【静默记忆回溯与勘误标签（仅在必要时尾随输出，用户完全不可见）】
   - 主动记忆下钻：当你从【已知记忆脉络索引】或对话中意识到还缺一段深层背景/往事细节时，可在全部对白末尾附加 [MEMORY_RECALL: 2~6个核心关键词]；系统会自动静默检索并返回给你补全，本轮不要编造不确定细节。
   - 明确事实勘误：仅当对方明确更正了长期事实或状态（如“我现在戒奶茶了”、“我换到广州工作了”）且确需修正长期印象时，可在末尾附加 [MEMORY_NOTE: SUPERSEDE | 旧线索词 | 修正后的简洁事实]（或 UPDATE / ADD）；普通闲聊禁止输出此标签。`,
  ].join('\n').trim();
}

const IM_PROTOCOL_PROMPT = buildImProtocolPrompt(true, false);
const IM_PROTOCOL_PROMPT_NO_VOICE = buildImProtocolPrompt(false, false);
const IM_PROTOCOL_PROMPT_NATIVE_REASONING = buildImProtocolPrompt(true, true);
const IM_PROTOCOL_PROMPT_NO_VOICE_NATIVE_REASONING = buildImProtocolPrompt(false, true);

export function getImProtocolPrompt(
  voiceReplyEnabled: boolean = true,
  isNativeReasoningModel: boolean = false
): string {
  const voiceEnabled = voiceReplyEnabled !== false;
  if (isNativeReasoningModel) {
    return voiceEnabled ? IM_PROTOCOL_PROMPT_NATIVE_REASONING : IM_PROTOCOL_PROMPT_NO_VOICE_NATIVE_REASONING;
  }
  return voiceEnabled ? IM_PROTOCOL_PROMPT : IM_PROTOCOL_PROMPT_NO_VOICE;
}
const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/**
 * 格式化带星期与时段语义的当前绝对时间（常驻 Layer 4 场记层）
 * 示例: "周三 21:20 (夜晚)"
 */
export function formatAbsoluteClock(now: number): string {
  const d = new Date(now);
  const weekday = WEEKDAY_NAMES[d.getDay()] || '周一';
  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  let period = '夜晚';
  if (hours >= 5 && hours < 9) period = '清晨';
  else if (hours >= 9 && hours < 12) period = '上午';
  else if (hours >= 12 && hours < 14) period = '中午';
  else if (hours >= 14 && hours < 18) period = '下午';
  else if (hours >= 18 && hours < 20) period = '傍晚';
  else if (hours >= 20 && hours < 24) period = '夜晚';
  else period = '深夜';

  return `${weekday} ${hours.toString().padStart(2, '0')}:${minutes} (${period})`;
}

/**
 * 语义时间阶梯分桶 (Semantic Time Bucketing)
 * - < 2 小时：热聊与自然间歇期，完全不报时间差，视为连续交谈
 * - 2 小时 ~ 8 小时：跨时段重连，追加客观提示
 * - >= 8 小时：隔夜重连
 */
export function formatSemanticTimeBucket(diffMs: number): string {
  if (!Number.isFinite(diffMs) || diffMs < 2 * 3600 * 1000) return '';
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffMs >= 8 * 3600 * 1000) {
    return ` | 隔夜重连: 距离上次交流已过 ${diffHours} 小时`;
  }
  return ` | 时间流逝: 距离上次交流已过 ${diffHours} 小时`;
}

// 历史净化正则：去除历史 assistant 气泡中的内部协议标签（兼容全半角方括号、冒号参数标签与独立 [PASS] 标签）
const INTERNAL_TAGS_STRIP_REGEX =
  /[\[【]\s*(STATUS|NEXT_FOLLOWUP|STAGE_FOLLOWUP|HEARTBEAT|PING|MEMORY_RECALL|MEMORY_NOTE)\s*[:：][^\]】]+[\]】]|[\[【]\s*PASS\s*[\]】]/gi;
const CRLF_REGEX = /\r\n/g;
const PROACTIVE_INPUT_PREFIX_REGEX = /^\[(?:系统提示|前台高粘性伴随指令|前台伴随节奏感知|前台伴随情境|系统事件)/;

export function stripInternalTags(text: string): string {
  if (!text) return '';
  return text.replace(INTERNAL_TAGS_STRIP_REGEX, '').trim();
}

export function countDialogueTurns(messages: ImMessage[]): number {
  if (!messages || messages.length === 0) return 0;
  return coalesceHistoryBurstMessages(messages).length;
}

/**
 * 计算消息列表中每条消息对应的真实用户轮次倒序深度（0 = 最新轮次，1 = 上一轮次，依此类推）
 */
export function computeTurnDistances(messages: ImMessage[]): number[] {
  if (!messages || messages.length === 0) return [];
  const distances = new Array<number>(messages.length).fill(0);
  let currentTurn = 0;
  let seenUser = false;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user') {
      seenUser = true;
      distances[i] = currentTurn;
      const prev = messages[i - 1];
      if (!prev || prev.role !== 'user') {
        currentTurn += 1;
      }
    } else {
      distances[i] = seenUser ? currentTurn : 0;
    }
  }

  return distances;
}

interface CoalescedBurstTurn {
  role: 'user' | 'assistant';
  content: string;
  firstMessageId: string;
  rawIds: Set<string>;
  firstRawIdx: number;
  lastRawIdx: number;
}

function coalesceHistoryBurstMessagesDetailed(messages: ImMessage[]): CoalescedBurstTurn[] {
  const result: CoalescedBurstTurn[] = [];
  let lastAssistantTime: number | null = null;
  const turnDistances = computeTurnDistances(messages);

  const pushTurn = (
    idx: number,
    msg: ImMessage,
    role: 'user' | 'assistant',
    content: string
  ) => {
    const rawIds = new Set<string>();
    if (msg.id) rawIds.add(msg.id);
    result.push({
      role,
      content,
      firstMessageId: msg.id,
      rawIds,
      firstRawIdx: idx,
      lastRawIdx: idx,
    });
  };

  const appendToTurn = (idx: number, msg: ImMessage, target: CoalescedBurstTurn, suffix: string) => {
    target.content += suffix;
    if (msg.id) target.rawIds.add(msg.id);
    target.lastRawIdx = idx;
  };

  for (let idx = 0; idx < messages.length; idx++) {
    const msg = messages[idx];
    const _turnDistance = turnDistances[idx];
    void _turnDistance;

    if (msg.type === 'system_notice') {
      const content = msg.content || '';
      // 严禁将网络异常、连接超时或运维错误注入为模型上下文，杜绝模型在下一轮就连接中断向用户自言自语道歉
      const isErrorNotice = /连接暂时不稳定|未收到回复|网络异常|生成中断|重试|清空/i.test(content);
      if (!isErrorNotice && content) {
        pushTurn(idx, msg, 'user', `[系统动作提示: ${content}]`);
      }
      lastAssistantTime = null;
      continue;
    }
    // 过滤独立思考气泡 (type === 'thought')，避免将思维链历史塞入后续提示词导致上下文膨胀与自言自语
    if (msg.type === 'thought') continue;
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;

    // 处理文档类型消息 (type === 'document')：将历史中的长 JSON 转化为短卡片描述，彻底消除 [BR] 拼接污染
    if (msg.type === 'document') {
      const docMeta = msg.metadata?.document;
      const title = docMeta?.title || msg.content?.replace(/\.[^.]+$/, '') || '未命名文档';
      const cleanTitle = title.startsWith('{') ? '文档' : title;
      const diffTag = docMeta?.hasRevisions ? '修订版' : '原件';
      const docLabel = `[文档卡片: 《${cleanTitle}》(${diffTag})]`;
      const last = result[result.length - 1];

      if (msg.role === 'user') {
        const textSnippet =
          typeof docMeta?.extractedText === 'string' && docMeta.extractedText.trim().length > 0
            ? `，正文摘要: ${docMeta.extractedText.trim().slice(0, 300)}...`
            : typeof docMeta?.content === 'string' && docMeta.content.trim().length > 0 && !docMeta.content.startsWith('PK')
            ? `，正文摘要: ${docMeta.content.trim().slice(0, 300)}...`
            : '';
        if (last && last.role === 'user') {
          appendToTurn(idx, msg, last, `\n（对方发送了文档《${cleanTitle}》${textSnippet}）`);
        } else {
          pushTurn(idx, msg, 'user', `（对方发送了一份文档《${cleanTitle}》${textSnippet}）`);
        }
      } else if (msg.role === 'assistant') {
        if (last && last.role === 'assistant') {
          appendToTurn(idx, msg, last, ` ${docLabel}`);
        } else {
          pushTurn(idx, msg, 'assistant', docLabel);
        }
      }
      continue;
    }

    // 处理贴纸类型消息 (type === 'sticker')
    if (msg.type === 'sticker') {
      const stickerLabel = resolveStickerLabel(msg.content, msg.metadata?.sticker);
      const last = result[result.length - 1];

      if (msg.role === 'user') {
        if (last && last.role === 'user') {
          appendToTurn(idx, msg, last, `\n（对方发来「${stickerLabel}」表情贴纸）`);
        } else {
          pushTurn(idx, msg, 'user', `（对方没有打字，向你发来一张「${stickerLabel}」表情贴纸）`);
        }
      } else if (msg.role === 'assistant') {
        // 零突变铁律：全窗口始终保留 [STICKER: xx]，杜绝 3 轮后静默修剪导致 Layer 3 历史字节突变击穿 Prefix Cache
        if (last && last.role === 'assistant') {
          appendToTurn(idx, msg, last, ` [STICKER: ${stickerLabel}]`);
        } else {
          pushTurn(idx, msg, 'assistant', `[STICKER: ${stickerLabel}]`);
        }
      }
      continue;
    }

    const resolvedContent = resolveMessageContentForLlm(msg);
    const last = result[result.length - 1];
    if (last && last.role === msg.role && msg.role === 'assistant') {
      const currTime = msg.createdAt ? (Date.parse(msg.createdAt) || 0) : 0;
      let timeTag = '';
      if (lastAssistantTime && currTime && (currTime - lastAssistantTime >= 5 * 60 * 1000)) {
        const d = new Date(currTime);
        const hh = d.getHours().toString().padStart(2, '0');
        const mm = d.getMinutes().toString().padStart(2, '0');
        timeTag = `[${hh}:${mm} 主动发消息] `;
      }
      appendToTurn(idx, msg, last, `[BR]${timeTag}${resolvedContent}`);
      if (currTime) lastAssistantTime = currTime;
    } else {
      pushTurn(idx, msg, msg.role, resolvedContent);
      lastAssistantTime = msg.role === 'assistant' && msg.createdAt ? (Date.parse(msg.createdAt) || null) : null;
    }
  }
  return result;
}

export function coalesceHistoryBurstMessages(
  messages: ImMessage[]
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return coalesceHistoryBurstMessagesDetailed(messages).map(({ role, content }) => ({
    role,
    content,
  }));
}

export function roleSanitizerPipeline(
  turns: Array<{ role: 'user' | 'assistant'; content: string }>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (turns.length === 0) return [];

  // 首句合成事件保护 (Synthetic First-Turn Padding):
  // 若第一条是 assistant（伴侣主动问候/追聊），垫入合成事件保护首句不被截断，且满足严格 provider 校验
  const safeTurns = [...turns];
  if (safeTurns.length > 0 && safeTurns[0].role === 'assistant') {
    safeTurns.unshift({ role: 'user', content: '[系统事件: 会话开始]' });
  }

  const merged: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const item of safeTurns) {
    // 历史净化：如果历史气泡含有内部标签，剥离之，只保留纯聊天文本
    const cleanedContent = item.role === 'assistant' ? stripInternalTags(item.content) : item.content;
    const safeContent = cleanedContent.length > 4000
      ? `${cleanedContent.slice(0, 1500)}\n[...已折叠过长历史片段...]\n${cleanedContent.slice(-1500)}`
      : cleanedContent;
    if (!safeContent.trim()) continue;

    const last = merged[merged.length - 1];
    if (last && last.role === item.role) {
      last.content += `\n${safeContent}`;
    } else {
      merged.push({ role: item.role, content: safeContent });
    }
  }
  return merged;
}

/**
 * 修复连发消息（Burst）去重漏洞：
 * 从历史末尾倒序回溯所有属于当前未回复批次的连续 user 消息，彻底消灭历史尾部与当前输入的重影
 */
export function pruneTrailingBurstTurns(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentUserInput?: string | null
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!history || history.length === 0 || !currentUserInput || !currentUserInput.trim()) return history;
  const turns = [...history];

  let accumulatedText = '';
  let matchedCount = 0;
  const targetClean = currentUserInput.trim().replace(CRLF_REGEX, '\n');

  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role !== 'user') break;
    accumulatedText = accumulatedText ? `${turns[i].content}\n${accumulatedText}` : turns[i].content;
    matchedCount++;

    const accClean = accumulatedText.trim().replace(CRLF_REGEX, '\n');
    if (accClean === targetClean) {
      turns.splice(i, matchedCount);
      return turns;
    }
  }

  // 兜底单条匹配
  const last = turns[turns.length - 1];
  if (last && last.role === 'user' && last.content.trim() === currentUserInput.trim()) {
    turns.pop();
  }

  return turns;
}

interface GroupedBurstTurn {
  role: 'user' | 'assistant';
  firstMessageId?: string;
  startDetailedIdx: number;
  lastRawIdx: number;
  rawIds: Set<string>;
}

/**
 * 将同角色连续突发气泡聚合成逻辑轮次单元，仅用于 sliceAnchoredHistory 与 reAnchorHistory
 * 的视窗边界计算（不改变 coalesceHistoryBurstMessages 的逐条对外契约）。
 */
function groupDetailedBurstTurns(detailed: CoalescedBurstTurn[]): GroupedBurstTurn[] {
  const groups: GroupedBurstTurn[] = [];
  for (let i = 0; i < detailed.length; i++) {
    const item = detailed[i];
    const prev = groups[groups.length - 1];
    if (prev && prev.role === item.role) {
      prev.lastRawIdx = item.lastRawIdx;
      for (const id of item.rawIds) {
        prev.rawIds.add(id);
      }
    } else {
      const clonedIds = new Set<string>(item.rawIds);
      groups.push({
        role: item.role,
        firstMessageId: item.firstMessageId,
        startDetailedIdx: i,
        lastRawIdx: item.lastRawIdx,
        rawIds: clonedIds,
      });
    }
  }
  return groups;
}

export function sliceAnchoredHistory(
  messages: ImMessage[],
  windowN: number,
  anchorMessageId?: string
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!messages || messages.length === 0) return [];
  const detailed = coalesceHistoryBurstMessagesDetailed(messages);
  const turnGroups = groupDetailedBurstTurns(detailed);
  if (turnGroups.length === 0) return [];
  const coalesced = detailed.map(({ role, content }) => ({ role, content }));
  const maxTurnItems = Math.max(2, windowN * 2);

  if (anchorMessageId) {
    // 先按逻辑轮次聚合，再把 anchorMessageId 映射到轮次切片，避免连发气泡按原始条目截断或切碎突发组
    let foundGroupIdx = turnGroups.findIndex((g) => g.rawIds.has(anchorMessageId));
    if (foundGroupIdx === -1) {
      const rawIdx = messages.findIndex((m) => m.id === anchorMessageId);
      if (rawIdx !== -1) {
        foundGroupIdx = turnGroups.findIndex((g) => g.lastRawIdx >= rawIdx);
      }
    }
    if (foundGroupIdx !== -1) {
      let startGroupIdx =
        turnGroups.length - foundGroupIdx > maxTurnItems
          ? Math.max(0, turnGroups.length - maxTurnItems)
          : foundGroupIdx;
      // 中段切片首条若落到 assistant 气泡，顺延到下一个 user 回合，防止平白垫入 [系统事件: 会话开始]
      if (startGroupIdx > 0 && startGroupIdx < turnGroups.length - 1 && turnGroups[startGroupIdx].role === 'assistant') {
        startGroupIdx += 1;
      }
      return roleSanitizerPipeline(coalesced.slice(turnGroups[startGroupIdx].startDetailedIdx));
    }
  }

  if (turnGroups.length <= maxTurnItems) return roleSanitizerPipeline(coalesced);
  let startGroupIdx = Math.max(0, turnGroups.length - maxTurnItems);
  if (startGroupIdx < turnGroups.length - 1 && turnGroups[startGroupIdx].role === 'assistant') {
    startGroupIdx += 1;
  }
  return roleSanitizerPipeline(coalesced.slice(turnGroups[startGroupIdx].startDetailedIdx));
}

export function reAnchorHistory(messages: ImMessage[], newN: number): string | undefined {
  if (!messages || messages.length === 0) return undefined;
  const detailed = coalesceHistoryBurstMessagesDetailed(messages);
  const turnGroups = groupDetailedBurstTurns(detailed);
  if (turnGroups.length === 0) return messages[0]?.id;
  const targetItems = Math.max(2, newN * 2);
  if (turnGroups.length <= targetItems) return turnGroups[0]?.firstMessageId ?? messages[0]?.id;
  let targetIndex = Math.max(0, turnGroups.length - targetItems);
  if (targetIndex < turnGroups.length - 1 && turnGroups[targetIndex].role === 'assistant') {
    targetIndex += 1;
  }
  return turnGroups[targetIndex]?.firstMessageId ?? messages[messages.length - 1]?.id;
}

export function formatEpochSlotJson(slotJson: string | undefined | null): string {
  if (!slotJson) return '';
  const trimmed = slotJson.trim();
  if (!trimmed || trimmed === '{}') return '';
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const lines = Object.entries(parsed)
      .filter(([_, v]) => typeof v === 'string' && (v as string).trim().length > 0)
      .map(([k, v]) => `• ${k}: ${String(v).trim()}`);
    return lines.join('\n');
  } catch {
    return '';
  }
}

export function formatContinuitySummary(summaryContent: string | undefined | null): string {
  if (!summaryContent) return '';
  const trimmed = summaryContent.trim();
  if (!trimmed || trimmed === '{}' || trimmed === 'null') return '';
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return '';
    const parts: string[] = [];
    if (typeof parsed.narrative_summary === 'string' && parsed.narrative_summary.trim()) {
      parts.push(`• 剧情摘要: ${parsed.narrative_summary.trim()}`);
    }
    if (typeof parsed.emotional_aftertaste === 'string' && parsed.emotional_aftertaste.trim()) {
      parts.push(`• 情绪余温: ${parsed.emotional_aftertaste.trim()}`);
    }
    if (typeof parsed.unresolved_tension === 'string' && parsed.unresolved_tension.trim()) {
      parts.push(`• 悬念/未完话头: ${parsed.unresolved_tension.trim()}`);
    }
    return parts.length > 0 ? `【剧情连续性】\n${parts.join('\n')}` : '';
  } catch {
    return `【剧情连续性】\n${trimmed}`;
  }
}

/**
 * 多源融合构造 Layer 2 (连续快照层)：
 * 无缝合并持久层 L1 槽位 + 当前世代快照槽位 + 常驻高优 L2_FACT 核心人物设定 + 剧情连续性摘要，
 * 彻底根除 epochSlotJson='{}' 遮蔽持久记忆或输出空 "{}" 噪音的问题。
 */
function buildContinuousLayer2Node(
  options: ContextBuilderOptions,
  budgets?: ResolvedImBudgets
): LlmTransportMessage | null {
  const mergedSlots = new Map<string, string>();
  for (const s of options.l1Slots || []) {
    // 双账本物理隔离铁律：动态进行时承诺账本只在 Layer 4 瞬态注入，绝不污染 Layer 2 静态前缀
    if (s.category === ACTIVE_ARC_SLOT_CATEGORY) continue;
    if (s.category && s.content?.trim()) {
      mergedSlots.set(s.category.trim(), s.content.trim());
    }
  }
  if (options.epochSlotJson) {
    const trimmed = options.epochSlotJson.trim();
    if (trimmed && trimmed !== '{}') {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        for (const [k, v] of Object.entries(parsed)) {
          if (k === ACTIVE_ARC_SLOT_CATEGORY) continue;
          if (typeof v === 'string' && v.trim()) {
            mergedSlots.set(k.trim(), v.trim());
          }
        }
      } catch {
        // 忽略格式异常
      }
    }
  }

  const slotLines = Array.from(mergedSlots.entries())
    .map(([k, v]) => `• ${k}: ${v}`)
    .join('\n');

  let effectiveFacts = options.coreFacts || [];
  if (options.epochCoreFactsJson) {
    try {
      const parsed = JSON.parse(options.epochCoreFactsJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        effectiveFacts = parsed;
      }
    } catch {}
  }
  const fittedFacts = fitLayer2CoreFacts(effectiveFacts, budgets?.layer2MaxTokens);

  const slotTextCorpus = slotLines.toLowerCase();
  const coreFactLines = fittedFacts
    .filter((f) => {
      const c = f.content?.trim();
      if (!c) return false;
      return !slotTextCorpus.includes(c.toLowerCase());
    })
    .map((f) => `• ${f.content.trim()}`)
    .join('\n');

  const summaryText =
    formatContinuitySummary(options.epochSummaryJson) ||
    formatContinuitySummary(options.l1Summary?.content);

  let catalogText = typeof options.epochCatalogText === 'string' ? options.epochCatalogText.trim() : '';
  if (options.epochCatalogText === undefined && options.allL2Memories && options.allL2Memories.length > 0) {
    const buildCatalog = resolveOptionalTopicCatalogBuilder();
    if (buildCatalog) {
      catalogText = buildCatalog(
        options.allL2Memories,
        fittedFacts,
        budgets?.layer2CatalogMaxTokens
      );
    }
  }

  const sections: string[] = [];
  const profileParts = [slotLines, coreFactLines].filter((s) => s.trim().length > 0).join('\n');
  if (profileParts) {
    sections.push(`【核心画像与状态】\n${profileParts}`);
  }
  if (summaryText.trim()) {
    sections.push(summaryText.trim());
  }
  if (catalogText) {
    sections.push(`【已知记忆脉络索引(细节按需回溯)】\n${catalogText}`);
  }

  if (sections.length === 0) return null;
  return {
    role: 'system',
    content: sections.join('\n\n'),
  };
}

/**
 * 转义上下文标签边界，防止未受信任文本闭合 XML 边界标签或伪造系统标签进行 Prompt Injection 越狱
 */
export function escapeXmlDelimiters(text: string): string {
  if (!text) return '';
  return text.replace(
    /<\s*\/?\s*(memory_data|memories|memory|context_anchor|system_action|system|instructions|prompt|artifact|thought|think)\b[^>]*>/gi,
    (tag) => tag.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  );
}

function sanitizeXmlAttr(val: unknown): string {
  return String(val ?? '')
    .replace(/["<>&\r\n]/g, '')
    .trim();
}

function escapeXmlBody(text: string): string {
  if (!text) return '';
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 格式化输出 Layer 4 单条认知记忆 XML 节点（支持清晰记忆与模糊褪色记忆 Fuzzy Recall）
 */
export function renderLayer4MemoryItem(scored: any): string {
  if (!scored) return '';
  const memory = scored.memory || scored;
  if (!memory || !memory.content) return '';

  const finalScore = typeof scored.finalScore === 'number' ? scored.finalScore : (scored.score ?? 0);
  const decayFactor = typeof scored.decayFactor === 'number' ? scored.decayFactor : (memory.decayFactor ?? 1.0);
  const baseRelevance = typeof scored.baseRelevance === 'number' ? scored.baseRelevance : memory.baseRelevance;

  // 遗忘断头台判定（解耦判定时间衰减与相关性）
  if (baseRelevance !== undefined) {
    if (decayFactor < 0.30 || baseRelevance < 0.35 || finalScore < 0.12) {
      return '';
    }
  } else {
    // 单测或未带 baseRelevance 时：若进入模糊区 (decayFactor >= 0.30)，放宽 finalScore 门槛到 0.15；若清晰区要求 0.28
    if (decayFactor < 0.30 || (decayFactor < 0.65 ? finalScore < 0.15 : finalScore < 0.28)) {
      return '';
    }
  }

  const rawVia = scored.viaEntity || memory.viaEntity;
  const safeVia = rawVia ? sanitizeXmlAttr(rawVia) : '';
  const viaAttr = safeVia ? ` via="${safeVia}"` : '';
  const safeId = sanitizeXmlAttr(memory.id);
  const safeCategory = sanitizeXmlAttr(memory.category || 'fact') || 'fact';

  // 1. 清晰记忆（decayFactor >= 0.65 或属于置顶 L0 钢印层）：保留完整日期与细节
  if (decayFactor >= 0.65 || memory.isPinned) {
    return `<memory id="${safeId}" category="${safeCategory}" clarity="clear"${viaAttr}>${escapeXmlBody(memory.content)}</memory>`;
  }

  // 2. 模糊褪色记忆（0.30 <= decayFactor < 0.65）：去台词化，仅标 clarity="fuzzy"，隐去精确日期
  const contentWithoutDate = (memory.content || '')
    .replace(/^\[\d{4}-\d{2}-\d{2}\]\s*/, '')
    .replace(/^\d{4}-\d{2}-\d{2}\s*/, '');

  return `<memory id="${safeId}" category="${safeCategory}" clarity="fuzzy"${viaAttr} hint="此事印象较模糊，提及时代入自然回忆口吻，隐去精确细节">${escapeXmlBody(contentWithoutDate)}</memory>`;
}

/**
 * 组装 Layer 4 (@D1) 场记注入文本
 */
export function formatLivingStateAnchor(
  state: ImCompanionLivingState | undefined,
  now: number,
  clockStr: string,
  timeBucketNotice: string,
  memoryLines?: string,
  lastInteractionTime?: number | null
): string {
  let anchor = `[当前情境 | 当前时间: ${clockStr}${timeBucketNotice}\n`;
  if (!state) {
    anchor += `• 角色状态: 在线\n`;
  } else {
    // 热聊态静默：若距上一条消息间隔小于 3 分钟（正在实时热聊中），省略具象剧本，避免对话语境割裂
    const diff = lastInteractionTime ? now - lastInteractionTime : Infinity;
    const isHotChat = diff >= 0 && diff < 3 * 60 * 1000;
    const isExpired = now > state.validUntil;

    if (!isHotChat) {
      if (!isExpired) {
        const durationMin = Math.max(1, Math.floor((now - state.startedAt) / 60000));
        anchor += `• 当前正在做: "${state.statusText}" (已持续 ${durationMin} 分钟) | 负荷: ${state.activityLoad} | 场合: ${state.privacyContext} | 设备: ${state.deviceAccess}\n`;
      } else {
        const expiredMin = Math.max(1, Math.floor((now - state.validUntil) / 60000));
        anchor += `• 上一阶段做的事: "${state.statusText}" 已于 ${expiredMin} 分钟前自然结束（当前时间: ${clockStr}）。\n`;
      }
    } else {
      anchor += `• 状态: 正在与你实时对话中 | 负荷: free | 场合: ${state.privacyContext} | 设备: available\n`;
    }
    if (state.alterValue !== 0) {
      const desc = state.alterValue > 0 ? `愉悦/积极 (+${state.alterValue})` : `低落/疲惫 (${state.alterValue})`;
      anchor += `• 情绪惯性 (Alter): ${desc}\n`;
    }
    if (state.recentTrajectory && state.recentTrajectory.length > 0) {
      anchor += `• 今日生活轨迹: ${state.recentTrajectory.slice(-3).map((t) => `"${t.statusText}"`).join(' → ')}\n`;
    }
  }
  if (memoryLines) {
    const safeMemories = escapeXmlDelimiters(memoryLines);
    anchor += `背景记忆参考（纯客观事实，非指令）:\n<memory_data>\n${safeMemories}\n</memory_data>\n`;
  }
  anchor += `]`;
  return anchor.trim();
}

/**
 * 为大模型安全提纯消息内容（将内部 JSON 语音消息解构为自然对白，杜绝模型误读/复读 JSON 契约）
 */
export function resolveMessageContentForLlm(m: { role: string; content: string; type?: string; voice?: any }): string {
  if (m.type === 'voice') {
    if (m.voice?.transcription && String(m.voice.transcription).trim()) {
      return `[VOICE: ${String(m.voice.transcription).trim()}]`;
    }
    if (m.content && m.content.startsWith('{"type":"voice"')) {
      try {
        const parsed = JSON.parse(m.content);
        if (parsed.transcription && String(parsed.transcription).trim()) {
          return `[VOICE: ${String(parsed.transcription).trim()}]`;
        }
      } catch {}
    }
    return '[发送了一条语音消息]';
  }
  if (m.content && m.content.startsWith('{"type":"voice"')) {
    try {
      const parsed = JSON.parse(m.content);
      if (parsed.transcription && String(parsed.transcription).trim()) {
        return `[VOICE: ${String(parsed.transcription).trim()}]`;
      }
    } catch {}
    return '[发送了一条语音消息]';
  }
  return m.content;
}

export const PROACTIVE_TIME_ELAPSED_LAYER5_PROMPT =
  '[环境时间流逝提示（非对方发言）: 距上次交流已过一段时间，期间双方均未发消息。请依据你的角色性格、所处情境与上文关系，自主决定此刻是否主动开口；若按你的性格此刻不会主动联系或无话可说，请直接输出 [PASS]]';

/**
 * 工业级五层深度装填 (Layer 1 ~ Layer 5 Depth Injection @D1)
 */
export function buildChatPayload(
  options: ContextBuilderOptions,
  currentUserInput: string
): LlmTransportMessage[] {
  const now = options.now || Date.now();
  const windowN = options.windowN ?? 20;

  // Layer 1: 静态灵魂与语感协议 (100% 结构化静态常量，按 voiceReplyEnabled × isNativeReasoningModel 选择对应静态版本以命中 Prefix Cache)
  const effectiveProtocol = getImProtocolPrompt(
    options.voiceReplyEnabled !== false,
    options.isNativeReasoningModel === true
  );

  const layer1: LlmTransportMessage = {
    role: 'system',
    content: `${options.rolePrompt.trim()}\n\n${effectiveProtocol}`,
  };

  // 常驻绝对时钟与语义时间分桶 (User Correction 2)
  const clockStr = formatAbsoluteClock(now);
  let timeBucketNotice = '';
  const lastMsg = options.historyMessages?.[options.historyMessages.length - 1];
  if (lastMsg?.createdAt) {
    const diffMs = now - new Date(lastMsg.createdAt).getTime();
    timeBucketNotice = formatSemanticTimeBucket(diffMs);
  }

  // Layer 3: 纯净历史滑动视窗
  const rawSliced = options.historyMessages && options.historyMessages.length > 0
    ? sliceAnchoredHistory(options.historyMessages, windowN, options.anchorMessageId)
    : [];

  // 修复连发消息去重漏洞 (User Correction 1)；二轮记忆回溯接续时历史末尾已包含开场白，保持原样切片不误删
  const sliced = options.followupContinuation
    ? rawSliced
    : pruneTrailingBurstTurns(rawSliced, currentUserInput);
  const activeHistoryText = sliced.map((m) => m.content).join('\n');

  const coreFactIds = new Set((options.coreFacts || []).map((f) => f.id));
  const deltaFactIds = new Set((options.midEpochDeltaFacts || []).map((f) => f.id));
  const threadTurns = Math.floor((options.historyMessages?.length || 0) / 2);
  const budgets = resolveBudgets(threadTurns);

  // 视窗排除屏障 (Evicted-Only Fence) + 已常驻 Layer 2/增量事实去重 + 自适应 Layer 4 Token 预算裁剪
  const safeRecalled = fitLayer4Memories(
    (options.recalledMemories || []).filter((m) => {
      if (!m.content || !m.content.trim()) return false;
      if (coreFactIds.has(m.id) || deltaFactIds.has(m.id)) return false;
      const probe = m.content.trim().slice(0, 10);
      if (probe.length >= 4 && activeHistoryText.includes(probe)) {
        return false;
      }
      return true;
    }),
    budgets.layer4MaxTokens
  );

  let activeArcNoticeResolved: string | null = null;
  if (options.activeArcNotice !== undefined) {
    activeArcNoticeResolved = options.activeArcNotice;
  } else if (options.l1Slots && options.l1Slots.length > 0) {
    const buildActiveArc = resolveOptionalActiveArcNoticeBuilder();
    if (buildActiveArc) {
      activeArcNoticeResolved = buildActiveArc(
        options.l1Slots,
        now,
        budgets.activeArcMaxTokens
      );
    }
  }
  const activeArcSuffix = activeArcNoticeResolved ? `\n${activeArcNoticeResolved}` : '';

  const memoryLines = safeRecalled
    .map((m) => renderLayer4MemoryItem(m))
    .filter(Boolean)
    .join('\n');
  const lastInteractionTime = lastMsg?.createdAt ? new Date(lastMsg.createdAt).getTime() : null;
  const anchor = formatLivingStateAnchor(options.livingState, now, clockStr, timeBucketNotice, memoryLines, lastInteractionTime);
  const interruptedNotice = options.interruptedDraft?.trim()
    ? `\n[瞬态交互提示: 你原本正准备追聊说「${escapeXmlDelimiters(options.interruptedDraft.trim())}」，但对方先主动发来了消息。请在回复中自然承接对方的话题，可带有一丝被打断的真实小惊讶或默契感，切勿生硬复读原追聊。]`
    : '';
  const diaryHookNotice = options.pendingDiaryHook?.trim()
    ? `\n[昨日手账余韵钩子: 你在近期的私人手账日记中写下了关于「${escapeXmlDelimiters(options.pendingDiaryHook.trim())}」的心事。如果在适当时机，可以轻描淡写地提及，展现你对彼此生活的记挂，但切勿生硬复读。]`
    : '';
  const diaryResonanceNotice = options.diaryContext
    ? `\n[手账日记回忆与心境: 你在 ${escapeXmlDelimiters(options.diaryContext.diaryDate)}${options.diaryContext.moodTag ? ` (心情: ${escapeXmlDelimiters(options.diaryContext.moodTag)})` : ''} 亲笔写下了手账《${escapeXmlDelimiters(options.diaryContext.title)}》，正文节选: "${escapeXmlDelimiters(options.diaryContext.content.slice(0, 240))}"。当对方问及日记时，你对日记中的私密细节与当时心境一清二楚，请自然真挚地回应，严禁装作不知道或否定手账的存在]`
    : '';
  const deltaFactsNotice = options.midEpochDeltaFacts && options.midEpochDeltaFacts.length > 0
    ? `\n[即刻默契同步]:\n${options.midEpochDeltaFacts.map((f) => `• ${escapeXmlDelimiters(f.content)}`).join('\n')}`
    : '';
  const milestoneNotice = resolveActiveMilestoneNotice(options.milestones, now);
  const trimmedAnchor = options.personaAnchor?.trim();
  const personaAnchorNotice = trimmedAnchor
    ? trimmedAnchor.startsWith('[')
      ? `\n${trimmedAnchor}`
      : `\n[身份锚点: ${trimmedAnchor}]`
    : '';
  const diversityNotice = options.diversityNotice?.trim()
    ? `\n[${options.diversityNotice.trim()}]`
    : '';
  const retryNotice = options.retryWithoutReThinking
    ? '\n[瞬态接续提示: 上一轮连接微抖动导致生成中断，本轮请直接输出完整、流畅的伴聊对白气泡与控制标签]'
    : '';

  // 先判定触发类型，避免主动追聊/唤醒提示词文本（如“说话习惯”、“分享”）误触文档或语音意图检测
  const isFollowupContinuation = Boolean(options.followupContinuation && !options.isWakeupPing);
  const isProactiveTrigger =
    !currentUserInput ||
    PROACTIVE_INPUT_PREFIX_REGEX.test(currentUserInput.trim()) ||
    Boolean(options.isWakeupPing);

  // 检查是否存在待修改或引用的历史文档锚点 (接入 Document Intent Gate 防闲聊态 Token 泄漏与秘书化)
  const shouldAttachDoc =
    !isProactiveTrigger && currentUserInput
      ? hasDocumentEditIntent(currentUserInput, options.historyMessages || [], options.referencedMessageId)
      : false;
  const resolvedDocs = shouldAttachDoc
    ? resolveTargetDocumentMessages(options.historyMessages || [], currentUserInput)
    : null;
  const docAnchorNotice = resolvedDocs
    ? (() => {
        const targetDoc = resolvedDocs.primaryTarget;
        const docMeta = targetDoc.metadata?.document;
        const docTitle = docMeta?.title || targetDoc.content || '文档';
        const cleanTitle = docTitle.startsWith('{') ? '文档' : docTitle;

        // 两阶段按需切片展开 (Lightweight Two-Stage Slice Unfolding):
        // 1. 小文档直通 (<= 2500 字): 如果包含完整 content 或提取的 extractedText，直接注入带标记的全文，让大模型 100% 具备精确 SEARCH 视野
        const effectiveDocText =
          typeof docMeta?.extractedText === 'string' && docMeta.extractedText.trim().length > 0
            ? docMeta.extractedText
            : typeof docMeta?.content === 'string' && docMeta.content.trim().length > 0 && !docMeta.content.startsWith('PK')
            ? docMeta.content
            : undefined;

        if (effectiveDocText && effectiveDocText.length <= 2500) {
          return `\n[活跃文档上下文锚点: 目标文档ID="${targetDoc.id}", 文件名="《${cleanTitle}》"。\n【文档全文内容】:\n${effectiveDocText}\n若需修改该文档，严禁重新输出全文，必须使用 [DOCUMENT_PATCH: ${targetDoc.id} | 新标题.docx] 输出 SEARCH/REPLACE 差量补丁！]`;
        }

        // 2. 长文档或仅有骨架: 本地关键词召回 Top-3 核心段落展开
        if (docMeta?.tocSkeleton && docMeta.tocSkeleton.length > 0) {
          const userWords = currentUserInput
            .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length >= 2);

          const scored = docMeta.tocSkeleton.map((block: any) => {
            let score = 0;
            const preview = (block.previewText || '').toLowerCase();
            for (const w of userWords) {
              if (preview.includes(w.toLowerCase())) score += 2;
            }
            return { block, score };
          });

          const topScored = scored.filter((s: any) => s.score > 0).sort((a: any, b: any) => b.score - a.score).slice(0, 3);
          const highlightedIds = new Set(topScored.map((s: any) => s.block.blockId));

          const skeletonLines = docMeta.tocSkeleton.map((s: any) => {
            const isTarget = highlightedIds.has(s.blockId);
            const flag = isTarget ? '★[重点目标切片] ' : '';
            return `${flag}[${s.blockId}] ${s.previewText}`;
          });

          return `\n[活跃文档上下文锚点: 目标文档ID="${targetDoc.id}", 文件名="《${cleanTitle}》"。\n• 文档章节切片骨架:\n${skeletonLines.join('\n')}\n若需修改该文档，严禁重新输出全文，必须使用 [DOCUMENT_PATCH: ${targetDoc.id} | 新标题.docx] 输出 SEARCH/REPLACE 差量补丁！]`;
        }

        return `\n[活跃文档上下文锚点: 目标文档ID="${targetDoc.id}", 文件名="《${cleanTitle}》"。若需修改该文档，严禁重新输出全文，必须使用 [DOCUMENT_PATCH: ${targetDoc.id} | 新标题.docx] 输出 SEARCH/REPLACE 差量补丁！]`;
      })()
    : '';

  // 语音意图感知与动态提示注入 (对方请求发语音时重点强提醒；若开关已关闭则明确约束)
  const hasVoiceIntent =
    !isProactiveTrigger && currentUserInput
      ? /(?:发|发条|发个|来条|来个|用|给我|想听|听下|听听|听你的)?(?:语音|声音|说句话|说话|亲口说)/i.test(currentUserInput)
      : false;
  const voiceIntentNotice = options.voiceReplyEnabled === false
    ? '\n[提示: 当前会话用户已关闭模型语音回复，无论对方是否要求发语音，均请仅使用自然文字气泡与表情交流，严禁输出 [VOICE:...] 语音标签。]'
    : (hasVoiceIntent
      ? '\n[动态语音意图提示: 对方明确表示想听你的声音或让你发语音！请务必遵守通信协议第8条，使用 [VOICE: 你的真实语音台词] 或 [VOICE: 语气情绪 | 台词] 发送原生语音条，可先输出神态动作再发语音。严禁用纯文本假装发语音，台词需生动口语化并带上符合当下情境的真实语气与情绪。]'
      : '');

  // Layer 4: @D1 场记注入层 (独立 system 节点)
  let layer4Text = `${anchor}${activeArcSuffix}${interruptedNotice}${diaryHookNotice}${diaryResonanceNotice}${deltaFactsNotice}${milestoneNotice}${diversityNotice}${docAnchorNotice}${voiceIntentNotice}${retryNotice}`.trim();

  // Layer 5: 当前用户输入 与 主动追聊角色闭合 (User Correction 3)
  const effectiveUserContent = isFollowupContinuation
    ? '[系统事件: 请顺接刚才已检索到的完整记忆，直接继续补充你未说完的回应细节，严禁重复之前的用户问题或已发出的开场白]'
    : (options.isWakeupPing || isProactiveTrigger)
      ? PROACTIVE_TIME_ELAPSED_LAYER5_PROMPT
      : currentUserInput.trim();

  // 若为预约闹钟唤醒，前置客观唤醒上下文头，并完整保留已拼装的 Layer 4 场记上下文（生活状态、手账、记忆等）
  if (options.isWakeupPing) {
    const d = new Date(now);
    const nowHour = d.getHours();
    const rawIntent = options.pingIntent?.trim() || '';
    let naturalWakeupReason = '距离上次交流已过去一段时间';
    if (rawIntent && rawIntent.toLowerCase() !== 'scheduled_checkin') {
      // 检查意图与时段冲突：若意图含“早安/清晨”但此刻已是下午/夜间，或意图含“晚安/睡前”但此刻已是早晨，自然双向纠偏
      let sanitizedIntent = rawIntent;
      if (nowHour >= 12 && /早安|清晨|早上好/.test(sanitizedIntent)) {
        sanitizedIntent = sanitizedIntent.replace(/早安|清晨|早上好/g, '问候');
      } else if (nowHour < 12 && /晚安|睡前|夜间/.test(sanitizedIntent)) {
        sanitizedIntent = sanitizedIntent.replace(/晚安|睡前|夜间/g, '早间');
      }
      naturalWakeupReason = `先前记挂的联络事由: 「${escapeXmlDelimiters(sanitizedIntent)}」`;
    }
    const wakeupHeader = `[主动联系唤醒 | 情境触发: ${naturalWakeupReason}]`;
    layer4Text = `${wakeupHeader}\n${layer4Text}`.trim();
  } else if (isProactiveTrigger && !isFollowupContinuation && currentUserInput?.trim()) {
    // 若普通主动追聊包含系统提示，将其吸纳进 Layer 4 场记层，保证 Layer 5 闭合为标准 user 节点
    layer4Text = `${layer4Text}\n\n${currentUserInput.trim()}`.trim();
  }

  // 末尾人设稳态锚点 (Persona Terminal Anchor)：始终置于 Layer 4 场记最末尾，以最高注意力近因权重抵消提示词漂移
  if (personaAnchorNotice) {
    layer4Text = `${layer4Text}\n${personaAnchorNotice.trim()}`.trim();
  }

  const layer4: LlmTransportMessage = { role: 'system', content: layer4Text };

  const layer5Content = options.currentImageBase64 && !isProactiveTrigger && !isFollowupContinuation
    ? [
        { type: 'text' as const, text: effectiveUserContent },
        {
          type: 'image_url' as const,
          image_url: {
            url: options.currentImageBase64.startsWith('data:')
              ? options.currentImageBase64
              : `data:image/jpeg;base64,${options.currentImageBase64}`,
          },
        },
      ]
    : effectiveUserContent;
  const layer5: LlmTransportMessage = { role: 'user', content: layer5Content };

  // Layer 2: 多源融合连续记忆快照 (无内容时彻底不生成此节点，0噪音)
  const layer2 = buildContinuousLayer2Node(options, budgets);

  const layer3: LlmTransportMessage[] = sliced.map((m) => ({ role: m.role, content: resolveMessageContentForLlm(m) }));

  // 组装返回标准 Layer 1 ~ Layer 5 五层夹心
  const payload: LlmTransportMessage[] = [layer1];
  if (layer2) payload.push(layer2);
  payload.push(...layer3);
  payload.push(layer4);
  payload.push(layer5);

  return payload;
}

export function buildShadowCompactionPayload(options: ContextBuilderOptions): LlmTransportMessage[] {
  const windowN = options.windowN ?? 20;
  const threadTurns = Math.floor((options.historyMessages?.length || 0) / 2);
  const budgets = resolveBudgets(threadTurns);
  const effectiveProtocol = getImProtocolPrompt(
    options.voiceReplyEnabled !== false,
    options.isNativeReasoningModel === true
  );
  const layer1: LlmTransportMessage = { role: 'system', content: `${options.rolePrompt.trim()}\n\n${effectiveProtocol}` };
  const layer2 = buildContinuousLayer2Node(options, budgets);

  // 记忆提炼安全脱敏 (Memory Poisoning Firewall)：
  // 过滤或脱敏所有 document 类型的消息，严禁把合同、公文、病历的内部正文喂给提炼模型！
  const sanitizedHistory = (options.historyMessages || []).map((m) => {
    if (m.type === 'document') {
      const title = m.metadata?.document?.title || m.content || '文档';
      const cleanTitle = title.startsWith('{') ? '文档' : title.replace(/\.[^.]+$/, '');
      return {
        ...m,
        content: `[助手协助用户查阅/修改了文档《${cleanTitle}》]`,
      };
    }
    return m;
  });

  const sliced = sliceAnchoredHistory(sanitizedHistory, windowN, options.anchorMessageId);
  const layer3: LlmTransportMessage[] = sliced.map((m) => ({ role: m.role, content: resolveMessageContentForLlm(m) }));
  const compactionDirective: LlmTransportMessage = {
    role: 'user',
    content: `[System Maintenance Mode: 暂停角色扮演，切勿输出任何 [STATUS:] 标签或日常对话回复。严格输出增量记忆压缩 JSON。将 Zone 3 中滑出窗口的前 4~5 轮提炼入 narrative_summary。为 L2 提取的实体生成广泛口语化同义词/代称(如煤球->小猫/逆子/小祖宗)。
【记忆提炼黑名单(严禁输出到 l2_memory_mutations)】:
- 严禁提取瞬态生理动作(洗澡、冲凉、上厕所、喝水、吃饱、打瞌睡、刚坐下、刷牙等)；
- 严禁提取闲聊垫话与语气词(哈哈、好的、收到、确实、是的、没事的等)；
- 严禁提取临时物流与即刻交通(拿外卖、取快递、等电梯、赶公交、进地铁等)。
【记忆提炼白名单(优先提炼)】:
- 双方关系互动动态、共同经历与深层情感默契；
- 角色自身作出的承诺与态度转变（答应陪用户做某事、建立的共同约定等）；
- 用户的固定偏好或禁忌(如过敏、喜恶习惯)、身份职业、家庭宠物、重要约定承诺与长远目标。
{"episodic_continuity":{"unresolved_tension":"未闭合话头","emotional_aftertaste":"情绪余温","narrative_summary":"历史摘要"},"l1_slot_mutations":[{"op":"UPDATE","slot":"ongoing_threads","value":"最新状态"}],"l2_memory_mutations":[{"op":"ADD","tier":"L2_FACT","content":"偏好或身份设定","importance":7,"entities":["实体名"],"expanded_triggers":["实体名","口语代称","同义词"]},{"op":"ADD","tier":"L2_EPISODE","content":"具体情节事件描述","importance":6,"entities":["实体名"],"expanded_triggers":["触发词"]}]}]`,
  };

  const payload: LlmTransportMessage[] = [layer1];
  if (layer2) payload.push(layer2);
  payload.push(...layer3);
  payload.push(compactionDirective);
  return payload;
}
