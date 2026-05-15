import { ipRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type { AiCitationSourceType, AiDocumentOwnerType } from './types';
import { generateQueryEmbedding, tryEmbeddingRetrieval } from './aiEmbeddingService';

export const DEFAULT_RETRIEVAL_LIMIT = 6;
export type RetrievalMode = 'keyword' | 'hybrid';

export interface RetrievedSnippet {
  chunkId: string;
  sourceType?: AiCitationSourceType;
  sourceId?: string;
  label: string;
  text: string;
  locator: Record<string, unknown>;
  score: number;
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
  limit?: number;
  embeddingProviderId?: string | null;
  embeddingModelId?: string | null;
  queryVector?: number[] | null;
}

interface ChunkSearchRow {
  id: string;
  documentId: string;
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
      `SELECT id, documentId, text, normalizedText, sourceLabel, locatorJson
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
        sourceType: 'document_chunk' as const,
        sourceId: row.documentId,
        label: row.sourceLabel,
        text: row.text,
        locator: { ...parseLocator(row.locatorJson), chunkId: row.id },
        score: keywordScore(row, normalizedQuery, likeTerms),
      }))
      .filter((snippet) => snippet.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, input.limit ?? DEFAULT_RETRIEVAL_LIMIT);
  });
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
      });
    }

    return snippets.slice(0, input.limit ?? DEFAULT_RETRIEVAL_LIMIT);
  });
}

export async function retrieveForThread(input: RetrieveForThreadInput): Promise<{
  mode: RetrievalMode;
  snippets: RetrievedSnippet[];
}> {
  const limit = input.limit ?? DEFAULT_RETRIEVAL_LIMIT;
  const keyword = await keywordSearch({ ...input, limit });
  const ipContext = await collectIpContextSnippets({ ...input, limit });
  const queryEmbedding = input.queryVector?.length
    ? { providerId: input.embeddingProviderId ?? null, modelId: input.embeddingModelId ?? null, vector: input.queryVector }
    : await generateQueryEmbedding({
        modelId: input.embeddingModelId,
        providerId: input.embeddingProviderId,
        space: input.space,
        text: input.query,
      });
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
    return { mode: 'keyword', snippets: [...ipContext, ...keyword].slice(0, limit) };
  }

  const scoreByChunkId = new Map(vectorScores.map((item) => [item.chunkId, item.score]));
  const merged = [...ipContext, ...keyword]
    .map((snippet) => ({
      ...snippet,
      score: snippet.score + (scoreByChunkId.get(snippet.chunkId) ?? 0) * 10,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return { mode: 'hybrid', snippets: merged };
}
