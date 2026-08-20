const assert = require('node:assert/strict');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const root = path.resolve(__dirname, '..');
const MEDIA_ROW_COUNT = 100_000;
const PAGE_SIZE = 40;
const SAMPLE_COUNT = 31;

function readPerformanceIndexStatements() {
  const source = fs.readFileSync(path.join(root, 'src/database/db.ts'), 'utf8');
  const match = source.match(/const MEDIA_PERFORMANCE_INDEX_STATEMENTS = `([\s\S]*?)`;/);
  assert.ok(match, 'media performance index statements were not found');
  return match[1];
}

function median(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function explain(db, sql, params) {
  return db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params).map((row) => String(row.detail));
}

function measurePreparedQuery(db, sql, params) {
  const statement = db.prepare(sql);
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

function assertPlan(plan, expectedIndex) {
  assert.ok(plan.some((detail) => detail.includes(expectedIndex)), plan.join('\n'));
  plan.forEach((detail) => assert.doesNotMatch(detail, /USE TEMP B-TREE/));
}

const db = new DatabaseSync(':memory:');
try {
  db.exec(`
    PRAGMA journal_mode = MEMORY;
    PRAGMA synchronous = OFF;
    CREATE TABLE image_assets (
      id INTEGER PRIMARY KEY,
      ipId INTEGER NOT NULL,
      mediaType TEXT NOT NULL,
      deletedAt TEXT,
      createdAt TEXT NOT NULL,
      lastViewedAt TEXT
    );
    CREATE TABLE ai_messages (
      id TEXT PRIMARY KEY,
      threadId TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);

  const seedStartedAt = performance.now();
  const insert = db.prepare(`
    INSERT INTO image_assets (id, ipId, mediaType, deletedAt, createdAt, lastViewedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (let id = 1; id <= MEDIA_ROW_COUNT; id += 1) {
      const timestamp = String(id).padStart(12, '0');
      insert.run(
        id,
        (id % 100) + 1,
        id % 5 === 0 ? 'video' : 'image',
        id % 97 === 0 ? timestamp : null,
        timestamp,
        id % 3 === 0 ? null : timestamp,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  db.exec(readPerformanceIndexStatements());
  const seedAndIndexMs = Number((performance.now() - seedStartedAt).toFixed(3));

  const createdFirstPageSql = `
    SELECT id, createdAt FROM image_assets
    WHERE ipId = ? AND mediaType = ? AND deletedAt IS NULL
    ORDER BY createdAt DESC, id DESC LIMIT ?
  `;
  const createdFirstPage = db.prepare(createdFirstPageSql).all(42, 'image', PAGE_SIZE);
  const createdAnchor = createdFirstPage.at(-1);
  assert.ok(createdAnchor, 'created cursor anchor is missing');
  const createdCursorPageSql = `
    SELECT id, createdAt FROM image_assets
    WHERE ipId = ? AND mediaType = ? AND deletedAt IS NULL
      AND (createdAt < ? OR (createdAt = ? AND id < ?))
    ORDER BY createdAt DESC, id DESC LIMIT ?
  `;
  const createdParams = [42, 'image', createdAnchor.createdAt, createdAnchor.createdAt, createdAnchor.id, PAGE_SIZE];

  const recentFirstPageSql = `
    SELECT id, lastViewedAt FROM image_assets
    WHERE mediaType = ? AND deletedAt IS NULL AND lastViewedAt IS NOT NULL
    ORDER BY lastViewedAt DESC, id DESC LIMIT ?
  `;
  const recentFirstPage = db.prepare(recentFirstPageSql).all('image', PAGE_SIZE);
  const recentAnchor = recentFirstPage.at(-1);
  assert.ok(recentAnchor, 'recent cursor anchor is missing');
  const recentCursorPageSql = `
    SELECT id, lastViewedAt FROM image_assets
    WHERE mediaType = ? AND deletedAt IS NULL AND lastViewedAt IS NOT NULL
      AND (lastViewedAt < ? OR (lastViewedAt = ? AND id < ?))
    ORDER BY lastViewedAt DESC, id DESC LIMIT ?
  `;
  const recentParams = ['image', recentAnchor.lastViewedAt, recentAnchor.lastViewedAt, recentAnchor.id, PAGE_SIZE];

  const videoFirstPageSql = `
    SELECT id, createdAt FROM image_assets
    WHERE ipId = ? AND mediaType = ? AND deletedAt IS NULL
    ORDER BY createdAt DESC, id DESC LIMIT ?
  `;
  const videoFirstPage = db.prepare(videoFirstPageSql).all(41, 'video', PAGE_SIZE);
  const videoAnchor = videoFirstPage.at(-1);
  assert.ok(videoAnchor, 'video cursor anchor is missing');
  const videoCursorPageSql = `
    SELECT id, createdAt FROM image_assets
    WHERE ipId = ? AND mediaType = ? AND deletedAt IS NULL
      AND (createdAt < ? OR (createdAt = ? AND id < ?))
    ORDER BY createdAt DESC, id DESC LIMIT ?
  `;
  const videoParams = [41, 'video', videoAnchor.createdAt, videoAnchor.createdAt, videoAnchor.id, PAGE_SIZE];

  const createdPlan = explain(db, createdCursorPageSql, createdParams);
  const recentPlan = explain(db, recentCursorPageSql, recentParams);
  const videoPlan = explain(db, videoCursorPageSql, videoParams);
  assertPlan(createdPlan, 'idx_image_assets_ip_media_live_created');
  assertPlan(recentPlan, 'idx_image_assets_media_live_viewed');
  assertPlan(videoPlan, 'idx_image_assets_ip_media_live_created');

  const result = {
    createdCursorPage: {
      ...measurePreparedQuery(db, createdCursorPageSql, createdParams),
      plan: createdPlan,
    },
    environment: {
      node: process.version,
      platform: process.platform,
    },
    recentCursorPage: {
      ...measurePreparedQuery(db, recentCursorPageSql, recentParams),
      plan: recentPlan,
    },
    seed: {
      rowCount: MEDIA_ROW_COUNT,
      seedAndIndexMs,
    },
    videoCursorPage: {
      ...measurePreparedQuery(db, videoCursorPageSql, videoParams),
      plan: videoPlan,
    },
    workload: {
      pageSize: PAGE_SIZE,
      samples: SAMPLE_COUNT,
    },
  };

  for (const page of [result.createdCursorPage, result.recentCursorPage, result.videoCursorPage]) {
    assert.equal(page.resultCount, PAGE_SIZE);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  db.close();
}
