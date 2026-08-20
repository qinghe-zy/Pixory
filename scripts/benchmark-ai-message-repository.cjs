const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { performance } = require('node:perf_hooks');

const MESSAGE_COUNT = 6_000;
const PAGE_SIZE = 60;
const SAMPLE_COUNT = 31;
const THREAD_ID = 'benchmark-thread';

function median(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function explain(db, sql, params) {
  return db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params).map((row) => String(row.detail));
}

function measure(statement, params) {
  for (let warmup = 0; warmup < 3; warmup += 1) {
    statement.all(...params);
  }
  const samples = [];
  let rows = [];
  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const startedAt = performance.now();
    rows = statement.all(...params);
    samples.push(performance.now() - startedAt);
  }
  return {
    medianMs: Number(median(samples).toFixed(3)),
    resultCount: rows.length,
  };
}

function assertAscending(rows) {
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    assert.ok(
      previous.createdAt < current.createdAt
        || (previous.createdAt === current.createdAt && previous.id < current.id),
      `unstable message order at ${previous.id} -> ${current.id}`,
    );
  }
}

const visibleMessage = `
  ai_messages.branchRootMessageId IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM ai_continuity_import_sessions rolled_back_import
    WHERE rolled_back_import.id = ai_messages.continuityImportSessionId
      AND rolled_back_import.reviewGateState = 'rolled_back'
  )
`;

const latestSql = `
  SELECT * FROM (
    SELECT * FROM ai_messages
    WHERE threadId = ? AND ${visibleMessage}
    ORDER BY createdAt DESC, id DESC
    LIMIT ?
  )
  ORDER BY createdAt ASC, id ASC
`;

const beforeSql = `
  SELECT * FROM (
    SELECT * FROM ai_messages
    WHERE threadId = ? AND ${visibleMessage}
      AND (createdAt < ? OR (createdAt = ? AND id < ?))
    ORDER BY createdAt DESC, id DESC
    LIMIT ?
  )
  ORDER BY createdAt ASC, id ASC
`;

const aroundAnchorSql = `
  WITH anchor AS (
    SELECT ai_messages.* FROM ai_messages
    WHERE ai_messages.id = ? AND ai_messages.threadId = ? AND ${visibleMessage}
  ),
  latest_rows AS (
    SELECT ai_messages.* FROM ai_messages
    WHERE ai_messages.threadId = ? AND ${visibleMessage}
    ORDER BY ai_messages.createdAt DESC, ai_messages.id DESC
    LIMIT ?
  ),
  before_rows AS (
    SELECT ai_messages.* FROM ai_messages CROSS JOIN anchor
    WHERE ai_messages.threadId = ? AND ${visibleMessage}
      AND (
        ai_messages.createdAt < anchor.createdAt
        OR (ai_messages.createdAt = anchor.createdAt AND ai_messages.id < anchor.id)
      )
    ORDER BY ai_messages.createdAt DESC, ai_messages.id DESC
    LIMIT ?
  ),
  after_rows AS (
    SELECT ai_messages.* FROM ai_messages CROSS JOIN anchor
    WHERE ai_messages.threadId = ? AND ${visibleMessage}
      AND (
        ai_messages.createdAt > anchor.createdAt
        OR (ai_messages.createdAt = anchor.createdAt AND ai_messages.id > anchor.id)
      )
    ORDER BY ai_messages.createdAt ASC, ai_messages.id ASC
    LIMIT ?
  )
  SELECT * FROM (
    SELECT * FROM latest_rows
    UNION
    SELECT * FROM before_rows
    UNION
    SELECT * FROM anchor
    UNION
    SELECT * FROM after_rows
  ) combined_rows
  ORDER BY createdAt ASC, id ASC
`;

const db = new DatabaseSync(':memory:');
try {
  db.exec(`
    PRAGMA journal_mode = MEMORY;
    PRAGMA synchronous = OFF;
    CREATE TABLE ai_messages (
      id TEXT PRIMARY KEY,
      threadId TEXT NOT NULL,
      branchRootMessageId TEXT,
      branchVersionIndex INTEGER,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      content TEXT NOT NULL,
      reasoningText TEXT,
      errorMessage TEXT,
      providerId TEXT,
      modelId TEXT,
      modelSnapshotJson TEXT NOT NULL,
      promptSnapshotJson TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      completedAt TEXT,
      continuityImportSessionId TEXT
    );
    CREATE TABLE ai_continuity_import_sessions (
      id TEXT PRIMARY KEY,
      reviewGateState TEXT NOT NULL
    );
    CREATE INDEX idx_ai_messages_thread_created_id
      ON ai_messages(threadId, createdAt DESC, id DESC);
  `);

  const seedStartedAt = performance.now();
  const insert = db.prepare(`
    INSERT INTO ai_messages (
      id, threadId, branchRootMessageId, branchVersionIndex, role, status, content,
      modelSnapshotJson, promptSnapshotJson, createdAt, updatedAt
    ) VALUES (?, ?, NULL, NULL, ?, 'completed', ?, '{}', '{}', ?, ?)
  `);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (let index = 0; index < MESSAGE_COUNT; index += 1) {
      const id = `msg-${String(index).padStart(6, '0')}`;
      const createdAt = String(Math.floor(index / 4)).padStart(12, '0');
      insert.run(id, THREAD_ID, index % 2 === 0 ? 'user' : 'assistant', `message ${index}`, createdAt, createdAt);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  const seedMs = Number((performance.now() - seedStartedAt).toFixed(3));

  const latestParams = [THREAD_ID, PAGE_SIZE];
  const latestStatement = db.prepare(latestSql);
  const latestRows = latestStatement.all(...latestParams);
  assert.equal(latestRows.length, PAGE_SIZE);
  assertAscending(latestRows);

  const firstCursor = latestRows[0];
  const beforeParams = [
    THREAD_ID,
    firstCursor.createdAt,
    firstCursor.createdAt,
    firstCursor.id,
    PAGE_SIZE,
  ];
  const beforeStatement = db.prepare(beforeSql);
  const beforeRows = beforeStatement.all(...beforeParams);
  assert.equal(beforeRows.length, PAGE_SIZE);
  assertAscending(beforeRows);

  const sideLimit = Math.ceil(PAGE_SIZE / 2);
  const aroundParams = [
    'msg-003000',
    THREAD_ID,
    THREAD_ID,
    PAGE_SIZE,
    THREAD_ID,
    sideLimit,
    THREAD_ID,
    sideLimit,
  ];
  const aroundStatement = db.prepare(aroundAnchorSql);
  const aroundRows = aroundStatement.all(...aroundParams);
  assert.ok(aroundRows.some((row) => row.id === 'msg-003000'));
  assertAscending(aroundRows);

  const missingAnchorParams = aroundParams.slice();
  missingAnchorParams[0] = 'missing-anchor';
  const missingAnchorRows = aroundStatement.all(...missingAnchorParams);
  assert.deepEqual(missingAnchorRows.map((row) => row.id), latestRows.map((row) => row.id));

  const traversalStartedAt = performance.now();
  const traversedIds = new Set(latestRows.map((row) => row.id));
  let cursor = latestRows[0];
  let pageCount = 1;
  while (cursor) {
    const rows = beforeStatement.all(
      THREAD_ID,
      cursor.createdAt,
      cursor.createdAt,
      cursor.id,
      PAGE_SIZE,
    );
    if (rows.length === 0) {
      break;
    }
    assertAscending(rows);
    rows.forEach((row) => traversedIds.add(row.id));
    cursor = rows[0];
    pageCount += 1;
  }
  const traversalMs = Number((performance.now() - traversalStartedAt).toFixed(3));
  assert.equal(traversedIds.size, MESSAGE_COUNT);
  assert.equal(pageCount, MESSAGE_COUNT / PAGE_SIZE);

  const latestPlan = explain(db, latestSql, latestParams);
  const beforePlan = explain(db, beforeSql, beforeParams);
  const aroundPlan = explain(db, aroundAnchorSql, aroundParams);
  for (const plan of [latestPlan, beforePlan, aroundPlan]) {
    assert.ok(plan.some((detail) => detail.includes('idx_ai_messages_thread_created_id')), plan.join('\n'));
  }

  const result = {
    aroundAnchor: {
      ...measure(aroundStatement, aroundParams),
      plan: aroundPlan,
    },
    beforePage: {
      ...measure(beforeStatement, beforeParams),
      plan: beforePlan,
    },
    environment: {
      node: process.version,
      platform: process.platform,
    },
    latestPage: {
      ...measure(latestStatement, latestParams),
      plan: latestPlan,
    },
    seed: {
      rowCount: MESSAGE_COUNT,
      seedMs,
    },
    traversal: {
      pageCount,
      traversedCount: traversedIds.size,
      traversalMs,
    },
    workload: {
      pageSize: PAGE_SIZE,
      samples: SAMPLE_COUNT,
    },
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  db.close();
}
