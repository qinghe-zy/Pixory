const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const gatePath = path.join(root, 'src/hooks/pagedRequestGate.ts');

test('request gate invalidates results from an old space or filter', () => {
  assert.equal(fs.existsSync(gatePath), true, 'paged request gate has not been implemented');

  const previousTsLoader = require.extensions['.ts'];
  require.extensions['.ts'] = function compileTypeScript(module, filename) {
    module._compile(
      ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      filename
    );
  };

  try {
    const { createPagedRequestGate } = require(gatePath);
    const gate = createPagedRequestGate('normal:all');
    const normalRequest = gate.beginRequest();
    assert.equal(gate.isCurrent(normalRequest), true);

    gate.syncRequestKey('personal:all');
    assert.equal(gate.isCurrent(normalRequest), false);
    const personalRequest = gate.beginRequest();
    assert.equal(gate.isCurrent(personalRequest), true);

    gate.invalidate();
    assert.equal(gate.isCurrent(personalRequest), false);
  } finally {
    if (previousTsLoader) require.extensions['.ts'] = previousTsLoader;
    else delete require.extensions['.ts'];
  }
});
