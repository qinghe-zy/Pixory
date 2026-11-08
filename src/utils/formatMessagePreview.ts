/**
 * 消息列表与会话摘要统一净化工具
 *
 * 彻底过滤内部控制标签、系统提示与结构化多媒体原始 JSON（如语音、图片、文档、表情等），
 * 确保长聊首页、伴聊首页、历史记录抽屉与系统通知摘要干净自然、安全合规。
 */

const SYSTEM_PROMPT_BLOCK_REGEX = /<(?:system_prompt|system|prompt|active_artifact_context)>[\s\S]*?<\/(?:system_prompt|system|prompt|active_artifact_context)>/gi;
const META_TAG_PREVIEW_REGEX = /\[(STATUS|MOOD|STICKER|HEARTBEAT|PING|NUDGE|STAGE_FOLLOWUP):[^\]]*\]/gi;
const SYSTEM_TAG_PREVIEW_REGEX = /\[(?:系统提示|系统事件|系统通知|系统指令|前台高粘性伴随指令|前台伴随节奏感知|前台伴随情境|SYSTEM|SYS)[：:][^\]]*\]/gi;
const SYSTEM_PREFIX_REGEX = /^\[?(?:系统提示|系统事件|系统通知|系统指令)[：:][^\]\n]*\]?\s*/i;
const FALLBACK_ATTACHMENT_PROMPT_REGEX = /^(?:请根据以下附件继续对话[。.]?|请查看附件[。.]?)\s*/i;
const ATTACHMENT_DOC_LINE_REGEX = /- (?:文档|文件)[：:]\s*([^\n，,]+)/i;
const ATTACHMENT_IMG_LINE_REGEX = /- 图片[：:]\s*([^\n，,]+)/i;
const LEGACY_FILE_PREFIX_REGEX = /^\[文件\]\s*(.*)$/;
const BR_GLOBAL_REGEX = /\[BR\]/gi;
const WHITESPACE_COLLAPSE_REGEX = /\s+/g;
const DOCUMENT_TAG_REGEX = /\[(?:DOCUMENT|DOC):\s*([^\]|\n]+?)(?:\|[\s\S]*?\]|\][\s\S]*?\[\/(?:DOCUMENT|DOC)\]|\])/i;
const VOICE_TAG_REGEX = /^\[(?:语音(?:消息)?|VOICE)(?:\s*(\d+)["'秒]?)?\]\s*[:：]?\s*(.*)$/i;
const EMOJI_PREFIX_REGEX = /^\[表情\]\s*(.+)$/;
const STICKER_TAG_REGEX = /^\[STICKER:\s*([^\]]+)\]$/i;

function parseJsonSafely(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function extractStringField(source: string, fieldName: string): string | null {
  const regex = new RegExp(`"${fieldName}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`);
  const match = source.match(regex);
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}

function extractNumberField(source: string, fieldName: string): number | null {
  const regex = new RegExp(`"${fieldName}"\\s*:\\s*(\\d+)`);
  const match = source.match(regex);
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : null;
}

/**
 * 格式化表情名称为闭合的 [表情名称]
 */
function formatStickerName(rawName?: string | null): string {
  const name = (rawName ?? '').trim();
  if (!name || name === '[表情]' || name === '表情') {
    return '[表情]';
  }
  if (name.startsWith('[') && name.endsWith(']')) {
    return name;
  }
  if (name.startsWith('表情')) {
    return `[${name}]`;
  }
  return `[表情${name}]`;
}

/**
 * 统一净化消息预览文案
 *
 * @param raw 原始消息文本、数据库 lastMessagePreview 或 ai_messages.content
 * @param fallbackText 当消息为空或全部由内部控制标签构成时兜底文案
 */
export function formatMessagePreview<T extends string | null = string>(
  raw: string | null | undefined,
  fallbackText: T = '' as T
): string | T {
  if (!raw) return fallbackText;
  const trimmed = raw.trim();
  if (!trimmed) return fallbackText;

  // 1. JSON 结构化消息处理（完整或被 SQLite .slice(0, 80) 截断的 JSON 串）
  if (trimmed.startsWith('{')) {
    const parsed = parseJsonSafely(trimmed);

    // 1.1 完整 JSON 命中
    if (parsed && typeof parsed === 'object') {
      // 语音消息：优先以 [语音] 3" 规范格式展示
      if (parsed.type === 'voice' || parsed.audioUri) {
        if (typeof parsed.durationMs === 'number' && parsed.durationMs > 0) {
          const s = Math.max(1, Math.round(parsed.durationMs / 1000));
          return `[语音] ${s}"`;
        }
        if (typeof parsed.duration === 'number' && parsed.duration > 0) {
          const s = Math.max(1, Math.round(parsed.duration));
          return `[语音] ${s}"`;
        }
        const transcription = (parsed.transcription ?? parsed.text ?? '').trim();
        if (transcription) {
          const matchSec = transcription.match(/^(\d+)["'秒]?$/);
          if (matchSec) return `[语音] ${matchSec[1]}"`;
          return `[语音] ${transcription}`;
        }
        return '[语音]';
      }

      // 图片消息
      if (parsed.type === 'image' || parsed.imageUri) {
        const text = (parsed.text ?? '').trim();
        if (text && text !== '[图片]') {
          return `[图片] ${text}`;
        }
        if (parsed.boundIpName) {
          return `[图片·${parsed.boundIpName}]`;
        }
        return '[图片]';
      }

      // 表情消息
      if (parsed.type === 'sticker') {
        return formatStickerName(parsed.name ?? parsed.text);
      }

      // 文档消息：统一使用 [文档] 文档名
      if (parsed.type === 'document' || parsed.document) {
        const title = (parsed.title || parsed.document?.title || parsed.text || '').trim();
        return title ? `[文档] ${title}` : '[文档]';
      }

      // 日记卡片
      if (parsed.type === 'diary_card' || parsed.diaryDate || parsed.diaryId) {
        return '[日记已生成]';
      }

      // 思考过程
      if (parsed.type === 'thought') {
        return '[思考过程]';
      }
    }

    // 1.2 截断 JSON 容错提取（针对底层因截断无法通过 JSON.parse 的脏数据）
    if (trimmed.includes('"type":"voice"') || trimmed.includes('"audioUri"')) {
      const dur = extractNumberField(trimmed, 'durationMs') ?? extractNumberField(trimmed, 'duration');
      if (dur && dur > 0) {
        const s = Math.max(1, Math.round(dur > 100 ? dur / 1000 : dur));
        return `[语音] ${s}"`;
      }
      const transcription = extractStringField(trimmed, 'transcription');
      if (transcription && transcription.trim()) {
        const matchSec = transcription.trim().match(/^(\d+)["'秒]?$/);
        if (matchSec) return `[语音] ${matchSec[1]}"`;
        return `[语音] ${transcription.trim()}`;
      }
      return '[语音]';
    }

    if (trimmed.includes('"type":"image"') || trimmed.includes('"imageUri"')) {
      const text = extractStringField(trimmed, 'text');
      if (text && text.trim() && text.trim() !== '[图片]') {
        return `[图片] ${text.trim()}`;
      }
      const boundIpName = extractStringField(trimmed, 'boundIpName');
      if (boundIpName && boundIpName.trim()) {
        return `[图片·${boundIpName.trim()}]`;
      }
      return '[图片]';
    }

    if (trimmed.includes('"type":"sticker"')) {
      const name = extractStringField(trimmed, 'name') || extractStringField(trimmed, 'text');
      return formatStickerName(name);
    }

    if (trimmed.includes('"type":"document"') || trimmed.includes('"document"')) {
      const title = extractStringField(trimmed, 'title');
      if (title && title.trim()) {
        return `[文档] ${title.trim()}`;
      }
      return '[文档]';
    }

    if (trimmed.includes('"type":"diary_card"') || trimmed.includes('"diaryDate"') || trimmed.includes('"diaryId"')) {
      return '[日记已生成]';
    }

    if (trimmed.includes('"type":"thought"')) {
      return '[思考过程]';
    }
  }

  // 2. 文本消息中的语音、文档与独立表情标签处理
  if (trimmed === '[发送了一条语音消息]') {
    return '[语音]';
  }

  const voiceTagMatch = trimmed.match(VOICE_TAG_REGEX);
  if (voiceTagMatch) {
    const seconds = voiceTagMatch[1];
    const text = voiceTagMatch[2]?.trim();
    if (seconds) {
      return `[语音] ${seconds}"`;
    }
    if (text) {
      const matchSec = text.match(/^(\d+)["'秒]?$/);
      if (matchSec) return `[语音] ${matchSec[1]}"`;
      return `[语音] ${text}`;
    }
    return '[语音]';
  }

  const docMatch = trimmed.match(DOCUMENT_TAG_REGEX);
  if (docMatch) {
    return `[文档] ${docMatch[1].trim()}`;
  }

  const legacyFileMatch = trimmed.match(LEGACY_FILE_PREFIX_REGEX);
  if (legacyFileMatch) {
    const fn = legacyFileMatch[1].trim();
    return fn ? `[文档] ${fn}` : '[文档]';
  }

  const emojiMatch = trimmed.match(EMOJI_PREFIX_REGEX);
  if (emojiMatch) {
    return formatStickerName(emojiMatch[1]);
  }

  const stickerMatch = trimmed.match(STICKER_TAG_REGEX);
  if (stickerMatch) {
    return formatStickerName(stickerMatch[1]);
  }

  // 3. 内部控制标签、系统提示与特殊排版标签过滤
  let cleaned = trimmed
    .replace(SYSTEM_PROMPT_BLOCK_REGEX, '')
    .replace(SYSTEM_TAG_PREVIEW_REGEX, '')
    .replace(META_TAG_PREVIEW_REGEX, '')
    .replace(SYSTEM_PREFIX_REGEX, '')
    .replace(BR_GLOBAL_REGEX, ' ')
    .trim();

  // 若以占位提示词“请根据以下附件继续对话。”开头，剥离该前缀
  if (FALLBACK_ATTACHMENT_PROMPT_REGEX.test(cleaned)) {
    cleaned = cleaned.replace(FALLBACK_ATTACHMENT_PROMPT_REGEX, '').trim();
  }

  // 若内容包含附件区域标记 [附件]
  if (cleaned.includes('[附件]')) {
    const docMatchInText = cleaned.match(ATTACHMENT_DOC_LINE_REGEX);
    if (docMatchInText && docMatchInText[1]) {
      const docName = docMatchInText[1].trim();
      const beforeAtt = cleaned.slice(0, cleaned.indexOf('[附件]')).trim();
      if (!beforeAtt) {
        return `[文档] ${docName}`;
      }
    }
    const imgMatchInText = cleaned.match(ATTACHMENT_IMG_LINE_REGEX);
    if (imgMatchInText) {
      const beforeAtt = cleaned.slice(0, cleaned.indexOf('[附件]')).trim();
      if (!beforeAtt) {
        return '[图片]';
      }
    }
  }

  cleaned = cleaned.replace(WHITESPACE_COLLAPSE_REGEX, ' ').trim();

  return cleaned || fallbackText;
}

export const formatMessagePreviewText = formatMessagePreview;
