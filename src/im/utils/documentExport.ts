/**
 * documentExport.ts — 文档导出工具函数
 *
 * 将阅读器中已解析的文档内容写入临时文件后，通过系统分享面板导出。
 * 支持 Markdown/TXT（UTF-8 文本）及 DOCX/PDF（二进制 Uint8Array/本地存储文件）。
 */

import { Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { safeShareFileAsync } from '../../services/export/exportDocumentService';

export interface DocumentExportTarget {
  uri?: string;
  title?: string;
  content?: string | Uint8Array;
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let index = 0;

  while (index < bytes.length) {
    const first = bytes[index++] ?? 0;
    const second = index < bytes.length ? bytes[index++] : NaN;
    const third = index < bytes.length ? bytes[index++] : NaN;
    const triple = (first << 16) | ((Number.isNaN(second) ? 0 : second) << 8) | (Number.isNaN(third) ? 0 : third);

    output += alphabet[(triple >> 18) & 63];
    output += alphabet[(triple >> 12) & 63];
    output += Number.isNaN(second) ? '=' : alphabet[(triple >> 6) & 63];
    output += Number.isNaN(third) ? '=' : alphabet[triple & 63];
  }

  return output;
}

/**
 * 导出文档到系统分享面板。
 * 写入缓存目录后调用 Share.share；调用方 catch 错误静默。
 */
export async function exportDocumentToShare(doc: DocumentExportTarget): Promise<void> {
  const title = doc.title || '文档';
  const ext = (doc.title?.includes('.') ? doc.title.split('.').pop() : (doc.uri?.includes('.') ? doc.uri.split('.').pop() : 'txt'))?.toLowerCase() ?? 'txt';

  try {
    const cleanBaseTitle = title.replace(/\.[a-zA-Z0-9]+$/, '');
    const safeName = cleanBaseTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_') || 'document';
    const cacheFingerprint = Date.now().toString(36);
    const tempPath = `${FileSystem.cacheDirectory}${safeName}_${cacheFingerprint}.${ext}`;

    const isRealContent =
      typeof doc.content === 'string' &&
      doc.content.trim().length > 0 &&
      doc.content.trim() !== title.trim() &&
      doc.content.trim() !== (doc.uri || '').trim();

    let fileWritten = false;

    if (isRealContent && typeof doc.content === 'string') {
      // 若导出目标是 .docx 且当前仍是 Markdown 文本，实时编译为标准合法的 ECMA-376 OOXML Zip 二进制
      if (ext === 'docx' && !doc.content.startsWith('PK')) {
        try {
          const { compileMarkdownToDocx } = await import('../../services/sandbox/docx/docxCompiler');
          const docxBytes = await compileMarkdownToDocx(doc.content, title);
          const base64 = bytesToBase64(docxBytes);
          await FileSystem.writeAsStringAsync(tempPath, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          fileWritten = true;
        } catch {
          await FileSystem.writeAsStringAsync(tempPath, doc.content, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          fileWritten = true;
        }
      } else {
        await FileSystem.writeAsStringAsync(tempPath, doc.content, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        fileWritten = true;
      }
    } else if (doc.content instanceof Uint8Array) {
      const base64 = bytesToBase64(doc.content);
      await FileSystem.writeAsStringAsync(tempPath, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      fileWritten = true;
    } else if (doc.uri) {
      try {
        const info = await FileSystem.getInfoAsync(doc.uri);
        if (info.exists) {
          await FileSystem.copyAsync({ from: doc.uri, to: tempPath });
          fileWritten = true;
        }
      } catch {}
    }

    if (!fileWritten) {
      const fallbackText = isRealContent && typeof doc.content === 'string' ? `《${title}》\n\n${doc.content}` : `文档: ${title}`;
      await Share.share({ title, message: fallbackText });
      return;
    }

    // 1. 优先调用 safeShareFileAsync 分享真实文件实体（携带 Android Intent.EXTRA_STREAM）
    // 内置安全探针保护，严禁直接裸调原生分享模块，彻底阻断旧底包/OTA 环境下的闪退
    let mimeType = 'text/plain';
    if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (ext === 'pdf') mimeType = 'application/pdf';
    else if (ext === 'md') mimeType = 'text/markdown';

    const shared = await safeShareFileAsync(tempPath, {
      mimeType,
      dialogTitle: title,
      UTI: ext === 'docx' ? 'org.openxmlformats.wordprocessingml.document' : ext === 'pdf' ? 'com.adobe.pdf' : 'public.plain-text',
    });
    if (shared) {
      return;
    }

    // 2. 兜底回退：若在纯文本分享模式下，必须传递完整文档正文，绝不让分享内容缩水成单行文件名！
    const fullMessage =
      typeof doc.content === 'string' && doc.content.length < 50000
        ? `《${title}》\n\n${doc.content}`
        : `文档: ${title}`;

    await Share.share({ title, message: fullMessage, url: tempPath });
  } catch (err) {
    // 终极保护：文件系统极端异常时保证调用方不崩溃
    const fallbackText = typeof doc.content === 'string' ? `《${title}》\n\n${doc.content}` : `文档: ${title}`;
    await Share.share({ title, message: fallbackText }).catch(() => {});
  }
}
