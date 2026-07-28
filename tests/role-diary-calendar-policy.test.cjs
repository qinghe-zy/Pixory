const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

test('uses an explicit Asia/Shanghai diary calendar policy', () => {
  const source = readFileSync('src/ai/diary/diaryTypes.ts', 'utf8');

  assert.match(source, /export function beijingDiaryDate/);
  assert.match(source, /DIARY_TIME_ZONE\s*=\s*'Asia\/Shanghai'/);
  assert.match(source, /timeZone:\s*DIARY_TIME_ZONE/);
  assert.match(source, /export function decideDiaryTrigger/);
  assert.match(source, /auto_late_evening/);
});
