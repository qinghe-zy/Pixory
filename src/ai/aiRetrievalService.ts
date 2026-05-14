import { runWithDatabaseSpace, type PixorySpace } from '../database';
import type { AiDocumentOwnerType } from './types';
import { tryEmbeddingRetrieval } from './aiEmbeddingService';

export const DEFAULT_RETRIEVAL_LIMIT = 6;
export type RetrievalMode = 'keyword' | 'hybrid';

export interface RetrievedSnippet {
  chunkId: string;
  label: string;
  text: string;
  locator: Record<string, unknown>;
  score: number;
}

export interface RetrieveForThreadInput {
  space: PixorySpace;
  ownerType: AiDocumentOwnerType;
  ownerId: string;
  query: string;
  limit?: number;
  embeddingProviderId?: string | null;
  embeddingModelId?: string | null;
  queryVector?: number[] | null;
}

interface ChunkSearchRow {
  id: string;
  text: string;
  normalizedText: string;
  sourceLabel: string;
  locatorJson: string;
}

function normalizeQuery(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function getSearchTerms(query: string): string[] {
  const normalized = normalizeQuery(query);
  return [...new Set(normalized.split(/[\s,，。！？!?;；:：]+/).filter((term) => term.length >= 2))].slice(0, 8);
}

function parseLocator(locatorJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(locatorJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function keywordScore(row: ChunkSearchRow, normalizedQuery: string, terms: string[]): number {
  let score = 0;
  if (normalizedQuery && row.normalizedText.includes(normalizedQuery)) {
    score += 12;
  }
  for (const term of terms) {
    if (row.normalizedText.includes(term)) {
      score += 3;
    }
  }
  score += Math.max(0, 2 - row.text.length / 1200);
  return score;
}

async function keywordSearch(input: RetrieveForThreadInput): Promise<RetrievedSnippet[]> {
  const normalizedQuery = normalizeQuery(input.query);
  const terms = getSearchTerms(input.query);
  if (!normalizedQuery) {
    return [];
  }

  return runWithDatabaseSpace(input.space, async (db) => {
    const likeTerms = terms.length > 0 ? terms : [normalizedQuery];
    const clauses = likeTerms.map(() => 'normalizedText LIKE ?');
    const rows = await db.getAllAsync<ChunkSearchRow>(
      `SELECT id, text, normalizedText, sourceLabel, locatorJson
       FROM ai_chunks
       WHERE space = ?
         AND ownerType = ?
         AND ownerId = ?
         AND (${clauses.join(' OR ')})
       LIMIT 80`,
      input.space,
      input.ownerType,
      input.ownerId,
      ...likeTerms.map((term) => `%${term}%`)
    );

    return rows
      .map((row) => ({
        chunkId: row.id,
        label: row.sourceLabel,
        text: row.text,
        locator: parseLocator(row.locatorJson),
        score: keywordScore(row, normalizedQuery, likeTerms),
      }))
      .filter((snippet) => snippet.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, input.limit ?? DEFAULT_RETRIEVAL_LIMIT);
  });
}

export async function retrieveForThread(input: RetrieveForThreadInput): Promise<{
  mode: RetrievalMode;
  snippets: RetrievedSnippet[];
}> {
  const limit = input.limit ?? DEFAULT_RETRIEVAL_LIMIT;
  const keyword = await keywordSearch({ ...input, limit });
  const vectorScores = await tryEmbeddingRetrieval({
    space: input.space,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    providerId: input.embeddingProviderId,
    modelId: input.embeddingModelId,
    queryVector: input.queryVector,
    limit,
  });

  if (vectorScores.length === 0) {
    return { mode: 'keyword', snippets: keyword };
  }

  const scoreByChunkId = new Map(vectorScores.map((item) => [item.chunkId, item.score]));
  const merged = keyword
    .map((snippet) => ({
      ...snippet,
      score: snippet.score + (scoreByChunkId.get(snippet.chunkId) ?? 0) * 10,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return { mode: 'hybrid', snippets: merged };
}
