# Role Diary Local-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an entirely on-device role diary: one daily current version per role, independent generation, Beijing-time scheduling, reader/cards, and explicit context opt-in.

**Architecture:** Diary identity, versions, and idempotent jobs are separate from `ai_messages`; a diary call resolves the active thread's model but builds a separate request and lifecycle. All schedule decisions use `Asia/Shanghai`; Android's local alarm is permission-aware and cold-start reconciliation provides the fallback.

**Tech Stack:** Expo, React Native, TypeScript, Expo SQLite, existing Android native module, Gesture Handler, Reanimated, Pixory design tokens.

---

## File Map

| Path | Responsibility |
| --- | --- |
| `src/ai/diary/diaryTypes.ts` | Diary domain types, Beijing-time and stable theme/font policy. |
| `src/ai/diary/diaryRepository.ts` | Current-version and job persistence. |
| `src/ai/diary/diaryPromptService.ts` | Same-day active-branch context and private diary prompt. |
| `src/ai/diary/diaryGenerationService.ts` | Independent model request and version replacement. |
| `src/ai/diary/diarySchedulerService.ts` | Window policy, alarm dispatch, cold-start reconciliation. |
| `src/ai/diary/diaryPaginationService.ts` | Non-duplicating page partitions. |
| `src/components/ai/DiaryChatCard.tsx` | Matching theme card and compact opt-in line. |
| `src/components/ai/DiaryDeckPager.tsx` | Three-sheet reader animation. |
| `src/screens/DiaryReaderScreen.tsx` | Reader route. |
| `src/screens/CompanionInnerLifeScreen.tsx` | Date-descending diary timeline. |

### Task 1: Calendar Policy

**Files:**
- Create: `tests/role-diary-calendar-policy.test.cjs`
- Create: `src/ai/diary/diaryTypes.ts`

- [ ] **Step 1: Write the failing test**

```js
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

test('uses an explicit Asia/Shanghai diary policy', () => {
  const source = readFileSync('src/ai/diary/diaryTypes.ts', 'utf8');
  assert.match(source, /export function beijingDiaryDate/);
  assert.match(source, /DIARY_TIME_ZONE\s*=\s*'Asia\/Shanghai'/);
  assert.match(source, /timeZone:\s*DIARY_TIME_ZONE/);
  assert.match(source, /export function decideDiaryTrigger/);
  assert.match(source, /auto_late_evening/);
});
```

- [ ] **Step 2: Run it and verify red**

Run: `node --test tests/role-diary-calendar-policy.test.cjs`

Expected: missing-file failure.

- [ ] **Step 3: Implement minimal policy**

```ts
export function beijingDiaryDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}

export function decideDiaryTrigger(input: DiaryTriggerInput): DiaryTriggerDecision {
  // auto_early_evening | auto_late_evening | show_manual_hint | none
}
```

Implement the confirmed 22:00, 22:30 and 23:50 rules, plus the no-chat/recent-within-24-hours rule. Do not read system local timezone.

- [ ] **Step 4: Verify green**

Run: `node --test tests/role-diary-calendar-policy.test.cjs`

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add tests/role-diary-calendar-policy.test.cjs src/ai/diary/diaryTypes.ts
git commit -m "feat: add Beijing role diary calendar policy"
```

### Task 2: V49 Diary Persistence

**Files:**
- Create: `tests/role-diary-schema-policy.test.cjs`
- Modify: `src/database/schema.ts`
- Modify: `src/database/db.ts`
- Create: `src/ai/diary/diaryRepository.ts`

- [ ] **Step 1: Write the failing schema contract**

```js
test('stores current diary, version history, and idempotent jobs', () => {
  const schema = readFileSync('src/database/schema.ts', 'utf8');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS companion_diaries/);
  assert.match(schema, /UNIQUE\s*\(roleCardId, diaryDate\)/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS companion_diary_versions/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS companion_diary_jobs/);
});
```

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/role-diary-schema-policy.test.cjs`

Expected: missing migration assertion.

- [ ] **Step 3: Add V49 migration and transactional repository**

```sql
CREATE TABLE IF NOT EXISTS companion_diaries (
  id TEXT PRIMARY KEY NOT NULL, roleCardId TEXT NOT NULL, diaryDate TEXT NOT NULL,
  currentVersionId TEXT, themeKey TEXT NOT NULL, bodyFontKey TEXT NOT NULL,
  status TEXT NOT NULL, sourceThreadId TEXT, sourceBranchRouteJson TEXT NOT NULL DEFAULT '[]',
  sourceSnapshotHash TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
  UNIQUE(roleCardId, diaryDate)
);
```

Create version and job tables described in `docs/ai-chat-research/role-diary-code-preparation.md`. The physical normal/personal database already defines the space, so do not add a duplicate `space` column. `saveDiaryVersion()` must supersede the old version and update `currentVersionId` in one transaction.

- [ ] **Step 4: Verify green**

Run: `node --test tests/role-diary-schema-policy.test.cjs; pnpm typecheck`

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/database/schema.ts src/database/db.ts src/ai/diary/diaryRepository.ts tests/role-diary-schema-policy.test.cjs
git commit -m "feat: persist role diary versions and jobs"
```

### Task 3: Independent Prompt and Generation

**Files:**
- Create: `tests/role-diary-prompt-policy.test.cjs`
- Modify: `src/database/repositories/aiThreadRepository.ts`
- Modify: `src/ai/aiChatService.ts`
- Create: `src/ai/diary/diaryPromptService.ts`
- Create: `src/ai/diary/diaryGenerationService.ts`

- [ ] **Step 1: Write failing policy**

```js
test('diary generation is isolated from chat persistence', () => {
  const prompt = readFileSync('src/ai/diary/diaryPromptService.ts', 'utf8');
  const generation = readFileSync('src/ai/diary/diaryGenerationService.ts', 'utf8');
  assert.match(prompt, /\[角色日记请求\]/);
  assert.match(prompt, /\[当日消息\]/);
  assert.match(generation, /resolveThreadChatModel/);
  assert.doesNotMatch(generation, /createAssistantMessage|updateStreamingMessage/);
});
```

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/role-diary-prompt-policy.test.cjs`

Expected: missing files.

- [ ] **Step 3: Implement bounded source and independent request**

```ts
listCompletedMessagesInDateRange(db, threadId, startIso, endIso, branchScopes): Promise<AiMessageRecord[]>;

export async function generateRoleDiary(input: GenerateRoleDiaryInput): Promise<RoleDiaryVersion> {
  const resolved = await resolveThreadChatModel(input.space, input.thread);
  const prompt = await buildDiaryPromptInput(input);
  const body = await completeDiaryRequest({ resolved, prompt });
  return diaryRepository.saveDiaryVersion(input.db, { ...input, body });
}
```

Use only completed messages from the active branch. Retain up to `historyRoundLimit * 3`, consume current diary token budget, and trim oldest first. Prompt must use a first-person private voice, normally ≤300 Chinese characters, prohibit model/system terminology and forbid invented dialogue. Never write this request into `ai_messages` or regular streaming state.

- [ ] **Step 4: Verify green**

Run: `node --test tests/role-diary-prompt-policy.test.cjs; pnpm typecheck`

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/database/repositories/aiThreadRepository.ts src/ai/aiChatService.ts src/ai/diary/diaryPromptService.ts src/ai/diary/diaryGenerationService.ts tests/role-diary-prompt-policy.test.cjs
git commit -m "feat: generate role diaries outside chat history"
```

### Task 4: Android Local Alarm and Reconciliation

**Files:**
- Create: `tests/role-diary-scheduler-policy.test.cjs`
- Create: `src/ai/diary/diarySchedulerService.ts`
- Modify: `src/native/pixoryMediaModule.ts`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt`
- Create: `android/app/src/main/java/com/pixory/app/diary/DiaryAlarmReceiver.kt`

- [ ] **Step 1: Write failing scheduling policy**

```js
test('schedules locally with a permission-aware Android bridge', () => {
  assert.match(readFileSync('src/ai/diary/diarySchedulerService.ts', 'utf8'), /scheduleDiaryAlarm/);
  assert.match(readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8'), /SCHEDULE_EXACT_ALARM/);
});
```

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/role-diary-scheduler-policy.test.cjs`

Expected: missing bridge/permission.

- [ ] **Step 3: Implement least-privilege local scheduling**

```ts
export async function scheduleDiaryAlarm(input: { triggerAtMs: number; jobId: string }): Promise<'exact' | 'inexact'> {
  return requireNativeModule().scheduleDiaryAlarm(input.triggerAtMs, input.jobId);
}
```

Native code checks `AlarmManager.canScheduleExactAlarms()` and opens system settings only after the user enables diaries. If declined, use `setAndAllowWhileIdle`; receiver marks an existing job due and does not contain keys or write a fake completed diary. On app foreground/start, `reconcileDiaryJobs()` performs persisted job selection and generation retry.

- [ ] **Step 4: Verify bridge**

Run: `node --test tests/role-diary-scheduler-policy.test.cjs; cd android; .\gradlew.bat :app:compileDebugKotlin`

Expected: policy pass and Kotlin compile.

- [ ] **Step 5: Commit**

```bash
git add src/ai/diary/diarySchedulerService.ts src/native/pixoryMediaModule.ts android/app/src/main/AndroidManifest.xml android/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt android/app/src/main/java/com/pixory/app/diary/DiaryAlarmReceiver.kt tests/role-diary-scheduler-policy.test.cjs
git commit -m "feat: schedule local role diary jobs on Android"
```

### Task 5: Diary Card, Reader, and Timeline

**Files:**
- Create: `tests/role-diary-ui-policy.test.cjs`
- Create: `src/ai/diary/diaryPaginationService.ts`
- Create: `src/components/ai/DiaryChatCard.tsx`
- Create: `src/components/ai/DiaryDeckPager.tsx`
- Create: `src/screens/DiaryReaderScreen.tsx`
- Create: `src/screens/CompanionInnerLifeScreen.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `src/screens/AiSessionConfigScreen.tsx`
- Modify: `App.tsx`

- [ ] **Step 1: Write failing UI policy**

```js
test('reader uses matching background assets and only mounts a three-sheet deck', () => {
  const pager = readFileSync('src/components/ai/DiaryDeckPager.tsx', 'utf8');
  assert.match(pager, /current.*next.*third/s);
  assert.match(pager, /react-native-reanimated/);
  assert.match(readFileSync('src/components/ai/DiaryChatCard.tsx', 'utf8'), /diaryThemeAssets/);
});
```

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/role-diary-ui-policy.test.cjs`

Expected: missing components.

- [ ] **Step 3: Implement visual contract**

Map each of the five card assets to its paired 9:13 letter asset. Paginate paragraphs without pull-back or repeated text; split an oversize paragraph only on measured line boundaries. The deck keeps current/next/third mounted; a successful swipe sends current to slot three. Display only centered `N / M` below sheets, no dots or white bar. Current-day first page footer is `写给今天`; historical and continuation footers are `YYYY.MM.DD`; continuation header is `CONTINUED`.

- [ ] **Step 4: Add timeline and chat integration**

Chat presents ready cards only after an active assistant stream ends. Session config adds “内心独白” and the screen uses existing `AiLightChip` for `日记 / 独白 / 梦境`; entries are descending and use `TODAY · HH:mm` only on Beijing today.

- [ ] **Step 5: Verify and commit**

Run: `node --test tests/role-diary-ui-policy.test.cjs; pnpm typecheck`

Expected: pass; manually rapid-swipe a five-page fixture with no empty sheet.

```bash
git add src/ai/diary/diaryPaginationService.ts src/components/ai/DiaryChatCard.tsx src/components/ai/DiaryDeckPager.tsx src/screens/DiaryReaderScreen.tsx src/screens/CompanionInnerLifeScreen.tsx src/screens/AiChatScreen.tsx src/screens/AiSessionConfigScreen.tsx App.tsx tests/role-diary-ui-policy.test.cjs assets/backgrounds/diary assets/backgrounds/diary-letter
git commit -m "feat: add role diary reader and inner life timeline"
```

### Task 6: Context Opt-In, Feature Matrix, and Final Verification

**Files:**
- Create: `tests/role-diary-context-policy.test.cjs`
- Create: `src/ai/diary/diaryContextOptInService.ts`
- Modify: `src/database/repositories/settingsRepository.ts`
- Modify: `src/ai/memory/contextCompiler.ts`
- Modify: `docs/feature-matrix.md`
- Modify: `docs/ai-chat-research/role-diary-code-preparation.md`

- [ ] **Step 1: Write failing opt-in policy**

```js
test('diary context is explicit and not automatic memory', () => {
  const source = readFileSync('src/ai/diary/diaryContextOptInService.ts', 'utf8');
  assert.match(source, /role_diary/);
  assert.match(source, /accepted/);
  assert.doesNotMatch(source, /automatic.*memory/i);
});
```

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/role-diary-context-policy.test.cjs`

Expected: missing service.

- [ ] **Step 3: Implement explicit opt-in**

Add default-on `role_diary_enabled`. The card's subtle “是/否” writes the choice; only accepted versions enter prompt compilation as explicitly labelled `role_diary`. Existing memory maintenance decides separately whether any content is durable.

- [ ] **Step 4: Run final verification**

Run: `pnpm typecheck; pnpm test; git diff --check`

Expected: typecheck and diff check pass; record any pre-existing unrelated tests separately.

- [ ] **Step 5: Complete matrix and commit**

Document the local-only alarm boundary, no cloud retention, Android permission fallback, and opt-in context rule in the feature matrix and preparation document.

```bash
git add src/ai/diary/diaryContextOptInService.ts src/database/repositories/settingsRepository.ts src/ai/memory/contextCompiler.ts docs/feature-matrix.md docs/ai-chat-research/role-diary-code-preparation.md tests/role-diary-context-policy.test.cjs
git commit -m "feat: add role diary context controls"
```

## Self-Review

- One current diary is role/day scoped, but source content remains current-thread/current-branch scoped.
- No gateway, cloud retention, second key store, or ordinary chat message is introduced.
- The exact-alarm prompt is deferred until diary enablement and has an inexact fallback.
- The reader uses paired assets, preserves full text without duplication, and avoids page-load stutter.
