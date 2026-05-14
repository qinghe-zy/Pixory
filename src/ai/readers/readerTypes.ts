import type { PixorySpace } from '../../database';
import type { AiChunkRecord, AiDocumentRecord } from '../../database/repositories/aiKnowledgeRepository';

export interface AiDocumentReaderLocator {
  page?: number;
  paragraph?: number;
  line?: number;
  chunkId?: string;
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
