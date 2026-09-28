const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const definitionsPath = 'src/services/journalAchievementDefinitions.ts';
const rulesPath = 'src/services/journalAchievementRules.ts';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('journal achievement definitions expose the final poetic titles and stable categories', () => {
  const source = read(definitionsPath);
  for (const title of [
    '第一份光影',
    '第一次对话',
    '深夜有光',
    '长谈成章',
    '心事入笺',
    '记忆成林',
    '私语成篇',
    '梦中来信',
    '两日之间',
    '一周有声',
    '七日成诗',
    '月影留痕',
    '百日之约',
    '半载有期',
    '一载成章',
    '四季相逢',
    '岁首有约',
    '久别重逢',
    '平行时空',
    '三岔路口',
    '素材入境',
    '纸页成舟',
    '字句回响',
    '角色初醒',
    '世界渐丰',
    '三方成境',
    '第一段影像',
    '留下一份珍藏',
    '归物成章',
    '名帖初成',
    '十影成组',
    '百影成卷',
  ]) {
    assert.match(source, new RegExp(title));
  }
  assert.match(source, /definition\('first-light',\s*'journey'/);
  assert.match(source, /definition\('deep-night-light',\s*'connection'/);
  assert.match(source, /definition\('seven-days-poem',\s*'time'/);
  assert.match(source, /definition\('parallel-time',\s*'world'/);
  assert.match(source, /definition\('first-moving-image',\s*'organize'/);
});

test('journal rule source explicitly models the requested time windows and valid rounds', () => {
  const source = read(rulesPath);
  assert.match(source, /hour >= 1/);
  assert.match(source, /hour < 4/);
  assert.match(source, /20/);
  assert.match(source, /25/);
  assert.match(source, /3\s*\*\s*60\s*\*\s*1000/);
  assert.match(source, /7/);
  const definitions = read(definitionsPath);
  assert.match(definitions, /有效记忆达到 30 条/);
});
