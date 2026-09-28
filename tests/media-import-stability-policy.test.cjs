const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('bulk media selection keeps the primary import action reachable without mounting every image preview', () => {
  const source = readProjectFile('src/screens/ImportImagesScreen.tsx');

  assert.match(source, /PICKED_IMAGE_PREVIEW_LIMIT/);
  assert.match(source, /pickedAssets\.slice\(0, PICKED_IMAGE_PREVIEW_LIMIT\)\.map/);
  assert.match(source, /另有 \{pickedAssets\.length - PICKED_IMAGE_PREVIEW_LIMIT\} 张图片/);
  assert.match(source, /primaryAction=\{\{ disabled: !canImport, label: '开始导入'/);
});

test('video import coalesces copy progress writes and cancels when the personal session expires', () => {
  const source = readProjectFile('src/services/videoImportService.ts');

  assert.match(source, /VIDEO_IMPORT_PROGRESS_WRITE_INTERVAL_MS/);
  assert.match(source, /createVideoImportProgressWriter/);
  assert.match(source, /progressWriter\.startCopy\(\)/);
  assert.match(source, /await progressWriter\.finishCopy\(\)/);
  assert.match(source, /taskToken\?: PersonalTaskToken \| null/);
  assert.match(source, /assertPersonalTaskActive\(params\.taskToken\)/);
  assert.match(source, /assertPersonalTaskActive\(taskToken\)/);
});

test('unlocking personal space releases inactive root pages before the new library loads', () => {
  const source = readProjectFile('App.tsx');

  assert.match(source, /setRenderedTabs\(new Set\(\[currentRouteRef\.current\.name === 'root' \? currentRouteRef\.current\.tab : 'home'\]\)\)/);
});

test('file picker names remain the import source of truth instead of cache URI fragments', () => {
  const pickerSource = readProjectFile('src/services/mediaFilePickerService.ts');
  const imageImportSource = readProjectFile('src/services/imageImportService.ts');
  const videoImportSource = readProjectFile('src/services/videoImportService.ts');

  assert.match(pickerSource, /fileName: asset\.name/);
  assert.match(imageImportSource, /pickedAsset\.fileName\?\.trim\(\) \|\| buildFallbackFilename/);
  assert.match(videoImportSource, /asset\.fileName\?\.trim\(\) \|\| getFileNameFromUri/);
});
