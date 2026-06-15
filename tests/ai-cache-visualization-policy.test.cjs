const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('AI usage overview loads only scoped assistant observations', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const service = read('src/ai/aiChatService.ts');

  assert.match(repository, /listAssistantUsageObservationMessages/);
  assert.match(repository, /ai_threads\.space = \?/);
  assert.match(repository, /ai_messages\.role = 'assistant'/);
  assert.match(repository, /ai_messages\.promptSnapshotJson <> '\{\}'/);
  assert.match(service, /loadAiUsageOverview/);
  assert.match(service, /aggregateAiUsageObservations/);
});

test('thread AI usage overview checks thread belongs to current space', () => {
  const service = read('src/ai/aiChatService.ts');
  assert.match(service, /loadThreadAiUsageOverview/);
  assert.match(service, /thread\.space !== space/);
  assert.match(service, /return emptyAiUsageAggregate/);
});
