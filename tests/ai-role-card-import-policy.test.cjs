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
