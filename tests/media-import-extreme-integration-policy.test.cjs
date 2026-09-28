const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('recursive local size scanning uses bounded file workers instead of recursive fan-out', () => {
  const cleanup = read('src/services/cacheCleanupService.ts');
  const importOrder = read('src/services/mediaImportOrderService.ts');
  assert.match(cleanup, /settleFileTasksWithConcurrency/);
  assert.doesNotMatch(cleanup, /Promise\.all\(names\.map\(\(name\) => getLocalEntrySize/);
  assert.match(importOrder, /settleFileTasksWithConcurrency\(batch, MEDIA_IMPORT_FILE_CONCURRENCY/);
  assert.doesNotMatch(importOrder, /Promise\.all\(batch\.map/);
});

test('image and video imports preflight before task rows and recheck actual bytes before database commit', () => {
  const image = read('src/services/imageImportService.ts');
  const video = read('src/services/videoImportService.ts');
  assert.match(image, /assertMediaImportPreflight[\s\S]{0,900}importBatchRepository\.create/);
  assert.match(video, /assertMediaImportPreflight[\s\S]{0,1200}backgroundTaskRepository\.create/);
  assert.match(image, /assertMediaImportCommitBudget[\s\S]{0,700}imageRepository\.create/);
  assert.match(video, /assertMediaImportCommitBudget[\s\S]{0,900}assetRepository\.createVideo/);
  assert.match(image, /catch \(error\) \{\s*assertPersonalTaskActive\(params\.taskToken\)/);
  assert.match(video, /catch \(error\) \{\s*assertPersonalTaskActive\(params\.taskToken\)/);
});

test('mixed image and video selection shares one batch gate and one Personal task barrier', () => {
  const screen = read('src/screens/ImportImagesScreen.tsx');
  const runtime = read('src/services/mediaImportPreflightRuntime.ts');
  const image = read('src/services/imageImportService.ts');
  const video = read('src/services/videoImportService.ts');
  assert.match(screen, /assertMixedMediaImportPreflight/);
  assert.match(screen, /\.\.\.pickedAssets\.map\(\(asset\) => \(\{ asset, kind: 'image' as const \}\)\)/);
  assert.match(screen, /\.\.\.pickedVideos\.map\(\(asset\) => \(\{ asset, kind: 'video' as const \}\)\)/);
  assert.match(screen, /return trackPersonalTask\(taskToken, importTask\)/);
  const mixedStart = runtime.indexOf('export async function assertMixedMediaImportPreflight');
  const mixedKnownGate = runtime.indexOf('const knownSelectionResult = evaluateMediaImportPreflight', mixedStart);
  const mixedFileIo = runtime.indexOf('const sizeResults = await settleFileTasksWithConcurrency', mixedStart);
  assert.ok(mixedKnownGate > mixedStart && mixedKnownGate < mixedFileIo, 'mixed count and known byte limits must reject before file metadata I/O');
  assert.match(screen, /const commitBudget = createMediaImportCommitBudget\(\)/);
  assert.match(screen, /importImagesToIp\(\{[\s\S]{0,700}commitBudget,/);
  assert.match(screen, /importVideosToIp\(\{[\s\S]{0,700}commitBudget,/);
  assert.match(image, /interface ImportImagesToIpParams[\s\S]{0,700}commitBudget\?: MediaImportCommitBudget/);
  assert.match(image, /const commitBudget = params\.commitBudget \?\? createMediaImportCommitBudget\(\)/);
  assert.match(video, /commitBudget\?: MediaImportCommitBudget[\s\S]{0,900}const commitBudget = params\.commitBudget \?\? createMediaImportCommitBudget\(\)/);
});

test('file picker cache copies are explicitly owned and conservatively cleaned', () => {
  const picker = read('src/services/mediaFilePickerService.ts');
  const screen = read('src/screens/ImportImagesScreen.tsx');
  assert.match(picker, /copyToCacheDirectory:\s*true/);
  assert.match(picker, /temporaryInput:\s*Boolean\(FileSystem\.cacheDirectory/);
  assert.match(picker, /cleanupTemporaryMediaInputs/);
  assert.match(picker, /startsWith\(FileSystem\.cacheDirectory\)/);
  assert.match(screen, /cleanupTemporaryMediaInputs/);
});
