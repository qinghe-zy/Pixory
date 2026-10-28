const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('IM input bar policy verification', async (t) => {
  const inputBarPath = path.resolve(__dirname, '../src/im/components/ImInputBar.tsx');
  const content = fs.readFileSync(inputBarPath, 'utf8');

  await t.test('ImInputBar consumes useImTheme and isolates text input state', () => {
    assert.match(content, /export function ImInputBar/);
    assert.match(content, /useImTheme\(\)/);
    assert.match(content, /useState\(''\)/);
  });

  await t.test('ImInputBar removes left microphone button and expands text input to the left', () => {
    assert.ok(!content.includes('name="mic-outline"'), 'Left microphone button must be removed');
    assert.match(content, /name="happy-outline"/);
    assert.match(content, /hasText\s*\?/);
    assert.match(content, /theme\.colors\.sendButtonBackground/);
  });

  await t.test('ImInputBar renders 4-column attachment grid in correct sequence: 拍摄 first, 照片 second', () => {
    assert.match(content, /attachmentPanel/);
    assert.match(content, /拍摄/);
    assert.match(content, /照片/);
    assert.match(content, /文件/);
    assert.match(content, /关联IP/);

    const cameraIndex = content.indexOf('拍摄');
    const photoIndex = content.indexOf('照片');
    const fileIndex = content.indexOf('文件');
    const ipIndex = content.indexOf('关联IP');

    assert.ok(cameraIndex > 0, '拍摄 must be present');
    assert.ok(photoIndex > cameraIndex, '照片 must follow 拍摄');
    assert.ok(fileIndex > photoIndex, '文件 must follow 照片');
    assert.ok(ipIndex > fileIndex, '关联IP must follow 文件');
  });
});
