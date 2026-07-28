const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

test('builds a diary-only prompt from timestamped active-branch day messages', () => {
  const repository = readFileSync('src/database/repositories/aiThreadRepository.ts', 'utf8');
  const prompt = readFileSync('src/ai/diary/diaryPromptService.ts', 'utf8');

  assert.match(repository, /listCompletedMessagesInDateRange/);
  assert.match(repository, /candidate\.createdAt >= \?/);
  assert.match(prompt, /\[角色日记请求\]/);
  assert.match(prompt, /\[当日消息\]/);
  assert.match(prompt, /通常不超过 300 个汉字/);
  assert.match(prompt, /不得提及 AI、模型、系统、提示词、上下文、记忆、数据、生成/);
  assert.match(prompt, /historyRoundLimit \* 3/);
});
