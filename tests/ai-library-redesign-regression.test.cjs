const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function extractBlockAfter(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing marker: ${marker}`);
  const start = source.indexOf('{', markerIndex);
  assert.notEqual(start, -1, `Missing block start after marker: ${marker}`);
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  assert.fail(`Missing block end after marker: ${marker}`);
}

function assertOccursBefore(source, left, right) {
  const leftIndex = source.indexOf(left);
  const rightIndex = source.indexOf(right);
  assert.notEqual(leftIndex, -1, `Missing expected left token: ${left}`);
  assert.notEqual(rightIndex, -1, `Missing expected right token: ${right}`);
  assert.ok(leftIndex < rightIndex, `Expected "${left}" before "${right}".`);
}

test('prompt assembly retrieves thread-owned materials for every chat type', () => {
  const chatService = read('src/ai/aiChatService.ts');
  const promptBuilder = read('src/ai/promptBuilder.ts');
  const promptBody = extractBlockAfter(chatService, 'async function buildPromptForThread');
  const normalPromptBody = extractBlockAfter(promptBuilder, 'export function buildNormalChatPrompt');
  const normalPromptSection = promptBuilder.slice(
    promptBuilder.indexOf('export function buildNormalChatPrompt'),
    promptBuilder.indexOf('export function buildMaterialBoundPrompt')
  );

  assert.match(promptBody, /retrieveForThread\(\{\s*space:\s*thread\.space,\s*ownerType:\s*'thread',\s*ownerId:\s*thread\.id,\s*query:\s*userMessage/s);
  assertOccursBefore(promptBody, "ownerType: 'thread'", "thread.contextType === 'normal'");
  assert.match(promptBody, /const\s+snippets\s*=\s*buildCitationRegistry\(\[\.\.\.threadMaterialSnippets, \.\.\.boundOwnerSnippets\]\)/);
  assert.match(promptBody, /buildNormalChatPrompt\(\{[\s\S]*materialSnippets:\s*citationRegistry\.map/);
  assert.match(normalPromptBody, /materialSnippets\?:\s*Array<\{ refId: string; label: string; text: string \}>/);
  assert.match(promptBuilder, /当前会话资料/);
  assert.match(normalPromptSection, /`用户当前问题：\\n\$\{input\.userMessage\}`/);
  assert.doesNotMatch(normalPromptSection, /\.join\('\\n\\n用户当前问题：\\n'\)/);
});

test('AI thread delete moves chats to recycle bin while permanent delete cleans thread-owned documents and files', () => {
  const chatService = read('src/ai/aiChatService.ts');
  const documentService = read('src/ai/aiDocumentService.ts');
  const knowledgeRepository = read('src/database/repositories/aiKnowledgeRepository.ts');
  const threadRepository = read('src/database/repositories/aiThreadRepository.ts');
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');
  const historyScreen = read('src/screens/AiHistoryScreen.tsx');
  const softDeleteBody = extractBlockAfter(chatService, 'export async function deleteAiThreads');
  const permanentDeleteBody = extractBlockAfter(chatService, 'export async function permanentlyDeleteAiThreads');
  const removeBody = documentService.slice(documentService.indexOf('async function deleteMaterialRecordAndCollectFile'));

  assert.match(softDeleteBody, /aiThreadRepository\.softDeleteThreads\(db, space, uniqueThreadIds/);
  assert.doesNotMatch(softDeleteBody, /removeMaterialsByOwner/);
  assert.doesNotMatch(softDeleteBody, /cleanupDeletedMaterialFiles/);
  assert.match(threadRepository, /async softDeleteThreads/);
  assert.match(threadRepository, /UPDATE ai_threads\s+SET archivedAt = \?, updatedAt = \?[\s\S]*WHERE id = \? AND space = \? AND archivedAt IS NULL/);
  assert.match(permanentDeleteBody, /const deletedFileUris: string\[\] = \[\]/);
  assert.match(permanentDeleteBody, /removeMaterialsByOwner\(\{\s*db,\s*deletedFileUris,\s*space,\s*ownerType:\s*'thread',\s*ownerIds:\s*uniqueThreadIds/s);
  assertOccursBefore(permanentDeleteBody, 'removeMaterialsByOwner', 'aiThreadRepository.deleteThreads');
  assertOccursBefore(permanentDeleteBody, 'aiThreadRepository.deleteThreads', 'cleanupDeletedMaterialFiles');
  assert.match(documentService, /export async function removeMaterialsByOwner/);
  assert.match(removeBody, /document\.localUri/);
  assert.match(removeBody, /isAppPrivateAiDocumentFile/);
  assert.match(documentService, /export async function cleanupDeletedMaterialFiles/);
  assert.match(documentService, /deleteLocalFile\(fileUri\)/);
  assert.match(knowledgeRepository, /DELETE FROM ai_message_citations\s+WHERE sourceType = 'document_chunk'/);
  assert.match(knowledgeRepository, /sourceId IN \(SELECT id FROM ai_chunks WHERE documentId = \?\)/);
  assert.doesNotMatch(knowledgeRepository, /for \(const chunkId of chunkIds\)/);
  assert.match(sessionConfig, /移入回收站/);
  assert.match(historyScreen, /回收站/);
});

test('knowledge-base deletion uses the same material file cleanup path', () => {
  const documentService = read('src/ai/aiDocumentService.ts');
  const deleteKbBody = documentService.slice(
    documentService.indexOf('export async function deleteKnowledgeBases'),
    documentService.indexOf('export async function importManualTextMaterial')
  );

  assert.match(deleteKbBody, /const deletedFileUris: string\[\] = \[\]/);
  assert.match(deleteKbBody, /removeMaterialsByOwner\(\{\s*db,\s*deletedFileUris,\s*ownerIds:\s*\[knowledgeBaseId\],\s*ownerType:\s*'knowledge_base'/s);
  assertOccursBefore(deleteKbBody, 'removeMaterialsByOwner', 'aiKnowledgeRepository.deleteKnowledgeBase');
  assertOccursBefore(deleteKbBody, 'aiKnowledgeRepository.deleteKnowledgeBase', 'cleanupDeletedMaterialFiles');
});

test('cross-space thread moves migrate thread-owned materials before deleting the source thread', () => {
  const chatService = read('src/ai/aiChatService.ts');
  const documentService = read('src/ai/aiDocumentService.ts');
  const moveBody = extractBlockAfter(chatService, 'export async function moveAiThreadsBetweenSpaces');

  assert.match(documentService, /export async function moveThreadOwnedMaterialsBetweenSpaces/);
  assert.match(moveBody, /moveThreadOwnedMaterialsBetweenSpaces\(\{\s*cleanupSource:\s*false/s);
  assertOccursBefore(moveBody, 'moveThreadOwnedMaterialsBetweenSpaces', 'aiThreadRepository.deleteThreads');
  assert.match(documentService, /copyLocalFile\(document\.localUri,\s*targetLocalUri\)/);
  assert.match(documentService, /aiKnowledgeRepository\.copyDocumentWithChunks/);
  assert.match(moveBody, /removeMaterialsByOwner\(\{\s*db,\s*deletedFileUris,\s*space:\s*input\.sourceSpace,\s*ownerType:\s*'thread'/s);
  assertOccursBefore(moveBody, 'removeMaterialsByOwner', 'aiThreadRepository.deleteThreads');
  assert.match(moveBody, /catch \(error\)[\s\S]*permanentlyDeleteAiThreads\(input\.targetSpace,\s*movedThreadIds\)/);
  assert.match(documentService, /cleanupSource \?\? true/);
  assert.match(moveBody, /copyThreadAttachmentsBetweenSpaces/);
  assert.match(moveBody, /restoreMessageAttachmentDocumentLinks/);
  assert.match(moveBody, /\.\.\.\(targetThreadsRolledBack \? targetAttachmentUris : \[\]\)/);
  assert.match(moveBody, /cleanupDeletedMaterialFiles\(\[\s*\.\.\.deletedFileUris,\s*\.\.\.sourceAttachmentUris,/);
  assertOccursBefore(moveBody, 'copyThreadAttachmentsBetweenSpaces', 'aiThreadRepository.importThread');
  assertOccursBefore(moveBody, 'moveThreadOwnedMaterialsBetweenSpaces', 'restoreMessageAttachmentDocumentLinks');
  assertOccursBefore(
    moveBody,
    'aiThreadRepository.deleteThreads',
    'const sourceRoleAvatarRoot'
  );
  assert.match(chatService, /if \(attachment\.documentId\) \{\s*attachments\.push\(attachment\);\s*continue;/s);
});

test('thread IP snapshot refresh updates the existing document id in place', () => {
  const documentService = read('src/ai/aiDocumentService.ts');
  const knowledgeRepository = read('src/database/repositories/aiKnowledgeRepository.ts');
  const refreshBody = extractBlockAfter(documentService, 'export async function refreshThreadIpSnapshotMaterial');

  assert.doesNotMatch(refreshBody, /generateThreadIpSnapshotMaterial\(/);
  assert.doesNotMatch(refreshBody, /removeMaterial\(/);
  assert.match(refreshBody, /aiKnowledgeRepository\.updateDocumentContent/);
  assert.match(refreshBody, /isAppPrivateAiDocumentFile\(input\.space,\s*document\.localUri\)/);
  assert.match(refreshBody, /parseAndChunkDocument\(\{\s*space:\s*input\.space,\s*documentId:\s*document\.id\s*\}\)/);
  assert.match(refreshBody, /return\s+\(await aiKnowledgeRepository\.findDocumentById\(db,\s*document\.id\)\)/);
  assert.match(knowledgeRepository, /async updateDocumentContent/);
});

test('reader uses original text or markdown localUri as the primary body', () => {
  const documentService = read('src/ai/aiDocumentService.ts');
  const readerBody = extractBlockAfter(documentService, 'export async function readDocumentForReader');

  assert.match(readerBody, /document\.sourceType === 'txt' \|\| document\.sourceType === 'markdown'/);
  assert.match(readerBody, /FileSystem\.readAsStringAsync\(document\.localUri/);
  assertOccursBefore(readerBody, 'FileSystem.readAsStringAsync(document.localUri', "chunks.map((chunk) => chunk.text).join");
});

test('global material library is truly global and resolves thread owners by id, not recent limit', () => {
  const documentService = read('src/ai/aiDocumentService.ts');
  const materialList = read('src/screens/AiMaterialListScreen.tsx');
  const threadRepository = read('src/database/repositories/aiThreadRepository.ts');
  const globalStart = documentService.indexOf('export async function listGlobalMaterialsGroupedByThread');
  const globalEnd = documentService.indexOf('export async function importManualTextToThread');
  const globalBody = documentService.slice(globalStart, globalEnd);

  assert.match(globalBody, /aiKnowledgeRepository\.listDocuments\(db,\s*\{\s*space:\s*input\.space,?\s*\}\)/s);
  assert.doesNotMatch(globalBody, /ownerType:\s*'thread'/);
  assert.doesNotMatch(globalBody, /limit:\s*500/);
  assert.match(globalBody, /findThreadsByIds\(db,\s*input\.space,\s*threadOwnerIds\)/);
  assert.match(threadRepository, /async findThreadsByIds/);
  assert.match(globalBody, /ownerType\s*===\s*'knowledge_base'/);
  assert.match(globalBody, /ownerType\s*===\s*'ip'/);
  assert.doesNotMatch(globalBody, /\.slice\(0,\s*input\.limit \?\? 100\)/);
  assert.match(globalBody, /input\.limit == null \? groups : groups\.slice\(0,\s*input\.limit\)/);
  assert.match(materialList, /listGlobalMaterialsGroupedByThread\(\{ space \}\)/);
});

test('global material library supports row-level multi-select deletion with owner-aware confirmation', () => {
  const materialList = read('src/screens/AiMaterialListScreen.tsx');
  const globalRender = materialList.slice(materialList.indexOf('isGlobalView ?'), materialList.indexOf(') : items.length ?'));

  assert.match(globalRender, /group\.materials\.map/);
  assert.match(globalRender, /renderMaterialRow\(material,\s*true\)/);
  assert.match(materialList, /toggleSelected\(item\.id\)/);
  assert.match(materialList, /onOpenDocument\(item\.id,\s*item\.title\)/);
  assert.match(materialList, /affectedOwnerCount/);
  assert.match(materialList, /受影响/);
});

test('thread add material uses a source sheet instead of directly jumping to import route', () => {
  const app = read('App.tsx');
  const importScreen = read('src/screens/AiMaterialImportScreen.tsx');
  const materialList = read('src/screens/AiMaterialListScreen.tsx');
  const sheet = read('src/components/ai/AiMaterialSourceSheet.tsx');

  assert.match(materialList, /AiMaterialSourceSheet/);
  assert.match(materialList, /setSourceSheetVisible\(true\)/);
  assert.match(materialList, /onImportMaterial\?\.\(threadId,\s*source\)/);
  assert.match(app, /initialSource:\s*source/);
  assert.match(importScreen, /initialSource\?:\s*AiMaterialSourceKind/);
  assert.match(importScreen, /showManualText/);
  assert.match(importScreen, /showFileImport/);
  assert.match(importScreen, /showIpImport/);
  assert.doesNotMatch(sheet, /AppDialog/);
  assert.match(sheet, /Modal/);
  assert.match(sheet, /justifyContent:\s*'flex-end'/);
  assert.match(sheet, /从 IP 导入/);
  assert.match(sheet, /从系统文件导入/);
  assert.match(sheet, /手动文本/);
});


test('small UI state fixes keep titles and selection mode honest', () => {
  const materialList = read('src/screens/AiMaterialListScreen.tsx');
  const library = read('src/screens/AiRoleLibraryScreen.tsx');
  const item = read('src/components/ai/AiRoleLibraryItem.tsx');

  assert.match(materialList, /knowledgeBaseId \? '知识库资料'/);
  assert.match(library, /selectionMode=\{selectedCardIds\.length > 0\}/);
  assert.match(item, /selectionMode/);
  assert.match(item, /!selectionMode \?/);
});
