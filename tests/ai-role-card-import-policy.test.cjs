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

  assert.match(schema, /DATABASE_VERSION = 30/);
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
  assert.match(preview, /保存角色/);
  assert.match(preview, /保存并开始聊天/);
  assert.match(preview, /编辑后保存/);
  assert.match(preview, /默认开场白/);
  assert.match(preview, /worldBookTruncated/);
  assert.match(preview, /SecureImage/);
  assert.doesNotMatch(preview, /唤醒|神经元|呼吸|外发光/);
});
