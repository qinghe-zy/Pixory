/**
 * Tag-Aware 流式切句状态机
 *
 * 核心职责：
 * 1. 扫描 [BR] 标签实时切出独立气泡短句。
 * 2. 隐形缓冲区暂存合法协议标签半截（如 "[B"、"[BR"、"[STATUS:"），杜绝语法残缺泄露到 UI。
 * 3. 严格前缀白名单机制：普通方括号（如 "[星际穿越]"、"[委屈]"）不被误吞或卡死。
 * 4. 过滤剥离 [STATUS:...]、[MOOD:...] 等协议元数据，保留正常中文方括号。
 */

const META_TAG_REGEX = /[[\[【]\s*(STATUS|MOOD|HEARTBEAT|NUDGE|NEXT_FOLLOWUP|STAGE_FOLLOWUP|PASS|PING)(?:[:：][^\]】\n]+)?\s*[\]】]/gi;
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
  /(\[br\s*\/?\]|<\/?br\s*\/?>|[[\[【]\s*(?:STICKER|表情)\s*(?:[:：]\s*[^\]】]{1,10}?\s*[\]】]|[\]】]\s*[:：]?\s*[^\[\]\n]{1,10}?(?=(?:\[br|<\/?br|$)))|[[\[【]\s*(?:VOICE|语音)\s*(?:[:：]\s*[^\]】]+?\s*[\]】]|[\]】]\s*[:：]?\s*[^\[\]\n]+?(?=(?:\[br|<\/?br|$))))/i;
const IS_CONTENT_TAG_REGEX = /[[\[【]\s*(?:VOICE|语音|STICKER|表情)\s*(?:[:：]|\])/i;
const THINK_BLOCK_STRIP_REGEX = /<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/gi;
const THINK_TAG_STRIP_REGEX = /<\/?(?:think|thought)\s*\/?>/gi;
const CONTROL_TAG_RESCUE_REGEX = /(?:\[HEARTBEAT:\s*[^|\]]+\|\s*([^\]]+)\]|\[NEXT_FOLLOWUP:\s*[^|\]]+\|\s*([^\]]+)\])/i;
const MAX_TAG_BUFFER_LEN = 80;

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
  if (tailAfterOpenBracket.length > MAX_TAG_BUFFER_LEN) return false;
  const upper = tailAfterOpenBracket.toUpperCase();
  return VALID_TAG_PREFIXES.some((prefix) => prefix.startsWith(upper));
}

export function stripMetaTags(text: string): string {
  return text
    // 1. 成对标签与其正文整体剥离
    .replace(/\[(?:DOCUMENT|DOC):\s*[^\]\n]+\][\s\S]*?\[\/(?:DOCUMENT|DOC)\]/gi, '')
    .replace(/\[(?:DOCUMENT|DOC):\s*[^|\]\n]+\|\s*[\s\S]+?\]/gi, '')
    .replace(/\[(?:DOCUMENT_PATCH|DOC_PATCH):\s*[^|\]\n]+\|\s*[^\]\n]+\][\s\S]*?\[\/(?:DOCUMENT_PATCH|DOC_PATCH)\]/gi, '')
    .replace(THINK_BLOCK_STRIP_REGEX, '')
    // 2. 孤儿开闭标签强行剥离 (防止网络丢包、流中断或流切分残留)
    .replace(/\[\/?(?:DOCUMENT|DOC|DOCUMENT_PATCH|DOC_PATCH)(?::[^\]\n]*)?\]/gi, '')
    .replace(META_TAG_REGEX, '')
    // 3. 剥离深度思考遗留标签 (防止流切分边界残存裸露 <think> 或 </think>)
    .replace(THINK_TAG_STRIP_REGEX, '')
    // 4. 残存语音协议脱水净化（即使流中残留语音控制指令，也剥壳还原为自然口语文案）
    .replace(/[\[【]\s*(?:VOICE|语音)\s*(?:[:：]\s*(?:[^|\]】]+?\|)?\s*([^\]】]+?)\s*[\]】]|[\]】]\s*[:：]?\s*(?:[^|\[\]【】\n]+?\|)?\s*([^\[\]【】\n]+))/gi, (_m, p1, p2) => (p1 || p2 || '').trim())
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export const META_SENTENCE_BLACKLIST_RE =
  /(?:现在系统|系统说|系统提示|系统事件|根据系统|按照指令|遵循设定|触发心跳|进入阶段|预定联系时间|主动发消息|主动发送消息|NEXT_FOLLOWUP|STAGE_FOLLOWUP|HEARTBEAT|STATUS|字数限制|个短句|口语短句|拆气泡|回复形态引导|表达节奏同调|表达纠偏|预定意图|唤醒原因|主动联系唤醒|早安问候|客服套路|气泡长短|提示词|生活情境与起念|the\s+intent\s+was|intent\s*[:：]|(?:\w+['’]s?\s+)?persona\s*[:：]|\w+\s+persona|natural\s+bubbles|keep\s+it\s+(?:short|brief|simple|natural)|\b(?:short|natural)\s+bubbles\b|system\s+prompt|system\s+instruction|the\s+context\s+says|as\s+per\s+instruction|in\s+character|she\s+asked|she\s+should|he\s+should|i\s+should|he\s+didn't|did\s*n['’]?t\s+show|now\s+it's\s+\d{1,2}[:：]\d{2}|hours\s+since\s+last\s+contact|acknowledge\s+that|in\s+this\s+turn|the\s+user|the\s+companion|mild\s+dry\s+complaint|soppy|morning\s+plan)/i;

const TAG_PROTOCOL_STRIP_REGEX =
  /\[(?:STATUS|HEARTBEAT|NEXT_FOLLOWUP|STAGE_FOLLOWUP|PING|NUDGE|STICKER|VOICE|BR)[^\]]*\]/gi;
const CLAUSE_SPLIT_REGEX = /(?<=[。！？!?\n；;]|\.\s+|\.\n)/;
const CONSECUTIVE_NEWLINES_REGEX = /\n{3,}/g;

/**
 * 分句级思考净化过滤器：
 * 彻底整句剥离技术指令与格式要求，将思考过程收敛为如竞品般纯净自然的第一人称角色心声
 */
export function sanitizeThoughtForUi(
  rawThought: string,
  options?: { isFinal?: boolean }
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

  if (cleaned) return cleaned;
  // 仅在流结束（isFinal = true）且被全部滤空时才给角色潜台词兜底，防止流式初期闪烁
  return options?.isFinal ? '（看着屏幕，心里悄悄盘算着要怎么跟你说……）' : '';
}

/**
 * 智能哨兵：从疑似混杂了思考与对白正文的字符串中抢救对白
 * 用于解决模型未闭合 </think> 或在思考块内直接输出台词与 [BR] 的问题
 */
export function extractThoughtAndDialogue(raw: string): { thought: string; dialogue: string } | null {
  const brMatch = raw.match(/\[br\s*\/?\]|<\/?br\s*\/?>/i);
  if (!brMatch || brMatch.index === undefined) {
    return null;
  }
  const brIdx = brMatch.index;
  const beforeBr = raw.slice(0, brIdx);

  // 1. 优先寻找 br 之前的最后一个封闭括号（）或 )（内心独白结束标记）
  const lastCloseParen = Math.max(beforeBr.lastIndexOf('）'), beforeBr.lastIndexOf(')'));
  if (lastCloseParen !== -1 && lastCloseParen < brIdx) {
    const thought = raw.slice(0, lastCloseParen + 1).replace(THINK_TAG_STRIP_REGEX, '').trim();
    const dialogue = raw.slice(lastCloseParen + 1).replace(THINK_TAG_STRIP_REGEX, '').trimStart();
    return { thought, dialogue };
  }

  // 2. 寻找 br 之前的换行标记
  const lastDoubleNewline = beforeBr.lastIndexOf('\n\n');
  if (lastDoubleNewline !== -1) {
    const thought = raw.slice(0, lastDoubleNewline).replace(THINK_TAG_STRIP_REGEX, '').trim();
    const dialogue = raw.slice(lastDoubleNewline + 2).replace(THINK_TAG_STRIP_REGEX, '').trimStart();
    return { thought, dialogue };
  }
  const lastNewline = beforeBr.lastIndexOf('\n');
  if (lastNewline !== -1) {
    const thought = raw.slice(0, lastNewline).replace(THINK_TAG_STRIP_REGEX, '').trim();
    const dialogue = raw.slice(lastNewline + 1).replace(THINK_TAG_STRIP_REGEX, '').trimStart();
    return { thought, dialogue };
  }

  // 3. 寻找 br 之前的句末标点（。/！/!/?/？或英文句号+空格）
  const puncMatches = [...beforeBr.matchAll(/([。！？!?]|\.\s+)(\s+|$)/g)];
  if (puncMatches.length > 0) {
    const lastPunc = puncMatches[puncMatches.length - 1];
    if (lastPunc.index !== undefined) {
      const splitPoint = lastPunc.index + lastPunc[0].length;
      const thought = raw.slice(0, splitPoint).replace(THINK_TAG_STRIP_REGEX, '').trim();
      const dialogue = raw.slice(splitPoint).replace(THINK_TAG_STRIP_REGEX, '').trimStart();
      return { thought, dialogue };
    }
  }

  // 4. 兜底：若之前没有标点，但出现了 [BR]，则 [BR] 及其前置词句必定是对白
  return { thought: '', dialogue: raw.replace(THINK_TAG_STRIP_REGEX, '').trimStart() };
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

        const cleaned = stripMetaTags(rawSentence);
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

      const cleaned = stripMetaTags(rawSentence);
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
          // 找到了闭合标签，严防模型把对白台词包进 </think> 之前导致正文被全量吞没
          const rawCandidate = this.fullThoughtBuffer + this.buffer.slice(0, closeIdx);
          const rescued = extractThoughtAndDialogue(rawCandidate);
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
          // 【思考态正文抢救哨兵】未闭合 </think> 但缓冲区已出现 [BR] 或台词
          const currentCombined = this.fullThoughtBuffer + this.buffer;
          const rescued = extractThoughtAndDialogue(currentCombined);
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
            // 退出思考循环，使外部主分句循环立即命中 [BR] 并产出正文气泡
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
          // 记录思考块之前的文本至 preThinkContent，切除思考标签头部
          const before = this.buffer.slice(0, openIdx);
          this.buffer = this.buffer.slice(openIdx + openTagLen);
          this.inThinking = true;
          this.fullThoughtBuffer = '';
          this.emittedThoughtLen = 0;
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
    if (!this.options?.onDocumentStreamProgress && !this.options?.onDocumentCompleted) return;

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

        this.options.onDocumentStreamProgress?.({
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

        this.options.onDocumentStreamProgress?.({
          streamId: this.activeDocState.streamId,
          tagType: this.activeDocState.tagType,
          title: this.activeDocState.title,
          baseMsgId: this.activeDocState.baseMsgId,
          streamedChars: bodyContent.length,
          latestHeading: this.extractLatestHeading(bodyContent),
          status: 'compiling',
        });

        this.options.onDocumentCompleted?.({
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
            this.options.onDocumentStreamProgress?.({
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
    if (this.activeDocState && this.options?.onDocumentCompleted) {
      const openIdx = this.buffer.indexOf(this.activeDocState.openTagRaw);
      if (openIdx !== -1) {
        const bodyContent = this.buffer.slice(openIdx + this.activeDocState.openTagRaw.length);
        // 从对话缓冲区中剥离文档块，防止截断的半截文档泄漏成普通气泡
        this.buffer = this.buffer.slice(0, openIdx);
        if (bodyContent.trim().length > 20) {
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
      const rescued = extractThoughtAndDialogue(combined);
      if (rescued) {
        if (rescued.thought.length > 0) {
          this.options?.onThoughtCompleted?.(rescued.thought);
        }
        this.fullThoughtBuffer = '';
        this.buffer = '';
        this.inThinking = false;
        const remaining = stripMetaTags(this.preThinkContent + rescued.dialogue);
        this.preThinkContent = '';
        if (remaining.length > 0) {
          return this.splitRemainingFallback(remaining);
        }
        return [];
      }

      // 检查末尾是否存在独白括号闭合后紧随的未切分台词： (独白...) 台词正文 (必须以括号开头)
      const parenDialogueMatch = combined.match(/^([\(（][\s\S]*?[）\)])\s*([^\(（]+)$/);
      if (parenDialogueMatch && parenDialogueMatch[2].trim().length > 0) {
        const thoughtPart = parenDialogueMatch[1].trim();
        const dialoguePart = parenDialogueMatch[2].trim();
        if (thoughtPart.length > 0) {
          this.options?.onThoughtCompleted?.(thoughtPart);
        }
        this.fullThoughtBuffer = '';
        this.buffer = '';
        this.inThinking = false;
        const remaining = stripMetaTags(this.preThinkContent + dialoguePart);
        this.preThinkContent = '';
        if (remaining.length > 0) {
          return this.splitRemainingFallback(remaining);
        }
        return [];
      }

      // 未闭合思考块吞噬正文抢救：检查双换行后的角色台词
      const doubleNewlineIdx = combined.lastIndexOf('\n\n');
      if (doubleNewlineIdx !== -1) {
        const thoughtCandidate = combined.slice(0, doubleNewlineIdx).replace(THINK_TAG_STRIP_REGEX, '').trim();
        const dialogueCandidate = combined.slice(doubleNewlineIdx + 2).replace(THINK_TAG_STRIP_REGEX, '').trim();
        if (dialogueCandidate.length > 0) {
          if (thoughtCandidate.length > 0) {
            this.options?.onThoughtCompleted?.(thoughtCandidate);
          }
          this.fullThoughtBuffer = '';
          this.buffer = '';
          this.inThinking = false;
          const remaining = stripMetaTags(this.preThinkContent + dialogueCandidate);
          this.preThinkContent = '';
          if (remaining.length > 0) {
            return this.splitRemainingFallback(remaining);
          }
        }
      }

      // 检查 combined 中是否包含预埋控制标签台词
      const inThinkTagMatch = combined.match(CONTROL_TAG_RESCUE_REGEX);
      if (inThinkTagMatch && this.emittedCount === 0) {
        const rescuedMsg = (inThinkTagMatch[1] || inThinkTagMatch[2] || '').trim();
        if (rescuedMsg.length > 0) {
          const cleanRescued = stripMetaTags(rescuedMsg);
          if (cleanRescued.length > 0) {
            this.fullThoughtBuffer = '';
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
      if (this.fullThoughtBuffer.length > 0) {
        this.options?.onThoughtCompleted?.(this.fullThoughtBuffer);
      }
      const recovered = this.preThinkContent;
      this.preThinkContent = '';
      this.buffer = '';
      this.inThinking = false;
      const remaining = stripMetaTags(recovered);
      if (remaining.length > 0) {
        return this.splitRemainingFallback(remaining);
      }
      return [];
    }
    const full = this.preThinkContent + this.buffer;
    this.preThinkContent = '';
    this.buffer = '';
    const remaining = stripMetaTags(full);
    if (remaining.length > 0) {
      return this.splitRemainingFallback(remaining);
    }

    // 控制标签降级转正文抢救：若本轮未产出主正文，将 [HEARTBEAT] 或 [NEXT_FOLLOWUP] 台词提取为主回复气泡
    if (this.emittedCount === 0) {
      const tagMatch = full.match(CONTROL_TAG_RESCUE_REGEX);
      if (tagMatch) {
        const rescuedMsg = (tagMatch[1] || tagMatch[2] || '').trim();
        if (rescuedMsg.length > 0) {
          const cleanRescued = stripMetaTags(rescuedMsg);
          if (cleanRescued.length > 0) {
            return this.splitRemainingFallback(cleanRescued);
          }
        }
      }
    }

    return [];
  }

  /**
   * 兜底降级拆分：若流式接收中完全未收到 [BR]，但存在自然换行，优雅拆分为多个独立气泡。
   * 特殊守卫：对 Markdown 代码块 (```...```) 或纯 HTML/SVG 整体保留为单个原子气泡，绝不切断！
   */
  private splitRemainingFallback(text: string): string[] {
    if (this.emittedCount > 0) {
      this.emittedCount += 1;
      return [text];
    }

    let processedText = text;

    // 0. 优先解构语音条 [VOICE: ...] 或表情包 [STICKER: ...]，保证气泡类型纯净
    if (IS_CONTENT_TAG_REGEX.test(processedText)) {
      const parts: string[] = [];
      let rem = processedText;
      let m: RegExpMatchArray | null;
      while ((m = rem.match(SPLIT_PATTERN)) && m.index !== undefined) {
        const before = rem.slice(0, m.index).trim();
        if (before) parts.push(before);
        if (IS_CONTENT_TAG_REGEX.test(m[0])) {
          parts.push(m[0].trim());
        }
        rem = rem.slice(m.index + m[0].length);
      }
      if (rem.trim()) parts.push(rem.trim());
      if (parts.length > 0) {
        this.emittedCount += parts.length;
        return parts;
      }
    }

    // 1. 自动闭合未闭合的代码栅栏 (防止流中断或网络丢包导致 Markdown 代码块丢失闭合标记而惨遭逐行切碎)
    const fenceMatches = processedText.match(/```/g);
    if (fenceMatches && fenceMatches.length % 2 !== 0) {
      processedText = processedText + '\n```';
    }

    // 2. 检查是否包含 Markdown 代码块 ```...```
    if (processedText.includes('```')) {
      const parts: string[] = [];
      const codeBlockRegex = /```[\s\S]*?```/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = codeBlockRegex.exec(processedText)) !== null) {
        const prose = processedText.slice(lastIndex, match.index).trim();
        if (prose.length > 0) {
          // 仅按空行段落 (\n\n+) 切割自然语段，绝不破坏单换行
          const proseParagraphs = prose
            .split(/\r?\n\s*\r?\n+/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
          parts.push(...proseParagraphs);
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
        const trailingParagraphs = trailingProse
          .split(/\r?\n\s*\r?\n+/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        parts.push(...trailingParagraphs);
      }

      if (parts.length > 0) {
        this.emittedCount += parts.length;
        return parts;
      }
    }

    // 3. 检查是否包含嵌入的 HTML 文档或 SVG 标签 (即使前面有自然语言说明，也整体抽离为独立气泡)
    const htmlMatch = /<!doctype\s+html[\s\S]*?(?:<\/html>|$)|<html\b[\s\S]*?(?:<\/html>|$)|<svg\b[\s\S]*?(?:<\/svg>|$)/i.exec(processedText);
    if (htmlMatch) {
      const parts: string[] = [];
      const htmlStart = htmlMatch.index;
      const htmlBlock = htmlMatch[0].trim();
      const proseBefore = processedText.slice(0, htmlStart).trim();
      const proseAfter = processedText.slice(htmlStart + htmlMatch[0].length).trim();

      if (proseBefore.length > 0) {
        const paras = proseBefore.split(/\r?\n\s*\r?\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
        parts.push(...paras);
      }
      if (htmlBlock.length > 0) {
        // 如果 HTML 没带代码块标记，包装为 ```html ... ``` 保护气泡与沙箱高亮
        parts.push(htmlBlock.startsWith('```') ? htmlBlock : `\`\`\`html\n${htmlBlock}\n\`\`\``);
      }
      if (proseAfter.length > 0) {
        const paras = proseAfter.split(/\r?\n\s*\r?\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
        parts.push(...paras);
      }
      if (parts.length > 0) {
        this.emittedCount += parts.length;
        return parts;
      }
    }

    // 4. 普通纯自然语言：若模型完全未输出 [BR]，按换行切分为多个独立短气泡
    const lines = processedText
      .split(/\r?\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length > 1) {
      this.emittedCount += lines.length;
      return lines;
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
