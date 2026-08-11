const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

const read = (path) => readFileSync(path, 'utf8');

test('Android diary alarms have a registered native execution path', () => {
  const templateRoot = 'plugins/pixory-android-intents/templates/app/src/main';
  const plugin = read('plugins/withPixoryAndroidIntents.js');
  const manifest = read(`${templateRoot}/AndroidManifest.xml`);
  const native = read(`${templateRoot}/java/com/pixory/app/media/PixoryMediaModule.kt`);
  const receiver = read(`${templateRoot}/java/com/pixory/app/diary/DiaryAlarmReceiver.kt`);
  const service = read(`${templateRoot}/java/com/pixory/app/diary/DiaryAlarmService.kt`);

  assert.match(manifest, /SCHEDULE_EXACT_ALARM/);
  assert.match(manifest, /WAKE_LOCK/);
  assert.match(manifest, /DiaryAlarmReceiver/);
  assert.match(manifest, /DiaryAlarmService/);
  assert.match(native, /fun scheduleDiaryAlarm/);
  assert.match(native, /fun cancelDiaryAlarm/);
  assert.match(native, /canScheduleExactAlarms/);
  assert.match(native, /setAndAllowWhileIdle/);
  assert.match(manifest, /FOREGROUND_SERVICE/);
  assert.match(manifest, /foregroundServiceType="dataSync"/);
  assert.match(receiver, /startForegroundService/);
  assert.match(receiver, /ForegroundServiceStartNotAllowedException|IllegalStateException/);
  assert.match(service, /startForeground\(/);
  assert.match(plugin, /DiaryAlarmReceiver\.kt/);
  assert.match(plugin, /DiaryAlarmService\.kt/);
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

test('the application coordinator schedules diary wakeups without requiring an active chat', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const coordinator = read('src/ai/diary/diaryRuntimeCoordinator.ts');
  const scheduler = read('src/ai/diary/diarySchedulerService.ts');

  assert.match(coordinator, /nextDiaryWakeupAt/);
  assert.match(coordinator, /listActiveRoleThreads/);
  assert.doesNotMatch(chat, /nextDiaryWakeupAt/);
  assert.doesNotMatch(chat, /scheduleDiaryWakeup/);
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

test('dream reader uses finite three-sheet pagination and thoughts expose confirmed permanent deletion', () => {
  const pager = read('src/components/ai/DreamDeckPager.tsx');
  const innerLife = read('src/screens/CompanionInnerLifeScreen.tsx');

  assert.match(pager, /\[0, 1, 2\]/);
  assert.match(pager, /Math\.min\(pages\.length - 1/);
  assert.doesNotMatch(pager, /%\s*pages\.length/);
  assert.match(innerLife, /永久删除 \$\{selectedCount\} 项？/);
  assert.match(innerLife, /thoughtRepository\.permanentlyDelete/);
  assert.match(innerLife, /accessibilityLabel="永久删除所选内容"/);
});
