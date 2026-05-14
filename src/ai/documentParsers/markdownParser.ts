import { parsePlainText, type ParsedDocumentText } from './textParser';

export async function parseMarkdownText(content: string): Promise<ParsedDocumentText> {
  const parsed = await parsePlainText(content);
  return {
    text: parsed.text,
    metadata: { ...parsed.metadata, parser: 'markdown' },
  };
}
