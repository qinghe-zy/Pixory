import { Share } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import {
  EXPORT_FORMAT_OPTIONS,
  type ExportDocumentFormat,
  type ExportDocumentInput,
  type ExportDocumentResult,
} from './exportDocumentTypes';
import {
  buildDefaultExportFileName,
  buildDocumentContent,
  buildStandaloneHtmlDocument,
  detectSuggestedExportFormat,
  extractStandaloneHtmlDocument,
  extractStandaloneSvg,
  sanitizeFileName,
} from './exportDocumentGenerators';

export {
  buildDefaultExportFileName,
  detectSuggestedExportFormat,
  extractStandaloneHtmlDocument,
  extractStandaloneSvg,
  sanitizeFileName,
};

const EXPORT_TEMP_DIR = `${FileSystem.cacheDirectory}pixory_exports/`;

/**
 * 确保临时导出目录存在并定期清理过期缓存
 */
async function ensureExportDirectoryExists(): Promise<void> {
  const info = await FileSystem.getInfoAsync(EXPORT_TEMP_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(EXPORT_TEMP_DIR, { intermediates: true });
    return;
  }

  // 异步轻量清理：防止用户长期导出积累过多临时文件
  try {
    const files = await FileSystem.readDirectoryAsync(EXPORT_TEMP_DIR);
    if (files.length > 25) {
      const now = Date.now();
      const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

      await Promise.allSettled(
        files.map(async (file) => {
          const fileUri = `${EXPORT_TEMP_DIR}${file}`;
          const fileInfo = await FileSystem.getInfoAsync(fileUri);
          if (fileInfo.exists && fileInfo.modificationTime) {
            const ageMs = now - fileInfo.modificationTime * 1000;
            if (ageMs > threeDaysMs) {
              await FileSystem.deleteAsync(fileUri, { idempotent: true });
            }
          }
        })
      );
    }
  } catch {
    // 忽略清理异常，不阻塞主流程
  }
}

/**
 * 执行文档生成与导出落盘
 */
export async function exportDocument(input: ExportDocumentInput): Promise<ExportDocumentResult> {
  await ensureExportDirectoryExists();

  const formatOption = EXPORT_FORMAT_OPTIONS.find((opt) => opt.format === input.format) || EXPORT_FORMAT_OPTIONS[0];
  let cleanName = sanitizeFileName(input.fileName) || buildDefaultExportFileName(input.content);
  // 防止用户手动输入了扩展名导致双重扩展名（如 .html.html 或 .md.md）
  if (cleanName.toLowerCase().endsWith(formatOption.extension.toLowerCase())) {
    cleanName = cleanName.slice(0, -formatOption.extension.length).trim();
  }
  const targetFileName = `${cleanName}${formatOption.extension}`;
  const targetFileUri = `${EXPORT_TEMP_DIR}${targetFileName}`;

  // 特殊处理 PDF 格式
  if (input.format === 'pdf') {
    let printModule: any = null;
    try {
      printModule = require('expo-print');
    } catch {
      printModule = null;
    }

    if (printModule && typeof printModule.printToFileAsync === 'function') {
      const htmlContent = buildDocumentContent({
        ...input,
        format: 'html',
        fileName: cleanName,
      });
      const printResult = await printModule.printToFileAsync({ html: htmlContent });

      // 将生成的临时 PDF 复制到目标导出路径
      await FileSystem.copyAsync({
        from: printResult.uri,
        to: targetFileUri,
      });

      const fileInfo = await FileSystem.getInfoAsync(targetFileUri);
      return {
        success: true,
        fileUri: targetFileUri,
        fileName: targetFileName,
        fileSize: fileInfo.exists && typeof fileInfo.size === 'number' ? fileInfo.size : 0,
        mimeType: formatOption.mimeType,
        format: input.format,
      };
    } else {
      throw new Error(
        '当前运行环境暂未打包 PDF 渲染引擎。建议先导出自包含【网页文档 (.html)】，可在手机浏览器中直接打开并另存为 PDF。'
      );
    }
  }

  // 生成常规文本/HTML/JSON 格式
  const contentString = buildDocumentContent({
    ...input,
    fileName: cleanName,
  });

  await FileSystem.writeAsStringAsync(targetFileUri, contentString, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const fileInfo = await FileSystem.getInfoAsync(targetFileUri);

  return {
    success: true,
    fileUri: targetFileUri,
    fileName: targetFileName,
    fileSize: fileInfo.exists && typeof fileInfo.size === 'number' ? fileInfo.size : contentString.length,
    mimeType: formatOption.mimeType,
    format: input.format,
  };
}

/**
 * 安全调用系统级真实物理文件分享。
 * 核心设计原则（防闪退探针）：
 * 1. 严禁直接调用 import('expo-sharing')！若宿主 APK 未内嵌原生模块（如 OTA 热更或旧底包环境），
 *    Metro 会在模块顶层抛出 Cannot find native module 'ExpoSharing' 并直接调用
 *    ExceptionsManagerModule.reportException 触发进程致命闪退。
 * 2. 必须先通过 expo 的 requireOptionalNativeModule('ExpoSharing') 预检 Native 宿主模块注册表；
 *    若未注册则安全返回 false，决不触发 Metro 模块求值异常。
 * 3. 宿主确认具备原生模块后，安全动态导入 expo-sharing 并调用 shareAsync 跨应用分发文件实体。
 */
export async function safeShareFileAsync(
  fileUri: string,
  options: { mimeType?: string; dialogTitle?: string; UTI?: string } = {}
): Promise<boolean> {
  try {
    let hasNativeModule = false;
    try {
      const g = globalThis as any;
      if (g.expo?.modules?.ExpoSharing) {
        hasNativeModule = true;
      } else {
        const mod = requireOptionalNativeModule('ExpoSharing');
        hasNativeModule = Boolean(mod);
      }
    } catch {
      hasNativeModule = false;
    }

    if (!hasNativeModule) {
      return false;
    }

    const Sharing = await import('expo-sharing');
    if (typeof Sharing.isAvailableAsync === 'function') {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        return false;
      }
    }

    if (typeof Sharing.shareAsync === 'function') {
      await Sharing.shareAsync(fileUri, options);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * 唤起系统原生分享面板
 */
export async function shareExportedDocument(result: ExportDocumentResult): Promise<void> {
  // 1. 优先调用 safeShareFileAsync 分享真实文件实体（携带 Android Intent.EXTRA_STREAM）
  const shared = await safeShareFileAsync(result.fileUri, {
    mimeType: result.mimeType,
    dialogTitle: result.fileName,
  });
  if (shared) {
    return;
  }

  let shareMessage = result.fileName;
  try {
    if (result.format !== 'pdf') {
      const content = await FileSystem.readAsStringAsync(result.fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      // Android Share.share 仅传递 message 文本，因此在文本合理长度内直接透传真实文档内容，杜绝仅发送单行文件名
      if (content && content.length < 50000) {
        shareMessage = `《${result.fileName}》\n\n${content}`;
      }
    }
  } catch {}

  await Share.share({
    title: result.fileName,
    message: shareMessage,
    url: result.fileUri,
  });
}

/**
 * 通过 Android SAF (StorageAccessFramework) 保存到用户指定的手机公共目录
 */
export async function saveExportedDocumentToLocalSaf(
  fileUri: string,
  fileName: string,
  mimeType: string,
  initialDirectoryUri?: string | null
): Promise<string> {
  const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
    initialDirectoryUri ?? null
  );

  if (!permissions.granted) {
    throw new Error('未授权目录，已取消保存。');
  }

  const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
    permissions.directoryUri,
    fileName,
    mimeType
  );

  const content = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await FileSystem.writeAsStringAsync(destUri, content, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return destUri;
}
