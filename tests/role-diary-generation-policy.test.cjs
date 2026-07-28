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
