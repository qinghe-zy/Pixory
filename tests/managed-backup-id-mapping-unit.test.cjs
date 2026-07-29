const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const original = require.extensions['.ts'];
require.extensions['.ts'] = function compile(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
let mapping;
try { mapping = require(path.join(root, 'src/services/managedBackupIdMapping.ts')); }
finally { if (original) require.extensions['.ts'] = original; else delete require.extensions['.ts']; }

test('backup import IDs are deterministic per package and isolated across packages', () => {
  const first = mapping.createMappedLogicalId('package-a', 'ai_threads', 'thread');
  assert.equal(first, mapping.createMappedLogicalId('package-a', 'ai_threads', 'thread'));
  assert.notEqual(first, mapping.createMappedLogicalId('package-b', 'ai_threads', 'thread'));
  assert.match(first, /^mbk_[a-f0-9]{32}$/);
});

test('logical references in nested JSON follow role, thread, message, document and job maps', () => {
  const maps = new Map([
    ['ai_role_cards', new Map([['role-a', 'role-b']])],
    ['ai_threads', new Map([['thread-a', 'thread-b']])],
    ['ai_messages', new Map([['message-a', 'message-b']])],
    ['ai_documents', new Map([['document-a', 'document-b']])],
    ['companion_thought_jobs', new Map([['job-a', 'job-b']])],
  ]);
  const value = mapping.remapManagedLogicalReferences({
    roleCardId: 'role-a', threadId: 'thread-a', sourceMessageIds: ['message-a'],
    documentId: 'document-a', jobId: 'job-a', nested: { deliveredMessageId: 'message-a' },
  }, maps, 'companion_thoughts');
  assert.deepEqual(value, {
    roleCardId: 'role-b', threadId: 'thread-b', sourceMessageIds: ['message-b'],
    documentId: 'document-b', jobId: 'job-b', nested: { deliveredMessageId: 'message-b' },
  });
});
