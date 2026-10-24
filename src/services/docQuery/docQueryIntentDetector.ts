export type DocQueryMode = 'two_step_sql' | 'chunk_summary' | 'skip';

export interface DocQueryIntent {
  mode: DocQueryMode;
  reason: string;
}

export interface QueryAttachmentTarget {
  id: string;
  name: string;
  uri: string;
  mimeType?: string | null;
  size?: number | null;
  documentId?: string | null;
}

const PURE_TEXT_TABLE_MIME_TYPES = new Set([
  'text/csv',
  'text/comma-separated-values',
  'application/csv',
  'text/tab-separated-values',
  'text/tsv',
]);

const PURE_TEXT_TABLE_EXTENSIONS = /\.(csv|tsv)$/i;
const EXCEL_BINARY_EXTENSIONS = /\.(xlsx|xls)$/i;
const EXCEL_BINARY_MIME_TYPES = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const MAX_TABLE_BYTES = 5 * 1024 * 1024; // 5 MB

export function detectDocQueryIntent(attachment: {
  mimeType?: string | null;
  name: string;
  size?: number | null;
}): DocQueryIntent {
  const isBinaryExcel =
    EXCEL_BINARY_MIME_TYPES.has(attachment.mimeType ?? '') ||
    EXCEL_BINARY_EXTENSIONS.test(attachment.name);

  if (isBinaryExcel) {
    // 二进制 Excel 文件暂无解包解码器，降级走通用文档摘要切片
    return { mode: 'chunk_summary', reason: 'excel_binary_unsupported' };
  }

  const isTextTable =
    PURE_TEXT_TABLE_MIME_TYPES.has(attachment.mimeType ?? '') ||
    PURE_TEXT_TABLE_EXTENSIONS.test(attachment.name);

  if (!isTextTable) {
    return { mode: 'chunk_summary', reason: 'non_table_file' };
  }

  const size = attachment.size ?? 0;
  if (size > MAX_TABLE_BYTES) {
    return { mode: 'chunk_summary', reason: 'table_exceeds_size_limit' };
  }

  return { mode: 'two_step_sql', reason: 'supported_table' };
}
