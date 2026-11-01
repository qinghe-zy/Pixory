const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

function loadModule(relativePath, mockRequire = {}) {
  let targetPath = path.resolve(__dirname, relativePath);
  if (!targetPath.endsWith('.ts') && !targetPath.endsWith('.js')) {
    if (fs.existsSync(targetPath + '.ts')) targetPath += '.ts';
    else if (fs.existsSync(targetPath + '.js')) targetPath += '.js';
  }
  const code = fs.readFileSync(targetPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  const customRequire = (reqPath) => {
    if (mockRequire[reqPath]) return mockRequire[reqPath];
    if (reqPath.startsWith('.')) {
      return loadModule(path.join(path.dirname(targetPath), reqPath), mockRequire);
    }
    return require(reqPath);
  };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, customRequire);
  return m.exports;
}

const { stripMetaTags, isCandidateTagPrefix } = loadModule('../src/im/engine/tagAwareStreamParser.ts');
const { parsePingTag } = loadModule('../src/im/engine/imTagParser.ts');

test('tagAwareStreamParser strips [PING: ...] tags correctly', () => {
  const input = '去吧去吧[BR]注意安全[PING: 22:30 | 问回寝室没]';
  const cleaned = stripMetaTags(input);
  assert.equal(cleaned, '去吧去吧[BR]注意安全');
});

test('tagAwareStreamParser recognises PING prefix as candidate', () => {
  assert.equal(isCandidateTagPrefix('P'), true);
  assert.equal(isCandidateTagPrefix('PIN'), true);
  assert.equal(isCandidateTagPrefix('PING:'), true);
});

test('parsePingTag parses relative and clock times with intent', () => {
  const baseTime = new Date('2026-10-28T14:00:00.000Z').getTime(); // 22:00 in UTC+8
  const text1 = '好的呢！[PING: +45m | 问问洗完没]';
  const parsed1 = parsePingTag(text1, baseTime);
  assert.ok(parsed1);
  assert.equal(parsed1.intent, '问问洗完没');
  assert.equal(parsed1.targetTimestamp, baseTime + 45 * 60 * 1000);

  const text2 = '去自习吧[PING: 22:30 | 问回宿舍没]';
  const parsed2 = parsePingTag(text2, baseTime);
  assert.ok(parsed2);
  assert.equal(parsed2.intent, '问回宿舍没');
  assert.equal(parsed2.targetTimestamp, baseTime + 30 * 60 * 1000);
});

test('parsePingTag respects busy livingState and postpones', () => {
  const baseTime = new Date('2026-10-28T14:00:00.000Z').getTime();
  const livingState = {
    activityLoad: 'occupied',
    deviceAccess: 'limited',
    validUntil: baseTime + 60 * 60 * 1000, // busy for 1h
  };
  const text = '好的[PING: +20m | 看看你在干嘛]';
  const parsed = parsePingTag(text, baseTime, livingState);
  assert.ok(parsed);
  // since 20m < 60m busy duration, postpones to validUntil + 5m
  assert.equal(parsed.targetTimestamp, livingState.validUntil + 5 * 60 * 1000);
});
