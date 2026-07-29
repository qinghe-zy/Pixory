const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

const read = (path) => readFileSync(path, 'utf8');

test('Android diary alarms have a registered native execution path', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const native = read('android/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt');

  assert.match(manifest, /SCHEDULE_EXACT_ALARM/);
  assert.match(manifest, /WAKE_LOCK/);
  assert.match(manifest, /DiaryAlarmReceiver/);
  assert.match(manifest, /DiaryAlarmService/);
  assert.match(native, /fun scheduleDiaryAlarm/);
  assert.match(native, /fun cancelDiaryAlarm/);
  assert.match(native, /canScheduleExactAlarms/);
  assert.match(native, /setAndAllowWhileIdle/);
});

test('chat initial hydration does not duplicate model, appearance, or title reads', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.equal((chat.match(/void reloadModelLabel\(threadId \?\? null\);/g) ?? []).length, 1);
  assert.equal((chat.match(/void reloadParticipantAppearance\(threadId \?\? null\);/g) ?? []).length, 1);
  assert.equal((chat.match(/void reloadThreadTitle\(threadId \?\? null\);/g) ?? []).length, 1);
});

test('chat diary cards and message separators share Beijing diary dates', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /const dateKey = beijingDiaryDate\(message\.createdAt\);/);
  assert.doesNotMatch(chat, /function getLocalDateKey\(/);
});

test('due diary reconciliation is process-single-flight per space', () => {
  const scheduler = read('src/ai/diary/diarySchedulerService.ts');

  assert.match(scheduler, /const dueRunsBySpace = new Map<PixorySpace, Promise<void>>\(\)/);
  assert.match(scheduler, /const existing = dueRunsBySpace\.get\(space\)/);
  assert.match(scheduler, /dueRunsBySpace\.delete\(space\)/);
});

test('the active chat schedules diary checks at the next relevant wake-up, not every minute', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const scheduler = read('src/ai/diary/diarySchedulerService.ts');

  assert.match(chat, /Date\.parse\(nextDiaryWakeupAt\(\)\) - Date\.now\(\)/);
  assert.doesNotMatch(chat, /setInterval\(\(\) => void evaluateDiaryTriggerRef\.current\(\)/);
  assert.match(scheduler, /A session that began before 23:50 may finish after midnight/);
});

test('explicit diary context choices survive newer unselected diary cards', () => {
  const repository = read('src/ai/diary/diaryRepository.ts');
  const artifactService = read('src/ai/companion/companionArtifactService.ts');

  assert.match(repository, /listContextOptInDiaryVersionsForRole/);
  assert.match(repository, /contextOptIn = 1/);
  assert.match(artifactService, /listContextOptInDiaryVersionsForRole/);
  assert.match(artifactService, /adaptDiaryArtifact/);
  assert.doesNotMatch(artifactService, /findCurrentDiaryForRole/);
});
