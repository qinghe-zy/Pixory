import type { ParsedDocumentText } from './textParser';

export async function parsePdfText(): Promise<ParsedDocumentText> {
  return {
    text: '',
    metadata: {
      parser: 'pdf-fallback',
      noExtractableText: true,
      message: '当前版本暂不支持从 PDF 提取文本。文件已保存；如需用于问答，请先转换为 TXT/Markdown 或粘贴文本导入。',
    },
  };
}
