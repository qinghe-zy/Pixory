import {
  aiThreadRepository,
  runWithDatabaseSpace,
  runWithTransactionRetry,
  settingsRepository,
  type PixorySpace,
} from '../database';
import type {
  AiMessageAttachmentRecord,
  AiMessagePageCursor,
} from '../database/repositories/aiThreadRepository';
import type { AiComposerAttachment } from '../components/ai/AiChatComposer';
import { getAiDocumentsDir } from '../services/fileStorageService';
import {
  copyAttachmentToThreadStorage,
  ensureFileTransferThread,
  loadThreadMessagePage,
  loadThreadMessagePageAroundAnchor,
  type AiMessageWithCitations,
  type AiThreadMessagePage,
} from './aiChatService';
import { cleanupDeletedMaterialFiles } from './aiDocumentService';
import { FILE_TRANSFER_THREAD_ID } from './systemAssistant/capabilityProfile';

export const FILE_TRANSFER_PAGE_SIZE = 40;

export interface FileTransferUserProfile {
  avatarUri: string | null;
  nickname: string | null;
}

function createFileTransferId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildFileTransferMessagePreview(
  content: string,
  attachments: ReadonlyArray<{ kind: 'image' | 'document'; name?: string | null }>,
): string {
  const trimmed = content.trim();
  if (trimmed) {
    return trimmed;
  }
  const first = attachments[0];
  if (!first) {
    return '';
  }
  if (first.kind === 'image') {
    return '[图片]';
  }
  return first.name ? `[文档] ${first.name}` : '[文档]';
}

function isManagedThreadAttachmentUri(space: PixorySpace, uri: string): boolean {
  if (!uri || uri.includes('..')) {
    return false;
  }
  const threadDocsPrefix = `${getAiDocumentsDir(space)}thread_${FILE_TRANSFER_THREAD_ID}/`;
  return uri.startsWith(threadDocsPrefix);
}

async function refreshFileTransferLastPreviewInDatabase(
  db: Parameters<typeof aiThreadRepository.listMessages>[0],
): Promise<void> {
  const remainingMessages = await aiThreadRepository.listMessages(db, FILE_TRANSFER_THREAD_ID);
  const lastMessage = remainingMessages[remainingMessages.length - 1];
  let attachments: AiMessageAttachmentRecord[] = [];
  if (lastMessage) {
    attachments = await aiThreadRepository.listMessageAttachments(db, lastMessage.id);
  }
  const preview = lastMessage
    ? buildFileTransferMessagePreview(lastMessage.content ?? '', attachments)
    : '';
  await aiThreadRepository.updateThread(db, FILE_TRANSFER_THREAD_ID, {
    lastMessagePreview: preview,
  });
}

export async function loadFileTransferUserProfile(
  space: PixorySpace,
): Promise<FileTransferUserProfile> {
  return runWithDatabaseSpace(space, async (db) => {
    const avatarUri = await settingsRepository.getProfileAvatarUri(db);
    const nickname = await settingsRepository.getProfileNickname(db);
    return { avatarUri, nickname };
  });
}

export async function loadFileTransferMessagePage(
  space: PixorySpace,
  options?: {
    anchorMessageId?: string;
    beforeCursor?: AiMessagePageCursor;
    limit?: number;
  },
): Promise<AiThreadMessagePage> {
  await ensureFileTransferThread(space);
  const limit = options?.limit ?? FILE_TRANSFER_PAGE_SIZE;
  if (options?.anchorMessageId) {
    return loadThreadMessagePageAroundAnchor(space, FILE_TRANSFER_THREAD_ID, {
      anchorMessageId: options.anchorMessageId,
      branchScopes: [],
      limit,
      selectedVersionByMessageId: {},
    });
  }
  return loadThreadMessagePage(space, FILE_TRANSFER_THREAD_ID, {
    beforeCursor: options?.beforeCursor,
    branchScopes: [],
    limit,
    selectedVersionByMessageId: {},
  });
}

export async function sendFileTransferMessage(
  space: PixorySpace,
  input: {
    attachments: AiComposerAttachment[];
    content: string;
    createdAt: string;
    messageId: string;
  },
): Promise<AiMessageWithCitations> {
  await ensureFileTransferThread(space);

  const copiedAttachments: Array<{
    attachment: AiComposerAttachment;
    localUri: string;
    recordId: string;
  }> = [];

  try {
    for (const attachment of input.attachments) {
      const localUri = await copyAttachmentToThreadStorage({
        attachment: { name: attachment.name, uri: attachment.uri },
        space,
        threadId: FILE_TRANSFER_THREAD_ID,
      });
      copiedAttachments.push({
        attachment,
        localUri,
        recordId: createFileTransferId('ftattach'),
      });
    }
  } catch (error) {
    await cleanupDeletedMaterialFiles(copiedAttachments.map((item) => item.localUri));
    throw error;
  }

  let persistedResult: {
    message: Awaited<ReturnType<typeof aiThreadRepository.createMessage>>;
    attachments: AiMessageAttachmentRecord[];
  };

  try {
    persistedResult = await runWithDatabaseSpace(space, (db) =>
      runWithTransactionRetry(db, async (txn) => {
        const message = await aiThreadRepository.createMessage(txn, {
          id: input.messageId,
          threadId: FILE_TRANSFER_THREAD_ID,
          branchRootMessageId: null,
          branchVersionIndex: null,
          role: 'user',
          status: 'completed',
          content: input.content,
          createdAt: input.createdAt,
          completedAt: input.createdAt,
        });

        const createdAttachments: AiMessageAttachmentRecord[] = [];
        for (const item of copiedAttachments) {
          const record = await aiThreadRepository.createMessageAttachment(txn, {
            id: item.recordId,
            messageId: input.messageId,
            threadId: FILE_TRANSFER_THREAD_ID,
            kind: item.attachment.kind,
            name: item.attachment.name,
            localUri: item.localUri,
            mimeType: item.attachment.mimeType ?? undefined,
            fileSize: item.attachment.size ?? undefined,
          });
          createdAttachments.push(record);
        }

        const previewText = buildFileTransferMessagePreview(input.content, createdAttachments);
        await aiThreadRepository.updateThread(txn, FILE_TRANSFER_THREAD_ID, {
          lastMessagePreview: previewText,
        });

        return { message, attachments: createdAttachments };
      }),
    );
  } catch (error) {
    await cleanupDeletedMaterialFiles(copiedAttachments.map((item) => item.localUri));
    throw error;
  }

  return {
    ...persistedResult.message,
    attachments: persistedResult.attachments,
    citations: [],
    messageVersions: [],
    versionIndex: 1,
    versionTotal: 1,
  };
}

export async function updateFileTransferMessageText(
  space: PixorySpace,
  messageId: string,
  content: string,
): Promise<void> {
  await runWithDatabaseSpace(space, (db) =>
    runWithTransactionRetry(db, async (txn) => {
      const existing = await aiThreadRepository.findMessageById(txn, messageId);
      if (!existing || existing.threadId !== FILE_TRANSFER_THREAD_ID) {
        return;
      }
      await aiThreadRepository.updateMessage(txn, messageId, {
        content,
      });
      await refreshFileTransferLastPreviewInDatabase(txn);
    }),
  );
}

export async function deleteFileTransferMessages(
  space: PixorySpace,
  messageIds: string[],
): Promise<void> {
  const uniqueIds = Array.from(new Set(messageIds)).filter(Boolean);
  if (uniqueIds.length === 0) {
    return;
  }
  const managedFileUris: string[] = [];
  await runWithDatabaseSpace(space, (db) =>
    runWithTransactionRetry(db, async (txn) => {
      const ownedIds: string[] = [];
      for (const messageId of uniqueIds) {
        const existing = await aiThreadRepository.findMessageById(txn, messageId);
        if (existing?.threadId === FILE_TRANSFER_THREAD_ID) {
          ownedIds.push(messageId);
        }
      }
      if (ownedIds.length === 0) {
        return;
      }
      const attachmentsMap = await aiThreadRepository.listAttachmentsForMessages(txn, ownedIds);
      for (const attachments of Object.values(attachmentsMap)) {
        for (const attachment of attachments) {
          if (attachment.localUri && isManagedThreadAttachmentUri(space, attachment.localUri)) {
            managedFileUris.push(attachment.localUri);
          }
        }
      }
      await aiThreadRepository.deleteMessagesByIds(txn, ownedIds);
      await refreshFileTransferLastPreviewInDatabase(txn);
    }),
  );
  await cleanupDeletedMaterialFiles(managedFileUris);
}
