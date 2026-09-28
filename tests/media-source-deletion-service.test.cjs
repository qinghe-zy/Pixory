const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadService(deleteAssetsAsync) {
  const filename = path.join(root, 'src/services/mediaSourceDeletionService.ts');
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
  Module._load = function mockLoad(request, parent, isMain) {
    if (request === 'expo-media-library') {
      return { deleteAssetsAsync };
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

test('successful image and video imports share one deduplicated MediaStore deletion request', async () => {
  const calls = [];
  const { deleteMediaStoreAssetsWithConfirmation } = loadService(async (ids) => {
    calls.push(ids);
    return true;
  });

  const deleted = await deleteMediaStoreAssetsWithConfirmation(['image-1', 'video-1', 'image-1', '', '  ']);

  assert.equal(deleted, true);
  assert.deepEqual(calls, [['image-1', 'video-1']]);
});

test('an empty pending list does not open Android deletion confirmation', async () => {
  let callCount = 0;
  const { deleteMediaStoreAssetsWithConfirmation } = loadService(async () => {
    callCount += 1;
    return true;
  });

  assert.equal(await deleteMediaStoreAssetsWithConfirmation([]), true);
  assert.equal(callCount, 0);
});
