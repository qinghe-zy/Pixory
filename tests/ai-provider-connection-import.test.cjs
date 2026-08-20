const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('provider connection import parser accepts only flat url and key JSON', () => {
  const source = read('src/ai/aiProviderConnectionImport.ts');

  assert.match(source, /export function parseProviderConnectionImport/);
  assert.match(source, /JSON\.parse/);
  assert.match(source, /Array\.isArray/);
  assert.match(source, /function isPlainRecord/);
  assert.match(source, /typeof record\.url !== 'string'/);
  assert.match(source, /typeof record\.key !== 'string'/);
  assert.match(source, /normalizeBaseUrl\(record\.url\)/);
  assert.match(source, /new URL\(record\.url\.trim\(\)\)/);
  assert.match(source, /hasPath/);
  assert.match(source, /return \{ ok: true, baseUrl, apiKey, hasPath: url\.pathname !== '\/' \}/);
});

test('provider connection import parser rejects unsafe or ambiguous shapes', () => {
  const source = read('src/ai/aiProviderConnectionImport.ts');

  assert.match(source, /invalid_json/);
  assert.match(source, /invalid_shape/);
  assert.match(source, /missing_fields/);
  assert.match(source, /unsupported_url/);
  assert.match(source, /url\.search \|\| url\.hash/);
  assert.doesNotMatch(source, /base_url/);
  assert.doesNotMatch(source, /api_key/);
  assert.doesNotMatch(source, /match\(\/https\?:/);
});
