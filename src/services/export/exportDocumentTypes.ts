export type ExportDocumentFormat = 'md' | 'txt' | 'html' | 'json' | 'pdf';

export interface ExportDocumentFormatOption {
  format: ExportDocumentFormat;
  extension: string;
  label: string;
  mimeType: string;
}

export interface ExportDocumentInput {
  content: string;
  fileName: string;
  format: ExportDocumentFormat;
  metadata?: {
    title?: string;
    author?: string;
    createdAt?: string;
    source?: string;
  };
}

export interface ExportDocumentResult {
  success: boolean;
  fileUri: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  format: ExportDocumentFormat;
}

export const EXPORT_FORMAT_OPTIONS: ExportDocumentFormatOption[] = [
  {
    format: 'md',
    extension: '.md',
    label: 'Markdown 文档 (.md)',
    mimeType: 'text/markdown',
  },
  {
    format: 'txt',
    extension: '.txt',
    label: '纯文本 (.txt)',
    mimeType: 'text/plain',
  },
  {
    format: 'html',
    extension: '.html',
    label: '网页文档 (.html)',
    mimeType: 'text/html',
  },
  {
    format: 'json',
    extension: '.json',
    label: '结构化数据 (.json)',
    mimeType: 'application/json',
  },
  {
    format: 'pdf',
    extension: '.pdf',
    label: 'PDF 排版文档 (.pdf)',
    mimeType: 'application/pdf',
  },
];
