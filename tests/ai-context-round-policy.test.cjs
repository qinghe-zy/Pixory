const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('AI context selection counts complete user-assistant rounds', () => {
  const service = read('src/ai/aiChatService.ts');
  assert.match(service, /selectRecentMessagesByRound/);
  assert.match(service, /role === 'user'/);
  assert.match(service, /role === 'assistant'/);
  assert.match(service, /currentRound\?\.some\(\(message\) => message\.role === 'assistant'\)/);
  assert.match(service, /rounds\.slice\(-normalizedRounds\)/);
  assert.doesNotMatch(service, /MAX_CONTEXT_HISTORY_LOAD_MESSAGES/);
  const settings = read('src/ai/aiContextSettings.ts');
  assert.match(settings, /historyRoundLimit: 30/);
  assert.match(settings, /\[4, 20, 1\]/);
  assert.match(settings, /\[1000, 2500, 100\]/);
});

test('AI context token trimming keeps complete rounds together', () => {
  const budget = read('src/ai/aiContextBudget.ts');
  assert.match(budget, /!Number\.isFinite\(modelContextWindowTokens\)/);
  assert.match(budget, /conversationRounds/);
  assert.match(budget, /roundTokens/);
  assert.match(budget, /selectedRounds/);
});

test('AI thread exports and imports preserve the context round limit', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const importBlock = /async importThread\([\s\S]*?\n  \},\n\n  async/.exec(repository)?.[0] ?? '';
  assert.match(importBlock, /contextHistoryRoundLimit/);
  assert.match(importBlock, /snapshot\.thread\.contextHistoryRoundLimit \?\? 30/);
});
