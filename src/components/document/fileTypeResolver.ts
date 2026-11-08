export interface WeChatFileTypeStyle {
  bgColor: string;
  foldColor: string;
  label: string;
  textColor: string;
  fontSize: number;
  letterSpacing?: number;
}

/**
 * 智能文件名格式推断与自适应兜底
 *
 * 严格按照微信原生规则分类:
 * - Word (.docx, .doc): #1877F2 蓝底, 18px 粗体 "W"
 * - PDF (.pdf): #E53935 红底, 12px 紧凑粗体 "PDF"
 * - HTML (.html, .htm): #CAD3E2 灰蓝底, 10px 粗体 #657591 字 "HTML"
 * - Markdown (.md, .markdown): #CAD3E2 灰蓝底, 12px 粗体 #657591 字 "MD"
 * - Excel (.xlsx, .xls, .csv): #20A055 经典绿底, 18px 粗体 "X"
 * - PowerPoint (.pptx, .ppt): #EA5B2B 经典橙红底, 18px 粗体 "P"
 * - 纯文本 (.txt): #CAD3E2 灰蓝底, 12px 粗体 #657591 字 "TXT"
 * - 压缩包 (.zip, .rar, .7z, .tar, .gz): #7B68EE 紫灰底, 12px 粗体 "ZIP"
 * - 音频 (.mp3, .m4a, .wav, .flac, .aac): #FF9500 暖橙底, 11px 粗体 "MP3"
 * - 视频 (.mp4, .mov, .mkv, .avi): #0A84FF 亮蓝底, 10px 粗体 "VIDEO"
 * - 代码文件 (.json, .py, .ts, .js 等): #CAD3E2 灰蓝底, 10~11px 对应大写缩写
 * - 兜底未知格式: #CAD3E2 灰蓝底, 1~4 位大写扩展名或通用 "FILE"
 */
export function resolveWeChatFileTypeStyle(filename: string): WeChatFileTypeStyle {
  let cleanName = (filename || '').split(/[?#]/)[0].trim().toLowerCase();
  try {
    cleanName = decodeURIComponent(cleanName);
  } catch {
    // 容错保持原文本
  }
  const extMatch = cleanName.match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : '';

  // 1. Word 文档 (.docx, .doc)
  if (ext === 'docx' || ext === 'doc') {
    return {
      bgColor: '#1877F2',
      foldColor: 'rgba(0, 0, 0, 0.22)',
      label: 'W',
      textColor: '#FFFFFF',
      fontSize: 18,
    };
  }

  // 2. PDF 文档 (.pdf)
  if (ext === 'pdf') {
    return {
      bgColor: '#E53935',
      foldColor: 'rgba(0, 0, 0, 0.22)',
      label: 'PDF',
      textColor: '#FFFFFF',
      fontSize: 12,
      letterSpacing: -0.4,
    };
  }

  // 3. HTML 网页 (.html, .htm)
  if (ext === 'html' || ext === 'htm') {
    return {
      bgColor: '#CAD3E2',
      foldColor: 'rgba(0, 0, 0, 0.18)',
      label: 'HTML',
      textColor: '#657591',
      fontSize: 10,
      letterSpacing: -0.3,
    };
  }

  // 4. Markdown 文档 (.md, .markdown)
  if (ext === 'md' || ext === 'markdown') {
    return {
      bgColor: '#CAD3E2',
      foldColor: 'rgba(0, 0, 0, 0.18)',
      label: 'MD',
      textColor: '#657591',
      fontSize: 12,
      letterSpacing: -0.3,
    };
  }

  // 5. Excel 电子表格 (.xlsx, .xls, .csv)
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    return {
      bgColor: '#20A055',
      foldColor: 'rgba(0, 0, 0, 0.22)',
      label: 'X',
      textColor: '#FFFFFF',
      fontSize: 18,
    };
  }

  // 6. PowerPoint 幻灯片 (.pptx, .ppt)
  if (ext === 'pptx' || ext === 'ppt') {
    return {
      bgColor: '#EA5B2B',
      foldColor: 'rgba(0, 0, 0, 0.22)',
      label: 'P',
      textColor: '#FFFFFF',
      fontSize: 18,
    };
  }

  // 7. 纯文本 (.txt)
  if (ext === 'txt') {
    return {
      bgColor: '#CAD3E2',
      foldColor: 'rgba(0, 0, 0, 0.18)',
      label: 'TXT',
      textColor: '#657591',
      fontSize: 12,
    };
  }

  // 8. 压缩包 (.zip, .rar, .7z, .tar, .gz)
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return {
      bgColor: '#7B68EE',
      foldColor: 'rgba(0, 0, 0, 0.22)',
      label: 'ZIP',
      textColor: '#FFFFFF',
      fontSize: 12,
    };
  }

  // 9. 图片文件作为文档传输 (.png, .jpg, .jpeg, .webp, .gif, .bmp, .svg)
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext)) {
    return {
      bgColor: '#5C6BC0',
      foldColor: 'rgba(0, 0, 0, 0.22)',
      label: 'IMG',
      textColor: '#FFFFFF',
      fontSize: 11,
    };
  }

  // 10. 音频格式 (.mp3, .m4a, .wav, .aac, .flac, .ogg)
  if (['mp3', 'm4a', 'wav', 'aac', 'flac', 'ogg'].includes(ext)) {
    return {
      bgColor: '#FF9500',
      foldColor: 'rgba(0, 0, 0, 0.22)',
      label: 'MP3',
      textColor: '#FFFFFF',
      fontSize: 11,
    };
  }

  // 11. 视频格式 (.mp4, .mov, .mkv, .avi, .webm)
  if (['mp4', 'mov', 'mkv', 'avi', 'webm'].includes(ext)) {
    return {
      bgColor: '#0A84FF',
      foldColor: 'rgba(0, 0, 0, 0.22)',
      label: 'VIDEO',
      textColor: '#FFFFFF',
      fontSize: 10,
    };
  }

  // 12. 常见代码与结构化数据文件
  if (['json', 'js', 'ts', 'tsx', 'jsx', 'py', 'c', 'cpp', 'java', 'go', 'rs', 'sh', 'yml', 'yaml', 'xml', 'css', 'sql', 'log', 'swift', 'kt'].includes(ext)) {
    const codeLabel = ext.slice(0, 4).toUpperCase();
    return {
      bgColor: '#CAD3E2',
      foldColor: 'rgba(0, 0, 0, 0.18)',
      label: codeLabel,
      textColor: '#657591',
      fontSize: codeLabel.length >= 4 ? 9.5 : 11,
      letterSpacing: -0.2,
    };
  }

  // 13. 通用兜底：若有 1~4 位字母数字扩展名直接展示大写，否则显示 "FILE"
  const fallbackLabel = ext && /^[a-z0-9]{1,4}$/.test(ext) ? ext.toUpperCase() : 'FILE';
  return {
    bgColor: '#CAD3E2',
    foldColor: 'rgba(0, 0, 0, 0.18)',
    label: fallbackLabel,
    textColor: '#657591',
    fontSize: fallbackLabel.length >= 4 ? 9.5 : 12,
  };
}

/**
 * 格式化文件字节大小
 * 对标微信: 55.5 KB, 3.6 MB, 11.2 KB, 129 B, 9.8 KB, 1.2 GB
 */
export function formatWeChatFileSize(bytes?: number, charCount?: number): string {
  if (typeof bytes === 'number' && !Number.isNaN(bytes) && bytes >= 0) {
    if (bytes === 0) {
      return '0 B';
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      const kb = bytes / 1024;
      return `${kb.toFixed(1)} KB`;
    }
    if (bytes < 1024 * 1024 * 1024) {
      const mb = bytes / (1024 * 1024);
      return `${mb.toFixed(1)} MB`;
    }
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  }

  if (typeof charCount === 'number' && !Number.isNaN(charCount) && charCount > 0) {
    // 粗略按 UTF-8 估算字节并以 KB 显示
    const estimatedKb = Math.max(0.1, (charCount * 2) / 1024);
    return `${estimatedKb.toFixed(1)} KB`;
  }

  return '0 B';
}

/**
 * 智能截断文件名，确保末尾扩展名不被裁切 (Truncate-Middle)
 * 在标题过长（如 > 26 字符）时保留前 14 与后 8 字符
 */
export function truncateFileNameMiddle(filename: string, maxHead = 14, maxTail = 8): string {
  if (!filename || filename.length <= maxHead + maxTail + 3) {
    return filename;
  }
  const head = filename.slice(0, maxHead);
  const tail = filename.slice(-maxTail);
  return `${head}...${tail}`;
}
