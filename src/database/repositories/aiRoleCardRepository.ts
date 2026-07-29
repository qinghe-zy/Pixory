import type { SQLiteDatabase } from 'expo-sqlite';

import type { AiBoundaryMode, AiRoleCardRecord, AiRoleCardSourceType } from '../../ai/types';
import type { PixorySpace } from '../db';
import { createTimestamp } from '../utils';

type AiRoleCardRow = Omit<
  AiRoleCardRecord,
  'tags' | 'avatarEnabled' | 'firstMessage' | 'alternateGreetings' | 'sourceType' | 'sourceJson'
> & {
  avatarEnabled: number;
  firstMessage?: string | null;
  alternateGreetingsJson?: string | null;
  sourceType?: string | null;
  sourceJson?: string | null;
  tagsJson: string;
};

const ROLE_CARD_SOURCE_TYPES: readonly AiRoleCardSourceType[] = [
  'sillytavern_png_v2',
  'sillytavern_png_v3',
  'sillytavern_json_v2',
  'sillytavern_json_v3',
  'tavern_json_v1',
  'pixory_manual',
];

export interface CreateAiRoleCardInput {
  id: string;
  space: PixorySpace;
  name: string;
  description?: string | null;
  prompt: string;
  firstMessage?: string | null;
  alternateGreetings?: string[];
  sourceType?: AiRoleCardSourceType | null;
  sourceJson?: string | null;
  defaultLanguage?: string | null;
  defaultModelId?: string | null;
  boundaryMode?: AiBoundaryMode;
  avatarEnabled?: boolean;
  avatarUri?: string | null;
  tags?: string[];
}

export type UpdateAiRoleCardInput = Omit<CreateAiRoleCardInput, 'id'>;

function parseTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed.filter((tag: unknown): tag is string => typeof tag === 'string') : [];
  } catch {
    return [];
  }
}

function parseAlternateGreetings(alternateGreetingsJson?: string | null): string[] {
  if (!alternateGreetingsJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(alternateGreetingsJson);
    return Array.isArray(parsed)
      ? parsed.filter(
          (alternateGreeting: unknown): alternateGreeting is string =>
            typeof alternateGreeting === 'string' && alternateGreeting.trim().length > 0
        )
      : [];
  } catch {
    return [];
  }
}

function normalizeRoleCardSourceType(sourceType?: string | null): AiRoleCardSourceType | null {
  return ROLE_CARD_SOURCE_TYPES.includes(sourceType as AiRoleCardSourceType)
    ? (sourceType as AiRoleCardSourceType)
    : null;
}

function mapRoleCardRow(row: AiRoleCardRow): AiRoleCardRecord {
  return {
    id: row.id,
    space: row.space,
    name: row.name,
    description: row.description ?? null,
    prompt: row.prompt,
    firstMessage: row.firstMessage ?? null,
    alternateGreetings: parseAlternateGreetings(row.alternateGreetingsJson),
    sourceType: normalizeRoleCardSourceType(row.sourceType),
    sourceJson: row.sourceJson ?? null,
    defaultLanguage: row.defaultLanguage ?? null,
    defaultModelId: row.defaultModelId ?? null,
    boundaryMode: row.boundaryMode,
    avatarEnabled: row.avatarEnabled === 1,
    avatarUri: row.avatarUri ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt ?? null,
    tags: parseTags(row.tagsJson),
  };
}

export const aiRoleCardRepository = {
  async create(db: SQLiteDatabase, input: CreateAiRoleCardInput): Promise<AiRoleCardRecord> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_role_cards (
        id,
        space,
        name,
        description,
        prompt,
        firstMessage,
        alternateGreetingsJson,
        sourceType,
        sourceJson,
        defaultLanguage,
        defaultModelId,
        boundaryMode,
        avatarEnabled,
        avatarUri,
        tagsJson,
        createdAt,
        updatedAt,
        archivedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      input.id,
      input.space,
      input.name,
      input.description ?? null,
      input.prompt,
      input.firstMessage ?? null,
      JSON.stringify(input.alternateGreetings ?? []),
      input.sourceType ?? null,
      input.sourceJson ?? null,
      input.defaultLanguage ?? null,
      input.defaultModelId ?? null,
      input.boundaryMode ?? 'free',
      input.avatarEnabled ? 1 : 0,
      input.avatarUri ?? null,
      JSON.stringify(input.tags ?? []),
      now,
      now
    );
    return {
      id: input.id,
      space: input.space,
      name: input.name,
      description: input.description ?? null,
      prompt: input.prompt,
      firstMessage: input.firstMessage ?? null,
      alternateGreetings: input.alternateGreetings ?? [],
      sourceType: input.sourceType ?? null,
      sourceJson: input.sourceJson ?? null,
      defaultLanguage: input.defaultLanguage ?? null,
      defaultModelId: input.defaultModelId ?? null,
      boundaryMode: input.boundaryMode ?? 'free',
      avatarEnabled: input.avatarEnabled ?? false,
      avatarUri: input.avatarUri ?? null,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
  },

  async listActive(db: SQLiteDatabase, space: PixorySpace): Promise<AiRoleCardRecord[]> {
    const rows = await db.getAllAsync<AiRoleCardRow>(
      `SELECT ai_role_cards.*
       FROM ai_role_cards
       LEFT JOIN (
         SELECT
          ai_threads.roleCardId AS roleCardId,
          MAX(COALESCE(ai_messages.completedAt, ai_messages.updatedAt, ai_messages.createdAt, ai_threads.updatedAt)) AS lastChatAt
         FROM ai_threads
         LEFT JOIN ai_messages ON ai_messages.threadId = ai_threads.id AND ai_messages.role <> 'system'
         WHERE ai_threads.space = ? AND ai_threads.archivedAt IS NULL AND ai_threads.roleCardId IS NOT NULL
         GROUP BY ai_threads.roleCardId
       ) role_chat_activity ON role_chat_activity.roleCardId = ai_role_cards.id
       WHERE ai_role_cards.space = ? AND ai_role_cards.archivedAt IS NULL
       ORDER BY (lastChatAt IS NULL) ASC, lastChatAt DESC, ai_role_cards.updatedAt DESC, ai_role_cards.name ASC`,
      space,
      space
    );
    return rows.map(mapRoleCardRow);
  },

  async findById(db: SQLiteDatabase, roleCardId: string): Promise<AiRoleCardRecord | null> {
    const row = await db.getFirstAsync<AiRoleCardRow>(
      'SELECT * FROM ai_role_cards WHERE id = ? AND archivedAt IS NULL',
      roleCardId
    );
    return row ? mapRoleCardRow(row) : null;
  },

  async findAnyById(db: SQLiteDatabase, roleCardId: string): Promise<AiRoleCardRecord | null> {
    const row = await db.getFirstAsync<AiRoleCardRow>(
      'SELECT * FROM ai_role_cards WHERE id = ?',
      roleCardId
    );
    return row ? mapRoleCardRow(row) : null;
  },

  async importRoleCardForSpaceMove(
    db: SQLiteDatabase,
    roleCard: AiRoleCardRecord,
    targetSpace: PixorySpace,
    targetRoleCardId: string,
    targetAvatarUri: string | null
  ): Promise<void> {
    await db.runAsync(
      `INSERT INTO ai_role_cards (
        id,
        space,
        name,
        description,
        prompt,
        firstMessage,
        alternateGreetingsJson,
        sourceType,
        sourceJson,
        defaultLanguage,
        defaultModelId,
        boundaryMode,
        avatarEnabled,
        avatarUri,
        tagsJson,
        createdAt,
        updatedAt,
        archivedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      targetRoleCardId,
      targetSpace,
      roleCard.name,
      roleCard.description,
      roleCard.prompt,
      roleCard.firstMessage,
      JSON.stringify(roleCard.alternateGreetings),
      roleCard.sourceType,
      roleCard.sourceJson,
      roleCard.defaultLanguage,
      roleCard.defaultModelId,
      roleCard.boundaryMode,
      roleCard.avatarEnabled ? 1 : 0,
      targetAvatarUri,
      JSON.stringify(roleCard.tags),
      roleCard.createdAt,
      roleCard.updatedAt
    );
  },

  async setArchivedAtForSpaceMove(
    db: SQLiteDatabase,
    space: PixorySpace,
    roleCardId: string,
    archivedAt: string | null
  ): Promise<void> {
    await db.runAsync(
      `UPDATE ai_role_cards
       SET archivedAt = ?
       WHERE id = ? AND space = ?`,
      archivedAt,
      roleCardId,
      space
    );
  },

  async deleteUnreferencedRoleCardsAfterThreadMove(
    db: SQLiteDatabase,
    space: PixorySpace,
    roleCardIds: string[]
  ): Promise<AiRoleCardRecord[]> {
    const deletedRoleCards: AiRoleCardRecord[] = [];
    for (const roleCardId of Array.from(new Set(roleCardIds))) {
      const reference = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM ai_threads WHERE roleCardId = ?',
        roleCardId
      );
      if ((reference?.count ?? 0) > 0) {
        continue;
      }
      const roleCard = await aiRoleCardRepository.findAnyById(db, roleCardId);
      if (!roleCard || roleCard.space !== space) {
        continue;
      }
      const memoryRows = await db.getAllAsync<{ id: string }>(
        `SELECT id FROM ai_memories
         WHERE space = ? AND scope = 'role' AND scopeId = ?`,
        space,
        roleCardId
      );
      for (const memory of memoryRows) {
        await db.runAsync('DELETE FROM ai_memory_fts WHERE id = ?', memory.id);
      }
      await db.runAsync(
        `DELETE FROM ai_memories
         WHERE space = ? AND scope = 'role' AND scopeId = ?`,
        space,
        roleCardId
      );
      await db.runAsync(
        `DELETE FROM companion_projection_snapshots
         WHERE space = ? AND roleCardId = ? AND scopeType = 'role_base'`,
        space,
        roleCardId,
      );
      await db.runAsync(
        'DELETE FROM companion_role_round_counters WHERE space = ? AND roleCardId = ?',
        space,
        roleCardId,
      );
      await db.runAsync(
        'DELETE FROM ai_role_cards WHERE id = ? AND space = ?',
        roleCardId,
        space
      );
      deletedRoleCards.push(roleCard);
    }
    return deletedRoleCards;
  },

  async isAvatarUriReferenced(
    db: SQLiteDatabase,
    space: PixorySpace,
    avatarUri: string
  ): Promise<boolean> {
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM ai_role_cards
       WHERE space = ? AND avatarUri = ?`,
      space,
      avatarUri
    );
    return (row?.count ?? 0) > 0;
  },

  async findActiveByImportSource(
    db: SQLiteDatabase,
    space: PixorySpace,
    sourceType: AiRoleCardSourceType,
    sourceJson: string
  ): Promise<AiRoleCardRecord | null> {
    const row = await db.getFirstAsync<AiRoleCardRow>(
      `SELECT *
       FROM ai_role_cards
       WHERE space = ? AND sourceType = ? AND sourceJson = ? AND archivedAt IS NULL
       LIMIT 1`,
      space,
      sourceType,
      sourceJson
    );
    return row ? mapRoleCardRow(row) : null;
  },

  async update(db: SQLiteDatabase, roleCardId: string, input: UpdateAiRoleCardInput): Promise<AiRoleCardRecord | null> {
    const now = createTimestamp();
    const result = await db.runAsync(
      `UPDATE ai_role_cards
       SET
        name = ?,
        description = ?,
        prompt = ?,
        firstMessage = ?,
        alternateGreetingsJson = ?,
        sourceType = ?,
        sourceJson = ?,
        defaultLanguage = ?,
        defaultModelId = ?,
        boundaryMode = ?,
        avatarEnabled = ?,
        avatarUri = ?,
        tagsJson = ?,
        updatedAt = ?
       WHERE id = ? AND space = ? AND archivedAt IS NULL`,
      input.name,
      input.description ?? null,
      input.prompt,
      input.firstMessage ?? null,
      JSON.stringify(input.alternateGreetings ?? []),
      input.sourceType ?? null,
      input.sourceJson ?? null,
      input.defaultLanguage ?? null,
      input.defaultModelId ?? null,
      input.boundaryMode ?? 'free',
      input.avatarEnabled ? 1 : 0,
      input.avatarUri ?? null,
      JSON.stringify(input.tags ?? []),
      now,
      roleCardId,
      input.space
    );
    if (!result.changes) {
      return null;
    }
    const row = await db.getFirstAsync<AiRoleCardRow>(
      'SELECT * FROM ai_role_cards WHERE id = ? AND archivedAt IS NULL',
      roleCardId
    );
    return row ? mapRoleCardRow(row) : null;
  },

  async archiveMany(db: SQLiteDatabase, roleCardIds: string[]): Promise<number> {
    if (roleCardIds.length === 0) {
      return 0;
    }
    const now = createTimestamp();
    const placeholders = roleCardIds.map(() => '?').join(', ');
    const result = await db.runAsync(
      `UPDATE ai_role_cards
       SET archivedAt = ?, updatedAt = ?
       WHERE archivedAt IS NULL AND id IN (${placeholders})`,
      now,
      now,
      ...roleCardIds
    );
    return result.changes ?? 0;
  },
};

export default aiRoleCardRepository;
