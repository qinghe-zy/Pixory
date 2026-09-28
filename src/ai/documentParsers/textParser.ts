export interface ParsedDocumentText {
  text: string;
  metadata: Record<string, unknown>;
}

export async function parsePlainText(content: string): Promise<ParsedDocumentText> {
  return {
    text: content.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
    metadata: { parser: 'plain-text' },
  };
}
