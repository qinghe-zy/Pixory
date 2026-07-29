import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type { PixorySpace } from '../database';
import { assertManagedManifestShape, isSafeBackupRelativePath } from './backupManifestProtocol';
import {
  copyLocalFile,
  ensureLocalDirectory,
  getAiDocumentsDir,
  getAiRoleAvatarsDir,
  joinStoragePath,
} from './fileStorageService';

export type ManagedBackupFileCategory =
  | 'asset_original'
  | 'asset_thumbnail'
  | 'asset_cover'
  | 'ai_document'
  | 'message_attachment'
  | 'role_avatar'
  | 'database';

export interface ManagedBackupFileEntry {
  logicalId: string;
  ownerType: 'image_asset' | 'ai_document' | 'message_attachment' | 'role_card' | 'database';
  ownerId: string;
  category: ManagedBackupFileCategory;
  relativePath: string;
  sha256: string;
  size: number;
  mimeType: string | null;
  originalUri: null;
  required: boolean;
  space: PixorySpace;
}

export interface ManagedBackupManifestV2 {
  manifestVersion: 2;
  databaseRelativePath: string;
  files: ManagedBackupFileEntry[];
}

export interface ManagedBackupValidationReport {
  checked: number;
  missingRequired: string[];
  missingOptional: string[];
  hashFailures: string[];
  sizeFailures: string[];
}

export interface StagedManagedAiFiles {
  uriByLogicalId: Map<string, string>;
  stagedDestinationUris: string[];
}

export interface ManagedDatabaseMergeReport {
  insertedRecords: number;
  preservedRecords: number;
  restoredTables: number;
  uriRewriteFailures: string[];
}

type Candidate = Omit<ManagedBackupFileEntry, 'relativePath' | 'sha256' | 'size' | 'originalUri'> & {
  sourceUri: string;
};

const HASH_CHUNK_BYTES = 256 * 1024;

function safeExtension(uri: string): string {
  const clean = uri.split(/[?#]/, 1)[0] ?? '';
  const match = /\.[A-Za-z0-9]{1,10}$/.exec(clean);
  return match?.[0].toLowerCase() ?? '.bin';
}

function mimeTypeForUri(uri: string, fallback?: string | null): string | null {
  if (fallback?.trim()) return fallback;
  const extension = safeExtension(uri);
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.pdf') return 'application/pdf';
  if (extension === '.txt') return 'text/plain';
  if (extension === '.md') return 'text/markdown';
  if (extension === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

export { isSafeBackupRelativePath } from './backupManifestProtocol';

export function resolveManagedBackupPath(backupDir: string, relativePath: string): string {
  if (!isSafeBackupRelativePath(relativePath)) {
    throw new Error(`备份清单包含不安全的相对路径：${relativePath}`);
  }
  return joinStoragePath(backupDir.endsWith('/') ? backupDir : `${backupDir}/`, relativePath);
}

export async function hashManagedFile(uri: string): Promise<{ sha256: string; size: number }> {
  const file = new File(uri);
  if (!file.exists) throw new Error(`备份文件不存在：${uri}`);
  const handle = file.open();
  const hasher = sha256.create();
  let size = 0;
  try {
    while (true) {
      const chunk = handle.readBytes(HASH_CHUNK_BYTES);
      if (chunk.length === 0) break;
      hasher.update(chunk);
      size += chunk.length;
    }
  } finally {
    handle.close();
  }
  return { sha256: bytesToHex(hasher.digest()), size };
}

async function collectCandidates(db: SQLiteDatabase, space: PixorySpace, ipId?: number): Promise<Candidate[]> {
  const imageRows = await db.getAllAsync<{
    id: number;
    ipId: number;
    originalFileUri: string;
    thumbnailFileUri: string | null;
    coverThumbnailFileUri: string | null;
    mimeType: string;
  }>(
    `SELECT id, ipId, originalFileUri, thumbnailFileUri, coverThumbnailFileUri, mimeType
       FROM image_assets
      WHERE (? IS NULL OR ipId = ?)`,
    ipId ?? null,
    ipId ?? null,
  );
  const candidates: Candidate[] = [];
  for (const image of imageRows) {
    candidates.push({
      logicalId: `image_asset:${image.id}:original`,
      ownerType: 'image_asset',
      ownerId: String(image.id),
      category: 'asset_original',
      sourceUri: image.originalFileUri,
      mimeType: mimeTypeForUri(image.originalFileUri, image.mimeType),
      required: true,
      space,
    });
    if (image.thumbnailFileUri) {
      candidates.push({
        logicalId: `image_asset:${image.id}:thumbnail`, ownerType: 'image_asset', ownerId: String(image.id),
        category: 'asset_thumbnail', sourceUri: image.thumbnailFileUri,
        mimeType: mimeTypeForUri(image.thumbnailFileUri, 'image/jpeg'), required: false, space,
      });
    }
    if (image.coverThumbnailFileUri && image.coverThumbnailFileUri !== image.thumbnailFileUri) {
      candidates.push({
        logicalId: `image_asset:${image.id}:cover`, ownerType: 'image_asset', ownerId: String(image.id),
        category: 'asset_cover', sourceUri: image.coverThumbnailFileUri,
        mimeType: mimeTypeForUri(image.coverThumbnailFileUri, 'image/jpeg'), required: false, space,
      });
    }
  }

  if (ipId != null) return candidates;

  const documents = await db.getAllAsync<{ id: string; localUri: string; mimeType: string | null }>(
    `SELECT id, localUri, mimeType FROM ai_documents WHERE space = ? AND localUri IS NOT NULL AND TRIM(localUri) <> ''`,
    space,
  );
  for (const document of documents) {
    candidates.push({
      logicalId: `ai_document:${document.id}`, ownerType: 'ai_document', ownerId: document.id,
      category: 'ai_document', sourceUri: document.localUri,
      mimeType: mimeTypeForUri(document.localUri, document.mimeType), required: true, space,
    });
  }

  const attachments = await db.getAllAsync<{ id: string; localUri: string; mimeType: string | null }>(
    `SELECT attachment.id, attachment.localUri, attachment.mimeType
       FROM ai_message_attachments attachment
       JOIN ai_threads thread ON thread.id = attachment.threadId
      WHERE thread.space = ?`,
    space,
  );
  for (const attachment of attachments) {
    candidates.push({
      logicalId: `message_attachment:${attachment.id}`, ownerType: 'message_attachment', ownerId: attachment.id,
      category: 'message_attachment', sourceUri: attachment.localUri,
      mimeType: mimeTypeForUri(attachment.localUri, attachment.mimeType), required: true, space,
    });
  }

  const roleCards = await db.getAllAsync<{ id: string; avatarUri: string }>(
    `SELECT id, avatarUri FROM ai_role_cards
      WHERE space = ? AND avatarEnabled = 1 AND avatarUri IS NOT NULL AND TRIM(avatarUri) <> ''`,
    space,
  );
  for (const roleCard of roleCards) {
    candidates.push({
      logicalId: `role_card:${roleCard.id}:avatar`, ownerType: 'role_card', ownerId: roleCard.id,
      category: 'role_avatar', sourceUri: roleCard.avatarUri,
      mimeType: mimeTypeForUri(roleCard.avatarUri, 'image/png'), required: true, space,
    });
  }
  return candidates;
}

export async function createManagedBackupManifestV2(input: {
  backupDir: string;
  databaseRelativePath: string;
  db: SQLiteDatabase;
  ipId?: number;
  space: PixorySpace;
  assertActive?: () => void;
}): Promise<ManagedBackupManifestV2> {
  const filesDir = `${joinStoragePath(input.backupDir, 'files')}/`;
  await ensureLocalDirectory(filesDir);
  const candidates = await collectCandidates(input.db, input.space, input.ipId);
  const files: ManagedBackupFileEntry[] = [];
  const relativePathByHash = new Map<string, string>();

  const databaseUri = resolveManagedBackupPath(input.backupDir, input.databaseRelativePath);
  const databaseDigest = await hashManagedFile(databaseUri);
  files.push({
    logicalId: 'database:main', ownerType: 'database', ownerId: 'main', category: 'database',
    relativePath: input.databaseRelativePath, sha256: databaseDigest.sha256, size: databaseDigest.size,
    mimeType: 'application/vnd.sqlite3', originalUri: null, required: true, space: input.space,
  });

  for (const candidate of candidates) {
    input.assertActive?.();
    const info = await FileSystem.getInfoAsync(candidate.sourceUri);
    if (!info.exists || info.isDirectory) {
      if (candidate.required) throw new Error(`备份失败，必需文件不可用：${candidate.logicalId}`);
      continue;
    }
    const digest = await hashManagedFile(candidate.sourceUri);
    const relativePath = relativePathByHash.get(digest.sha256) ?? `files/${digest.sha256}${safeExtension(candidate.sourceUri)}`;
    const destinationUri = resolveManagedBackupPath(input.backupDir, relativePath);
    if (!relativePathByHash.has(digest.sha256)) {
      const existing = await FileSystem.getInfoAsync(destinationUri);
      if (!existing.exists) await copyLocalFile(candidate.sourceUri, destinationUri);
      const copiedDigest = await hashManagedFile(destinationUri);
      if (copiedDigest.sha256 !== digest.sha256 || copiedDigest.size !== digest.size) {
        throw new Error(`备份文件校验失败：${candidate.logicalId}`);
      }
      relativePathByHash.set(digest.sha256, relativePath);
    }
    files.push({
      logicalId: candidate.logicalId,
      ownerType: candidate.ownerType,
      ownerId: candidate.ownerId,
      category: candidate.category,
      relativePath,
      sha256: digest.sha256,
      size: digest.size,
      mimeType: candidate.mimeType,
      originalUri: null,
      required: candidate.required,
      space: candidate.space,
    });
  }
  return { manifestVersion: 2, databaseRelativePath: input.databaseRelativePath, files };
}

export async function validateManagedBackupManifestV2(input: {
  backupDir: string;
  expectedSpace: PixorySpace;
  manifest: ManagedBackupManifestV2;
}): Promise<ManagedBackupValidationReport> {
  assertManagedManifestShape(input.manifest);
  const report: ManagedBackupValidationReport = {
    checked: 0, missingRequired: [], missingOptional: [], hashFailures: [], sizeFailures: [],
  };
  const verified = new Map<string, { sha256: string; size: number }>();
  for (const entry of input.manifest.files) {
    if (entry.space !== input.expectedSpace || !isSafeBackupRelativePath(entry.relativePath)) {
      throw new Error(`备份文件作用域或路径无效：${entry.logicalId}`);
    }
    const uri = resolveManagedBackupPath(input.backupDir, entry.relativePath);
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) {
      (entry.required ? report.missingRequired : report.missingOptional).push(entry.logicalId);
      continue;
    }
    let digest = verified.get(entry.relativePath);
    if (!digest) {
      digest = await hashManagedFile(uri);
      verified.set(entry.relativePath, digest);
    }
    report.checked += 1;
    if (digest.size !== entry.size) report.sizeFailures.push(entry.logicalId);
    if (digest.sha256 !== entry.sha256) report.hashFailures.push(entry.logicalId);
  }
  if (report.missingRequired.length || report.hashFailures.length || report.sizeFailures.length) {
    throw new Error(`备份完整性校验失败：缺失 ${report.missingRequired.length}，大小异常 ${report.sizeFailures.length}，哈希异常 ${report.hashFailures.length}`);
  }
  return report;
}

export async function stageManagedAiFiles(input: {
  backupDir: string;
  manifest: ManagedBackupManifestV2;
  space: PixorySpace;
}): Promise<StagedManagedAiFiles> {
  const uriByLogicalId = new Map<string, string>();
  const stagedDestinationUris: string[] = [];
  const copiedByHash = new Map<string, string>();
  for (const entry of input.manifest.files) {
    if (!['ai_document', 'message_attachment', 'role_avatar'].includes(entry.category)) continue;
    let destinationUri = copiedByHash.get(entry.sha256);
    if (!destinationUri) {
      const root = entry.category === 'role_avatar' ? getAiRoleAvatarsDir(input.space) : getAiDocumentsDir(input.space);
      await ensureLocalDirectory(root);
      destinationUri = joinStoragePath(root, `restored_${entry.sha256}${safeExtension(entry.relativePath)}`);
      const existing = await FileSystem.getInfoAsync(destinationUri);
      if (!existing.exists) {
        await copyLocalFile(resolveManagedBackupPath(input.backupDir, entry.relativePath), destinationUri);
        stagedDestinationUris.push(destinationUri);
      } else {
        const digest = await hashManagedFile(destinationUri);
        if (digest.sha256 !== entry.sha256 || digest.size !== entry.size) {
          throw new Error(`恢复目标存在不同内容：${entry.logicalId}`);
        }
      }
      copiedByHash.set(entry.sha256, destinationUri);
    }
    uriByLogicalId.set(entry.logicalId, destinationUri);
  }
  return { uriByLogicalId, stagedDestinationUris };
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function remapJsonIds(value: unknown, ipIdMap: Map<number, number>, imageIdMap: Map<number, number>): unknown {
  if (Array.isArray(value)) return value.map((item) => remapJsonIds(item, ipIdMap, imageIdMap));
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if ((key === 'ipId' || key === 'boundIpId') && typeof item === 'number') output[key] = ipIdMap.get(item) ?? item;
    else if ((key === 'imageId' || key === 'imageAssetId') && typeof item === 'number') output[key] = imageIdMap.get(item) ?? item;
    else output[key] = remapJsonIds(item, ipIdMap, imageIdMap);
  }
  return output;
}

function rewriteJsonColumn(value: unknown, ipIdMap: Map<number, number>, imageIdMap: Map<number, number>): unknown {
  if (typeof value !== 'string' || !value.trim()) return value;
  try {
    return JSON.stringify(remapJsonIds(JSON.parse(value), ipIdMap, imageIdMap));
  } catch {
    return value;
  }
}

function rewriteManagedRow(input: {
  imageIdMap: Map<number, number>;
  ipIdMap: Map<number, number>;
  row: Record<string, unknown>;
  space: PixorySpace;
  table: string;
  uriByLogicalId: Map<string, string>;
}): Record<string, unknown> | null {
  const row = { ...input.row };
  if (typeof row.space === 'string' && row.space !== input.space) return null;
  if ('apiKeyRef' in row) row.apiKeyRef = null;
  if ('sessionApiKeyRef' in row) row.sessionApiKeyRef = null;
  if (typeof row.boundIpId === 'number') row.boundIpId = input.ipIdMap.get(row.boundIpId) ?? row.boundIpId;
  if (typeof row.ipId === 'number') row.ipId = input.ipIdMap.get(row.ipId) ?? row.ipId;
  if (typeof row.imageAssetId === 'number') row.imageAssetId = input.imageIdMap.get(row.imageAssetId) ?? row.imageAssetId;
  if (row.ownerType === 'ip' && typeof row.ownerId === 'string') {
    const oldId = Number(row.ownerId);
    if (Number.isInteger(oldId)) row.ownerId = String(input.ipIdMap.get(oldId) ?? oldId);
  }
  if (input.table === 'ai_message_citations' && row.sourceType === 'image_note' && typeof row.sourceId === 'string') {
    const oldId = Number(row.sourceId);
    if (Number.isInteger(oldId)) row.sourceId = String(input.imageIdMap.get(oldId) ?? oldId);
  }
  if (input.table === 'ai_message_citations' && row.sourceType === 'ip_metadata' && typeof row.sourceId === 'string') {
    const oldId = Number(row.sourceId);
    if (Number.isInteger(oldId)) row.sourceId = String(input.ipIdMap.get(oldId) ?? oldId);
  }
  for (const column of Object.keys(row)) {
    if (column.endsWith('Json')) row[column] = rewriteJsonColumn(row[column], input.ipIdMap, input.imageIdMap);
  }
  if (input.table === 'ai_documents' && typeof row.id === 'string' && row.localUri) {
    const uri = input.uriByLogicalId.get(`ai_document:${row.id}`);
    if (!uri) throw new Error(`恢复文档缺少 URI 映射：${row.id}`);
    row.localUri = uri;
  }
  if (input.table === 'ai_message_attachments' && typeof row.id === 'string') {
    const uri = input.uriByLogicalId.get(`message_attachment:${row.id}`);
    if (!uri) throw new Error(`恢复附件缺少 URI 映射：${row.id}`);
    row.localUri = uri;
  }
  if (input.table === 'ai_role_cards' && typeof row.id === 'string' && row.avatarEnabled === 1 && row.avatarUri) {
    const uri = input.uriByLogicalId.get(`role_card:${row.id}:avatar`);
    if (!uri) throw new Error(`恢复角色头像缺少 URI 映射：${row.id}`);
    row.avatarUri = uri;
  }
  return row;
}

const RESTORE_TABLE_PRIORITY = [
  'ai_providers', 'ai_provider_models', 'ai_role_cards', 'ai_knowledge_bases', 'ai_threads',
  'ai_continuity_import_sessions', 'ai_messages', 'ai_documents', 'ai_chunks', 'ai_embeddings',
  'ai_message_attachments', 'ai_message_versions', 'ai_message_citations',
];

export async function mergeManagedDatabaseRecords(input: {
  imageIdMap: Map<number, number>;
  ipIdMap: Map<number, number>;
  sourceDatabaseUri: string;
  space: PixorySpace;
  targetDb: SQLiteDatabase;
  uriByLogicalId: Map<string, string>;
}): Promise<ManagedDatabaseMergeReport> {
  const slash = input.sourceDatabaseUri.lastIndexOf('/');
  const directory = input.sourceDatabaseUri.slice(0, slash + 1);
  const databaseName = input.sourceDatabaseUri.slice(slash + 1);
  const sourceDb = await openDatabaseAsync(databaseName, { useNewConnection: true }, directory);
  const report: ManagedDatabaseMergeReport = {
    insertedRecords: 0, preservedRecords: 0, restoredTables: 0, uriRewriteFailures: [],
  };
  try {
    const tables = await sourceDb.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND (name LIKE 'ai_%' OR name LIKE 'memory_%' OR name LIKE 'companion_%')`,
    );
    const targetTables = new Set((await input.targetDb.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table'`,
    )).map((row) => row.name));
    const ordered = tables.map((row) => row.name).filter((name) => targetTables.has(name)).sort((left, right) => {
      const leftPriority = RESTORE_TABLE_PRIORITY.indexOf(left);
      const rightPriority = RESTORE_TABLE_PRIORITY.indexOf(right);
      return (leftPriority < 0 ? RESTORE_TABLE_PRIORITY.length : leftPriority) -
        (rightPriority < 0 ? RESTORE_TABLE_PRIORITY.length : rightPriority);
    });
    await input.targetDb.execAsync('PRAGMA defer_foreign_keys = ON');
    for (const table of ordered) {
      const sourceColumns = await sourceDb.getAllAsync<{ name: string }>(`PRAGMA table_info(${quoteIdentifier(table)})`);
      const targetColumnSet = new Set((await input.targetDb.getAllAsync<{ name: string }>(
        `PRAGMA table_info(${quoteIdentifier(table)})`,
      )).map((column) => column.name));
      const columns = sourceColumns.map((column) => column.name).filter((name) => targetColumnSet.has(name));
      if (!columns.length) continue;
      const rows = await sourceDb.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${quoteIdentifier(table)}`);
      for (const sourceRow of rows) {
        let row: Record<string, unknown> | null;
        try {
          row = rewriteManagedRow({ ...input, row: sourceRow, table });
        } catch (error) {
          report.uriRewriteFailures.push(error instanceof Error ? error.message : String(error));
          continue;
        }
        if (!row) continue;
        const values = columns.map((column) => row?.[column] as string | number | null | Uint8Array);
        const result = await input.targetDb.runAsync(
          `INSERT OR IGNORE INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
          ...values,
        );
        if (result.changes > 0) report.insertedRecords += result.changes;
        else report.preservedRecords += 1;
      }
      report.restoredTables += 1;
    }
    if (report.uriRewriteFailures.length) {
      throw new Error(`AI 文件 URI 重写失败：${report.uriRewriteFailures.join('；')}`);
    }
    return report;
  } finally {
    await sourceDb.closeAsync();
  }
}
