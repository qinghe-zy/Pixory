const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

test('uses a persisted local diary job and an Android alarm bridge', () => {
  const source = readFileSync('src/ai/diary/diarySchedulerService.ts', 'utf8');
  const native = readFileSync('src/native/pixoryMediaModule.ts', 'utf8');

  assert.match(source, /createOrReuseJob/);
  assert.match(source, /scheduleDiaryAlarm/);
  assert.match(source, /prepareAndScheduleDiaryJob/);
  assert.match(source, /scheduleDiaryWakeup/);
  assert.match(source, /nextDiaryWakeupAt/);
  assert.match(source, /sourceMessagesJson/);
  assert.match(source, /roleSnapshotJson/);
  assert.match(source, /reconcileDiaryJobs/);
  assert.match(source, /DIARY_TIME_ZONE/);
  assert.match(native, /scheduleDiaryAlarm/);
});

test('claims each diary job once and reconciles durable work on foreground', () => {
  const scheduler = readFileSync('src/ai/diary/diarySchedulerService.ts', 'utf8');
  const repository = readFileSync('src/ai/diary/diaryRepository.ts', 'utf8');
  const chat = readFileSync('src/screens/AiChatScreen.tsx', 'utf8');

  assert.match(repository, /claimJobForRun/);
  assert.match(repository, /WHERE id = \? AND status IN \('pending', 'due', 'failed'\)/);
  assert.match(scheduler, /runDueDiaryJobs/);
  assert.match(scheduler, /Date\.parse\(job\.scheduledFor\) > Date\.now\(\)/);
  assert.match(scheduler, /snapshotHash\(input\.sourceBranchRouteJson\)/);
  assert.match(scheduler, /input\.triggerKind === 'manual'/);
  assert.match(scheduler, /'automatic'/);
  assert.match(scheduler, /cancelPendingWakeupsForRole/);
  assert.match(scheduler, /nextBeijingTimeAt\(now, 22, 30\)/);
  assert.match(chat, /runDueDiaryJobs/);
  assert.match(chat, /reconcileDueDiaryJobsRef/);
  assert.match(chat, /persistedCurrentBranchScopes/);
});

test('only resets the diary session clock when the active thread changes', () => {
  const chat = readFileSync('src/screens/AiChatScreen.tsx', 'utf8');

  assert.match(chat, /const evaluateDiaryTriggerRef = useRef\(evaluateDiaryTrigger\)/);
  assert.match(chat, /evaluateDiaryTriggerRef\.current = evaluateDiaryTrigger/);
  assert.match(chat, /setRoleDiaries\(\[\]\);/);
  assert.match(chat, /setDiaryManualHint\(false\);/);
  assert.match(chat, /setDiaryCommandHint\(false\);/);
  assert.match(chat, /diarySessionStartedAtRef\.current = new Date\(\)\.toISOString\(\)/);
  assert.match(chat, /\}, \[activeThreadId\]\);/);
  assert.doesNotMatch(chat, /\}, \[activeThreadId, evaluateDiaryTrigger\]\);/);
});

test('can cancel pending diary jobs when the feature is disabled', () => {
  const repository = readFileSync('src/ai/diary/diaryRepository.ts', 'utf8');
  const settings = readFileSync('src/screens/AiSessionConfigScreen.tsx', 'utf8');

  assert.match(repository, /cancelPendingJobs/);
  assert.match(settings, /cancelPendingDiaryJobs/);
});
