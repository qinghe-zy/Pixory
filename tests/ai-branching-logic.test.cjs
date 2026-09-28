const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTypescriptModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(output.outputText, filename);
  return mod.exports;
}

const {
  getActiveBranchForNextMessageFromVisibleMessages,
  messageMatchesSelectedBranchPath,
} = loadTypescriptModule('src/ai/aiBranching.ts');

function message(id, branchRootMessageId = null, branchVersionIndex = null, versionTotal = 1) {
  return { id, branchRootMessageId, branchVersionIndex, versionTotal };
}

function visibleIds(messages, selectedVersionByMessageId = {}) {
  const byId = new Map(messages.map((item) => [item.id, item]));
  return messages
    .filter((item) => messageMatchesSelectedBranchPath(item, byId, selectedVersionByMessageId))
    .map((item) => item.id);
}

test('branch visibility hides sibling and nested descendants when parent version switches', () => {
  const messages = [
    message('u1', null, null, 2),
    message('a1_old', 'u1', 1),
    message('u2_old', 'u1', 1, 2),
    message('a2_old', 'u2_old', 1),
    message('a2_new_inside_old', 'u2_old', 2),
    message('a1_new', 'u1', 2),
  ];

  assert.deepEqual(visibleIds(messages, { u1: 1, u2_old: 2 }), [
    'u1',
    'a1_old',
    'u2_old',
    'a2_new_inside_old',
  ]);
  assert.deepEqual(visibleIds(messages, { u1: 2, u2_old: 2 }), [
    'u1',
    'a1_new',
  ]);
});

test('branch visibility hides children when the branch root is missing from the loaded page', () => {
  const messages = [
    message('a_child', 'u_missing', 2),
    message('plain'),
  ];

  assert.deepEqual(visibleIds(messages, {}), ['plain']);
});

test('branch visibility rejects cyclic branch roots instead of leaking content', () => {
  const messages = [
    message('a', 'b', 1),
    message('b', 'a', 1),
  ];

  assert.deepEqual(visibleIds(messages, { a: 1, b: 1 }), []);
});

test('branch visibility handles deep branch chains without recursive stack pressure', () => {
  const messages = [message('root', null, null, 2)];
  const selected = { root: 2 };
  let previousId = 'root';
  for (let index = 1; index <= 15000; index += 1) {
    const id = `m${index}`;
    messages.push(message(id, previousId, 2, 2));
    selected[id] = 2;
    previousId = id;
  }

  const byId = new Map(messages.map((item) => [item.id, item]));

  assert.equal(messageMatchesSelectedBranchPath(messages.at(-1), byId, selected), true);
});

test('next send inherits the deepest visible branch after edits and regenerations', () => {
  assert.deepEqual(
    getActiveBranchForNextMessageFromVisibleMessages([
      message('u1', null, null, 2),
      message('a1_new', 'u1', 2),
      message('u2_new', 'u1', 2),
    ], { u1: 2 }),
    { branchRootMessageId: 'u1', branchVersionIndex: 2 }
  );

  assert.deepEqual(
    getActiveBranchForNextMessageFromVisibleMessages([
      message('u1', null, null, 2),
      message('a1_new', 'u1', 2, 3),
    ], { u1: 2, a1_new: 3 }),
    { branchRootMessageId: 'a1_new', branchVersionIndex: 3 }
  );
});
