/**
 * Tag-Aware 流式切句状态机
 *
 * 核心职责：
 * 1. 扫描 [BR] 标签实时切出独立气泡短句。
 * 2. 隐形缓冲区暂存合法协议标签半截（如 "[B"、"[BR"、"[STATUS:"），杜绝语法残缺泄露到 UI。
 * 3. 严格前缀白名单机制：普通方括号（如 "[星际穿越]"、"[委屈]"）不被误吞或卡死。
 * 4. 过滤剥离 [STATUS:...]、[MOOD:...] 等协议元数据，保留正常中文方括号。
 */

const META_TAG_REGEX = /[[\[【]\s*(STATUS|MOOD|HEARTBEAT|NUDGE|NEXT_FOLLOWUP|STAGE_FOLLOWUP|PASS|PING|MEMORY_RECALL|MEMORY_NOTE)(?:[:：][^\]】\n]{0,340})?\s*[\]】]/gi;
const VALID_TAG_PREFIXES = [
  'BR]',
  'STICKER:',
  'STICKER：',
  'STICKER]',
  '表情:',
  '表情：',
  '表情]',
  'MOOD:',
  'STATUS:',
  'HEARTBEAT:',
  'MEMORY_RECALL:',
  'MEMORY_RECALL：',
  'MEMORY_NOTE:',
  'MEMORY_NOTE：',
  'VOICE:',
  'VOICE：',
  'VOICE]',
  '语音:',
  '语音：',
  '语音]',
  'NUDGE]',
  'NUDGE:',
  'NEXT_FOLLOWUP:',
  'STAGE_FOLLOWUP:',
  'PASS]',
  'PING:',
  'DOCUMENT:',
  'DOC:',
  '/DOCUMENT]',
  '/DOC]',
  'DOCUMENT_PATCH:',
  'DOC_PATCH:',
  '/DOCUMENT_PATCH]',
  '/DOC_PATCH]',
];
const SPLIT_PATTERN =
  /(\[br\s*\/?\]|<\/?br\s*\/?>|[[\[【]\s*(?:STICKER|表情)\s*(?:[:：][^\]】\n]{1,40}[\]】]|[\]】]\s*[:：]?\s*[^\s\[\]【】\n]{1,24}(?=(?:\s|\[br|<\/?br|\[|【)))|[[\[【]\s*(?:VOICE|语音)\s*(?:[:：](?:[^\[\]\]】]|\[[^\]\n]{1,60}\])+[\]】]|[\]】]\s*[:：]?\s*[^\[\]【】\n]+?(?=(?:\[br|<\/?br|\[|【))))/i;
const FLUSH_SPLIT_PATTERN =
  /(\[br\s*\/?\]|<\/?br\s*\/?>|[[\[【]\s*(?:STICKER|表情)\s*(?:[:：][^\]】\n]{1,40}[\]】]|[\]】]\s*[:：]?\s*[^\s\[\]【】\n]{1,24}(?=(?:\s|\[br|<\/?br|\[|【|$)))|[[\[【]\s*(?:VOICE|语音)\s*(?:[:：](?:[^\[\]\]】]|\[[^\]\n]{1,60}\])+[\]】]|[\]】]\s*[:：]?\s*[^\[\]【】\n]+?(?=(?:\[br|<\/?br|\[|【|\n|$))))/i;
const IS_CONTENT_TAG_REGEX = /[[\[【]\s*(?:VOICE|语音|STICKER|表情)\s*(?:[:：]|[\]】])/i;
const THINK_BLOCK_STRIP_REGEX = /<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/gi;
const THINK_TAG_STRIP_REGEX = /<\/?(?:think|thought)\s*\/?>/gi;
const CONTROL_TAG_RESCUE_REGEX = /(?:\[HEARTBEAT:\s*[^|\]]+\|\s*([^\]]+)\]|\[NEXT_FOLLOWUP:\s*[^|\]]+\|\s*([^\]]+)\])/i;
const MAX_TAG_BUFFER_LEN = 180;
const MAX_LONG_TAG_BUFFER_LEN = 340;

export interface DocumentStreamProgressEvent {
  streamId: string;
  tagType: 'DOCUMENT' | 'DOCUMENT_PATCH';
  title: string;
  baseMsgId?: string;
  streamedChars: number;
  latestHeading?: string;
  status: 'streaming' | 'compiling' | 'completed';
}

export interface TagAwareStreamOptions {
  onThoughtProgress?: (chunk: string, fullThought: string) => void;
  onThoughtCompleted?: (fullThought: string) => void;
  onDocumentStreamProgress?: (event: DocumentStreamProgressEvent) => void;
  onDocumentCompleted?: (doc: {
    tagType: 'DOCUMENT' | 'DOCUMENT_PATCH';
    rawTagBlock: string;
    isPartial?: boolean;
  }) => void;
  progressThrottleMs?: number;
}

export function isCandidateTagPrefix(tailAfterOpenBracket: string): boolean {
  if (tailAfterOpenBracket.length === 0) return true; // 刚收到 '['
  const upper = tailAfterOpenBracket.toUpperCase();
  // [MEMORY_NOTE: SUPERSEDE | hint(<=80) | content(<=180)] 合法长度可达 300 字符以上，需防止流中提前泄密
  const maxLen = upper.startsWith('MEMORY_NOTE') ? MAX_LONG_TAG_BUFFER_LEN : MAX_TAG_BUFFER_LEN;
  if (tailAfterOpenBracket.length > maxLen) return false;
  return VALID_TAG_PREFIXES.some(
    (prefix) =>
      prefix.startsWith(upper) ||
      ((prefix.endsWith(':') || prefix.endsWith('：')) && upper.startsWith(prefix))
  );
}

export function stripMetaTags(
  text: string,
  options?: { preserveContentTags?: boolean }
): string {
  let cleaned = text
    // 1. 成对标签与其正文整体剥离
    .replace(/\[(?:DOCUMENT|DOC):\s*[^\]\n]+\][\s\S]*?\[\/(?:DOCUMENT|DOC)\]/gi, '')
    .replace(/\[(?:DOCUMENT|DOC):\s*[^|\]\n]+\|\s*[\s\S]+?\]/gi, '')
    .replace(/\[(?:DOCUMENT_PATCH|DOC_PATCH):\s*[^|\]\n]+\|\s*[^\]\n]+\][\s\S]*?\[\/(?:DOCUMENT_PATCH|DOC_PATCH)\]/gi, '')
    .replace(THINK_BLOCK_STRIP_REGEX, '')
    // 2. 孤儿开闭标签强行剥离 (防止网络丢包、流中断或流切分残留)
    .replace(/\[\/?(?:DOCUMENT|DOC|DOCUMENT_PATCH|DOC_PATCH)(?::[^\]\n]*)?\]/gi, '')
    .replace(META_TAG_REGEX, '')
    // 3. 剥离深度思考遗留标签 (防止流切分边界残存裸露 <think> 或 </think>)
    .replace(THINK_TAG_STRIP_REGEX, '');

  if (!options?.preserveContentTags) {
    // 4. 残存语音协议脱水净化（即使流中残留语音控制指令，也剥壳还原为自然口语文案）
    cleaned = cleaned.replace(
      /[\[【]\s*(?:VOICE|语音)\s*(?:[:：]\s*(?:[^|\]】]+?\|)?\s*((?:[^\[\]\]】]|\[[^\]\n]{1,60}\])+?)[\]】]|[\]】]\s*[:：]?\s*(?:[^|\[\]【】\n]+?\|)?\s*([^\[\]【】\n]+))/gi,
      (_m, p1, p2) => (p1 || p2 || '').trim()
    );
  }

  return cleaned.replace(/[ \t]{2,}/g, ' ').trim();
}

export const META_SENTENCE_BLACKLIST_RE =
  /(?:现在系统|系统说|系统提示|系统事件|根据系统|按照指令|遵循设定|触发心跳|进入阶段|预定联系时间|主动发消息|主动发送消息|NEXT_FOLLOWUP|STAGE_FOLLOWUP|HEARTBEAT|MEMORY_RECALL|MEMORY_NOTE|STATUS|字数限制|个短句|口语短句|拆气泡|回复形态引导|表达节奏同调|表达纠偏|预定意图|唤醒原因|主动联系唤醒|早安问候|客服套路|气泡长短|提示词|生活情境与起念|the\s+intent\s+was|intent\s*[:：]|(?:\w+['’]s?\s+)?persona\s*[:：]|\w+\s+persona|natural\s+bubbles|keep\s+it\s+(?:short|brief|simple|natural)|\b(?:short|natural)\s+bubbles\b|system\s+prompt|system\s+instruction|the\s+context\s+says|as\s+per\s+instruction|in\s+character|she\s+asked|she\s+should|he\s+should|i\s+should\s+(?:naturally\s+)?acknowledge|he\s+didn't|did\s*n['’]?t\s+show|now\s+it's\s+\d{1,2}[:：]\d{2}|hours\s+since\s+last\s+contact|acknowledge\s+that|in\s+this\s+turn|the\s+user|the\s+companion|mild\s+dry\s+complaint|soppy|morning\s+plan)/i;

const TAG_PROTOCOL_STRIP_REGEX =
  /\[(?:STATUS|HEARTBEAT|NEXT_FOLLOWUP|STAGE_FOLLOWUP|PING|NUDGE|STICKER|VOICE|BR|MEMORY_RECALL|MEMORY_NOTE)[^\]]*\]/gi;
const CLAUSE_SPLIT_REGEX = /(?<=[。！？!?\n；;]|\.\s+|\.\n)/;
const CONSECUTIVE_NEWLINES_REGEX = /\n{3,}/g;
const LEVEL1_PROTOCOL_ANCHOR_RE =
  /\[br\s*\/?\]|<\/?br\s*\/?>|[[\[【]\s*(?:VOICE|语音|STICKER|表情)\s*(?:[:：]|[\]】]\s*[:：]?)/i;
const LEADING_PAREN_BLOCK_RE = /^\s*([\(（][^\)）]*[\)）])/;

/**
 * 分句级思考净化过滤器：
 * 彻底整句剥离技术指令与格式要求，将思考过程收敛为纯净自然的第一人称角色心声
 */
export function sanitizeThoughtForUi(
  rawThought: string,
  _options?: { isFinal?: boolean }
): string {
  if (!rawThought) return '';
  // 1. 先剥离显式方括号协议标签
  const withoutTags = rawThought.replace(TAG_PROTOCOL_STRIP_REGEX, '');
  // 2. 按中英文句末标点或换行切分为独立分句，命中系统元语义的分句整句剔除
  const clauses = withoutTags.split(CLAUSE_SPLIT_REGEX);
  const cleanClauses = clauses.filter(
    (clause) => !META_SENTENCE_BLACKLIST_RE.test(clause)
  );
  let cleaned = cleanClauses.join('').replace(CONSECUTIVE_NEWLINES_REGEX, '\n\n').trim();

  // 3. 若过滤后只残留孤立的标点符号、引号或纯空白，视为空
  if (cleaned && /^[\s.,;:!?'"“”‘’（）()—\-]+$/.test(cleaned)) {
    cleaned = '';
  }

  return cleaned;
}

function consumeLeadingParenBlocks(text: string): {
  consumedThought: string;
  remainingSuffix: string;
  blockCount: number;
} {
  const trimmed = text.trimStart();
  let cursor = 0;
  let blockCount = 0;

  while (cursor < trimmed.length) {
    const slice = trimmed.slice(cursor);
    const match = LEADING_PAREN_BLOCK_RE.exec(slice);
    if (!match) break;
    blockCount += 1;
    cursor += match[0].length;
  }

  return {
    consumedThought: trimmed.slice(0, cursor).trim(),
    remainingSuffix: trimmed.slice(cursor).trim(),
    blockCount,
  };
}

function isPureParenthesizedContent(text: string): boolean {
  const peeled = consumeLeadingParenBlocks(text);
  return peeled.blockCount > 0 && peeled.remainingSuffix.trim().length === 0;
}

/**
 * Priority 1 协议锚点抢救：识别 [BR] / <br> / [VOICE:...] / [STICKER:...]，
 * 回溯定位思考独白与正式台词分界，保证内容标签完整留在 dialogue 开头。
 */
export function extractThoughtAndDialogue(raw: string): { thought: string; dialogue: string } | null {
  const anchorMatch = raw.match(LEVEL1_PROTOCOL_ANCHOR_RE);
  if (!anchorMatch || anchorMatch.index === undefined) {
    return null;
  }
  const anchorIdx = anchorMatch.index;
  const anchorText = anchorMatch[0];
  const isContentTagAnchor = IS_CONTENT_TAG_REGEX.test(anchorText);
  const beforeAnchor = raw.slice(0, anchorIdx);

  const lastDoubleNewline = beforeAnchor.lastIndexOf('\n\n');
  const lastCloseParen = Math.max(beforeAnchor.lastIndexOf('）'), beforeAnchor.lastIndexOf(')'));
  const lastNewline = beforeAnchor.lastIndexOf('\n');

  let splitIdx = -1;
  if (lastDoubleNewline !== -1 && (lastCloseParen === -1 || lastDoubleNewline > lastCloseParen)) {
    splitIdx = lastDoubleNewline + 2;
  } else if (lastCloseParen !== -1 && lastCloseParen < anchorIdx) {
    const betweenParenAndAnchor = beforeAnchor.slice(lastCloseParen + 1);
    if (isContentTagAnchor && /^[\s。！？!?,，.；;：:—\-]*$/.test(betweenParenAndAnchor)) {
      splitIdx = anchorIdx;
    } else {
      splitIdx = lastCloseParen + 1;
    }
  } else if (lastNewline !== -1) {
    splitIdx = lastNewline + 1;
  } else {
    const puncMatches = [...beforeAnchor.matchAll(/([。！？!?]|\.\s+)(\s+|$)/g)];
    if (puncMatches.length > 0) {
      const lastPunc = puncMatches[puncMatches.length - 1];
      if (lastPunc.index !== undefined) {
        splitIdx = lastPunc.index + lastPunc[0].length;
      }
    }
  }

  if (splitIdx !== -1) {
    const thought = raw.slice(0, splitIdx).replace(THINK_TAG_STRIP_REGEX, '').trim();
    const dialogue = raw.slice(splitIdx).replace(THINK_TAG_STRIP_REGEX, '').trimStart();
    return { thought, dialogue };
  }

  // 兜底：无边界时，整段从起点视作正式对白（不吞掉任何前置口语词句与内容标签）
  return { thought: '', dialogue: raw.replace(THINK_TAG_STRIP_REGEX, '').trimStart() };
}

/**
 * 确定性三级未闭合思考块正文抢救：
 * - Priority 1（流中与收尾通用）：显式协议锚点 ([BR] / <br> / [VOICE:...] / [STICKER:...])
 * - Priority 2（仅 flush() 终局）：双换行段落边界（排除元指令与纯括号块）
 * - Priority 3（仅 flush() 终局）：连续前置括号独白剥离（仅当后缀含有效台词时生效）
 */
export function rescueUnclosedThinkingDialogue(
  raw: string,
  options?: { allowFlushHeuristics?: boolean }
): { thought: string; dialogue: string } | null {
  const priority1 = extractThoughtAndDialogue(raw);
  if (priority1) {
    return priority1;
  }

  if (!options?.allowFlushHeuristics) {
    return null;
  }

  const cleanedRaw = raw.replace(THINK_TAG_STRIP_REGEX, '');

  // Priority 2: 末个双换行段落边界切分
  const doubleNewlineIdx = cleanedRaw.lastIndexOf('\n\n');
  if (doubleNewlineIdx !== -1) {
    let thoughtCandidate = cleanedRaw.slice(0, doubleNewlineIdx).trim();
    let dialogueCandidate = cleanedRaw.slice(doubleNewlineIdx + 2).trim();
    const strippedDialogue = stripMetaTags(dialogueCandidate, { preserveContentTags: true }).trim();
    const isParenOnly = isPureParenthesizedContent(strippedDialogue);
    if (
      strippedDialogue.length > 0 &&
      !isParenOnly &&
      !META_SENTENCE_BLACKLIST_RE.test(strippedDialogue)
    ) {
      const peeled = consumeLeadingParenBlocks(dialogueCandidate);
      if (peeled.blockCount > 0) {
        const remainingSpoken = stripMetaTags(peeled.remainingSuffix, { preserveContentTags: true }).trim();
        if (remainingSpoken.length > 0 && !META_SENTENCE_BLACKLIST_RE.test(remainingSpoken)) {
          thoughtCandidate = thoughtCandidate
            ? `${thoughtCandidate}\n${peeled.consumedThought}`
            : peeled.consumedThought;
          dialogueCandidate = peeled.remainingSuffix;
        } else {
          dialogueCandidate = '';
        }
      }
      if (dialogueCandidate.trim().length > 0) {
        return {
          thought: thoughtCandidate,
          dialogue: dialogueCandidate.trim(),
        };
      }
    }
  }

  // Priority 3: 迭代消费连续前置括号块，仅当存在实质口语后缀时切分
  const leadingParens = consumeLeadingParenBlocks(cleanedRaw);
  if (leadingParens.blockCount > 0 && leadingParens.remainingSuffix.length > 0) {
    const spokenCheck = stripMetaTags(leadingParens.remainingSuffix, { preserveContentTags: true }).trim();
    if (spokenCheck.length > 0 && !META_SENTENCE_BLACKLIST_RE.test(spokenCheck)) {
      return {
        thought: leadingParens.consumedThought,
        dialogue: leadingParens.remainingSuffix,
      };
    }
  }

  return null;
}

export class TagAwareStreamParser {
  private buffer: string = '';
  private preThinkContent: string = '';
  private fullThoughtBuffer: string = '';
  private emittedThoughtLen: number = 0;
  private emittedCount: number = 0;
  private inThinking: boolean = false;
  private inCodeBlock: boolean = false;

  private activeDocState: {
    streamId: string;
    tagType: 'DOCUMENT' | 'DOCUMENT_PATCH';
    title: string;
    baseMsgId?: string;
    openTagRaw: string;
    bodyBuffer: string;
    lastEmitTime: number;
  } | null = null;

  private readonly options?: TagAwareStreamOptions;
  private readonly throttleMs: number;

  constructor(options?: TagAwareStreamOptions) {
    this.options = options;
    this.throttleMs = options?.progressThrottleMs ?? 180;
  }

  /**
   * 推送流式文本增量块，返回当前切出就绪的完整短句列表
   * 自动隐形过滤 <think>...</think> 思考内容，思考期间不输出任何气泡
   * 严格保护 Markdown 代码块 (```...```)，处于代码块内部时绝不按 [BR] 切分！
   */
  feed(chunk: string): string[] {
    this.buffer += chunk;
    this.filterThinkingBlock();
    this.checkDocumentProgress();

    const readySentences: string[] = [];

    while (!this.inThinking) {
      // 检查是否存在完整的 [BR] 或 [STICKER: xxx]（隐式气泡独立切分）
      const match = this.buffer.match(SPLIT_PATTERN);
      if (!match || match.index === undefined) {
        break;
      }

      // 如果当前处于文档块起草状态，禁止切分文档块内部或之后的任何内容
      if (this.activeDocState) {
        const docOpenIdx = this.buffer.indexOf(this.activeDocState.openTagRaw);
        if (docOpenIdx !== -1 && match.index >= docOpenIdx) {
          // 当前 [BR] 位于文档块内部，严禁作为聊天气泡切割！暂停切分等待文档块闭合
          break;
        }
      }

      // 检查当前 match.index 是否处于未闭合的代码块 (```) 内部
      const textBefore = this.buffer.slice(0, match.index);
      const codeFenceCount = (textBefore.match(/```/g) || []).length;
      const isInsideCodeBlock = this.inCodeBlock
        ? codeFenceCount % 2 === 0
        : codeFenceCount % 2 === 1;

      if (isInsideCodeBlock) {
        // [BR] 位于未闭合的代码块内部，严禁切割！寻找代码块闭合后的下一个 [BR]
        const nextFence = this.buffer.indexOf('```', match.index + match[0].length);
        if (nextFence === -1) {
          // 代码块尚未在当前 buffer 中闭合，暂停切分等待后续 chunk
          break;
        }

        // 找到了闭合 ```，寻找该闭合栅栏之后的下一个切分标签
        const afterFence = this.buffer.slice(nextFence + 3);
        const matchAfter = afterFence.match(SPLIT_PATTERN);
        if (!matchAfter || matchAfter.index === undefined) {
          // 闭合后尚未出现切分标签，暂停切分等待后续
          break;
        }

        const splitIdx = nextFence + 3 + matchAfter.index;
        const rawSentence = this.buffer.slice(0, splitIdx);
        const matchedDelimiter = matchAfter[0];
        this.buffer = this.buffer.slice(splitIdx + matchAfter[0].length);

        const totalFences = (rawSentence.match(/```/g) || []).length;
        if (totalFences % 2 !== 0) {
          this.inCodeBlock = !this.inCodeBlock;
        }

        const cleaned = stripMetaTags(rawSentence, { preserveContentTags: true });
        if (cleaned.length > 0) {
          readySentences.push(cleaned);
          this.emittedCount += 1;
        }

        // 如果切分界标本身是内容标签（如 [VOICE: ...] 或 [STICKER: ...]），则将其自身作为一个独立气泡发射
        if (IS_CONTENT_TAG_REGEX.test(matchedDelimiter)) {
          readySentences.push(matchedDelimiter.trim());
          this.emittedCount += 1;
        }
        continue;
      }

      // 检查当前 match.index 是否处于未闭合的裸 HTML/SVG 文档结构内部
      const lowerBefore = textBefore.toLowerCase();
      const hasHtmlStart = lowerBefore.includes('<!doctype html') || lowerBefore.includes('<html');
      const hasHtmlEnd = lowerBefore.includes('</html>');
      if (hasHtmlStart && !hasHtmlEnd) {
        const nextCloseHtml = this.buffer.toLowerCase().indexOf('</html>', match.index);
        if (nextCloseHtml === -1) {
          // HTML 文档尚未在当前 buffer 中闭合，暂停切分等待后续 chunk
          break;
        }
      }

      // 处于正常文本中，安全切分
      const rawSentence = this.buffer.slice(0, match.index);
      const matchedDelimiter = match[0];
      this.buffer = this.buffer.slice(match.index + match[0].length);

      const totalFences = (rawSentence.match(/```/g) || []).length;
      if (totalFences % 2 !== 0) {
        this.inCodeBlock = !this.inCodeBlock;
      }

      const cleaned = stripMetaTags(rawSentence, { preserveContentTags: true });
      if (cleaned.length > 0) {
        readySentences.push(cleaned);
        this.emittedCount += 1;
      }

      // 如果切分界标本身是内容标签（如 [VOICE: ...] 或 [STICKER: ...]），则将其自身作为一个独立气泡发射
      if (IS_CONTENT_TAG_REGEX.test(matchedDelimiter)) {
        readySentences.push(matchedDelimiter.trim());
        this.emittedCount += 1;
      }
    }

    return readySentences;
  }

  /**
   * 状态机：捕获并剥离 <think>...</think> 与 <thought>...</thought> 思考块
   * 支持大小写全覆盖，触发实时思考进度与闭合回调，并保护思考块前已收到的文本绝不被冲刷丢失
   */
  private filterThinkingBlock() {
    while (true) {
      const lower = this.buffer.toLowerCase();
      if (this.inThinking) {
        const closeThinkIdx = lower.indexOf('</think>');
        const closeThoughtIdx = lower.indexOf('</thought>');
        let closeIdx = -1;
        let closeTagLen = 0;

        if (closeThinkIdx !== -1 && (closeThoughtIdx === -1 || closeThinkIdx < closeThoughtIdx)) {
          closeIdx = closeThinkIdx;
          closeTagLen = 8;
        } else if (closeThoughtIdx !== -1) {
          closeIdx = closeThoughtIdx;
          closeTagLen = 10;
        }

        if (closeIdx !== -1) {
          // 找到了闭合标签，仅按 Priority 1 协议锚点检查块内是否误混入带标签正文，避免误拆多段正常 CoT
          const rawCandidate = this.fullThoughtBuffer + this.buffer.slice(0, closeIdx);
          const rescued = rescueUnclosedThinkingDialogue(rawCandidate, {
            allowFlushHeuristics: false,
          });
          let actualThought = rawCandidate.replace(THINK_TAG_STRIP_REGEX, '').trim();
          let rescuedDialogue = '';
          if (rescued && rescued.dialogue.trim().length > 0) {
            actualThought = rescued.thought;
            rescuedDialogue = rescued.dialogue;
          }

          if (actualThought.length > this.emittedThoughtLen) {
            const chunk = actualThought.slice(this.emittedThoughtLen);
            this.options?.onThoughtProgress?.(chunk, actualThought);
            this.emittedThoughtLen = actualThought.length;
          }
          this.options?.onThoughtCompleted?.(actualThought);

          this.fullThoughtBuffer = actualThought;
          this.buffer = rescuedDialogue + this.buffer.slice(closeIdx + closeTagLen);
          this.inThinking = false;
          // 恢复思考块前暂存的有效文本
          if (this.preThinkContent.length > 0) {
            this.buffer = this.preThinkContent + this.buffer;
            this.preThinkContent = '';
          }
        } else {
          // 【思考态正文抢救哨兵】流中仅依据 Priority 1 显式协议锚点抢救，避免多段 CoT 中的括号被误拆
          const currentCombined = this.fullThoughtBuffer + this.buffer;
          const rescued = rescueUnclosedThinkingDialogue(currentCombined, {
            allowFlushHeuristics: false,
          });
          if (rescued) {
            // 立即闭合思考，通知外部思考已结束，并将对白归还至 this.buffer
            if (rescued.thought.length > this.emittedThoughtLen) {
              const chunk = rescued.thought.slice(this.emittedThoughtLen);
              this.options?.onThoughtProgress?.(chunk, rescued.thought);
              this.emittedThoughtLen = rescued.thought.length;
            }
            this.options?.onThoughtCompleted?.(rescued.thought);
            this.fullThoughtBuffer = rescued.thought;
            this.buffer = rescued.dialogue;
            this.inThinking = false;
            if (this.preThinkContent.length > 0) {
              this.buffer = this.preThinkContent + this.buffer;
              this.preThinkContent = '';
            }
            // 退出思考循环，使外部主分句循环立即命中协议锚点并产出正文气泡
            break;
          }

          // 仍在思考块中，安全保留末尾 12 字符防截断标签（如 </thi + nk>），前面文本发射进度并移入 fullThoughtBuffer
          if (this.buffer.length > 12) {
            const safeThoughtPart = this.buffer.slice(0, this.buffer.length - 12);
            this.fullThoughtBuffer += safeThoughtPart;
            if (this.fullThoughtBuffer.length > this.emittedThoughtLen) {
              const chunk = this.fullThoughtBuffer.slice(this.emittedThoughtLen);
              this.options?.onThoughtProgress?.(chunk, this.fullThoughtBuffer);
              this.emittedThoughtLen = this.fullThoughtBuffer.length;
            }
            this.buffer = this.buffer.slice(-12);
          }
          break;
        }
      } else {
        const openThinkIdx = lower.indexOf('<think>');
        const openThoughtIdx = lower.indexOf('<thought>');
        let openIdx = -1;
        let openTagLen = 0;

        if (openThinkIdx !== -1 && (openThoughtIdx === -1 || openThinkIdx < openThoughtIdx)) {
          openIdx = openThinkIdx;
          openTagLen = 7;
        } else if (openThoughtIdx !== -1) {
          openIdx = openThoughtIdx;
          openTagLen = 9;
        }

        if (openIdx !== -1) {
          // 记录思考块之前的文本至 preThinkContent，切除思考标签头部；若同轮已有前序思考块则幂等追加合并
          const before = this.buffer.slice(0, openIdx);
          this.buffer = this.buffer.slice(openIdx + openTagLen);
          this.inThinking = true;
          if (this.fullThoughtBuffer.trim().length > 0) {
            this.fullThoughtBuffer += '\n';
            this.options?.onThoughtProgress?.('\n', this.fullThoughtBuffer);
            this.emittedThoughtLen = this.fullThoughtBuffer.length;
          } else {
            this.fullThoughtBuffer = '';
            this.emittedThoughtLen = 0;
          }
          if (before.length > 0) {
            this.preThinkContent += before;
          }
        } else {
          break;
        }
      }
    }
  }

  private checkDocumentProgress(): void {
    if (!this.activeDocState) {
      const openDocMatch = this.buffer.match(/\[(?:DOCUMENT|DOC):\s*([^\]\n]+?)\]/i);
      const openPatchMatch = this.buffer.match(/\[(?:DOCUMENT_PATCH|DOC_PATCH):\s*([^|\]\n]+?)\s*\|\s*([^\]\n]+?)\]/i);

      if (openDocMatch || openPatchMatch) {
        const isPatch = Boolean(openPatchMatch);
        const title = isPatch ? openPatchMatch![2].trim() : openDocMatch![1].trim();
        const baseMsgId = isPatch ? openPatchMatch![1].trim() : undefined;
        const openTagRaw = isPatch ? openPatchMatch![0] : openDocMatch![0];
        const streamId = `doc_stream_${Date.now()}`;

        this.activeDocState = {
          streamId,
          tagType: isPatch ? 'DOCUMENT_PATCH' : 'DOCUMENT',
          title,
          baseMsgId,
          openTagRaw,
          bodyBuffer: '',
          lastEmitTime: Date.now(),
        };

        this.options?.onDocumentStreamProgress?.({
          streamId,
          tagType: this.activeDocState.tagType,
          title,
          baseMsgId,
          streamedChars: 0,
          status: 'streaming',
        });
      }
    }

    if (this.activeDocState) {
      const closeTag = this.activeDocState.tagType === 'DOCUMENT_PATCH' ? /\[\/(?:DOCUMENT_PATCH|DOC_PATCH)\]/i : /\[\/(?:DOCUMENT|DOC)\]/i;
      const closeMatch = this.buffer.match(closeTag);

      if (closeMatch && closeMatch.index !== undefined) {
        const openIdx = this.buffer.indexOf(this.activeDocState.openTagRaw);
        const closeIdx = closeMatch.index;
        const closeLen = closeMatch[0].length;

        let rawTagBlock = '';
        let bodyContent = '';

        if (openIdx !== -1 && closeIdx >= openIdx) {
          rawTagBlock = this.buffer.slice(openIdx, closeIdx + closeLen);
          bodyContent = this.buffer.slice(openIdx + this.activeDocState.openTagRaw.length, closeIdx);
          // 物理切除整个文档块，从对话缓冲区中彻底剥离！
          this.buffer = this.buffer.slice(0, openIdx) + this.buffer.slice(closeIdx + closeLen);
        } else {
          const fullBlockMatch = this.activeDocState.tagType === 'DOCUMENT_PATCH'
            ? this.buffer.match(/\[(?:DOCUMENT_PATCH|DOC_PATCH):\s*[^|\]\n]+?\s*\|\s*[^\]\n]+?\]([\s\S]*?)\[\/(?:DOCUMENT_PATCH|DOC_PATCH)\]/i)
            : this.buffer.match(/\[(?:DOCUMENT|DOC):\s*([^\]\n]+?\])([\s\S]*?)\[\/(?:DOCUMENT|DOC)\]/i);
          rawTagBlock = fullBlockMatch ? fullBlockMatch[0] : '';
          bodyContent = fullBlockMatch ? fullBlockMatch[1] : '';
          if (fullBlockMatch && fullBlockMatch.index !== undefined) {
            this.buffer = this.buffer.slice(0, fullBlockMatch.index) + this.buffer.slice(fullBlockMatch.index + fullBlockMatch[0].length);
          }
        }

        this.options?.onDocumentStreamProgress?.({
          streamId: this.activeDocState.streamId,
          tagType: this.activeDocState.tagType,
          title: this.activeDocState.title,
          baseMsgId: this.activeDocState.baseMsgId,
          streamedChars: bodyContent.length,
          latestHeading: this.extractLatestHeading(bodyContent),
          status: 'compiling',
        });

        this.options?.onDocumentCompleted?.({
          tagType: this.activeDocState.tagType,
          rawTagBlock,
          isPartial: false,
        });

        this.activeDocState = null;
      } else {
        const openIdx = this.buffer.indexOf(this.activeDocState.openTagRaw);
        if (openIdx !== -1) {
          const bodySoFar = this.buffer.slice(openIdx + this.activeDocState.openTagRaw.length);
          const now = Date.now();
          if (now - this.activeDocState.lastEmitTime >= this.throttleMs) {
            this.activeDocState.lastEmitTime = now;
            this.options?.onDocumentStreamProgress?.({
              streamId: this.activeDocState.streamId,
              tagType: this.activeDocState.tagType,
              title: this.activeDocState.title,
              baseMsgId: this.activeDocState.baseMsgId,
              streamedChars: bodySoFar.length,
              latestHeading: this.extractLatestHeading(bodySoFar),
              status: 'streaming',
            });
          }
        }
      }
    }
  }

  private extractLatestHeading(body: string): string | undefined {
    const matches = body.match(/^(?:#{1,3}\s+(.+)|@@\s*PATCH\s*(\[\[BLK_\d+\]\])\s*@@)$/gm);
    if (!matches || matches.length === 0) return undefined;
    return matches[matches.length - 1].replace(/^(?:#{1,3}\s+|@@\s*PATCH\s*|\s*@@$)/g, '').trim().slice(0, 24);
  }

  /**
   * 流传输结束，冲刷隐形缓冲区中剩余的内容
   */
  flush(): string[] {
    if (this.activeDocState) {
      const openIdx = this.buffer.indexOf(this.activeDocState.openTagRaw);
      if (openIdx !== -1) {
        const bodyContent = this.buffer.slice(openIdx + this.activeDocState.openTagRaw.length);
        // 从对话缓冲区中剥离文档块，防止截断的半截文档泄漏成普通气泡
        this.buffer = this.buffer.slice(0, openIdx);
        if (this.options?.onDocumentCompleted && bodyContent.trim().length > 20) {
          const closeTag = this.activeDocState.tagType === 'DOCUMENT_PATCH' ? '[/DOCUMENT_PATCH]' : '[/DOCUMENT]';
          this.options.onDocumentCompleted({
            tagType: this.activeDocState.tagType,
            rawTagBlock: `${this.activeDocState.openTagRaw}${bodyContent}\n${closeTag}`,
            isPartial: true,
          });
        }
      }
      this.activeDocState = null;
    }
    if (this.inThinking) {
      const combined = this.fullThoughtBuffer + this.buffer;
      const rescued = rescueUnclosedThinkingDialogue(combined, {
        allowFlushHeuristics: true,
      });
      if (rescued) {
        if (rescued.thought.length > 0 || this.emittedThoughtLen > 0) {
          this.options?.onThoughtCompleted?.(rescued.thought);
        }
        this.fullThoughtBuffer = '';
        this.emittedThoughtLen = 0;
        this.buffer = '';
        this.inThinking = false;
        const remaining = stripMetaTags(this.preThinkContent + rescued.dialogue, { preserveContentTags: true });
        this.preThinkContent = '';
        if (remaining.length > 0) {
          return this.splitRemainingFallback(remaining);
        }
        return [];
      }

      // 检查 combined 中是否包含预埋控制标签台词
      const inThinkTagMatch = combined.match(CONTROL_TAG_RESCUE_REGEX);
      if (inThinkTagMatch && this.emittedCount === 0) {
        const rescuedMsg = (inThinkTagMatch[1] || inThinkTagMatch[2] || '').trim();
        if (rescuedMsg.length > 0) {
          const cleanRescued = stripMetaTags(rescuedMsg, { preserveContentTags: true });
          if (cleanRescued.length > 0) {
            this.fullThoughtBuffer = '';
            this.emittedThoughtLen = 0;
            this.buffer = '';
            this.inThinking = false;
            return this.splitRemainingFallback(cleanRescued);
          }
        }
      }

      if (this.buffer.length > 0) {
        this.fullThoughtBuffer += this.buffer;
        if (this.fullThoughtBuffer.length > this.emittedThoughtLen) {
          const chunk = this.fullThoughtBuffer.slice(this.emittedThoughtLen);
          this.options?.onThoughtProgress?.(chunk, this.fullThoughtBuffer);
          this.emittedThoughtLen = this.fullThoughtBuffer.length;
        }
      }
      const finalizedThought = this.fullThoughtBuffer.replace(THINK_TAG_STRIP_REGEX, '').trim();
      if (finalizedThought.length > 0 || this.emittedThoughtLen > 0) {
        this.options?.onThoughtCompleted?.(finalizedThought);
      }
      const recovered = this.preThinkContent;
      this.preThinkContent = '';
      this.fullThoughtBuffer = '';
      this.emittedThoughtLen = 0;
      this.buffer = '';
      this.inThinking = false;
      const remaining = stripMetaTags(recovered, { preserveContentTags: true });
      if (remaining.length > 0) {
        return this.splitRemainingFallback(remaining);
      }
      return [];
    }
    const full = this.preThinkContent + this.buffer;
    this.preThinkContent = '';
    this.buffer = '';
    const remaining = stripMetaTags(full, { preserveContentTags: true });
    if (remaining.length > 0) {
      return this.splitRemainingFallback(remaining);
    }

    // 控制标签降级转正文抢救：若本轮未产出主正文，将 [HEARTBEAT] 或 [NEXT_FOLLOWUP] 台词提取为主回复气泡
    if (this.emittedCount === 0) {
      const tagMatch = full.match(CONTROL_TAG_RESCUE_REGEX);
      if (tagMatch) {
        const rescuedMsg = (tagMatch[1] || tagMatch[2] || '').trim();
        if (rescuedMsg.length > 0) {
          const cleanRescued = stripMetaTags(rescuedMsg, { preserveContentTags: true });
          if (cleanRescued.length > 0) {
            return this.splitRemainingFallback(cleanRescued);
          }
        }
      }
    }

    return [];
  }

  /**
   * 仅对非代码块、非 HTML 的自然语段按语音/表情标签解构（使用冲刷期完整匹配正则）
   */
  private splitProseContentSegments(prose: string): Array<{ text: string; isTag: boolean }> {
    if (!IS_CONTENT_TAG_REGEX.test(prose)) {
      const trimmed = prose.trim();
      return trimmed ? [{ text: trimmed, isTag: false }] : [];
    }

    const segments: Array<{ text: string; isTag: boolean }> = [];
    let rem = prose;
    let m: RegExpMatchArray | null;
    while ((m = rem.match(FLUSH_SPLIT_PATTERN)) && m.index !== undefined) {
      const before = rem.slice(0, m.index).trim();
      if (before) {
        segments.push({ text: before, isTag: false });
      }
      const matched = m[0].trim();
      if (IS_CONTENT_TAG_REGEX.test(matched)) {
        segments.push({ text: matched, isTag: true });
      }
      rem = rem.slice(m.index + m[0].length);
    }
    const tail = rem.trim();
    if (tail) {
      segments.push({ text: tail, isTag: false });
    }
    return segments;
  }

  private splitProseParagraphsWithContentTags(prose: string): string[] {
    const out: string[] = [];
    const paragraphs = prose
      .split(/\r?\n\s*\r?\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    for (const para of paragraphs) {
      const segs = this.splitProseContentSegments(para);
      for (const seg of segs) {
        if (seg.text) out.push(seg.text);
      }
    }
    return out;
  }

  /**
   * 兜底降级拆分：若流式接收中完全未收到 [BR]，但存在自然换行，优雅拆分为多个独立气泡。
   * 特殊守卫：对 Markdown 代码块 (```...```) 或纯 HTML/SVG 整体保留为单个原子气泡，绝不在其内部做内容标签或换行切分！
   */
  private splitRemainingFallback(text: string): string[] {
    let processedText = text;

    // 1. 自动闭合未闭合的代码栅栏 (防止流中断或网络丢包导致 Markdown 代码块丢失闭合标记而惨遭逐行切碎)
    const fenceMatches = processedText.match(/```/g);
    if (fenceMatches && fenceMatches.length % 2 !== 0) {
      processedText = processedText + '\n```';
    }

    // 2. 优先抽离 Markdown 代码块 ```...```，仅对代码块之外的语段做段落与多模态标签拆分
    if (processedText.includes('```')) {
      const parts: string[] = [];
      const codeBlockRegex = /```[\s\S]*?```/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = codeBlockRegex.exec(processedText)) !== null) {
        const prose = processedText.slice(lastIndex, match.index).trim();
        if (prose.length > 0) {
          parts.push(...this.splitProseParagraphsWithContentTags(prose));
        }
        // 代码块整体作为一个独立完整气泡输出
        const codeBlock = match[0].trim();
        if (codeBlock.length > 0) {
          parts.push(codeBlock);
        }
        lastIndex = match.index + match[0].length;
      }

      const trailingProse = processedText.slice(lastIndex).trim();
      if (trailingProse.length > 0) {
        parts.push(...this.splitProseParagraphsWithContentTags(trailingProse));
      }

      if (parts.length > 0) {
        this.emittedCount += parts.length;
        return parts;
      }
    }

    // 3. 抽离嵌入的 HTML 文档或 SVG 标签 (即使前面有自然语言说明，也整体抽离为独立气泡)
    const htmlMatch = /<!doctype\s+html[\s\S]*?(?:<\/html>|$)|<html\b[\s\S]*?(?:<\/html>|$)|<svg\b[\s\S]*?(?:<\/svg>|$)/i.exec(processedText);
    if (htmlMatch) {
      const parts: string[] = [];
      const htmlStart = htmlMatch.index;
      const htmlBlock = htmlMatch[0].trim();
      const proseBefore = processedText.slice(0, htmlStart).trim();
      const proseAfter = processedText.slice(htmlStart + htmlMatch[0].length).trim();

      if (proseBefore.length > 0) {
        parts.push(...this.splitProseParagraphsWithContentTags(proseBefore));
      }
      if (htmlBlock.length > 0) {
        // 如果 HTML 没带代码块标记，包装为 ```html ... ``` 保护气泡与沙箱高亮
        parts.push(htmlBlock.startsWith('```') ? htmlBlock : `\`\`\`html\n${htmlBlock}\n\`\`\``);
      }
      if (proseAfter.length > 0) {
        parts.push(...this.splitProseParagraphsWithContentTags(proseAfter));
      }
      if (parts.length > 0) {
        this.emittedCount += parts.length;
        return parts;
      }
    }

    // 4. 纯自然语言：先按 [VOICE: ...] / [STICKER: ...] 拆分语段，再在必要时做换行拆句
    const proseSegments = this.splitProseContentSegments(processedText);

    if (this.emittedCount > 0) {
      const parts = proseSegments.map((s) => s.text).filter((l) => l.length > 0);
      if (parts.length > 0) {
        this.emittedCount += parts.length;
        return parts;
      }
      this.emittedCount += 1;
      return [text];
    }

    const parts: string[] = [];
    for (const seg of proseSegments) {
      if (seg.isTag) {
        parts.push(seg.text);
        continue;
      }
      const lines = seg.text
        .split(/\r?\n+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      parts.push(...lines);
    }

    if (parts.length > 0) {
      this.emittedCount += parts.length;
      return parts;
    }

    this.emittedCount += 1;
    return [processedText];
  }

  /**
   * 是否正在思考中（用于驱动 UI “正在输入中”微动效）
   */
  isThinking(): boolean {
    return this.inThinking;
  }

  /**
   * 判断当前缓冲区尾部是否可能是一个不完整的合法协议半标签
   */
  hasIncompleteTag(): boolean {
    const lastBracketOpen = this.buffer.lastIndexOf('[');
    const lastChineseOpen = this.buffer.lastIndexOf('【');
    const lastOpen = Math.max(lastBracketOpen, lastChineseOpen);
    if (lastOpen === -1) return false;

    const lastBracketClose = this.buffer.lastIndexOf(']');
    const lastChineseClose = this.buffer.lastIndexOf('】');
    const lastClose = Math.max(lastBracketClose, lastChineseClose);
    if (lastClose > lastOpen) return false;

    const tailAfterOpen = this.buffer.slice(lastOpen + 1);
    return isCandidateTagPrefix(tailAfterOpen);
  }

  getEmittedCount(): number {
    return this.emittedCount;
  }
}
