const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath) {
  const filename = path.join(root, relativePath);
  const originalExtension = require.extensions['.ts'];
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
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename);
  } finally {
    if (originalExtension) {
      require.extensions['.ts'] = originalExtension;
    } else {
      delete require.extensions['.ts'];
    }
  }
}

test('file selections remain copy-only even when the page requests move', () => {
  const { resolvePickedAssetImportMode } = loadTypeScriptModule('src/services/mediaImportSourcePolicy.ts');

  assert.equal(resolvePickedAssetImportMode('files', 'move'), 'copy');
  assert.equal(resolvePickedAssetImportMode('album', 'move'), 'move');
  assert.equal(resolvePickedAssetImportMode('album', 'copy'), 'copy');
});

test('an unfinished source deletion is reported as partial success', () => {
  const { toMoveDeletionNotice } = loadTypeScriptModule('src/services/mediaImportSourcePolicy.ts');

  assert.equal(toMoveDeletionNotice(true), null);
  assert.deepEqual(toMoveDeletionNotice(false), {
    message: '导入成功，原文件未删除',
    sourceDeleted: false,
  });
});
