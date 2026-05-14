import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  AiBoundaryMode,
  AiCitationRecord,
  AiCitationSourceType,
  AiContextType,
  AiMessageRole,
  AiMessageStatus,
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

type AiThreadRow = Omit<AiThreadRecord, 'includeIpDocuments'> & {
  includeIpDocuments: number;
  modelSnapshotJson: string;
  roleCardId: string | null;
  roleSnapshotJson: string;
};

type AiCitationRow = Omit<AiCitationRecord, 'locator'> & {
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

export type UpdateAiMessagePatch = Partial<Omit<CreateAiMessageInput, 'id' | 'threadId' | 'role'>>;

export interface ReplaceCitationInput {
  id: string;
  sourceType: AiCitationSourceType;
  sourceId: string;
  label: string;
  locator?: Record<string, unknown>;
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
        systemPrompt,
        materialRulesSnapshot,
        boundaryMode,
        summary,
        lastMessagePreview,
        createdAt,
        updatedAt,
        archivedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
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
      completedAt: patch.completedAt,
      updatedAt: createTimestamp(),
    });
    if (!updates.setClause) {
      return db.getFirstAsync<AiMessageRecord>('SELECT * FROM ai_messages WHERE id = ?', messageId);
    }
    await db.runAsync(`UPDATE ai_messages SET ${updates.setClause} WHERE id = ?`, ...updates.values, messageId);
    return db.getFirstAsync<AiMessageRecord>('SELECT * FROM ai_messages WHERE id = ?', messageId);
  },

  async listMessages(db: SQLiteDatabase, threadId: string): Promise<AiMessageRecord[]> {
    return db.getAllAsync<AiMessageRecord>(
      `SELECT * FROM ai_messages
       WHERE threadId = ?
       ORDER BY createdAt ASC`,
      threadId
    );
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
};

export default aiThreadRepository;
