const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('import history aggregates statuses without reading every batch item', () => {
  const screen = read('src/screens/ImportBatchHistoryScreen.tsx');
  const repo = read('src/database/repositories/importBatchRepository.ts');
  assert.match(repo, /countItemsByStatusForBatchIds/);
  assert.match(screen, /countItemsByStatusForBatchIds/);
  assert.doesNotMatch(screen, /findItemsByBatchId/);
  assert.doesNotMatch(screen, /Promise\.all\(\s*batches\.map/);
});

test('batch delete verification is bounded and reloads deleted rows in one database scope', () => {
  const source = read('src/screens/BatchManageImagesScreen.tsx');
  const deleteFlow = source.slice(source.indexOf('function confirmSoftDelete'), source.indexOf('const footer'));
  assert.match(source, /settleFileTasksWithConcurrency/);
  assert.match(deleteFlow, /imageRepository\.findByIds/);
  assert.doesNotMatch(deleteFlow, /imageCopies\.map\(async/);
  assert.doesNotMatch(deleteFlow, /imageRepository\.findById\s*\(/);
});

test('exact duplicate groups are reduced by SQL HAVING before loading full rows', () => {
  const source = read('src/database/repositories/imageRepository.ts');
  const method = source.slice(source.indexOf('async findExactDuplicateGroups'), source.indexOf('async findSimilarImageGroups'));
  assert.match(method, /HAVING COUNT\(\*\) > 1/);
  assert.match(method, /duplicateHashes/);
  assert.doesNotMatch(method, /this\.findFiltered/);
});
