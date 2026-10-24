import {
  copyLocalFile,
  deleteLocalFile,
  ensureLocalDirectory,
  getAiDocumentsDir,
  getAiKnowledgeBaseDocumentsDir,
  joinStoragePath,
} from '../services/fileStorageService';
import { runWithDatabaseSpace, type PixorySpace } from '../database/db';
import { aiKnowledgeRepository } from '../database/repositories/aiKnowledgeRepository';

export const SHORT_LORE_DIRECT_INJECT_LIMIT = 2500; // ≤ 2500 字符直接常驻 stable_role 前缀缓存

function createAiId(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${timestamp}_${random}`;
}

export interface PinDocumentResult {
  documentId: string;
  title: string;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  injectedToStableRules: boolean;
}

/**
 * 将 Thread 临时附件固化到持久知识库中
 */
export async function pinDocumentToKnowledgeBase(params: {
  space: PixorySpace;
  documentId: string;
  threadId?: string;
  targetKnowledgeBaseId?: string;
}): Promise<PinDocumentResult> {
  return runWithDatabaseSpace(params.space, async (db) => {
    const document = await aiKnowledgeRepository.findDocumentById(db, params.documentId);
    if (!document) {
      throw new Error('未找到待固化的文档');
    }

    // 幂等防重：如果该文档已经是 knowledge_base，直接返回已有归属
    if (document.ownerType === 'knowledge_base') {
      let existingKbName = '我的资料库';
      const existingKbs = await aiKnowledgeRepository.listKnowledgeBases(db, params.space);
      const found = existingKbs.find((k) => k.id === document.ownerId);
      if (found) existingKbName = found.name;
      return {
        documentId: params.documentId,
        title: document.title,
        knowledgeBaseId: document.ownerId,
        knowledgeBaseName: existingKbName,
        injectedToStableRules: false,
      };
    }

    let kbId = params.targetKnowledgeBaseId;
    let kbName = '我的资料库';

    if (!kbId) {
      const existingKbs = await aiKnowledgeRepository.listKnowledgeBases(db, params.space);
      if (existingKbs.length > 0) {
        kbId = existingKbs[0].id;
        kbName = existingKbs[0].name;
      } else {
        const created = await aiKnowledgeRepository.createKnowledgeBase(db, {
          id: createAiId('aikb'),
          category: 'general',
          description: '从聊天中固化的长效资料与设定',
          name: '我的资料库',
          space: params.space,
        });
        kbId = created.id;
        kbName = created.name;
      }
    } else {
      const existingKbs = await aiKnowledgeRepository.listKnowledgeBases(db, params.space);
      const found = existingKbs.find((k) => k.id === kbId);
      if (found) kbName = found.name;
    }

    // 1. 物理文件安全迁移：从 thread_xxx/ 迁移至 kb_xxx/
    let nextLocalUri = document.localUri;
    if (document.localUri && document.ownerType === 'thread') {
      try {
        const kbDir = getAiKnowledgeBaseDocumentsDir(params.space, kbId);
        await ensureLocalDirectory(kbDir);
        const fileName = document.localUri.split('/').pop() || `${document.id}.bin`;
        const targetUri = joinStoragePath(kbDir, fileName);
        await copyLocalFile(document.localUri, targetUri);
        await deleteLocalFile(document.localUri);
        nextLocalUri = targetUri;
      } catch {
        // 若移动失败则容错保留原路径
      }
    }

    // 2. 更新数据库归属为 knowledge_base
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE ai_documents
       SET ownerType = 'knowledge_base', ownerId = ?, localUri = ?, updatedAt = ?
       WHERE id = ? AND space = ?`,
      [kbId, nextLocalUri, now, params.documentId, params.space]
    );

    await db.runAsync(
      `UPDATE ai_chunks
       SET ownerType = 'knowledge_base', ownerId = ?
       WHERE documentId = ? AND space = ?`,
      [kbId, params.documentId, params.space]
    );

    // 3. 短设定注入提示词稳定区（Prefix Cache 优化，带防重检查）
    let injectedToStableRules = false;
    const loreTag = `【常驻设定资料：《${document.title}》】`;
    if (params.threadId) {
      try {
        const threadRow = await db.getFirstAsync<{ materialRulesSnapshot: string | null }>(
          `SELECT materialRulesSnapshot FROM ai_threads WHERE id = ? AND space = ?`,
          [params.threadId, params.space]
        );
        const currentRules = threadRow?.materialRulesSnapshot ?? '';
        if (!currentRules.includes(loreTag)) {
          const chunks = await aiKnowledgeRepository.listChunksByDocumentId(db, params.documentId);
          const fullText = chunks.map((c) => c.text).join('\n\n');
          if (fullText.length <= SHORT_LORE_DIRECT_INJECT_LIMIT && fullText.trim().length > 0) {
            await db.runAsync(
              `UPDATE ai_threads
               SET materialRulesSnapshot = COALESCE(materialRulesSnapshot, '') || ?
               WHERE id = ? AND space = ?`,
              [`\n\n${loreTag}\n${fullText}`, params.threadId, params.space]
            );
            injectedToStableRules = true;
          }
        }
      } catch {
        // 稳定规则注入容错
      }
    }

    return {
      documentId: params.documentId,
      title: document.title,
      knowledgeBaseId: kbId,
      knowledgeBaseName: kbName,
      injectedToStableRules,
    };
  });
}

/**
 * 反向回滚撤销：移出资料库，还原为临时 thread 文档并清理提示词稳定区规则
 */
export async function unpinDocumentFromKnowledgeBase(params: {
  space: PixorySpace;
  documentId: string;
  threadId: string;
}): Promise<void> {
  return runWithDatabaseSpace(params.space, async (db) => {
    const document = await aiKnowledgeRepository.findDocumentById(db, params.documentId);
    if (!document) return;

    let nextLocalUri = document.localUri;
    if (document.localUri) {
      try {
        const threadDir = `${joinStoragePath(getAiDocumentsDir(params.space), `thread_${params.threadId}`)}/`;
        await ensureLocalDirectory(threadDir);
        const fileName = document.localUri.split('/').pop() || `${document.id}.bin`;
        const targetUri = joinStoragePath(threadDir, fileName);
        await copyLocalFile(document.localUri, targetUri);
        await deleteLocalFile(document.localUri);
        nextLocalUri = targetUri;
      } catch {
        // 容错保留原路径
      }
    }

    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE ai_documents
       SET ownerType = 'thread', ownerId = ?, localUri = ?, updatedAt = ?
       WHERE id = ? AND space = ?`,
      [params.threadId, nextLocalUri, now, params.documentId, params.space]
    );

    await db.runAsync(
      `UPDATE ai_chunks
       SET ownerType = 'thread', ownerId = ?
       WHERE documentId = ? AND space = ?`,
      [params.threadId, params.documentId, params.space]
    );

    // 4. 清理 Thread 的常驻设定规则快照
    if (params.threadId) {
      try {
        const loreTag = `【常驻设定资料：《${document.title}》】`;
        const threadRow = await db.getFirstAsync<{ materialRulesSnapshot: string | null }>(
          `SELECT materialRulesSnapshot FROM ai_threads WHERE id = ? AND space = ?`,
          [params.threadId, params.space]
        );
        if (threadRow?.materialRulesSnapshot && threadRow.materialRulesSnapshot.includes(loreTag)) {
          const escapedTag = loreTag.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
          const lorePattern = new RegExp(`(?:\\r?\\n){0,2}${escapedTag}[\\s\\S]*?(?=(?:\\r?\\n){2}【常驻设定资料：|$)`, 'g');
          const cleanedRules = threadRow.materialRulesSnapshot.replace(lorePattern, '').trim();
          await db.runAsync(
            `UPDATE ai_threads SET materialRulesSnapshot = ? WHERE id = ? AND space = ?`,
            [cleanedRules || null, params.threadId, params.space]
          );
        }
      } catch {
        // 规则回滚容错
      }
    }
  });
}
