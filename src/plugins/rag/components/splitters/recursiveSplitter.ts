import type { ITextSplitter, SplitterOptions } from './types';
import type { RagChunk } from '../../types';

const DEFAULT_SEPARATORS = [
  '\n\n',
  '\n',
  '。',
  '！',
  '？',
  '. ',
  '! ',
  '? ',
  '；',
  ';',
  '，',
  ', ',
  ' ',
  '',
];

/**
 * 递归语义切分器 (RecursiveTextSplitter)
 * 工业级文本分块：按自然段落 -> 单换行 -> 标点符号 -> 单词空格 -> 字符层级向下递归切分，
 * 优先保持段落和句子的语义完整性，杜绝切断语法结构。
 */
export class RecursiveTextSplitter implements ITextSplitter {
  public readonly id = 'splitter:recursive';
  public readonly kind = 'splitter' as const;

  constructor(private readonly defaultOptions: SplitterOptions = {}) {}

  public splitText(text: string, documentId: string, options?: SplitterOptions): RagChunk[] {
    const chunkSize = options?.chunkSize ?? this.defaultOptions.chunkSize ?? 800;
    const chunkOverlap = options?.chunkOverlap ?? this.defaultOptions.chunkOverlap ?? 120;
    const separators = options?.separators ?? this.defaultOptions.separators ?? DEFAULT_SEPARATORS;

    if (!text || text.trim().length === 0) {
      return [];
    }

    const rawPieces = this.splitRecursive(text, separators, chunkSize);
    const mergedChunks = this.mergePieces(rawPieces, chunkSize, chunkOverlap);

    return mergedChunks.map((chunkText, index) => ({
      id: `${documentId}_chunk_${index}`,
      documentId,
      chunkIndex: index,
      text: chunkText,
      normalizedText: chunkText.toLowerCase().trim(),
      tokenEstimate: Math.ceil(chunkText.length / 2),
      locator: {
        index,
        charCount: chunkText.length,
      },
    }));
  }

  private splitRecursive(text: string, separators: string[], chunkSize: number): string[] {
    if (text.length <= chunkSize || separators.length === 0) {
      return [text];
    }

    const separator = separators[0] ?? '';
    const nextSeparators = separators.slice(1);

    const parts = separator === '' ? text.split('') : text.split(separator);
    const result: string[] = [];

    for (let i = 0; i < parts.length; i++) {
      let part = parts[i] ?? '';
      // 补充可能丢失的分隔符
      if (separator !== '' && i < parts.length - 1) {
        part += separator;
      }
      if (part.length > chunkSize && nextSeparators.length > 0) {
        result.push(...this.splitRecursive(part, nextSeparators, chunkSize));
      } else if (part.length > 0) {
        result.push(part);
      }
    }

    return result;
  }

  private mergePieces(pieces: string[], chunkSize: number, chunkOverlap: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';

    for (const piece of pieces) {
      if (!currentChunk) {
        currentChunk = piece;
        continue;
      }

      if (currentChunk.length + piece.length <= chunkSize) {
        currentChunk += piece;
      } else {
        chunks.push(currentChunk.trim());
        // 计算重叠回溯
        if (chunkOverlap > 0 && currentChunk.length > chunkOverlap) {
          const overlapText = currentChunk.slice(currentChunk.length - chunkOverlap);
          currentChunk = overlapText + piece;
        } else {
          currentChunk = piece;
        }
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}
