import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import { parseContinuityImportDocument } from './aiContinuityImportParser';
import { reviewContinuityImportSession } from './aiContinuityImportReviewService';

function createAiId(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${timestamp}_${random}`;
}

function hashContinuityDocument(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return String(hash >>> 0);
}

function assertContinuityImportHasUsableContent(input: {
  fileName: string;
  parsed: ReturnType<typeof parseContinuityImportDocument>;
}) {
  const hasMessages = input.parsed.messages.length > 0;
  const hasBlocks = input.parsed.blocks.some((block) => block.content.trim().length > 0);
  const hasMeaningfulRawText = input.parsed.rawText.replace(/\s+/g, '').trim().length > 0;
  if (!hasMessages && !hasBlocks) {
    const lookedNative = input.parsed.rawText.includes('Pixory Role Continuity Export')
      || /- Source:\s*pixory-native/i.test(input.parsed.rawText);
    if (lookedNative) {
      throw new Error('导入失败：该 Pixory 连续性文件的机器结构已损坏，且没有恢复出可安全导入的聊天或连续性内容。请重新导出后再试。');
    }
    if (!hasMeaningfulRawText) {
      throw new Error('导入失败：文件内容为空，无法接回外部对话。');
    }
    throw new Error(`导入失败：无法从 ${input.fileName} 中识别出可安全导入的聊天记录或连续性内容。请检查格式后重试。`);
  }
}

export async function createContinuityImportDraft(input: {
  fileName: string;
  text: string;
  space: PixorySpace;
  threadId: string;
}) {
  const parsed = parseContinuityImportDocument({ fileName: input.fileName, text: input.text });
  assertContinuityImportHasUsableContent({ fileName: input.fileName, parsed });
  return runWithDatabaseSpace(input.space, async (db) => {
    const session = await aiThreadRepository.createContinuityImportSession(db, {
      id: createAiId('aiimport'),
      threadId: input.threadId,
      space: input.space,
      sourceKind: parsed.mode,
      status: 'draft',
      reviewGateState: parsed.mode === 'pixory_native_markdown' ? 'not_required' : 'pending_review',
      rollbackState: 'available',
      rollbackRoundsRemaining: 10,
      rawDocumentText: parsed.rawText,
      rawDocumentHash: hashContinuityDocument(parsed.rawText),
      parsedMessageCount: parsed.messages.length,
      containsCompressedContinuity: parsed.containsCompressedContinuity,
    });
    await aiThreadRepository.createContinuityImportBlocks(
      db,
      session.id,
      parsed.blocks.map((block) => ({
        id: createAiId('aiimportblock'),
        kind: block.kind,
        title: block.title,
        content: block.content,
      }))
    );
    return session;
  });
}

export async function importThreadContinuity(input: {
  fileName: string;
  text: string;
  space: PixorySpace;
  threadId: string;
}) {
  const parsed = parseContinuityImportDocument({ fileName: input.fileName, text: input.text });
  assertContinuityImportHasUsableContent({ fileName: input.fileName, parsed });
  const importedMessages = parsed.mode === 'pixory_native_markdown'
    ? parsed.nativePayload?.messages ?? parsed.messages
    : parsed.messages;
  return runWithDatabaseSpace(input.space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, input.threadId);
    if (!thread) {
      throw new Error('AI thread was not found.');
    }
    const now = new Date().toISOString();
    const branchScopes = thread.currentBranchRootMessageId && thread.currentBranchVersionIndex != null
      ? await aiThreadRepository.resolveBranchLineage(db, thread.currentBranchRootMessageId, thread.currentBranchVersionIndex)
      : [];
    const importAnchor = (await aiThreadRepository.listMessagesBase(db, input.threadId, 1, branchScopes))[0] ?? null;
    const session = await aiThreadRepository.createContinuityImportSession(db, {
      id: createAiId('aiimport'),
      threadId: input.threadId,
      space: input.space,
      sourceKind: parsed.mode,
      sourcePlatform: parsed.sourcePlatform ?? (parsed.mode === 'pixory_native_markdown' ? 'Pixory' : null),
      formatVersion: parsed.formatVersion ?? null,
      status: 'imported',
      reviewGateState: parsed.mode === 'pixory_native_markdown' ? 'not_required' : 'pending_review',
      rollbackState: 'available',
      rollbackRoundsRemaining: 10,
      rawDocumentText: parsed.rawText,
      rawDocumentHash: hashContinuityDocument(parsed.rawText),
      parsedMessageCount: importedMessages.length,
      containsCompressedContinuity: parsed.containsCompressedContinuity,
      preImportBranchRootMessageId: thread.currentBranchRootMessageId,
      preImportBranchVersionIndex: thread.currentBranchVersionIndex,
      importAnchorMessageId: importAnchor?.id ?? null,
      importAnchorMessageRole: importAnchor?.role ?? null,
    });
    await aiThreadRepository.createContinuityImportBlocks(
      db,
      session.id,
      parsed.blocks.map((block) => ({
        id: createAiId('aiimportblock'),
        kind: block.kind,
        title: block.title,
        content: block.content,
      }))
    );
    const importRoot = await aiThreadRepository.createSyntheticContinuityImportRoot(db, {
      id: createAiId('aimsg'),
      threadId: input.threadId,
      importSessionId: session.id,
      createdAt: now,
    });
    await aiThreadRepository.updateContinuityImportSession(db, session.id, {
      importedBranchRootMessageId: importRoot.id,
      importedBranchVersionIndex: 1,
      importBranchRootKind: 'continuity_import_root',
    });
    for (const message of importedMessages) {
      await aiThreadRepository.createContinuityImportMessage(db, {
        id: createAiId('aimsg'),
        threadId: input.threadId,
        role: message.role,
        status: 'completed',
        content: message.content,
        branchRootMessageId: importRoot.id,
        branchVersionIndex: 1,
        continuityImportSessionId: session.id,
        continuitySyntheticKind: null,
        completedAt: message.createdAt ?? now,
      });
    }
    await aiThreadRepository.updateThread(db, input.threadId, {
      currentBranchRootMessageId: importRoot.id,
      currentBranchVersionIndex: 1,
    });
    await aiThreadRepository.setContinuityImportRollbackState(db, {
      importSessionId: session.id,
      rollbackState: 'available',
      rollbackRoundsRemaining: session.rollbackRoundsRemaining,
    });
    if (session.reviewGateState === 'pending_review') {
      void reviewContinuityImportSession({
        importSessionId: session.id,
        space: input.space,
      });
    }
    return {
      importRoot,
      session,
      partial: parsed.partial,
      continuityBlockCount: parsed.blocks.length,
      importedMessageCount: importedMessages.length,
    };
  });
}

export async function onContinuityImportConversationRoundCompleted(input: {
  importSessionId: string;
  space: PixorySpace;
}) {
  return runWithDatabaseSpace(input.space, async (db) => {
    const session = await aiThreadRepository.decrementContinuityRollbackRoundsRemaining(db, input.importSessionId);
    if (!session) {
      return null;
    }
    const rollbackRoundsRemaining = session.rollbackRoundsRemaining;
    if (rollbackRoundsRemaining <= 0) {
      return aiThreadRepository.stabilizeContinuityImportSession(
        db,
        input.importSessionId,
        new Date().toISOString()
      );
    }
    return session;
  });
}

export async function rollbackThreadContinuityImport(input: {
  importSessionId: string;
  space: PixorySpace;
}) {
  return runWithDatabaseSpace(input.space, async (db) => {
    const session = await aiThreadRepository.findContinuityImportSessionById(db, input.importSessionId);
    if (!session) {
      throw new Error('Continuity import session was not found.');
    }
    if (session.rollbackState !== 'available' || session.rollbackRoundsRemaining <= 0) {
      throw new Error('该导入已稳定接入，不能回退。');
    }
    const rolledBackAt = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      await aiThreadRepository.rollbackContinuityImportAcceptedEffects(db, input.importSessionId);
      await aiThreadRepository.updateThread(db, session.threadId, {
        currentBranchRootMessageId: session.preImportBranchRootMessageId,
        currentBranchVersionIndex: session.preImportBranchVersionIndex,
      });
    });
    return aiThreadRepository.setContinuityImportRollbackState(db, {
      importSessionId: input.importSessionId,
      rollbackState: 'rolled_back',
      reviewGateState: 'rolled_back',
      rolledBackAt,
    });
  });
}
