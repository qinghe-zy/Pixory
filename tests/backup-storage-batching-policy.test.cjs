const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('backup export projects relations and import data through bulk repository queries', () => {
  const backup = read('src/services/backupService.ts');
  const images = read('src/database/repositories/imageRepository.ts');
  const tags = read('src/database/repositories/tagRepository.ts');
  const batches = read('src/database/repositories/importBatchRepository.ts');

  assert.match(images, /findGroupIdsByImageIds/);
  assert.match(tags, /findNamesByImageIds/);
  assert.match(batches, /findByIpIds/);
  assert.match(batches, /findItemsByBatchIds/);
  assert.match(backup, /findGroupIdsByImageIds/);
  assert.match(backup, /findNamesByImageIds/);
  assert.match(backup, /findItemsByBatchIds/);
  assert.doesNotMatch(backup, /filteredImages\.map\(async[\s\S]{0,260}findGroupIdsByImageId/);
  assert.doesNotMatch(backup, /for \(const batch of importBatches\)[\s\S]{0,160}findItemsByBatchId/);
});

test('storage preview and backup inventories use one pass with bounded file workers', () => {
  const storage = read('src/services/storageUsageService.ts');
  assert.match(storage, /scanPreviewInventory/);
  assert.match(storage, /settleFileTasksWithConcurrency/);
  assert.doesNotMatch(storage, /Promise\.all\(\[\.\.\.imageUris\]/);
  assert.doesNotMatch(storage, /Promise\.all\(candidates\.map/);
  assert.doesNotMatch(storage, /safeGetLocalEntrySize\(getThumbnailsDir\(space\)\)/);
});

test('storage dashboard reuses a scoped snapshot while refresh is in flight', () => {
  const cache = read('src/services/storageUsageSnapshotCache.ts');
  const screen = read('src/screens/StorageUsageScreen.tsx');
  assert.match(cache, /getCachedStorageUsageSummary/);
  assert.match(cache, /invalidateStorageUsageSnapshot/);
  assert.match(screen, /initialData:\s*getCachedStorageUsageSummary\(space\)/);
  assert.match(screen, /loading=\{isLoading && !data\}/);
});
