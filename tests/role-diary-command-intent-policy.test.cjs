const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

test('uses a local diary-creation phrase list, bounded natural phrasing, and a quiet confirmation', () => {
  const intent = readFileSync('src/ai/diary/diaryCommandIntent.ts', 'utf8');
  const chat = readFileSync('src/screens/AiChatScreen.tsx', 'utf8');

  assert.match(intent, /DIARY_CREATION_PHRASES/);
  assert.match(intent, /isDiaryCreationRequest/);
  assert.match(intent, /normalized === phrase/);
  assert.match(intent, /DIARY_CREATION_PATTERNS/);
  assert.match(intent, /pattern\.test\(normalized\)/);
  assert.match(intent, /帮我写一篇日记/);
  assert.match(intent, /把这段聊天写成日记/);
  assert.match(intent, /把刚才的对话整理成日记/);
  assert.match(chat, /isDiaryCreationRequest\(typedText\)/);
  assert.match(chat, /diaryCommandHint/);
  assert.match(chat, /是否要为您创作日记/);
  assert.match(chat, /setDiaryCommandHint\(false\)/);
});

test('keeps the nightly automatic diary independent from a confirmed manual version', () => {
  const repository = readFileSync('src/ai/diary/diaryRepository.ts', 'utf8');
  const scheduler = readFileSync('src/ai/diary/diarySchedulerService.ts', 'utf8');
  const chat = readFileSync('src/screens/AiChatScreen.tsx', 'utf8');

  assert.match(repository, /hasCompletedAutomaticDiary/);
  assert.match(scheduler, /hasCompletedAutomaticDiary/);
  assert.match(chat, /hasCompletedAutomaticDiary/);
});
