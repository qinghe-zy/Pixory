/**
 * 伴聊会话列表与通讯录消息摘要统一净化工具
 *
 * 提升正则至模块作用域 (js-hoist-regexp)，过滤内部控制标签与图片 JSON 结构，
 * 确保列表页与侧边通讯录预览干净自然。
 */

const META_TAG_PREVIEW_REGEX = /\[(STATUS|MOOD|STICKER|HEARTBEAT|PING|NUDGE|STAGE_FOLLOWUP):[^\]]*\]/gi;
const BR_GLOBAL_REGEX = /\[BR\]/gi;
const WHITESPACE_COLLAPSE_REGEX = /\s+/g;
const DOCUMENT_TAG_REGEX = /\[(?:DOCUMENT|DOC):\s*([^\]|\n]+)(?:\|[\s\S]*?\]|\][\s\S]*?\[\/(?:DOCUMENT|DOC)\])/i;

export function formatImPreviewText(
  raw: string | null | undefined,
  fallbackText: string = '发句问候，开启今天的对话吧'
): string {
  if (!raw) return fallbackText;
  const trimmed = raw.trim();
  if (!trimmed) return fallbackText;

  if (
    trimmed.startsWith('{') &&
    (trimmed.includes('"imageUri"') || trimmed.includes('"type":"image"'))
  ) {
    return '[图片]';
  }

  const docMatch = trimmed.match(DOCUMENT_TAG_REGEX);
  if (docMatch) {
    return `[文件] ${docMatch[1].trim()}`;
  }

  const cleaned = trimmed
    .replace(META_TAG_PREVIEW_REGEX, '')
    .replace(BR_GLOBAL_REGEX, ' ')
    .replace(WHITESPACE_COLLAPSE_REGEX, ' ')
    .trim();

  return cleaned || fallbackText;
}
