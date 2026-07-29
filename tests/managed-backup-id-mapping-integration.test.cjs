const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalTs = require.extensions['.ts'];
const originalLoad = Module._load;
require.extensions['.ts'] = function compile(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
Module._load = function mockExpo(request, parent, isMain) {
  if (request === 'expo-file-system') return { File: class File {} };
  if (request === 'expo-file-system/legacy') return { documentDirectory: 'file:///test/' };
  if (request === 'expo-sqlite') return { openDatabaseAsync: async () => { throw new Error('unexpected database open'); } };
  if (request.endsWith('pixoryMediaModule')) return { copyUriToFileWithProgress: async () => undefined };
  return originalLoad.call(this, request, parent, isMain);
};
let memoryProjection, schemaModule, service;
try {
  schemaModule = require(path.join(root, 'src/database/schema.ts'));
  memoryProjection = require(path.join(root, 'src/ai/memory/memoryProjectionService.ts'));
  service = require(path.join(root, 'src/services/managedBackupService.ts'));
}
finally {
  Module._load = originalLoad;
  if (originalTs) require.extensions['.ts'] = originalTs; else delete require.extensions['.ts'];
}

class DB {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  async execAsync(sql) { this.db.exec(sql); }
  async runAsync(sql, ...params) { return this.db.prepare(sql).run(...params); }
  async getFirstAsync(sql, ...params) { return this.db.prepare(sql).get(...params) ?? null; }
  async getAllAsync(sql, ...params) { return this.db.prepare(sql).all(...params); }
  async closeAsync() { this.db.close(); }
}

function schema(db, includeImportMap) {
  db.db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE ai_role_cards(id TEXT PRIMARY KEY, space TEXT, name TEXT, avatarEnabled INTEGER, avatarUri TEXT);
    CREATE TABLE ai_threads(id TEXT PRIMARY KEY, space TEXT, title TEXT, roleCardId TEXT);
    CREATE TABLE ai_messages(id TEXT PRIMARY KEY, threadId TEXT, space TEXT, role TEXT, status TEXT, content TEXT, updatedAt TEXT, FOREIGN KEY(threadId) REFERENCES ai_threads(id));
    CREATE VIRTUAL TABLE ai_message_fts USING fts5(id UNINDEXED, threadId UNINDEXED, role UNINDEXED, content, updatedAt UNINDEXED);
    CREATE TABLE ai_documents(id TEXT PRIMARY KEY, space TEXT, ownerType TEXT, ownerId TEXT, title TEXT, localUri TEXT);
    CREATE TABLE ai_user_profiles(id TEXT PRIMARY KEY, space TEXT, profileText TEXT);
    CREATE TABLE ai_memories(id TEXT PRIMARY KEY, space TEXT, content TEXT);
    CREATE TABLE companion_thought_jobs(id TEXT PRIMARY KEY, space TEXT, threadId TEXT, roleCardId TEXT, eventIdsJson TEXT, idempotencyKey TEXT UNIQUE, FOREIGN KEY(threadId) REFERENCES ai_threads(id));
    CREATE TABLE companion_thoughts(id TEXT PRIMARY KEY, space TEXT, sourceThreadId TEXT, roleCardId TEXT, jobId TEXT, eventIdsJson TEXT, sourceMessageIdsJson TEXT, body TEXT, idempotencyKey TEXT UNIQUE, FOREIGN KEY(sourceThreadId) REFERENCES ai_threads(id), FOREIGN KEY(jobId) REFERENCES companion_thought_jobs(id));
    CREATE TABLE companion_diaries(id TEXT PRIMARY KEY, roleCardId TEXT, currentVersionId TEXT, body TEXT);
    CREATE TABLE companion_diary_versions(id TEXT PRIMARY KEY, diaryId TEXT, body TEXT, FOREIGN KEY(diaryId) REFERENCES companion_diaries(id));
    CREATE TABLE ai_thread_summary_segments(id TEXT PRIMARY KEY, threadId TEXT, space TEXT, sourceSegmentIdsJson TEXT, summaryText TEXT);
    CREATE TABLE ai_continuity_import_sessions(id TEXT PRIMARY KEY, threadId TEXT, space TEXT, preImportBranchRootMessageId TEXT, importedBranchRootMessageId TEXT, importAnchorMessageId TEXT);
    CREATE TABLE ai_continuity_import_effects(id TEXT PRIMARY KEY, importSessionId TEXT, effectOrder INTEGER, effectType TEXT, targetRecordId TEXT, beforeStateJson TEXT, afterStateJson TEXT, createdAt TEXT, FOREIGN KEY(importSessionId) REFERENCES ai_continuity_import_sessions(id));
    CREATE TABLE memory_claims(id TEXT PRIMARY KEY, space TEXT, scopeType TEXT, scopeId TEXT, valueDisplay TEXT);
    CREATE TABLE memory_profiles(id TEXT PRIMARY KEY, space TEXT, scopeType TEXT, scopeId TEXT, profileText TEXT);
    CREATE TABLE memory_evidence(id TEXT PRIMARY KEY, space TEXT, sourceType TEXT, sourceId TEXT, messageId TEXT);
    CREATE TABLE memory_events(id TEXT PRIMARY KEY, space TEXT, aggregateType TEXT, aggregateId TEXT, eventType TEXT, evidenceIdsJson TEXT, payloadJson TEXT);
    CREATE TABLE ai_generation_jobs(id TEXT PRIMARY KEY, space TEXT, threadId TEXT, userMessageId TEXT, assistantMessageId TEXT, generationId TEXT UNIQUE);
    ${includeImportMap ? `CREATE TABLE memory_import_id_map(packageId TEXT, sourceType TEXT, sourceId TEXT, targetType TEXT, targetId TEXT, sourceHash TEXT, importedAt TEXT, PRIMARY KEY(packageId, sourceType, sourceId));` : ''}
  `);
}

function seedTarget(db) {
  db.db.exec(`
    INSERT INTO ai_role_cards VALUES('role','normal','目标角色',0,NULL);
    INSERT INTO ai_threads VALUES('thread','normal','目标线程','role');
    INSERT INTO ai_messages VALUES('message','thread','normal','assistant','completed','目标消息','2026-01-01');
    INSERT INTO ai_documents VALUES('document','normal','thread','thread','目标文档',NULL);
    INSERT INTO ai_user_profiles VALUES('legacy-profile','normal','目标旧画像');
    INSERT INTO ai_memories VALUES('legacy-memory','normal','目标旧记忆');
    INSERT INTO companion_thought_jobs VALUES('job','normal','thread','role','[]','target-job-key');
    INSERT INTO companion_diaries VALUES('diary','role','version','目标日记');
    INSERT INTO companion_diary_versions VALUES('version','diary','目标版本');
    INSERT INTO ai_thread_summary_segments VALUES('segment','thread','normal','[]','目标摘要');
    INSERT INTO memory_claims VALUES('claim','normal','thread','thread','目标 Claim');
    INSERT INTO memory_profiles VALUES('profile','normal','thread','thread','目标 Profile');
    INSERT INTO memory_evidence VALUES('evidence','normal','message','message','message');
    INSERT INTO ai_generation_jobs VALUES('generation-job','normal','thread','message','message','generation');
  `);
}

function seedSource(db) {
  db.db.exec(`
    INSERT INTO ai_role_cards VALUES('role','normal','导入角色',0,NULL);
    INSERT INTO ai_threads VALUES('thread','normal','导入线程','role');
    INSERT INTO ai_messages VALUES('message','thread','normal','assistant','completed','导入消息','2026-02-01');
    INSERT INTO ai_message_fts VALUES('message','thread','assistant','导入消息','2026-02-01');
    INSERT INTO ai_documents VALUES('document','normal','thread','thread','导入文档',NULL);
    INSERT INTO ai_user_profiles VALUES('legacy-profile','normal','导入旧画像');
    INSERT INTO ai_memories VALUES('legacy-memory','normal','导入旧记忆');
    INSERT INTO companion_thought_jobs VALUES('job','normal','thread','role','[]','source-job-key');
    INSERT INTO companion_thoughts VALUES('thought','normal','thread','role','job','[]','["message"]','导入独白','source-thought-key');
    INSERT INTO companion_diaries VALUES('diary','role','version','导入日记');
    INSERT INTO companion_diary_versions VALUES('version','diary','导入版本');
    INSERT INTO ai_thread_summary_segments VALUES('segment','thread','normal','["segment"]','导入摘要');
    INSERT INTO ai_continuity_import_sessions VALUES('continuity','thread','normal','message','message','message');
    INSERT INTO ai_continuity_import_effects VALUES('profile-effect','continuity',1,'profile_upsert','legacy-profile','{"id":"legacy-profile","profileText":"before"}','{"id":"legacy-profile","profileText":"after"}','2026-02-01');
    INSERT INTO ai_continuity_import_effects VALUES('memory-effect','continuity',2,'memory_update','legacy-memory','{"id":"legacy-memory","content":"before"}','{"id":"legacy-memory","content":"after"}','2026-02-01');
    INSERT INTO memory_claims VALUES('claim','normal','branch','message:2','导入 Claim');
    INSERT INTO memory_profiles VALUES('profile','normal','thread','thread','导入 Profile');
    INSERT INTO memory_evidence VALUES('evidence','normal','message','message','message');
    INSERT INTO memory_events VALUES('memory-event','normal','claim','claim','claim_evidence_added','["evidence"]','{"claim":{"id":"claim","scopeType":"branch","scopeId":"message:2","valueDisplay":"导入 Claim"}}');
    INSERT INTO memory_events VALUES('profile-event','normal','import','profile','profile_upserted','[]','{"profile":{"id":"profile","scopeType":"thread","scopeId":"thread","profileText":"导入 Profile"}}');
    INSERT INTO ai_generation_jobs VALUES('generation-job','normal','thread','message','message','generation');
  `);
}

test('Manifest V2 maps colliding role/thread/message/document/job IDs and reuses the import-session mapping', async () => {
  const source = new DB();
  const target = new DB();
  schema(source, false); schema(target, true); seedSource(source); seedTarget(target);
  const input = {
    imageIdMap: new Map(), ipIdMap: new Map(), sourceDb: source,
    sourceDatabaseSha256: 'a'.repeat(64), sourceDatabaseUri: 'file:///source.sqlite',
    space: 'normal', targetDb: target, uriByLogicalId: new Map(),
  };
  try {
    const first = await service.mergeManagedDatabaseRecords(input);
    assert.equal(first.remappedLogicalIds, 15);
    assert.equal(target.db.prepare("SELECT name FROM ai_role_cards WHERE id='role'").get().name, '目标角色');
    assert.equal(target.db.prepare("SELECT content FROM ai_messages WHERE id='message'").get().content, '目标消息');
    const importedMessage = target.db.prepare("SELECT * FROM ai_messages WHERE content='导入消息'").get();
    const importedThread = target.db.prepare("SELECT * FROM ai_threads WHERE title='导入线程'").get();
    const importedRole = target.db.prepare("SELECT * FROM ai_role_cards WHERE name='导入角色'").get();
    const importedDocument = target.db.prepare("SELECT * FROM ai_documents WHERE title='导入文档'").get();
    const importedJob = target.db.prepare("SELECT * FROM companion_thought_jobs WHERE id<>'job'").get();
    const importedThought = target.db.prepare("SELECT * FROM companion_thoughts WHERE body='导入独白'").get();
    assert.equal(importedThread.roleCardId, importedRole.id);
    assert.equal(importedMessage.threadId, importedThread.id);
    assert.equal(importedDocument.ownerId, importedThread.id);
    assert.equal(importedJob.threadId, importedThread.id);
    assert.equal(importedThought.sourceThreadId, importedThread.id);
    assert.equal(importedThought.jobId, importedJob.id);
    assert.deepEqual(JSON.parse(importedThought.sourceMessageIdsJson), [importedMessage.id]);
    const importedDiary = target.db.prepare("SELECT * FROM companion_diaries WHERE body='导入日记'").get();
    const importedDiaryVersion = target.db.prepare("SELECT * FROM companion_diary_versions WHERE body='导入版本'").get();
    assert.equal(importedDiary.currentVersionId, importedDiaryVersion.id);
    assert.equal(importedDiaryVersion.diaryId, importedDiary.id);
    const importedSegment = target.db.prepare("SELECT * FROM ai_thread_summary_segments WHERE summaryText='导入摘要'").get();
    assert.deepEqual(JSON.parse(importedSegment.sourceSegmentIdsJson), [importedSegment.id]);
    const importedContinuity = target.db.prepare("SELECT * FROM ai_continuity_import_sessions WHERE id='continuity'").get();
    assert.equal(importedContinuity.preImportBranchRootMessageId, importedMessage.id);
    assert.equal(importedContinuity.importedBranchRootMessageId, importedMessage.id);
    assert.equal(importedContinuity.importAnchorMessageId, importedMessage.id);
    const importedEvidence = target.db.prepare("SELECT * FROM memory_evidence WHERE id<>'evidence'").get();
    const importedEvent = target.db.prepare("SELECT * FROM memory_events WHERE id='memory-event'").get();
    assert.deepEqual(JSON.parse(importedEvent.evidenceIdsJson), [importedEvidence.id]);
    const importedClaim = target.db.prepare("SELECT * FROM memory_claims WHERE valueDisplay='导入 Claim'").get();
    assert.equal(importedClaim.scopeId, `${importedMessage.id}:2`);
    assert.equal(importedEvent.aggregateId, importedClaim.id);
    assert.equal(JSON.parse(importedEvent.payloadJson).claim.id, importedClaim.id);
    assert.equal(JSON.parse(importedEvent.payloadJson).claim.scopeId, `${importedMessage.id}:2`);
    const importedProfile = target.db.prepare("SELECT * FROM memory_profiles WHERE profileText='导入 Profile'").get();
    const importedProfileEvent = target.db.prepare("SELECT * FROM memory_events WHERE id='profile-event'").get();
    assert.equal(importedProfileEvent.aggregateId, importedProfile.id);
    assert.equal(JSON.parse(importedProfileEvent.payloadJson).profile.id, importedProfile.id);
    const importedLegacyProfile = target.db.prepare("SELECT * FROM ai_user_profiles WHERE profileText='导入旧画像'").get();
    const profileEffect = target.db.prepare("SELECT * FROM ai_continuity_import_effects WHERE id='profile-effect'").get();
    assert.equal(profileEffect.targetRecordId, importedLegacyProfile.id);
    assert.equal(JSON.parse(profileEffect.beforeStateJson).id, importedLegacyProfile.id);
    assert.equal(JSON.parse(profileEffect.afterStateJson).id, importedLegacyProfile.id);
    const importedLegacyMemory = target.db.prepare("SELECT * FROM ai_memories WHERE content='导入旧记忆'").get();
    const memoryEffect = target.db.prepare("SELECT * FROM ai_continuity_import_effects WHERE id='memory-effect'").get();
    assert.equal(memoryEffect.targetRecordId, importedLegacyMemory.id);
    assert.equal(JSON.parse(memoryEffect.beforeStateJson).id, importedLegacyMemory.id);
    assert.equal(JSON.parse(memoryEffect.afterStateJson).id, importedLegacyMemory.id);
    const importedGeneration = target.db.prepare("SELECT * FROM ai_generation_jobs WHERE id<>'generation-job'").get();
    assert.notEqual(importedGeneration.generationId, 'generation');
    assert.equal(target.db.prepare("SELECT COUNT(*) count FROM ai_message_fts WHERE ai_message_fts MATCH '导入消息'").get().count, 1);
    assert.equal(target.db.prepare('SELECT id FROM ai_message_fts WHERE content=?').get('导入消息').id, importedMessage.id);
    const countsBefore = target.db.prepare('SELECT (SELECT COUNT(*) FROM ai_threads) threads, (SELECT COUNT(*) FROM ai_messages) messages, (SELECT COUNT(*) FROM companion_thoughts) thoughts').get();
    const second = await service.mergeManagedDatabaseRecords(input);
    assert.ok(second.preservedRecords > 0);
    assert.deepEqual(target.db.prepare('SELECT (SELECT COUNT(*) FROM ai_threads) threads, (SELECT COUNT(*) FROM ai_messages) messages, (SELECT COUNT(*) FROM companion_thoughts) thoughts').get(), countsBefore);
  } finally {
    await source.closeAsync(); await target.closeAsync();
  }
});

function actualMemoryDb() {
  const db = new DB();
  db.db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE ai_threads(id TEXT PRIMARY KEY, space TEXT NOT NULL, title TEXT NOT NULL);
    CREATE TABLE ai_messages(id TEXT PRIMARY KEY, threadId TEXT NOT NULL, space TEXT NOT NULL, content TEXT NOT NULL, FOREIGN KEY(threadId) REFERENCES ai_threads(id));
  `);
  db.db.exec(schemaModule.MIGRATION_STATEMENTS_V47);
  return db;
}

function memoryClaim(id, valueDisplay, projectionVersion) {
  const now = '2026-07-29T08:00:00.000Z';
  return {
    id, space: 'normal', schemaVersion: 1, canonicalClaimId: 'canonical-shared', relatedClaimGroupId: null,
    lane: 'confirmed', status: 'confirmed', kind: 'state', actor: 'user', subjectEntityId: 'user', subjectDisplay: '用户',
    scopeType: 'global', scopeId: null, predicate: 'fact.identity', valueNormalized: valueDisplay, valueDisplay,
    polarity: 'positive', speechMode: 'asserted', rawTimePhrase: null, validFrom: null, validTo: null, validPrecision: 'unknown',
    confidenceRaw: 0.9, confidenceCalibrated: 0.9, confidenceBand: 'high', importance: 80, stability: 'long',
    manualLocked: false, safetyState: 'none', sourceKind: 'message', sourceMessageId: null, extractorVersion: 'test-v1',
    ontologyVersion: 'ontology-v1', projectionVersion, version: 1, createdAt: now, updatedAt: now, lastUsedAt: null,
    supersededByClaimId: null, deletedAt: null,
  };
}

function insertClaim(db, claim) {
  db.db.prepare(`INSERT INTO memory_claims (
    id, space, schemaVersion, canonicalClaimId, relatedClaimGroupId, lane, status, kind, actor, subjectEntityId, subjectDisplay,
    scopeType, scopeId, predicate, valueNormalized, valueDisplay, polarity, speechMode, rawTimePhrase, validFrom, validTo,
    validPrecision, confidenceRaw, confidenceCalibrated, confidenceBand, importance, stability, manualLocked, safetyState,
    sourceKind, sourceMessageId, extractorVersion, ontologyVersion, projectionVersion, version, createdAt, updatedAt,
    lastUsedAt, supersededByClaimId, deletedAt
  ) VALUES (${Array.from({ length: 40 }, () => '?').join(',')})`).run(
    claim.id, claim.space, claim.schemaVersion, claim.canonicalClaimId, claim.relatedClaimGroupId, claim.lane, claim.status,
    claim.kind, claim.actor, claim.subjectEntityId, claim.subjectDisplay, claim.scopeType, claim.scopeId, claim.predicate,
    claim.valueNormalized, claim.valueDisplay, claim.polarity, claim.speechMode, claim.rawTimePhrase, claim.validFrom, claim.validTo,
    claim.validPrecision, claim.confidenceRaw, claim.confidenceCalibrated, claim.confidenceBand, claim.importance, claim.stability,
    claim.manualLocked ? 1 : 0, claim.safetyState, claim.sourceKind, claim.sourceMessageId, claim.extractorVersion,
    claim.ontologyVersion, claim.projectionVersion, claim.version, claim.createdAt, claim.updatedAt, claim.lastUsedAt,
    claim.supersededByClaimId, claim.deletedAt,
  );
}

function insertEvent(db, { id, aggregateType, aggregateId, eventType, payload, projectionVersion, evidenceIds = [] }) {
  db.db.prepare(`INSERT INTO memory_events (
    id, space, aggregateType, aggregateId, eventType, eventVersion, commandId, idempotencyKey, actorType, actorId,
    source, payloadJson, evidenceIdsJson, createdAt, projectionVersion
  ) VALUES (?, 'normal', ?, ?, ?, 1, ?, ?, 'system', NULL, 'test', ?, ?, '2026-07-29T08:00:00.000Z', ?)`)
    .run(id, aggregateType, aggregateId, eventType, `command-${id}`, `key-${id}`, JSON.stringify(payload), JSON.stringify(evidenceIds), projectionVersion);
}

function seedReplayTarget(db) {
  db.db.exec(`
    INSERT INTO ai_threads VALUES('thread','normal','目标线程');
    INSERT INTO ai_messages VALUES('message','thread','normal','目标消息');
    INSERT INTO memory_evidence VALUES('evidence','normal','message','message','message','user','目标证据','target-hash',0,4,'target', '2026-07-29T08:00:00.000Z',NULL);
    INSERT INTO memory_episodes VALUES('episode','normal','thread','thread','confirmed','active','目标片段','目标摘要','message','message',NULL,NULL,'["claim"]','["message"]','message',1,'high',80,1,'2026-07-29T08:00:00.000Z','2026-07-29T08:00:00.000Z',NULL,NULL);
    INSERT INTO memory_relational_states VALUES('relation','normal','thread','thread','user','trust',0.5,1,30,'2026-07-29T08:00:00.000Z','["evidence"]',1,1,'2026-07-29T08:00:00.000Z','2026-07-29T08:00:00.000Z');
    INSERT INTO memory_profiles VALUES('profile','normal','thread','thread','{}','目标画像','["claim"]','["message"]',1,1,'2026-07-29T08:00:00.000Z','2026-07-29T08:00:00.000Z');
  `);
  const claim = memoryClaim('claim', '目标 Claim', 1);
  insertClaim(db, claim);
  insertEvent(db, { id: 'target-claim-event', aggregateType: 'claim', aggregateId: 'claim', eventType: 'claim_created', payload: { claim }, projectionVersion: 1, evidenceIds: ['evidence'] });
}

function seedReplaySource(db) {
  db.db.exec(`
    INSERT INTO ai_threads VALUES('thread','normal','导入线程');
    INSERT INTO ai_messages VALUES('message','thread','normal','导入消息');
    INSERT INTO memory_evidence VALUES('evidence','normal','message','message','message','user','导入证据','source-hash',0,4,'source', '2026-07-29T08:00:00.000Z',NULL);
  `);
  const claim = memoryClaim('claim', '导入 Claim', 2);
  insertClaim(db, claim);
  const episode = {
    id: 'episode', space: 'normal', scopeType: 'thread', scopeId: 'thread', lane: 'confirmed', status: 'active',
    title: '导入片段', summaryText: '导入摘要', startMessageId: 'message', endMessageId: 'message', validFrom: null, validTo: null,
    sourceClaimIdsJson: '["claim"]', sourceMessageIdsJson: '["message"]', branchRootMessageId: 'message', branchVersionIndex: 1,
    confidenceBand: 'high', importance: 80, projectionVersion: 3, createdAt: '2026-07-29T08:00:00.000Z',
    updatedAt: '2026-07-29T08:00:00.000Z', archivedAt: null, deletedAt: null,
  };
  const relation = {
    id: 'relation', space: 'normal', scopeType: 'thread', scopeId: 'thread', subjectEntityId: 'user', metric: 'trust', value: 0.8,
    signalWeight: 1, decayHalfLifeDays: 30, lastEvidenceAt: '2026-07-29T08:00:00.000Z', evidenceIdsJson: '["evidence"]',
    projectionVersion: 4, version: 1, createdAt: '2026-07-29T08:00:00.000Z', updatedAt: '2026-07-29T08:00:00.000Z',
  };
  const profile = {
    id: 'profile', space: 'normal', scopeType: 'thread', scopeId: 'thread', profileJson: '{}', profileText: '导入画像',
    sourceClaimIdsJson: '["claim"]', sourceMessageIdsJson: '["message"]', version: 1, projectionVersion: 5,
    createdAt: '2026-07-29T08:00:00.000Z', updatedAt: '2026-07-29T08:00:00.000Z',
  };
  db.db.prepare(`INSERT INTO memory_episodes VALUES (${Array.from({ length: 23 }, () => '?').join(',')})`).run(...Object.values(episode));
  db.db.prepare(`INSERT INTO memory_relational_states VALUES (${Array.from({ length: 15 }, () => '?').join(',')})`).run(...Object.values(relation));
  db.db.prepare(`INSERT INTO memory_profiles VALUES (${Array.from({ length: 12 }, () => '?').join(',')})`).run(...Object.values(profile));
  insertEvent(db, { id: 'source-claim-event', aggregateType: 'claim', aggregateId: 'claim', eventType: 'claim_created', payload: { claim }, projectionVersion: 2, evidenceIds: ['evidence'] });
  insertEvent(db, { id: 'source-episode-event', aggregateType: 'episode', aggregateId: 'episode', eventType: 'episode_upserted', payload: { episode }, projectionVersion: 3 });
  insertEvent(db, { id: 'source-relation-event', aggregateType: 'relation', aggregateId: 'relation', eventType: 'relation_upserted', payload: { relation }, projectionVersion: 4, evidenceIds: ['evidence'] });
  insertEvent(db, { id: 'source-profile-event', aggregateType: 'import', aggregateId: 'profile', eventType: 'profile_upserted', payload: { profile }, projectionVersion: 5 });
}

test('real V47 merge remains replay-safe after claim and provenance ID collisions', async () => {
  const source = actualMemoryDb();
  const target = actualMemoryDb();
  seedReplaySource(source); seedReplayTarget(target);
  try {
    await service.mergeManagedDatabaseRecords({
      imageIdMap: new Map(), ipIdMap: new Map(), sourceDb: source, sourceDatabaseSha256: 'b'.repeat(64),
      sourceDatabaseUri: 'file:///memory-source.sqlite', space: 'normal', targetDb: target, uriByLogicalId: new Map(),
    });
    const importedMessage = target.db.prepare("SELECT * FROM ai_messages WHERE content='导入消息'").get();
    const importedEvidence = target.db.prepare("SELECT * FROM memory_evidence WHERE quote='导入证据'").get();
    let importedClaim = target.db.prepare("SELECT * FROM memory_claims WHERE valueDisplay='导入 Claim'").get();
    assert.match(importedClaim.canonicalClaimId, /^canonical-shared:managed-restore:/);
    const importedClaimId = importedClaim.id;
    const sourceClaimEvent = target.db.prepare("SELECT * FROM memory_events WHERE id='source-claim-event'").get();
    assert.equal(JSON.parse(sourceClaimEvent.payloadJson).claim.canonicalClaimId, importedClaim.canonicalClaimId);

    await memoryProjection.rebuildMemoryProjections(target, 'normal');
    assert.equal(target.db.prepare("SELECT COUNT(*) count FROM memory_claims WHERE valueDisplay IN ('目标 Claim','导入 Claim')").get().count, 2);
    importedClaim = target.db.prepare("SELECT * FROM memory_claims WHERE valueDisplay='导入 Claim'").get();
    assert.equal(importedClaim.id, importedClaimId);
    const episode = target.db.prepare("SELECT * FROM memory_episodes WHERE summaryText='导入摘要'").get();
    const relation = target.db.prepare("SELECT * FROM memory_relational_states WHERE value=0.8").get();
    const profile = target.db.prepare("SELECT * FROM memory_profiles WHERE profileText='导入画像'").get();
    assert.deepEqual(JSON.parse(episode.sourceClaimIdsJson), [importedClaim.id]);
    assert.deepEqual(JSON.parse(episode.sourceMessageIdsJson), [importedMessage.id]);
    assert.deepEqual(JSON.parse(relation.evidenceIdsJson), [importedEvidence.id]);
    assert.deepEqual(JSON.parse(profile.sourceClaimIdsJson), [importedClaim.id]);
    assert.deepEqual(JSON.parse(profile.sourceMessageIdsJson), [importedMessage.id]);
  } finally {
    await source.closeAsync(); await target.closeAsync();
  }
});
