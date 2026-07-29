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
    ['companion_diary_versions', new Map([['version-a', 'version-b']])],
    ['ai_thread_summary_segments', new Map([['segment-a', 'segment-b']])],
    ['memory_evidence', new Map([['evidence-a', 'evidence-b']])],
    ['ai_generation_ids', new Map([['generation-a', 'generation-b']])],
    ['ai_memories', new Map([['memory-a', 'memory-b']])],
  ]);
  const value = mapping.remapManagedLogicalReferences({
    roleCardId: 'role-a', threadId: 'thread-a', sourceMessageIds: ['message-a'],
    documentId: 'document-a', jobId: 'job-a', currentVersionId: 'version-a',
    sourceSegmentIds: ['segment-a'], evidenceIds: ['evidence-a'], generationId: 'generation-a',
    preImportBranchRootMessageId: 'message-a', importAnchorMessageId: 'message-a',
    effectType: 'memory_update', targetRecordId: 'memory-a', nested: { deliveredMessageId: 'message-a' },
  }, maps, 'ai_continuity_import_effects');
  assert.deepEqual(value, {
    roleCardId: 'role-b', threadId: 'thread-b', sourceMessageIds: ['message-b'],
    documentId: 'document-b', jobId: 'job-a', currentVersionId: 'version-a',
    sourceSegmentIds: ['segment-b'], evidenceIds: ['evidence-b'], generationId: 'generation-b',
    preImportBranchRootMessageId: 'message-b', importAnchorMessageId: 'message-b',
    effectType: 'memory_update', targetRecordId: 'memory-b', nested: { deliveredMessageId: 'message-b' },
  });
});

test('table-specific diary version and thought job references use their canonical maps', () => {
  const maps = new Map([
    ['companion_diary_versions', new Map([['version-a', 'version-b']])],
    ['companion_thought_jobs', new Map([['job-a', 'job-b']])],
  ]);
  assert.equal(mapping.remapManagedLogicalReferences({ currentVersionId: 'version-a' }, maps, 'companion_diaries').currentVersionId, 'version-b');
  assert.equal(mapping.remapManagedLogicalReferences({ jobId: 'job-a' }, maps, 'companion_thoughts').jobId, 'job-b');
});
