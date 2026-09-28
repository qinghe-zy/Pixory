const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const parserSource = () => fs.readFileSync(path.join(root, 'src/ai/sillyTavernRoleCardParser.ts'), 'utf8');
const parserPath = path.join(root, 'src/ai/sillyTavernRoleCardParser.ts');

function loadParser() {
  const compiled = ts.transpileModule(parserSource(), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: parserPath,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { exports: module.exports, module, require }, { filename: parserPath });
  return module.exports;
}

function pngChunk(type, data) {
  const buffer = Buffer.alloc(8 + data.length + 4);
  buffer.writeUInt32BE(data.length, 0);
  buffer.write(type, 4, 4, 'ascii');
  data.copy(buffer, 8);
  buffer.writeUInt32BE(0, 8 + data.length);
  return buffer;
}

function makePngWithChara(json) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const charaJson = Buffer.from(JSON.stringify(json), 'utf8').toString('base64');
  const payload = Buffer.from(`chara\0${charaJson}`, 'latin1');
  return Buffer.concat([signature, pngChunk('tEXt', payload), pngChunk('IEND', Buffer.alloc(0))]).toString('base64');
}

function makePngWithITxtChara(json) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const charaJson = Buffer.from(JSON.stringify(json), 'utf8').toString('base64');
  const payload = Buffer.concat([
    Buffer.from('chara\0', 'latin1'),
    Buffer.from([0, 0]),
    Buffer.from('\0\0', 'latin1'),
    Buffer.from(charaJson, 'latin1'),
  ]);
  return Buffer.concat([signature, pngChunk('iTXt', payload), pngChunk('IEND', Buffer.alloc(0))]).toString('base64');
}

function makePngWithRawCharaPayload(payload) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk('tEXt', Buffer.from(`chara\0${payload}`, 'latin1')),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

test('SillyTavern parser exposes PNG JSON V2 V3 V1 and normalization contracts', () => {
  const source = parserSource();

  assert.match(source, /export type SillyTavernImportSourceType/);
  assert.match(source, /export interface NormalizedSillyTavernRoleCard/);
  assert.match(source, /export function parseSillyTavernJson/);
  assert.match(source, /export function parseSillyTavernPngBase64/);
  assert.match(source, /export function normalizeSillyTavernRoleCard/);
  assert.match(source, /PNG_SIGNATURE/);
  assert.match(source, /MAX_PNG_BASE64_LENGTH/);
  assert.match(source, /base64\.length > MAX_PNG_BASE64_LENGTH/);
  assert.match(source, /readUInt32BE/);
  assert.match(source, /tEXt/);
  assert.match(source, /iTXt/);
  assert.match(source, /character_book/);
  assert.match(source, /alternate_greetings/);
  assert.match(source, /worldBookTruncated/);
});

test('SillyTavern parser stays local and React Native compatible', () => {
  const source = parserSource();

  assert.doesNotMatch(source, /Buffer/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /XMLHttpRequest/);
  assert.doesNotMatch(source, /https?:\/\//);
  assert.match(source, /code:\s*'invalid_base64'/);
  assert.match(source, /code:\s*'invalid_json'/);
});

test('PNG fixture builder documents expected chara payload shape', () => {
  const card = { spec: 'chara_card_v2', data: { name: 'Mira', description: 'Archivist', first_mes: 'Hello.' } };
  const base64 = makePngWithChara(card);
  const bytes = Buffer.from(base64, 'base64');

  assert.ok(base64.length > 0);
  assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes.slice(12, 16).toString('latin1'), 'tEXt');
  assert.equal(bytes.slice(16, 22).toString('latin1'), 'chara\0');
});

test('normalizes JSON V2 V3 and V1 role cards with greetings and source JSON preserved', () => {
  const { parseSillyTavernJson } = loadParser();
  const v2 = {
    spec: 'chara_card_v2',
    data: {
      name: 'Mira',
      description: 'Archivist',
      creator_notes: 'Keeps careful notes',
      personality: 'Precise',
      scenario: 'A quiet archive',
      system_prompt: 'Stay in character',
      post_history_instructions: 'Remember facts',
      mes_example: '<START>\nMira: Hello',
      first_mes: 'Hello.',
      alternate_greetings: ['Hello.', 'Welcome.'],
      tags: ['archive', 'archive', ''],
      character_book: {
        entries: [
          { enabled: true, name: 'Shelf', content: 'Old maps are stored here.' },
          { enabled: false, name: 'Hidden', content: 'Do not import.' },
        ],
      },
    },
    unknown_v3_future_field: { keep: true },
  };

  const parsed = parseSillyTavernJson(JSON.stringify(v2));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.normalized.sourceType, 'sillytavern_json_v2');
  assert.equal(parsed.normalized.name, 'Mira');
  assert.equal(parsed.normalized.description, 'Keeps careful notes');
  assert.deepEqual(Array.from(parsed.normalized.alternateGreetings), ['Hello.', 'Welcome.']);
  assert.equal(parsed.normalized.firstMessage, 'Hello.');
  assert.deepEqual(Array.from(parsed.normalized.tags), ['archive']);
  assert.match(parsed.normalized.prompt, /## 角色描述\nArchivist/);
  assert.match(parsed.normalized.prompt, /## 附加设定[\s\S]*Old maps are stored here\./);
  assert.doesNotMatch(parsed.normalized.prompt, /Do not import/);
  assert.match(parsed.normalized.sourceJson, /unknown_v3_future_field/);

  const v3 = parseSillyTavernJson(JSON.stringify({ ...v2, spec: 'chara_card_v3' }));
  assert.equal(v3.ok, true);
  assert.equal(v3.normalized.sourceType, 'sillytavern_json_v3');
  assert.equal(v3.normalized.sourceVersion, 'v3');

  const v1 = parseSillyTavernJson(JSON.stringify({ name: 'Flat', first_mes: 'Hi', description: 'Flat card' }));
  assert.equal(v1.ok, true);
  assert.equal(v1.normalized.sourceType, 'tavern_json_v1');
});

test('parses PNG tEXt and iTXt chara chunks and separates common error paths', () => {
  const { parseSillyTavernPngBase64 } = loadParser();
  const card = { spec: 'chara_card_v2', data: { name: 'Mira', description: 'Archivist', first_mes: 'Hello.' } };

  const textParsed = parseSillyTavernPngBase64(makePngWithChara(card));
  assert.equal(textParsed.ok, true);
  assert.equal(textParsed.normalized.sourceType, 'sillytavern_png_v2');

  const itxtParsed = parseSillyTavernPngBase64(makePngWithITxtChara(card));
  assert.equal(itxtParsed.ok, true);
  assert.equal(itxtParsed.normalized.sourceType, 'sillytavern_png_v2');

  const invalidBase64 = parseSillyTavernPngBase64(makePngWithRawCharaPayload('not valid ###'));
  assert.equal(invalidBase64.ok, false);
  assert.equal(invalidBase64.code, 'invalid_base64');

  const invalidJson = parseSillyTavernPngBase64(makePngWithRawCharaPayload(Buffer.from('{bad', 'utf8').toString('base64')));
  assert.equal(invalidJson.ok, false);
  assert.equal(invalidJson.code, 'invalid_json');

  const missingChara = parseSillyTavernPngBase64(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk('IEND', Buffer.alloc(0)),
    ]).toString('base64')
  );
  assert.equal(missingChara.ok, false);
  assert.equal(missingChara.code, 'missing_chara');
});

test('rejects malformed PNG and truncates oversized character books', () => {
  const { parseSillyTavernJson, parseSillyTavernPngBase64 } = loadParser();
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const badLength = Buffer.alloc(12);
  badLength.writeUInt32BE(12, 0);
  badLength.write('tEXt', 4, 4, 'ascii');
  const malformed = parseSillyTavernPngBase64(Buffer.concat([signature, badLength]).toString('base64'));
  assert.equal(malformed.ok, false);
  assert.equal(malformed.code, 'invalid_png');

  const compressedITxt = Buffer.concat([
    Buffer.from('chara\0', 'latin1'),
    Buffer.from([1, 0]),
    Buffer.from('\0\0payload', 'latin1'),
  ]);
  const compressedResult = parseSillyTavernPngBase64(
    Buffer.concat([signature, pngChunk('iTXt', compressedITxt), pngChunk('IEND', Buffer.alloc(0))]).toString('base64')
  );
  assert.equal(compressedResult.ok, false);
  assert.notEqual(compressedResult.code, 'invalid_base64');

  const longBook = parseSillyTavernJson(JSON.stringify({
    spec: 'chara_card_v2',
    data: {
      name: 'Lorekeeper',
      description: 'Tracks long lore',
      character_book: {
        entries: [{ enabled: true, name: 'Long', content: 'A'.repeat(6000) }],
      },
    },
  }));
  assert.equal(longBook.ok, true);
  assert.equal(longBook.normalized.worldBookTruncated, true);
  assert.deepEqual(Array.from(longBook.normalized.warnings), ['部分附加设定因长度限制未导入']);
  assert.ok(longBook.normalized.worldBookMergedCharacterCount <= 5000);
});
