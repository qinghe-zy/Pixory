import type { SQLiteDatabase } from 'expo-sqlite';

import type { AiBoundaryMode, AiRoleCardRecord } from '../../ai/types';
import type { PixorySpace } from '../db';
import { createTimestamp } from '../utils';

type AiRoleCardRow = Omit<AiRoleCardRecord, 'tags'> & {
  tagsJson: string;
};

export interface CreateAiRoleCardInput {
  id: string;
  space: PixorySpace;
  name: string;
  description?: string | null;
  prompt: string;
  defaultLanguage?: string | null;
  defaultModelId?: string | null;
  boundaryMode?: AiBoundaryMode;
  tags?: string[];
}

function parseTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed.filter((tag: unknown): tag is string => typeof tag === 'string') : [];
  } catch {
    return [];
  }
}

function mapRoleCardRow(row: AiRoleCardRow): AiRoleCardRecord {
  return {
    ...row,
    description: row.description ?? null,
    defaultLanguage: row.defaultLanguage ?? null,
    defaultModelId: row.defaultModelId ?? null,
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
        defaultLanguage,
        defaultModelId,
        boundaryMode,
        tagsJson,
        createdAt,
        updatedAt,
        archivedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      input.id,
      input.space,
      input.name,
      input.description ?? null,
      input.prompt,
      input.defaultLanguage ?? null,
      input.defaultModelId ?? null,
      input.boundaryMode ?? 'free',
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
      defaultLanguage: input.defaultLanguage ?? null,
      defaultModelId: input.defaultModelId ?? null,
      boundaryMode: input.boundaryMode ?? 'free',
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
  },

  async listActive(db: SQLiteDatabase, space: PixorySpace): Promise<AiRoleCardRecord[]> {
    const rows = await db.getAllAsync<AiRoleCardRow>(
      `SELECT * FROM ai_role_cards
       WHERE space = ? AND archivedAt IS NULL
       ORDER BY updatedAt DESC, name ASC`,
      space
    );
    return rows.map(mapRoleCardRow);
  },
};

export default aiRoleCardRepository;
