import { useCallback, useState } from 'react';
import type { PixorySpace } from '../../database';
import type {
  AiDocumentReaderLocator,
  DocumentFormat,
  DocumentReaderTheme,
  InDocSearchState,
  UniversalDocumentSource,
} from '../../ai/readers/readerTypes';
import { readDocumentForReader } from '../../ai/aiDocumentService';

export interface UseDocumentReaderOptions {
  initialTheme?: DocumentReaderTheme;
  initialFontSize?: number;
}

export function useDocumentReader(options: UseDocumentReaderOptions = {}) {
  const [theme, setTheme] = useState<DocumentReaderTheme>(options.initialTheme || 'paper');
  const [fontSize, setFontSize] = useState<number>(options.initialFontSize || 16);
  const [searchState, setSearchState] = useState<InDocSearchState>({
    query: '',
    currentMatch: 0,
    totalMatches: 0,
  });

  const loadSourceFromDb = useCallback(
    async (documentId: string, space: PixorySpace): Promise<UniversalDocumentSource> => {
      const readable = await readDocumentForReader({ documentId, space });
      return { type: 'record', readable };
    },
    []
  );

  const createSourceFromUri = useCallback(
    (input: {
      uri: string;
      fileName: string;
      mimeType?: string | null;
      title?: string;
      sourceType?: DocumentFormat;
    }): UniversalDocumentSource => {
      return {
        type: 'uri',
        uri: input.uri,
        fileName: input.fileName,
        mimeType: input.mimeType,
        title: input.title,
        sourceType: input.sourceType,
      };
    },
    []
  );

  return {
    theme,
    setTheme,
    fontSize,
    setFontSize,
    searchState,
    setSearchState,
    loadSourceFromDb,
    createSourceFromUri,
  };
}
