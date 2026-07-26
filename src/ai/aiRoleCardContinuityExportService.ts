import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { SQLiteDatabase } from 'expo-sqlite';

import { aiRoleCardRepository, aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type { AiBranchScope } from '../database/repositories/aiThreadRepository';
import { copyFileToSafWithProgress } from '../native/pixoryMediaModule';
import { buildRoleContinuityMarkdown, sanitizeRoleContinuityFileName } from './aiRoleCardContinuityExport';
import { buildSillyTavernRoleCardPngBase64 } from './sillyTavernRoleCardExporter';
import { buildNativeMemoryPackage } from './memory/nativeMemoryPackage';
import { migrateLegacyMemoriesToV1 } from './memory/memoryMigrationService';

export interface ExportRoleContinuityPackageInput {
  space: PixorySpace;
  roleCardId: string;
  threadId?: string | null;
  branchScopes?: AiBranchScope[];
  destinationDirUri?: string | null;
  includeMarkdown?: boolean;
}

export interface ExportRoleContinuityPackageResult {
  destinationDirUri: string;
  pngFileName: string;
  markdownFileName: string | null;
  packageFileName: string;
  copiedFileCount: number;
}

export async function getExportableRoleCardIdForThread(space: PixorySpace, threadId: string): Promise<string | null> {
  return runWithDatabaseSpace(space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, threadId);
    return thread?.space === space ? thread.roleCardId : null;
  });
}

const EXPORT_DIR = `${FileSystem.documentDirectory ?? ''}exports/role-cards/`;
const MEMORY_EXPORT_PAGE_SIZE = 200;

async function ensureExportDir(): Promise<void> {
  if (!FileSystem.documentDirectory) {
    throw new Error('当前设备不支持文件导出目录。');
  }
  await FileSystem.makeDirectoryAsync(EXPORT_DIR, { intermediates: true });
}

async function writeLocalBase64File(fileName: string, base64: string): Promise<string> {
  await ensureExportDir();
  const uri = `${EXPORT_DIR}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}

async function writeLocalTextFile(fileName: string, text: string): Promise<string> {
  await ensureExportDir();
  const uri = `${EXPORT_DIR}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
  return uri;
}

async function readExportAvatarBase64(avatarUri: string | null | undefined): Promise<string | null> {
  if (!avatarUri) {
    return null;
  }
  try {
    const result = await manipulateAsync(
      avatarUri,
      [],
      { base64: true, compress: 1, format: SaveFormat.PNG }
    );
    return result.base64 ?? null;
  } catch {
    return null;
  }
}

async function requestDestinationDir(initialDirectoryUri?: string | null): Promise<string> {
  const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialDirectoryUri ?? null);
  if (!permissions.granted) {
    throw new Error('未选择角色卡导出目录。');
  }
  return permissions.directoryUri;
}

async function resolveExportBranchScopes(
  db: SQLiteDatabase,
  thread: { currentBranchRootMessageId?: string | null; currentBranchVersionIndex?: number | null } | null,
  explicitBranchScopes?: AiBranchScope[]
): Promise<AiBranchScope[]> {
  if (explicitBranchScopes) {
    return explicitBranchScopes;
  }
  if (thread?.currentBranchRootMessageId && thread.currentBranchVersionIndex != null) {
    return aiThreadRepository.resolveBranchLineage(db, thread.currentBranchRootMessageId, thread.currentBranchVersionIndex);
  }
  return [];
}

export async function exportRoleContinuityPackage(input: ExportRoleContinuityPackageInput): Promise<ExportRoleContinuityPackageResult> {
  const includeMarkdown = input.includeMarkdown !== false;
  await migrateLegacyMemoriesToV1(input.space);
  const snapshot = await runWithDatabaseSpace(input.space, async (db) => {
    const roleCard = await aiRoleCardRepository.findById(db, input.roleCardId);
    if (!roleCard || roleCard.space !== input.space || roleCard.archivedAt) {
      throw new Error('角色卡不存在或已删除。');
    }
    const thread = input.threadId ? await aiThreadRepository.findThreadById(db, input.threadId) : null;
    if (thread && (thread.space !== input.space || thread.roleCardId !== roleCard.id)) {
      throw new Error('当前线程不属于该角色卡。');
    }
    const resolvedBranchScopes = await resolveExportBranchScopes(db, thread, input.branchScopes);
    const memories = [];
    if (thread) {
      for (let offset = 0; ; offset += MEMORY_EXPORT_PAGE_SIZE) {
        const page = await aiThreadRepository.listMemoryBoardItems(db, {
          boundIpId: thread.boundIpId,
          boundKnowledgeBaseId: thread.boundKnowledgeBaseId,
          branchScopes: resolvedBranchScopes,
          limit: MEMORY_EXPORT_PAGE_SIZE,
          offset,
          roleCardId: roleCard.id,
          space: input.space,
          status: 'active',
          threadId: thread.id,
        });
        memories.push(...page);
        if (page.length < MEMORY_EXPORT_PAGE_SIZE) {
          break;
        }
      }
    }
    const messages = thread
      ? await aiThreadRepository.listMessages(db, thread.id, undefined, resolvedBranchScopes)
      : [];
    const nativePackage = await buildNativeMemoryPackage(db, {
      branchScopes: resolvedBranchScopes,
      space: input.space,
      thread,
    });
    return { nativePackage, roleCard, thread, memories, messages, resolvedBranchScopes };
  });
  const resolvedBranchScopes = snapshot.resolvedBranchScopes;
  const destinationDirUri = input.destinationDirUri ?? await requestDestinationDir();
  const baseName = `${sanitizeRoleContinuityFileName(snapshot.roleCard.name)}-Pixory`;
  const pngFileName = `${baseName}.png`;
  const pngUri = await writeLocalBase64File(
    pngFileName,
    buildSillyTavernRoleCardPngBase64({
      basePngBase64: await readExportAvatarBase64(snapshot.roleCard.avatarEnabled ? snapshot.roleCard.avatarUri : null),
      card: snapshot.roleCard,
    })
  );
  await copyFileToSafWithProgress(pngUri, destinationDirUri, pngFileName, 'image/png', `role-card-png-${Date.now()}`);

  let copiedFileCount = 1;
  const packageFileName = `${baseName}-MemoryPackage-v2.json`;
  const packageUri = await writeLocalTextFile(packageFileName, JSON.stringify(snapshot.nativePackage, null, 2));
  await copyFileToSafWithProgress(packageUri, destinationDirUri, packageFileName, 'application/json', `memory-package-v2-${Date.now()}`);
  copiedFileCount += 1;
  let markdownFileName: string | null = null;
  if (includeMarkdown) {
    markdownFileName = `${baseName}-Continuity.md`;
    const markdown = buildRoleContinuityMarkdown({
      exportedAt: new Date().toISOString(),
      memories: snapshot.memories,
      messages: snapshot.messages,
      roleCard: snapshot.roleCard,
      space: input.space,
      thread: snapshot.thread,
    });
    const markdownUri = await writeLocalTextFile(markdownFileName, markdown);
    await copyFileToSafWithProgress(markdownUri, destinationDirUri, markdownFileName, 'text/markdown', `role-card-md-${Date.now()}`);
    copiedFileCount += 1;
  }

  return {
    copiedFileCount,
    destinationDirUri,
    markdownFileName,
    packageFileName,
    pngFileName,
  };
}
