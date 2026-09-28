const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const canonicalPath = path.join(root, 'src/ai/memory/memoryCanonicalization.ts');
const eventPath = path.join(root, 'src/ai/memory/memoryEventRepository.ts');
const facadePath = path.join(root, 'src/ai/memory/memoryFacade.ts');
const indexOutboxPath = path.join(root, 'src/ai/memory/memoryIndexOutboxService.ts');
const maintenanceQueuePath = path.join(root, 'src/ai/aiMemoryMaintenanceQueue.ts');
const typesPath = path.join(root, 'src/ai/memory/memoryTypes.ts');

function loadTypeScriptModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filePath,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(transpiled, {
    exports: module.exports,
    module,
    require(request) {
      if (request === '../../database/utils') {
        return { createTimestamp: () => '2026-07-27T00:00:00.000Z' };
      }
      return require(request);
    },
    TextEncoder,
  }, { filename: filePath });
  return module.exports;
}

test('canonicalization exposes stable tuple hashing and calibrated confidence fallback', () => {
  const canonical = loadTypeScriptModule(canonicalPath);
  const first = canonical.buildCanonicalClaimId({
    schemaVersion: 1,
    privacyDomain: 'normal',
    scopeType: 'thread',
    scopeId: 'thread-1',
    subjectEntityId: 'user',
    predicate: 'preference.food',
    polarity: 'positive',
    canonicalObject: '辣',
    validTimeBucket: 'unknown',
  });
  const second = canonical.buildCanonicalClaimId({
    schemaVersion: 1,
    privacyDomain: 'normal',
    scopeType: 'thread',
    scopeId: 'thread-1',
    subjectEntityId: 'user',
    predicate: 'preference.food',
    polarity: 'positive',
    canonicalObject: '辣',
    validTimeBucket: 'unknown',
  });
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(canonical.resolveCalibratedConfidence(null, 'high'), 0.95);
  assert.equal(canonical.resolveCalibratedConfidence(null, 'medium'), 0.7);
});

test('event repository defines deterministic command sequence idempotency', () => {
  const source = fs.readFileSync(eventPath, 'utf8');
  const events = loadTypeScriptModule(eventPath);
  assert.match(source, /eventSequence/);
  assert.match(source, /aggregateType/);
  assert.match(source, /eventType/);
  assert.match(source, /idempotencyKey/);
  assert.match(source, /0x1F|\\u001F/);
  assert.match(source, /sha256|sha2/);
  const first = events.deriveMemoryCommandAggregateId('mclaim', 'normal', 'command-1', 'create');
  const replay = events.deriveMemoryCommandAggregateId('mclaim', 'normal', 'command-1', 'create');
  const other = events.deriveMemoryCommandAggregateId('mclaim', 'normal', 'command-2', 'create');
  assert.equal(first, replay);
  assert.notEqual(first, other);
});

test('MemoryFacade is the only v1 claim write entry point', () => {
  const source = fs.readFileSync(facadePath, 'utf8');
  const memoryService = fs.readFileSync(path.join(root, 'src/ai/aiMemoryService.ts'), 'utf8');
  assert.match(source, /export (async )?function createClaim/);
  assert.match(source, /export (async )?function editClaim/);
  assert.match(source, /export (async )?function deleteClaim/);
  assert.match(source, /MemoryFacade/);
  assert.match(source, /withTransactionAsync/);
  assert.match(source, /deriveMemoryCommandAggregateId/);
  assert.match(source, /if \(current\.id === claim\.id\)/);
  assert.match(source, /findMemoryClaimById\(db, input\.space, replacementId\)/);
  assert.match(source, /export (async )?function touchClaims/);
  assert.match(memoryService, /MemoryFacade\.touchClaims/);
  assert.doesNotMatch(memoryService, /UPDATE memory_claims/);
  assert.doesNotMatch(memoryService, /aiThreadRepository\.(?:updateMemoryContent|updateMemoryStatus)/);
});

test('episode, relation, and profile projections also enter through ledger-backed facade commands', () => {
  const source = fs.readFileSync(facadePath, 'utf8');
  assert.match(source, /export (async )?function upsertEpisode/);
  assert.match(source, /eventType: 'episode_upserted'/);
  assert.match(source, /export (async )?function upsertRelationalState/);
  assert.match(source, /eventType: 'relation_upserted'/);
  assert.match(source, /export (async )?function upsertProfile/);
  assert.match(source, /eventType: 'profile_upserted'/);
  assert.match(source, /export (async )?function deleteEpisode/);
  assert.match(source, /export (async )?function deleteRelationalState/);
  assert.match(source, /export (async )?function deleteProfile/);
});

test('automatic confirmation does not create a manual lock and safety confirmation requires the user', () => {
  const types = loadTypeScriptModule(typesPath);
  const automatic = types.resolveConfirmationGovernance({ manualLocked: false, safetyState: 'none' }, 'system');
  assert.equal(automatic.manualLocked, false);
  assert.equal(automatic.safetyState, 'none');
  const manual = types.resolveConfirmationGovernance({ manualLocked: false, safetyState: 'none' }, 'user');
  assert.equal(manual.manualLocked, true);
  assert.equal(manual.safetyState, 'none');
  assert.throws(
    () => types.resolveConfirmationGovernance({ manualLocked: false, safetyState: 'safety_pending' }, 'system'),
    /memory_safety_confirmation_requires_user/
  );
  const safety = types.resolveConfirmationGovernance({ manualLocked: false, safetyState: 'safety_pending' }, 'user');
  assert.equal(safety.manualLocked, true);
  assert.equal(safety.safetyState, 'safety_confirmed');
});

test('conflicted claims remain explicit and native imports preserve the conflict state', () => {
  const facade = fs.readFileSync(path.join(root, 'src/ai/memory/memoryFacade.ts'), 'utf8');
  const importer = fs.readFileSync(path.join(root, 'src/ai/memory/nativeMemoryPackageImportService.ts'), 'utf8');
  assert.match(facade, /eventType: 'claim_conflicted'/);
  assert.match(facade, /status: 'conflicted'/);
  assert.match(importer, /sourceStatus === 'conflicted'/);
});

test('prompt-visible memory writes advance memoryEpoch and evidence hashes the quote', () => {
  const facade = fs.readFileSync(facadePath, 'utf8');
  assert.match(facade, /incrementEpoch:\s*true/);
  assert.match(facade, /quote/);
  assert.match(facade, /hashMemoryValue\(quote\)/);
});

test('memory index outbox has a deterministic v1 consumer', () => {
  assert.ok(fs.existsSync(indexOutboxPath));
  const consumer = fs.readFileSync(indexOutboxPath, 'utf8');
  const queue = fs.readFileSync(maintenanceQueuePath, 'utf8');
  assert.match(consumer, /memory_embedding_upsert/);
  assert.match(consumer, /memory_delete_indexes/);
  assert.match(consumer, /status = 'done'/);
  assert.match(queue, /drainMemoryIndexOutbox/);
});

test('automatic claim creation cannot recreate a tombstoned canonical claim', () => {
  const facade = fs.readFileSync(facadePath, 'utf8');
  assert.match(facade, /status IN \('deleted', 'suppressed'\)/);
  assert.match(facade, /memory_claim_tombstoned/);
  assert.match(facade, /input\.sourceKind === 'manual'/);
});
