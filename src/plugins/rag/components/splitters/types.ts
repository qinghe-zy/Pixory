import type { IRagComponent } from '../../core/lifecycle';
import type { RagChunk } from '../../types';

export interface SplitterOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
  keepSeparators?: boolean;
}

export interface ITextSplitter extends IRagComponent {
  readonly kind: 'splitter';
  splitText(text: string, documentId: string, options?: SplitterOptions): RagChunk[];
}
