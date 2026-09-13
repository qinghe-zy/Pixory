# Companion Artifact Card Versions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared long-press actions, append-only versions, chat-only hiding, stable timeline rebuilding, and current-tab batch permanent deletion for companion diaries, thoughts, and dreams.

**Architecture:** Reuse the existing anchored message-menu presentation and message version stepper through small shared UI components. Keep artifact content lifecycle separate from chat presentation through a dedicated SQLite chat-state table; reuse the existing diary version table and add explicit dream version-group fields. Repository methods own transactions and current-version promotion, while screens reload complete groups after mutations instead of editing FlatList arrays by index.

**Tech Stack:** Expo 54, React Native 0.81, TypeScript, expo-sqlite, Node `node:test`, `node:sqlite` integration fixtures.

---

## File map

**Create:**

- `src/ai/companion/companionArtifactChatStateRepository.ts` — chat-only hidden state.
- `src/ai/diary/diaryVersionService.ts` — regenerate one diary version from its frozen source.
- `src/components/ai/AiAnchoredContextMenu.tsx` — shared finger-anchored menu presentation.
- `src/components/ai/AiVersionStepper.tsx` — shared `1/2` control.
- `tests/companion-artifact-version-schema.test.cjs` — V59 migration and backfill.
- `tests/companion-artifact-version-lifecycle.test.cjs` — version append, promotion, chat hiding, and batch deletion.
- `tests/companion-artifact-card-actions-policy.test.cjs` — shared UI and stable timeline policy.
- `tests/companion-inner-life-selection-policy.test.cjs` — current-tab multi-select policy.

**Modify:**

- `src/database/schema.ts`, `src/database/db.ts` — database version 59.
- `src/ai/diary/diaryRepository.ts` — list/read/delete all diary versions.
- `src/ai/dream/dreamRepository.ts`, `src/ai/dream/dreamService.ts`, `src/ai/dream/dreamWorker.ts` — dream version groups and frozen-source regeneration.
- `src/ai/thought/thoughtRepository.ts` — batch permanent deletion.
- `src/ai/companion/companionArtifactService.ts` — only current dream versions enter context.
- `src/components/ai/AiMessageContextMenu.tsx`, `src/components/ai/AiMessageBubble.tsx` — compatibility wrapper and shared stepper.
- `src/components/ai/DiaryChatCard.tsx`, `src/components/ai/DreamChatCard.tsx` — long press and version footer.
- `src/screens/AiChatScreen.tsx` — group loading, menu actions, regeneration, chat hiding, full timeline rebuild.
- `src/screens/CompanionInnerLifeScreen.tsx` — all versions and current-tab batch selection.
- `src/screens/DiaryReaderScreen.tsx`, `src/screens/DreamReaderScreen.tsx`, `App.tsx` — open the selected version.
- `docs/feature-matrix.md` — user-visible capability inventory.

The current repository contains uncommitted chat hotfix files. Execute `2026-08-11-empty-chat-history-filter.md` first so this plan begins from a verified commit. Do not reset or discard the current tree.

### Task 1: Add the V59 artifact-version schema

**Files:**
- Create: `tests/companion-artifact-version-schema.test.cjs`
- Modify: `src/database/schema.ts:1-4,2074-2087`
- Modify: `src/database/db.ts:9-68,285-535`

- [ ] **Step 1: Write the failing migration test**

Create a `node:sqlite` fixture that applies V53 and V58, inserts one active dream, then applies V59. The assertions must be:

```js
assert.equal(schema.DATABASE_VERSION, 59);
db.exec(schema.MIGRATION_STATEMENTS_V59);
const migrated = db.prepare(`
  SELECT versionGroupId, versionNumber, isCurrent
  FROM companion_dreams WHERE id = 'legacy-dream'
`).get();
assert.deepEqual(migrated, {
  versionGroupId: 'legacy-dream',
  versionNumber: 1,
  isCurrent: 1,
});
const chatStateColumns = db.prepare(
  `PRAGMA table_info(companion_artifact_chat_states)`,
).all().map((column) => column.name);
assert.deepEqual(chatStateColumns, [
  'artifactKind', 'artifactGroupId', 'threadId',
  'hiddenAt', 'createdAt', 'updatedAt',
]);
```

The fixture must create the minimal `ai_threads` and `ai_messages` tables used by V53 before applying that migration, matching `tests/companion-dream-repository-integration.test.cjs`.

- [ ] **Step 2: Run the schema test and verify it fails**

Run:

```powershell
node --test tests/companion-artifact-version-schema.test.cjs
```

Expected: FAIL because `MIGRATION_STATEMENTS_V59` is not exported and `DATABASE_VERSION` is 58.

- [ ] **Step 3: Add the V59 SQL**

Set `DATABASE_VERSION = 59` and export this migration after V58:

```ts
export const MIGRATION_STATEMENTS_V59 = `
ALTER TABLE companion_dream_jobs ADD COLUMN targetVersionGroupId TEXT;
ALTER TABLE companion_dreams ADD COLUMN versionGroupId TEXT NOT NULL DEFAULT '';
ALTER TABLE companion_dreams ADD COLUMN versionNumber INTEGER NOT NULL DEFAULT 1;
ALTER TABLE companion_dreams ADD COLUMN isCurrent INTEGER NOT NULL DEFAULT 0
  CHECK (isCurrent IN (0, 1));

UPDATE companion_dreams
SET versionGroupId = id,
    versionNumber = 1,
    isCurrent = 1
WHERE versionGroupId = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_companion_dreams_group_version
  ON companion_dreams(versionGroupId, versionNumber);
CREATE UNIQUE INDEX IF NOT EXISTS idx_companion_dreams_group_current
  ON companion_dreams(versionGroupId)
  WHERE isCurrent = 1 AND status = 'active';

CREATE TABLE IF NOT EXISTS companion_artifact_chat_states (
  artifactKind TEXT NOT NULL CHECK (artifactKind IN ('diary', 'dream')),
  artifactGroupId TEXT NOT NULL,
  threadId TEXT NOT NULL,
  hiddenAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (artifactKind, artifactGroupId, threadId),
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_companion_artifact_chat_states_thread
  ON companion_artifact_chat_states(threadId, artifactKind, hiddenAt);
`;
```

- [ ] **Step 4: Register V59 in database initialization**

Import `MIGRATION_STATEMENTS_V59` in `src/database/db.ts` and add:

```ts
if (currentVersion < 59) {
  await database.execAsync(MIGRATION_STATEMENTS_V59);
}
```

Place it immediately after the V58 block and before schema repair helpers.

- [ ] **Step 5: Run the schema and existing dream integration tests**

Run:

```powershell
node --test tests/companion-artifact-version-schema.test.cjs tests/companion-dream-repository-integration.test.cjs tests/role-diary-schema-policy.test.cjs
```

Expected: PASS.

- [ ] **Step 6: Commit the migration**

```powershell
git add -- src/database/schema.ts src/database/db.ts tests/companion-artifact-version-schema.test.cjs
git commit -m "feat(companion): add artifact version schema" -m "What: add dream version groups, regeneration job targets, and chat-only artifact visibility state in database V59. Why: regenerated content must remain append-only while chat removal stays separate from inner-life data. Verification: focused schema and dream repository tests. Limitation: UI and lifecycle methods follow in later commits."
```

### Task 2: Add chat-only artifact visibility storage

**Files:**
- Create: `src/ai/companion/companionArtifactChatStateRepository.ts`
- Create or extend: `tests/companion-artifact-version-lifecycle.test.cjs`

- [ ] **Step 1: Write a failing repository test**

Test that hiding a diary group in `thread-a` does not hide a dream or the same group in `thread-b`:

```js
await chatStateRepository.hide(db, {
  artifactKind: 'diary',
  artifactGroupId: 'diary-a',
  threadId: 'thread-a',
});
assert.deepEqual(
  [...await chatStateRepository.listHiddenGroupIds(db, 'thread-a', 'diary')],
  ['diary-a'],
);
assert.deepEqual(
  [...await chatStateRepository.listHiddenGroupIds(db, 'thread-a', 'dream')],
  [],
);
assert.deepEqual(
  [...await chatStateRepository.listHiddenGroupIds(db, 'thread-b', 'diary')],
  [],
);
```

- [ ] **Step 2: Run the test and verify the module is missing**

```powershell
node --test tests/companion-artifact-version-lifecycle.test.cjs
```

Expected: FAIL with module-not-found or missing export.

- [ ] **Step 3: Implement the repository public surface**

Use this exact API:

```ts
import type { SQLiteDatabase } from 'expo-sqlite';
import { createTimestamp } from '../../database/utils';

export type CompanionChatArtifactKind = 'diary' | 'dream';

export const companionArtifactChatStateRepository = {
  async hide(db: SQLiteDatabase, input: {
    artifactKind: CompanionChatArtifactKind;
    artifactGroupId: string;
    threadId: string;
  }): Promise<void> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO companion_artifact_chat_states (
         artifactKind, artifactGroupId, threadId, hiddenAt, createdAt, updatedAt
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(artifactKind, artifactGroupId, threadId) DO UPDATE SET
         hiddenAt = excluded.hiddenAt,
         updatedAt = excluded.updatedAt`,
      input.artifactKind, input.artifactGroupId, input.threadId, now, now, now,
    );
  },

  async listHiddenGroupIds(
    db: SQLiteDatabase,
    threadId: string,
    artifactKind: CompanionChatArtifactKind,
  ): Promise<Set<string>> {
    const rows = await db.getAllAsync<{ artifactGroupId: string }>(
      `SELECT artifactGroupId FROM companion_artifact_chat_states
       WHERE threadId = ? AND artifactKind = ?`,
      threadId,
      artifactKind,
    );
    return new Set(rows.map((row) => row.artifactGroupId));
  },

  async deleteGroupState(db: SQLiteDatabase, input: {
    artifactKind: CompanionChatArtifactKind;
    artifactGroupId: string;
  }): Promise<void> {
    await db.runAsync(
      `DELETE FROM companion_artifact_chat_states
       WHERE artifactKind = ? AND artifactGroupId = ?`,
      input.artifactKind,
      input.artifactGroupId,
    );
  },
};
```

- [ ] **Step 4: Run the lifecycle test**

```powershell
node --test tests/companion-artifact-version-lifecycle.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/ai/companion/companionArtifactChatStateRepository.ts tests/companion-artifact-version-lifecycle.test.cjs
git commit -m "feat(companion): persist chat-only card visibility" -m "What: add thread-scoped hidden state for diary and dream groups. Why: removing a card from chat must not mutate inner-life content. Verification: lifecycle integration test. Limitation: screens do not consume the state yet."
```

### Task 3: Extract shared anchored menu and version stepper

**Files:**
- Create: `src/components/ai/AiAnchoredContextMenu.tsx`
- Create: `src/components/ai/AiVersionStepper.tsx`
- Modify: `src/components/ai/AiMessageContextMenu.tsx`
- Modify: `src/components/ai/AiMessageBubble.tsx:18-250`
- Modify: `tests/ai-message-context-menu-policy.test.cjs`
- Create: `tests/companion-artifact-card-actions-policy.test.cjs`

- [ ] **Step 1: Add failing policy assertions**

Assert the generic menu owns the modal and the message wrapper supplies its message-specific dismiss label:

```js
const anchored = read('src/components/ai/AiAnchoredContextMenu.tsx');
const messageMenu = read('src/components/ai/AiMessageContextMenu.tsx');
const stepper = read('src/components/ai/AiVersionStepper.tsx');
assert.match(anchored, /resolveAiMessageContextMenuPosition/);
assert.match(anchored, /animationType="fade"/);
assert.match(anchored, /dismissAccessibilityLabel/);
assert.match(messageMenu, /AiAnchoredContextMenu/);
assert.match(messageMenu, /关闭消息操作菜单/);
assert.match(stepper, /currentIndex.*total/);
assert.match(stepper, /chevron-back/);
assert.match(stepper, /chevron-forward/);
```

- [ ] **Step 2: Run the focused UI policy tests and confirm failure**

```powershell
node --test tests/ai-message-context-menu-policy.test.cjs tests/companion-artifact-card-actions-policy.test.cjs
```

Expected: FAIL because the shared files do not exist.

- [ ] **Step 3: Move presentation into `AiAnchoredContextMenu`**

Move the current `AiMessageContextMenu` implementation without visual changes. Export:

```ts
export type AiAnchoredContextMenuAction = {
  disabled?: boolean;
  icon: ComponentProps<typeof Ionicons>['name'];
  key: string;
  label: string;
  onPress: () => void;
  selected?: boolean;
};

export type AiAnchoredContextMenuProps = {
  actions: AiAnchoredContextMenuAction[];
  anchorX: number;
  anchorY: number;
  dismissAccessibilityLabel: string;
  onClose: () => void;
  timeLabel: string;
  visible: boolean;
};
```

Mechanically move the complete current `AiMessageContextMenu` function body, `MenuSize` type, and `styles` object into this file. Rename the function and props type to `AiAnchoredContextMenu` / `AiAnchoredContextMenuProps`, destructure `dismissAccessibilityLabel`, and make exactly this one JSX substitution:

```tsx
<Pressable
  accessibilityLabel={dismissAccessibilityLabel}
  accessibilityRole="button"
  onPress={onClose}
  style={StyleSheet.absoluteFill}
/>
```

Keep the existing `Modal`, safe-area/window measurement, `resolveAiMessageContextMenuPosition` call, 5px anchor gap behavior, action ordering, footer, animation, tokens, and styles unchanged.

`AiMessageContextMenu.tsx` becomes a compatibility wrapper and type alias:

```tsx
export type AiMessageContextMenuAction = AiAnchoredContextMenuAction;

export function AiMessageContextMenu(props: Omit<
  ComponentProps<typeof AiAnchoredContextMenu>,
  'dismissAccessibilityLabel'
>) {
  return (
    <AiAnchoredContextMenu
      {...props}
      dismissAccessibilityLabel="关闭消息操作菜单"
    />
  );
}
```

- [ ] **Step 4: Implement `AiVersionStepper` and reuse it in messages**

The component API must be:

```tsx
export function AiVersionStepper({
  currentIndex,
  nextAccessibilityLabel = '下一版',
  total,
  onPrevious,
  onNext,
  previousAccessibilityLabel = '上一版',
}: {
  currentIndex: number;
  nextAccessibilityLabel?: string;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  previousAccessibilityLabel?: string;
}) {
  const atFirst = currentIndex <= 1;
  const atLast = currentIndex >= total;

  return (
    <View style={styles.versionControl}>
      <Pressable
        accessibilityLabel={previousAccessibilityLabel}
        accessibilityRole="button"
        disabled={atFirst}
        hitSlop={8}
        onPress={onPrevious}
        style={({ pressed }) => [
          styles.versionButton,
          atFirst && styles.disabled,
          pressed && !atFirst && styles.pressed,
        ]}
      >
        <Ionicons color={aiLightColors.muted} name="chevron-back" size={14} />
      </Pressable>
      <Text style={styles.versionText}>{currentIndex}/{total}</Text>
      <Pressable
        accessibilityLabel={nextAccessibilityLabel}
        accessibilityRole="button"
        disabled={atLast}
        hitSlop={8}
        onPress={onNext}
        style={({ pressed }) => [
          styles.versionButton,
          atLast && styles.disabled,
          pressed && !atLast && styles.pressed,
        ]}
      >
        <Ionicons color={aiLightColors.muted} name="chevron-forward" size={14} />
      </Pressable>
    </View>
  );
}
```

Import `Ionicons`, `Pressable`, `StyleSheet`, `Text`, and `View`; import `radius`, `spacing`, and `typography` from the shared tokens plus `aiLightColors`. Move `versionControl`, `versionButton`, and `versionText` styles with their current values. Add `disabled: { opacity: 0.36 }` and `pressed: { opacity: 0.78 }`, matching the current message footer states. Replace the inline version block in `AiMessageFooterActions` with:

```tsx
{message.versionTotal > 1 ? (
  <AiVersionStepper
    currentIndex={message.versionIndex}
    nextAccessibilityLabel="下一版消息"
    onNext={() => selectVersion(1)}
    onPrevious={() => selectVersion(-1)}
    previousAccessibilityLabel="上一版消息"
    total={message.versionTotal}
  />
) : null}
```

- [ ] **Step 5: Run UI tests and typecheck**

```powershell
node --test tests/ai-message-context-menu-policy.test.cjs tests/companion-artifact-card-actions-policy.test.cjs
pnpm typecheck
```

Expected: PASS; existing message menu positioning and actions remain unchanged.

- [ ] **Step 6: Commit**

```powershell
git add -- src/components/ai/AiAnchoredContextMenu.tsx src/components/ai/AiVersionStepper.tsx src/components/ai/AiMessageContextMenu.tsx src/components/ai/AiMessageBubble.tsx tests/ai-message-context-menu-policy.test.cjs tests/companion-artifact-card-actions-policy.test.cjs
git commit -m "refactor(chat): share anchored menu and version stepper" -m "What: extract the existing finger-anchored menu and message version control into reusable components without visual changes. Why: companion cards must match chat bubbles exactly. Verification: context-menu policies and typecheck. Limitation: artifact cards are wired in a later task."
```

### Task 4: Add diary version listing, exact reading, regeneration, and batch deletion

**Files:**
- Modify: `src/ai/diary/diaryRepository.ts`
- Create: `src/ai/diary/diaryVersionService.ts`
- Modify: `tests/companion-artifact-version-lifecycle.test.cjs`
- Modify: `tests/role-diary-generation-policy.test.cjs`

- [ ] **Step 1: Add failing diary lifecycle tests**

Seed one diary with v1 and v2, then assert:

```js
const groups = await diaryRepository.listVersionGroupsForRole(db, 'role-a');
assert.equal(groups.length, 1);
assert.deepEqual(groups[0].versions.map((version) => version.versionNumber), [1, 2]);

await diaryRepository.permanentlyDeleteVersions(db, ['diary-a:v2']);
const promoted = await diaryRepository.findDiaryVersion(db, 'diary-a');
assert.equal(promoted.version.id, 'diary-a:v1');
assert.equal(promoted.version.status, 'current');

await diaryRepository.permanentlyDeleteVersions(db, ['diary-a:v1']);
assert.equal(await diaryRepository.findCurrentDiaryById(db, 'diary-a'), null);
assert.deepEqual(
  await chatStateRepository.listHiddenGroupIds(db, 'thread-a', 'diary'),
  [],
);
```

Also assert a batch containing an unknown ID does not delete known versions; the repository must throw and roll back.

- [ ] **Step 2: Run the lifecycle test and verify missing methods**

```powershell
node --test tests/companion-artifact-version-lifecycle.test.cjs
```

Expected: FAIL because version-group and batch-delete APIs do not exist.

- [ ] **Step 3: Add diary group and exact-version APIs**

Export:

```ts
export interface RoleDiaryVersionGroup {
  diary: RoleDiaryRecord;
  versions: RoleDiaryVersionRecord[];
}
```

Add these methods to `diaryRepository`:

```ts
listVersionGroupsForRole(db, roleCardId): Promise<RoleDiaryVersionGroup[]>
findVersionEntryById(db, versionId): Promise<{ diary: RoleDiaryRecord; version: RoleDiaryVersionRecord } | null>
findDiaryVersion(db, diaryId, versionId?): Promise<{ diary: RoleDiaryRecord; version: RoleDiaryVersionRecord } | null>
findSourceJobForVersion(db, versionId): Promise<RoleDiaryJobRecord | null>
permanentlyDeleteVersions(db, versionIds): Promise<{ deletedCount: number; removedDiaryIds: string[] }>
```

`listVersionGroupsForRole` must order groups by `diaryDate DESC` and versions by `versionNumber ASC`. `findSourceJobForVersion` joins the version’s `jobContextSnapshotHash` to `companion_diary_jobs.sourceSnapshotHash` for the same role/date and selects the completed job nearest the version creation time.

`permanentlyDeleteVersions` must use `withExclusiveTransactionAsync`, reject duplicates or unknown IDs, delete the requested rows, promote the highest remaining `versionNumber`, and delete `companion_diaries` only when no versions remain. Use this promotion sequence inside the transaction:

```sql
UPDATE companion_diary_versions
SET status = 'superseded', supersededAt = COALESCE(supersededAt, ?)
WHERE diaryId = ?;

UPDATE companion_diary_versions
SET status = 'current', supersededAt = NULL
WHERE id = ?;

UPDATE companion_diaries
SET currentVersionId = ?, updatedAt = ?
WHERE id = ?;
```

When the deletion leaves no versions, remove chat-only visibility rows before deleting the diary root:

```sql
DELETE FROM companion_artifact_chat_states
WHERE artifactKind = 'diary' AND artifactGroupId = ?;

DELETE FROM companion_diaries
WHERE id = ?;
```

The lifecycle test must seed a hidden chat-state row for `diary-a` so the final assertion proves that no orphaned state remains.

- [ ] **Step 4: Implement frozen-source diary regeneration**

Export this service API:

```ts
export async function regenerateDiaryVersion(input: {
  space: PixorySpace;
  versionId: string;
}): Promise<{ diaryId: string; versionId: string }>
```

The service must load the exact version and its completed source job, call `scheduleDiaryJob` with the source job’s frozen fields and a new ISO `scheduledFor`, then await `runDiaryJobInBackground`. Reload the diary and require that its `currentVersionId` differs from the source version; otherwise throw the job error or `日记重新生成失败。`.

Do not call `prepareAndScheduleDiaryJob`, because that reads current conversation content instead of the approved frozen source.

- [ ] **Step 5: Add a source-freezing policy assertion**

In `tests/role-diary-generation-policy.test.cjs`, assert:

```js
assert.match(versionService, /findSourceJobForVersion/);
assert.match(versionService, /sourceMessagesJson:\s*sourceJob\.sourceMessagesJson/);
assert.match(versionService, /sourceBranchRouteJson:\s*sourceJob\.sourceBranchRouteJson/);
assert.doesNotMatch(versionService, /prepareAndScheduleDiaryJob/);
```

- [ ] **Step 6: Run tests and typecheck**

```powershell
node --test tests/companion-artifact-version-lifecycle.test.cjs tests/role-diary-generation-policy.test.cjs tests/role-diary-schema-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- src/ai/diary/diaryRepository.ts src/ai/diary/diaryVersionService.ts tests/companion-artifact-version-lifecycle.test.cjs tests/role-diary-generation-policy.test.cjs
git commit -m "feat(diary): manage append-only diary versions" -m "What: list and read exact diary versions, regenerate from frozen source jobs, and transactionally delete selected versions with current-version promotion. Why: chat cards and inner life need durable alternatives without overwriting content. Verification: diary lifecycle and generation-policy tests plus typecheck. Limitation: screens are wired later."
```

### Task 5: Add dream version groups, frozen-source regeneration, and batch deletion

**Files:**
- Modify: `src/ai/dream/dreamRepository.ts`
- Modify: `src/ai/dream/dreamService.ts`
- Modify: `src/ai/dream/dreamWorker.ts`
- Modify: `tests/companion-artifact-version-lifecycle.test.cjs`
- Modify: `tests/companion-dream-repository-integration.test.cjs`
- Modify: `tests/companion-dream-recovery-unit.test.cjs`

- [ ] **Step 1: Add failing dream version tests**

Extend the repository integration fixture to apply V59. Complete a normal dream and assert v1, then create a manual seed/job with `targetVersionGroupId` equal to v1’s group and complete it. Assert:

```js
const groups = await repository.listVersionGroupsForRole(db, 'role-a');
assert.equal(groups.length, 1);
assert.deepEqual(groups[0].versions.map((dream) => dream.versionNumber), [1, 2]);
assert.equal(groups[0].versions[0].isCurrent, false);
assert.equal(groups[0].versions[1].isCurrent, true);
```

Then delete v2 and assert v1 is promoted; delete v1 and assert the group is absent.

- [ ] **Step 2: Run the focused tests and verify failure**

```powershell
node --test tests/companion-dream-repository-integration.test.cjs tests/companion-artifact-version-lifecycle.test.cjs
```

Expected: FAIL because mapped records and repository methods lack version fields.

- [ ] **Step 3: Extend dream record and job types**

Add to `DreamRecord`:

```ts
versionGroupId: string;
versionNumber: number;
isCurrent: boolean;
```

Add to `DreamJobRecord`:

```ts
targetVersionGroupId: string | null;
```

Map legacy-safe values as:

```ts
versionGroupId: String(row.versionGroupId || row.id),
versionNumber: Number(row.versionNumber ?? 1),
isCurrent: row.isCurrent == null ? true : Number(row.isCurrent) === 1,
targetVersionGroupId: (row.targetVersionGroupId as string | null) ?? null,
```

- [ ] **Step 4: Carry a target group through job creation and completion**

Extend `createDreamJob` input with `targetVersionGroupId?: string | null`, insert it into `companion_dream_jobs`, and include it in the returned job.

In `completeDream`, determine:

```ts
const versionGroupId = current.targetVersionGroupId ?? id;
const latest = await db.getFirstAsync<{ maxVersion: number; contextOptIn: number | null }>(
  `SELECT COALESCE(MAX(versionNumber), 0) AS maxVersion,
          MAX(CASE WHEN isCurrent = 1 THEN contextOptIn END) AS contextOptIn
   FROM companion_dreams WHERE versionGroupId = ?`,
  versionGroupId,
);
const versionNumber = latest ? latest.maxVersion + 1 : 1;
await db.runAsync(
  `UPDATE companion_dreams SET isCurrent = 0, updatedAt = ?
   WHERE versionGroupId = ? AND isCurrent = 1`,
  input.now,
  versionGroupId,
);
```

Insert the completed row with `versionGroupId`, `versionNumber`, `isCurrent = 1`, and inherited `contextOptIn`. The worker already calls `complete` inside a transaction; keep the current final source revalidation in that same transaction.

- [ ] **Step 5: Add version-group and permanent-delete APIs**

Export:

```ts
export interface DreamVersionGroup {
  id: string;
  versions: DreamRecord[];
}

listVersionGroupsForRole(db, roleCardId): Promise<DreamVersionGroup[]>
permanentlyDeleteVersions(db, dreamIds): Promise<{ deletedCount: number; removedGroupIds: string[] }>
```

Batch deletion must use `withTransactionAsync`, reject unknown IDs before deleting, promote the highest remaining `versionNumber`, and delete matching `companion_artifact_chat_states` rows for groups that become empty.

- [ ] **Step 6: Implement completed-dream regeneration from the saved source**

Add to `dreamService.ts`:

```ts
export async function regenerateDreamVersion(input: {
  space: PixorySpace;
  dreamId: string;
}): Promise<string>
```

Load the active dream, its original seed, and thread. Create a new manual seed with the original seed’s `sourceMessageIds`, `sourceMessageVersionHashes`, `sourceSnapshotHash`, `roleSnapshotJson`, branch route, lineage, scene, and a unique key `dream-version:${dream.id}:${now}`. Create a generating job with:

```ts
const job = await dreamRepository.createJob(db, {
  now,
  phase: 'generating',
  seed,
  targetVersionGroupId: dream.versionGroupId,
});
```

Emit the existing generating notice and schedule companion maintenance. Do not call `regenerateDreamFromCurrentConversation`; that method intentionally chooses current messages for failed stale jobs and has different semantics.

- [ ] **Step 7: Keep user regeneration outside automatic quota**

The cloned seed must set `manual: true`. Preserve the worker condition:

```ts
if (job.phase === 'generating' && !source.seed.manual && !job.quotaReserved) {
  // automatic quota reservation only
}
```

Add a test asserting a regenerated manual version does not increment `dailyDreamSuccessCount` or `lastDreamSuccessRound` during counter rebuild.

- [ ] **Step 8: Run dream tests and typecheck**

```powershell
node --test tests/companion-dream-repository-integration.test.cjs tests/companion-dream-recovery-unit.test.cjs tests/companion-artifact-version-lifecycle.test.cjs tests/companion-artifact-delivery-integration.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add -- src/ai/dream/dreamRepository.ts src/ai/dream/dreamService.ts src/ai/dream/dreamWorker.ts tests/companion-dream-repository-integration.test.cjs tests/companion-dream-recovery-unit.test.cjs tests/companion-artifact-version-lifecycle.test.cjs tests/companion-artifact-delivery-integration.test.cjs
git commit -m "feat(dream): add durable dream versions" -m "What: group regenerated dreams, preserve one current version, clone frozen source into user regeneration jobs, and transactionally delete versions. Why: alternate dreams must remain viewable without consuming automatic quota or overwriting prior content. Verification: dream lifecycle, recovery, delivery, and type tests. Limitation: chat and inner-life UI follow later."
```

### Task 6: Restrict model context to current artifact versions

**Files:**
- Modify: `src/ai/companion/companionArtifactService.ts:35-48`
- Modify: `tests/companion-artifact-delivery-integration.test.cjs`

- [ ] **Step 1: Add a failing context-selection test**

Seed two active dreams in one group, both `contextOptIn = 1`, but only v2 `isCurrent = 1`. Assert `selectCompanionArtifactForTurn` returns v2’s artifact ID and body.

- [ ] **Step 2: Run the test and confirm the older version can currently win**

```powershell
node --test tests/companion-artifact-delivery-integration.test.cjs
```

Expected: FAIL until context selection filters `isCurrent`.

- [ ] **Step 3: Filter explicit dreams to current versions**

Add `x.isCurrent === true` to the dream filter before `adaptDreamArtifact`:

```ts
...dreams
  .filter((x) =>
    x.isCurrent === true &&
    x.contextOptIn === true &&
    x.sourceThreadId === input.thread.id &&
    x.sourceBranchRouteHash === input.branchRouteHash &&
    x.lineageVersion <= (input.thread.lineageVersion ?? 0)
  )
  .map((x) => ({ ...adaptDreamArtifact(x), priority: 86 }))
```

Diary context already resolves `currentVersionId`; do not change it.

- [ ] **Step 4: Run the delivery test and commit**

```powershell
node --test tests/companion-artifact-delivery-integration.test.cjs
git add -- src/ai/companion/companionArtifactService.ts tests/companion-artifact-delivery-integration.test.cjs
git commit -m "fix(companion): inject only current artifact versions" -m "What: restrict explicit dream context to the current version while preserving existing diary current-version lookup. Why: archived alternatives must not be injected together. Verification: artifact delivery integration test. Limitation: display selection remains independent by design."
```

### Task 7: Wire version-aware cards, shared menus, and stable timeline rebuilds

**Files:**
- Modify: `src/components/ai/DiaryChatCard.tsx`
- Modify: `src/components/ai/DreamChatCard.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `src/screens/DiaryReaderScreen.tsx`
- Modify: `src/screens/DreamReaderScreen.tsx`
- Modify: `App.tsx`
- Modify: `tests/companion-artifact-card-actions-policy.test.cjs`
- Modify: `tests/companion-artifact-timeline-unit.test.cjs`
- Modify: `tests/role-diary-visibility-and-chat-entry-policy.test.cjs`

- [ ] **Step 1: Add failing card and timeline policy assertions**

Require both cards to use 500ms long press coordinates and the shared stepper:

```js
for (const source of [diaryCard, dreamCard]) {
  assert.match(source, /delayLongPress=\{500\}/);
  assert.match(source, /event\.nativeEvent\.pageX/);
  assert.match(source, /event\.nativeEvent\.pageY/);
  assert.match(source, /AiVersionStepper/);
}
assert.match(chat, /AiAnchoredContextMenu/);
assert.match(chat, /label: ['"]重新生成['"]/);
assert.match(chat, /label: ['"]从聊天中移除['"]/);
assert.match(chat, /companionArtifactChatStateRepository\.hide/);
assert.doesNotMatch(chat, /role(?:Diaries|Dreams)\.splice/);
```

Add a pure timeline test that removes one artifact from the `artifacts` input and asserts all message item IDs and the surviving artifact’s ID/order remain unchanged.

- [ ] **Step 2: Run focused tests and verify failure**

```powershell
node --test tests/companion-artifact-card-actions-policy.test.cjs tests/companion-artifact-timeline-unit.test.cjs tests/role-diary-visibility-and-chat-entry-policy.test.cjs
```

Expected: FAIL because cards lack long press/version props and chat lacks artifact menu state.

- [ ] **Step 3: Extend both card component contracts**

Add these props to both cards:

```ts
versionIndex: number;
versionTotal: number;
onLongPress: (pageX: number, pageY: number) => void;
onPreviousVersion: () => void;
onNextVersion: () => void;
regenerating?: boolean;
```

On the completed-card `Pressable`, add:

```tsx
delayLongPress={500}
onLongPress={(event) => onLongPress(
  event.nativeEvent.pageX,
  event.nativeEvent.pageY,
)}
```

Render `AiVersionStepper` below the visual card only when `versionTotal > 1`. Keep diary context-choice controls below the stepper.

- [ ] **Step 4: Load complete groups and hidden state in `AiChatScreen`**

Replace flat diary/dream state with group state:

```ts
const [roleDiaryGroups, setRoleDiaryGroups] = useState<RoleDiaryVersionGroup[]>([]);
const [roleDreamGroups, setRoleDreamGroups] = useState<DreamVersionGroup[]>([]);
const [selectedArtifactVersionByGroupId, setSelectedArtifactVersionByGroupId] =
  useState<Record<string, string>>({});
```

Each reload must query groups and hidden IDs in the same `runWithDatabaseSpace` call, filter hidden groups before setting state, and default missing selections to each group’s current/latest version. Dream regeneration jobs with `targetVersionGroupId` must decorate their existing group as `regenerating`; they must not be emitted as independent `dreamJob` timeline entries.

- [ ] **Step 5: Build timeline entries with stable group IDs**

Construct entries from the selected version but keep group identity:

```ts
{
  createdAt: group.versions[0].createdAt,
  id: group.diary.id, // diary
  kind: 'diary',
  payload: { group, selectedVersion },
  sourceMessageIds: selectedVersionSourceIds,
}
```

For dreams, use `group.id` instead of a dream-version ID. Hidden groups must already be absent before `buildCompanionArtifactTimeline` is called. After a hide succeeds, call `reloadRoleDiaries` or `reloadRoleDreams`; do not splice `visibleMessageItems`, `roleDiaryGroups`, or `roleDreamGroups`.

- [ ] **Step 6: Add artifact context-menu state and actions**

Store `{ anchorX, anchorY, kind, groupId, versionId, createdAt }`. Render one `AiAnchoredContextMenu` with:

```ts
[
  {
    key: 'regenerate',
    icon: 'refresh-outline',
    label: '重新生成',
    disabled: regenerating,
    onPress: regenerateSelectedArtifact,
  },
  {
    key: 'remove-from-chat',
    icon: 'eye-off-outline',
    label: '从聊天中移除',
    onPress: hideSelectedArtifactGroup,
  },
]
```

Close the menu before mutation. On hide, await `companionArtifactChatStateRepository.hide`, then reload the complete collection. On regeneration, call `regenerateDiaryVersion` or `regenerateDreamVersion`; preserve old selection on failure and choose the latest version after the runtime completion reload.

- [ ] **Step 7: Make diary readers version-aware**

Extend the route and callbacks with optional `versionId`:

```ts
{ name: 'diary-reader'; space: PixorySpace; diaryId: string; versionId?: string }
onOpenDiary: (diaryId: string, versionId?: string) => void;
```

`DiaryReaderScreen` calls:

```ts
diaryRepository.findDiaryVersion(db, diaryId, versionId)
```

Dream versions already have distinct dream IDs; pass the selected dream ID to the existing dream route and reader.

- [ ] **Step 8: Run focused tests and typecheck**

```powershell
node --test tests/companion-artifact-card-actions-policy.test.cjs tests/companion-artifact-timeline-unit.test.cjs tests/role-diary-visibility-and-chat-entry-policy.test.cjs tests/ai-message-context-menu-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add -- App.tsx src/components/ai/DiaryChatCard.tsx src/components/ai/DreamChatCard.tsx src/screens/AiChatScreen.tsx src/screens/DiaryReaderScreen.tsx src/screens/DreamReaderScreen.tsx tests/companion-artifact-card-actions-policy.test.cjs tests/companion-artifact-timeline-unit.test.cjs tests/role-diary-visibility-and-chat-entry-policy.test.cjs
git commit -m "feat(chat): add versioned companion card actions" -m "What: add bubble-matched long-press menus, diary and dream version switching, selected-version readers, regeneration, and chat-only hiding with full timeline reloads. Why: card presentation must be controllable without damaging inner-life content or FlatList structure. Verification: card, timeline, diary visibility, context-menu tests and typecheck. Limitation: inner-life batch selection follows next."
```

### Task 8: Add current-tab multi-select permanent deletion to inner life

**Files:**
- Modify: `src/ai/thought/thoughtRepository.ts`
- Modify: `src/screens/CompanionInnerLifeScreen.tsx`
- Modify: `App.tsx`
- Create: `tests/companion-inner-life-selection-policy.test.cjs`
- Modify: `tests/companion-inner-life-layout.test.cjs`
- Modify: `tests/companion-artifact-version-lifecycle.test.cjs`

- [ ] **Step 1: Add failing batch-delete and selection tests**

Repository test:

```js
await thoughtRepository.permanentlyDeleteMany(db, ['thought-a', 'thought-b']);
assert.equal(db.db.prepare(
  `SELECT COUNT(*) AS count FROM companion_thoughts`,
).get().count, 0);
```

Policy test:

```js
assert.match(innerLife, /selectionKind/);
assert.match(innerLife, /selectedIds/);
assert.match(innerLife, /已选\s*\{selectedIds\.size\}\s*项/);
assert.match(innerLife, /永久删除所选/);
assert.match(innerLife, /setSelectedIds\(new Set\(\)\)/);
assert.match(innerLife, /permanentlyDeleteVersions/);
assert.match(innerLife, /permanentlyDeleteMany/);
assert.doesNotMatch(innerLife, /onLongPress=.*AiAnchoredContextMenu/);
```

- [ ] **Step 2: Run tests and verify failure**

```powershell
node --test tests/companion-inner-life-selection-policy.test.cjs tests/companion-inner-life-layout.test.cjs tests/companion-artifact-version-lifecycle.test.cjs
```

Expected: FAIL because selection and batch thought deletion are absent.

- [ ] **Step 3: Add atomic thought batch deletion**

Add:

```ts
export async function permanentlyDeleteThoughts(
  db: SQLiteDatabase,
  ids: string[],
): Promise<number> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length !== ids.length || uniqueIds.length === 0) return 0;
  let deleted = 0;
  await db.withTransactionAsync(async () => {
    const placeholders = uniqueIds.map(() => '?').join(',');
    const existing = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM companion_thoughts
       WHERE id IN (${placeholders})`,
      ...uniqueIds,
    );
    if (existing?.count !== uniqueIds.length) throw new Error('所选独白已发生变化，请刷新后重试。');
    const result = await db.runAsync(
      `DELETE FROM companion_thoughts WHERE id IN (${placeholders})`,
      ...uniqueIds,
    );
    deleted = Number(result.changes ?? 0);
  });
  return deleted;
}
```

Export it as `thoughtRepository.permanentlyDeleteMany` while keeping the existing single-delete method for compatibility.

- [ ] **Step 4: Load all inner-life versions**

Replace `listCurrentDiariesForRole` with `listVersionGroupsForRole`; flatten diary versions into separate display items. Use `dreamRepository.listVersionGroupsForRole` and flatten dream versions. Keep `thoughtRepository.listForRole(..., true)` so legacy soft-deleted thoughts remain visible and restorable.

- [ ] **Step 5: Implement current-tab selection state**

Use:

```ts
const [selectionKind, setSelectionKind] = useState<InnerLifeKind | null>(null);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

Long press calls `beginSelection(kind, id)`. While `selectionKind === activeKind`, normal press toggles the ID instead of opening. Changing `activeKind`, pressing cancel, leaving the screen, or reaching zero selections clears both state values.

The header becomes:

```tsx
{selectionKind ? (
  <>
    <Pressable onPress={clearSelection}><Text>取消</Text></Pressable>
    <Text>已选 {selectedIds.size} 项</Text>
    <Pressable onPress={confirmBatchDelete}><Text style={styles.danger}>删除</Text></Pressable>
  </>
) : (
  <>
    <Pressable accessibilityRole="button" onPress={onBack} style={styles.headerTouch}>
      <Text style={styles.back}>返回</Text>
    </Pressable>
    <Text style={styles.title}>内心独白</Text>
    <Pressable
      accessibilityLabel="刷新内心独白"
      accessibilityRole="button"
      onPress={() => void load()}
      style={styles.headerTouch}
    >
      <Text style={styles.back}>刷新</Text>
    </Pressable>
  </>
)}
```

Add a selected overlay/check icon to each entry without changing its list key.

- [ ] **Step 6: Execute one confirmed permanent-delete transaction per type**

The confirmation title must include the count. Dispatch by current kind:

```ts
if (selectionKind === 'diary') {
  await diaryRepository.permanentlyDeleteVersions(db, ids);
} else if (selectionKind === 'dream') {
  await dreamRepository.permanentlyDeleteVersions(db, ids);
} else {
  await thoughtRepository.permanentlyDeleteMany(db, ids);
}
```

On success clear selection and reload. On failure keep the selection and set the page error. Remove the dream card’s current visible one-tap soft-delete button. For legacy soft-deleted thoughts, keep the existing restore action outside selection mode.

- [ ] **Step 7: Open exact diary versions from inner life**

Call `onOpenDiary(diary.id, version.id)` for each diary-version entry and `onOpenDream(dream.id)` for each dream version. Label entries with `第 N 版`, where N is the display ordinal within the surviving sorted versions, not the immutable database number.

- [ ] **Step 8: Run tests and typecheck**

```powershell
node --test tests/companion-inner-life-selection-policy.test.cjs tests/companion-inner-life-layout.test.cjs tests/companion-artifact-version-lifecycle.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add -- App.tsx src/ai/thought/thoughtRepository.ts src/screens/CompanionInnerLifeScreen.tsx tests/companion-inner-life-selection-policy.test.cjs tests/companion-inner-life-layout.test.cjs tests/companion-artifact-version-lifecycle.test.cjs
git commit -m "feat(companion): batch-delete inner-life versions" -m "What: make diary, thought, and dream tabs enter current-tab multi-select on long press and permanently delete the confirmed selection atomically. Why: inner-life cleanup should be fast and bypass recycle-bin semantics. Verification: selection policy, layout, lifecycle tests and typecheck. Limitation: legacy soft-deleted thoughts retain their old restore action."
```

### Task 9: Update product inventory and run complete verification

**Files:**
- Modify: `docs/feature-matrix.md:3,39-40,90-91,103`
- Verify all files changed by Tasks 1-8.

- [ ] **Step 1: Update feature matrix entries**

Document all of the following in the existing rows rather than adding duplicate rows:

- diary and dream cards use the same anchored long-press menu as chat messages;
- regeneration appends switchable versions and uses frozen source;
- chat removal only changes chat presentation and rebuilds the full artifact timeline;
- inner life lists all versions and supports current-tab batch permanent deletion for diary, thought, and dream;
- only current diary/dream versions enter model context;
- V59 persists dream groups and chat visibility separately.

- [ ] **Step 2: Run focused artifact tests**

```powershell
node --test tests/companion-artifact-version-schema.test.cjs tests/companion-artifact-version-lifecycle.test.cjs tests/companion-artifact-card-actions-policy.test.cjs tests/companion-inner-life-selection-policy.test.cjs tests/companion-artifact-timeline-unit.test.cjs tests/companion-artifact-delivery-integration.test.cjs tests/companion-dream-repository-integration.test.cjs tests/role-diary-generation-policy.test.cjs tests/ai-message-context-menu-policy.test.cjs
```

Expected: PASS.

- [ ] **Step 3: Run project verification**

```powershell
pnpm typecheck
pnpm test
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Inspect schema and data-safety diff**

```powershell
git diff -- src/database/schema.ts src/database/db.ts src/ai/diary/diaryRepository.ts src/ai/dream/dreamRepository.ts src/ai/thought/thoughtRepository.ts src/ai/companion/companionArtifactChatStateRepository.ts
```

Expected: no source-message deletion, no chat-thread deletion, and no update that overwrites generated diary or dream bodies.

- [ ] **Step 5: Perform Android manual validation with real data**

Use an attached Android device or emulator and verify:

1. Long press a diary/dream card near the top and bottom of the viewport; the menu stays 5px from the finger and avoids safe areas.
2. Regenerate each type; `1/2` appears, arrows open the selected content, and old content remains in inner life.
3. Remove a middle timeline card; source and following messages, date separators, scroll order, and other cards remain correct after reload and app restart.
4. Long press each inner-life tab, select multiple entries, cancel, switch tabs, and confirm permanent deletion.
5. Force one regeneration failure; old version and selection remain available.

Record any unavailable device check explicitly; do not claim Android validation without a device result.

- [ ] **Step 6: Commit documentation or final verification adjustments**

```powershell
git add -- docs/feature-matrix.md
git commit -m "docs(companion): record artifact version controls" -m "What: document versioned chat cards, chat-only hiding, current-version context, and inner-life batch permanent deletion. Why: the feature matrix must match the shipped data and UI capabilities. Verification: full typecheck, test suite, diff check, and recorded Android validation. Limitation: any unavailable device check is stated in the task report."
```

### Task 10: Prepare the OTA handoff without publishing automatically

**Files:**
- No source changes expected.

- [ ] **Step 1: Inspect final repository state and commit scopes**

```powershell
git status --short --branch
git log --oneline -10
```

Expected: only intentional unrelated user changes remain; each feature commit maps to one task.

- [ ] **Step 2: Report OTA readiness**

Report the migration version, tests, Android result, commits, remaining dirty files, and that the app listens to the EAS `production` branch. Do not run `eas update` until the user explicitly requests the hot update after reviewing the completed implementation.
