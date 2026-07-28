const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalTsLoader = require.extensions['.ts'];
require.extensions['.ts'] = function compileTypeScript(module, sourcePath) {
  const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText;
  module._compile(output, sourcePath);
};

let schema;
let repository;
let observer;
try {
  schema = require(path.join(root, 'src/database/schema.ts'));
  repository = require(path.join(root, 'src/ai/companion/companionEventRepository.ts'));
  observer = require(path.join(root, 'src/ai/companion/companionEventObserver.ts'));
} finally {
  if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
  else delete require.extensions['.ts'];
}

class AsyncDatabase {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  exec(sql) { this.db.exec(sql); }
  async runAsync(sql, ...params) { return this.db.prepare(sql).run(...params); }
  async getFirstAsync(sql, ...params) { return this.db.prepare(sql).get(...params) ?? null; }
  async getAllAsync(sql, ...params) { return this.db.prepare(sql).all(...params); }
  async withTransactionAsync(task) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = await task(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}

function createDatabase() {
  const db = new AsyncDatabase();
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE ai_threads (id TEXT PRIMARY KEY, roleCardId TEXT, lineageVersion INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE ai_messages (
      id TEXT PRIMARY KEY, threadId TEXT NOT NULL, branchRootMessageId TEXT, branchVersionIndex INTEGER,
      role TEXT NOT NULL, status TEXT NOT NULL, content TEXT NOT NULL, updatedAt TEXT NOT NULL,
      completedAt TEXT, createdAt TEXT NOT NULL,
      FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
    );
  `);
  db.exec(schema.MIGRATION_STATEMENTS_V52);
  return db;
}

function insertThreadAndMessage(db, overrides = {}) {
  db.db.prepare('INSERT OR IGNORE INTO ai_threads (id, roleCardId, lineageVersion) VALUES (?, ?, ?)').run('thread-a', 'role-a', 4);
  db.db.prepare(`INSERT OR REPLACE INTO ai_messages
    (id, threadId, branchRootMessageId, branchVersionIndex, role, status, content, updatedAt, completedAt, createdAt)
    VALUES (?, ?, ?, ?, 'user', 'completed', ?, ?, ?, ?)`)
    .run(
      overrides.id ?? 'message-a',
      'thread-a',
      overrides.branchRootMessageId ?? 'root-a',
      overrides.branchVersionIndex ?? 1,
      overrides.content ?? '明天下午告诉你结果。',
      overrides.updatedAt ?? '2026-07-29T08:00:00.000Z',
      overrides.completedAt ?? '2026-07-29T08:00:00.000Z',
      overrides.createdAt ?? '2026-07-29T08:00:00.000Z',
    );
}

function candidate(content = '明天下午告诉你结果。') {
  return observer.observeCompanionEvents({
    branchRouteHash: 'route-a',
    lineageVersion: 4,
    message: {
      id: 'message-a', content, role: 'user', status: 'completed',
      branchRootMessageId: 'root-a', branchVersionIndex: 1,
      updatedAt: '2026-07-29T08:00:00.000Z', completedAt: '2026-07-29T08:00:00.000Z',
    },
  }).accepted.find((item) => item.category === 'commitment');
}

test('V52 declares the Stage B ledger and is applied after V51', () => {
  const dbSource = fs.readFileSync(path.join(root, 'src/database/db.ts'), 'utf8');
  assert.equal(schema.DATABASE_VERSION, 52);
  for (const table of ['companion_events', 'companion_temporal_anchors', 'companion_open_loops', 'companion_runtime_jobs', 'companion_context_traces']) {
    assert.match(schema.MIGRATION_STATEMENTS_V52, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(schema.MIGRATION_STATEMENTS_V52, /idempotencyKey TEXT NOT NULL UNIQUE/);
  assert.match(schema.MIGRATION_STATEMENTS_V52, /idx_companion_events_visible/);
  assert.match(schema.MIGRATION_STATEMENTS_V52, /idx_companion_runtime_jobs_ready/);
  assert.ok(dbSource.indexOf('MIGRATION_STATEMENTS_V52') > dbSource.indexOf('MIGRATION_STATEMENTS_V51'));
});

test('event append is idempotent and selected-route reads invalidate edited source versions', async () => {
  const db = createDatabase();
  try {
    insertThreadAndMessage(db);
    const input = {
      branchRootMessageId: 'root-a', branchVersionIndex: 1, branchRouteHash: 'route-a', candidate: candidate(),
      createdAt: '2026-07-29T08:00:01.000Z', lineageVersion: 4, roleCardId: 'role-a',
      sourceMessageId: 'message-a', space: 'normal', subjectId: 'role-a', subjectType: 'role', threadId: 'thread-a',
    };
    const first = await repository.appendCompanionEvent(db, input);
    const second = await repository.appendCompanionEvent(db, input);
    assert.equal(first.inserted, true);
    assert.equal(second.inserted, false);
    assert.equal(first.event.id, second.event.id);
    assert.equal(first.event.eventSequence, 1);

    const visible = await repository.listVisibleCompanionEvents(db, {
      branchRouteHash: 'route-a', lineageVersion: 4, space: 'normal', threadId: 'thread-a',
    });
    assert.deepEqual(visible.map((item) => item.id), [first.event.id]);
    assert.deepEqual(await repository.listVisibleCompanionEvents(db, {
      branchRouteHash: 'route-b', lineageVersion: 4, space: 'normal', threadId: 'thread-a',
    }), []);

    db.db.prepare('UPDATE ai_messages SET content = ?, updatedAt = ? WHERE id = ?')
      .run('内容已编辑', '2026-07-29T09:00:00.000Z', 'message-a');
    assert.deepEqual(await repository.listVisibleCompanionEvents(db, {
      branchRouteHash: 'route-a', lineageVersion: 4, space: 'normal', threadId: 'thread-a',
    }), []);
  } finally { db.close(); }
});

test('event sequences are branch-local and source deletion cascades', async () => {
  const db = createDatabase();
  try {
    insertThreadAndMessage(db);
    const base = {
      branchRootMessageId: 'root-a', branchVersionIndex: 1, branchRouteHash: 'route-a', candidate: candidate(),
      createdAt: '2026-07-29T08:00:01.000Z', lineageVersion: 4, roleCardId: 'role-a', sourceMessageId: 'message-a',
      space: 'normal', subjectId: 'role-a', subjectType: 'role', threadId: 'thread-a',
    };
    const first = await repository.appendCompanionEvent(db, base);
    const siblingCandidate = { ...candidate(), semanticKey: `${candidate().semanticKey}-sibling` };
    const sibling = await repository.appendCompanionEvent(db, { ...base, branchRouteHash: 'route-b', candidate: siblingCandidate });
    assert.equal(first.event.eventSequence, 1);
    assert.equal(sibling.event.eventSequence, 1);
    db.db.prepare('DELETE FROM ai_messages WHERE id = ?').run('message-a');
    assert.equal(db.db.prepare('SELECT COUNT(*) AS count FROM companion_events').get().count, 0);
  } finally { db.close(); }
});

test('runtime jobs use durable leases, expired takeover and bounded retry/dead transitions', async () => {
  const db = createDatabase();
  try {
    insertThreadAndMessage(db);
    const job = await repository.enqueueCompanionRuntimeJob(db, {
      branchRouteHash: 'route-a', idempotencyKey: 'enrich:message-a', jobType: 'event_enrichment',
      lineageVersion: 4, payload: { sourceMessageIds: ['message-a'] }, sourceMessageId: 'message-a',
      space: 'normal', threadId: 'thread-a', nextRunAt: '2026-07-29T08:00:00.000Z',
    });
    const firstLease = await repository.acquireCompanionRuntimeJob(db, {
      jobId: job.id, leaseOwner: 'worker-a', leaseUntil: '2026-07-29T08:05:00.000Z', now: '2026-07-29T08:00:01.000Z',
    });
    assert.equal(firstLease.leaseOwner, 'worker-a');
    assert.equal(await repository.acquireCompanionRuntimeJob(db, {
      jobId: job.id, leaseOwner: 'worker-b', leaseUntil: '2026-07-29T08:06:00.000Z', now: '2026-07-29T08:01:00.000Z',
    }), null);
    const takeover = await repository.acquireCompanionRuntimeJob(db, {
      jobId: job.id, leaseOwner: 'worker-b', leaseUntil: '2026-07-29T08:11:00.000Z', now: '2026-07-29T08:06:00.000Z',
    });
    assert.equal(takeover.leaseOwner, 'worker-b');
    assert.equal(takeover.attemptCount, 2);

    await repository.failCompanionRuntimeJob(db, { jobId: job.id, leaseOwner: 'worker-b', errorCode: 'invalid_json', nextRunAt: '2026-07-29T08:20:00.000Z', maxAttempts: 3 });
    const retry = await repository.findCompanionRuntimeJob(db, job.id);
    assert.equal(retry.status, 'retry');
    const lease3 = await repository.acquireCompanionRuntimeJob(db, {
      jobId: job.id, leaseOwner: 'worker-c', leaseUntil: '2026-07-29T08:30:00.000Z', now: '2026-07-29T08:20:00.000Z',
    });
    await repository.failCompanionRuntimeJob(db, { jobId: job.id, leaseOwner: lease3.leaseOwner, errorCode: 'invalid_json', nextRunAt: '2026-07-29T09:00:00.000Z', maxAttempts: 3 });
    assert.equal((await repository.findCompanionRuntimeJob(db, job.id)).status, 'dead');
  } finally { db.close(); }
});

test('anchors and OpenLoops transition without crossing physical space databases', async () => {
  const normal = createDatabase();
  const personal = createDatabase();
  try {
    insertThreadAndMessage(normal);
    insertThreadAndMessage(personal);
    const event = (await repository.appendCompanionEvent(normal, {
      branchRootMessageId: 'root-a', branchVersionIndex: 1, branchRouteHash: 'route-a', candidate: candidate(),
      createdAt: '2026-07-29T08:00:01.000Z', lineageVersion: 4, roleCardId: 'role-a', sourceMessageId: 'message-a',
      space: 'normal', subjectId: 'role-a', subjectType: 'role', threadId: 'thread-a',
    })).event;
    const anchor = await repository.upsertCompanionTemporalAnchor(normal, {
      branchRouteHash: 'route-a', confidence: 0.9, idempotencyKey: 'anchor:a', lineageVersion: 4,
      parsed: { rawText: '明天下午', startAtUtc: '2026-07-30T05:00:00.000Z', endAtUtc: '2026-07-30T09:59:59.999Z', parseTimeZone: 'Asia/Shanghai', localDateKey: '2026-07-30', precision: 'hour', type: 'point', recurrenceRule: null, parserVersion: 'companion-temporal-v1', sourceStart: 0, sourceEnd: 5 },
      roleCardId: 'role-a', sourceEventId: event.id, sourceMessageId: 'message-a', space: 'normal', threadId: 'thread-a',
    });
    const loop = await repository.upsertCompanionOpenLoop(normal, {
      anchorId: anchor.id, branchRouteHash: 'route-a', eventId: event.id, idempotencyKey: 'loop:a', lineageVersion: 4,
      loop: { kind: 'result_wait', status: 'open', priority: 65, earliestMentionAt: '2026-07-30T05:00:00.000Z', expiresAt: '2026-08-29T05:00:00.000Z', mentionCount: 0, lastMentionedAt: null, lastMentionedRound: null, recurrenceRule: null },
      roleCardId: 'role-a', sourceMessageId: 'message-a', space: 'normal', threadId: 'thread-a', topicText: '面试结果',
    });
    await repository.transitionCompanionOpenLoop(normal, { id: loop.id, resolutionEvidenceMessageId: 'message-a', status: 'resolved' });
    assert.equal((await repository.listCompanionOpenLoops(normal, { branchRouteHash: 'route-a', lineageVersion: 4, space: 'normal', threadId: 'thread-a', statuses: ['resolved'] }))[0].status, 'resolved');
    assert.equal((await repository.listCompanionOpenLoops(personal, { branchRouteHash: 'route-a', lineageVersion: 4, space: 'personal', threadId: 'thread-a', statuses: ['resolved'] })).length, 0);
  } finally { normal.close(); personal.close(); }
});

test('one-off anchors settle once while recurring anchors advance and reset their occurrence budget', async () => {
  const db = createDatabase();
  try {
    insertThreadAndMessage(db);
    const event = (await repository.appendCompanionEvent(db, {
      branchRootMessageId: 'root-a', branchVersionIndex: 1, branchRouteHash: 'route-a', candidate: candidate(),
      createdAt: '2026-07-29T08:00:01.000Z', lineageVersion: 4, roleCardId: 'role-a', sourceMessageId: 'message-a',
      space: 'normal', subjectId: 'role-a', subjectType: 'role', threadId: 'thread-a',
    })).event;
    const once = await repository.upsertCompanionTemporalAnchor(db, {
      branchRouteHash: 'route-a', confidence: 0.9, idempotencyKey: 'anchor:once', lineageVersion: 4,
      parsed: { rawText: '明天', startAtUtc: '2026-07-30T00:00:00.000Z', endAtUtc: '2026-07-30T23:59:59.999Z', parseTimeZone: 'Asia/Shanghai', localDateKey: '2026-07-30', precision: 'day', type: 'point', recurrenceRule: null, parserVersion: 'companion-temporal-v1', sourceStart: 0, sourceEnd: 2 },
      roleCardId: 'role-a', sourceEventId: event.id, sourceMessageId: 'message-a', space: 'normal', threadId: 'thread-a',
    });
    await repository.markCompanionTemporalAnchorMentioned(db, { id: once.id, mentionedAt: '2026-07-30T08:00:00.000Z' });
    const settled = await repository.listCompanionTemporalAnchors(db, { branchRouteHash: 'route-a', lineageVersion: 4, space: 'normal', statuses: ['completed'], threadId: 'thread-a' });
    assert.equal(settled[0].mentionCount, 1);

    const recurring = await repository.upsertCompanionTemporalAnchor(db, {
      branchRouteHash: 'route-a', confidence: 0.9, idempotencyKey: 'anchor:weekly', lineageVersion: 4,
      parsed: { rawText: '每周五', startAtUtc: '2026-07-31T00:00:00.000Z', endAtUtc: '2026-07-31T23:59:59.999Z', parseTimeZone: 'Asia/Shanghai', localDateKey: '2026-07-31', precision: 'day', type: 'recurrence', recurrenceRule: 'FREQ=WEEKLY;BYDAY=FR', parserVersion: 'companion-temporal-v1', sourceStart: 0, sourceEnd: 3 },
      roleCardId: 'role-a', sourceEventId: event.id, sourceMessageId: 'message-a', space: 'normal', threadId: 'thread-a',
    });
    await repository.markCompanionTemporalAnchorMentioned(db, { id: recurring.id, mentionedAt: '2026-07-31T08:00:00.000Z' });
    const advanced = (await repository.listCompanionTemporalAnchors(db, { branchRouteHash: 'route-a', lineageVersion: 4, space: 'normal', statuses: ['active'], threadId: 'thread-a' }))
      .find((item) => item.id === recurring.id);
    assert.equal(advanced.localDateKey, '2026-08-07');
    assert.equal(advanced.mentionCount, 0);
    assert.equal(advanced.lastMentionedAt, '2026-07-31T08:00:00.000Z');
  } finally { db.close(); }
});

test('one-off temporal anchors retain a seven-day post-event mention grace', async () => {
  const db = createDatabase();
  try {
    insertThreadAndMessage(db);
    const event = (await repository.appendCompanionEvent(db, {
      branchRootMessageId: 'root-a', branchVersionIndex: 1, branchRouteHash: 'route-a', candidate: candidate(),
      createdAt: '2026-07-29T08:00:01.000Z', lineageVersion: 4, roleCardId: 'role-a', sourceMessageId: 'message-a',
      space: 'normal', subjectId: 'role-a', subjectType: 'role', threadId: 'thread-a',
    })).event;
    await repository.upsertCompanionTemporalAnchor(db, {
      branchRouteHash: 'route-a', confidence: 0.9, idempotencyKey: 'anchor:grace', lineageVersion: 4,
      parsed: { rawText: '今天', startAtUtc: '2026-07-29T00:00:00.000Z', endAtUtc: '2026-07-29T23:59:59.999Z', parseTimeZone: 'Asia/Shanghai', localDateKey: '2026-07-29', precision: 'day', type: 'point', recurrenceRule: null, parserVersion: 'companion-temporal-v1', sourceStart: 0, sourceEnd: 2 },
      roleCardId: 'role-a', sourceEventId: event.id, sourceMessageId: 'message-a', space: 'normal', threadId: 'thread-a',
    });
    assert.equal(await repository.expireCompanionTemporalAnchors(db, { branchRouteHash: 'route-a', lineageVersion: 4, now: '2026-08-05T23:59:58.000Z', space: 'normal', threadId: 'thread-a' }), 0);
    assert.equal(await repository.expireCompanionTemporalAnchors(db, { branchRouteHash: 'route-a', lineageVersion: 4, now: '2026-08-06T00:00:00.000Z', space: 'normal', threadId: 'thread-a' }), 1);
  } finally { db.close(); }
});
