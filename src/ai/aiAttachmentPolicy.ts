import {
  AI_CHAT_ATTACHMENT_MAX_COUNT,
  AI_CHAT_ATTACHMENT_MAX_TOTAL_BYTES,
  AI_CHAT_ATTACHMENT_UNKNOWN_SIZE_RESERVE_BYTES,
  AI_CHAT_DOCUMENT_MAX_BYTES,
  AI_CHAT_IMAGE_MAX_BYTES,
} from '../constants/limits';

export interface AiAttachmentDescriptor {
  kind: 'image' | 'video' | 'document';
  name: string;
  size?: number | null;
}

export type AiAttachmentValidationResult =
  | { ok: true; totalBytes: number }
  | {
      ok: false;
      code: 'count' | 'single_image_bytes' | 'single_document_bytes' | 'single_video_bytes' | 'total_bytes';
      message: string;
    };

function formatMiB(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

export function validateAiChatAttachments(
  attachments: readonly AiAttachmentDescriptor[],
): AiAttachmentValidationResult {
  if (attachments.length > AI_CHAT_ATTACHMENT_MAX_COUNT) {
    return {
      ok: false,
      code: 'count',
      message: `每次最多添加 ${AI_CHAT_ATTACHMENT_MAX_COUNT} 个附件。`,
    };
  }

  let totalBytes = 0;
  for (const attachment of attachments) {
    const size = typeof attachment.size === 'number' && Number.isFinite(attachment.size) && attachment.size >= 0
      ? attachment.size
      : AI_CHAT_ATTACHMENT_UNKNOWN_SIZE_RESERVE_BYTES;
    const singleLimit = attachment.kind === 'image'
      ? AI_CHAT_IMAGE_MAX_BYTES
      : AI_CHAT_DOCUMENT_MAX_BYTES;
    if (size > singleLimit) {
      const code = attachment.kind === 'image'
        ? 'single_image_bytes'
        : attachment.kind === 'video'
          ? 'single_video_bytes'
          : 'single_document_bytes';
      return {
        ok: false,
        code,
        message: `${attachment.name} 超过单文件 ${formatMiB(singleLimit)} 限制。`,
      };
    }
    totalBytes += size;
  }

  if (totalBytes > AI_CHAT_ATTACHMENT_MAX_TOTAL_BYTES) {
    return {
      ok: false,
      code: 'total_bytes',
      message: `附件总大小不能超过 ${formatMiB(AI_CHAT_ATTACHMENT_MAX_TOTAL_BYTES)}。`,
    };
  }
  return { ok: true, totalBytes };
}

export function assertAiChatAttachments(
  attachments: readonly AiAttachmentDescriptor[],
): void {
  const result = validateAiChatAttachments(attachments);
  if (!result.ok) {
    throw new Error(result.message);
  }
}
