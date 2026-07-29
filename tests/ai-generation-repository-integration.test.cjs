const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const oldTs = require.extensions['.ts'];
require.extensions['.ts'] = function compile(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const schema = require(path.join(root, 'src/database/schema.ts'));
const repository = require(path.join(root, 'src/ai/generation/aiGenerationRepository.ts'));
if (oldTs) require.extensions['.ts'] = oldTs; else delete require.extensions['.ts'];

class DB {
  constructor(space) {
    this.db = new DatabaseSync(':memory:');
    this.db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE ai_threads(id TEXT PRIMARY KEY, space TEXT NOT NULL);
      CREATE TABLE ai_messages(id TEXT PRIMARY KEY, threadId TEXT NOT NULL,
        FOREIGN KEY(threadId) REFERENCES ai_threads(id) ON DELETE CASCADE);
      INSERT INTO ai_threads VALUES('t', '${space}');
      INSERT INTO ai_messages VALUES('u', 't');
      INSERT INTO ai_messages VALUES('a', 't');`);
    this.db.exec(schema.MIGRATION_STATEMENTS_V55);
  }
  async runAsync(sql, ...params) { return this.db.prepare(sql).run(...params); }
  async getFirstAsync(sql, ...params) { return this.db.prepare(sql).get(...params) ?? null; }
  async getAllAsync(sql, ...params) { return this.db.prepare(sql).all(...params); }
  async withTransactionAsync(task) {
    this.db.exec('BEGIN');
    try { const result = await task(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}

function preparedInput(space, generationId = `g-${space}`) {
  return {
    assistantMessageId: 'a', attemptId: 'attempt-1', branchRouteHash: 'route-1', generationId,
    lineageVersion: 1, now: '2026-07-29T10:00:00.000Z', partialContent: '', partialReasoning: null,
    requestMode: 'replace', requestSnapshotJson: '{"version":1}', space, threadId: 't', userMessageId: 'u',
  };
}

test('generation repository orders events, leases recovery, and settles idempotently', async () => {
  const db = new DB('normal');
  try {
    const prepared = await repository.createPreparedGenerationJob(db, preparedInput('normal'));
    assert.equal(prepared.state, 'prepared');
    await repository.transitionGenerationJob(db, { generationId: prepared.generationId, now: '2026-07-29T10:00:01.000Z', state: 'requesting' });
    await repository.transitionGenerationJob(db, { generationId: prepared.generationId, now: '2026-07-29T10:00:02.000Z', state: 'streaming' });
    await repository.persistGenerationPartial(db, { content: '部分回复', generationId: prepared.generationId, now: '2026-07-29T10:00:03.000Z', reasoning: null });
    await repository.markInterruptedGenerationJobs(db, { now: '2026-07-29T10:01:00.000Z', space: 'normal' });
    const [recoverable] = await repository.listRecoverableGenerationJobs(db, 'normal');
    assert.equal(recoverable.partialContent, '部分回复');
    const claimed = await repository.claimGenerationRecovery(db, {
      jobId: recoverable.id, leaseExpiresAt: '2026-07-29T10:03:00.000Z', leaseOwner: 'owner-a', now: '2026-07-29T10:01:01.000Z',
    });
    assert.equal(claimed.state, 'reconciling');
    assert.equal(await repository.claimGenerationRecovery(db, {
      jobId: recoverable.id, leaseExpiresAt: '2026-07-29T10:04:00.000Z', leaseOwner: 'owner-b', now: '2026-07-29T10:01:02.000Z',
    }), null);
    const continuing = await repository.beginGenerationRecoveryAttempt(db, {
      attemptId: 'attempt-2', decision: 'continue', generationId: prepared.generationId, leaseExpiresAt: '2026-07-29T10:03:00.000Z', leaseOwner: 'owner-a', now: '2026-07-29T10:01:03.000Z',
    });
    assert.equal(continuing.continuationCount, 1);
    assert.equal(continuing.attemptId, 'attempt-2');
    await repository.settleGenerationJob(db, { completionReason: 'completed', content: '部分回复完成', generationId: prepared.generationId, now: '2026-07-29T10:01:05.000Z', reasoning: null, state: 'completed' });
    await repository.settleGenerationJob(db, { completionReason: 'completed-again', content: '不可覆盖', generationId: prepared.generationId, now: '2026-07-29T10:01:06.000Z', reasoning: null, state: 'completed' });
    const final = await repository.findGenerationJobByGenerationId(db, prepared.generationId);
    assert.equal(final.partialContent, '部分回复完成');
    const events = await db.getAllAsync('SELECT sequence, payloadJson FROM ai_generation_events ORDER BY sequence');
    assert.deepEqual(events.map((event) => Number(event.sequence)), events.map((_, index) => index + 1));
    assert.ok(events.every((event) => !event.payloadJson.includes('部分回复')));
  } finally { db.close(); }
});

test('normal and Personal generation jobs remain physically isolated', async () => {
  const normal = new DB('normal');
  const personal = new DB('personal');
  try {
    await repository.createPreparedGenerationJob(normal, preparedInput('normal', 'g-normal'));
    await repository.createPreparedGenerationJob(personal, preparedInput('personal', 'g-personal'));
    assert.equal((await repository.findGenerationJobByGenerationId(normal, 'g-personal')), null);
    assert.equal((await repository.findGenerationJobByGenerationId(personal, 'g-normal')), null);
  } finally { normal.close(); personal.close(); }
});

test('startup cleanup preserves recoverable placeholders and stops only true orphans', () => {
  const dbSource = fs.readFileSync(path.join(root, 'src/database/db.ts'), 'utf8');
  assert.match(dbSource, /markInterruptedGenerationJobs/);
  assert.match(dbSource, /NOT EXISTS[\s\S]*ai_generation_jobs/);
  assert.match(dbSource, /state NOT IN \('completed', 'failed', 'stopped'\)/);
});
