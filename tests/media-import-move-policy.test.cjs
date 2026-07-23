const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('album move selection asks Android for a legacy MediaStore-backed picker result', () => {
  const imageImport = read('src/services/imageImportService.ts');
  const videoImport = read('src/services/videoImportService.ts');

  assert.match(imageImport, /pickImagesForImport\(\s*imageImportSourceMode:[\s\S]*=\s*'copy'/);
  assert.match(videoImport, /pickVideosForImport\(\s*imageImportSourceMode:[\s\S]*=\s*'copy'/);
  assert.match(imageImport, /legacy:\s*Platform\.OS === 'android' && imageImportSourceMode === 'move'/);
  assert.match(videoImport, /legacy:\s*Platform\.OS === 'android' && imageImportSourceMode === 'move'/);
});

test('file-picked assets are always copied even while the saved import mode is move', () => {
  const imageImport = read('src/services/imageImportService.ts');
  const videoImport = read('src/services/videoImportService.ts');

  assert.match(imageImport, /resolvePickedAssetImportMode\(\s*pickedAsset\.sourceKind \?\? 'album'/);
  assert.match(videoImport, /resolvePickedAssetImportMode\(\s*pickedAsset\.sourceKind \?\? 'album'/);
});

test('source deletion is deferred until all successful image and video imports are persisted', () => {
  const imageImport = read('src/services/imageImportService.ts');
  const videoImport = read('src/services/videoImportService.ts');
  const screen = read('src/screens/ImportImagesScreen.tsx');

  assert.match(imageImport, /sourceDeletionNotice:\s*MoveDeletionNotice \| null/);
  assert.match(videoImport, /sourceDeletionNotice:\s*MoveDeletionNotice \| null/);
  assert.match(imageImport, /pendingSourceDeletionAssetId:\s*string \| null/);
  assert.match(videoImport, /pendingSourceDeletionAssetId:\s*string \| null/);
  assert.match(imageImport, /deferSourceDeletion/);
  assert.match(videoImport, /deferSourceDeletion/);
  assert.match(screen, /deleteMediaStoreAssetsWithConfirmation\(pendingSourceDeletionAssetIds\)/);
  assert.match(screen, /deferSourceDeletion:\s*true/);
  assert.match(screen, /原文件未删除 \$\{sourceDeletionFailureCount\}/);
});
