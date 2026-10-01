const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('AiChatScreen passes citation.locator to onOpenIpSource', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/AiChatScreen.tsx'), 'utf8');
  assert.match(source, /onOpenIpSource:\s*\(ipId:\s*number,\s*locator\?:\s*Record<string,\s*unknown>\)\s*=>\s*void/);
  assert.match(source, /onOpenIpSource\(ipId,\s*citation\.locator\)/);
});

test('App.tsx routes IP citations by locator.kind to corresponding screens', () => {
  const source = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  assert.match(source, /kind === 'groups'/);
  assert.match(source, /pushRoute\(\{\s*name:\s*'group-overview',\s*ipId,\s*space:\s*currentRoute\.space\s*\}\)/);
  assert.match(source, /kind === 'import_batches'/);
  assert.match(source, /pushRoute\(\{\s*name:\s*'import-batch-history',\s*ipId,\s*space:\s*currentRoute\.space\s*\}\)/);
  assert.match(source, /kind === 'filenames' \|\| kind === 'tags'/);
  assert.match(source, /pushRoute\(\{\s*name:\s*'all-images',\s*ipId,\s*space:\s*currentRoute\.space\s*\}\)/);
  assert.match(source, /pushRoute\(\{\s*name:\s*'ip-detail',\s*ipId,\s*space:\s*currentRoute\.space\s*\}\)/);
});

test('aiRetrievalService attaches appropriate locator.kind to ip_metadata snippets', () => {
  const source = fs.readFileSync(path.join(root, 'src/ai/aiRetrievalService.ts'), 'utf8');
  assert.match(source, /locator:\s*\{\s*ipId:\s*ip\.id,\s*kind:\s*'summary'\s*\}/);
  assert.match(source, /locator:\s*\{\s*ipId:\s*ip\.id,\s*kind:\s*'groups'\s*\}/);
  assert.match(source, /locator:\s*\{\s*ipId:\s*ip\.id,\s*kind:\s*'tags'\s*\}/);
  assert.match(source, /locator:\s*\{\s*ipId:\s*ip\.id,\s*kind:\s*'filenames'\s*\}/);
  assert.match(source, /locator:\s*\{\s*ipId:\s*ip\.id,\s*kind:\s*'import_batches'\s*\}/);
});
