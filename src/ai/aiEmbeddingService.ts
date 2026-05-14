import { runWithDatabaseSpace, type PixorySpace } from '../database';
import type { AiDocumentOwnerType } from './types';

export interface GenerateMissingEmbeddingsInput {
  space: PixorySpace;
  documentId: string;
  providerId?: string | null;
  modelId?: string | null;
}

export interface TryEmbeddingRetrievalInput {
  space: PixorySpace;
  ownerType: AiDocumentOwnerType;
  ownerId: string;
  providerId?: string | null;
  modelId?: string | null;
  queryVector?: number[] | null;
  limit?: number;
}

interface EmbeddingRow {
  chunkId: string;
  vectorJson: string;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let aLength = 0;
  let bLength = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    dot += left * right;
    aLength += left * left;
    bLength += right * right;
  }
  if (aLength === 0 || bLength === 0) {
    return 0;
  }
  return dot / (Math.sqrt(aLength) * Math.sqrt(bLength));
}

function parseVector(value: string): number[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is number => typeof item === 'number') : [];
  } catch {
    return [];
  }
}

export async function generateMissingEmbeddingsForDocument(
  input: GenerateMissingEmbeddingsInput
): Promise<{ generated: number; failed: number }> {
  if (!input.providerId || !input.modelId) {
    return { generated: 0, failed: 0 };
  }
  const providerId = input.providerId;
  const modelId = input.modelId;

  return runWithDatabaseSpace(input.space, async (db) => {
    const chunks = await db.getAllAsync<{ id: string }>(
      `SELECT ai_chunks.id
       FROM ai_chunks
       LEFT JOIN ai_embeddings
         ON ai_embeddings.chunkId = ai_chunks.id
        AND ai_embeddings.providerId = ?
        AND ai_embeddings.modelId = ?
       WHERE ai_chunks.documentId = ? AND ai_chunks.space = ? AND ai_embeddings.id IS NULL`,
      providerId,
      modelId,
      input.documentId,
      input.space
    );

    return { generated: 0, failed: chunks.length };
  });
}

export async function tryEmbeddingRetrieval(
  input: TryEmbeddingRetrievalInput
): Promise<Array<{ chunkId: string; score: number }>> {
  if (!input.providerId || !input.modelId || !input.queryVector?.length) {
    return [];
  }
  const providerId = input.providerId;
  const modelId = input.modelId;
  const queryVector = input.queryVector;

  return runWithDatabaseSpace(input.space, async (db) => {
    const rows = await db.getAllAsync<EmbeddingRow>(
      `SELECT ai_embeddings.chunkId, ai_embeddings.vectorJson
       FROM ai_embeddings
       INNER JOIN ai_chunks ON ai_chunks.id = ai_embeddings.chunkId
       WHERE ai_chunks.space = ?
         AND ai_chunks.ownerType = ?
         AND ai_chunks.ownerId = ?
         AND ai_embeddings.providerId = ?
         AND ai_embeddings.modelId = ?`,
      input.space,
      input.ownerType,
      input.ownerId,
      providerId,
      modelId
    );

    return rows
      .map((row) => ({
        chunkId: row.chunkId,
        score: cosineSimilarity(queryVector, parseVector(row.vectorJson)),
      }))
      .filter((result) => result.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, input.limit ?? 6);
  });
}
