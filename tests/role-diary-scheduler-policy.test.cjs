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
  assert.match(source, /buildDiaryConversationSnapshot/);
  assert.match(source, /listSnapshotCandidateMessages\(db, thread\.id, 30, input\.branchScopes\)/);
  assert.match(source, /roundLimit:\s*30/);
  assert.match(source, /maxSourceCharacters:\s*24_000/);
  assert.match(source, /conversationSnapshot\.sourceSnapshotHash/);
  assert.match(source, /roleSnapshotJson/);
  assert.match(source, /sourceSystemPromptSnapshot:\s*thread\.systemPrompt/);
  assert.match(source, /hashDiaryJobContextSnapshot/);
  assert.match(source, /jobContextSnapshotHash/);
  assert.match(source, /reconcileDiaryJobs/);
  assert.match(source, /DIARY_TIME_ZONE/);
  assert.match(native, /scheduleDiaryAlarm/);
});

test('manual and automatic triggers freeze their source through the same preparation path', () => {
  const scheduler = readFileSync('src/ai/diary/diarySchedulerService.ts', 'utf8');
  const chat = readFileSync('src/screens/AiChatScreen.tsx', 'utf8');

  assert.match(chat, /prepareAndScheduleDiaryJob\(\{[\s\S]*?triggerKind:\s*'manual'/);
  assert.match(scheduler, /prepareAndScheduleDiaryJob\(\{[\s\S]*?triggerKind:\s*decision\.kind/);
  assert.doesNotMatch(chat, /generateRoleDiary\(/);
});

test('a due wake resolves the currently adopted branch before freezing automatic source', () => {
  const scheduler = readFileSync('src/ai/diary/diarySchedulerService.ts', 'utf8');
  const wakePath = scheduler.slice(
    scheduler.indexOf("if (job.triggerKind === 'wake')"),
    scheduler.indexOf("const version = await generateRoleDiary"),
  );

  assert.match(wakePath, /resolveBranchLineage\([\s\S]*?thread\.currentBranchRootMessageId,[\s\S]*?thread\.currentBranchVersionIndex/);
  assert.doesNotMatch(wakePath, /const branchScopes = parseBranchScopes\(job\.sourceBranchRouteJson\)/);
});

test('generation reapplies the actual model budget only to the frozen source snapshot', () => {
  const generation = readFileSync('src/ai/diary/diaryGenerationService.ts', 'utf8');

  assert.match(generation, /buildDiaryConversationSnapshot\(\{/);
  assert.match(generation, /messages:\s*input\.sourceMessages\s*\?\?\s*\[\]/);
  assert.match(generation, /maxSourceCharacters:\s*sourceCharacterBudget\(resolved\.modelContextWindowTokens\)/);
  assert.match(generation, /roundLimit:\s*30/);
  assert.match(generation, /sourceMessageIdsJson:\s*JSON\.stringify\(conversationSnapshot\.sourceMessageIds\)/);
  assert.match(generation, /effectiveSourceSnapshotHash:\s*conversationSnapshot\.sourceSnapshotHash/);
  assert.match(generation, /jobContextSnapshotHash:\s*input\.jobContextSnapshotHash/);
  assert.doesNotMatch(generation, /listCompletedMessagesInDateRange/);
  assert.doesNotMatch(generation, /listSnapshotCandidateMessages/);
});

test('claims each diary job once and reconciles durable work on foreground', () => {
  const scheduler = readFileSync('src/ai/diary/diarySchedulerService.ts', 'utf8');
  const repository = readFileSync('src/ai/diary/diaryRepository.ts', 'utf8');
  const app = readFileSync('App.tsx', 'utf8');
  const coordinator = readFileSync('src/ai/diary/diaryRuntimeCoordinator.ts', 'utf8');

  assert.match(repository, /claimJobForRun/);
  assert.match(repository, /WHERE id = \? AND status IN \('pending', 'due', 'failed'\)/);
  assert.match(scheduler, /runDueDiaryJobs/);
  assert.match(scheduler, /Date\.parse\(job\.scheduledFor\) > Date\.now\(\)/);
  assert.match(scheduler, /snapshotHash\(input\.sourceBranchRouteJson\)/);
  assert.match(scheduler, /input\.triggerKind === 'manual'/);
  assert.match(scheduler, /'automatic'/);
  assert.match(scheduler, /cancelPendingWakeupsForRole/);
  assert.match(scheduler, /nextBeijingTimeAt\(now, 22, 30\)/);
  assert.match(coordinator, /runDueDiaryJobs/);
  assert.match(coordinator, /scheduleDiaryWakeup/);
  assert.match(app, /coordinateDiaryRuntime\(\{ space: 'normal'/);
  assert.match(app, /coordinateDiaryRuntime\(\{ allowPersonal: true, space: 'personal'/);
});

test('chat keeps manual diary generation but no longer owns automatic timers or foreground reconciliation', () => {
  const chat = readFileSync('src/screens/AiChatScreen.tsx', 'utf8');

  assert.match(chat, /triggerKind:\s*'manual'/);
  assert.match(chat, /setRoleDiaries\(\[\]\);/);
  assert.match(chat, /setDiaryManualHint\(false\);/);
  assert.match(chat, /setDiaryCommandHint\(false\);/);
  assert.match(chat, /diarySessionStartedAtRef\.current = new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(chat, /nextDiaryWakeupAt/);
  assert.doesNotMatch(chat, /scheduleDiaryWakeup/);
  assert.doesNotMatch(chat, /runDueDiaryJobs/);
  assert.doesNotMatch(chat, /evaluateDiaryTriggerRef/);
});

test('can cancel pending diary jobs when the feature is disabled', () => {
  const repository = readFileSync('src/ai/diary/diaryRepository.ts', 'utf8');
  const settings = readFileSync('src/screens/AiSessionConfigScreen.tsx', 'utf8');

  assert.match(repository, /cancelPendingJobs/);
  assert.match(settings, /cancelPendingDiaryJobs/);
});
