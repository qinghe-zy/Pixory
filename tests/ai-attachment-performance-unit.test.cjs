const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadPolicy() {
  const constantsFilename = path.join(root, 'src/constants/limits.ts');
  const constantsOutput = ts.transpileModule(fs.readFileSync(constantsFilename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const constantsModule = { exports: {} };
  vm.runInNewContext(constantsOutput, { exports: constantsModule.exports, module: constantsModule }, { filename: constantsFilename });
  const filename = path.join(root, 'src/ai/aiAttachmentPolicy.ts');
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier === '../constants/limits') return constantsModule.exports;
    throw new Error(`Unexpected dependency: ${specifier}`);
  };
  vm.runInNewContext(output, { exports: module.exports, module, require: localRequire }, { filename });
  return module.exports;
}

const attachment = (id, kind = 'image', size = 1024) => ({ id, kind, name: id, size, uri: `file://${id}` });

test('attachment validation rejects count, individual bytes, and total bytes before payload work', () => {
  const { validateAiChatAttachments } = loadPolicy();
  assert.equal(validateAiChatAttachments(Array.from({ length: 9 }, (_, i) => attachment(String(i)))).code, 'count');
  assert.equal(validateAiChatAttachments([attachment('huge', 'image', 13 * 1024 * 1024)]).code, 'single_image_bytes');
  assert.equal(validateAiChatAttachments([attachment('a', 'document', 20 * 1024 * 1024), attachment('b', 'document', 20 * 1024 * 1024)]).code, 'total_bytes');
});

test('unknown sizes consume a bounded reserve rather than bypassing total limits', () => {
  const { validateAiChatAttachments } = loadPolicy();
  const result = validateAiChatAttachments(Array.from({ length: 3 }, (_, i) => attachment(String(i), 'document', null)));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'total_bytes');
});

test('chat attachment preparation uses ordered concurrency two and never base64-reads videos', () => {
  const service = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  assert.match(service, /settleWithConcurrency\([^,]+,\s*AI_CHAT_ATTACHMENT_READ_CONCURRENCY/);
  assert.match(service, /filter\(\(attachment\) => attachment\.kind === 'image'\)/);
  assert.doesNotMatch(service, /filter\(\(attachment\) => attachment\.kind === 'video'\)[\s\S]{0,300}readAsStringAsync/);
  assert.match(service, /assertAiChatAttachments/);
});
