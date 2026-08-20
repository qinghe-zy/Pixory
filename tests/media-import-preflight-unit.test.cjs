const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function transpile(filename) {
  return ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function loadModule() {
  const constantsFilename = path.join(root, 'src/constants/limits.ts');
  const constantsModule = { exports: {} };
  vm.runInNewContext(transpile(constantsFilename), { exports: constantsModule.exports, module: constantsModule }, { filename: constantsFilename });
  const filename = path.join(root, 'src/services/mediaImportPreflight.ts');
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier === '../constants/limits') return constantsModule.exports;
    throw new Error(`Unexpected dependency: ${specifier}`);
  };
  vm.runInNewContext(transpile(filename), { exports: module.exports, module, require: localRequire }, { filename });
  return { ...module.exports, limits: constantsModule.exports };
}

const asset = (name, kind, size) => ({ kind, name, size, uri: `file://${name}` });

test('media import preflight covers count, per-file bytes, known total bytes, and free storage', () => {
  const { evaluateMediaImportPreflight, limits } = loadModule();
  const ample = Number.MAX_SAFE_INTEGER;
  assert.equal(evaluateMediaImportPreflight({
    assets: Array.from({ length: limits.MEDIA_IMPORT_MAX_FILE_COUNT + 1 }, (_, index) => asset(String(index), 'image', 1)),
    freeBytes: ample,
    phase: 'before-copy',
    space: 'normal',
  }).code, 'count');
  assert.equal(evaluateMediaImportPreflight({
    assets: [asset('huge.jpg', 'image', limits.MEDIA_IMPORT_IMAGE_MAX_SINGLE_BYTES + 1)],
    freeBytes: ample,
    phase: 'before-copy',
    space: 'normal',
  }).code, 'single_image_bytes');
  assert.equal(evaluateMediaImportPreflight({
    assets: [asset('huge.mp4', 'video', limits.MEDIA_IMPORT_VIDEO_MAX_SINGLE_BYTES + 1)],
    freeBytes: ample,
    phase: 'before-copy',
    space: 'normal',
  }).code, 'single_video_bytes');
  assert.equal(evaluateMediaImportPreflight({
    assets: [asset('a.mp4', 'video', limits.MEDIA_IMPORT_MAX_TOTAL_BYTES / 2 + 1), asset('b.mp4', 'video', limits.MEDIA_IMPORT_MAX_TOTAL_BYTES / 2 + 1)],
    freeBytes: ample,
    phase: 'before-copy',
    space: 'normal',
  }).code, 'total_bytes');
  assert.equal(evaluateMediaImportPreflight({
    assets: [asset('a.jpg', 'image', 1024)],
    freeBytes: limits.MEDIA_IMPORT_MIN_FREE_STORAGE_BYTES,
    phase: 'before-copy',
    space: 'normal',
  }).code, 'storage');
});

test('unknown sizes reserve capacity, Personal uses the same isolated gate, and cancellation wins', () => {
  const { evaluateMediaImportPreflight, limits } = loadModule();
  const unknownCount = Math.floor(limits.MEDIA_IMPORT_MAX_TOTAL_BYTES / limits.MEDIA_IMPORT_UNKNOWN_SIZE_RESERVE_BYTES) + 1;
  const unknown = evaluateMediaImportPreflight({
    assets: Array.from({ length: unknownCount }, (_, index) => asset(String(index), 'video', null)),
    freeBytes: Number.MAX_SAFE_INTEGER,
    phase: 'before-copy',
    space: 'personal',
  });
  assert.equal(unknown.code, 'total_bytes');
  assert.match(unknown.message, /总大小/);

  const personal = evaluateMediaImportPreflight({
    assets: [asset('private.jpg', 'image', 1024)],
    freeBytes: Number.MAX_SAFE_INTEGER,
    phase: 'before-copy',
    space: 'personal',
  });
  assert.equal(personal.ok, true);

  const cancelled = evaluateMediaImportPreflight({
    assets: [asset('private.jpg', 'image', 1024)],
    cancelled: true,
    freeBytes: Number.MAX_SAFE_INTEGER,
    phase: 'before-copy',
    space: 'personal',
  });
  assert.equal(cancelled.code, 'cancelled');
  assert.match(cancelled.message, /取消/);
});

test('commit phase enforces actual cumulative bytes and retained storage headroom', () => {
  const { evaluateMediaImportPreflight, limits } = loadModule();
  assert.equal(evaluateMediaImportPreflight({
    assets: [asset('actual.mp4', 'video', 1)],
    freeBytes: Number.MAX_SAFE_INTEGER,
    phase: 'before-commit',
    space: 'normal',
    totalBytesAlreadyCommitted: limits.MEDIA_IMPORT_MAX_TOTAL_BYTES,
  }).code, 'total_bytes');
  assert.equal(evaluateMediaImportPreflight({
    assets: [asset('actual.jpg', 'image', 1)],
    freeBytes: limits.MEDIA_IMPORT_MIN_FREE_STORAGE_BYTES - 1,
    phase: 'before-commit',
    space: 'normal',
  }).code, 'storage');
});
