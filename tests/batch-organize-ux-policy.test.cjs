const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('batch review keeps the full safe pile set and filters weak filename prefixes', () => {
  const source = readProjectFile('src/screens/ImportBatchReviewScreen.tsx');

  for (const key of [
    "'ungrouped'",
    "'untagged'",
    "'no-note'",
    "'landscape'",
    "'portrait'",
    "'square'",
    "'panorama'",
    "'large'",
    "'small'",
    "'large-file'",
    "'same-size'",
    "'filename-prefix'",
    "'suspected-duplicate'",
  ]) {
    assert.match(source, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(source, /WEAK_FILENAME_PREFIXES/);
  assert.match(source, /IMG/i);
  assert.match(source, /Screenshot/i);
  assert.match(source, /\/\^\\d\+\$\/\.test/);
});

test('quick organize treats any missing organization field as needing work and supports import batch scope', () => {
  const imageRepositorySource = readProjectFile('src/database/repositories/imageRepository.ts');
  const importBatchRepositorySource = readProjectFile('src/database/repositories/importBatchRepository.ts');
  const importBatchReviewSource = readProjectFile('src/screens/ImportBatchReviewScreen.tsx');
  const quickOrganizeSource = readProjectFile('src/screens/QuickOrganizeScreen.tsx');

  assert.match(imageRepositorySource, /findNeedsOrganizing\(scope\?:\s*NeedsOrganizingScope/);
  assert.match(imageRepositorySource, /OR NOT EXISTS \(SELECT 1 FROM image_tags/);
  assert.match(imageRepositorySource, /OR image_assets\.note IS NULL/);
  assert.match(imageRepositorySource, /AND image_assets\.note IS NOT NULL/);
  assert.match(importBatchRepositorySource, /AND image_assets\.note IS NOT NULL/);
  assert.match(importBatchReviewSource, /image\.groupCount > 0 && image\.tagCount > 0 && image\.note/);
  assert.match(quickOrganizeSource, /importBatchId\?: number \| null/);
  assert.match(quickOrganizeSource, /findNeedsOrganizing\(\{\s*ipId,\s*importBatchId/);
});

test('batch manage same-prefix selection ignores weak filename prefixes', () => {
  const source = readProjectFile('src/screens/BatchManageImagesScreen.tsx');

  assert.match(source, /WEAK_FILENAME_PREFIXES/);
  assert.match(source, /screenshot/i);
  assert.match(source, /\/\^\\d\+\$\/\.test/);
  assert.doesNotMatch(source, /baseName\.slice\(0,\s*6\)/);
});

test('batch operations capture undo snapshots for composite metadata changes', () => {
  const undoSource = readProjectFile('src/services/batchUndoService.ts');
  const batchSource = readProjectFile('src/screens/BatchManageImagesScreen.tsx');

  for (const field of ['groupIds', 'tagNames', 'isFavorite', 'note', 'deletedAt']) {
    assert.match(undoSource, new RegExp(field));
  }

  assert.match(undoSource, /restoreBatchUndoSnapshot/);
  assert.match(batchSource, /captureBatchUndoSnapshot/);
  assert.match(batchSource, /restoreBatchUndoSnapshot/);
  assert.match(batchSource, /套用模板/);
});

test('import batches expose history and current-batch duplicate review without full-library scanning', () => {
  const appSource = readProjectFile('App.tsx');
  const importBatchRepositorySource = readProjectFile('src/database/repositories/importBatchRepository.ts');
  const imageRepositorySource = readProjectFile('src/database/repositories/imageRepository.ts');

  assert.match(appSource, /import-batch-history/);
  assert.match(appSource, /duplicate-review/);
  assert.match(importBatchRepositorySource, /findByIpId\(ipId: number/);
  assert.match(imageRepositorySource, /findSuspectedDuplicateGroupsByImportBatchId\(importBatchId: number/);
  assert.doesNotMatch(imageRepositorySource, /findSuspectedDuplicateGroups\(\)/);
});
