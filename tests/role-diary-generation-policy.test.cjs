const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

test('generates a diary with the thread model without chat-message streaming', () => {
  const source = readFileSync('src/ai/diary/diaryGenerationService.ts', 'utf8');

  assert.match(source, /resolveThreadChatModel/);
  assert.match(source, /getAdapterForProvider/);
  assert.match(source, /diaryRepository\.saveDiaryVersion/);
  assert.doesNotMatch(source, /createAssistantMessage|updateStreamingMessage|ai_messages/);
});

test('regenerates a diary from its completed frozen-source job', () => {
  const servicePath = 'src/ai/diary/diaryVersionService.ts';
  const versionService = require('node:fs').existsSync(servicePath)
    ? readFileSync(servicePath, 'utf8')
    : '';

  assert.match(versionService, /findSourceJobForVersion/);
  assert.match(versionService, /sourceMessagesJson:\s*sourceJob\.sourceMessagesJson/);
  assert.match(versionService, /sourceBranchRouteJson:\s*sourceJob\.sourceBranchRouteJson/);
  assert.doesNotMatch(versionService, /prepareAndScheduleDiaryJob/);
});
