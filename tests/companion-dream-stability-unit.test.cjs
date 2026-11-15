const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTsModule(filename) {
  const previousExtension = require.extensions['.ts'];
  require.extensions['.ts'] = function (module, sourcePath) {
    module._compile(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, sourcePath);
  };
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename);
  } finally {
    if (previousExtension) require.extensions['.ts'] = previousExtension;
    else delete require.extensions['.ts'];
  }
}

class TestDb {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  exec(sql) { this.db.exec(sql); }
  async runAsync(sql, ...params) { return this.db.prepare(sql).run(...params); }
  async getFirstAsync(sql, ...params) { return this.db.prepare(sql).get(...params) ?? null; }
  async getAllAsync(sql, ...params) { return this.db.prepare(sql).all(...params); }
  async withTransactionAsync(task) { this.db.exec('BEGIN'); try { const value = await task(); this.db.exec('COMMIT'); return value; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
  close() { this.db.close(); }
}

function initDreamDb() {
  const schema = loadTsModule(path.join(root, 'src/database/schema.ts'));
  const db = new TestDb();
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE ai_threads(id TEXT PRIMARY KEY, space TEXT NOT NULL, roleCardId TEXT, roleSnapshotJson TEXT NOT NULL DEFAULT '{}', lineageVersion INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE ai_messages(id TEXT PRIMARY KEY, threadId TEXT NOT NULL, FOREIGN KEY(threadId) REFERENCES ai_threads(id) ON DELETE CASCADE);
    INSERT INTO ai_threads(id, space, roleCardId, lineageVersion) VALUES('thread-1','normal','role-1', 0);
    INSERT INTO ai_messages VALUES('u1','thread-1');
    INSERT INTO ai_messages VALUES('a1','thread-1');`);
  db.exec(schema.MIGRATION_STATEMENTS_V53);
  db.exec(schema.MIGRATION_STATEMENTS_V59);
  db.exec(schema.MIGRATION_STATEMENTS_V58);
  return db;
}

test('loadDreamRuntimeNotice ignores classifying jobs and surfaces generating jobs only', async () => {
  const db = initDreamDb();
  const repoModule = loadTsModule(path.join(root, 'src/ai/dream/dreamRepository.ts'));
  const repository = repoModule.dreamRepository;
  const runtimeEvents = loadTsModule(path.join(root, 'src/ai/dream/dreamRuntimeEvents.ts'));
  const now = new Date().toISOString();

  try {
    const scene = await repository.upsertScene(db, {
      space: 'normal', roleCardId: 'role-1', threadId: 'thread-1', branchRouteHash: 'route-main',
      lineageVersion: 0, state: 'sleep_established', evidenceMessageIds: ['u1', 'a1'], sourceSnapshotHash: 's1', now,
    });
    const seed = await repository.createSeed(db, {
      space: 'normal', roleCardId: 'role-1', threadId: 'thread-1', branchRouteHash: 'route-main',
      lineageVersion: 0, sceneId: scene.id, sourceMessageIds: ['u1', 'a1'], sourceMessageVersionHashes: ['h1', 'h2'],
      sourceSnapshotHash: 's1', roll: 0.05, decision: 'classifying', manual: false, policyVersion: 'v1', idempotencyKey: 'seed-classifying', now,
    });
    // Create a job in phase 'classifying'
    const classifyingJob = await repository.createJob(db, { seed, phase: 'classifying', now });

    // loadDreamRuntimeNotice must return null because classifying jobs are internal background work
    const noticeBefore = await runtimeEvents.loadDreamRuntimeNotice(db, {
      threadId: 'thread-1', branchRouteHash: 'route-main', lineageVersion: 0,
    });
    assert.equal(noticeBefore, null);

    // Transition job to generating phase
    await db.runAsync("UPDATE companion_dream_jobs SET phase = 'generating' WHERE id = ?", classifyingJob.id);

    // Now it should be loaded as generating
    const noticeAfter = await runtimeEvents.loadDreamRuntimeNotice(db, {
      threadId: 'thread-1', branchRouteHash: 'route-main', lineageVersion: 0,
    });
    assert.ok(noticeAfter);
    assert.equal(noticeAfter.type, 'generating');
    assert.equal(noticeAfter.jobId, classifyingJob.id);
  } finally {
    db.close();
  }
});

test('loadDreamRuntimeNotice expires stale manual confirmation seeds older than 30 minutes', async () => {
  const db = initDreamDb();
  const repoModule = loadTsModule(path.join(root, 'src/ai/dream/dreamRepository.ts'));
  const repository = repoModule.dreamRepository;
  const runtimeEvents = loadTsModule(path.join(root, 'src/ai/dream/dreamRuntimeEvents.ts'));

  try {
    const staleTime = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    const sceneStale = await repository.upsertScene(db, {
      space: 'normal', roleCardId: 'role-1', threadId: 'thread-1', branchRouteHash: 'route-main',
      lineageVersion: 0, state: 'dream_active', evidenceMessageIds: ['u1'], sourceSnapshotHash: 's1', now: staleTime,
    });
    await repository.createSeed(db, {
      space: 'normal', roleCardId: 'role-1', threadId: 'thread-1', branchRouteHash: 'route-main',
      lineageVersion: 0, sceneId: sceneStale.id, sourceMessageIds: ['u1'], sourceMessageVersionHashes: ['h1'],
      sourceSnapshotHash: 's1', roll: 0.1, decision: 'awaiting_confirmation', manual: true, policyVersion: 'v1', idempotencyKey: 'seed-stale', now: staleTime,
    });

    // 45 minutes old seed must NOT trigger manual_confirmation notice
    const staleNotice = await runtimeEvents.loadDreamRuntimeNotice(db, {
      threadId: 'thread-1', branchRouteHash: 'route-main', lineageVersion: 0,
    });
    assert.equal(staleNotice, null);

    // Now insert a recent seed (2 minutes ago)
    const recentTime = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const sceneRecent = await repository.upsertScene(db, {
      space: 'normal', roleCardId: 'role-1', threadId: 'thread-1', branchRouteHash: 'route-main',
      lineageVersion: 0, state: 'dream_active', evidenceMessageIds: ['u1'], sourceSnapshotHash: 's2', now: recentTime,
    });
    const freshSeed = await repository.createSeed(db, {
      space: 'normal', roleCardId: 'role-1', threadId: 'thread-1', branchRouteHash: 'route-main',
      lineageVersion: 0, sceneId: sceneRecent.id, sourceMessageIds: ['u1'], sourceMessageVersionHashes: ['h1'],
      sourceSnapshotHash: 's2', roll: 0.1, decision: 'awaiting_confirmation', manual: true, policyVersion: 'v1', idempotencyKey: 'seed-fresh', now: recentTime,
    });

    const freshNotice = await runtimeEvents.loadDreamRuntimeNotice(db, {
      threadId: 'thread-1', branchRouteHash: 'route-main', lineageVersion: 0,
    });
    assert.ok(freshNotice);
    assert.equal(freshNotice.type, 'manual_confirmation');
    assert.equal(freshNotice.seedId, freshSeed.id);
  } finally {
    db.close();
  }
});

test('findActiveDreamScene reuses active scene across lineageVersion increment preventing duplicate seeds', async () => {
  const db = initDreamDb();
  const repoModule = loadTsModule(path.join(root, 'src/ai/dream/dreamRepository.ts'));
  const repository = repoModule.dreamRepository;
  const now = new Date().toISOString();

  try {
    // Round 1 with lineageVersion = 0
    const scene1 = await repository.upsertScene(db, {
      space: 'normal', roleCardId: 'role-1', threadId: 'thread-1', branchRouteHash: 'route-main',
      lineageVersion: 0, state: 'sleep_established', evidenceMessageIds: ['u1', 'a1'], sourceSnapshotHash: 's1', now,
    });
    await repository.createSeed(db, {
      space: 'normal', roleCardId: 'role-1', threadId: 'thread-1', branchRouteHash: 'route-main',
      lineageVersion: 0, sceneId: scene1.id, sourceMessageIds: ['u1', 'a1'], sourceMessageVersionHashes: ['h1', 'h2'],
      sourceSnapshotHash: 's1', roll: 0.05, decision: 'rejected', manual: false, policyVersion: 'v1', idempotencyKey: 'seed-round1', now,
    });

    // User edits message: thread.lineageVersion becomes 1
    // Upsert scene with lineageVersion = 1 must find and reuse scene1
    const scene2 = await repository.upsertScene(db, {
      space: 'normal', roleCardId: 'role-1', threadId: 'thread-1', branchRouteHash: 'route-main',
      lineageVersion: 1, state: 'sleep_established', evidenceMessageIds: ['u1', 'a1'], sourceSnapshotHash: 's1', now,
    });
    assert.equal(scene2.id, scene1.id);
    assert.equal(scene2.lineageVersion, 1);

    // Finding seed for scene returns existing seed, preventing duplicate trigger
    const existingSeed = await repository.findSeedForScene(db, scene2.id);
    assert.ok(existingSeed);
    assert.equal(existingSeed.decision, 'rejected');

    // 24 hours later (next night), the scene should be considered closed and a new scene created
    const tomorrow = new Date(new Date(now).getTime() + 24 * 60 * 60 * 1000).toISOString();
    const sceneTomorrow = await repository.upsertScene(db, {
      space: 'normal', roleCardId: 'role-1', threadId: 'thread-1', branchRouteHash: 'route-main',
      lineageVersion: 1, state: 'sleep_established', evidenceMessageIds: ['u1', 'a1'], sourceSnapshotHash: 's1', now: tomorrow,
    });
    assert.notEqual(sceneTomorrow.id, scene1.id);
  } finally {
    db.close();
  }
});
