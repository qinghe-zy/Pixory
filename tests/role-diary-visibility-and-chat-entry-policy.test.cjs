const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

const read = (path) => readFileSync(path, 'utf8');

test('manual diary generation surfaces a failed durable job to the chat UI', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /const \[diaryGenerationStatus, setDiaryGenerationStatus\]/);
  assert.match(chat, /diaryRepository\.findJobById/);
  assert.match(chat, /throw new Error\(completedJob\?\.errorMessage/);
  assert.match(chat, /正在为您创作日记\.\.\./);
  assert.match(chat, /<ActivityIndicator/);
  assert.match(chat, /日记生成失败/);
});

test('diary background work waits until the current chat has rendered its first message page', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /if \(isInitialMessageLoading\) \{\s*return;\s*\}/);
  assert.match(chat, /\[activeThreadId, isInitialMessageLoading/);
});

test('nonessential chat chrome waits for the first message page before querying local data', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /if \(isInitialMessageLoading\) \{\s*return;\s*\}[\s\S]{0,120}reloadModelLabel/);
  assert.match(chat, /void reloadModelLabel\(threadId \?\? null\);[\s\S]{0,180}reloadParticipantAppearance[\s\S]{0,180}reloadThreadTitle/);
});

test('AI workbench keeps a local recent-chat snapshot while refreshing it in the background', () => {
  const home = read('src/screens/AiHomeScreen.tsx');

  assert.match(home, /homeThreadCache/);
  assert.match(home, /getCachedHomeThreads\(space\)/);
  assert.match(home, /homeThreadCache\[space\] = nextThreads/);
});

test('confirmed diary generation is owned by a runtime manager instead of the chat screen lifecycle', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const manager = read('src/ai/diary/diaryGenerationManager.ts');

  assert.match(chat, /runDiaryJobInBackground/);
  assert.match(chat, /runDiaryTaskInBackground/);
  assert.match(chat, /await runDiaryJobInBackground\(\{ jobId: job\.id, space \}\)/);
  assert.match(manager, /const tasksByJobKey = new Map<string, Promise<void>>\(\)/);
  assert.match(manager, /export function runDiaryTaskInBackground/);
  assert.match(manager, /runDiaryJob\(space, jobId\)/);
});

test('stale diary jobs recover from generating before foreground reconciliation', () => {
  const repository = read('src/ai/diary/diaryRepository.ts');
  const scheduler = read('src/ai/diary/diarySchedulerService.ts');

  assert.match(repository, /recoverStaleGeneratingJobs/);
  assert.match(repository, /WHERE status = 'generating' AND updatedAt <= \?/);
  assert.match(scheduler, /recoverStaleGeneratingJobs/);
});

test('chat timeline renders every role diary by its calendar date instead of one latest header card', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /const \[roleDiaries, setRoleDiaries\]/);
  assert.match(chat, /diaryRepository\.listCurrentDiariesForRole/);
  assert.match(chat, /type: 'diary'/);
  assert.match(chat, /item\.type === 'diary'/);
  assert.doesNotMatch(chat, /ListHeaderComponent=\{\s*roleDiary/);
});

test('diary commands only offer confirmation for enabled role-card threads and a manual run is single-flight', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /AI_ROLE_DIARY_ENABLED/);
  assert.match(chat, /thread\?\.roleCardId/);
  assert.match(chat, /diaryGenerationJobRef\.current/);
});
