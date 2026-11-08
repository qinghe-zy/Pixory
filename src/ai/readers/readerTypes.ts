import type { PixorySpace } from '../../database';
import type { AiChunkRecord, AiDocumentRecord } from '../../database/repositories/aiKnowledgeRepository';

export interface AiDocumentReaderLocator {
  page?: number;
  paragraph?: number;
  line?: number;
  chunkId?: string;
  blockId?: string;
}

export interface AiDocumentReaderParams {
  documentId: string;
  space: PixorySpace;
  locator?: AiDocumentReaderLocator;
}

export interface AiReadableDocument {
  document: AiDocumentRecord;
  chunks: AiChunkRecord[];
  text: string;
}

export type DocumentReaderTheme = 'paper' | 'sepia' | 'dark' | 'white';

export type DocumentFormat = 'docx' | 'pdf' | 'markdown' | 'html' | 'txt' | 'pptx';

export type DocumentLayoutMode = 'flow' | 'print';

export type DocumentFontFamily = 'sans' | 'serif' | 'mono';

export type HtmlViewMode = 'preview' | 'source';

export type DiffMode = 'clean' | 'diff';

export type DocumentBlockType =
  | 'paragraph'
  | 'heading'
  | 'table-cell'
  | 'list-item'
  | 'code-block'
  | 'quote'
  | 'other';

export interface DocumentBlockInfo {
  blockId: string;
  blockType: DocumentBlockType;
  text: string;
  offsetTop?: number;
  tagName?: string;
}

export interface DocumentAnnotation {
  id: string;
  blockId: string;
  type: 'highlight' | 'underline' | 'note';
  color?: string;
  note?: string;
  selectedText?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BlockPatch {
  patchId: string;
  blockId: string;
  originalText: string;
  newText: string;
  appliedAt: string;
  author?: 'user' | 'assistant';
}

export interface WorkingCopy {
  documentId: string;
  originalUri: string;
  workingUri: string;
  isDirty: boolean;
  patches: BlockPatch[];
  annotations: DocumentAnnotation[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentTocItem {
  id: string;
  title: string;
  level: number;
  targetId?: string;
  pageIndex?: number;
}

export interface InDocSearchState {
  query: string;
  currentMatch: number;
  totalMatches: number;
}

export type UniversalDocumentSource =
  | { type: 'record'; readable: AiReadableDocument }
  | {
      type: 'uri';
      uri: string;
      fileName: string;
      mimeType?: string | null;
      title?: string;
      sourceType?: DocumentFormat;
      fileSize?: number | null;
      rawText?: string;
      overrideFormat?: DocumentFormat;
      diffMode?: DiffMode;
      initialLayoutMode?: DocumentLayoutMode;
    };
