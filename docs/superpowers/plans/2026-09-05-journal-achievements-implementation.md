# Journal Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the About page's “岁月有声” chapter-based achievement experience with evidence-backed triggers, invalidation/rebinding, unread dots, one-open achievement detail, accurate navigation, and a compact fixed return affordance.

**Architecture:** Keep `故事开始` as the existing introduction. Add a space-scoped journal achievement projection service that evaluates the 32 defined achievement rules in one bounded database session, persists idempotent source/read metadata, and returns only currently valid achievements grouped by category. Keep UI state separate: a `Set` of expanded category IDs allows multiple categories to remain open, while one nullable achievement ID controls the single open detail.

**Tech Stack:** Expo, React Native, TypeScript, Expo SQLite, Reanimated, existing Pixory route callbacks and design tokens, Node built-in test runner.

---

### Task 1: Add the journal achievement persistence migration

**Files:**
- Modify: `src/database/schema.ts`
- Modify: `src/database/db.ts`
- Test: `tests/journal-achievement-schema-policy.test.cjs`

- [ ] **Step 1: Write the failing schema policy test**

Assert that the next migration creates `journal_achievements`, includes `space`, `achievementId`, `occurredAt`, `unlockedAt`, `readAt`, `sourceType`, `sourceId`, `sourcePayload`, `createdAt`, and `updatedAt`, and adds a unique `(space, achievementId)` constraint plus an index for `(space, category, readAt)`.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
pnpm test -- tests/journal-achievement-schema-policy.test.cjs
```

Expected: FAIL because the migration and policy test do not exist yet.

- [ ] **Step 3: Implement the migration**

Increment `DATABASE_VERSION` to 63. Add `MIGRATION_STATEMENTS_V63` with:

```sql
CREATE TABLE IF NOT EXISTS journal_achievements (
  id INTEGER PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  achievementId TEXT NOT NULL,
  category TEXT NOT NULL,
  occurredAt TEXT NOT NULL,
  unlockedAt TEXT NOT NULL,
  readAt TEXT,
  sourceType TEXT NOT NULL,
  sourceId TEXT,
  sourcePayload TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(space, achievementId)
);

CREATE INDEX IF NOT EXISTS idx_journal_achievements_space_category_read
  ON journal_achievements(space, category, readAt);
```

Register V63 in the ordered migration runner in `src/database/db.ts`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
pnpm test -- tests/journal-achievement-schema-policy.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/database/schema.ts src/database/db.ts tests/journal-achievement-schema-policy.test.cjs
git commit -m "feat: add journal achievement storage"
```

### Task 2: Create pure achievement definitions and trigger evaluators

**Files:**
- Create: `src/services/journalAchievementDefinitions.ts`
- Create: `src/services/journalAchievementRules.ts`
- Test: `tests/journal-achievement-rules.test.cjs`

- [ ] **Step 1: Write failing rule tests**

Cover these concrete behaviors:

```js
test('deep-night-light requires 20 valid rounds between 01:00 and 04:00 local time', () => {});
test('long-conversation requires 25 rounds inside one hour with no gap over three minutes', () => {});
test('between-two-days crosses a local date while preserving the same one-hour three-minute session rule', () => {});
test('week-has-voice requires seven consecutive dates with at least three rounds per date', () => {});
test('threshold achievements use current valid counts and do not count deleted rows', () => {});
test('achievement definitions have stable ids, short display copy, and route metadata', () => {});
```

Use fixture records shaped like completed user/assistant message pairs, image rows, memory rows, IP rows, branch rows, diary/dream rows, and material rows. Do not import the React Native screen into the rule tests.

- [ ] **Step 2: Run the focused tests and confirm expected failures**

Run:

```powershell
pnpm test -- tests/journal-achievement-rules.test.cjs
```

Expected: FAIL because the definitions and evaluator functions are absent.

- [ ] **Step 3: Implement the definitions**

Export the 32 definitions with the final display names:

```ts
type JournalAchievementCategory =
  | 'journey'
  | 'connection'
  | 'time'
  | 'world'
  | 'organize';

type JournalAchievementDefinition = {
  id: string;
  category: JournalAchievementCategory;
  title: string;
  description: string;
  requirement: string;
  sourceType: string;
  routeKind: string;
};
```

Keep `requirement` short because it is only shown after the user taps an achievement.

- [ ] **Step 4: Implement deterministic trigger helpers**

Implement local-time conversion, valid-round grouping, continuous-session detection, consecutive-date detection, threshold evaluation, and candidate-source selection. The evaluators must return source IDs and both `occurredAt` and `unlockedAt` candidates, not only booleans.

- [ ] **Step 5: Run the focused tests and verify they pass**

Run:

```powershell
pnpm test -- tests/journal-achievement-rules.test.cjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/services/journalAchievementDefinitions.ts src/services/journalAchievementRules.ts tests/journal-achievement-rules.test.cjs
git commit -m "feat: define journal achievement rules"
```

### Task 3: Build the space-scoped achievement projection and invalidation flow

**Files:**
- Create: `src/services/journalAchievementService.ts`
- Modify: `src/services/milestoneService.ts`
- Modify: `src/database/databaseSpaceRegistry.ts` or the existing data epoch invalidation module selected after inspection
- Test: `tests/journal-achievement-projection.test.cjs`

- [ ] **Step 1: Write failing projection tests**

Cover:

```js
test('projection creates an unread achievement once after a qualifying source exists', () => {});
test('projection keeps multiple categories and returns only valid unlocked entries', () => {});
test('deleted source rebinds a first-source achievement to the next valid source', () => {});
test('deleted thread or IP removes an invalid source and hides the achievement when no replacement exists', () => {});
test('threshold counts update after deletion and hide below threshold', () => {});
test('normal and personal projections remain isolated', () => {});
test('marking an achievement read changes readAt without changing validity', () => {});
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run:

```powershell
pnpm test -- tests/journal-achievement-projection.test.cjs
```

Expected: FAIL because the projection service is absent.

- [ ] **Step 3: Implement one-query-bundle projection**

The service should expose:

```ts
export type JournalAchievementProjection = {
  categories: JournalAchievementCategoryView[];
  unreadCategoryIds: string[];
  generatedAt: number;
};

export async function getJournalAchievementProjection(
  space: PixorySpace,
  options?: { forceRefresh?: boolean }
): Promise<JournalAchievementProjection>;

export async function markJournalAchievementRead(
  space: PixorySpace,
  achievementId: string
): Promise<void>;
```

Load required aggregates and bounded candidate rows in one `runWithDatabaseSpace` call. Upsert valid source bindings idempotently, update source/occurred time on rebinding, hide invalid records from the returned projection, and do not write `readAt` during refresh.

- [ ] **Step 4: Invalidate the projection on relevant data changes**

Use the existing space data epoch/cache invalidation mechanism. Structural changes to messages, threads, branches, memories, diaries, dreams, documents/materials, roles, IPs, groups, tags, favorites, or assets must invalidate the About projection for the affected space. Do not add a polling loop.

- [ ] **Step 5: Run the focused tests and verify they pass**

Run:

```powershell
pnpm test -- tests/journal-achievement-projection.test.cjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/services/journalAchievementService.ts src/services/milestoneService.ts src/database/databaseSpaceRegistry.ts tests/journal-achievement-projection.test.cjs
git commit -m "feat: project valid journal achievements"
```

### Task 4: Add route resolution and safe invalid-target handling

**Files:**
- Modify: `src/screens/MilestonesDetailScreen.tsx`
- Modify: the app route dispatcher file found by the existing `onPushRoute` implementation
- Modify: `src/navigation/routes.ts` only if typed route names need to be extended
- Test: `tests/journal-achievement-navigation.test.cjs`

- [ ] **Step 1: Write failing navigation tests**

Cover image/video detail, first conversation anchor, memory blackboard, diary, dream, branch tree, IP detail, document/knowledge-base detail, role card, group, tag results, all assets, and safe handling for deleted targets.

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run:

```powershell
pnpm test -- tests/journal-achievement-navigation.test.cjs
```

Expected: FAIL for routes not currently accepted by the About page.

- [ ] **Step 3: Implement a single source-to-route resolver**

Keep route construction outside `AboutScreen`. For each source, verify the target exists in the current `space` before routing. If it is invalid, return a refresh signal instead of navigating to a placeholder or another space.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```powershell
pnpm test -- tests/journal-achievement-navigation.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/screens/MilestonesDetailScreen.tsx src/navigation/routes.ts tests/journal-achievement-navigation.test.cjs
git commit -m "feat: route journal achievement sources safely"
```

### Task 5: Refactor AboutScreen into chapter panels

**Files:**
- Create: `src/components/about/JournalAchievementChapter.tsx`
- Create: `src/components/about/JournalAchievementRow.tsx`
- Modify: `src/screens/AboutScreen.tsx`
- Test: `tests/about-journal-achievements-ui.test.cjs`

- [ ] **Step 1: Write failing UI policy tests**

Assert that:

```js
test('AboutScreen keeps 故事开始 separate from 岁月有声', () => {});
test('multiple categories can remain expanded at the same time', () => {});
test('only one achievement detail can be open at a time', () => {});
test('clicking an achievement clears its unread dot and reveals concise requirement text', () => {});
test('category dots reflect unread child achievements without adding verbose labels', () => {});
test('the return affordance is fixed in the scaffold header and does not scroll with content', () => {});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
pnpm test -- tests/about-journal-achievements-ui.test.cjs
```

Expected: FAIL because the current screen still uses one fixed timeline and a scrolling floating back button.

- [ ] **Step 3: Implement chapter UI**

Use the existing design tokens. Render:

- `故事开始` unchanged;
- `岁月有声` as the existing primary node renamed from `最初的印记`;
- category chapters with small low-contrast dots;
- achievement rows with smaller dots, concise dates, and source affordances;
- one inline detail panel at a time;
- no card-inside-card nesting and no dense list separators.

Each achievement row must use a stable three-column layout:

```text
[new dot]  achievement title          date          [arrow or reserved space]
```

Do not render emojis, thumbnails, or decorative images in achievement rows. Keep the right action column width reserved when an achievement has no route so neighboring rows remain aligned. The concise requirement text appears only after tapping the achievement name, not as a permanent row label.

Maintain:

```ts
const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(new Set());
const [openAchievementId, setOpenAchievementId] = useState<string | null>(null);
```

Clicking a category toggles only that category. Clicking another achievement replaces `openAchievementId` and first closes the previous detail through the same state transition. Calling `markJournalAchievementRead` happens only after the achievement has been opened or its source navigation has been accepted.

- [ ] **Step 4: Integrate refresh and invalid-target recovery**

After returning from a source route, and after a source navigation reports invalid, refresh the projection without replaying the page entrance animation. Keep the current category expansion set when the achievement still exists; remove only missing categories/achievements from local UI state.

- [ ] **Step 5: Redesign the return affordance**

Move the back press target into the fixed `ScreenScaffold` header region. Keep at least `metrics.minTouchSize`, use a transparent or paper-colored surface with no large white square, and retain a small chevron plus `Haptics.Light`. It must not be a child of the scroll content.

- [ ] **Step 6: Run the focused UI policy test and verify it passes**

Run:

```powershell
pnpm test -- tests/about-journal-achievements-ui.test.cjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/components/about/JournalAchievementChapter.tsx src/components/about/JournalAchievementRow.tsx src/screens/AboutScreen.tsx tests/about-journal-achievements-ui.test.cjs
git commit -m "feat: redesign About journal chapters"
```

### Task 6: Update the feature matrix and run full verification

**Files:**
- Modify: `docs/feature-matrix.md`
- Test: all focused tests from Tasks 1-5

- [ ] **Step 1: Update the feature matrix**

Update the “陪伴手帐与数据面板” row to describe the 32-rule “岁月有声” achievement projection, source-safe navigation, unread dots, invalidation/rebinding behavior, and the remaining Android device validation boundary.

- [ ] **Step 2: Run the full checks**

Run:

```powershell
pnpm typecheck
pnpm test
git diff --check
```

Expected: TypeScript exits 0, tests report no failures, and `git diff --check` produces no output.

- [ ] **Step 3: Run Android visual verification**

Use an available emulator/device and verify:

- About page first render and refresh;
- multiple chapter expansion;
- one achievement detail at a time;
- unread dot removal after tap;
- memory/thread/IP deletion followed by refresh;
- normal/personal separation;
- fixed back affordance while scrolling.

- [ ] **Step 4: Commit the feature matrix update**

```powershell
git add docs/feature-matrix.md
git commit -m "docs: track journal achievement feature"
```

Expected: the commit contains only the feature matrix update.
