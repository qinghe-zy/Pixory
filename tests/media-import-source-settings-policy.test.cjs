const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('image and video picker sources and the warning preference use independent settings', () => {
  const settings = fs.readFileSync(path.join(root, 'src/database/repositories/settingsRepository.ts'), 'utf8');

  assert.match(settings, /IMAGE_MEDIA_PICKER_SOURCE_KEY\s*=\s*'imageMediaPickerSource'/);
  assert.match(settings, /VIDEO_MEDIA_PICKER_SOURCE_KEY\s*=\s*'videoMediaPickerSource'/);
  assert.match(settings, /MOVE_IMPORT_WARNING_DISMISSED_KEY\s*=\s*'moveImportWarningDismissed'/);
  assert.match(settings, /export type MediaPickerSource = 'album' \| 'files'/);
  assert.match(settings, /getImageMediaPickerSource[\s\S]*return value === 'files' \? 'files' : 'album'/);
  assert.match(settings, /getVideoMediaPickerSource[\s\S]*return value === 'files' \? 'files' : 'album'/);
  assert.match(settings, /setImageMediaPickerSource/);
  assert.match(settings, /setVideoMediaPickerSource/);
  assert.match(settings, /getMoveImportWarningDismissed[\s\S]*value === 'true'/);
  assert.match(settings, /setMoveImportWarningDismissed/);
});
