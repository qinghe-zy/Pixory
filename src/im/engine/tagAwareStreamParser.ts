/**
 * Tag-Aware 流式切句状态机
 *
 * 核心职责：
 * 1. 扫描 [BR] 标签实时切出独立气泡短句。
 * 2. 隐形缓冲区暂存合法协议标签半截（如 "[B"、"[BR"、"[STATUS:"），杜绝语法残缺泄露到 UI。
 * 3. 严格前缀白名单机制：普通方括号（如 "[星际穿越]"、"[委屈]"）不被误吞或卡死。
 * 4. 过滤剥离 [STATUS:...]、[MOOD:...] 等协议元数据，保留正常中文方括号。
 */

const META_TAG_REGEX = /[[\[【]\s*(STATUS|MOOD|STICKER|表情|HEARTBEAT|VOICE|NUDGE|NEXT_FOLLOWUP|STAGE_FOLLOWUP|PASS|PING)(?:[:：][^\]】\n]+)?\s*[\]】]/gi;
const VALID_TAG_PREFIXES = [
  'BR]',
  'STICKER:',
  'STICKER：',
  '表情:',
  '表情：',
  'MOOD:',
  'STATUS:',
  'HEARTBEAT:',
  'VOICE:',
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
const SPLIT_PATTERN = /(\[br\s*\/?\]|<\/?br\s*\/?>|[[\[【]\s*(?:STICKER|表情)\s*[:：]\s*[^\]】\n]{1,10}?\s*[\]】])/i;
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
    // 2. 孤儿开闭标签强行剥离 (防止网络丢包、流中断或流切分残留)
    .replace(/\[\/?(?:DOCUMENT|DOC|DOCUMENT_PATCH|DOC_PATCH)(?::[^\]\n]*)?\]/gi, '')
    .replace(META_TAG_REGEX, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
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
    const thought = raw.slice(0, lastCloseParen + 1).trim();
    const dialogue = raw.slice(lastCloseParen + 1).trimStart();
    return { thought, dialogue };
  }

  // 2. 寻找 br 之前的换行标记
  const lastDoubleNewline = beforeBr.lastIndexOf('\n\n');
  if (lastDoubleNewline !== -1) {
    const thought = raw.slice(0, lastDoubleNewline).trim();
    const dialogue = raw.slice(lastDoubleNewline + 2).trimStart();
    return { thought, dialogue };
  }
  const lastNewline = beforeBr.lastIndexOf('\n');
  if (lastNewline !== -1) {
    const thought = raw.slice(0, lastNewline).trim();
    const dialogue = raw.slice(lastNewline + 1).trimStart();
    return { thought, dialogue };
  }

  // 3. 寻找 br 之前的句末标点（。/！/!/?/？或英文句号+空格）
  const puncMatches = [...beforeBr.matchAll(/([。！？!?]|\.\s+)(\s+|$)/g)];
  if (puncMatches.length > 0) {
    const lastPunc = puncMatches[puncMatches.length - 1];
    if (lastPunc.index !== undefined) {
      const splitPoint = lastPunc.index + lastPunc[0].length;
      const thought = raw.slice(0, splitPoint).trim();
      const dialogue = raw.slice(splitPoint).trimStart();
      return { thought, dialogue };
    }
  }

  // 4. 兜底：若之前没有标点，但出现了 [BR]，则 [BR] 及其前置词句必定是对白
  return { thought: '', dialogue: raw.trimStart() };
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
          // 找到了闭合标签，将当前思考增量与完整思考内容通过回调通知外部
          const finalThoughtPart = this.buffer.slice(0, closeIdx);
          this.fullThoughtBuffer += finalThoughtPart;
          if (this.fullThoughtBuffer.length > this.emittedThoughtLen) {
            const chunk = this.fullThoughtBuffer.slice(this.emittedThoughtLen);
            this.options?.onThoughtProgress?.(chunk, this.fullThoughtBuffer);
            this.emittedThoughtLen = this.fullThoughtBuffer.length;
          }
          this.options?.onThoughtCompleted?.(this.fullThoughtBuffer);

          this.buffer = this.buffer.slice(closeIdx + closeTagLen);
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

      // 检查末尾是否存在独白括号闭合后紧随的未切分台词： (独白...) 台词正文
      const parenDialogueMatch = combined.match(/^([\s\S]*?[）\)])\s*([^（\(]+)$/);
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
