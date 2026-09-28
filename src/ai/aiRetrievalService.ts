import { ipRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type { AiCitationSourceType, AiDocumentOwnerType } from './types';
import { generateQueryEmbedding, tryEmbeddingRetrieval } from './aiEmbeddingService';

export const DEFAULT_RETRIEVAL_LIMIT = 6;
const OWNER_EMBEDDING_AVAILABILITY_CACHE_MAX = 160;
const OWNER_EMBEDDING_AVAILABILITY_TTL_MS = 5 * 60 * 1000;
const QUERY_EMBEDDING_TIMEOUT_MS = 250;
export type RetrievalMode = 'skipped' | 'keyword' | 'hybrid';
export type RetrievalTier = 'keyword' | 'full';

export interface RetrievedSnippet {
  chunkId: string;
  sourceType?: AiCitationSourceType;
  sourceId?: string;
  label: string;
  text: string;
  locator: Record<string, unknown>;
  score: number;
  documentVersion?: string | null;
}

interface GroupNameRow {
  name: string;
  type: string;
}

interface TagNameRow {
  name: string;
  count: number;
}

interface ImageNoteRow {
  id: number;
  originalFilename: string;
  note: string | null;
  isFavorite: number;
  createdAt: string;
  updatedAt: string;
}

interface ImportBatchRow {
  name: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  createdAt: string;
  completedAt: string | null;
}

export interface RetrieveForThreadInput {
  space: PixorySpace;
  ownerType: AiDocumentOwnerType;
  ownerId: string;
  query: string;
  includeDocumentChunks?: boolean;
  limit?: number;
  embeddingProviderId?: string | null;
  embeddingModelId?: string | null;
  queryVector?: number[] | null;
  tier?: RetrievalTier;
}

interface ChunkSearchRow {
  id: string;
  documentId: string;
  text: string;
  normalizedText: string;
  sourceLabel: string;
  locatorJson: string;
  documentVersion: string | null;
}

interface OwnerEmbeddingAvailabilityRow {
  chunkId: string;
}

const ownerEmbeddingAvailabilityCache = new Map<string, { expiresAt: number; hasAny: boolean }>();

function normalizeQuery(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function ownerEmbeddingAvailabilityCacheKey(input: RetrieveForThreadInput): string {
  return [
    input.space,
    input.ownerType,
    input.ownerId,
    input.embeddingProviderId ?? '',
    input.embeddingModelId ?? '',
  ].join('|');
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<{ timedOut: boolean; value: T }> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise.then((value) => ({ timedOut: false, value })),
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallbackValue), timeoutMs);
      }).then((value) => ({ timedOut: true, value })),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function rememberOwnerEmbeddingAvailability(key: string, hasAny: boolean): void {
  ownerEmbeddingAvailabilityCache.set(key, {
    expiresAt: Date.now() + OWNER_EMBEDDING_AVAILABILITY_TTL_MS,
    hasAny,
  });
  if (ownerEmbeddingAvailabilityCache.size <= OWNER_EMBEDDING_AVAILABILITY_CACHE_MAX) {
    return;
  }
  const oldestKey = ownerEmbeddingAvailabilityCache.keys().next().value;
  if (typeof oldestKey === 'string') {
    ownerEmbeddingAvailabilityCache.delete(oldestKey);
  }
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

function truncateText(value: string, maxLength = 900): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
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
      `SELECT ai_chunks.id, ai_chunks.documentId, ai_chunks.text, ai_chunks.normalizedText,
              ai_chunks.sourceLabel, ai_chunks.locatorJson, ai_documents.updatedAt AS documentVersion
       FROM ai_chunks
       INNER JOIN ai_documents ON ai_documents.id = ai_chunks.documentId
       WHERE ai_chunks.space = ?
         AND ai_chunks.ownerType = ?
         AND ai_chunks.ownerId = ?
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
        sourceType: 'document_chunk' as const,
        sourceId: row.documentId,
        label: row.sourceLabel,
        text: row.text,
        locator: { ...parseLocator(row.locatorJson), chunkId: row.id },
        score: keywordScore(row, normalizedQuery, likeTerms),
        documentVersion: row.documentVersion,
      }))
      .filter((snippet) => snippet.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, input.limit ?? DEFAULT_RETRIEVAL_LIMIT);
  });
}

async function loadChunkSnippetsByIds(
  input: RetrieveForThreadInput,
  vectorScores: Array<{ chunkId: string; score: number }>
): Promise<RetrievedSnippet[]> {
  if (vectorScores.length === 0) {
    return [];
  }
  const scoreByChunkId = new Map(vectorScores.map((item) => [item.chunkId, item.score]));
  const chunkIds = vectorScores.map((item) => item.chunkId);

  return runWithDatabaseSpace(input.space, async (db) => {
    const rows = await db.getAllAsync<ChunkSearchRow>(
      `SELECT ai_chunks.id, ai_chunks.documentId, ai_chunks.text, ai_chunks.normalizedText,
              ai_chunks.sourceLabel, ai_chunks.locatorJson, ai_documents.updatedAt AS documentVersion
       FROM ai_chunks
       INNER JOIN ai_documents ON ai_documents.id = ai_chunks.documentId
       WHERE ai_chunks.space = ?
         AND ai_chunks.ownerType = ?
         AND ai_chunks.ownerId = ?
         AND ai_chunks.id IN (${chunkIds.map(() => '?').join(', ')})`,
      input.space,
      input.ownerType,
      input.ownerId,
      ...chunkIds
    );

    return rows
      .map((row) => ({
        chunkId: row.id,
        sourceType: 'document_chunk' as const,
        sourceId: row.documentId,
        label: row.sourceLabel,
        text: row.text,
        locator: { ...parseLocator(row.locatorJson), chunkId: row.id },
        score: scoreByChunkId.get(row.id) ?? 0,
        documentVersion: row.documentVersion,
      }))
      .sort((left, right) => right.score - left.score);
  });
}

async function ownerPreviewSearch(input: RetrieveForThreadInput): Promise<RetrievedSnippet[]> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const rows = await db.getAllAsync<ChunkSearchRow>(
      `SELECT ai_chunks.id, ai_chunks.documentId, ai_chunks.text, ai_chunks.normalizedText,
              ai_chunks.sourceLabel, ai_chunks.locatorJson, ai_documents.updatedAt AS documentVersion
       FROM ai_chunks
       INNER JOIN ai_documents ON ai_documents.id = ai_chunks.documentId
       WHERE ai_chunks.space = ?
         AND ai_chunks.ownerType = ?
         AND ai_chunks.ownerId = ?
       ORDER BY sourceLabel ASC, chunkIndex ASC
       LIMIT ?`,
      input.space,
      input.ownerType,
      input.ownerId,
      input.limit ?? DEFAULT_RETRIEVAL_LIMIT
    );

    return rows.map((row, index) => ({
      chunkId: row.id,
      sourceType: 'document_chunk' as const,
      sourceId: row.documentId,
      label: row.sourceLabel,
      text: truncateText(row.text, 700),
      locator: { ...parseLocator(row.locatorJson), chunkId: row.id },
      score: 0.5 - index * 0.01,
      documentVersion: row.documentVersion,
    }));
  });
}

async function hasAnyEmbeddingsForOwner(input: RetrieveForThreadInput): Promise<boolean> {
  const configured = input.embeddingProviderId && input.embeddingModelId
    ? { providerId: input.embeddingProviderId, modelId: input.embeddingModelId }
    : null;
  if (input.queryVector?.length) {
    return true;
  }
  const cacheKey = ownerEmbeddingAvailabilityCacheKey(input);
  const cached = ownerEmbeddingAvailabilityCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.hasAny;
  }

  const hasAny = await runWithDatabaseSpace(input.space, async (db) => {
    const rows = configured
      ? await db.getAllAsync<OwnerEmbeddingAvailabilityRow>(
          `SELECT ai_embeddings.chunkId
           FROM ai_embeddings
           INNER JOIN ai_chunks ON ai_chunks.id = ai_embeddings.chunkId
           WHERE ai_chunks.space = ?
             AND ai_chunks.ownerType = ?
             AND ai_chunks.ownerId = ?
             AND ai_embeddings.providerId = ?
             AND ai_embeddings.modelId = ?
           LIMIT 1`,
          input.space,
          input.ownerType,
          input.ownerId,
          configured.providerId,
          configured.modelId
        )
      : await db.getAllAsync<OwnerEmbeddingAvailabilityRow>(
          `SELECT ai_embeddings.chunkId
           FROM ai_embeddings
           INNER JOIN ai_chunks ON ai_chunks.id = ai_embeddings.chunkId
           WHERE ai_chunks.space = ?
             AND ai_chunks.ownerType = ?
             AND ai_chunks.ownerId = ?
           LIMIT 1`,
          input.space,
          input.ownerType,
          input.ownerId
        );
    return rows.length > 0;
  });
  rememberOwnerEmbeddingAvailability(cacheKey, hasAny);
  return hasAny;
}

async function collectIpContextSnippets(input: RetrieveForThreadInput): Promise<RetrievedSnippet[]> {
  if (input.ownerType !== 'ip') {
    return [];
  }

  const ipId = Number(input.ownerId);
  if (!Number.isFinite(ipId)) {
    return [];
  }

  return runWithDatabaseSpace(input.space, async (db) => {
    const ip = await ipRepository.findDetailById(db, ipId);
    if (!ip) {
      return [];
    }

    const [groups, tags, notedImages, filenameRows, importBatches] = await Promise.all([
      db.getAllAsync<GroupNameRow>('SELECT name, type FROM groups WHERE ipId = ? ORDER BY sortOrder ASC, updatedAt DESC LIMIT 24', ipId),
      db.getAllAsync<TagNameRow>(
        `SELECT tags.name, COUNT(*) AS count
         FROM tags
         INNER JOIN image_tags ON image_tags.tagId = tags.id
         INNER JOIN image_assets ON image_assets.id = image_tags.imageAssetId
         WHERE image_assets.ipId = ? AND image_assets.deletedAt IS NULL
         GROUP BY tags.id
         ORDER BY count DESC, tags.name ASC
         LIMIT 32`,
        ipId
      ),
      db.getAllAsync<ImageNoteRow>(
        `SELECT id, originalFilename, note, isFavorite, createdAt, updatedAt
         FROM image_assets
         WHERE ipId = ? AND deletedAt IS NULL AND COALESCE(note, '') != ''
         ORDER BY updatedAt DESC
         LIMIT 16`,
        ipId
      ),
      db.getAllAsync<{ originalFilename: string }>(
        `SELECT originalFilename
         FROM image_assets
         WHERE ipId = ? AND deletedAt IS NULL
         ORDER BY updatedAt DESC, id DESC
         LIMIT 32`,
        ipId
      ),
      db.getAllAsync<ImportBatchRow>(
        `SELECT name, totalCount, successCount, failedCount, createdAt, completedAt
         FROM import_batches
         WHERE ipId = ?
         ORDER BY createdAt DESC
         LIMIT 8`,
        ipId
      ),
    ]);

    const snippets: RetrievedSnippet[] = [
      {
        chunkId: `ip:${ip.id}:summary`,
        sourceType: 'ip_metadata',
        sourceId: String(ip.id),
        label: `${ip.name} IP · 基础资料`,
        text: truncateText(
          [
            `IP 名称：${ip.name}`,
            ip.description ? `说明：${ip.description}` : null,
            `资产统计：图片 ${ip.imageCount}，视频 ${ip.videoCount}，分组 ${ip.groupCount}，标签 ${ip.tagCount}`,
            `收藏状态：${ip.isFavorite ? '已收藏' : '未收藏'}`,
            `最近更新时间：${ip.recentUpdatedAt}`,
          ].filter(Boolean).join('\n')
        ),
        locator: { ipId: ip.id, kind: 'summary' },
        score: 10,
        documentVersion: ip.recentUpdatedAt,
      },
    ];

    if (groups.length > 0) {
      snippets.push({
        chunkId: `ip:${ip.id}:groups`,
        sourceType: 'ip_metadata',
        sourceId: String(ip.id),
        label: `${ip.name} IP · 分组`,
        text: truncateText(groups.map((group) => `${group.name}（${group.type}）`).join(' / ')),
        locator: { ipId: ip.id, kind: 'groups' },
        score: 8,
        documentVersion: ip.recentUpdatedAt,
      });
    }

    if (tags.length > 0) {
      snippets.push({
        chunkId: `ip:${ip.id}:tags`,
        sourceType: 'ip_metadata',
        sourceId: String(ip.id),
        label: `${ip.name} IP · 标签：${tags.slice(0, 6).map((tag) => tag.name).join(' / ')}`,
        text: truncateText(tags.map((tag) => `${tag.name} x${tag.count}`).join(' / ')),
        locator: { ipId: ip.id, kind: 'tags' },
        score: 9,
        documentVersion: ip.recentUpdatedAt,
      });
    }

    for (const image of notedImages) {
      snippets.push({
        chunkId: `ip:${ip.id}:image-note:${image.id}`,
        sourceType: 'image_note',
        sourceId: String(image.id),
        label: `${ip.name} IP · 图片备注：${image.originalFilename}`,
        text: truncateText([`文件名：${image.originalFilename}`, image.note ? `备注：${image.note}` : null, image.isFavorite ? '收藏：是' : null].filter(Boolean).join('\n')),
        locator: { ipId: ip.id, imageId: image.id, kind: 'image_note' },
        score: 7,
        documentVersion: image.updatedAt,
      });
    }

    if (filenameRows.length > 0) {
      snippets.push({
        chunkId: `ip:${ip.id}:filenames`,
        sourceType: 'ip_metadata',
        sourceId: String(ip.id),
        label: `${ip.name} IP · 文件名样本`,
        text: truncateText(filenameRows.map((row) => row.originalFilename).join('\n')),
        locator: { ipId: ip.id, kind: 'filenames' },
        score: 5,
        documentVersion: ip.recentUpdatedAt,
      });
    }

    if (importBatches.length > 0) {
      snippets.push({
        chunkId: `ip:${ip.id}:imports`,
        sourceType: 'ip_metadata',
        sourceId: String(ip.id),
        label: `${ip.name} IP · 导入记录`,
        text: truncateText(
          importBatches
            .map((batch) => `${batch.name}：${batch.successCount}/${batch.totalCount} 成功，失败 ${batch.failedCount}，创建 ${batch.createdAt}${batch.completedAt ? `，完成 ${batch.completedAt}` : ''}`)
            .join('\n')
        ),
        locator: { ipId: ip.id, kind: 'import_batches' },
        score: 4,
        documentVersion: ip.recentUpdatedAt,
      });
    }

    return snippets.slice(0, input.limit ?? DEFAULT_RETRIEVAL_LIMIT);
  });
}

export async function loadCurrentIpCitationSnippet(input: {
  chunkId: string;
  ipId: number;
  space: PixorySpace;
}): Promise<RetrievedSnippet | null> {
  const snippets = await collectIpContextSnippets({
    includeDocumentChunks: false,
    limit: 64,
    ownerId: String(input.ipId),
    ownerType: 'ip',
    query: '',
    space: input.space,
  });
  return snippets.find((snippet) => snippet.chunkId === input.chunkId) ?? null;
}

export async function retrieveForThread(input: RetrieveForThreadInput): Promise<{
  mode: RetrievalMode;
  partial: boolean;
  snippets: RetrievedSnippet[];
  timedOut: boolean;
}> {
  const limit = input.limit ?? DEFAULT_RETRIEVAL_LIMIT;
  const includeDocumentChunks = input.includeDocumentChunks !== false;
  const [keyword, ipContext] = await Promise.all([
    includeDocumentChunks ? keywordSearch({ ...input, limit }) : Promise.resolve([]),
    collectIpContextSnippets({ ...input, limit }),
  ]);
  const directSnippets = [...ipContext, ...keyword].slice(0, limit);
  if (!includeDocumentChunks) {
    return { mode: 'keyword', partial: false, snippets: directSnippets, timedOut: false };
  }
  if (input.tier === 'keyword') {
    return { mode: 'keyword', partial: directSnippets.length === 0, snippets: directSnippets, timedOut: false };
  }
  if (directSnippets.length >= limit) {
    return { mode: 'keyword', partial: false, snippets: directSnippets, timedOut: false };
  }

  const canTryEmbedding = await hasAnyEmbeddingsForOwner(input);
  const queryEmbeddingResult = input.queryVector?.length
    ? { providerId: input.embeddingProviderId ?? null, modelId: input.embeddingModelId ?? null, vector: input.queryVector }
    : canTryEmbedding
      ? await withTimeout(
          generateQueryEmbedding({
            modelId: input.embeddingModelId,
            providerId: input.embeddingProviderId,
            space: input.space,
            text: input.query,
          }),
          QUERY_EMBEDDING_TIMEOUT_MS,
          null
        )
      : null;
  const queryEmbedding = queryEmbeddingResult && 'value' in queryEmbeddingResult ? queryEmbeddingResult.value : queryEmbeddingResult;
  const timedOut = Boolean(queryEmbeddingResult && 'timedOut' in queryEmbeddingResult && queryEmbeddingResult.timedOut);
  const vectorScores = await tryEmbeddingRetrieval({
    space: input.space,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    providerId: queryEmbedding?.providerId,
    modelId: queryEmbedding?.modelId,
    queryVector: queryEmbedding?.vector,
    limit,
  });

  if (vectorScores.length === 0) {
    const fallbackSnippets = directSnippets.length === 0 ? await ownerPreviewSearch({ ...input, limit }) : [];
    return { mode: 'keyword', partial: timedOut, snippets: [...directSnippets, ...fallbackSnippets].slice(0, limit), timedOut };
  }

  const scoreByChunkId = new Map(vectorScores.map((item) => [item.chunkId, item.score]));
  const vectorSnippets = await loadChunkSnippetsByIds(input, vectorScores);
  const mergedByChunkId = new Map<string, RetrievedSnippet>();
  for (const snippet of [...ipContext, ...vectorSnippets, ...keyword]) {
    const existing = mergedByChunkId.get(snippet.chunkId);
    if (!existing || snippet.score > existing.score) {
      mergedByChunkId.set(snippet.chunkId, snippet);
    }
  }
  const merged = [...mergedByChunkId.values()]
    .map((snippet) => ({
      ...snippet,
      score: snippet.score + (scoreByChunkId.get(snippet.chunkId) ?? 0) * 10,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return { mode: 'hybrid', partial: timedOut, snippets: merged, timedOut };
}
