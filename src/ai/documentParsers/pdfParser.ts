import type { ParsedDocumentText } from './textParser';
import { extractPdfText } from '../../native/pixoryMediaModule';

export async function parsePdfText(input: { fileUri: string }): Promise<ParsedDocumentText> {
  try {
    const extracted = await extractPdfText(input.fileUri);
    return {
      text: extracted.text,
      metadata: {
        parser: 'pdfbox-android',
        pageCount: extracted.pageCount,
        noExtractableText: !extracted.text.trim(),
        message: extracted.text.trim()
          ? undefined
          : 'PDF 已保存，可在阅读器中连续阅读；当前文件没有提取到可用于问答的文本。',
      },
    };
  } catch (error) {
    return {
      text: '',
      metadata: {
        parser: 'pdfbox-android',
        noExtractableText: true,
        message: error instanceof Error ? `PDF 文本提取失败：${error.message}` : 'PDF 文本提取失败。',
      },
    };
  }
}
