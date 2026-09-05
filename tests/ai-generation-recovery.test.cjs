const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const old = require.extensions['.ts'];
require.extensions['.ts'] = function compile(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
let recovery;
try { recovery = require(path.join(root, 'src/ai/generation/aiGenerationRecovery.ts')); }
finally { if (old) require.extensions['.ts'] = old; else delete require.extensions['.ts']; }

test('generation transitions permit only the persisted recovery state machine', () => {
  assert.equal(recovery.canTransitionGeneration('prepared', 'requesting'), true);
  assert.equal(recovery.canTransitionGeneration('requesting', 'streaming'), true);
  assert.equal(recovery.canTransitionGeneration('streaming', 'recoverable_interrupted'), true);
  assert.equal(recovery.canTransitionGeneration('recoverable_interrupted', 'continuing'), true);
  assert.equal(recovery.canTransitionGeneration('recoverable_interrupted', 'retrying'), true);
  assert.equal(recovery.canTransitionGeneration('completed', 'streaming'), false);
  assert.equal(recovery.canTransitionGeneration('failed', 'retrying'), false);
});

test('continuation overlap removes only a real suffix-prefix duplicate', () => {
  assert.equal(
    recovery.mergeContinuationDelta('湖面映着月光，风很轻。', '湖面映着月光，风很轻。', '风很轻。我们继续往前走。'),
    '湖面映着月光，风很轻。我们继续往前走。',
  );
  assert.equal(
    recovery.mergeContinuationDelta('第一段。', '第一段。', '第二段。'),
    '第一段。第二段。',
  );
});

test('recovery decision is bounded to one retry and one continuation', () => {
  assert.equal(recovery.decideGenerationRecovery({ partialContent: '', retryCount: 0, continuationCount: 0 }), 'retry');
  assert.equal(recovery.decideGenerationRecovery({ partialContent: '已有内容', retryCount: 0, continuationCount: 0 }), 'continue');
  assert.equal(recovery.decideGenerationRecovery({ partialContent: '', retryCount: 1, continuationCount: 0 }), 'stop');
  assert.equal(recovery.decideGenerationRecovery({ partialContent: '已有内容', retryCount: 0, continuationCount: 1 }), 'stop');
});

test('V55 schema and chat integration persist jobs before provider requests and settle terminal state', () => {
  const schema = fs.readFileSync(path.join(root, 'src/database/schema.ts'), 'utf8');
  const db = fs.readFileSync(path.join(root, 'src/database/db.ts'), 'utf8');
  const chat = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  const manager = fs.readFileSync(path.join(root, 'src/ai/aiGenerationManager.ts'), 'utf8');
  assert.match(schema, /DATABASE_VERSION = (?:5[5-9]|6[01])/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_generation_jobs/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_generation_events/);
  assert.match(db, /MIGRATION_STATEMENTS_V55/);
  assert.match(chat, /createPreparedGenerationJob/);
  assert.ok(chat.indexOf('transitionGenerationToRequesting') < chat.lastIndexOf('adapter.streamChat'));
  assert.match(chat, /settleGenerationJob/);
  assert.match(manager, /reconcileInterruptedGenerations/);
});

test('recovery hard-stop atomically releases any reserved thought with the message and job', () => {
  const chat = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  const start = chat.indexOf('export async function stopInterruptedGeneration');
  const end = chat.indexOf('\nasync function loadThreadForGeneration', start);
  const body = chat.slice(start, end);
  assert.match(body, /withTransactionAsync/);
  assert.match(body, /releaseThoughtReservationForMessage\(db,\s*job\.assistantMessageId,\s*now\)/);
  assert.ok(body.indexOf('releaseThoughtReservationForMessage') < body.indexOf('settleGenerationJob'));
});
