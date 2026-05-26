const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('chat drawer exposes role library before history and global materials after history', () => {
  const source = read('src/components/ai/AiComprehensiveRecordDrawer.tsx');

  assert.match(source, /onOpenRoleLibrary/);
  assert.match(source, /onOpenGlobalMaterials/);
  assert.ok(source.indexOf('角色库') > source.indexOf('新聊天'));
  assert.ok(source.indexOf('历史记录') > source.indexOf('角色库'));
  assert.ok(source.indexOf('总资料库') > source.indexOf('历史记录'));
});

test('AI home no longer exposes old knowledge entry points', () => {
  const source = read('src/screens/AiHomeScreen.tsx');

  assert.doesNotMatch(source, /问问某个 IP/);
  assert.doesNotMatch(source, /连接知识库/);
  assert.doesNotMatch(source, /SillyTavern/);
  assert.match(source, /角色库/);
});

test('role editor does not cap IP avatar candidates at twelve', () => {
  const source = read('src/screens/AiRoleCardEditorScreen.tsx');

  assert.doesNotMatch(source, /images\.slice\(0,\s*12\)/);
  assert.match(source, /maxHeight|FlatList|ScrollView/);
});

test('thread material owner functions exist', () => {
  const source = read('src/ai/aiDocumentService.ts');

  assert.match(source, /listThreadMaterials/);
  assert.match(source, /listGlobalMaterialsGroupedByThread/);
  assert.match(source, /generateThreadIpSnapshotMaterial/);
  assert.match(source, /ownerType:\s*'thread'/);
});
