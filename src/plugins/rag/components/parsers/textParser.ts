import type { IDocumentParser, ParsedDocument } from './types';

export class TextDocumentParser implements IDocumentParser {
  public readonly id = 'parser:text';
  public readonly kind = 'parser' as const;
  public readonly supportedExtensions = ['txt', 'text', 'log'];

  public async parse(raw: string | ArrayBuffer, filename?: string): Promise<ParsedDocument> {
    const content = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    const title = filename ? filename.replace(/\.[^/.]+$/, '') : '未命名文档';
    return {
      title,
      content: content.trim(),
    };
  }
}
