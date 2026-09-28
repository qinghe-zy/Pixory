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
  const importStart = repository.indexOf('async importThread');
  const importEnd = repository.indexOf('async deleteUserProfilesBoundToThreads', importStart);
  const importBlock = importStart >= 0 && importEnd > importStart
    ? repository.slice(importStart, importEnd)
    : '';
  assert.match(importBlock, /contextHistoryRoundLimit/);
  assert.match(importBlock, /snapshot\.thread\.contextHistoryRoundLimit \?\? 30/);
});

test('every assistant generation compiles one branch-aware coverage plan before provider dispatch', () => {
  const service = read('src/ai/aiChatService.ts');
  assert.match(service, /compileConversationCoverage/);
  assert.match(service, /anchorMessageId:\s*options\?\.historyAnchorMessageId/);
  assert.match(service, /historyRoundLimit/);
  assert.match(service, /coverage\.recentMessages/);
  assert.match(service, /stableSummarySnapshot:\s*coverage\.stableSummaryText/);
  assert.match(service, /type:\s*'summary_bridge'/);
  assert.match(service, /coverage\.plan\.coverageComplete/);
  assert.match(service, /coverageComplete\s*=\s*coverage\.plan\.coverageComplete/);
});

test('coverage diagnostics are content-free and include dynamic token counts', () => {
  const metrics = read('src/ai/aiGenerationMetrics.ts');
  for (const field of [
    'coverageComplete',
    'coverageSummarySegmentCount',
    'coverageBridgeMessageCount',
    'coverageProvisionalMessageCount',
    'coverageLineageVersion',
    'dynamicContextTokenCount',
  ]) {
    assert.match(metrics, new RegExp(`${field}:`));
  }
  assert.doesNotMatch(metrics, /coverageText|bridgeText|summaryText/);
});
