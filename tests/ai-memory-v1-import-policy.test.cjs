const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('native memory packages import without a model and project episodes, relations, and profiles', () => {
  const source = read('src/ai/memory/nativeMemoryPackageImportService.ts');
  assert.match(source, /MemoryFacade\.createClaim/);
  assert.match(source, /MemoryFacade\.upsertEpisode/);
  assert.match(source, /MemoryFacade\.upsertRelationalState/);
  assert.match(source, /MemoryFacade\.upsertProfile/);
  assert.match(source, /targetType.*episode/s);
  assert.match(source, /targetType.*relation/s);
  assert.match(source, /targetType.*profile/s);
  assert.match(source, /memoryReviewStatus: 'pending'/);
  assert.match(source, /session\.memoryReviewStatus === 'accepted'/);
  assert.match(source, /resumed: true/);
  assert.match(source, /withTransactionAsync/);
  assert.match(source, /sourceClaim\.safetyState !== 'safety_pending'/);
  assert.doesNotMatch(source, /A duplicate canonical claim is represented/);
  assert.doesNotMatch(source, /INSERT(?: OR IGNORE)? INTO memory_(?:episodes|relational_states|profiles)/);
  assert.doesNotMatch(source, /callMemoryMaintenanceModel/);
});

test('continuity rollback removes every mapped native memory projection before marking completion', () => {
  const source = read('src/ai/aiContinuityImportService.ts');
  assert.match(source, /MemoryFacade\.deleteClaim/);
  assert.match(source, /MemoryFacade\.deleteEpisode/);
  assert.match(source, /MemoryFacade\.deleteRelationalState/);
  assert.match(source, /MemoryFacade\.deleteProfile/);
  assert.match(source, /packageId = \?/);
  assert.match(source, /sourceType NOT IN \('review_claim', 'review_profile'\)/);
  assert.doesNotMatch(source, /deleteClaim[\s\S]{0,300}\.catch\(\(\) => undefined\)/);
});

test('external Personal review is consent-gated and writes through the v1 facade', () => {
  const source = read('src/ai/aiContinuityImportReviewService.ts');
  const facade = read('src/ai/memory/memoryFacade.ts');
  assert.match(source, /PERSONAL_EXTERNAL_IMPORT_REQUIRES_CONSENT|remoteModelConsent/);
  assert.match(source, /MemoryFacade\.createClaim/);
  assert.match(source, /MemoryFacade\.staleClaim/);
  assert.match(source, /MemoryFacade\.upsertProfile/);
  assert.match(source, /targetType, targetId[\s\S]*'profile'/);
  assert.match(source, /sourceMessageIdsJson/);
  assert.match(facade, /external_import_review/);
  assert.doesNotMatch(source, /aiThreadRepository\.createMemory/);
  assert.doesNotMatch(source, /updateMemoryByReconciliation/);
});

test('external review separates candidate extraction from independent audit', () => {
  const source = read('src/ai/aiContinuityImportReviewService.ts');
  const queue = read('src/ai/aiMemoryMaintenanceQueue.ts');
  const modelCalls = source.match(/callMemoryMaintenanceModel\s*\(/g) ?? [];

  assert.equal(modelCalls.length, 2);
  assert.match(source, /buildExternalCandidateExtractionPrompt/);
  assert.match(source, /parseExternalMemoryCandidates/);
  assert.match(source, /candidateId/);
  assert.match(source, /evidenceIds/);
  assert.match(source, /speechMode/);
  assert.match(source, /buildExternalCandidateAuditPrompt/);
  assert.match(source, /parseExternalMemoryAudit/);
  assert.match(source, /propose_add\|propose_supersede\|propose_conflict\|propose_ignore/);
  assert.doesNotMatch(source, /parseMemoryReconciliationOperations\(reviewText\)/);
  assert.doesNotMatch(source, /MemoryFacade\.(?:createClaim|editClaim|staleClaim)[\s\S]{0,500}?\.catch\(\(\) =>/);
  assert.match(source, /activeContinuityImportReviews/);
  assert.match(queue, /reviewContinuityImportSession/);
  assert.match(queue, /reviewGateState === 'pending_review'[\s\S]{0,500}reviewContinuityImportSession/);
});

test('stable memory prefix is sourced from the v1 claim projection', () => {
  const source = read('src/ai/aiMemoryService.ts');
  assert.match(source, /listV1MemoryBoardItems\(db, thread/);
  assert.match(source, /must come from the v1 ledger/);
});

test('stale claims are excluded from normal retrieval while historical retrieval can opt in', () => {
  const source = read('src/ai/memory/memoryRetrievalService.ts');
  assert.match(source, /status <> 'stale'/);
  assert.match(source, /includeStale\?/);
});

test('native export excludes deleted projections and native import honors deletion tombstones', () => {
  const exporter = read('src/ai/memory/nativeMemoryPackage.ts');
  const importer = read('src/ai/memory/nativeMemoryPackageImportService.ts');
  assert.match(exporter, /status NOT IN \('deleted', 'suppressed'\)/);
  assert.match(importer, /tombstones/);
  assert.match(importer, /memory_deletion_certificates/);
  assert.match(importer, /messageIdMap/);
  assert.match(importer, /sourceMessageId: importedSourceMessageId/);
  assert.match(importer, /scopeType === 'thread'/);
  assert.match(importer, /scopeId:[\s\S]{0,100}input\.threadId/);
  assert.match(importer, /const targetCanonicalClaimId = remapsConversationScope[\s\S]*buildCanonicalClaimId/);
  assert.match(importer, /claimScopeKey\(targetCanonicalClaimId, remappedClaimInput\.scopeType/);
  assert.match(importer, /const importedSourceMessageId = remappedClaimInput\.sourceMessageId/);
  assert.match(importer, /remappedClaimInput\.sourceMessageId && !importedSourceMessageId/);
});

test('native role continuity export only includes the active context scopes and their event evidence', () => {
  const exporter = read('src/ai/memory/nativeMemoryPackage.ts');
  const roleExporter = read('src/ai/aiRoleCardContinuityExportService.ts');
  assert.match(exporter, /buildPackageScopeFilter/);
  assert.match(exporter, /c\.sourceMessageId IS NULL OR c\.sourceMessageId IN/);
  assert.match(exporter, /aggregateType = \? AND aggregateId IN/);
  assert.match(exporter, /memory_evidence WHERE space = \? AND id IN/);
  assert.match(roleExporter, /roleCardId: roleCard\.id/);
});

test('memory quality and cost envelope metrics are executable pure functions', () => {
  const source = read('src/ai/memory/memoryDiagnostics.ts');
  assert.match(source, /computeMemoryQualityMetrics/);
  assert.match(source, /estimateMaintenanceCostEnvelope/);
  assert.match(source, /recallAtK/);
  assert.match(source, /maintenanceShare/);
});

test('relational state is accumulated with bounded evidence and decay', () => {
  const source = read('src/ai/memory/memoryRelationalStateService.ts');
  assert.match(source, /MemoryFacade\.upsertRelationalState/);
  assert.doesNotMatch(source, /INSERT INTO memory_relational_states/);
  assert.match(source, /decayHalfLifeDays/);
  assert.match(source, /evidenceIdsJson/);
  assert.match(read('src/ai/aiMemoryMaintenanceQueue.ts'), /recordRelationalSignals/);
  assert.match(read('src/ai/aiMemoryService.ts'), /buildRelationalStateText/);
});
