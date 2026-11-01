/**
 * Tag-Aware 流式切句状态机
 *
 * 核心职责：
 * 1. 扫描 [BR] 标签实时切出独立气泡短句。
 * 2. 隐形缓冲区暂存合法协议标签半截（如 "[B"、"[BR"、"[STATUS:"），杜绝语法残缺泄露到 UI。
 * 3. 严格前缀白名单机制：普通方括号（如 "[星际穿越]"、"[委屈]"）不被误吞或卡死。
 * 4. 过滤剥离 [STATUS:...]、[MOOD:...] 等协议元数据，保留正常中文方括号。
 */

const META_TAG_REGEX = /\[(STATUS|MOOD|STICKER|HEARTBEAT|VOICE|NUDGE|NEXT_FOLLOWUP|STAGE_FOLLOWUP|PASS|PING)(:[^\]]+)?\]/gi;
const VALID_TAG_PREFIXES = [
  'BR]',
  'STICKER:',
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
];
const MAX_TAG_BUFFER_LEN = 80;

export function isCandidateTagPrefix(tailAfterOpenBracket: string): boolean {
  if (tailAfterOpenBracket.length === 0) return true; // 刚收到 '['
  if (tailAfterOpenBracket.length > MAX_TAG_BUFFER_LEN) return false;
  const upper = tailAfterOpenBracket.toUpperCase();
  return VALID_TAG_PREFIXES.some((prefix) => prefix.startsWith(upper));
}

export function stripMetaTags(text: string): string {
  return text
    .replace(META_TAG_REGEX, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export class TagAwareStreamParser {
  private buffer: string = '';
  private preThinkContent: string = '';
  private emittedCount: number = 0;
  private inThinking: boolean = false;
  private inCodeBlock: boolean = false;

  /**
   * 推送流式文本增量块，返回当前切出就绪的完整短句列表
   * 自动隐形过滤 <think>...</think> 思考内容，思考期间不输出任何气泡
   * 严格保护 Markdown 代码块 (```...```)，处于代码块内部时绝不按 [BR] 切分！
   */
  feed(chunk: string): string[] {
    this.buffer += chunk;
    this.filterThinkingBlock();

    const readySentences: string[] = [];

    while (!this.inThinking) {
      // 检查是否存在完整的 [BR] (大小写容错覆盖 [br], [BR], [Br])
      const match = this.buffer.match(/\[br\]/i);
      if (!match || match.index === undefined) {
        break;
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

        // 找到了闭合 ```，寻找该闭合栅栏之后的下一个 [br]
        const afterFence = this.buffer.slice(nextFence + 3);
        const matchAfter = afterFence.match(/\[br\]/i);
        if (!matchAfter || matchAfter.index === undefined) {
          // 闭合后尚未出现 [br]，暂停切分等待后续
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
   * 状态机：隐形吸收并剥离 <think>...</think> 与 <thought>...</thought> 思考块
   * 支持大小写全覆盖，并保护思考块前已收到的文本绝不被冲刷丢失
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
          // 找到了闭合标签，将思考内容连同标签彻底丢弃
          this.buffer = this.buffer.slice(closeIdx + closeTagLen);
          this.inThinking = false;
          // 恢复思考块前暂存的有效文本
          if (this.preThinkContent.length > 0) {
            this.buffer = this.preThinkContent + this.buffer;
            this.preThinkContent = '';
          }
        } else {
          // 仍在思考块中，安全保留末尾 12 字符防截断标签（如 </thi + nk>），前面文本直接清空
          if (this.buffer.length > 12) {
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
          if (before.length > 0) {
            this.preThinkContent += before;
          }
        } else {
          break;
        }
      }
    }
  }

  /**
   * 流传输结束，冲刷隐形缓冲区中剩余的内容
   */
  flush(): string[] {
    if (this.inThinking) {
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
    const lastOpen = this.buffer.lastIndexOf('[');
    if (lastOpen === -1) return false;
    const lastClose = this.buffer.lastIndexOf(']');
    if (lastClose > lastOpen) return false;

    const tailAfterOpen = this.buffer.slice(lastOpen + 1);
    return isCandidateTagPrefix(tailAfterOpen);
  }

  getEmittedCount(): number {
    return this.emittedCount;
  }
}
