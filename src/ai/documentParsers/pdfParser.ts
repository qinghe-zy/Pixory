import type { ParsedDocumentText } from './textParser';

export async function parsePdfText(): Promise<ParsedDocumentText> {
  return {
    text: '',
    metadata: {
      parser: 'pdf-native-renderer',
      noExtractableText: true,
      message: 'PDF 已保存，可在阅读器中按页查看；当前文件没有提取到可用于问答的文本。',
    },
  };
}
