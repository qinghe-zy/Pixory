const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadPickerWithDocumentResult(result, calls, deletes = []) {
  const filename = path.join(root, 'src/services/mediaFilePickerService.ts');
  const originalExtension = require.extensions['.ts'];
  const originalLoad = Module._load;
  require.extensions['.ts'] = function compileTypeScript(module, sourcePath) {
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: sourcePath,
    }).outputText;
    module._compile(output, sourcePath);
  };
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'expo-document-picker') {
      return {
        getDocumentAsync: async (options) => {
          calls.push(options);
          return result;
        },
      };
    }
    if (request === 'expo-file-system/legacy') {
      return {
        cacheDirectory: 'file:///cache/',
        deleteAsync: async (uri, options) => {
          deletes.push({ options, uri });
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename);
  } finally {
    Module._load = originalLoad;
    if (originalExtension) {
      require.extensions['.ts'] = originalExtension;
    } else {
      delete require.extensions['.ts'];
    }
  }
}

test('image file picker requests readable cached multi-selection', async () => {
  const calls = [];
  const picker = loadPickerWithDocumentResult({
    canceled: false,
    assets: [
      { uri: 'file:///cache/a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', size: 12 },
      { uri: 'file:///cache/b.png', name: 'b.png', mimeType: 'image/png', size: 34 },
    ],
  }, calls);

  const result = await picker.pickMediaFilesForImport('image');

  assert.deepEqual(calls, [{ type: 'image/*', multiple: true, copyToCacheDirectory: true }]);
  assert.equal(result.canceled, false);
  assert.equal(result.pickedFiles.length, 2);
  assert.equal(result.pickedFiles[0].sourceKind, 'files');
  assert.equal(result.pickedFiles[0].assetId, null);
  assert.equal(result.pickedFiles[0].temporaryInput, true);
});

test('video file picker uses video MIME filtering and preserves cancellation', async () => {
  const calls = [];
  const picker = loadPickerWithDocumentResult({ canceled: true, assets: [] }, calls);

  const result = await picker.pickMediaFilesForImport('video');

  assert.deepEqual(calls, [{ type: 'video/*', multiple: true, copyToCacheDirectory: true }]);
  assert.deepEqual(result, { canceled: true, pickedFiles: [] });
});

test('temporary input cleanup deletes only explicitly owned Expo cache files', async () => {
  const calls = [];
  const deletes = [];
  const picker = loadPickerWithDocumentResult({ canceled: true, assets: [] }, calls, deletes);

  await picker.cleanupTemporaryMediaInputs([
    { temporaryInput: true, uri: 'file:///cache/owned.jpg' },
    { temporaryInput: false, uri: 'file:///cache/not-owned.jpg' },
    { temporaryInput: true, uri: 'file:///documents/original.jpg' },
  ]);

  assert.deepEqual(deletes, [{ uri: 'file:///cache/owned.jpg', options: { idempotent: true } }]);
});
