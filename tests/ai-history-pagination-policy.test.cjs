const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('AI history is keyset paged in SQL and virtualized in the screen', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const service = read('src/ai/aiChatService.ts');
  const screen = read('src/screens/AiHistoryScreen.tsx');
  const historyMethod = repository.slice(
    repository.indexOf('async listHistoryItemPage'),
    repository.indexOf('async createMessage'),
  );

  assert.match(repository, /AiThreadHistoryPageCursor/);
  assert.match(historyMethod, /projected_history\.lastMessageAt < \?/);
  assert.match(historyMethod, /ai_threads\.id < \?/);
  assert.match(historyMethod, /LIMIT \?/);
  assert.doesNotMatch(historyMethod, /\.filter\(\(item\)/);
  assert.match(service, /listAiHistoryThreadPage/);
  assert.match(screen, /<FlatList/);
  assert.match(screen, /onEndReached=/);
  assert.match(screen, /historyRequestGenerationRef/);
  assert.match(screen, /generation !== historyRequestGenerationRef\.current/);
  assert.match(screen, /historyPageRequestInFlightRef/);
  assert.match(screen, /historyPageRequestInFlightRef\.current\s*=\s*true/);
  assert.match(screen, /if \(!hasMore \|\| historyPageRequestInFlightRef\.current/);
  assert.doesNotMatch(screen, /items\.map\(\(thread, index\)/);
});
