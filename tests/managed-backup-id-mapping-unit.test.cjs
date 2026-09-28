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

test('branch scopes and profile event aggregates use their real polymorphic targets', () => {
  const maps = new Map([
    ['ai_messages', new Map([['root-old', 'root-new']])],
    ['memory_profiles', new Map([['profile-old', 'profile-new']])],
  ]);
  assert.equal(mapping.remapManagedLogicalReferences({ scopeType: 'branch', scopeId: 'root-old:2' }, maps, 'memory_claims').scopeId, 'root-new:2');
  assert.equal(mapping.remapManagedLogicalReferences({ aggregateType: 'import', aggregateId: 'profile-old' }, maps, 'memory_events').aggregateId, 'profile-new');
});

test('declared JSON entity rules remap replay payload and continuity rollback snapshot IDs', () => {
  const maps = new Map([
    ['memory_claims', new Map([['claim-old', 'claim-new']])],
    ['ai_messages', new Map([['message-old', 'message-new']])],
    ['memory_evidence', new Map([['evidence-old', 'evidence-new']])],
    ['ai_user_profiles', new Map([['legacy-old', 'legacy-new']])],
  ]);
  const eventPayload = mapping.remapManagedJsonReferences(
    { claim: { id: 'claim-old', canonicalClaimId: 'canonical-old', sourceMessageId: 'unchanged' } },
    maps,
    { column: 'payloadJson', row: { aggregateType: 'claim', eventType: 'claim_created' }, table: 'memory_events' },
  );
  assert.equal(eventPayload.claim.id, 'claim-new');
  assert.equal(eventPayload.claim.canonicalClaimId, 'canonical-old:managed-restore:claim-new');

  const provenancePayload = mapping.remapManagedJsonReferences({
    episode: { id: 'episode', sourceClaimIdsJson: '["claim-old"]', sourceMessageIdsJson: '["message-old"]' },
    profile: { id: 'profile', sourceClaimIdsJson: '["claim-old"]', sourceMessageIdsJson: '["message-old"]' },
    relation: { id: 'relation', evidenceIdsJson: '["evidence-old"]' },
  }, maps, { column: 'payloadJson', row: { aggregateType: 'episode' }, table: 'memory_events' });
  assert.deepEqual(JSON.parse(provenancePayload.episode.sourceClaimIdsJson), ['claim-new']);
  assert.deepEqual(JSON.parse(provenancePayload.episode.sourceMessageIdsJson), ['message-new']);
  assert.deepEqual(JSON.parse(provenancePayload.profile.sourceClaimIdsJson), ['claim-new']);
  assert.deepEqual(JSON.parse(provenancePayload.profile.sourceMessageIdsJson), ['message-new']);
  assert.deepEqual(JSON.parse(provenancePayload.relation.evidenceIdsJson), ['evidence-new']);

  for (const column of ['beforeStateJson', 'afterStateJson']) {
    const snapshot = mapping.remapManagedJsonReferences(
      { id: 'legacy-old', profileText: 'snapshot' },
      maps,
      { column, row: { effectType: 'profile_upsert' }, table: 'ai_continuity_import_effects' },
    );
    assert.equal(snapshot.id, 'legacy-new');
  }
});
