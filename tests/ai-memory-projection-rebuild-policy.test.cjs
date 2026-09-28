const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const projectionPath = path.join(root, 'src/ai/memory/memoryProjectionService.ts');

class AsyncDatabase {
  constructor() {
    this.db = new DatabaseSync(':memory:');
  }

  async execAsync(sql) {
    this.db.exec(sql);
  }

  async runAsync(sql, ...params) {
    return this.db.prepare(sql).run(...params);
  }

  async getFirstAsync(sql, ...params) {
    return this.db.prepare(sql).get(...params) ?? null;
  }

  async getAllAsync(sql, ...params) {
    return this.db.prepare(sql).all(...params);
  }
}

function loadProjectionService(events) {
  const source = fs.readFileSync(projectionPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: projectionPath,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    exports: module.exports,
    module,
    require(request) {
      if (request === '../../database/utils') {
        return { createTimestamp: () => '2026-07-27T00:00:00.000Z' };
      }
      if (request === './memoryEventRepository') {
        return {
          advanceMemoryProjectionMeta: async () => undefined,
          getMemoryProjectionMeta: async () => ({ memoryEpoch: 0, projectionVersion: 0 }),
          listMemoryEvents: async () => events,
        };
      }
      if (request === './memoryTypes') {
        return {
          resolveCalibratedConfidence: (value, band) => value ?? (band === 'high' ? 0.95 : band === 'medium' ? 0.7 : 0.35),
        };
      }
      return require(request);
    },
  }, { filename: projectionPath });
  return module.exports;
}

function event(aggregateType, aggregateId, eventType, payload, projectionVersion) {
  return {
    actorId: 'package-1',
    actorType: 'import',
    aggregateId,
    aggregateType,
    commandId: `command-${projectionVersion}`,
    createdAt: '2026-07-27T00:00:00.000Z',
    eventType,
    eventVersion: 1,
    evidenceIdsJson: '[]',
    id: `event-${projectionVersion}`,
    idempotencyKey: `key-${projectionVersion}`,
    payloadJson: JSON.stringify(payload),
    projectionVersion,
    source: 'test',
    space: 'normal',
  };
}

async function createProjectionSchema(db) {
  await db.execAsync(`
    CREATE TABLE memory_claims (
      id TEXT PRIMARY KEY, space TEXT, status TEXT, lane TEXT,
      supersededByClaimId TEXT, deletedAt TEXT, updatedAt TEXT
    );
    CREATE TABLE memory_board_projection (claimId TEXT, space TEXT);
    CREATE TABLE ai_memory_fts (id TEXT, space TEXT);
    CREATE TABLE memory_episodes (
      id TEXT PRIMARY KEY, space TEXT, scopeType TEXT, scopeId TEXT, lane TEXT,
      status TEXT, title TEXT, summaryText TEXT, startMessageId TEXT, endMessageId TEXT,
      validFrom TEXT, validTo TEXT, sourceClaimIdsJson TEXT, sourceMessageIdsJson TEXT,
      branchRootMessageId TEXT, branchVersionIndex INTEGER, confidenceBand TEXT,
      importance INTEGER, projectionVersion INTEGER, createdAt TEXT, updatedAt TEXT,
      archivedAt TEXT, deletedAt TEXT
    );
    CREATE TABLE memory_relational_states (
      id TEXT PRIMARY KEY, space TEXT, scopeType TEXT, scopeId TEXT,
      subjectEntityId TEXT, metric TEXT, value REAL, signalWeight REAL,
      decayHalfLifeDays REAL, lastEvidenceAt TEXT, evidenceIdsJson TEXT,
      projectionVersion INTEGER, version INTEGER, createdAt TEXT, updatedAt TEXT
    );
    CREATE TABLE memory_profiles (
      id TEXT PRIMARY KEY, space TEXT, scopeType TEXT, scopeId TEXT,
      profileJson TEXT, profileText TEXT, sourceClaimIdsJson TEXT,
      sourceMessageIdsJson TEXT, version INTEGER, projectionVersion INTEGER,
      createdAt TEXT, updatedAt TEXT
    );
    CREATE TABLE memory_projection_meta (
      space TEXT PRIMARY KEY, projectionVersion INTEGER, memoryEpoch INTEGER,
      lastRebuiltAt TEXT, updatedAt TEXT
    );
    INSERT INTO memory_projection_meta VALUES ('normal', 0, 0, NULL, 'old');
    INSERT INTO memory_episodes (id, space) VALUES ('stale-episode', 'normal');
    INSERT INTO memory_relational_states (id, space) VALUES ('stale-relation', 'normal');
    INSERT INTO memory_profiles (id, space) VALUES ('stale-profile', 'normal');
  `);
}

test('projection rebuild restores episode, relation, and profile only from ledger events', async () => {
  const episode = {
    id: 'episode-1', space: 'normal', scopeType: 'thread', scopeId: 'thread-1',
    lane: 'working', status: 'active', title: '一次散步', summaryText: '用户聊到晚间散步。',
    startMessageId: null, endMessageId: null, validFrom: null, validTo: null,
    sourceClaimIdsJson: '[]', sourceMessageIdsJson: '["message-1"]',
    branchRootMessageId: null, branchVersionIndex: null, confidenceBand: 'medium',
    importance: 40, projectionVersion: 1, createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z', archivedAt: null, deletedAt: null,
  };
  const relation = {
    id: 'relation-1', space: 'normal', scopeType: 'thread', scopeId: 'thread-1',
    subjectEntityId: 'joint', metric: 'trust', value: 0.2, signalWeight: 1,
    decayHalfLifeDays: 30, lastEvidenceAt: '2026-07-27T00:00:00.000Z',
    evidenceIdsJson: '["message-1"]', projectionVersion: 2, version: 1,
    createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
  };
  const profile = {
    id: 'profile-1', space: 'normal', scopeType: 'thread', scopeId: 'thread-1',
    profileJson: '{}', profileText: '简洁交流', sourceClaimIdsJson: '[]',
    sourceMessageIdsJson: '["message-1"]', version: 1, projectionVersion: 3,
    createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
  };
  const events = [
    event('episode', episode.id, 'episode_upserted', { episode }, 1),
    event('relation', relation.id, 'relation_upserted', { relation }, 2),
    event('import', profile.id, 'profile_upserted', { profile }, 3),
  ];
  const db = new AsyncDatabase();
  await createProjectionSchema(db);
  const service = loadProjectionService(events);

  await service.rebuildMemoryProjections(db, 'normal');

  assert.deepEqual(
    (await db.getAllAsync('SELECT id FROM memory_episodes ORDER BY id')).map((row) => row.id),
    ['episode-1']
  );
  assert.deepEqual(
    (await db.getAllAsync('SELECT id FROM memory_relational_states ORDER BY id')).map((row) => row.id),
    ['relation-1']
  );
  assert.deepEqual(
    (await db.getAllAsync('SELECT id FROM memory_profiles ORDER BY id')).map((row) => row.id),
    ['profile-1']
  );
});

test('destructive claim events synchronously clear board and FTS projections', async () => {
  for (const eventType of ['claim_deleted', 'claim_suppressed', 'claim_superseded']) {
    const db = new AsyncDatabase();
    await createProjectionSchema(db);
    await db.runAsync(
      `INSERT INTO memory_claims
       (id, space, status, lane, supersededByClaimId, deletedAt, updatedAt)
       VALUES ('claim-1', 'normal', 'committed', 'working', NULL, NULL, 'old')`
    );
    await db.runAsync("INSERT INTO memory_board_projection VALUES ('claim-1', 'normal')");
    await db.runAsync("INSERT INTO ai_memory_fts VALUES ('claim-1', 'normal')");
    const service = loadProjectionService([]);
    await service.projectMemoryEvent(
      db,
      event('claim', 'claim-1', eventType, { supersededByClaimId: 'claim-2' }, 1)
    );
    assert.equal((await db.getAllAsync("SELECT id FROM ai_memory_fts WHERE id = 'claim-1'")).length, 0, eventType);
    assert.equal((await db.getAllAsync("SELECT claimId FROM memory_board_projection WHERE claimId = 'claim-1'")).length, 0, eventType);
  }
});

test('rollback events remove imported episode, relation, and profile projections', async () => {
  const db = new AsyncDatabase();
  await createProjectionSchema(db);
  const service = loadProjectionService([]);
  const cases = [
    ['memory_episodes', 'episode', 'episode-1', 'episode_deleted'],
    ['memory_relational_states', 'relation', 'relation-1', 'relation_deleted'],
    ['memory_profiles', 'import', 'profile-1', 'profile_deleted'],
  ];
  await db.runAsync("INSERT INTO memory_episodes (id, space) VALUES ('episode-1', 'normal')");
  await db.runAsync("INSERT INTO memory_relational_states (id, space) VALUES ('relation-1', 'normal')");
  await db.runAsync("INSERT INTO memory_profiles (id, space) VALUES ('profile-1', 'normal')");
  for (const [table, aggregateType, id, eventType] of cases) {
    await service.projectMemoryEvent(db, event(aggregateType, id, eventType, {}, 1));
    assert.equal((await db.getAllAsync(`SELECT id FROM ${table} WHERE id = ?`, id)).length, 0, eventType);
  }
});
