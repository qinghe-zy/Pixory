const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'src/ai/aiMemoryReconciliationService.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
  fileName: sourcePath,
}).outputText;

function loadModule() {
  const module = { exports: {} };
  vm.runInNewContext(transpiled, {
    exports: module.exports,
    module,
    require,
  }, { filename: sourcePath });
  return module.exports;
}

const {
  parseMemoryReconciliationOperations,
  sanitizeMemoryReconciliationOperations,
  normalizeMemoryContentForReconciliation,
} = loadModule();

function memory(overrides) {
  return {
    content: '用户喜欢红色',
    id: 'mem_old_red',
    scope: 'global',
    scopeId: null,
    sourceKind: 'auto',
    space: 'normal',
    status: 'active',
    ...overrides,
  };
}

test('memory reconciliation parser accepts JSON operations and normalizes content', () => {
  const operations = parseMemoryReconciliationOperations(`\`\`\`json
  {"operations":[
    {"op":"update","targetMemoryId":"mem_old_red","content":"用户近期更偏好蓝色","type":"preference","confidence":0.86,"importance":3,"reason":"新偏好覆盖旧偏好"},
    {"op":"keep","targetMemoryId":"mem_keep","confidence":0.7,"reason":"不冲突"},
    {"op":"unknown","targetMemoryId":"mem_old_red","confidence":1}
  ]}
  \`\`\``);

  assert.equal(operations.length, 2);
  assert.equal(operations[0].op, 'update');
  assert.equal(operations[0].content, '用户近期更偏好蓝色');
  assert.equal(operations[1].op, 'keep');
  assert.equal(normalizeMemoryContentForReconciliation('  用户   喜欢 红色  '), '用户 喜欢 红色');
});

test('memory reconciliation validation blocks unknown targets, low confidence stale, and manual stale', () => {
  const candidateMemories = [
    memory({ id: 'mem_old_red', scope: 'thread', scopeId: 'thread_1' }),
    memory({ content: '手动：用户偏好红色', id: 'mem_manual_red', scope: 'thread', scopeId: 'thread_1', sourceKind: 'manual' }),
  ];
  const operations = [
    { confidence: 0.86, content: '用户近期更偏好蓝色', importance: 3, op: 'update', targetMemoryId: 'mem_old_red', type: 'preference' },
    { confidence: 0.5, op: 'stale', targetMemoryId: 'mem_old_red' },
    { confidence: 0.92, op: 'stale', targetMemoryId: 'mem_manual_red', reason: '冲突' },
    { confidence: 0.9, op: 'keep', targetMemoryId: 'mem_missing' },
    { confidence: 0.83, content: '用户以后默认蓝色', importance: 3, op: 'add', scope: 'global', type: 'preference' },
  ];

  const sanitized = sanitizeMemoryReconciliationOperations({
    allowedScopes: [{ scope: 'thread', scopeId: 'thread_1' }],
    candidateMemories,
    operations,
    space: 'normal',
  });

  assert.equal(sanitized.accepted.map((operation) => operation.op).join(','), 'update');
  assert.match(sanitized.rejected.map((item) => item.reason).join(','), /low_confidence_stale/);
  assert.match(sanitized.rejected.map((item) => item.reason).join(','), /unknown_target/);
  assert.match(sanitized.rejected.map((item) => item.reason).join(','), /manual_memory_requires_user_action/);
  assert.match(sanitized.rejected.map((item) => item.reason).join(','), /global_scope_requires_manual_action/);
  assert.equal(sanitized.manualConflicts.length, 1);
  assert.equal(sanitized.manualConflicts[0].memoryId, 'mem_manual_red');
});

test('memory reconciliation may stale legacy automatic global memory but cannot update it', () => {
  const candidateMemories = [
    memory({ id: 'mem_legacy_global', scope: 'global', scopeId: null, sourceKind: 'auto' }),
    memory({ id: 'mem_manual_global', scope: 'global', scopeId: null, sourceKind: 'manual' }),
  ];
  const operations = [
    { confidence: 0.91, op: 'stale', targetMemoryId: 'mem_legacy_global', reason: '旧自动全局记忆不再允许' },
    { confidence: 0.91, content: '用户改成默认蓝色', op: 'update', targetMemoryId: 'mem_legacy_global', type: 'preference' },
    { confidence: 0.91, op: 'stale', targetMemoryId: 'mem_manual_global', reason: '手动全局记忆必须用户处理' },
  ];

  const sanitized = sanitizeMemoryReconciliationOperations({
    allowedScopes: [{ scope: 'thread', scopeId: 'thread_1' }],
    candidateMemories,
    operations,
    space: 'normal',
  });

  assert.equal(sanitized.accepted.map((operation) => operation.op).join(','), 'stale');
  assert.equal(sanitized.accepted[0].targetMemoryId, 'mem_legacy_global');
  assert.match(sanitized.rejected.map((item) => item.reason).join(','), /global_target_requires_manual_action/);
});
