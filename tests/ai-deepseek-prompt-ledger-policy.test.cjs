const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Prompt Ledger schema and implementation keep replay data separate from clean messages', () => {
  const schema = fs.readFileSync('src/database/schema.ts', 'utf8');
  const ledger = fs.readFileSync('src/ai/deepseekPromptLedger.ts', 'utf8');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_prompt_requests/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_prompt_snapshots/);
  assert.match(ledger, /pending/);
  assert.match(ledger, /completed/);
  assert.doesNotMatch(ledger, /UPDATE ai_messages SET content/);
});

test('Prompt Ledger replays the rendered user snapshot before its produced assistant', async () => {
  const { replayDeepSeekRenderedUsers } = await import('../src/ai/deepseekPromptReplay.ts');
  const replay = replayDeepSeekRenderedUsers({ branchRouteHash: 'route-a', sourceHash: () => 'hash-clean', history: [{ role: 'user', content: 'clean user text', messageId: 'u1' }, { role: 'assistant', content: 'answer', messageId: 'a1' }], snapshotsByAssistantId: new Map([['a1', [{ role: 'user', messageId: 'u1', renderedContent: 'rendered user prompt', sourceMessageVersionHash: 'hash-clean', branchRouteHash: 'route-a' }]]]) });
  assert.equal(replay[0].content, 'rendered user prompt');
  assert.equal(replay[1].content, 'answer');
});

test('Prompt Ledger rejects stale or cross-branch snapshots', async () => {
  const { replayDeepSeekRenderedUsers } = await import('../src/ai/deepseekPromptReplay.ts');
  const replay = replayDeepSeekRenderedUsers({ branchRouteHash: 'route-a', sourceHash: () => 'hash-new', history: [{ role: 'user', content: 'new', messageId: 'u1' }, { role: 'assistant', content: 'answer', messageId: 'a1' }], snapshotsByAssistantId: new Map([['a1', [{ role: 'user', messageId: 'u1', renderedContent: 'stale', sourceMessageVersionHash: 'hash-old', branchRouteHash: 'route-b' }]]]) });
  assert.equal(replay[0].content, 'new');
});
