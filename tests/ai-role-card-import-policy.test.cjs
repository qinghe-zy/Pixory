const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('AI role cards store SillyTavern import metadata without breaking manual cards', () => {
  const schema = read('src/database/schema.ts');
  const database = read('src/database/db.ts');
  const types = read('src/ai/types.ts');
  const repository = read('src/database/repositories/aiRoleCardRepository.ts');
  const service = read('src/ai/aiRoleCardService.ts');

  assert.match(schema, /DATABASE_VERSION = 37/);
  assert.match(schema, /ALTER TABLE ai_role_cards ADD COLUMN firstMessage TEXT/);
  assert.match(schema, /ALTER TABLE ai_role_cards ADD COLUMN alternateGreetingsJson TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(schema, /ALTER TABLE ai_role_cards ADD COLUMN sourceType TEXT/);
  assert.match(schema, /ALTER TABLE ai_role_cards ADD COLUMN sourceJson TEXT/);
  assert.match(database, /MIGRATION_STATEMENTS_V30/);
  assert.match(database, /currentVersion >= 17 && currentVersion < 30/);
  assert.match(types, /export type AiRoleCardSourceType/);
  assert.match(types, /firstMessage: string \| null/);
  assert.match(types, /alternateGreetings: string\[\]/);
  assert.match(types, /sourceType: AiRoleCardSourceType \| null/);
  assert.match(types, /sourceJson: string \| null/);
  assert.match(repository, /parseAlternateGreetings/);
  assert.match(repository, /firstMessage: row\.firstMessage \?\? null/);
  assert.match(repository, /alternateGreetings: parseAlternateGreetings\(row\.alternateGreetingsJson\)/);
  assert.match(repository, /sourceType: normalizeRoleCardSourceType\(row\.sourceType\)/);
  assert.doesNotMatch(repository, /return\s*\{\s*\.\.\.row/);
  assert.match(service, /sourceType\?: AiRoleCardSourceType \| null/);
  assert.match(service, /sourceJson\?: string \| null/);
  assert.match(service, /sourceType: input\.sourceType \?\? 'pixory_manual'/);
});

test('imported roles can start a normal chat with a saved assistant greeting', () => {
  const roleService = read('src/ai/aiRoleCardService.ts');
  const chatService = read('src/ai/aiChatService.ts');

  assert.match(roleService, /export async function saveImportedRoleCard/);
  assert.match(roleService, /NormalizedSillyTavernRoleCard/);
  assert.match(chatService, /export async function createNormalThreadFromRoleCard/);
  assert.match(chatService, /firstMessage/);
  assert.match(chatService, /roleSnapshotJson: JSON\.stringify\(roleCard\)/);
  assert.match(chatService, /roleCard\.firstMessage/);
  assert.match(chatService, /createNormalThreadFromRoleCard[\s\S]{0,1800}db\.withTransactionAsync/);
  assert.match(chatService, /role: 'assistant'/);
  assert.match(chatService, /status: 'completed'/);
});

test('role card import preview exposes save start and edit actions', () => {
  const preview = read('src/components/ai/AiRoleCardImportPreview.tsx');
  assert.match(preview, /AiRoleCardImportPreview/);
  assert.match(preview, /allowStartChat\?: boolean/);
  assert.match(preview, /saving\?: boolean/);
  assert.match(preview, /saveLabel\?: string/);
  assert.match(preview, /保存角色/);
  assert.match(preview, /保存并开聊/);
  assert.match(preview, /allowStartChat \? \(/);
  assert.match(preview, /loading=\{saving\}/);
  assert.match(preview, /disabled=\{saving\}/);
  assert.match(preview, /编辑后保存/);
  assert.match(preview, /默认开场白/);
  assert.match(preview, /worldBookTruncated/);
  assert.match(preview, /SecureImage/);
  assert.doesNotMatch(preview, /唤醒|神经元|呼吸|外发光/);
});

test('role editor imports local PNG and JSON role cards into preview flow', () => {
  const editor = read('src/screens/AiRoleCardEditorScreen.tsx');
  assert.match(editor, /expo-document-picker/);
  assert.match(editor, /expo-file-system/);
  assert.match(editor, /parseSillyTavernJson/);
  assert.match(editor, /parseSillyTavernPngBase64/);
  assert.match(editor, /AiRoleCardImportPreview/);
  assert.match(editor, /导入角色卡/);
  assert.match(editor, /saveImportedRoleCard/);
  assert.match(editor, /copyAiRoleAvatarToAppStorage/);
  assert.match(editor, /onStartChatWithRole/);
  assert.match(editor, /allowStartChat=\{!threadId\}/);
  assert.match(editor, /saveLabel=\{threadId \? '保存并应用' : '仅保存'\}/);
  assert.match(editor, /saving=\{saving\}/);
  assert.match(editor, /savingImportedRef\.current/);
  assert.match(editor, /else if \(threadId\) \{[\s\S]{0,120}await applyRoleCard\(card\.id\)/);
  assert.doesNotMatch(editor, /fetch\(/);
});

test('editing imported role cards preserves advanced SillyTavern metadata', () => {
  const editor = read('src/screens/AiRoleCardEditorScreen.tsx');
  const service = read('src/ai/aiRoleCardService.ts');

  assert.match(editor, /firstMessage: card\.firstMessage/);
  assert.match(editor, /alternateGreetings: card\.alternateGreetings/);
  assert.match(editor, /sourceType: card\.sourceType/);
  assert.match(editor, /sourceJson: card\.sourceJson/);
  assert.match(editor, /tags: card\.tags/);
  assert.match(editor, /firstMessage: selectedGreeting \?\? importedRole\.firstMessage/);
  assert.match(editor, /alternateGreetings: importedRole\.alternateGreetings/);
  assert.match(editor, /sourceType: importedRole\.sourceType/);
  assert.match(editor, /sourceJson: importedRole\.sourceJson/);
  assert.match(editor, /tags: importedRole\.tags/);
  assert.match(editor, /firstMessage,\s*alternateGreetings,\s*sourceType,\s*sourceJson,[\s\S]{0,120}tags,/);
  assert.match(service, /roleCardId\?: string \| null/);
});

test('role editor protects unsaved drafts and updates loaded cards instead of duplicating them', () => {
  const editor = read('src/screens/AiRoleCardEditorScreen.tsx');
  const repository = read('src/database/repositories/aiRoleCardRepository.ts');
  const service = read('src/ai/aiRoleCardService.ts');

  assert.match(editor, /editingRoleId/);
  assert.match(editor, /editorBaseline/);
  assert.match(editor, /Boolean\(importedRole\) \|\| serializeRoleEditorDraft\(createCurrentDraft\(\)\) !== editorBaseline/);
  assert.match(editor, /roleCardId/);
  assert.match(editor, /loadCardIntoEditor\(card\)/);
  assert.match(service, /input\.roleCardId/);
  assert.match(service, /aiRoleCardRepository\.update/);
  assert.match(repository, /async update\(/);
  assert.match(repository, /UPDATE ai_role_cards/);
  assert.match(repository, /WHERE id = \? AND space = \? AND archivedAt IS NULL/);
});

test('role card start-chat failures surface as visible editor status', () => {
  const app = read('App.tsx');
  const editor = read('src/screens/AiRoleCardEditorScreen.tsx');
  assert.match(editor, /onStartChatWithRole\?: \(roleCardId: string\) => Promise<void> \| void/);
  assert.match(editor, /await onStartChatWithRole\?\.\(card\.id\)/);
  assert.match(editor, /角色已保存，但开始聊天失败/);
  assert.match(app, /onStartChatWithRole=\{\(roleCardId\) => startChatWithRoleCard\(currentRoute\.space, roleCardId\)\}/);
  assert.doesNotMatch(app, /Pixory start chat from role card failed/);
});

test('role library displays saved roles as visual cards with covers and source badges', () => {
  const library = read('src/screens/AiRoleLibraryScreen.tsx');
  const item = read('src/components/ai/AiRoleLibraryItem.tsx');
  assert.match(library, /AiRoleLibraryItem/);
  assert.match(library, /deleteRoleCards/);
  assert.match(item, /function getRoleCardSourceLabel/);
  assert.match(item, /自建/);
  assert.match(item, /导入/);
  assert.match(item, /styles\.cover/);
  assert.match(item, /styles\.sourceBadge/);
  assert.match(item, /card\.avatarEnabled && card\.avatarUri/);
  assert.match(item, /SecureImage[\s\S]*style=\{styles\.coverImage\}/);
  assert.match(item, /开聊/);
  assert.match(item, /numberOfLines=\{2\} style=\{styles\.description\}/);
});

test('AI workbench replaces recent materials with role library while keeping materials route', () => {
  const home = read('src/screens/AiHomeScreen.tsx');
  const app = read('App.tsx');
  assert.match(home, /onOpenRoleLibrary/);
  assert.match(home, /角色库/);
  assert.match(home, /MAX_RECENT_ROLE_SHORTCUTS = 15/);
  assert.match(home, /roleRailWrap/);
  assert.match(home, /onStartChatWithRole\(role\.roleCardId\)/);
  assert.doesNotMatch(home, /listRecentMaterials/);
  assert.doesNotMatch(home, /最近材料/);
  assert.match(app, /onOpenRoleLibrary/);
  assert.match(app, /onStartChatWithRole/);
  assert.match(app, /createNormalThreadFromRoleCard/);
  assert.match(app, /onOpenMaterials/);
});

test('old and manual role cards do not automatically insert greetings into existing sessions', () => {
  const chatService = read('src/ai/aiChatService.ts');
  const roleService = read('src/ai/aiRoleCardService.ts');
  assert.match(roleService, /sourceType: input\.sourceType \?\? 'pixory_manual'/);
  assert.match(chatService, /applyRoleCardToThread/);
  assert.doesNotMatch(chatService, /function applyRoleCardToThread[\s\S]*createMessage\([\s\S]*firstMessage/);
  assert.match(chatService, /createNormalThreadFromRoleCard[\s\S]*roleCard\.firstMessage/);
});

test('role card import remains local only', () => {
  const parser = read('src/ai/sillyTavernRoleCardParser.ts');
  const editor = read('src/screens/AiRoleCardEditorScreen.tsx');
  const service = read('src/ai/aiRoleCardService.ts');
  assert.doesNotMatch(parser, /fetch\(|XMLHttpRequest|https?:\/\//);
  assert.doesNotMatch(editor, /fetch\(|XMLHttpRequest|https?:\/\//);
  assert.doesNotMatch(service, /fetch\(|XMLHttpRequest|https?:\/\//);
  assert.match(editor, /copyAiRoleAvatarToAppStorage/);
  assert.match(service, /runWithDatabaseSpace/);
});

test('role editor keeps IP avatar images collapsed until the user selects an IP', () => {
  const editor = read('src/screens/AiRoleCardEditorScreen.tsx');

  assert.match(editor, /ROLE_CONTENT_TEXTAREA_MIN_HEIGHT = 168/);
  assert.match(editor, /minHeight=\{ROLE_CONTENT_TEXTAREA_MIN_HEIGHT\}/);
  assert.doesNotMatch(editor, /minHeight=\{240\}/);
  assert.match(editor, /setAvatarIpId\(\(current\) => current && nextIps\.some\(\(ip\) => ip\.id === current\) \? current : null\)/);
  assert.match(editor, /avatarIpId == null \? null : avatarCandidates\.length \? \(/);
  assert.match(editor, /styles\.avatarGrid/);
  assert.match(editor, /当前 IP 还没有可用图片。/);
  assert.match(editor, /avatarPanel:\s*\{[\s\S]{0,220}gap:\s*rhythm\.inlineGap[\s\S]{0,120}padding:\s*spacing\[2\]/);
  assert.match(editor, /avatarChoice:\s*\{[\s\S]{0,180}height:\s*metrics\.minTouchSize[\s\S]{0,80}width:\s*metrics\.minTouchSize/);
});
