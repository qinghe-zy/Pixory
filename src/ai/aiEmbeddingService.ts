import { aiKnowledgeRepository, aiProviderRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type { ReplaceEmbeddingInput } from '../database/repositories/aiKnowledgeRepository';
import type { AiDocumentOwnerType } from './types';
import { getAdapterForProvider } from './aiProviderService';
import { getProviderApiKey } from './secureAiSettingsService';

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

interface ChunkForEmbeddingRow {
  id: string;
  text: string;
}

function createAiId(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${timestamp}_${random}`;
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
  const configured = input.providerId && input.modelId
    ? { providerId: input.providerId, modelId: input.modelId }
    : await getEmbeddingProviderForSpace(input.space);
  if (!configured?.providerId || !configured.modelId) {
    return { generated: 0, failed: 0 };
  }
  const providerId = configured.providerId;
  const modelId = configured.modelId;
  const provider = await runWithDatabaseSpace(input.space, (db) => aiProviderRepository.findProviderById(db, providerId));
  const apiKey = provider ? await getProviderApiKey(provider.id) : null;
  if (!provider || !apiKey) {
    return { generated: 0, failed: 0 };
  }
  const adapter = getAdapterForProvider(provider);

  return runWithDatabaseSpace(input.space, async (db) => {
    const chunks = await db.getAllAsync<ChunkForEmbeddingRow>(
      `SELECT ai_chunks.id, ai_chunks.text
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

    const embeddings: ReplaceEmbeddingInput[] = [];
    let failed = 0;
    for (const chunk of chunks) {
      try {
        const vector = await adapter.embedText({
          apiKey,
          baseUrl: provider.baseUrl ?? '',
          modelId,
          text: chunk.text,
        });
        if (vector.length === 0) {
          failed += 1;
          continue;
        }
        embeddings.push({
          id: createAiId('aiembed'),
          chunkId: chunk.id,
          providerId,
          modelId,
          dimensions: vector.length,
          vectorJson: JSON.stringify(vector),
        });
      } catch {
        failed += 1;
      }
    }
    if (embeddings.length > 0) {
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM ai_embeddings WHERE chunkId IN (SELECT id FROM ai_chunks WHERE documentId = ?) AND providerId = ? AND modelId = ?', input.documentId, providerId, modelId);
        await aiKnowledgeRepository.replaceEmbeddings(db, embeddings);
      });
    }
    return { generated: embeddings.length, failed };
  });
}

export async function getEmbeddingProviderForSpace(space: PixorySpace): Promise<{ providerId: string; modelId: string } | null> {
  return runWithDatabaseSpace(space, async (db) => {
    const providers = await aiProviderRepository.listProviders(db);
    for (const provider of providers) {
      if (!provider.defaultEmbeddingModelId) {
        continue;
      }
      const model = await aiProviderRepository.findModel(db, provider.id, provider.defaultEmbeddingModelId);
      if (model?.supportsEmbedding) {
        return { providerId: provider.id, modelId: model.modelId };
      }
    }
    return null;
  });
}

export async function generateQueryEmbedding(input: {
  space: PixorySpace;
  text: string;
  providerId?: string | null;
  modelId?: string | null;
}): Promise<{ providerId: string; modelId: string; vector: number[] } | null> {
  const configured = input.providerId && input.modelId
    ? { providerId: input.providerId, modelId: input.modelId }
    : await getEmbeddingProviderForSpace(input.space);
  if (!configured) {
    return null;
  }
  const provider = await runWithDatabaseSpace(input.space, (db) => aiProviderRepository.findProviderById(db, configured.providerId));
  const apiKey = provider ? await getProviderApiKey(provider.id) : null;
  if (!provider || !apiKey) {
    return null;
  }
  try {
    const vector = await getAdapterForProvider(provider).embedText({
      apiKey,
      baseUrl: provider.baseUrl ?? '',
      modelId: configured.modelId,
      text: input.text,
    });
    return vector.length > 0 ? { ...configured, vector } : null;
  } catch {
    return null;
  }
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
