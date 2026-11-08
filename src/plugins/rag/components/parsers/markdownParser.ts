import type { IDocumentParser, ParsedDocument } from './types';

export class MarkdownDocumentParser implements IDocumentParser {
  public readonly id = 'parser:markdown';
  public readonly kind = 'parser' as const;
  public readonly supportedExtensions = ['md', 'markdown', 'mdown'];

  public async parse(raw: string | ArrayBuffer, filename?: string): Promise<ParsedDocument> {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    let title = filename ? filename.replace(/\.[^/.]+$/, '') : '未命名 Markdown';

    // 尝试提取顶级 # 标题作为文档标题
    const titleMatch = text.match(/^#\s+(.+)$/m);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    }

    return {
      title,
      content: text.trim(),
    };
  }
}
