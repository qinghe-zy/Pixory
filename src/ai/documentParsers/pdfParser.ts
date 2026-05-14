import type { ParsedDocumentText } from './textParser';

export async function parsePdfText(): Promise<ParsedDocumentText> {
  return {
    text: '',
    metadata: {
      parser: 'pdf-fallback',
      noExtractableText: true,
      message: 'PDF text extraction is unavailable in this build. The document can still be opened in the reader when supported.',
    },
  };
}
