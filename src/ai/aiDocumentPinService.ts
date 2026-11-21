import {
  copyLocalFile,
  deleteLocalFile,
  ensureLocalDirectory,
  getAiDocumentsDir,
  getAiKnowledgeBaseDocumentsDir,
  joinStoragePath,
} from '../services/fileStorageService';
import { runWithDatabaseSpace, type PixorySpace } from '../database/db';
import {
  aiKnowledgeRepository,
  type AiDocumentRecord,
} from '../database/repositories/aiKnowledgeRepository';
import { invalidateOwnerRagCache } from './rag/pixoryRagBridge';
import type { SQLiteDatabase } from 'expo-sqlite';

export const SHORT_LORE_DIRECT_INJECT_LIMIT = 2500; // < 2500 字符单篇直接常驻 stable_role 前缀缓存
export const SHORT_LORE_TOTAL_LIMIT = 5000; // < 5000 字符累计常驻设定上限，超限弹出极简黑白灰替换弹窗

function createAiId(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${timestamp}_${random}`;
}

export interface InjectedDocumentItem {
  id: string;
  title: string;
  fileSize?: number;
  charCount: number;
  localUri?: string | null;
  mimeType?: string | null;
}

export interface AddDocumentToKbResult {
  documentId: string;
  title: string;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
}

export type InjectContextResult =
  | { success: true; documentId: string; title: string; totalChars: number; alreadyInjected?: boolean }
  | { success: false; reason: 'too_large'; charCount: number; limit: number }
  | {
      success: false;
      reason: 'overflow';
      currentInjectedDocs: InjectedDocumentItem[];
      incomingDoc: InjectedDocumentItem;
      currentTotalChars: number;
      incomingCharCount: number;
      limit: number;
    };

function cleanLoreByDocId(lore: string, docId: string, title?: string): string {
  if (!lore) return '';
  const escapedId = docId.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const idPattern = new RegExp(`(?:\\r?\\n){0,2}【常驻设定资料：《.*?》#${escapedId}】[\\s\\S]*?(?=(?:\\r?\\n){2}【常驻设定资料：|$)`, 'g');
  let cleaned = lore.replace(idPattern, '').trim();
  if (title) {
    const escapedTitle = title.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const titlePattern = new RegExp(`(?:\\r?\\n){0,2}【常驻设定资料：《${escapedTitle}》】[\\s\\S]*?(?=(?:\\r?\\n){2}【常驻设定资料：|$)`, 'g');
    cleaned = cleaned.replace(titlePattern, '').trim();
  }
  return cleaned;
}

/**
 * 获取或快速估算文档的正文字符数，并缓存在 metadataJson 中
 */
export async function getDocumentCharCount(
  db: SQLiteDatabase,
  space: PixorySpace,
  documentId: string
): Promise<number> {
  const document = await aiKnowledgeRepository.findDocumentById(db, documentId);
  if (!document) return 0;

  try {
    const meta = JSON.parse(document.metadataJson || '{}');
    if (typeof meta.charCount === 'number' && meta.charCount >= 0) {
      return meta.charCount;
    }
  } catch {
    // 忽略解析错误
  }

  const chunks = await aiKnowledgeRepository.listChunksByDocumentId(db, documentId);
  const text = chunks.map((c) => c.text).join('\n\n').trim();
  const charCount = text.length;

  try {
    const meta = JSON.parse(document.metadataJson || '{}');
    meta.charCount = charCount;
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE ai_documents SET metadataJson = ?, updatedAt = ? WHERE id = ? AND space = ?`,
      [JSON.stringify(meta), now, documentId, space]
    );
  } catch {
    // 忽略写入容错
  }

  return charCount;
}

/**
 * 将文档纳入资料库（优先绑定到当前会话专属资料库）
 * 仅做持久化归档与 RAG 准备，不直接注入前缀原文
 */
export async function addDocumentToKnowledgeBase(params: {
  space: PixorySpace;
  documentId: string;
  threadId?: string;
  targetKnowledgeBaseId?: string;
}): Promise<AddDocumentToKbResult> {
  return runWithDatabaseSpace(params.space, async (db) => {
    const document = await aiKnowledgeRepository.findDocumentById(db, params.documentId);
    if (!document) {
      throw new Error('未找到待纳入资料库的文档');
    }

    // 幂等防重：若已经是 knowledge_base，直接返回已有归属
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
      };
    }

    let kbId = params.targetKnowledgeBaseId;
    let kbName = '我的资料库';

    if (!kbId) {
      if (params.threadId) {
        // 查找会话是否已有绑定的专属资料库
        const threadRow = await db.getFirstAsync<{ boundKnowledgeBaseId: string | null; title: string | null }>(
          `SELECT boundKnowledgeBaseId, title FROM ai_threads WHERE id = ? AND space = ?`,
          [params.threadId, params.space]
        );
        if (threadRow?.boundKnowledgeBaseId) {
          const existingKbs = await aiKnowledgeRepository.listKnowledgeBases(db, params.space);
          const found = existingKbs.find((k) => k.id === threadRow.boundKnowledgeBaseId);
          if (found) {
            kbId = found.id;
            kbName = found.name;
          }
        }

        // 若尚未绑定或绑定的库已被删除，自动创建专属资料库
        if (!kbId) {
          const threadTitle = threadRow?.title?.trim() || '当前对话';
          kbName = `「${threadTitle}」专属资料库`;
          const created = await aiKnowledgeRepository.createKnowledgeBase(db, {
            id: createAiId('aikb_thread'),
            category: 'thread_bound',
            description: `从会话「${threadTitle}」中自动建立的专属资料库`,
            name: kbName,
            space: params.space,
          });
          kbId = created.id;
          kbName = created.name;

          const now = new Date().toISOString();
          await db.runAsync(
            `UPDATE ai_threads SET boundKnowledgeBaseId = ?, updatedAt = ? WHERE id = ? AND space = ?`,
            [kbId, now, params.threadId, params.space]
          );
        }
      } else {
        // 无会话维度时的兜底逻辑
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

    // 3. 失效 RAG 所有者缓存
    if (params.threadId) {
      invalidateOwnerRagCache(params.space, 'thread', params.threadId);
    }
    invalidateOwnerRagCache(params.space, 'knowledge_base', kbId);

    return {
      documentId: params.documentId,
      title: document.title,
      knowledgeBaseId: kbId,
      knowledgeBaseName: kbName,
    };
  });
}

/**
 * 从资料库移出文档，还原为会话临时文档
 * 联动机制：
 * 1. 同步取消其在当前会话的原文注入状态（释放配额）；
 * 2. 检查原资料库，若文档数清零（count === 0），自动删除空资料库并物理清理目录。
 */
export async function removeDocumentFromKnowledgeBase(params: {
  space: PixorySpace;
  documentId: string;
  threadId: string;
}): Promise<void> {
  return runWithDatabaseSpace(params.space, async (db) => {
    const document = await aiKnowledgeRepository.findDocumentById(db, params.documentId);
    if (!document) return;

    const previousKbId = document.ownerType === 'knowledge_base' ? document.ownerId : null;

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
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(document.metadataJson || '{}');
    } catch {
      meta = {};
    }
    meta.injectedToContext = false;

    await db.runAsync(
      `UPDATE ai_documents
       SET ownerType = 'thread', ownerId = ?, localUri = ?, metadataJson = ?, updatedAt = ?
       WHERE id = ? AND space = ?`,
      [params.threadId, nextLocalUri, JSON.stringify(meta), now, params.documentId, params.space]
    );

    await db.runAsync(
      `UPDATE ai_chunks
       SET ownerType = 'thread', ownerId = ?
       WHERE documentId = ? AND space = ?`,
      [params.threadId, params.documentId, params.space]
    );

    // 联动取消当前会话的原文注入
    if (params.threadId) {
      try {
        const threadRow = await db.getFirstAsync<{ pinnedLoreSnapshot: string | null }>(
          `SELECT pinnedLoreSnapshot FROM ai_threads WHERE id = ? AND space = ?`,
          [params.threadId, params.space]
        );
        if (threadRow?.pinnedLoreSnapshot) {
          const cleaned = cleanLoreByDocId(threadRow.pinnedLoreSnapshot, document.id, document.title);
          await db.runAsync(
            `UPDATE ai_threads SET pinnedLoreSnapshot = ? WHERE id = ? AND space = ?`,
            [cleaned || null, params.threadId, params.space]
          );
        }
      } catch {
        // 容错处理
      }
    }

    // 检查原资料库是否已清空
    if (previousKbId) {
      try {
        const remainingDocs = await db.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) as count FROM ai_documents WHERE ownerType = 'knowledge_base' AND ownerId = ? AND space = ?`,
          [previousKbId, params.space]
        );
        if ((remainingDocs?.count ?? 0) === 0) {
          // 自动删除空资料库，解除绑定并物理清理
          await aiKnowledgeRepository.deleteKnowledgeBase(db, params.space, previousKbId);
          try {
            const kbDir = getAiKnowledgeBaseDocumentsDir(params.space, previousKbId);
            await deleteLocalFile(kbDir);
          } catch {
            // 目录删除容错
          }
          invalidateOwnerRagCache(params.space, 'knowledge_base', previousKbId);
        }
      } catch {
        // 检查与删除容错
      }
    }

    // 失效 RAG 缓存
    invalidateOwnerRagCache(params.space, 'thread', params.threadId);
    if (previousKbId) {
      invalidateOwnerRagCache(params.space, 'knowledge_base', previousKbId);
    }
  });
}

/**
 * 获取当前会话中已经注入前缀上下文的文档列表及总字数
 */
export async function listInjectedDocuments(params: {
  space: PixorySpace;
  threadId: string;
}): Promise<{ items: InjectedDocumentItem[]; totalChars: number; limit: number }> {
  return runWithDatabaseSpace(params.space, async (db) => {
    const threadRow = await db.getFirstAsync<{ pinnedLoreSnapshot: string | null }>(
      `SELECT pinnedLoreSnapshot FROM ai_threads WHERE id = ? AND space = ?`,
      [params.threadId, params.space]
    );

    const snapshot = threadRow?.pinnedLoreSnapshot || '';
    if (!snapshot.trim()) {
      return { items: [], totalChars: 0, limit: SHORT_LORE_TOTAL_LIMIT };
    }

    // 提取所有注入 tag: 【常驻设定资料：《标题》#id】
    const regex = /【常驻设定资料：《(.*?)》(?:#(.*?))?】/g;
    const matches: { title: string; docId?: string }[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(snapshot)) !== null) {
      matches.push({ title: match[1], docId: match[2] });
    }

    const items: InjectedDocumentItem[] = [];
    let totalChars = 0;

    for (const m of matches) {
      let doc: AiDocumentRecord | null = null;
      if (m.docId) {
        doc = await aiKnowledgeRepository.findDocumentById(db, m.docId);
      }
      if (!doc) {
        const rows = await db.getAllAsync<{ id: string }>(
          `SELECT id FROM ai_documents WHERE title = ? AND space = ? ORDER BY updatedAt DESC LIMIT 1`,
          [m.title, params.space]
        );
        if (rows.length > 0) {
          doc = await aiKnowledgeRepository.findDocumentById(db, rows[0].id);
        }
      }

      if (doc) {
        const charCount = await getDocumentCharCount(db, params.space, doc.id);
        totalChars += charCount;
        items.push({
          id: doc.id,
          title: doc.title,
          fileSize: doc.fileSize ?? undefined,
          charCount,
          localUri: doc.localUri,
          mimeType: doc.mimeType,
        });
      }
    }

    return { items, totalChars, limit: SHORT_LORE_TOTAL_LIMIT };
  });
}

/**
 * 原文注入上下文（严格限制单篇 < 2500，累计 < 5000）
 * 点击原文注入时：自动先纳入资料库，再注入前缀提示词
 */
export async function injectDocumentToContext(params: {
  space: PixorySpace;
  documentId: string;
  threadId: string;
}): Promise<InjectContextResult> {
  return runWithDatabaseSpace(params.space, async (db) => {
    const document = await aiKnowledgeRepository.findDocumentById(db, params.documentId);
    if (!document) {
      throw new Error('未找到待注入的文档');
    }

    const charCount = await getDocumentCharCount(db, params.space, params.documentId);

    // 1. 严格检查单篇字数是否 < 2500 字符
    if (charCount >= SHORT_LORE_DIRECT_INJECT_LIMIT || charCount <= 0) {
      return {
        success: false,
        reason: 'too_large',
        charCount,
        limit: SHORT_LORE_DIRECT_INJECT_LIMIT,
      };
    }

    // 2. 获取当前会话已注入文档清单与字符累计
    const { items: currentInjectedDocs, totalChars: currentTotalChars } = await listInjectedDocuments({
      space: params.space,
      threadId: params.threadId,
    });

    // 防重判断：如果已经在注入列表中，直接返回成功
    if (currentInjectedDocs.some((d) => d.id === params.documentId)) {
      return {
        success: true,
        documentId: params.documentId,
        title: document.title,
        totalChars: currentTotalChars,
        alreadyInjected: true,
      };
    }

    // 3. 检查累计字数是否超限（< 5000 字符）
    if (currentTotalChars + charCount >= SHORT_LORE_TOTAL_LIMIT) {
      return {
        success: false,
        reason: 'overflow',
        currentInjectedDocs,
        incomingDoc: {
          id: document.id,
          title: document.title,
          fileSize: document.fileSize ?? undefined,
          charCount,
          localUri: document.localUri,
          mimeType: document.mimeType,
        },
        currentTotalChars,
        incomingCharCount: charCount,
        limit: SHORT_LORE_TOTAL_LIMIT,
      };
    }

    // 4. 确保文档已经纳入专属资料库（联动保证）
    if (document.ownerType !== 'knowledge_base') {
      await addDocumentToKnowledgeBase({
        space: params.space,
        documentId: params.documentId,
        threadId: params.threadId,
      });
    }

    // 5. 提取正文并注入当前会话的 pinnedLoreSnapshot
    const chunks = await aiKnowledgeRepository.listChunksByDocumentId(db, params.documentId);
    const fullText = chunks.map((c) => c.text).join('\n\n').trim();
    const loreTag = `【常驻设定资料：《${document.title}》#${document.id}】`;
    const entryText = `\n\n${loreTag}\n${fullText}`;

    await db.runAsync(
      `UPDATE ai_threads
       SET pinnedLoreSnapshot = COALESCE(pinnedLoreSnapshot, '') || ?
       WHERE id = ? AND space = ?`,
      [entryText, params.threadId, params.space]
    );

    // 6. 更新文档 metadataJson 标记已注入
    try {
      const meta = JSON.parse(document.metadataJson || '{}');
      meta.injectedToContext = true;
      meta.charCount = charCount;
      const now = new Date().toISOString();
      await db.runAsync(
        `UPDATE ai_documents SET metadataJson = ?, updatedAt = ? WHERE id = ? AND space = ?`,
        [JSON.stringify(meta), now, params.documentId, params.space]
      );
    } catch {
      // 容错处理
    }

    invalidateOwnerRagCache(params.space, 'thread', params.threadId);

    return {
      success: true,
      documentId: document.id,
      title: document.title,
      totalChars: currentTotalChars + charCount,
    };
  });
}

/**
 * 从上下文取消原文注入（释放 5000 字额度，但保留在资料库中）
 */
export async function removeDocumentFromContext(params: {
  space: PixorySpace;
  documentId: string;
  threadId: string;
}): Promise<{ success: boolean }> {
  return runWithDatabaseSpace(params.space, async (db) => {
    const document = await aiKnowledgeRepository.findDocumentById(db, params.documentId);
    const title = document?.title;

    const threadRow = await db.getFirstAsync<{ pinnedLoreSnapshot: string | null }>(
      `SELECT pinnedLoreSnapshot FROM ai_threads WHERE id = ? AND space = ?`,
      [params.threadId, params.space]
    );

    if (threadRow?.pinnedLoreSnapshot) {
      const cleaned = cleanLoreByDocId(threadRow.pinnedLoreSnapshot, params.documentId, title);
      await db.runAsync(
        `UPDATE ai_threads SET pinnedLoreSnapshot = ? WHERE id = ? AND space = ?`,
        [cleaned || null, params.threadId, params.space]
      );
    }

    if (document) {
      try {
        const meta = JSON.parse(document.metadataJson || '{}');
        meta.injectedToContext = false;
        const now = new Date().toISOString();
        await db.runAsync(
          `UPDATE ai_documents SET metadataJson = ?, updatedAt = ? WHERE id = ? AND space = ?`,
          [JSON.stringify(meta), now, params.documentId, params.space]
        );
      } catch {
        // 容错处理
      }
    }

    invalidateOwnerRagCache(params.space, 'thread', params.threadId);
    return { success: true };
  });
}

/**
 * 替换已注入的文档列表（供超限极简弹窗确认「更新注入」使用）
 */
export async function replaceInjectedDocuments(params: {
  space: PixorySpace;
  threadId: string;
  removeDocumentIds: string[];
  addDocumentId: string;
}): Promise<{ success: boolean; totalChars: number }> {
  return runWithDatabaseSpace(params.space, async (db) => {
    // 1. 获取现有注入文档
    const { items: currentInjectedDocs } = await listInjectedDocuments({
      space: params.space,
      threadId: params.threadId,
    });

    const removeSet = new Set(params.removeDocumentIds);
    const retainedDocs = currentInjectedDocs.filter((d) => !removeSet.has(d.id));

    // 2. 计算新增文档字数
    const addDoc = await aiKnowledgeRepository.findDocumentById(db, params.addDocumentId);
    if (!addDoc) {
      throw new Error('未找到待注入的新文档');
    }
    const addCharCount = await getDocumentCharCount(db, params.space, params.addDocumentId);

    const projectedTotalChars = retainedDocs.reduce((sum, d) => sum + d.charCount, 0) + addCharCount;
    if (projectedTotalChars >= SHORT_LORE_TOTAL_LIMIT) {
      throw new Error(`释放后总字符数 (${projectedTotalChars}) 仍达到或超过 5000 字符限制，无法更新注入`);
    }

    // 3. 确保新增文档在资料库中
    if (addDoc.ownerType !== 'knowledge_base') {
      await addDocumentToKnowledgeBase({
        space: params.space,
        documentId: params.addDocumentId,
        threadId: params.threadId,
      });
    }

    // 4. 重建 pinnedLoreSnapshot
    let newSnapshot = '';
    const now = new Date().toISOString();

    for (const docItem of retainedDocs) {
      const chunks = await aiKnowledgeRepository.listChunksByDocumentId(db, docItem.id);
      const text = chunks.map((c) => c.text).join('\n\n').trim();
      const tag = `【常驻设定资料：《${docItem.title}》#${docItem.id}】`;
      newSnapshot += `\n\n${tag}\n${text}`;
    }

    const addChunks = await aiKnowledgeRepository.listChunksByDocumentId(db, params.addDocumentId);
    const addText = addChunks.map((c) => c.text).join('\n\n').trim();
    const addTag = `【常驻设定资料：《${addDoc.title}》#${addDoc.id}】`;
    newSnapshot += `\n\n${addTag}\n${addText}`;

    newSnapshot = newSnapshot.trim();

    await db.runAsync(
      `UPDATE ai_threads SET pinnedLoreSnapshot = ? WHERE id = ? AND space = ?`,
      [newSnapshot || null, params.threadId, params.space]
    );

    // 5. 更新 metadataJson 状态
    for (const removeId of params.removeDocumentIds) {
      try {
        const d = await aiKnowledgeRepository.findDocumentById(db, removeId);
        if (d) {
          const meta = JSON.parse(d.metadataJson || '{}');
          meta.injectedToContext = false;
          await db.runAsync(
            `UPDATE ai_documents SET metadataJson = ?, updatedAt = ? WHERE id = ? AND space = ?`,
            [JSON.stringify(meta), now, removeId, params.space]
          );
        }
      } catch {
        // 容错
      }
    }

    try {
      const meta = JSON.parse(addDoc.metadataJson || '{}');
      meta.injectedToContext = true;
      meta.charCount = addCharCount;
      await db.runAsync(
        `UPDATE ai_documents SET metadataJson = ?, updatedAt = ? WHERE id = ? AND space = ?`,
        [JSON.stringify(meta), now, params.addDocumentId, params.space]
      );
    } catch {
      // 容错
    }

    invalidateOwnerRagCache(params.space, 'thread', params.threadId);

    return { success: true, totalChars: projectedTotalChars };
  });
}

// 兼容别名导出
export const pinDocumentToKnowledgeBase = addDocumentToKnowledgeBase;
export const unpinDocumentFromKnowledgeBase = removeDocumentFromKnowledgeBase;
