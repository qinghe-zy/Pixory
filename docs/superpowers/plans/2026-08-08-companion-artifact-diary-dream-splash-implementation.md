# Companion Artifact, Diary, Dream, and Splash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix diary and dream source selection, automatic scheduling, retry behavior, and chat-card placement, then ship the approved Android 12-safe splash foreground without losing the original media decorations.

**Architecture:** Add one pure conversation-snapshot module that defines complete rounds, Beijing timestamps, frozen source hashes, and anchors for both diary and dream. Add one pure artifact-timeline module that inserts artifacts after their source message, while an app-level diary coordinator owns lifecycle reconciliation and existing durable jobs remain the source of truth. Keep the existing dream schema and quota model, but make prompts, parsing, runtime events, and retry/recovery explicit; generate Android density assets from one transparent master image.

**Tech Stack:** Expo 54, React Native 0.81, TypeScript 5.9, Expo SQLite, Node test runner, Android resource densities, Jimp.

---

## File map

**Create**

- `src/ai/companion/companionConversationSnapshotService.ts`: complete-round pairing, diary/dream source selection, Beijing labels, source hashes, and anchor IDs.
- `src/ai/companion/companionArtifactTimelineService.ts`: pure message/artifact anchoring with controlled legacy fallback.
- `src/ai/diary/diaryRuntimeCoordinator.ts`: app initialization/foreground/unlock reconciliation and per-role wake scheduling.
- `src/ai/dream/dreamPromptService.ts`: classifier and generator prompt sections with trigger/background separation.
- `scripts/generate-android-splash-assets.cjs`: deterministic density generation from one transparent source.
- `tests/companion-conversation-snapshot-unit.test.cjs`: 30/20-round, timestamp, budget, and anchor tests.
- `tests/companion-artifact-timeline-unit.test.cjs`: anchor, pagination, legacy, and stable-order tests.
- `tests/role-diary-runtime-coordinator-unit.test.cjs`: per-role thread selection and lifecycle policy tests.
- `tests/companion-dream-recovery-unit.test.cjs`: JSON extraction, failure presentation, and retry-mode tests.
- `icons/splash_foreground.png`: approved transparent master artwork.

**Modify**

- `src/database/repositories/aiThreadRepository.ts`: query the latest active thread per role and load enough recent completed messages for snapshot construction.
- `src/ai/diary/diaryRepository.ts`: expose current diary version source IDs to the chat timeline.
- `src/ai/diary/diarySchedulerService.ts`: freeze a 30-round diary snapshot at real job creation and delegate app-level reconciliation.
- `src/ai/diary/diaryPromptService.ts`: separate today from historical relationship background and format Beijing timestamps.
- `src/ai/diary/diaryGenerationService.ts`: apply model budget without changing the latest source anchor.
- `src/ai/dream/dreamPolicy.ts`: extract a JSON object from fences/prose while retaining strict field validation; map failure codes to UI behavior.
- `src/ai/dream/dreamService.ts`: freeze 20 complete rounds plus current trigger evidence and create current-source recovery jobs.
- `src/ai/dream/dreamWorker.ts`: use structured prompts, release failed quota, make retry/recovery outcomes explicit, and emit every state.
- `src/ai/dream/dreamRuntimeEvents.ts`: persist and expose meaningful failed/waiting states.
- `src/components/ai/DreamChatCard.tsx`: show readable error text and distinct retry/regenerate action labels.
- `src/screens/AiChatScreen.tsx`: replace timestamp mixing with the pure timeline, reload every dream state, and remove page-owned automatic diary scheduling.
- `src/ai/aiChatService.ts`: load enough branch-aware messages for 20 complete dream rounds.
- `App.tsx`: run normal diary coordination at startup/foreground and Personal coordination only after unlock.
- `app.json`: reference the transparent master foreground.
- `android/app/src/main/res/drawable-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/splashscreen_logo.png`: generated density-correct transparent resources.
- `tests/role-diary-prompt-policy.test.cjs`: assert today/background boundaries and 30-round policy.
- `tests/role-diary-scheduler-policy.test.cjs`: assert app-level coordination rather than chat-page ownership.
- `tests/companion-dream-policy-unit.test.cjs`: cover fenced/prose JSON without weakening schema checks.
- `tests/companion-dream-repository-integration.test.cjs`: prove failures release quota and retry re-reserves it correctly.
- `tests/android-icon-splash-policy.test.cjs`: verify transparent corners, content margins, and per-density dimensions.
- `docs/feature-matrix.md`: document the shipped behavior.

## Task 1: Shared complete-round snapshot semantics

**Files:**

- Create: `src/ai/companion/companionConversationSnapshotService.ts`
- Modify: `src/database/repositories/aiThreadRepository.ts`
- Test: `tests/companion-conversation-snapshot-unit.test.cjs`

- [ ] **Step 1: Write the failing snapshot tests**

Create a TypeScript-transpiling Node test with a local `message(id, role, createdAt, content)` factory. Assert these exact behaviors:

```js
test('diary keeps today first and backfills to 30 complete rounds', () => {
  const result = snapshots.buildDiaryConversationSnapshot({
    diaryDate: '2026-08-08',
    maxSourceCharacters: 100000,
    messages: buildRounds(35),
    roundLimit: 30,
  });
  assert.equal(result.roundCount, 30);
  assert.equal(result.focusRoundCount, 2);
  assert.equal(result.backgroundRoundCount, 28);
  assert.equal(result.anchorMessageId, 'a35');
});

test('dream preserves an unpaired manual trigger plus 20 complete background rounds', () => {
  const result = snapshots.buildDreamConversationSnapshot({
    maxSourceCharacters: 100000,
    messages: [...buildRounds(24), message('u25', 'user', '2026-08-08T08:00:00.000Z', '生成梦境')],
    roundLimit: 20,
    triggerMessageIds: ['u25'],
  });
  assert.deepEqual(result.focusMessages.map((item) => item.id), ['u25']);
  assert.equal(result.backgroundRoundCount, 20);
  assert.equal(result.anchorMessageId, 'u25');
});
```

Also assert that incomplete rounds are excluded from background, branch-filtered input is not reordered, timestamps render as `2026-08-08 16:00`, and character trimming drops the oldest background round before any focus message.

- [ ] **Step 2: Run the snapshot test and verify it fails**

Run: `node --test tests/companion-conversation-snapshot-unit.test.cjs`

Expected: FAIL because `companionConversationSnapshotService.ts` does not exist.

- [ ] **Step 3: Implement the pure snapshot API**

Define these public contracts:

```ts
export interface CompanionConversationRound {
  messages: AiMessageRecord[];
  userMessage: AiMessageRecord;
  assistantMessages: AiMessageRecord[];
  completedAt: string;
}

export interface CompanionConversationSnapshot {
  focusMessages: AiMessageRecord[];
  backgroundMessages: AiMessageRecord[];
  sourceMessages: AiMessageRecord[];
  sourceMessageIds: string[];
  sourceMessageVersionHashes: string[];
  sourceSnapshotHash: string;
  anchorMessageId: string | null;
  roundCount: number;
  focusRoundCount: number;
  backgroundRoundCount: number;
  sourceTrimmed: boolean;
}

export function pairCompletedConversationRounds(messages: AiMessageRecord[]): CompanionConversationRound[];
export function buildDiaryConversationSnapshot(input: {
  messages: AiMessageRecord[];
  diaryDate: string;
  roundLimit?: number;
  maxSourceCharacters: number;
}): CompanionConversationSnapshot;
export function buildDreamConversationSnapshot(input: {
  messages: AiMessageRecord[];
  triggerMessageIds: string[];
  roundLimit?: number;
  maxSourceCharacters: number;
}): CompanionConversationSnapshot;
export function formatCompanionBeijingTimestamp(value: string): string;
```

Implementation rules:

1. Filter to `completed` user/assistant messages.
2. Start a round at a user message and close it only after at least one assistant message.
3. Diary assigns a round to a day using its final assistant completion/creation time, selects all focus-day rounds up to the limit, then backfills the newest earlier rounds.
4. Dream keeps trigger messages as focus evidence even if the manual user message is not paired. A complete round containing automatic trigger IDs counts toward the 20-round total; an unpaired manual trigger does not, so background selection uses `roundLimit - focusRoundCount` complete rounds.
5. Trim whole oldest background rounds first; only if focus alone exceeds the budget may the oldest focus round be removed. Never split a complete round.
6. Sort final source messages by `createdAt` and ID; the last source ID is the anchor.
7. Hash each source with `hashCompanionMessageVersion`, then hash the ordered `id:versionHash` sequence with `hashCompanionText`.

- [ ] **Step 4: Add a bounded repository loader**

Add:

```ts
async listSnapshotCandidateMessages(
  db: SQLiteDatabase,
  threadId: string,
  roundLimit: number,
  branchScopes?: AiBranchScope[],
): Promise<AiMessageRecord[]>
```

Load `Math.max(96, roundLimit * 4)` recent completed non-system messages using the existing visible-branch clause and materialization path. This bounds recurring dream work while providing enough candidates for 20/30 complete rounds; the snapshot service remains responsible for rejecting incomplete rounds.

- [ ] **Step 5: Run the snapshot tests and typecheck**

Run: `node --test tests/companion-conversation-snapshot-unit.test.cjs`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the shared snapshot layer**

```bash
git add src/ai/companion/companionConversationSnapshotService.ts src/database/repositories/aiThreadRepository.ts tests/companion-conversation-snapshot-unit.test.cjs
git commit -m "feat: add companion conversation snapshots"
```

## Task 2: Stable artifact anchors in the chat timeline

**Files:**

- Create: `src/ai/companion/companionArtifactTimelineService.ts`
- Modify: `src/ai/diary/diaryRepository.ts`
- Modify: `src/screens/AiChatScreen.tsx:580-620, 1890-1935, 2280-2380`
- Test: `tests/companion-artifact-timeline-unit.test.cjs`

- [ ] **Step 1: Write failing pure timeline tests**

Cover:

```js
test('places artifacts immediately after their exact source anchor', () => {
  const items = timeline.buildCompanionArtifactTimeline({
    messages: [message('m1'), message('m2'), message('m3')],
    artifacts: [artifact('diary-1', 'diary', 'm2', '2026-08-08T20:00:00Z')],
  });
  assert.deepEqual(items.map((item) => item.id), ['m1', 'm2', 'diary-1', 'm3']);
});

test('hides a sourced artifact until pagination loads its anchor', () => {
  const items = timeline.buildCompanionArtifactTimeline({
    messages: [message('m3')],
    artifacts: [artifact('dream-1', 'dream', 'm2', '2026-08-08T20:00:00Z')],
  });
  assert.deepEqual(items.map((item) => item.id), ['m3']);
});
```

Also assert stable `createdAt` then ID order for multiple artifacts on one message; source IDs never fall back to timestamps; empty-source legacy rows fall back to the nearest visible message not later than artifact creation; and legacy rows with no earlier visible message are hidden.

- [ ] **Step 2: Run the timeline test and verify it fails**

Run: `node --test tests/companion-artifact-timeline-unit.test.cjs`

Expected: FAIL because the timeline service does not exist.

- [ ] **Step 3: Implement the pure timeline service**

Use these contracts:

```ts
export type CompanionArtifactKind = 'diary' | 'dream' | 'dreamJob';

export interface CompanionArtifactTimelineEntry<T = unknown> {
  id: string;
  kind: CompanionArtifactKind;
  sourceMessageIds: string[];
  createdAt: string;
  payload: T;
}

export type CompanionArtifactTimelineItem<TMessage, TArtifact> =
  | { id: string; type: 'message'; message: TMessage }
  | { id: string; type: 'artifact'; artifact: TArtifact };

export function buildCompanionArtifactTimeline<TMessage extends { id: string; createdAt: string }, TPayload>(input: {
  messages: TMessage[];
  artifacts: Array<CompanionArtifactTimelineEntry<TPayload>>;
}): Array<CompanionArtifactTimelineItem<TMessage, CompanionArtifactTimelineEntry<TPayload>>>;
```

Resolve `sourceMessageIds.at(-1)` as the only modern anchor. Use timestamp fallback only when the array is empty. Group by anchor, sort each group by `createdAt` and ID, then emit every artifact directly after its message.

- [ ] **Step 4: Expose diary version source IDs**

Extend `RoleDiaryRecord` with `sourceMessageIds: string[]`. Change `listCurrentDiariesForRole` to join `companion_diary_versions` through `currentVersionId` and select `version.sourceMessageIdsJson AS currentSourceMessageIdsJson`; parse the JSON defensively in `mapDiaryRow`. Other diary lookup methods return an empty array only for legacy/unjoined callers.

- [ ] **Step 5: Replace timestamp mixing in `AiChatScreen`**

Build artifact entries as follows:

```ts
const artifactEntries = [
  ...roleDiaries.map((diary) => ({
    createdAt: diary.createdAt,
    id: `diary-${diary.id}`,
    kind: 'diary' as const,
    payload: diary,
    sourceMessageIds: diary.sourceMessageIds,
  })),
  ...roleDreams.map((dream) => ({
    createdAt: dream.createdAt,
    id: `dream-${dream.id}`,
    kind: 'dream' as const,
    payload: dream,
    sourceMessageIds: dream.sourceMessageIds,
  })),
  ...roleDreamJobs.map((job) => ({
    createdAt: job.createdAt,
    id: `dreamJob-${job.id}`,
    kind: 'dreamJob' as const,
    payload: job,
    sourceMessageIds: job.sourceMessageIds,
  })),
];
```

Feed selected visible messages and entries to the pure service. Insert a date separator only before a message whose Beijing date differs from the previous message date; artifacts inherit their anchor's position and never create a separate date bucket. Preserve avatar grouping by tracking the previous message, not the previous list item.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `node --test tests/companion-artifact-timeline-unit.test.cjs tests/chat-and-diary-runtime-completeness-policy.test.cjs`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 7: Commit stable timeline delivery**

```bash
git add src/ai/companion/companionArtifactTimelineService.ts src/ai/diary/diaryRepository.ts src/screens/AiChatScreen.tsx tests/companion-artifact-timeline-unit.test.cjs tests/chat-and-diary-runtime-completeness-policy.test.cjs
git commit -m "fix: anchor companion cards to source messages"
```

## Task 3: Thirty-round diary source and prompt boundaries

**Files:**

- Modify: `src/ai/diary/diarySchedulerService.ts:114-147, 266-370`
- Modify: `src/ai/diary/diaryPromptService.ts`
- Modify: `src/ai/diary/diaryGenerationService.ts:36-90`
- Modify: `tests/role-diary-prompt-policy.test.cjs`
- Modify: `tests/role-diary-scheduler-policy.test.cjs`

- [ ] **Step 1: Expand diary tests before implementation**

Require these assertions:

```js
assert.match(prompt, /\[今日互动\]/);
assert.match(prompt, /\[过往关系背景\]/);
assert.match(prompt, /过往关系背景不得写成今天发生的事/);
assert.match(prompt, /formatCompanionBeijingTimestamp/);
assert.match(scheduler, /buildDiaryConversationSnapshot/);
assert.match(scheduler, /roundLimit:\s*30/);
assert.match(scheduler, /listSnapshotCandidateMessages/);
```

Add a unit assertion that no-day input emits “今天没有与用户完成的互动” while still including historical background.

- [ ] **Step 2: Run diary tests and verify the new assertions fail**

Run: `node --test tests/role-diary-prompt-policy.test.cjs tests/role-diary-scheduler-policy.test.cjs`

Expected: FAIL on the new section and snapshot assertions.

- [ ] **Step 3: Freeze 30 complete rounds when the real diary job is created**

In `prepareAndScheduleDiaryJob`, load snapshot candidates and call:

```ts
const conversationSnapshot = buildDiaryConversationSnapshot({
  diaryDate: input.diaryDate,
  maxSourceCharacters: 24_000,
  messages: await aiThreadRepository.listSnapshotCandidateMessages(
    db,
    thread.id,
    30,
    input.branchScopes,
  ),
  roundLimit: 30,
});
```

Store `conversationSnapshot.sourceMessages` in `sourceMessagesJson` and use its `sourceSnapshotHash`. Keep branch route, summary, and role snapshot in the final job hash so changes to stable context cannot collide.

- [ ] **Step 4: Rebuild the diary prompt around two explicit sections**

`buildDiaryPrompt` must partition already-frozen messages using the diary date and complete-round timestamp. Format every line with `formatCompanionBeijingTimestamp`. Emit:

```text
[今日互动]
[2026-08-08 22:10] 用户：……
[2026-08-08 22:11] 角色：……

[过往关系背景]
以下仅用于保持人物、关系和语境。不得写成今天发生的事，也不得声称用户今天说过这些内容。
[2026-08-07 20:30] 用户：……
```

When focus is empty, use: `今天没有与用户完成的互动。不得编造今天用户说过、做过或经历过什么。`

- [ ] **Step 5: Apply the actual model budget without moving the anchor**

In `diaryGenerationService`, calculate `sourceCharacterBudget` after model resolution and call `buildDiaryConversationSnapshot` again with the already-frozen `input.sourceMessages`, the same diary date, `roundLimit: 30`, and the actual character budget. Persist that result's source IDs in the diary version. Because the second pass can only remove older frozen rounds, the latest source ID and card anchor remain unchanged.

- [ ] **Step 6: Run diary tests and typecheck**

Run: `node --test tests/role-diary-prompt-policy.test.cjs tests/role-diary-scheduler-policy.test.cjs tests/companion-conversation-snapshot-unit.test.cjs`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 7: Commit diary source correctness**

```bash
git add src/ai/diary/diarySchedulerService.ts src/ai/diary/diaryPromptService.ts src/ai/diary/diaryGenerationService.ts tests/role-diary-prompt-policy.test.cjs tests/role-diary-scheduler-policy.test.cjs
git commit -m "fix: build diary context from thirty complete rounds"
```

## Task 4: Application-level diary runtime coordination

**Files:**

- Create: `src/ai/diary/diaryRuntimeCoordinator.ts`
- Modify: `src/database/repositories/aiThreadRepository.ts`
- Modify: `App.tsx:590-620, 727-748, 840-870, 918-940`
- Modify: `src/screens/AiChatScreen.tsx:1940-2190, 4895-4910`
- Create: `tests/role-diary-runtime-coordinator-unit.test.cjs`
- Modify: `tests/role-diary-scheduler-policy.test.cjs`

- [ ] **Step 1: Write failing coordinator tests**

Test the exported pure selector:

```js
test('selects one latest active thread per role', () => {
  assert.deepEqual(
    coordinator.selectLatestDiaryThreadPerRole([
      thread('old-a', 'role-a', '2026-08-07T10:00:00Z'),
      thread('new-a', 'role-a', '2026-08-08T10:00:00Z'),
      thread('only-b', 'role-b', '2026-08-06T10:00:00Z'),
    ]).map((item) => item.id),
    ['new-a', 'only-b'],
  );
});
```

Policy assertions must find `coordinateDiaryRuntime({ space: 'normal' })` in initialization and foreground paths, `space: 'personal'` only after successful unlock, and no automatic scheduling timer in `AiChatScreen`.

- [ ] **Step 2: Run coordinator tests and verify they fail**

Run: `node --test tests/role-diary-runtime-coordinator-unit.test.cjs tests/role-diary-scheduler-policy.test.cjs`

Expected: FAIL because the coordinator does not exist and the page still owns timers.

- [ ] **Step 3: Add latest-thread repository support**

Add `listActiveRoleThreads(db, space)` to return unarchived role-card threads ordered by `updatedAt DESC, createdAt DESC`. The coordinator's pure selector deduplicates by `roleCardId`, making the choice deterministic and testable.

- [ ] **Step 4: Implement single-flight runtime coordination**

Expose:

```ts
export function selectLatestDiaryThreadPerRole(threads: AiThreadRecord[]): AiThreadRecord[];

export async function coordinateDiaryRuntime(input: {
  space: PixorySpace;
  allowPersonal?: boolean;
  now?: Date;
}): Promise<void>;
```

Use one promise per space. Resume the diary runtime, run due durable jobs, stop if `AI_ROLE_DIARY_ENABLED` is false, select one thread per role, resolve each current branch lineage, and call `scheduleDiaryWakeup` for `nextDiaryWakeupAt(now)`. Reject Personal coordination unless `allowPersonal === true`; never open Personal implicitly.

- [ ] **Step 5: Wire application lifecycle and remove page ownership**

In `App.tsx`:

- call normal coordination after database initialization;
- call normal coordination whenever the app becomes active;
- call Personal coordination only after password verification, Personal database initialization, and diary runtime resume;
- retain `suspendDiaryBackgroundTasks('personal')` in the lock path.

In `AiChatScreen`, keep manual diary generation and diary display reload. Remove the repeating `nextDiaryWakeupAt` timer, page-level `scheduleDiaryWakeup`, page-level due-job foreground listener, and the assumption that visiting a thread is required to schedule automatic work.

- [ ] **Step 6: Run coordinator, diary, and type tests**

Run: `node --test tests/role-diary-runtime-coordinator-unit.test.cjs tests/role-diary-scheduler-policy.test.cjs tests/chat-and-diary-runtime-completeness-policy.test.cjs`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 7: Commit application-level coordination**

```bash
git add App.tsx src/ai/diary/diaryRuntimeCoordinator.ts src/database/repositories/aiThreadRepository.ts src/screens/AiChatScreen.tsx tests/role-diary-runtime-coordinator-unit.test.cjs tests/role-diary-scheduler-policy.test.cjs tests/chat-and-diary-runtime-completeness-policy.test.cjs
git commit -m "fix: coordinate diary jobs at app lifecycle"
```

## Task 5: Dream context, parsing, failure semantics, and recovery

**Files:**

- Create: `src/ai/dream/dreamPromptService.ts`
- Modify: `src/ai/dream/dreamPolicy.ts`
- Modify: `src/ai/dream/dreamService.ts`
- Modify: `src/ai/dream/dreamWorker.ts`
- Modify: `src/ai/dream/dreamRuntimeEvents.ts`
- Modify: `src/ai/dream/dreamRepository.ts`
- Modify: `src/ai/aiChatService.ts:4210-4230, 4950-4975`
- Modify: `src/components/ai/DreamChatCard.tsx`
- Modify: `src/screens/AiChatScreen.tsx:1910-1955, 6550-6585`
- Modify: `tests/companion-dream-policy-unit.test.cjs`
- Modify: `tests/companion-dream-repository-integration.test.cjs`
- Create: `tests/companion-dream-recovery-unit.test.cjs`

- [ ] **Step 1: Add failing parser and recovery tests**

Extend parser coverage:

```js
assert.deepEqual(
  policy.parseDreamGeneration('```json\n{"title":"雾中回声","body":"我沿着月光走进安静的雾。"}\n```'),
  { title: '雾中回声', body: '我沿着月光走进安静的雾。' },
);
assert.deepEqual(
  policy.parseDreamGeneration('结果如下：{"title":"雾中回声","body":"我沿着月光走进安静的雾。"}'),
  { title: '雾中回声', body: '我沿着月光走进安静的雾。' },
);
assert.equal(policy.parseDreamGeneration('{"title":"雾中回声","body":"有效","extra":1}'), null);
```

Test error presentation exactly:

```js
assert.deepEqual(policy.presentDreamFailure('source_changed'), {
  actionLabel: '按当前对话重新生成',
  message: '原对话来源已经变化，请按当前对话重新生成。',
  retryMode: 'regenerate_current',
});
assert.equal(policy.presentDreamFailure('provider_failed').retryMode, 'retry_same');
```

Repository integration must prove a terminal automatic failure decrements `dailyDreamReservedCount`, successful retry re-reserves quota, and neither failure nor manual recovery changes `lastDreamSuccessRound` until a non-manual dream actually completes.

- [ ] **Step 2: Run dream tests and verify they fail**

Run: `node --test tests/companion-dream-policy-unit.test.cjs tests/companion-dream-repository-integration.test.cjs tests/companion-dream-recovery-unit.test.cjs`

Expected: FAIL on fenced JSON, presentation API, and retry quota behavior.

- [ ] **Step 3: Add safe first-object extraction while retaining strict validation**

Implement `extractFirstJsonObject(value)` as a brace scanner that tracks quoted strings and escapes. `parseDreamClassification` and `parseDreamGeneration` parse only that extracted object, then retain their existing exact-key, enum, source-ID, length, and unsafe-content checks.

Add:

```ts
export type DreamRetryMode = 'retry_same' | 'regenerate_current';

export function presentDreamFailure(code: string | null): {
  message: string;
  actionLabel: string;
  retryMode: DreamRetryMode;
};
```

Map `source_changed` to current-source regeneration. Map `model_unavailable` to the readable message “当前没有可用模型，请完成模型配置后重试。” with action label “配置后重试”; provider and invalid-output failures use same-job retry with their own readable messages.

- [ ] **Step 4: Freeze twenty complete rounds and build separated prompts**

Increase both dream call-site candidate loads from 20 individual messages to `listSnapshotCandidateMessages(..., 20, branchScopes)`. In `dreamService`, use `buildDreamConversationSnapshot` with the current user/assistant IDs for automatic rounds and the current user ID for manual requests.

`dreamPromptService` must emit Beijing-stamped `[当前触发证据]` and `[过往关系背景]` sections. Classifier and generator instructions must state that older background cannot be interpreted as current events and that only trigger evidence can establish the active scene.

- [ ] **Step 5: Make quota and retries consistent**

Refactor `retryDreamGeneration` into readable multi-line code and accept both `failed` and `waiting_model` jobs. Before retrying a non-manual generating-phase job, call `reserveDreamQuota`; if reservation fails, keep it failed and return a typed result. Manual jobs bypass automatic quota. Same-source transient retry resets attempts and schedules maintenance.

Keep `failOrRetry` from advancing success counters. On terminal failure, release any reservation. Only `completeDream` for a non-manual reserved job increments daily successes and writes `lastDreamSuccessRound`, preserving the confirmed two-success/day and 50-round cooldown rules.

- [ ] **Step 6: Add current-source recovery for `source_changed`**

Add:

```ts
export async function regenerateDreamFromCurrentConversation(input: {
  space: PixorySpace;
  failedJobId: string;
}): Promise<string | null>;
```

Load the failed job and current thread branch, freeze a fresh 20-round snapshot, close the stale scene, create a new scene/seed with idempotency key `dream-recover:<failedJobId>:<snapshotHash>`, mark the seed `manual: true` and `decision: 'selected'`, create a generating job, emit `generating`, and schedule maintenance. This is an explicit user recovery and does not consume automatic quota.

- [ ] **Step 7: Reload every runtime state and display actionable failures**

Every `generating`, `completed`, `failed`, and `cancelled` notice for the active thread calls `reloadRoleDreams`. `loadDreamRuntimeNotice` treats `waiting_model` as an actionable failure notice instead of an indefinite generating notice. Await retry/recovery handlers and reload after their durable state change. Extend `DreamChatCard` with a `waiting_model` display state, short message, and action label. `source_changed` calls current-source regeneration; `waiting_model` and other retryable codes call same-job retry.

- [ ] **Step 8: Run dream, snapshot, and type tests**

Run: `node --test tests/companion-dream-policy-unit.test.cjs tests/companion-dream-repository-integration.test.cjs tests/companion-dream-recovery-unit.test.cjs tests/companion-conversation-snapshot-unit.test.cjs`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 9: Commit dream reliability**

```bash
git add src/ai/dream/dreamPromptService.ts src/ai/dream/dreamPolicy.ts src/ai/dream/dreamService.ts src/ai/dream/dreamWorker.ts src/ai/dream/dreamRuntimeEvents.ts src/ai/dream/dreamRepository.ts src/ai/aiChatService.ts src/components/ai/DreamChatCard.tsx src/screens/AiChatScreen.tsx tests/companion-dream-policy-unit.test.cjs tests/companion-dream-repository-integration.test.cjs tests/companion-dream-recovery-unit.test.cjs
git commit -m "fix: make dream generation recoverable"
```

## Task 6: Approved Android 12-safe splash asset pipeline

**Files:**

- Create: `icons/splash_foreground.png`
- Create: `scripts/generate-android-splash-assets.cjs`
- Modify: `app.json:44-50`
- Modify: `android/app/src/main/res/drawable-mdpi/splashscreen_logo.png`
- Modify: `android/app/src/main/res/drawable-hdpi/splashscreen_logo.png`
- Modify: `android/app/src/main/res/drawable-xhdpi/splashscreen_logo.png`
- Modify: `android/app/src/main/res/drawable-xxhdpi/splashscreen_logo.png`
- Modify: `android/app/src/main/res/drawable-xxxhdpi/splashscreen_logo.png`
- Modify: `tests/android-icon-splash-policy.test.cjs`

- [ ] **Step 1: Strengthen the splash policy test first**

Use Jimp to read the master and density files. Assert:

```js
const expectedSizes = {
  mdpi: 288,
  hdpi: 432,
  xhdpi: 576,
  xxhdpi: 864,
  xxxhdpi: 1152,
};
```

For the master, assert all four corner alpha values are zero and the nontransparent bounding box leaves at least 15% on every edge. Assert every density file matches its expected square size instead of all five sharing one pixel size.

- [ ] **Step 2: Run the splash test and verify it fails**

Run: `node --test tests/android-icon-splash-policy.test.cjs`

Expected: FAIL because the config still references `splash_padded.png`, the approved master is absent, and current density files have identical dimensions.

- [ ] **Step 3: Copy the approved transparent foreground into the repository**

Copy:

```text
C:\Users\33398\.codex\visualizations\2026\08\08\019fe006-594f-7113-b3d4-f413ba16311c\splash-preview\splash-foreground-v2-transparent.png
```

to:

```text
icons/splash_foreground.png
```

Do not modify the original imported artwork. The approved foreground retains gallery, play, camera, heart, orbit, stars, and dots inside the safe area.

- [ ] **Step 4: Add deterministic density generation**

The script imports `{ Jimp, ResizeStrategy }` from Jimp, reads `icons/splash_foreground.png`, resizes the full transparent square canvas with `ResizeStrategy.BICUBIC`, and writes the five exact target sizes above. It must fail if the source lacks alpha or any corner is opaque.

- [ ] **Step 5: Point Expo to the transparent master and generate resources**

Set:

```json
{
  "backgroundColor": "#4a7bf7",
  "image": "./icons/splash_foreground.png",
  "imageWidth": 192,
  "resizeMode": "contain"
}
```

Run: `node scripts/generate-android-splash-assets.cjs`

Expected: five success lines with `288`, `432`, `576`, `864`, and `1152` pixel outputs.

- [ ] **Step 6: Run splash tests and Android resource processing**

Run: `node --test tests/android-icon-splash-policy.test.cjs`

Expected: PASS.

Run from `android`: `.\gradlew.bat :app:processDebugResources`

Expected: BUILD SUCCESSFUL.

- [ ] **Step 7: Commit the splash pipeline and generated resources**

```bash
git add app.json icons/splash_foreground.png scripts/generate-android-splash-assets.cjs tests/android-icon-splash-policy.test.cjs android/app/src/main/res/drawable-mdpi/splashscreen_logo.png android/app/src/main/res/drawable-hdpi/splashscreen_logo.png android/app/src/main/res/drawable-xhdpi/splashscreen_logo.png android/app/src/main/res/drawable-xxhdpi/splashscreen_logo.png android/app/src/main/res/drawable-xxxhdpi/splashscreen_logo.png
git commit -m "fix: ship Android-safe splash foreground"
```

## Task 7: Feature matrix and complete verification

**Files:**

- Modify: `docs/feature-matrix.md`

- [ ] **Step 1: Update the feature matrix**

Record these shipped capabilities in the AI companion/chat and Android presentation sections:

- diary/dream cards are anchored after frozen source messages and remain stable across reload/pagination;
- diary uses 30 complete rounds with today/background separation and app-level lifecycle reconciliation;
- dream uses 20 complete rounds plus trigger evidence, two successful automatic dreams/day, 50-round success cooldown, and failure-safe retry/current-source recovery;
- Android splash uses one transparent master with retained media decorations and generated density-correct resources.

- [ ] **Step 2: Run all focused tests together**

Run:

```bash
node --test tests/companion-conversation-snapshot-unit.test.cjs tests/companion-artifact-timeline-unit.test.cjs tests/role-diary-prompt-policy.test.cjs tests/role-diary-scheduler-policy.test.cjs tests/role-diary-runtime-coordinator-unit.test.cjs tests/companion-dream-policy-unit.test.cjs tests/companion-dream-repository-integration.test.cjs tests/companion-dream-recovery-unit.test.cjs tests/android-icon-splash-policy.test.cjs tests/chat-and-diary-runtime-completeness-policy.test.cjs
```

Expected: all tests PASS.

- [ ] **Step 3: Run project-wide verification**

Run: `pnpm typecheck`

Expected: PASS.

Run: `pnpm test`

Expected: PASS with zero failed tests.

Run: `git diff --check`

Expected: no output.

- [ ] **Step 4: Run Android build verification**

Run from `android`: `.\gradlew.bat :app:assembleDebug`

Expected: BUILD SUCCESSFUL.

If an Android 12+ emulator/device is available, install/launch the debug APK and capture the actual system splash. Verify no square color boundary, no clipped media icons, and no green fringe. If no device is available, report that screenshot validation remains unverified rather than claiming it passed.

- [ ] **Step 5: Review the final diff for scope and user-owned changes**

Run: `git status --short --branch`

Run: `git diff --stat HEAD~6..HEAD`

Confirm that only the planned source, tests, docs, config, and splash resources changed. Do not include unrelated files.

- [ ] **Step 6: Commit documentation if it was not included earlier**

```bash
git add docs/feature-matrix.md
git commit -m "docs: update companion feature matrix"
```
