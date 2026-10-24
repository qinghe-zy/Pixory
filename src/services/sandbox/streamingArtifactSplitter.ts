import { sniffCodeBlockInStream, type SniffResult } from './sandboxDetector';

export interface StreamingArtifactInfo {
  code: string;
  language: 'html' | 'svg';
  title: string;
  lineCount: number;
  status: 'streaming' | 'ready';
}

export interface StreamingParsedSegments {
  hasArtifact: boolean;
  status: 'pending_sniff' | 'streaming_artifact' | 'ready_artifact' | 'normal';
  preText: string;
  artifact?: StreamingArtifactInfo;
  postText: string;
}

/**
 * 实时将流式消息内容切分为前文、制品取景框占位与后文三段
 * 配合 60 字符微缓冲防闪与首行契约嗅探机制
 */
export function parseStreamingArtifactSegments(
  content: string,
  isMessageStreaming: boolean
): StreamingParsedSegments {
  if (!content) {
    return { hasArtifact: false, status: 'normal', preText: '', postText: '' };
  }

  // 1. 扫描代码块围栏，寻找可作为制品的候选围栏（支持前置普通代码块的复合消息）
  const fenceRegex = /```([a-zA-Z0-9_-]*)[^\n]*\n?/g;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    const fenceIndex = match.index;
    const lang = (match[1] || '').trim();
    const codeStartIndex = fenceIndex + match[0].length;
    const afterCodeStart = content.slice(codeStartIndex);
    const closeIndex = afterCodeStart.indexOf('```');
    const isFenceClosed = closeIndex !== -1;

    const rawCode = isFenceClosed ? afterCodeStart.slice(0, closeIndex) : afterCodeStart;
    const postText = isFenceClosed
      ? afterCodeStart.slice(closeIndex + 3).replace(/^\n+/, '')
      : '';

    const sniff: SniffResult = sniffCodeBlockInStream(
      rawCode,
      lang,
      isFenceClosed,
      isMessageStreaming
    );

    if (sniff.status === 'pending_sniff') {
      return {
        hasArtifact: true,
        status: 'pending_sniff',
        preText: content.slice(0, fenceIndex),
        postText: '',
      };
    }

    if (sniff.status === 'streaming_artifact' || sniff.status === 'ready_artifact') {
      return {
        hasArtifact: true,
        status: sniff.status,
        preText: content.slice(0, fenceIndex),
        artifact: {
          code: rawCode,
          language: sniff.artifactType || 'html',
          title: sniff.liveTitle || (sniff.artifactType === 'svg' ? 'SVG 矢量绘图' : 'HTML5 交互呈现'),
          lineCount: sniff.lineCount,
          status: sniff.status === 'ready_artifact' ? 'ready' : 'streaming',
        },
        postText,
      };
    }

    // 若当前为非制品的普通代码块（如 python/bash），在闭合后继续向后探测后续代码块
    if (isFenceClosed) {
      fenceRegex.lastIndex = codeStartIndex + closeIndex + 3;
    } else {
      break;
    }
  }

  // 2. 检测无围栏的原生完整 HTML/SVG 输出
  const rawHtmlMatch = content.match(/(<!doctype\s+html\b|<html\b|<svg\b)/i);
  if (rawHtmlMatch && rawHtmlMatch.index !== undefined) {
    const preText = content.slice(0, rawHtmlMatch.index);
    const remaining = content.slice(rawHtmlMatch.index);
    const isSvg = /<svg\b/i.test(rawHtmlMatch[0]);
    const closeRegex = isSvg ? /<\/svg>/i : /<\/html>/i;
    const closeMatch = remaining.match(closeRegex);
    const closeIndex = closeMatch?.index ?? -1;
    const isClosed = closeIndex !== -1 && Boolean(closeMatch);

    const rawCode = isClosed && closeMatch
      ? remaining.slice(0, closeIndex + closeMatch[0].length)
      : remaining;
    const postText = isClosed && closeMatch
      ? remaining.slice(closeIndex + closeMatch[0].length).replace(/^\n+/, '')
      : '';

    const sniff = sniffCodeBlockInStream(
      rawCode,
      isSvg ? 'svg' : 'html',
      isClosed,
      isMessageStreaming
    );

    if (sniff.status === 'pending_sniff') {
      return {
        hasArtifact: true,
        status: 'pending_sniff',
        preText,
        postText: '',
      };
    }

    if (sniff.status === 'streaming_artifact' || sniff.status === 'ready_artifact') {
      return {
        hasArtifact: true,
        status: sniff.status,
        preText,
        artifact: {
          code: rawCode,
          language: sniff.artifactType || 'html',
          title: sniff.liveTitle || (sniff.artifactType === 'svg' ? 'SVG 矢量绘图' : 'HTML5 交互呈现'),
          lineCount: sniff.lineCount,
          status: sniff.status === 'ready_artifact' ? 'ready' : 'streaming',
        },
        postText,
      };
    }
  }

  return {
    hasArtifact: false,
    status: 'normal',
    preText: content,
    postText: '',
  };
}
