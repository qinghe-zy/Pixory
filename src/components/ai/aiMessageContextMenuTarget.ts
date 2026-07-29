import type {
  AiMessageWithCitations,
  AiStreamingMessagePatch,
} from '../../ai/aiChatService';

export function mergeBufferedStreamingPatchIntoContextMenuTarget(
  message: AiMessageWithCitations,
  patch: AiStreamingMessagePatch | null,
): AiMessageWithCitations {
  if (!patch || patch.id !== message.id) {
    return message;
  }

  return {
    ...message,
    citations: patch.citations ?? message.citations,
    completedAt:
      patch.completedAt === undefined ? message.completedAt : patch.completedAt,
    content: patch.content ?? message.content,
    errorMessage:
      patch.errorMessage === undefined ? message.errorMessage : patch.errorMessage,
    reasoningText:
      patch.reasoningText === undefined
        ? message.reasoningText
        : patch.reasoningText,
    status: patch.status ?? message.status,
  };
}
