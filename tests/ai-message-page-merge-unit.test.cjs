const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadModule() {
  const filename = path.join(root, 'src/ai/aiMessagePageMerge.ts');
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { exports: module.exports, module }, { filename });
  return module.exports;
}

const message = (id, createdAt, value = id) => ({ id, createdAt, value });

test('linear page merge preserves createdAt/id order and current-page ownership on overlap', () => {
  const { mergeOrderedMessagePages } = loadModule();
  const older = [message('a', '1'), message('a', '1'), message('b', '2', 'stale'), message('c', '2')];
  const current = [message('b', '2', 'current'), message('d', '3')];
  const merged = mergeOrderedMessagePages(older, current);

  assert.equal(
    JSON.stringify(merged.map((item) => `${item.id}:${item.value}`)),
    JSON.stringify(['a:a', 'b:current', 'c:c', 'd:d']),
  );
});

test('loading one hundred pages never calls Array.sort on accumulated history', () => {
  const { mergeOrderedMessagePages } = loadModule();
  const originalSort = Array.prototype.sort;
  let accumulated = [];
  Array.prototype.sort = () => { throw new Error('full accumulated sort is forbidden'); };
  try {
    for (let page = 99; page >= 0; page -= 1) {
      const older = Array.from({ length: 60 }, (_, index) => {
        const number = page * 60 + index;
        return message(String(number).padStart(6, '0'), String(number).padStart(6, '0'));
      });
      accumulated = mergeOrderedMessagePages(older, accumulated);
    }
  } finally {
    Array.prototype.sort = originalSort;
  }
  assert.equal(accumulated.length, 6000);
  assert.equal(accumulated[0].id, '000000');
  assert.equal(accumulated.at(-1).id, '005999');
});
