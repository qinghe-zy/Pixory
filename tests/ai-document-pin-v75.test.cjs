const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');

test('Schema V75: defines DATABASE_VERSION = 75 and MIGRATION_STATEMENTS_V75', () => {
  const schemaContent = fs.readFileSync(path.join(root, 'src/database/schema.ts'), 'utf8');
  assert.match(schemaContent, /export const DATABASE_VERSION = 75;/);
  assert.match(schemaContent, /MIGRATION_STATEMENTS_V75/);
  assert.match(schemaContent, /ALTER TABLE ai_threads ADD COLUMN pinnedLoreSnapshot TEXT;/);

  const dbContent = fs.readFileSync(path.join(root, 'src/database/db.ts'), 'utf8');
  assert.match(dbContent, /currentVersion < 75/);
  assert.match(dbContent, /MIGRATION_STATEMENTS_V75/);
});

test('PromptBuilder: buildNormalChatPrompt injects pinnedLoreSnapshot into stable_material_rules without triggering MATERIAL_SESSION_RULES', () => {
  const promptBuilderContent = fs.readFileSync(path.join(root, 'src/ai/promptBuilder.ts'), 'utf8');
  
  // 验证入参支持 pinnedLoreSnapshot
  assert.match(promptBuilderContent, /pinnedLoreSnapshot\?:\s*string\s*\|\s*null/);
  
  // 验证注入进入 stable_material_rules 稳定块
  assert.match(promptBuilderContent, /block\('stable_material_rules',\s*input\.pinnedLoreSnapshot\?\.trim\(\)\s*\?\s*`常驻设定：\\n\$\{input\.pinnedLoreSnapshot\.trim\(\)\}`\s*:\s*'',\s*true\)/);
  
  // 验证普通聊天绝不包含 MATERIAL_SESSION_RULES 文本
  const normalPromptBlock = promptBuilderContent.match(/export function buildNormalChatPrompt[\s\S]*?return buildPromptFromLayers/);
  assert.ok(normalPromptBlock, 'buildNormalChatPrompt should be found');
  assert.doesNotMatch(normalPromptBlock[0], /MATERIAL_SESSION_RULES/);
});

test('PromptBuilder: buildMaterialBoundPrompt merges materialRules with pinnedLoreSnapshot', () => {
  const promptBuilderContent = fs.readFileSync(path.join(root, 'src/ai/promptBuilder.ts'), 'utf8');
  const boundPromptBlock = promptBuilderContent.match(/export function buildMaterialBoundPrompt[\s\S]*?return buildPromptFromLayers/);
  assert.ok(boundPromptBlock, 'buildMaterialBoundPrompt should be found');
  assert.match(boundPromptBlock[0], /input\.pinnedLoreSnapshot\?\.trim\(\)\s*\?\s*`常驻设定：\\n\$\{input\.pinnedLoreSnapshot\.trim\(\)\}`/);
});

test('aiDocumentPinService: defines limits and uses pinnedLoreSnapshot', () => {
  const pinServiceContent = fs.readFileSync(path.join(root, 'src/ai/aiDocumentPinService.ts'), 'utf8');
  assert.match(pinServiceContent, /export const SHORT_LORE_DIRECT_INJECT_LIMIT = 2500;/);
  assert.match(pinServiceContent, /export const SHORT_LORE_TOTAL_LIMIT = 4500;/);
  assert.match(pinServiceContent, /pinnedLoreSnapshot/);
  assert.match(pinServiceContent, /invalidateOwnerRagCache/);
});

test('aiChatService: passes pinnedLoreSnapshot and protects it from settings/rolecard overwrite', () => {
  const chatServiceContent = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  assert.match(chatServiceContent, /pinnedLoreSnapshot: thread\.pinnedLoreSnapshot/);

  // updateThreadSettings 仅更新 materialRulesSnapshot，绝不覆写 pinnedLoreSnapshot
  const updateSettingsMatch = chatServiceContent.match(/updateThread\(db,\s*input\.threadId,\s*\{[\s\S]*?materialRulesSnapshot:[\s\S]*?\}\)/);
  assert.ok(updateSettingsMatch, 'updateThreadSettings should update materialRulesSnapshot');
  assert.doesNotMatch(updateSettingsMatch[0], /pinnedLoreSnapshot:/, 'updateThreadSettings must not overwrite pinnedLoreSnapshot');

  // applyRoleCardToThread 仅更新 materialRulesSnapshot，绝不覆写 pinnedLoreSnapshot
  const applyRoleCardMatch = chatServiceContent.match(/updateThread\(db,\s*input\.threadId,\s*\{[\s\S]*?boundaryMode: nextBoundaryMode[\s\S]*?\}\)/);
  assert.ok(applyRoleCardMatch, 'applyRoleCardToThread should update boundaryMode');
  assert.doesNotMatch(applyRoleCardMatch[0], /pinnedLoreSnapshot:/, 'applyRoleCardToThread must not overwrite pinnedLoreSnapshot');
});

test('AiMessageBubble: renders pinPill action pill for document attachments', () => {
  const bubbleContent = fs.readFileSync(path.join(root, 'src/components/ai/AiMessageBubble.tsx'), 'utf8');
  assert.match(bubbleContent, /attachment\.documentId && onPinDocument/);
  assert.match(bubbleContent, /onOpenDocumentActionSheet\?\.\(attachment\.documentId/);
  assert.match(bubbleContent, /设为常驻设定/);
  assert.match(bubbleContent, /已常驻设定 · 管理/);
});
