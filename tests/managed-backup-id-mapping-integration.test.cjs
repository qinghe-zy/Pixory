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
let service;
try { service = require(path.join(root, 'src/services/managedBackupService.ts')); }
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
    CREATE TABLE companion_thought_jobs(id TEXT PRIMARY KEY, space TEXT, threadId TEXT, roleCardId TEXT, eventIdsJson TEXT, idempotencyKey TEXT UNIQUE, FOREIGN KEY(threadId) REFERENCES ai_threads(id));
    CREATE TABLE companion_thoughts(id TEXT PRIMARY KEY, space TEXT, sourceThreadId TEXT, roleCardId TEXT, jobId TEXT, eventIdsJson TEXT, sourceMessageIdsJson TEXT, body TEXT, idempotencyKey TEXT UNIQUE, FOREIGN KEY(sourceThreadId) REFERENCES ai_threads(id), FOREIGN KEY(jobId) REFERENCES companion_thought_jobs(id));
    CREATE TABLE companion_diaries(id TEXT PRIMARY KEY, roleCardId TEXT, currentVersionId TEXT, body TEXT);
    CREATE TABLE companion_diary_versions(id TEXT PRIMARY KEY, diaryId TEXT, body TEXT, FOREIGN KEY(diaryId) REFERENCES companion_diaries(id));
    CREATE TABLE ai_thread_summary_segments(id TEXT PRIMARY KEY, threadId TEXT, space TEXT, sourceSegmentIdsJson TEXT, summaryText TEXT);
    CREATE TABLE ai_continuity_import_sessions(id TEXT PRIMARY KEY, threadId TEXT, space TEXT, preImportBranchRootMessageId TEXT, importedBranchRootMessageId TEXT, importAnchorMessageId TEXT);
    CREATE TABLE memory_evidence(id TEXT PRIMARY KEY, space TEXT, sourceType TEXT, sourceId TEXT, messageId TEXT);
    CREATE TABLE memory_events(id TEXT PRIMARY KEY, space TEXT, evidenceIdsJson TEXT, payloadJson TEXT);
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
    INSERT INTO companion_thought_jobs VALUES('job','normal','thread','role','[]','target-job-key');
    INSERT INTO companion_diaries VALUES('diary','role','version','目标日记');
    INSERT INTO companion_diary_versions VALUES('version','diary','目标版本');
    INSERT INTO ai_thread_summary_segments VALUES('segment','thread','normal','[]','目标摘要');
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
    INSERT INTO companion_thought_jobs VALUES('job','normal','thread','role','[]','source-job-key');
    INSERT INTO companion_thoughts VALUES('thought','normal','thread','role','job','[]','["message"]','导入独白','source-thought-key');
    INSERT INTO companion_diaries VALUES('diary','role','version','导入日记');
    INSERT INTO companion_diary_versions VALUES('version','diary','导入版本');
    INSERT INTO ai_thread_summary_segments VALUES('segment','thread','normal','["segment"]','导入摘要');
    INSERT INTO ai_continuity_import_sessions VALUES('continuity','thread','normal','message','message','message');
    INSERT INTO memory_evidence VALUES('evidence','normal','message','message','message');
    INSERT INTO memory_events VALUES('memory-event','normal','["evidence"]','{}');
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
    assert.equal(first.remappedLogicalIds, 11);
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
