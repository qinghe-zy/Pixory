import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  AiBoundaryMode,
  AiCitationRecord,
  AiCitationSourceType,
  AiContextType,
  AiMessageRole,
  AiMessageStatus,
  AiMemorySourceKind,
  AiReplyPreference,
  AiRoleInstructionWeight,
  AiThreadRecord,
} from '../types';
import type { PixorySpace } from '../db';
import { booleanToSqlite, buildUpdateStatement, createTimestamp, normalizeOptionalText, sqliteToBoolean } from '../utils';

export interface AiMessageRecord {
  id: string;
  threadId: string;
  role: AiMessageRole;
  status: AiMessageStatus;
  content: string;
  reasoningText: string | null;
  errorMessage: string | null;
  providerId: string | null;
  modelId: string | null;
  modelSnapshotJson: string;
  promptSnapshotJson: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface AiMessageVersionRecord {
  id: string;
  originalMessageId: string;
  threadId: string;
  versionIndex: number;
  role: AiMessageRole;
  status: AiMessageStatus;
  content: string;
  reasoningText: string | null;
  errorMessage: string | null;
  providerId: string | null;
  modelId: string | null;
  modelSnapshotJson: string;
  promptSnapshotJson: string;
  citations: AiCitationRecord[];
  messageCreatedAt: string;
  messageUpdatedAt: string;
  messageCompletedAt: string | null;
  createdAt: string;
}

export type AiMemoryScope = 'global' | 'thread' | 'role' | 'ip' | 'knowledge_base';
export type AiMemoryType = 'preference' | 'fact' | 'decision' | 'instruction' | 'task' | 'correction';
export type AiMemoryStatus = 'active' | 'stale' | 'deleted';

export interface AiThreadMemorySettingsRecord {
  threadId: string;
  deepMemoryEnabled: boolean;
  updatedAt: string;
}

export interface AiThreadSummaryRecord {
  threadId: string;
  summary: string;
  decisions: string;
  openQuestions: string;
  lastMessageId: string | null;
  updatedAt: string;
}

export interface AiThreadMemoryJobRecord {
  threadId: string;
  pendingTurnCount: number;
  lastConsolidatedMessageId: string | null;
  lastCaptureNoticeJson: string;
  lastCompressedMessageId: string | null;
  uncompressedRoundCount: number;
  completedMessageCountAtProfileUpdate: number;
  lastProfileUpdatedAt: string | null;
  profileUpdateCooldownUntil: string | null;
  lastMaintenanceError: string | null;
  lastMaintenanceModelProviderId: string | null;
  lastMaintenanceModelId: string | null;
  updatedAt: string;
}

export interface AiUserProfileRecord {
  id: string;
  space: PixorySpace;
  profileJson: string;
  profileText: string;
  version: number;
  sourceThreadId: string | null;
  sourceStartMessageId: string | null;
  sourceEndMessageId: string | null;
  messageCountAtUpdate: number;
  lastUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiThreadSummarySegmentRecord {
  id: string;
  threadId: string;
  space: PixorySpace;
  kind: 'compressed' | 'merged';
  summaryText: string;
  startMessageId: string | null;
  endMessageId: string | null;
  startAt: string | null;
  endAt: string | null;
  roundCount: number;
  sourceSegmentIdsJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiMemoryRecord {
  id: string;
  space: PixorySpace;
  scope: AiMemoryScope;
  scopeId: string | null;
  type: AiMemoryType;
  content: string;
  normalizedContent: string;
  sourceMessageId: string | null;
  confidence: number;
  importance: number;
  status: AiMemoryStatus;
  lastUsedAt: string | null;
  ipId: number | null;
  groupId: number | null;
  imageAssetId: number | null;
  assetSnapshotJson: string;
  sourceKind: AiMemorySourceKind;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface AiThreadMemorySettingsRow {
  threadId: string;
  deepMemoryEnabled: number;
  updatedAt: string;
}

export type AiThreadSummaryRow = AiThreadSummaryRecord;
export type AiMemoryRow = AiMemoryRecord;

export type AiMessageVersionRow = Omit<AiMessageVersionRecord, 'citations'> & {
  citationsJson: string;
};

export type AiThreadRow = Omit<AiThreadRecord, 'includeIpDocuments'> & {
  includeIpDocuments: number;
  modelSnapshotJson: string;
  roleCardId: string | null;
  roleSnapshotJson: string;
};

export type AiCitationRow = Omit<AiCitationRecord, 'locator'> & {
  locatorJson: string;
};

export interface CreateAiThreadInput {
  id: string;
  space: PixorySpace;
  contextType: AiContextType;
  title: string;
  boundIpId?: number | null;
  boundKnowledgeBaseId?: string | null;
  includeIpDocuments?: boolean;
  titleStatus?: 'fallback' | 'generated' | 'custom';
  providerId?: string | null;
  modelId?: string | null;
  modelSnapshotJson?: string;
  roleCardId?: string | null;
  roleSnapshotJson?: string;
  roleInstructionWeight?: AiRoleInstructionWeight;
  replyPreference?: AiReplyPreference;
  systemPrompt?: string;
  materialRulesSnapshot?: string | null;
  boundaryMode?: AiBoundaryMode;
  summary?: string | null;
}

export interface AiThreadListQuery {
  space: PixorySpace;
  contextType?: AiContextType | 'all';
  includeArchived?: boolean;
  customerProjectOnly?: boolean;
  limit?: number;
}

export type AiThreadHistoryFilter = 'all' | AiContextType | 'customer_project' | 'archived';

export interface AiThreadHistoryItem extends AiThreadRecord {
  knowledgeCategory: string | null;
  lastMessageAt: string | null;
}

export type UpdateAiThreadPatch = Partial<
  Pick<
    CreateAiThreadInput,
    | 'title'
    | 'boundIpId'
    | 'boundKnowledgeBaseId'
    | 'includeIpDocuments'
    | 'titleStatus'
    | 'providerId'
    | 'modelId'
    | 'modelSnapshotJson'
    | 'roleCardId'
    | 'roleSnapshotJson'
    | 'roleInstructionWeight'
    | 'replyPreference'
    | 'systemPrompt'
    | 'materialRulesSnapshot'
    | 'boundaryMode'
    | 'summary'
  >
> & {
  lastMessagePreview?: string | null;
  archivedAt?: string | null;
};

export interface CreateAiMessageInput {
  id: string;
  threadId: string;
  role: AiMessageRole;
  status: AiMessageStatus;
  content?: string;
  reasoningText?: string | null;
  errorMessage?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  modelSnapshotJson?: string;
  promptSnapshotJson?: string;
  completedAt?: string | null;
}

export type UpdateAiMessagePatch = Partial<Omit<CreateAiMessageInput, 'id' | 'threadId' | 'role'>> & {
  createdAt?: string;
};

export interface CreateAiMessageVersionInput {
  id: string;
  originalMessageId: string;
  threadId: string;
  role: AiMessageRole;
  status: AiMessageStatus;
  content: string;
  reasoningText?: string | null;
  errorMessage?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  modelSnapshotJson?: string;
  promptSnapshotJson?: string;
  citations?: AiCitationRecord[];
  messageCreatedAt: string;
  messageUpdatedAt: string;
  messageCompletedAt?: string | null;
}

export interface UpsertAiThreadSummaryInput {
  threadId: string;
  summary: string;
  decisions?: string;
  openQuestions?: string;
  lastMessageId?: string | null;
}

export interface CreateAiMemoryInput {
  id: string;
  space: PixorySpace;
  scope: AiMemoryScope;
  scopeId?: string | null;
  type: AiMemoryType;
  content: string;
  normalizedContent: string;
  sourceMessageId?: string | null;
  confidence?: number;
  importance?: number;
  ipId?: number | null;
  groupId?: number | null;
  imageAssetId?: number | null;
  assetSnapshotJson?: string;
  sourceKind?: AiMemorySourceKind;
}

export interface ReplaceCitationInput {
  id: string;
  sourceType: AiCitationSourceType;
  sourceId: string;
  label: string;
  locator?: Record<string, unknown>;
}

export interface AiThreadExportSnapshot {
  thread: AiThreadRow;
  messages: AiMessageRecord[];
  citations: AiCitationRow[];
  versions: AiMessageVersionRow[];
}

function mapThreadRow(row: AiThreadRow): AiThreadRecord {
  return {
    id: row.id,
    space: row.space,
    contextType: row.contextType,
    boundIpId: row.boundIpId ?? null,
    boundKnowledgeBaseId: row.boundKnowledgeBaseId ?? null,
    includeIpDocuments: sqliteToBoolean(row.includeIpDocuments),
    title: row.title,
    titleStatus: row.titleStatus,
    providerId: row.providerId ?? null,
    modelId: row.modelId ?? null,
    modelSnapshotJson: row.modelSnapshotJson,
    roleCardId: row.roleCardId ?? null,
    roleSnapshotJson: row.roleSnapshotJson,
    roleInstructionWeight: row.roleInstructionWeight === 'high' ? 'high' : 'default',
    replyPreference: row.replyPreference === 'concise' || row.replyPreference === 'detailed' ? row.replyPreference : 'auto',
    boundaryMode: row.boundaryMode,
    systemPrompt: row.systemPrompt,
    materialRulesSnapshot: row.materialRulesSnapshot ?? null,
    summary: row.summary ?? null,
    lastMessagePreview: row.lastMessagePreview ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt ?? null,
  };
}

function mapThreadHistoryRow(row: AiThreadRow & { knowledgeCategory: string | null; lastMessageAt: string | null }): AiThreadHistoryItem {
  return {
    ...mapThreadRow(row),
    knowledgeCategory: row.knowledgeCategory ?? null,
    lastMessageAt: row.lastMessageAt ?? null,
  };
}

function parseVersionCitations(citationsJson: string): AiCitationRecord[] {
  try {
    const parsed = JSON.parse(citationsJson);
    return Array.isArray(parsed) ? parsed.filter((citation): citation is AiCitationRecord => citation && typeof citation.id === 'string') : [];
  } catch {
    return [];
  }
}

function mapMessageVersionRow(row: AiMessageVersionRow): AiMessageVersionRecord {
  return {
    ...row,
    citations: parseVersionCitations(row.citationsJson),
  };
}

function mapCitationRow(row: AiCitationRow): AiCitationRecord {
  let locator: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.locatorJson);
    locator = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    locator = {};
  }
  return {
    id: row.id,
    messageId: row.messageId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    label: row.label,
    locator,
    createdAt: row.createdAt,
  };
}

function mapMemorySettingsRow(row: AiThreadMemorySettingsRow): AiThreadMemorySettingsRecord {
  return {
    threadId: row.threadId,
    deepMemoryEnabled: sqliteToBoolean(row.deepMemoryEnabled),
    updatedAt: row.updatedAt,
  };
}

function makeInClause(values: string[]): string {
  return values.map(() => '?').join(', ');
}

const DELETE_MESSAGE_CHUNK_SIZE = 200;

export const aiThreadRepository = {
  async createThread(db: SQLiteDatabase, input: CreateAiThreadInput): Promise<AiThreadRecord> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_threads (
        id,
        space,
        contextType,
        boundIpId,
        boundKnowledgeBaseId,
        includeIpDocuments,
        title,
        titleStatus,
        providerId,
        modelId,
        modelSnapshotJson,
        roleCardId,
        roleSnapshotJson,
        roleInstructionWeight,
        replyPreference,
        systemPrompt,
        materialRulesSnapshot,
        boundaryMode,
        summary,
        lastMessagePreview,
        createdAt,
        updatedAt,
        archivedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
      input.id,
      input.space,
      input.contextType,
      input.boundIpId ?? null,
      input.boundKnowledgeBaseId ?? null,
      booleanToSqlite(input.includeIpDocuments ?? false),
      input.title,
      input.titleStatus ?? 'fallback',
      input.providerId ?? null,
      input.modelId ?? null,
      input.modelSnapshotJson ?? '{}',
      input.roleCardId ?? null,
      input.roleSnapshotJson ?? '{}',
      input.roleInstructionWeight ?? 'default',
      input.replyPreference ?? 'auto',
      input.systemPrompt ?? '',
      input.materialRulesSnapshot ?? null,
      input.boundaryMode ?? 'free',
      input.summary ?? null,
      now,
      now
    );

    const thread = await db.getFirstAsync<AiThreadRow>('SELECT * FROM ai_threads WHERE id = ?', input.id);
    if (!thread) {
      throw new Error(`AI thread ${input.id} was created but could not be reloaded.`);
    }
    return mapThreadRow(thread);
  },

  async updateThread(db: SQLiteDatabase, threadId: string, patch: UpdateAiThreadPatch): Promise<AiThreadRecord | null> {
    const updates = buildUpdateStatement({
      title: patch.title,
      boundIpId: patch.boundIpId,
      boundKnowledgeBaseId: patch.boundKnowledgeBaseId,
      includeIpDocuments: patch.includeIpDocuments === undefined ? undefined : booleanToSqlite(patch.includeIpDocuments),
      titleStatus: patch.titleStatus,
      providerId: patch.providerId,
      modelId: patch.modelId,
      modelSnapshotJson: patch.modelSnapshotJson,
      roleCardId: patch.roleCardId,
      roleSnapshotJson: patch.roleSnapshotJson,
      roleInstructionWeight: patch.roleInstructionWeight,
      replyPreference: patch.replyPreference,
      systemPrompt: patch.systemPrompt,
      materialRulesSnapshot: patch.materialRulesSnapshot,
      boundaryMode: patch.boundaryMode,
      summary: patch.summary,
      lastMessagePreview: normalizeOptionalText(patch.lastMessagePreview),
      archivedAt: patch.archivedAt,
      updatedAt: createTimestamp(),
    });
    if (!updates.setClause) {
      const row = await db.getFirstAsync<AiThreadRow>('SELECT * FROM ai_threads WHERE id = ?', threadId);
      return row ? mapThreadRow(row) : null;
    }
    await db.runAsync(`UPDATE ai_threads SET ${updates.setClause} WHERE id = ?`, ...updates.values, threadId);
    const row = await db.getFirstAsync<AiThreadRow>('SELECT * FROM ai_threads WHERE id = ?', threadId);
    return row ? mapThreadRow(row) : null;
  },

  async findThreadById(db: SQLiteDatabase, threadId: string): Promise<AiThreadRecord | null> {
    const row = await db.getFirstAsync<AiThreadRow>('SELECT * FROM ai_threads WHERE id = ?', threadId);
    return row ? mapThreadRow(row) : null;
  },

  async exportThread(db: SQLiteDatabase, threadId: string): Promise<AiThreadExportSnapshot | null> {
    const thread = await db.getFirstAsync<AiThreadRow>('SELECT * FROM ai_threads WHERE id = ?', threadId);
    if (!thread) {
      return null;
    }
    const messages = await db.getAllAsync<AiMessageRecord>(
      `SELECT * FROM ai_messages
       WHERE threadId = ?
       ORDER BY createdAt ASC`,
      threadId
    );
    const citations = await db.getAllAsync<AiCitationRow>(
      `SELECT ai_message_citations.*
       FROM ai_message_citations
       INNER JOIN ai_messages ON ai_messages.id = ai_message_citations.messageId
       WHERE ai_messages.threadId = ?
       ORDER BY ai_message_citations.createdAt ASC`,
      threadId
    );
    const versions = await db.getAllAsync<AiMessageVersionRow>(
      `SELECT ai_message_versions.*
       FROM ai_message_versions
       INNER JOIN ai_messages ON ai_messages.id = ai_message_versions.originalMessageId
       WHERE ai_messages.threadId = ?
       ORDER BY ai_message_versions.originalMessageId ASC, ai_message_versions.versionIndex ASC`,
      threadId
    );
    return { thread, messages, citations, versions };
  },

  async importThread(db: SQLiteDatabase, snapshot: AiThreadExportSnapshot, targetSpace: PixorySpace): Promise<void> {
    const knowledgeBaseId = snapshot.thread.boundKnowledgeBaseId
      ? await db.getFirstAsync<{ id: string }>('SELECT id FROM ai_knowledge_bases WHERE id = ?', snapshot.thread.boundKnowledgeBaseId)
      : null;
    await db.runAsync(
      `INSERT INTO ai_threads (
        id,
        space,
        contextType,
        boundIpId,
        boundKnowledgeBaseId,
        includeIpDocuments,
        title,
        titleStatus,
        providerId,
        modelId,
        modelSnapshotJson,
        roleCardId,
        roleSnapshotJson,
        roleInstructionWeight,
        replyPreference,
        systemPrompt,
        materialRulesSnapshot,
        boundaryMode,
        summary,
        lastMessagePreview,
        createdAt,
        updatedAt,
        archivedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      snapshot.thread.id,
      targetSpace,
      snapshot.thread.contextType,
      snapshot.thread.boundIpId ?? null,
      knowledgeBaseId?.id ?? null,
      snapshot.thread.includeIpDocuments,
      snapshot.thread.title,
      snapshot.thread.titleStatus,
      snapshot.thread.providerId ?? null,
      snapshot.thread.modelId ?? null,
      snapshot.thread.modelSnapshotJson,
      snapshot.thread.roleCardId ?? null,
      snapshot.thread.roleSnapshotJson,
      snapshot.thread.roleInstructionWeight ?? 'default',
      snapshot.thread.replyPreference ?? 'auto',
      snapshot.thread.systemPrompt,
      snapshot.thread.materialRulesSnapshot ?? null,
      snapshot.thread.boundaryMode,
      snapshot.thread.summary ?? null,
      snapshot.thread.lastMessagePreview ?? null,
      snapshot.thread.createdAt,
      snapshot.thread.updatedAt,
      snapshot.thread.archivedAt ?? null
    );

    for (const message of snapshot.messages) {
      await db.runAsync(
        `INSERT INTO ai_messages (
          id,
          threadId,
          role,
          status,
          content,
          reasoningText,
          errorMessage,
          providerId,
          modelId,
          modelSnapshotJson,
          promptSnapshotJson,
          createdAt,
          updatedAt,
          completedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        message.id,
        message.threadId,
        message.role,
        message.status,
        message.content,
        message.reasoningText,
        message.errorMessage,
        message.providerId,
        message.modelId,
        message.modelSnapshotJson,
        message.promptSnapshotJson,
        message.createdAt,
        message.updatedAt,
        message.completedAt
      );
    }

    for (const citation of snapshot.citations) {
      await db.runAsync(
        `INSERT INTO ai_message_citations (
          id,
          messageId,
          sourceType,
          sourceId,
          label,
          locatorJson,
          createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        citation.id,
        citation.messageId,
        citation.sourceType,
        citation.sourceId,
        citation.label,
        citation.locatorJson,
        citation.createdAt
      );
    }

    for (const version of snapshot.versions ?? []) {
      await db.runAsync(
        `INSERT INTO ai_message_versions (
          id,
          originalMessageId,
          threadId,
          versionIndex,
          role,
          status,
          content,
          reasoningText,
          errorMessage,
          providerId,
          modelId,
          modelSnapshotJson,
          promptSnapshotJson,
          citationsJson,
          messageCreatedAt,
          messageUpdatedAt,
          messageCompletedAt,
          createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        version.id,
        version.originalMessageId,
        version.threadId,
        version.versionIndex,
        version.role,
        version.status,
        version.content,
        version.reasoningText,
        version.errorMessage,
        version.providerId,
        version.modelId,
        version.modelSnapshotJson,
        version.promptSnapshotJson,
        version.citationsJson,
        version.messageCreatedAt,
        version.messageUpdatedAt,
        version.messageCompletedAt,
        version.createdAt
      );
    }
  },

  async deleteThreads(db: SQLiteDatabase, threadIds: string[]): Promise<number> {
    let deletedCount = 0;
    for (const threadId of threadIds) {
      const result = await db.runAsync('DELETE FROM ai_threads WHERE id = ?', threadId);
      deletedCount += result.changes;
    }
    return deletedCount;
  },

  async listRecentThreads(db: SQLiteDatabase, space: PixorySpace, limit = 5): Promise<AiThreadRecord[]> {
    const rows = await db.getAllAsync<AiThreadRow>(
      `SELECT * FROM ai_threads
       WHERE space = ? AND archivedAt IS NULL
       ORDER BY updatedAt DESC, createdAt DESC
       LIMIT ?`,
      space,
      limit
    );
    return rows.map(mapThreadRow);
  },

  async listThreads(db: SQLiteDatabase, query: AiThreadListQuery): Promise<AiThreadRecord[]> {
    const clauses = ['space = ?'];
    const values: (string | number)[] = [query.space];
    if (query.contextType && query.contextType !== 'all') {
      clauses.push('contextType = ?');
      values.push(query.contextType);
    }
    if (!query.includeArchived) {
      clauses.push('archivedAt IS NULL');
    }
    const rows = await db.getAllAsync<AiThreadRow>(
      `SELECT * FROM ai_threads
       WHERE ${clauses.join(' AND ')}
       ORDER BY updatedAt DESC, createdAt DESC
       LIMIT ?`,
      ...values,
      query.limit ?? 100
    );
    return rows.map(mapThreadRow);
  },

  async listHistoryItems(db: SQLiteDatabase, space: PixorySpace, filter: AiThreadHistoryFilter = 'all', limit = 100, searchText = ''): Promise<AiThreadHistoryItem[]> {
    const clauses = ['ai_threads.space = ?'];
    const values: (string | number)[] = [space];
    const normalizedSearch = searchText.trim();
    if (filter === 'archived') {
      clauses.push('ai_threads.archivedAt IS NOT NULL');
    } else {
      clauses.push('ai_threads.archivedAt IS NULL');
      if (filter === 'normal' || filter === 'ip' || filter === 'knowledge_base') {
        clauses.push('ai_threads.contextType = ?');
        values.push(filter);
      }
      if (filter === 'customer_project') {
        clauses.push("ai_threads.contextType = 'knowledge_base'");
        clauses.push("ai_knowledge_bases.category = 'customer_project'");
      }
    }
    if (normalizedSearch) {
      clauses.push('(ai_threads.title LIKE ? OR ai_threads.lastMessagePreview LIKE ?)');
      values.push(`%${normalizedSearch}%`, `%${normalizedSearch}%`);
    }
    const rows = await db.getAllAsync<AiThreadRow & { knowledgeCategory: string | null; lastMessageAt: string | null }>(
      `SELECT ai_threads.*, ai_knowledge_bases.category AS knowledgeCategory, ai_last_messages.lastMessageAt AS lastMessageAt
       FROM ai_threads
       LEFT JOIN ai_knowledge_bases ON ai_knowledge_bases.id = ai_threads.boundKnowledgeBaseId
       LEFT JOIN (
         SELECT threadId, MAX(COALESCE(completedAt, updatedAt, createdAt)) AS lastMessageAt
         FROM ai_messages
         GROUP BY threadId
       ) ai_last_messages ON ai_last_messages.threadId = ai_threads.id
       WHERE ${clauses.join(' AND ')}
       ORDER BY COALESCE(ai_last_messages.lastMessageAt, ai_threads.updatedAt) DESC, ai_threads.createdAt DESC
       LIMIT ?`,
      ...values,
      limit
    );
    return rows.map(mapThreadHistoryRow);
  },

  async createMessage(db: SQLiteDatabase, input: CreateAiMessageInput): Promise<AiMessageRecord> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_messages (
        id,
        threadId,
        role,
        status,
        content,
        reasoningText,
        errorMessage,
        providerId,
        modelId,
        modelSnapshotJson,
        promptSnapshotJson,
        createdAt,
        updatedAt,
        completedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.threadId,
      input.role,
      input.status,
      input.content ?? '',
      input.reasoningText ?? null,
      input.errorMessage ?? null,
      input.providerId ?? null,
      input.modelId ?? null,
      input.modelSnapshotJson ?? '{}',
      input.promptSnapshotJson ?? '{}',
      now,
      now,
      input.completedAt ?? null
    );
    const message = await db.getFirstAsync<AiMessageRecord>('SELECT * FROM ai_messages WHERE id = ?', input.id);
    if (!message) {
      throw new Error(`AI message ${input.id} was created but could not be reloaded.`);
    }
    return message;
  },

  async updateMessage(db: SQLiteDatabase, messageId: string, patch: UpdateAiMessagePatch): Promise<AiMessageRecord | null> {
    const updates = buildUpdateStatement({
      status: patch.status,
      content: patch.content,
      reasoningText: patch.reasoningText,
      errorMessage: normalizeOptionalText(patch.errorMessage),
      providerId: patch.providerId,
      modelId: patch.modelId,
      modelSnapshotJson: patch.modelSnapshotJson,
      promptSnapshotJson: patch.promptSnapshotJson,
      createdAt: patch.createdAt,
      completedAt: patch.completedAt,
      updatedAt: createTimestamp(),
    });
    if (!updates.setClause) {
      return db.getFirstAsync<AiMessageRecord>('SELECT * FROM ai_messages WHERE id = ?', messageId);
    }
    await db.runAsync(`UPDATE ai_messages SET ${updates.setClause} WHERE id = ?`, ...updates.values, messageId);
    return db.getFirstAsync<AiMessageRecord>('SELECT * FROM ai_messages WHERE id = ?', messageId);
  },

  async deleteMessagesByIds(db: SQLiteDatabase, messageIds: string[]): Promise<number> {
    let deletedCount = 0;
    for (let index = 0; index < messageIds.length; index += DELETE_MESSAGE_CHUNK_SIZE) {
      const chunk = messageIds.slice(index, index + DELETE_MESSAGE_CHUNK_SIZE);
      const result = await db.runAsync(`DELETE FROM ai_messages WHERE id IN (${makeInClause(chunk)})`, ...chunk);
      deletedCount += result.changes;
    }
    return deletedCount;
  },

  async listMessages(db: SQLiteDatabase, threadId: string, limit?: number): Promise<AiMessageRecord[]> {
    if (limit && limit > 0) {
      return db.getAllAsync<AiMessageRecord>(
        `SELECT * FROM (
           SELECT * FROM ai_messages
           WHERE threadId = ?
           ORDER BY createdAt DESC
           LIMIT ?
         )
         ORDER BY createdAt ASC`,
        threadId,
        limit
      );
    }
    return db.getAllAsync<AiMessageRecord>(
      `SELECT * FROM ai_messages
       WHERE threadId = ?
       ORDER BY createdAt ASC`,
      threadId
    );
  },

  async findMessageById(db: SQLiteDatabase, messageId: string): Promise<AiMessageRecord | null> {
    return db.getFirstAsync<AiMessageRecord>('SELECT * FROM ai_messages WHERE id = ?', messageId);
  },

  async listRecentCompletedMessagesBefore(db: SQLiteDatabase, threadId: string, beforeMessageId: string, limit: number): Promise<AiMessageRecord[]> {
    if (limit <= 0) {
      return [];
    }
    return db.getAllAsync<AiMessageRecord>(
      `SELECT * FROM (
         SELECT candidate.*, candidate.rowid AS rowOrder
         FROM ai_messages target
         JOIN ai_messages candidate ON candidate.threadId = target.threadId
         WHERE target.id = ?
           AND target.threadId = ?
           AND candidate.status = 'completed'
           AND candidate.id <> target.id
           AND (
             candidate.createdAt < target.createdAt
             OR (candidate.createdAt = target.createdAt AND candidate.rowid < target.rowid)
           )
         ORDER BY candidate.createdAt DESC, candidate.rowid DESC
         LIMIT ?
       )
       ORDER BY createdAt ASC, rowOrder ASC`,
      beforeMessageId,
      threadId,
      limit
    );
  },

  async countCompletedNonSystemMessagesAfter(db: SQLiteDatabase, threadId: string, afterMessageId: string | null): Promise<number> {
    if (!afterMessageId) {
      const row = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM ai_messages
         WHERE threadId = ?
           AND status = 'completed'
           AND role <> 'system'`,
        threadId
      );
      return row?.count ?? 0;
    }
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM ai_messages target
       JOIN ai_messages candidate ON candidate.threadId = target.threadId
       WHERE target.id = ?
         AND target.threadId = ?
         AND candidate.status = 'completed'
         AND candidate.role <> 'system'
         AND (
           candidate.createdAt > target.createdAt
           OR (candidate.createdAt = target.createdAt AND candidate.rowid > target.rowid)
         )`,
      afterMessageId,
      threadId
    );
    return row?.count ?? 0;
  },

  async listCompletedNonSystemMessagesAfter(db: SQLiteDatabase, threadId: string, afterMessageId: string | null, limit: number): Promise<AiMessageRecord[]> {
    if (limit <= 0) {
      return [];
    }
    if (!afterMessageId) {
      return db.getAllAsync<AiMessageRecord>(
        `SELECT * FROM ai_messages
         WHERE threadId = ?
           AND status = 'completed'
           AND role <> 'system'
         ORDER BY createdAt ASC, rowid ASC
         LIMIT ?`,
        threadId,
        limit
      );
    }
    return db.getAllAsync<AiMessageRecord>(
      `SELECT candidate.*
       FROM ai_messages target
       JOIN ai_messages candidate ON candidate.threadId = target.threadId
       WHERE target.id = ?
         AND target.threadId = ?
         AND candidate.status = 'completed'
         AND candidate.role <> 'system'
         AND (
           candidate.createdAt > target.createdAt
           OR (candidate.createdAt = target.createdAt AND candidate.rowid > target.rowid)
         )
       ORDER BY candidate.createdAt ASC, candidate.rowid ASC
       LIMIT ?`,
      afterMessageId,
      threadId,
      limit
    );
  },

  async listRecentCompletedNonSystemMessages(db: SQLiteDatabase, threadId: string, limit: number): Promise<AiMessageRecord[]> {
    if (limit <= 0) {
      return [];
    }
    return db.getAllAsync<AiMessageRecord>(
      `SELECT * FROM (
         SELECT *, rowid AS rowOrder
         FROM ai_messages
         WHERE threadId = ?
           AND status = 'completed'
           AND role <> 'system'
         ORDER BY createdAt DESC, rowid DESC
         LIMIT ?
       )
       ORDER BY createdAt ASC, rowOrder ASC`,
      threadId,
      limit
    );
  },

  async findPreviousMessageByRole(db: SQLiteDatabase, threadId: string, beforeMessageId: string, role: AiMessageRole): Promise<AiMessageRecord | null> {
    return db.getFirstAsync<AiMessageRecord>(
      `SELECT candidate.*
       FROM ai_messages target
       JOIN ai_messages candidate ON candidate.threadId = target.threadId
       WHERE target.id = ?
         AND target.threadId = ?
         AND candidate.role = ?
         AND (
           candidate.createdAt < target.createdAt
           OR (candidate.createdAt = target.createdAt AND candidate.rowid < target.rowid)
         )
       ORDER BY candidate.createdAt DESC, candidate.rowid DESC
       LIMIT 1`,
      beforeMessageId,
      threadId,
      role
    );
  },

  async findNextMessageByRole(db: SQLiteDatabase, threadId: string, afterMessageId: string, role: AiMessageRole): Promise<AiMessageRecord | null> {
    return db.getFirstAsync<AiMessageRecord>(
      `SELECT candidate.*
       FROM ai_messages target
       JOIN ai_messages candidate ON candidate.threadId = target.threadId
       WHERE target.id = ?
         AND target.threadId = ?
         AND candidate.role = ?
         AND (
           candidate.createdAt > target.createdAt
           OR (candidate.createdAt = target.createdAt AND candidate.rowid > target.rowid)
         )
       ORDER BY candidate.createdAt ASC, candidate.rowid ASC
       LIMIT 1`,
      afterMessageId,
      threadId,
      role
    );
  },

  async listMessageIdsAfter(db: SQLiteDatabase, threadId: string, afterMessageId: string): Promise<string[]> {
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT candidate.id
       FROM ai_messages target
       JOIN ai_messages candidate ON candidate.threadId = target.threadId
       WHERE target.id = ?
         AND target.threadId = ?
         AND (
           candidate.createdAt > target.createdAt
           OR (candidate.createdAt = target.createdAt AND candidate.rowid > target.rowid)
         )
       ORDER BY candidate.createdAt ASC, candidate.rowid ASC`,
      afterMessageId,
      threadId
    );
    return rows.map((row) => row.id);
  },

  async createMessageVersion(db: SQLiteDatabase, input: CreateAiMessageVersionInput): Promise<AiMessageVersionRecord> {
    const now = createTimestamp();
    const latest = await db.getFirstAsync<{ versionIndex: number }>(
      `SELECT versionIndex FROM ai_message_versions
       WHERE originalMessageId = ?
       ORDER BY versionIndex DESC
       LIMIT 1`,
      input.originalMessageId
    );
    const versionIndex = (latest?.versionIndex ?? 0) + 1;
    await db.runAsync(
      `INSERT INTO ai_message_versions (
        id,
        originalMessageId,
        threadId,
        versionIndex,
        role,
        status,
        content,
        reasoningText,
        errorMessage,
        providerId,
        modelId,
        modelSnapshotJson,
        promptSnapshotJson,
        citationsJson,
        messageCreatedAt,
        messageUpdatedAt,
        messageCompletedAt,
        createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.originalMessageId,
      input.threadId,
      versionIndex,
      input.role,
      input.status,
      input.content,
      input.reasoningText ?? null,
      input.errorMessage == null ? null : normalizeOptionalText(input.errorMessage) ?? null,
      input.providerId ?? null,
      input.modelId ?? null,
      input.modelSnapshotJson ?? '{}',
      input.promptSnapshotJson ?? '{}',
      JSON.stringify(input.citations ?? []),
      input.messageCreatedAt,
      input.messageUpdatedAt,
      input.messageCompletedAt ?? null,
      now
    );
    const row = await db.getFirstAsync<AiMessageVersionRow>('SELECT * FROM ai_message_versions WHERE id = ?', input.id);
    if (!row) {
      throw new Error(`AI message version ${input.id} was created but could not be reloaded.`);
    }
    return mapMessageVersionRow(row);
  },

  async listMessageVersions(db: SQLiteDatabase, messageId: string): Promise<AiMessageVersionRecord[]> {
    const rows = await db.getAllAsync<AiMessageVersionRow>(
      `SELECT * FROM ai_message_versions
       WHERE originalMessageId = ?
       ORDER BY versionIndex ASC`,
      messageId
    );
    return rows.map(mapMessageVersionRow);
  },

  async listMessageVersionsForMessages(db: SQLiteDatabase, messageIds: string[]): Promise<Record<string, AiMessageVersionRecord[]>> {
    if (messageIds.length === 0) {
      return {};
    }
    const rows = await db.getAllAsync<AiMessageVersionRow>(
      `SELECT * FROM ai_message_versions
       WHERE originalMessageId IN (${makeInClause(messageIds)})
       ORDER BY originalMessageId ASC, versionIndex ASC`,
      ...messageIds
    );
    return rows.reduce<Record<string, AiMessageVersionRecord[]>>((grouped, row) => {
      const mapped = mapMessageVersionRow(row);
      grouped[mapped.originalMessageId] = grouped[mapped.originalMessageId] ?? [];
      grouped[mapped.originalMessageId].push(mapped);
      return grouped;
    }, {});
  },

  async replaceCitations(db: SQLiteDatabase, messageId: string, citations: ReplaceCitationInput[]): Promise<void> {
    const now = createTimestamp();
    await db.runAsync('DELETE FROM ai_message_citations WHERE messageId = ?', messageId);
    for (const citation of citations) {
      await db.runAsync(
        `INSERT INTO ai_message_citations (
          id,
          messageId,
          sourceType,
          sourceId,
          label,
          locatorJson,
          createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        citation.id,
        messageId,
        citation.sourceType,
        citation.sourceId,
        citation.label,
        JSON.stringify(citation.locator ?? {}),
        now
      );
    }
  },

  async listCitations(db: SQLiteDatabase, messageId: string): Promise<AiCitationRecord[]> {
    const rows = await db.getAllAsync<AiCitationRow>(
      `SELECT * FROM ai_message_citations
       WHERE messageId = ?
       ORDER BY createdAt ASC`,
      messageId
    );
    return rows.map(mapCitationRow);
  },

  async listCitationsForMessages(db: SQLiteDatabase, messageIds: string[]): Promise<Record<string, AiCitationRecord[]>> {
    if (messageIds.length === 0) {
      return {};
    }
    const rows = await db.getAllAsync<AiCitationRow>(
      `SELECT * FROM ai_message_citations
       WHERE messageId IN (${makeInClause(messageIds)})
       ORDER BY messageId ASC, createdAt ASC`,
      ...messageIds
    );
    return rows.reduce<Record<string, AiCitationRecord[]>>((grouped, row) => {
      const mapped = mapCitationRow(row);
      grouped[mapped.messageId] = grouped[mapped.messageId] ?? [];
      grouped[mapped.messageId].push(mapped);
      return grouped;
    }, {});
  },

  async getThreadMemorySettings(db: SQLiteDatabase, threadId: string): Promise<AiThreadMemorySettingsRecord> {
    const row = await db.getFirstAsync<AiThreadMemorySettingsRow>('SELECT * FROM ai_thread_memory_settings WHERE threadId = ?', threadId);
    return row ? mapMemorySettingsRow(row) : { threadId, deepMemoryEnabled: false, updatedAt: createTimestamp() };
  },

  async updateThreadMemorySettings(db: SQLiteDatabase, threadId: string, deepMemoryEnabled: boolean): Promise<AiThreadMemorySettingsRecord> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_thread_memory_settings (threadId, deepMemoryEnabled, updatedAt)
       VALUES (?, ?, ?)
       ON CONFLICT(threadId) DO UPDATE SET deepMemoryEnabled = excluded.deepMemoryEnabled, updatedAt = excluded.updatedAt`,
      threadId,
      booleanToSqlite(deepMemoryEnabled),
      now
    );
    const row = await db.getFirstAsync<AiThreadMemorySettingsRow>('SELECT * FROM ai_thread_memory_settings WHERE threadId = ?', threadId);
    if (!row) {
      throw new Error(`AI thread memory settings ${threadId} could not be reloaded.`);
    }
    return mapMemorySettingsRow(row);
  },

  async getUserProfile(db: SQLiteDatabase, space: PixorySpace): Promise<AiUserProfileRecord | null> {
    return db.getFirstAsync<AiUserProfileRecord>('SELECT * FROM ai_user_profiles WHERE space = ?', space);
  },

  async upsertUserProfile(
    db: SQLiteDatabase,
    input: Omit<AiUserProfileRecord, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string }
  ): Promise<AiUserProfileRecord> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_user_profiles (
        id, space, profileJson, profileText, version, sourceThreadId, sourceStartMessageId,
        sourceEndMessageId, messageCountAtUpdate, lastUpdatedAt, createdAt, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(space) DO UPDATE SET
        profileJson = excluded.profileJson,
        profileText = excluded.profileText,
        version = ai_user_profiles.version + 1,
        sourceThreadId = excluded.sourceThreadId,
        sourceStartMessageId = excluded.sourceStartMessageId,
        sourceEndMessageId = excluded.sourceEndMessageId,
        messageCountAtUpdate = excluded.messageCountAtUpdate,
        lastUpdatedAt = excluded.lastUpdatedAt,
        updatedAt = excluded.updatedAt`,
      input.id,
      input.space,
      input.profileJson,
      input.profileText,
      input.version,
      input.sourceThreadId,
      input.sourceStartMessageId,
      input.sourceEndMessageId,
      input.messageCountAtUpdate,
      input.lastUpdatedAt,
      input.createdAt ?? now,
      input.updatedAt ?? now
    );
    const row = await this.getUserProfile(db, input.space);
    if (!row) {
      throw new Error('User profile upsert failed.');
    }
    return row;
  },

  async createSummarySegment(
    db: SQLiteDatabase,
    input: Omit<AiThreadSummarySegmentRecord, 'createdAt' | 'updatedAt'>
  ): Promise<AiThreadSummarySegmentRecord> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_thread_summary_segments (
        id, threadId, space, kind, summaryText, startMessageId, endMessageId,
        startAt, endAt, roundCount, sourceSegmentIdsJson, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.threadId,
      input.space,
      input.kind,
      input.summaryText,
      input.startMessageId,
      input.endMessageId,
      input.startAt,
      input.endAt,
      input.roundCount,
      input.sourceSegmentIdsJson,
      now,
      now
    );
    const row = await db.getFirstAsync<AiThreadSummarySegmentRecord>('SELECT * FROM ai_thread_summary_segments WHERE id = ?', input.id);
    if (!row) {
      throw new Error('Summary segment insert failed.');
    }
    return row;
  },

  async listSummarySegments(db: SQLiteDatabase, threadId: string): Promise<AiThreadSummarySegmentRecord[]> {
    return db.getAllAsync<AiThreadSummarySegmentRecord>(
      'SELECT * FROM ai_thread_summary_segments WHERE threadId = ? ORDER BY createdAt ASC, id ASC',
      threadId
    );
  },

  async deleteSummarySegments(db: SQLiteDatabase, ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const placeholders = makeInClause(ids);
    await db.runAsync(`DELETE FROM ai_thread_summary_segments WHERE id IN (${placeholders})`, ...ids);
  },

  async getThreadSummary(db: SQLiteDatabase, threadId: string): Promise<AiThreadSummaryRecord | null> {
    return db.getFirstAsync<AiThreadSummaryRecord>('SELECT * FROM ai_thread_summaries WHERE threadId = ?', threadId);
  },

  async upsertThreadSummary(db: SQLiteDatabase, input: UpsertAiThreadSummaryInput): Promise<AiThreadSummaryRecord> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_thread_summaries (threadId, summary, decisions, openQuestions, lastMessageId, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(threadId) DO UPDATE SET
         summary = excluded.summary,
         decisions = excluded.decisions,
         openQuestions = excluded.openQuestions,
         lastMessageId = excluded.lastMessageId,
         updatedAt = excluded.updatedAt`,
      input.threadId,
      input.summary,
      input.decisions ?? '',
      input.openQuestions ?? '',
      input.lastMessageId ?? null,
      now
    );
    const row = await db.getFirstAsync<AiThreadSummaryRecord>('SELECT * FROM ai_thread_summaries WHERE threadId = ?', input.threadId);
    if (!row) {
      throw new Error(`AI thread summary ${input.threadId} could not be reloaded.`);
    }
    return row;
  },

  async findActiveMemoryByNormalizedContent(db: SQLiteDatabase, input: { space: PixorySpace; scope: AiMemoryScope; scopeId?: string | null; normalizedContent: string }): Promise<AiMemoryRecord | null> {
    return db.getFirstAsync<AiMemoryRecord>(
      `SELECT * FROM ai_memories
       WHERE space = ? AND scope = ? AND COALESCE(scopeId, '') = COALESCE(?, '') AND normalizedContent = ? AND status = 'active'
       LIMIT 1`,
      input.space,
      input.scope,
      input.scopeId ?? null,
      input.normalizedContent
    );
  },

  async createMemory(db: SQLiteDatabase, input: CreateAiMemoryInput): Promise<AiMemoryRecord> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_memories (
        id, space, scope, scopeId, type, content, normalizedContent, sourceMessageId,
        confidence, importance, status, lastUsedAt, ipId, groupId, imageAssetId, assetSnapshotJson, sourceKind,
        createdAt, updatedAt, deletedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      input.id,
      input.space,
      input.scope,
      input.scopeId ?? null,
      input.type,
      input.content,
      input.normalizedContent,
      input.sourceMessageId ?? null,
      input.confidence ?? 0.7,
      input.importance ?? 1,
      input.ipId ?? null,
      input.groupId ?? null,
      input.imageAssetId ?? null,
      input.assetSnapshotJson ?? '{}',
      input.sourceKind ?? 'auto',
      now,
      now
    );
    const row = await db.getFirstAsync<AiMemoryRecord>('SELECT * FROM ai_memories WHERE id = ?', input.id);
    if (!row) {
      throw new Error(`AI memory ${input.id} was created but could not be reloaded.`);
    }
    return row;
  },

  async createManualMemory(db: SQLiteDatabase, input: CreateAiMemoryInput): Promise<AiMemoryRecord> {
    return aiThreadRepository.createMemory(db, {
      ...input,
      confidence: input.confidence ?? 1,
      importance: input.importance ?? 4,
      sourceKind: 'manual',
    });
  },

  async updateMemoryContent(db: SQLiteDatabase, memoryId: string, content: string): Promise<AiMemoryRecord | null> {
    const now = createTimestamp();
    const trimmed = content.replace(/\s+/g, ' ').trim();
    const normalizedContent = trimmed.toLowerCase().slice(0, 180);
    await db.runAsync(
      `UPDATE ai_memories
       SET content = ?, normalizedContent = ?, updatedAt = ?
       WHERE id = ? AND status = 'active'`,
      trimmed,
      normalizedContent,
      now,
      memoryId
    );
    return db.getFirstAsync<AiMemoryRecord>('SELECT * FROM ai_memories WHERE id = ?', memoryId);
  },

  async listMemoryBoardItems(db: SQLiteDatabase, input: { space: PixorySpace; threadId?: string | null; roleCardId?: string | null; boundIpId?: number | null; boundKnowledgeBaseId?: string | null }): Promise<AiMemoryRecord[]> {
    const clauses = ["space = ?", "status = 'active'"];
    const values: Array<string | number | null> = [input.space];
    const scopeClauses = ["scope = 'global'"];
    if (input.threadId) {
      scopeClauses.push("(scope = 'thread' AND scopeId = ?)");
      values.push(input.threadId);
    }
    if (input.roleCardId) {
      scopeClauses.push("(scope = 'role' AND scopeId = ?)");
      values.push(input.roleCardId);
    }
    if (input.boundIpId != null) {
      scopeClauses.push("(scope = 'ip' AND scopeId = ?)");
      values.push(String(input.boundIpId));
    }
    if (input.boundKnowledgeBaseId) {
      scopeClauses.push("(scope = 'knowledge_base' AND scopeId = ?)");
      values.push(input.boundKnowledgeBaseId);
    }
    clauses.push(`(${scopeClauses.join(' OR ')})`);
    return db.getAllAsync<AiMemoryRecord>(
      `SELECT * FROM ai_memories
       WHERE ${clauses.join(' AND ')}
       ORDER BY scope ASC, importance DESC, createdAt ASC, id ASC`,
      ...values
    );
  },

  async listActiveMemories(db: SQLiteDatabase, input: { space: PixorySpace; threadId: string; roleCardId?: string | null; boundIpId?: number | null; boundKnowledgeBaseId?: string | null; limit?: number }): Promise<AiMemoryRecord[]> {
    const scopePairs: Array<[AiMemoryScope, string | null]> = [
      ['global', null],
      ['thread', input.threadId],
    ];
    if (input.roleCardId) {
      scopePairs.push(['role', input.roleCardId]);
    }
    if (input.boundIpId != null) {
      scopePairs.push(['ip', String(input.boundIpId)]);
    }
    if (input.boundKnowledgeBaseId) {
      scopePairs.push(['knowledge_base', input.boundKnowledgeBaseId]);
    }
    const clauses = scopePairs.map(() => '(scope = ? AND COALESCE(scopeId, \'\') = COALESCE(?, \'\'))');
    const values = scopePairs.flatMap(([scope, scopeId]) => [scope, scopeId]);
    return db.getAllAsync<AiMemoryRecord>(
      `SELECT * FROM ai_memories
       WHERE space = ? AND status = 'active' AND (${clauses.join(' OR ')})
       ORDER BY importance DESC, COALESCE(lastUsedAt, updatedAt) DESC, updatedAt DESC
       LIMIT ?`,
      input.space,
      ...values,
      input.limit ?? 80
    );
  },

  async touchMemories(db: SQLiteDatabase, memoryIds: string[]): Promise<void> {
    if (memoryIds.length === 0) {
      return;
    }
    await db.runAsync(
      `UPDATE ai_memories SET lastUsedAt = ?, updatedAt = ? WHERE id IN (${makeInClause(memoryIds)})`,
      createTimestamp(),
      createTimestamp(),
      ...memoryIds
    );
  },

  async updateMemoryStatus(db: SQLiteDatabase, memoryId: string, status: AiMemoryStatus): Promise<void> {
    const now = createTimestamp();
    await db.runAsync(
      `UPDATE ai_memories SET status = ?, deletedAt = ?, updatedAt = ? WHERE id = ?`,
      status,
      status === 'deleted' ? now : null,
      now,
      memoryId
    );
  },

  async deleteMemory(db: SQLiteDatabase, memoryId: string): Promise<void> {
    await aiThreadRepository.updateMemoryStatus(db, memoryId, 'deleted');
  },

  async getThreadMemoryJob(db: SQLiteDatabase, threadId: string): Promise<AiThreadMemoryJobRecord> {
    const row = await db.getFirstAsync<AiThreadMemoryJobRecord>('SELECT * FROM ai_thread_memory_jobs WHERE threadId = ?', threadId);
    return row ?? {
      threadId,
      pendingTurnCount: 0,
      lastConsolidatedMessageId: null,
      lastCaptureNoticeJson: '[]',
      lastCompressedMessageId: null,
      uncompressedRoundCount: 0,
      completedMessageCountAtProfileUpdate: 0,
      lastProfileUpdatedAt: null,
      profileUpdateCooldownUntil: null,
      lastMaintenanceError: null,
      lastMaintenanceModelProviderId: null,
      lastMaintenanceModelId: null,
      updatedAt: createTimestamp(),
    };
  },

  async updateThreadMemoryJob(db: SQLiteDatabase, input: Partial<AiThreadMemoryJobRecord> & { threadId: string }): Promise<AiThreadMemoryJobRecord> {
    const current = await aiThreadRepository.getThreadMemoryJob(db, input.threadId);
    const next = { ...current, ...input, updatedAt: createTimestamp() };
    await db.runAsync(
      `INSERT INTO ai_thread_memory_jobs (
         threadId, pendingTurnCount, lastConsolidatedMessageId, lastCaptureNoticeJson,
         lastCompressedMessageId, uncompressedRoundCount, completedMessageCountAtProfileUpdate,
         lastProfileUpdatedAt, profileUpdateCooldownUntil, lastMaintenanceError,
         lastMaintenanceModelProviderId, lastMaintenanceModelId, updatedAt
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(threadId) DO UPDATE SET
         pendingTurnCount = excluded.pendingTurnCount,
         lastConsolidatedMessageId = excluded.lastConsolidatedMessageId,
         lastCaptureNoticeJson = excluded.lastCaptureNoticeJson,
         lastCompressedMessageId = excluded.lastCompressedMessageId,
         uncompressedRoundCount = excluded.uncompressedRoundCount,
         completedMessageCountAtProfileUpdate = excluded.completedMessageCountAtProfileUpdate,
         lastProfileUpdatedAt = excluded.lastProfileUpdatedAt,
         profileUpdateCooldownUntil = excluded.profileUpdateCooldownUntil,
         lastMaintenanceError = excluded.lastMaintenanceError,
         lastMaintenanceModelProviderId = excluded.lastMaintenanceModelProviderId,
         lastMaintenanceModelId = excluded.lastMaintenanceModelId,
         updatedAt = excluded.updatedAt`,
      next.threadId,
      next.pendingTurnCount,
      next.lastConsolidatedMessageId,
      next.lastCaptureNoticeJson,
      next.lastCompressedMessageId,
      next.uncompressedRoundCount,
      next.completedMessageCountAtProfileUpdate,
      next.lastProfileUpdatedAt,
      next.profileUpdateCooldownUntil,
      next.lastMaintenanceError,
      next.lastMaintenanceModelProviderId,
      next.lastMaintenanceModelId,
      next.updatedAt
    );
    return next;
  },
};

export default aiThreadRepository;
