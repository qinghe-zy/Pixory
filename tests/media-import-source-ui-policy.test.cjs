const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('import form exposes independent right-aligned album and file source controls', () => {
  const section = read('src/components/LightFormSection.tsx');
  const control = read('src/components/CompactSegmentedControl.tsx');
  const screen = read('src/screens/ImportImagesScreen.tsx');

  assert.match(section, /headerRight\?:\s*ReactNode/);
  assert.match(section, /styles\.headerRow/);
  assert.match(section, /styles\.headerCopy/);
  assert.match(control, /accessibilityRole="tab"/);
  assert.match(control, /minHeight:\s*44/);
  assert.match(screen, /imageMediaPickerSource/);
  assert.match(screen, /videoMediaPickerSource/);
  assert.match(screen, /setImageMediaPickerSource/);
  assert.match(screen, /setVideoMediaPickerSource/);
  assert.match(screen, /<LightFormSection[\s\S]{0,360}title="选择图片"[\s\S]{0,160}>/);
  assert.match(screen, /<LightFormSection[\s\S]{0,360}title="选择视频"[\s\S]{0,160}>/);
});

test('move warning has one acknowledgement action and persists opt-out only on acknowledgement', () => {
  const screen = read('src/screens/ImportImagesScreen.tsx');

  assert.match(screen, /primaryLabel="知道了"/);
  assert.match(screen, /secondaryLabel=\{null\}/);
  assert.match(screen, /下次不再弹出/);
  assert.match(screen, /setMoveImportWarningDismissed/);
  assert.match(screen, /confirmMoveImportWarning/);
});
