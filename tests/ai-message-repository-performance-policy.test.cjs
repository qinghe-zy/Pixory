const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('anchor-window loading is one deterministic SQLite statement', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const body = repository.slice(
    repository.indexOf('async listMessagesBaseAroundAnchor'),
    repository.indexOf('async findMessageById'),
  );

  assert.match(body, /WITH anchor AS/);
  assert.match(body, /latest_rows AS/);
  assert.match(body, /before_rows AS/);
  assert.match(body, /after_rows AS/);
  assert.match(body, /UNION/);
  assert.match(body, /ORDER BY createdAt ASC, id ASC/);
  assert.equal((body.match(/db\.getAllAsync/g) ?? []).length, 1);
  assert.doesNotMatch(body, /getFirstAsync/);
  assert.doesNotMatch(body, /Promise\.all/);
  assert.doesNotMatch(body, /\.sort\(/);
});

test('chat repository benchmark covers a 6000-message keyset traversal', () => {
  const benchmark = read('scripts/benchmark-ai-message-repository.cjs');
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(packageJson.scripts['bench:chat-db'], 'node scripts/benchmark-ai-message-repository.cjs');
  assert.match(benchmark, /MESSAGE_COUNT = 6_000/);
  assert.match(benchmark, /PAGE_SIZE = 60/);
  assert.match(benchmark, /EXPLAIN QUERY PLAN/);
  assert.match(benchmark, /idx_ai_messages_thread_created_id/);
  assert.match(benchmark, /assert\.equal\(traversedIds\.size, MESSAGE_COUNT\)/);
  assert.doesNotMatch(benchmark, /\bOFFSET\b/i);
});
