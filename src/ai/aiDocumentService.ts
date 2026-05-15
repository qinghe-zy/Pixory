import * as FileSystem from 'expo-file-system/legacy';

import {
  aiKnowledgeRepository,
  groupRepository,
  imageRepository,
  importBatchRepository,
  ipRepository,
  runWithDatabaseSpace,
  tagRepository,
  type PixorySpace,
} from '../database';
import type {
  AiDocumentRecord,
  AiKnowledgeBaseRecord,
  CreateDocumentInput,
} from '../database/repositories/aiKnowledgeRepository';
import type { AiReadableDocument } from './readers/readerTypes';
import type {
  AiDocumentOwnerType,
  AiDocumentSourceType,
} from './types';
import {
  copyLocalFile,
  ensureAppDirectories,
  ensureLocalDirectory,
  getAiDocumentsDir,
  getAiIpDocumentsDir,
  getAiKnowledgeBaseDocumentsDir,
  getFileInfo,
  joinStoragePath,
  writeTextFile,
} from '../services/fileStorageService';
import { parseDocxText } from './documentParsers/docxParser';
import { parseMarkdownText } from './documentParsers/markdownParser';
import { parsePdfText } from './documentParsers/pdfParser';
import { parsePlainText, type ParsedDocumentText } from './documentParsers/textParser';
import { generateMissingEmbeddingsForDocument, getEmbeddingProviderForSpace } from './aiEmbeddingService';

export const MAX_CHUNK_CHARS = 1200;
export const CHUNK_OVERLAP_CHARS = 160;

export interface ImportManualTextMaterialInput {
  space: PixorySpace;
  ownerType: AiDocumentOwnerType;
  ownerId: string;
  title: string;
  text: string;
}

export interface ImportPickedDocumentInput {
  space: PixorySpace;
  ownerType: AiDocumentOwnerType;
  ownerId: string;
  sourceUri: string;
  fileName: string;
  mimeType?: string | null;
  fileSize?: number | null;
}

export interface ImportPickedDocumentsInput {
  space: PixorySpace;
  ownerType: AiDocumentOwnerType;
  ownerId: string;
  assets: Array<{
    sourceUri: string;
    fileName: string;
    mimeType?: string | null;
    fileSize?: number | null;
  }>;
}

export interface GenerateIpMaterialInput {
  space: PixorySpace;
  ipId: number;
  title?: string;
}

export interface ParseAndChunkDocumentInput {
  space: PixorySpace;
  documentId: string;
}

export interface CreateKnowledgeBaseMaterialInput {
  space: PixorySpace;
  name: string;
  category?: string;
  description?: string | null;
}

function createAiId(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${timestamp}_${random}`;
}

function getFileExtension(fileName: string): string {
  return /\.[A-Za-z0-9]+$/.exec(fileName.trim())?.[0].toLowerCase() ?? '.txt';
}

function getFileStem(fileName: string): string {
  const extension = getFileExtension(fileName);
  return fileName.endsWith(extension) ? fileName.slice(0, -extension.length) : fileName;
}

function sanitizeFileNamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'material';
}

function normalizeTextForSearch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function resolveSourceType(fileName: string, mimeType?: string | null): AiDocumentSourceType {
  const lowerName = fileName.toLowerCase();
  const lowerMime = (mimeType ?? '').toLowerCase();
  if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown') || lowerMime.includes('markdown')) {
    return 'markdown';
  }
  if (lowerName.endsWith('.pdf') || lowerMime.includes('pdf')) {
    return 'pdf';
  }
  if (lowerName.endsWith('.docx') || lowerMime.includes('wordprocessingml.document')) {
    return 'docx';
  }
  return 'txt';
}

function resolveOwnerDirectory(space: PixorySpace, ownerType: AiDocumentOwnerType, ownerId: string): string {
  if (ownerType === 'knowledge_base') {
    return getAiKnowledgeBaseDocumentsDir(space, ownerId);
  }
  if (ownerType === 'ip') {
    return getAiIpDocumentsDir(space, Number(ownerId));
  }
  return `${joinStoragePath(getAiDocumentsDir(space), `thread_${ownerId}`)}/`;
}

function chunkDocumentText(text: string): Array<{ text: string; tokenEstimate: number }> {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const chunks: Array<{ text: string; tokenEstimate: number }> = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + MAX_CHUNK_CHARS);
    const chunkText = normalized.slice(start, end).trim();
    if (chunkText) {
      chunks.push({
        text: chunkText,
        tokenEstimate: Math.ceil(chunkText.length / 4),
      });
    }
    if (end >= normalized.length) {
      break;
    }
    start = Math.max(0, end - CHUNK_OVERLAP_CHARS);
  }
  return chunks;
}

async function parseDocumentText(document: AiDocumentRecord, space: PixorySpace): Promise<ParsedDocumentText> {
  if (!document.localUri) {
    throw new Error('文档没有可读取的本地文件。');
  }

  if (document.sourceType === 'pdf') {
    return parsePdfText();
  }

  if (document.sourceType === 'docx') {
    return parseDocxText({ fileUri: document.localUri, space });
  }

  const content = await FileSystem.readAsStringAsync(document.localUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (document.sourceType === 'markdown') {
    return parseMarkdownText(content);
  }
  return parsePlainText(content);
}

async function createDocumentRecord(input: CreateDocumentInput): Promise<AiDocumentRecord> {
  return runWithDatabaseSpace(input.space, (db) => aiKnowledgeRepository.createDocument(db, input));
}

export async function createKnowledgeBase(input: CreateKnowledgeBaseMaterialInput): Promise<AiKnowledgeBaseRecord> {
  const name = input.name.trim();
  if (!name) {
    throw new Error('请输入知识库名称。');
  }
  return runWithDatabaseSpace(input.space, (db) =>
    aiKnowledgeRepository.createKnowledgeBase(db, {
      id: createAiId('aikb'),
      space: input.space,
      name,
      category: input.category?.trim() || 'general',
      description: input.description ?? null,
    })
  );
}

export async function listKnowledgeBases(space: PixorySpace): Promise<AiKnowledgeBaseRecord[]> {
  return runWithDatabaseSpace(space, (db) => aiKnowledgeRepository.listKnowledgeBases(db, space));
}

export async function importManualTextMaterial(input: ImportManualTextMaterialInput): Promise<AiDocumentRecord> {
  await ensureAppDirectories(input.space);
  const ownerDir = resolveOwnerDirectory(input.space, input.ownerType, input.ownerId);
  await ensureLocalDirectory(ownerDir);
  const fileName = `${sanitizeFileNamePart(input.title)}_${Date.now()}.txt`;
  const localUri = joinStoragePath(ownerDir, fileName);
  await writeTextFile(localUri, input.text);
  const document = await createDocumentRecord({
    id: createAiId('aidoc'),
    space: input.space,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    sourceType: 'manual_text',
    title: input.title,
    originalFilename: fileName,
    localUri,
    mimeType: 'text/plain',
    fileSize: input.text.length,
    parserStatus: 'pending',
    metadataJson: JSON.stringify({ importedAs: 'manual_text' }),
  });
  await parseAndChunkDocument({ space: input.space, documentId: document.id });
  return runWithDatabaseSpace(input.space, async (db) => {
    return (await aiKnowledgeRepository.findDocumentById(db, document.id)) ?? document;
  });
}

export async function importPickedDocument(input: ImportPickedDocumentInput): Promise<AiDocumentRecord> {
  await ensureAppDirectories(input.space);
  const ownerDir = resolveOwnerDirectory(input.space, input.ownerType, input.ownerId);
  await ensureLocalDirectory(ownerDir);
  const sourceType = resolveSourceType(input.fileName, input.mimeType);
  const extension = getFileExtension(input.fileName);
  const destinationName = `${sanitizeFileNamePart(getFileStem(input.fileName))}_${Date.now()}${extension}`;
  const localUri = joinStoragePath(ownerDir, destinationName);
  await copyLocalFile(input.sourceUri, localUri);
  const fileInfo = await getFileInfo(localUri);
  const document = await createDocumentRecord({
    id: createAiId('aidoc'),
    space: input.space,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    sourceType,
    title: getFileStem(input.fileName) || input.fileName,
    originalFilename: input.fileName,
    localUri,
    mimeType: input.mimeType ?? null,
    fileSize: input.fileSize ?? fileInfo.size,
    parserStatus: 'pending',
    metadataJson: JSON.stringify({ copiedToPrivateStorage: true }),
  });
  await parseAndChunkDocument({ space: input.space, documentId: document.id });
  return runWithDatabaseSpace(input.space, async (db) => {
    return (await aiKnowledgeRepository.findDocumentById(db, document.id)) ?? document;
  });
}

export async function importPickedDocuments(input: ImportPickedDocumentsInput): Promise<AiDocumentRecord[]> {
  const documents: AiDocumentRecord[] = [];
  for (const asset of input.assets) {
    documents.push(
      await importPickedDocument({
        fileName: asset.fileName,
        fileSize: asset.fileSize,
        mimeType: asset.mimeType,
        ownerId: input.ownerId,
        ownerType: input.ownerType,
        sourceUri: asset.sourceUri,
        space: input.space,
      })
    );
  }
  return documents;
}

export async function generateIpMaterial(input: GenerateIpMaterialInput): Promise<AiDocumentRecord> {
  const text = await runWithDatabaseSpace(input.space, async (db) => {
    const ip = await ipRepository.findDetailById(db, input.ipId);
    if (!ip) {
      throw new Error('未找到要生成资料的 IP。');
    }
    const groups = await groupRepository.findByIpId(db, input.ipId);
    const tags = await tagRepository.findUsageOverviewByIpId(db, input.ipId);
    const assets = await imageRepository.findByIpId(db, input.ipId, { includeDeleted: false, mediaType: 'all' });
    const batches = await importBatchRepository.findByIpId(db, input.ipId, 10);

    const assetLines = assets.slice(0, 80).map((asset) => {
      const note = asset.note ? `，备注：${asset.note}` : '';
      return `- ${asset.originalFilename}，${asset.mediaType}，${asset.isFavorite ? '收藏' : '未收藏'}${note}`;
    });

    return [
      `IP：${ip.name}`,
      ip.description ? `备注：${ip.description}` : '备注：无',
      `统计：图片 ${ip.imageCount}，视频 ${ip.videoCount}，分组 ${ip.groupCount}，标签 ${ip.tagCount}，总大小 ${ip.totalBytes} 字节。`,
      `分组：${groups.map((group) => `${group.name}(${group.type})`).join('、') || '无'}`,
      `标签：${tags.map((tag) => `${tag.name}(${tag.imageCount})`).join('、') || '无'}`,
      `最近导入：${batches.map((batch) => `${batch.name} ${batch.createdAt}`).join('；') || '无'}`,
      '素材文件：',
      assetLines.join('\n') || '无',
    ].join('\n\n');
  });

  await ensureAppDirectories(input.space);
  const ownerDir = resolveOwnerDirectory(input.space, 'ip', String(input.ipId));
  await ensureLocalDirectory(ownerDir);
  const title = input.title ?? 'IP 结构化资料';
  const fileName = `${sanitizeFileNamePart(title)}_${Date.now()}.txt`;
  const localUri = joinStoragePath(ownerDir, fileName);
  await writeTextFile(localUri, text);
  const document = await createDocumentRecord({
    id: createAiId('aidoc'),
    space: input.space,
    ownerType: 'ip',
    ownerId: String(input.ipId),
    sourceType: 'ip_generated',
    title,
    originalFilename: fileName,
    localUri,
    mimeType: 'text/plain',
    fileSize: text.length,
    parserStatus: 'pending',
    metadataJson: JSON.stringify({ importedAs: 'ip_generated' }),
  });
  await parseAndChunkDocument({ space: input.space, documentId: document.id });
  return runWithDatabaseSpace(input.space, async (db) => {
    return (await aiKnowledgeRepository.findDocumentById(db, document.id)) ?? document;
  });
}

export async function parseAndChunkDocument(input: ParseAndChunkDocumentInput): Promise<void> {
  const document = await runWithDatabaseSpace(input.space, async (db) => {
    const found = await aiKnowledgeRepository.findDocumentById(db, input.documentId);
    if (!found || found.space !== input.space) {
      throw new Error('未找到要解析的 AI 文档。');
    }
    await aiKnowledgeRepository.updateDocumentStatus(db, input.documentId, 'parsing', null);
    return found;
  });

  try {
    const parsed = await parseDocumentText(document, input.space);
    const noExtractableText = Boolean(parsed.metadata.noExtractableText);
    if (noExtractableText || !parsed.text.trim()) {
      const message =
        typeof parsed.metadata.message === 'string'
          ? parsed.metadata.message
          : '文档没有可检索的文本内容。';
      await runWithDatabaseSpace(input.space, (db) =>
        aiKnowledgeRepository.updateDocumentStatus(db, input.documentId, 'failed', message)
      );
      return;
    }

    const chunks = chunkDocumentText(parsed.text);
    await runWithDatabaseSpace(input.space, async (db) => {
      await aiKnowledgeRepository.updateDocumentStatus(db, input.documentId, 'parsed', null);
      await aiKnowledgeRepository.replaceChunks(
        db,
        input.documentId,
        chunks.map((chunk, index) => ({
          id: createAiId('aichunk'),
          space: input.space,
          ownerType: document.ownerType,
          ownerId: document.ownerId,
          chunkIndex: index,
          text: chunk.text,
          normalizedText: normalizeTextForSearch(chunk.text),
          sourceLabel: `${document.title} · 第 ${index + 1} 段`,
          locatorJson: JSON.stringify({ paragraph: index + 1 }),
          tokenEstimate: chunk.tokenEstimate,
        }))
      );
      await aiKnowledgeRepository.updateDocumentStatus(db, input.documentId, chunks.length > 0 ? 'searchable' : 'failed', chunks.length > 0 ? null : '文档没有可检索的文本内容。');
    });
    const embeddingConfig = await getEmbeddingProviderForSpace(input.space);
    if (embeddingConfig && chunks.length > 0) {
      await runWithDatabaseSpace(input.space, (db) => aiKnowledgeRepository.updateDocumentStatus(db, input.documentId, 'embedding_pending', null));
      const embeddingResult = await generateMissingEmbeddingsForDocument({
        documentId: input.documentId,
        modelId: embeddingConfig.modelId,
        providerId: embeddingConfig.providerId,
        space: input.space,
      });
      await runWithDatabaseSpace(input.space, (db) =>
        aiKnowledgeRepository.updateDocumentStatus(
          db,
          input.documentId,
          embeddingResult.generated > 0 ? 'embedding_ready' : 'searchable',
          embeddingResult.generated > 0 ? null : 'Embedding 生成失败，已保留关键词检索。'
        )
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '文档解析失败。';
    await runWithDatabaseSpace(input.space, (db) =>
      aiKnowledgeRepository.updateDocumentStatus(db, input.documentId, 'failed', message)
    );
  }
}

export async function listRecentMaterials(space: PixorySpace): Promise<AiDocumentRecord[]> {
  return runWithDatabaseSpace(space, (db) => aiKnowledgeRepository.listRecentDocuments(db, space, 6));
}

export async function listMaterials(input: {
  space: PixorySpace;
  knowledgeBaseId?: string | null;
}): Promise<AiDocumentRecord[]> {
  return runWithDatabaseSpace(input.space, (db) =>
    aiKnowledgeRepository.listDocuments(db, {
      ownerId: input.knowledgeBaseId ?? undefined,
      ownerType: input.knowledgeBaseId ? 'knowledge_base' : undefined,
      space: input.space,
    })
  );
}

export async function retryMaterialParsing(input: ParseAndChunkDocumentInput): Promise<void> {
  await parseAndChunkDocument(input);
}

export async function removeMaterial(input: ParseAndChunkDocumentInput): Promise<number> {
  return runWithDatabaseSpace(input.space, (db) => aiKnowledgeRepository.deleteDocument(db, input.documentId));
}

export async function removeMaterials(input: { space: PixorySpace; documentIds: string[] }): Promise<number> {
  const uniqueIds = Array.from(new Set(input.documentIds));
  if (uniqueIds.length === 0) {
    return 0;
  }
  return runWithDatabaseSpace(input.space, async (db) => {
    let count = 0;
    await db.withTransactionAsync(async () => {
      for (const documentId of uniqueIds) {
        count += await aiKnowledgeRepository.deleteDocument(db, documentId);
      }
    });
    return count;
  });
}

export async function readDocumentForReader(input: ParseAndChunkDocumentInput): Promise<AiReadableDocument> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const document = await aiKnowledgeRepository.findDocumentById(db, input.documentId);
    if (!document || document.space !== input.space) {
      throw new Error('未找到要阅读的 AI 文档。');
    }
    const chunks = await aiKnowledgeRepository.listChunksByDocumentId(db, input.documentId);
    return {
      document,
      chunks,
      text: chunks.map((chunk) => chunk.text).join('\n\n'),
    };
  });
}
