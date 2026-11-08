import type { ITextSplitter, SplitterOptions } from './types';
import type { RagChunk } from '../../types';

/**
 * Markdown 结构感知切分器 (MarkdownTextSplitter)
 * 按 `#`, `##`, `###` 章节层级进行切块，保留章节标题作为上下文面包屑
 */
export class MarkdownTextSplitter implements ITextSplitter {
  public readonly id = 'splitter:markdown';
  public readonly kind = 'splitter' as const;

  constructor(private readonly defaultOptions: SplitterOptions = {}) {}

  public splitText(text: string, documentId: string, options?: SplitterOptions): RagChunk[] {
    const chunkSize = options?.chunkSize ?? this.defaultOptions.chunkSize ?? 900;
    if (!text || text.trim().length === 0) {
      return [];
    }

    // 匹配 Markdown 标题行的正则
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    const sections: Array<{ title: string; level: number; content: string }> = [];

    let match: RegExpExecArray | null;
    let lastIndex = 0;
    let currentTitle = '引言';
    let currentLevel = 1;

    while ((match = headingRegex.exec(text)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        const body = text.substring(lastIndex, matchIndex).trim();
        if (body.length > 0) {
          sections.push({ title: currentTitle, level: currentLevel, content: body });
        }
      }
      currentLevel = (match[1] ?? '').length;
      currentTitle = (match[2] ?? '').trim();
      lastIndex = headingRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      const remaining = text.substring(lastIndex).trim();
      if (remaining.length > 0) {
        sections.push({ title: currentTitle, level: currentLevel, content: remaining });
      }
    }

    if (sections.length === 0) {
      sections.push({ title: '正文', level: 1, content: text.trim() });
    }

    const chunks: RagChunk[] = [];
    let chunkIndex = 0;

    for (const section of sections) {
      const headerPrefix = `[章节: ${section.title}]\n`;
      let sectionContent = section.content;

      // 如果单章节内容超出 chunkSize，进一步切分
      while (sectionContent.length > 0) {
        const sliceLength = Math.min(sectionContent.length, chunkSize);
        let piece = sectionContent.substring(0, sliceLength);

        // 尽量在句号或换行处断句
        if (sliceLength < sectionContent.length) {
          const lastBreak = Math.max(piece.lastIndexOf('\n'), piece.lastIndexOf('。'), piece.lastIndexOf('. '));
          if (lastBreak > sliceLength * 0.5) {
            piece = piece.substring(0, lastBreak + 1);
          }
        }

        const fullChunkText = `${headerPrefix}${piece.trim()}`;
        chunks.push({
          id: `${documentId}_chunk_${chunkIndex}`,
          documentId,
          chunkIndex,
          text: fullChunkText,
          normalizedText: fullChunkText.toLowerCase().trim(),
          locator: {
            section: section.title,
            level: section.level,
          },
          tokenEstimate: Math.ceil(fullChunkText.length / 2),
        });

        chunkIndex++;
        sectionContent = sectionContent.substring(piece.length).trim();
      }
    }

    return chunks;
  }
}
