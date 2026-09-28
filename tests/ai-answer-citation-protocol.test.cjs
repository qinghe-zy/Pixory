const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const old = require.extensions['.ts'];
require.extensions['.ts'] = function compile(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
let protocol;
try { protocol = require(path.join(root, 'src/ai/aiCitationProtocol.ts')); }
finally { if (old) require.extensions['.ts'] = old; else delete require.extensions['.ts']; }

test('stream parser hides split markers and records preceding claim offsets', () => {
  const parser = new protocol.CitationMarkerStreamParser();
  assert.equal(parser.push('月亮是银白色的[['), '月亮是银白色的');
  assert.equal(parser.push('cite:S1'), '');
  assert.equal(parser.push(']]。下一句'), '。下一句');
  const result = parser.finish();
  assert.equal(result.text, '月亮是银白色的。下一句');
  assert.deepEqual(result.markers, [{ refId: 'S1', markerAt: 7, claimStart: 0, claimEnd: 7 }]);
});

test('incomplete and malformed citation controls never flash', () => {
  const incomplete = new protocol.CitationMarkerStreamParser();
  assert.equal(incomplete.push('正文[[cite:S1'), '正文');
  assert.equal(incomplete.finish().text, '正文');
  const malformed = new protocol.CitationMarkerStreamParser();
  assert.equal(malformed.push('正文[[cite:bad]]完成'), '正文完成');
  assert.deepEqual(malformed.finish().markers, []);
});

test('registry IDs are stable for request ordering and hashes are content-derived', () => {
  const rows = protocol.buildCitationRegistry([
    { chunkId: 'c1', label: '甲', text: '月亮呈银白色', locator: {}, sourceId: 'd1', sourceType: 'document_chunk', documentVersion: 'v1' },
    { chunkId: 'c2', label: '乙', text: '夜晚很安静', locator: {}, sourceId: 'd2', sourceType: 'document_chunk', documentVersion: 'v2' },
  ]);
  assert.deepEqual(rows.map((row) => row.refId), ['S1', 'S2']);
  assert.equal(rows[0].sourceExcerptHash, protocol.hashCitationExcerpt(' 月亮呈银白色 '));
  assert.match(protocol.citationRegistryPrompt(rows), /\[\[cite:S1\]\]/);
});

test('local support requires lexical overlap and rejects unrelated claims', () => {
  assert.equal(protocol.hasCitationLexicalSupport('月亮呈现银白色', '资料记载月亮呈银白色，并照亮湖面'), true);
  assert.equal(protocol.hasCitationLexicalSupport('火星上住着会唱歌的猫', '资料记载月亮呈银白色，并照亮湖面'), false);
});
