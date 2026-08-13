# AI Chat P0/P1 Runtime Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the approved P0/P1 chat runtime optimizations for history paging, initial loading, streaming publication, generation settlement, and redundant SQLite work without changing attachment handling or migrating the list library.

**Architecture:** Keep the current inverted `FlatList`, branch-route model, recoverable generation contract, and SQLite ownership. Add a stable keyset message-page boundary, make route snapshots authoritative when their lineage and thread revision are current, publish streaming snapshots independently from persistence, and defer only the non-critical remote model-title pass through a per-thread serial queue.

**Tech Stack:** Expo 54, React Native 0.81, React 19, TypeScript 5.9, Expo SQLite, Node `node:test`, `node:sqlite`, existing generation metrics, Android Perfetto/ADB.

---

## Scope

Included:

- P0: replace cumulative history reloads with cursor-based incremental paging.
- P0: ensure every published streaming patch contains all characters counted as published.
- P0: prevent remote model-title generation from extending the foreground generation task.
- P1: remove the unconditional full reload after a valid prefetched route snapshot.
- P1: remove the message-count query from route snapshot loading by fetching `limit + 1`.
- P1: remove duplicate message/continuity reloads after generation and buffered-tail settlement.
- P1: load the recent-thread drawer only when it is opened.
- P1: defer non-critical memory-capture loading until after initial interactions.
- P1: serialize participant appearance reads on the shared Expo SQLite connection.
- P1: update performance regression coverage and the feature matrix.

Explicitly excluded:

- Image attachment count, size, Base64, upload-preview, or network-payload changes.
- FlashList migration, `inverted` removal, clipping-policy changes, or message-bubble redesign.
- Provider retry/fallback policy and provider stream-parser rewrites.
- Message citation/attachment JSON aggregation and broad repository restructuring.
- Schema-version bump or a new message index. The existing `(threadId, createdAt)` index remains; keyset queries use `id` only as the equal-timestamp tie breaker.
- Changes to Personal-space isolation, generation recovery, branch semantics, prompt assembly, memory policy, or original asset storage.

## Preconditions and assumptions

- The current main worktree contains unrelated, uncommitted UI changes in `AiChatScreen.tsx`, `AiRoleCardEditorScreen.tsx`, `AiSessionConfigScreen.tsx`, `MeScreen.tsx`, and `AiAvatarPicker.tsx`. Do not stash, overwrite, or commit them as part of this plan.
- Execute in a dedicated short-path worktree from the intended integration commit. Recommended path: `D:\px-chat-perf` and branch `codex/ai-chat-p0-p1-performance`.
- `createdAt` is the primary message ordering key. `id` becomes the deterministic tie breaker everywhere used by initial, anchored, and older-page queries.
- Branch-root support messages loaded outside a page are hydration dependencies, not cursor boundaries. The cursor must be derived from the base page before branch roots are added.
- A valid prefetch may be used without a second full load only when both `lineageVersion` and `thread.updatedAt` still match.
- The final message patch already contains terminal status, content, reasoning, prompt snapshot, model identity, completion time, and citations. An attached live stream therefore does not require an immediate canonical full-message reload.
- The buffered/read-history path must retain its canonical reload before committing the final tail.

## Success criteria

- Loading one older page issues a bounded page query and hydrates only that page plus required branch roots; it never refetches the already loaded 60/120/180-message window.
- `hasEarlierMessages` is exact when the visible base-message count equals the page size.
- Messages with identical `createdAt` values are neither skipped nor duplicated across pages.
- A current prefetch performs one lightweight revision validation but no immediate `reloadMessages()` call and no `COUNT(*)` query.
- The first non-empty provider delta produces a non-empty UI patch even when persistence drains pending chunks first.
- The scheduled UI flush still publishes text when pending arrays are empty but committed text is newer than the last published counters.
- Normal terminal settlement performs no full thread-message reload; the buffered read-history path still performs exactly one.
- Remote model-title generation runs serially per thread after the foreground reply task can settle, and failures remain non-fatal.
- Recent threads are not queried while the record drawer is closed.
- Typecheck, focused tests, full tests, diff checks, benchmark, and Android scenarios pass from a clean implementation worktree.

## File map

**Create:**

- `src/ai/aiPostReplyTaskQueue.ts` — small per-space/thread serial queue for non-critical post-reply work.
- `src/ai/aiThreadPresentationEvents.ts` — generation-independent title/presentation invalidation subscription.
- `tests/ai-post-reply-task-queue-unit.test.cjs` — queue ordering, isolation, and failure-containment tests.
- `tests/ai-thread-presentation-events-unit.test.cjs` — thread/space-scoped notification tests.
- `tests/ai-chat-message-pagination-integration.test.cjs` — SQLite keyset-page boundary, tie-break, branch-scope, and `hasMore` tests.

**Modify:**

- `src/database/repositories/aiThreadRepository.ts` — deterministic `(createdAt, id)` ordering and older-than-cursor base query.
- `src/ai/aiChatService.ts` — page result API, shared page hydration, streaming publication fix, and deferred remote model-title scheduling.
- `src/ai/aiThreadRouteSnapshotService.ts` — `limit + 1` page loading, older cursor, and revision-aware prefetch validation.
- `src/screens/AiChatScreen.tsx` — cursor state, incremental merge, current-prefetch adoption, lazy secondary reads, and terminal reload removal.
- `tests/ai-thread-history-projection-policy.test.cjs` — deterministic initial/older page repository behavior.
- `tests/ai-chat-route-loading-policy.test.cjs` — snapshot revision, cursor, exact `hasMore`, and no unconditional refresh contracts.
- `tests/ai-chat-streaming-runtime-policy.test.cjs` — UI flush ordering and unpublished-character timer contract.
- `tests/ai-chat-performance-hardening-policy.test.cjs` — no attached-stream terminal full reload and lazy secondary-query contracts.
- `tests/ai-final-acceptance-policy.test.cjs` — model-title work is awaited inside the deferred queue task rather than the foreground generation path.
- `docs/feature-matrix.md` — record cursor paging, revision-checked prefetch, decoupled streaming publication, and deferred title finalization coverage.

## Task 1: Establish a clean isolated baseline

**Files:**

- No source changes.

- [ ] **Step 1: Reconfirm the user worktree before creating isolation**

Run from `D:\Project\Pixory\pixory`:

```powershell
git status --short --branch
git log -5 --oneline --decorate
```

Expected: all user-owned modified/untracked files are recorded in the task log and left untouched.

- [ ] **Step 2: Create the implementation worktree**

Run only after confirming `D:\px-chat-perf` does not already exist:

```powershell
Test-Path -LiteralPath 'D:\px-chat-perf'
git worktree add -b codex/ai-chat-p0-p1-performance D:\px-chat-perf HEAD
```

Expected: `Test-Path` prints `False`; Git creates the worktree without changing the main worktree.

- [ ] **Step 3: Install and run the baseline**

Run from `D:\px-chat-perf`:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
node --test tests/ai-thread-history-projection-policy.test.cjs tests/ai-chat-route-loading-policy.test.cjs tests/ai-chat-streaming-runtime-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-final-acceptance-policy.test.cjs
pnpm bench:ai-chat
```

Expected: install, typecheck, and focused tests exit 0; benchmark emits JSON. Record benchmark values but do not turn Node timing into a release gate.

- [ ] **Step 4: Stop if the isolated baseline is not clean**

If a focused test fails before source changes, record the exact failure and determine whether the selected worktree base omitted required UI work. Do not weaken a test merely to establish green.

## Task 2: Add deterministic repository cursor paging

**Files:**

- Modify: `src/database/repositories/aiThreadRepository.ts:3843-3871`
- Modify: `tests/ai-thread-history-projection-policy.test.cjs`
- Create: `tests/ai-chat-message-pagination-integration.test.cjs`

- [ ] **Step 1: Write failing equal-timestamp and multi-page tests**

In `tests/ai-chat-message-pagination-integration.test.cjs`, reuse the TypeScript loader and in-memory SQLite adapter from `tests/ai-thread-history-projection-policy.test.cjs`. Add this page assertion after inserting `message-a` through `message-e` with the same `createdAt`:

```js
test('older message pages use createdAt and id without gaps or duplicates', async () => {
  const db = createDatabaseWithFiveEqualTimestampMessages();
  const repository = loadRepository();

  const latest = await repository.listMessagesBase(db, 'paged-thread', 3, []);
  assert.deepEqual(latest.map((message) => message.id), [
    'message-c',
    'message-d',
    'message-e',
  ]);

  const older = await repository.listMessagesBaseBefore(
    db,
    'paged-thread',
    { createdAt: latest[0].createdAt, id: latest[0].id },
    3,
    [],
  );
  assert.deepEqual(older.map((message) => message.id), [
    'message-a',
    'message-b',
  ]);
  assert.deepEqual(
    new Set([...older, ...latest].map((message) => message.id)).size,
    5,
  );
  db.close();
});
```

Define the fixture used above in the same file:

```js
function createDatabaseWithFiveEqualTimestampMessages() {
  const db = new AsyncDatabase();
  createHistorySchema(db);
  insertThread(db, 'paged-thread');
  for (const suffix of ['a', 'b', 'c', 'd', 'e']) {
    insertMessage(db, {
      id: `message-${suffix}`,
      threadId: 'paged-thread',
      role: suffix === 'a' ? 'user' : 'assistant',
      content: suffix,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  }
  return db;
}
```

Copy `AsyncDatabase`, `createHistorySchema`, `insertThread`, `insertMessage`, and `loadRepository` exactly from `tests/ai-thread-history-projection-policy.test.cjs` so the new test executes the production repository. Add this branch case:

```js
test('older message pages keep sibling branches outside the adopted route', async () => {
  const db = new AsyncDatabase();
  createHistorySchema(db);
  insertThread(db, 'branch-thread');
  insertMessage(db, { id: 'main-a', threadId: 'branch-thread', role: 'user', content: 'a', createdAt: '2026-01-01T00:00:00.000Z' });
  insertMessage(db, { id: 'root', threadId: 'branch-thread', role: 'assistant', content: 'root', createdAt: '2026-01-02T00:00:00.000Z' });
  insertMessage(db, { id: 'selected', threadId: 'branch-thread', root: 'root', version: 2, role: 'assistant', content: 'selected', createdAt: '2026-01-03T00:00:00.000Z' });
  insertMessage(db, { id: 'hidden', threadId: 'branch-thread', root: 'root', version: 1, role: 'assistant', content: 'hidden', createdAt: '2026-01-04T00:00:00.000Z' });
  const repository = loadRepository();
  const page = await repository.listMessagesBase(db, 'branch-thread', 4, [
    { branchRootMessageId: 'root', branchVersionIndex: 2 },
  ]);
  assert.deepEqual(page.map((message) => message.id), ['main-a', 'root', 'selected']);
  assert.equal(page.some((message) => message.id === 'hidden'), false);
  db.close();
});
```

- [ ] **Step 2: Run the new test and verify failure**

```powershell
node --test tests/ai-chat-message-pagination-integration.test.cjs
```

Expected: FAIL because `listMessagesBaseBefore` does not exist.

- [ ] **Step 3: Define the cursor contract and older query**

Add near `AiBranchScope` in `aiThreadRepository.ts`:

```ts
export interface AiMessagePageCursor {
  createdAt: string;
  id: string;
}
```

Change the limited and unlimited `listMessagesBase` ordering to `createdAt, id`, then add this repository method immediately after it:

```ts
async listMessagesBaseBefore(
  db: SQLiteDatabase,
  threadId: string,
  cursor: AiMessagePageCursor,
  limit: number,
  branchScopes?: AiBranchScope[],
): Promise<AiMessageRecord[]> {
  const visibleBranchClause = buildVisibleBranchClause('ai_messages', branchScopes);
  return db.getAllAsync<AiMessageRecord>(
    `SELECT * FROM (
       SELECT * FROM ai_messages
       WHERE threadId = ?
         ${visibleBranchClause.clause}
         AND ${excludeRolledBackContinuityPayload('ai_messages')}
         AND (
           createdAt < ?
           OR (createdAt = ? AND id < ?)
         )
       ORDER BY createdAt DESC, id DESC
       LIMIT ?
     )
     ORDER BY createdAt ASC, id ASC`,
    threadId,
    ...visibleBranchClause.values,
    cursor.createdAt,
    cursor.createdAt,
    cursor.id,
    Math.max(1, limit),
  );
},
```

The limited latest query must use:

```sql
ORDER BY createdAt DESC, id DESC
LIMIT ?
)
ORDER BY createdAt ASC, id ASC
```

The unlimited query must use `ORDER BY createdAt ASC, id ASC`.

- [ ] **Step 4: Replace the old rowid policy assertion**

Update `tests/ai-chat-route-loading-policy.test.cjs` and `tests/ai-thread-history-projection-policy.test.cjs` with:

```js
assert.match(listMessagesBase, /ORDER BY createdAt DESC, id DESC/);
assert.match(listMessagesBase, /ORDER BY createdAt ASC, id ASC/);
assert.doesNotMatch(listMessagesBase, /rowid AS rowOrder/);
assert.doesNotMatch(listMessagesBase, /ORDER BY createdAt DESC, rowid DESC/);
```

- [ ] **Step 5: Run repository tests**

```powershell
node --test tests/ai-chat-message-pagination-integration.test.cjs tests/ai-thread-history-projection-policy.test.cjs tests/ai-chat-route-loading-policy.test.cjs
```

Expected: PASS; equal timestamps cover all five IDs exactly once and hidden sibling branches never appear.

- [ ] **Step 6: Commit repository paging**

```powershell
git add src/database/repositories/aiThreadRepository.ts tests/ai-chat-message-pagination-integration.test.cjs tests/ai-thread-history-projection-policy.test.cjs tests/ai-chat-route-loading-policy.test.cjs
git commit -m "perf(chat): add deterministic message cursors" -m "What: use createdAt/id ordering and add an older-than-cursor base query. Why: loading earlier history must not refetch the entire loaded window or lose equal-timestamp messages. Verification: pagination, projection, and route-loading tests. Limitation: no schema/index change; Android query timing remains to be measured."
```

## Task 3: Add an exact `limit + 1` message-page service

**Files:**

- Modify: `src/ai/aiChatService.ts:590-595,2581-2655`
- Modify: `src/ai/aiThreadRouteSnapshotService.ts`
- Modify: `tests/ai-chat-message-pagination-integration.test.cjs`
- Modify: `tests/ai-chat-route-loading-policy.test.cjs`

- [ ] **Step 1: Write failing page-result tests**

Extend the pagination integration test with a service-level page fixture that asserts:

```js
assert.equal(firstPage.hasEarlierMessages, true);
assert.equal(firstPage.messages.length, 3);
assert.deepEqual(firstPage.olderCursor, {
  createdAt: firstPage.messages[0].createdAt,
  id: firstPage.messages[0].id,
});
assert.equal(secondPage.hasEarlierMessages, false);
assert.deepEqual(secondPage.messages.map((message) => message.id), [
  'message-a',
  'message-b',
]);
```

Add an exact-page-size case with three total messages and limit three; `hasEarlierMessages` must be `false`.

- [ ] **Step 2: Run the tests and verify failure**

```powershell
node --test tests/ai-chat-message-pagination-integration.test.cjs tests/ai-chat-route-loading-policy.test.cjs
```

Expected: FAIL because the service page API and `olderCursor` snapshot field are absent.

- [ ] **Step 3: Add page types and shared hydration**

Add to `aiChatService.ts`:

```ts
export interface AiThreadMessagePage {
  baseMessageCount: number;
  hasEarlierMessages: boolean;
  messages: AiMessageWithCitations[];
  olderCursor: AiMessagePageCursor | null;
}

export interface LoadThreadMessagePageOptions extends ListThreadMessagesOptions {
  beforeCursor?: AiMessagePageCursor;
  limit: number;
}
```

Extract the existing branch-root, version-total, citation, attachment, and selected-version work into:

```ts
async function hydrateThreadMessagesInDatabase(
  db: SQLiteDatabase,
  threadId: string,
  baseMessages: AiMessageRecord[],
  selectedVersionByMessageId?: Record<string, number>,
): Promise<AiMessageWithCitations[]> {
  const messagesWithBranchRoots = await loadBranchRootMessages(
    db,
    threadId,
    baseMessages,
  );
  const messageIds = messagesWithBranchRoots.map((message) => message.id);
  const versionTotalsByMessageId =
    await aiThreadRepository.listMessageVersionTotalsForMessages(db, messageIds);
  const citationsByMessageId =
    await aiThreadRepository.listCitationsForMessages(db, messageIds);
  const attachmentsByMessageId =
    await aiThreadRepository.listAttachmentsForMessages(db, messageIds);
  const selectedVersionEntries = messagesWithBranchRoots
    .map((message) => {
      const versionTotal = versionTotalsByMessageId[message.id] ?? 1;
      const selectedVersionIndex = selectedVersionByMessageId?.[message.id];
      if (!selectedVersionIndex || selectedVersionIndex >= versionTotal) {
        return null;
      }
      return { messageId: message.id, versionIndex: selectedVersionIndex };
    })
    .filter((selection): selection is {
      messageId: string;
      versionIndex: number;
    } => Boolean(selection));
  const selectedVersionsByMessageId = selectedVersionEntries.length > 0
    ? await aiThreadRepository.listMessageVersionsByIndexForMessages(
        db,
        selectedVersionEntries,
      )
    : {};
  return messagesWithBranchRoots.map((message) => {
    const versionTotal = versionTotalsByMessageId[message.id] ?? 1;
    const selectedVersion = selectedVersionsByMessageId[message.id] ?? null;
    return {
      ...message,
      attachments: attachmentsByMessageId[message.id] ?? [],
      citations: citationsByMessageId[message.id] ?? [],
      messageVersions: selectedVersion ? [selectedVersion] : [],
      versionIndex: selectedVersion?.versionIndex ?? versionTotal,
      versionTotal,
    };
  });
}
```

Keep these repository calls sequential; Expo SQLite prepared statements on the shared connection must not be placed in `Promise.all`.

- [ ] **Step 4: Implement the bounded page loader**

Add:

```ts
export async function loadThreadMessagePageInDatabase(
  db: SQLiteDatabase,
  threadId: string,
  options: LoadThreadMessagePageOptions,
): Promise<AiThreadMessagePage> {
  const limit = Math.max(1, options.limit);
  const candidates = options.beforeCursor
    ? await aiThreadRepository.listMessagesBaseBefore(
        db,
        threadId,
        options.beforeCursor,
        limit + 1,
        options.branchScopes,
      )
    : await aiThreadRepository.listMessagesBase(
        db,
        threadId,
        limit + 1,
        options.branchScopes,
      );
  const hasEarlierMessages = candidates.length > limit;
  const baseMessages = hasEarlierMessages ? candidates.slice(1) : candidates;
  const oldest = baseMessages[0] ?? null;
  return {
    baseMessageCount: baseMessages.length,
    hasEarlierMessages,
    messages: await hydrateThreadMessagesInDatabase(
      db,
      threadId,
      baseMessages,
      options.selectedVersionByMessageId,
    ),
    olderCursor: oldest ? { createdAt: oldest.createdAt, id: oldest.id } : null,
  };
}

export async function loadThreadMessagePage(
  space: PixorySpace,
  threadId: string,
  options: LoadThreadMessagePageOptions,
): Promise<AiThreadMessagePage> {
  return runWithDatabaseSpace(space, (db) =>
    loadThreadMessagePageInDatabase(db, threadId, options),
  );
}
```

Keep `listThreadMessagesInDatabase` and `listThreadMessages` for non-page callers, but make them reuse `hydrateThreadMessagesInDatabase`.

- [ ] **Step 5: Make route snapshots use the page result and remove `COUNT(*)`**

Update `AiAdoptedThreadRouteSnapshot`:

```ts
baseMessageCount: number;
olderCursor: AiMessagePageCursor | null;
threadUpdatedAt: string;
```

Replace the message-plus-count block with an anchored compatibility branch and the bounded latest-page path:

```ts
const page = input.anchorMessageId
  ? null
  : await loadThreadMessagePageInDatabase(db, input.threadId, {
      branchScopes,
      limit: input.limit,
      selectedVersionByMessageId,
    });
const anchoredMessages = input.anchorMessageId
  ? await listThreadMessagesInDatabase(db, input.threadId, {
      anchorMessageId: input.anchorMessageId,
      branchScopes,
      limit: input.limit,
      selectedVersionByMessageId,
    })
  : null;
return {
  baseMessageCount: page?.baseMessageCount
    ?? Math.min(input.limit, anchoredMessages?.length ?? 0),
  branchScopes,
  hasEarlierMessages: Boolean(input.anchorMessageId) || Boolean(page?.hasEarlierMessages),
  lineageVersion: thread.lineageVersion ?? 0,
  messages: page?.messages ?? anchoredMessages ?? [],
  olderCursor: page?.olderCursor ?? null,
  routeHash: hashBranchRoute(branchScopes),
  selectedVersionByMessageId,
  thread,
  threadId: input.threadId,
  threadUpdatedAt: thread.updatedAt,
};
```

Remove the call to `countMessagesBase` from this path.

- [ ] **Step 6: Strengthen prefetch currentness**

Change `isAdoptedThreadRouteSnapshotCurrent` to require:

```ts
return Boolean(
  thread
  && thread.space === snapshot.thread.space
  && (thread.lineageVersion ?? 0) === snapshot.lineageVersion
  && thread.updatedAt === snapshot.threadUpdatedAt
);
```

- [ ] **Step 7: Run page and snapshot tests**

```powershell
node --test tests/ai-chat-message-pagination-integration.test.cjs tests/ai-chat-route-loading-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs
```

Expected: PASS; source policy confirms no `countMessagesBase` in snapshot loading.

- [ ] **Step 8: Commit the page service**

```powershell
git add src/ai/aiChatService.ts src/ai/aiThreadRouteSnapshotService.ts tests/ai-chat-message-pagination-integration.test.cjs tests/ai-chat-route-loading-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs
git commit -m "perf(chat): return exact bounded message pages" -m "What: add limit-plus-one page results, cursors, and revision-aware route snapshots. Why: avoid COUNT queries and distinguish exact page boundaries. Verification: message pagination, route loading, and performance policy tests. Limitation: anchored search loading remains on its existing specialized path."
```

## Task 4: Replace cumulative history reloads with incremental merging

**Files:**

- Modify: `src/screens/AiChatScreen.tsx:706-711,952,1508-1511,3527-3617,3804-3814,4338-4392`
- Modify: `tests/ai-chat-route-loading-policy.test.cjs`
- Modify: `tests/ai-chat-performance-hardening-policy.test.cjs`

- [ ] **Step 1: Write failing screen contracts**

Add policy assertions that require:

```js
assert.match(chat, /const olderMessageCursorRef = useRef<AiMessagePageCursor \| null>\(null\)/);
assert.match(chat, /loadThreadMessagePage\(space, targetThreadId/);
assert.match(chat, /beforeCursor: olderMessageCursorRef\.current/);
assert.match(chat, /mergeOlderMessagePage/);
assert.doesNotMatch(chat, /loadedMessageLimitRef\.current \+ CHAT_MESSAGE_PAGE_SIZE/);
assert.doesNotMatch(chat, /void reloadMessages\(targetThreadId, false, activeMessageBranchScopesRef\.current, nextLimit\)/);
assert.match(chat, /olderPageRequestIdRef\.current \+= 1/);
assert.match(chat, /branchScopeSignature/);
assert.match(chat, /prefetched\.olderCursor/);
assert.doesNotMatch(prefetchHitBody, /reloadMessages\(targetThreadId/);
```

- [ ] **Step 2: Run the focused policies and verify failure**

```powershell
node --test tests/ai-chat-route-loading-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs
```

Expected: FAIL on missing cursor state and the existing cumulative-limit reload.

- [ ] **Step 3: Add cursor state and an ID-stable merge**

Replace the render-only `loadedMessageLimit` state with refs:

```ts
const loadedBaseMessageCountRef = useRef(CHAT_MESSAGE_PAGE_SIZE);
const olderMessageCursorRef = useRef<AiMessagePageCursor | null>(null);
const olderPageRequestIdRef = useRef(0);
```

Add this helper outside the component:

```ts
function mergeOlderMessagePage(
  older: AiMessageWithCitations[],
  current: AiMessageWithCitations[],
): AiMessageWithCitations[] {
  const seen = new Set<string>();
  return [...older, ...current].filter((message) => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
}
```

- [ ] **Step 4: Make normal reloads consume page results**

Use `loadThreadMessagePage` for the non-anchor reload path, update `hasEarlierMessages` and `olderMessageCursorRef`, and keep the existing around-anchor behavior for search targets. Preserve `loadedBaseMessageCountRef` so explicit branch/version reloads can retain the currently loaded depth without making “load earlier” cumulative.

The non-anchor core must be:

```ts
const page = await loadThreadMessagePage(space, targetThreadId, {
  branchScopes: resolvedScopes,
  limit: options.limitOverride ?? loadedBaseMessageCountRef.current,
  selectedVersionByMessageId: routeSelection,
});
nextMessages = page.messages;
nextHasEarlierMessages = page.hasEarlierMessages;
nextOlderCursor = page.olderCursor;
nextBaseMessageCount = page.baseMessageCount;
```

After the existing latest-request guard succeeds, assign `olderMessageCursorRef.current = nextOlderCursor` and `loadedBaseMessageCountRef.current = nextBaseMessageCount` in the same commit that replaces the message array.

- [ ] **Step 5: Implement incremental older-page loading**

Replace `loadEarlierMessages` with:

```ts
const loadEarlierMessages = useCallback(() => {
  const targetThreadId = activeThreadIdRef.current;
  const beforeCursor = olderMessageCursorRef.current;
  if (!targetThreadId || !beforeCursor || isLoadingEarlierRef.current) return;
  const requestId = ++olderPageRequestIdRef.current;
  const branchScopeSignature = JSON.stringify(
    activeMessageBranchScopesRef.current,
  );
  isLoadingEarlierRef.current = true;
  void (async () => {
    try {
      const page = await loadThreadMessagePage(space, targetThreadId, {
        beforeCursor,
        branchScopes: activeMessageBranchScopesRef.current,
        limit: CHAT_MESSAGE_PAGE_SIZE,
        selectedVersionByMessageId: selectedVersionByMessageIdRef.current,
      });
      if (
        requestId !== olderPageRequestIdRef.current
        || targetThreadId !== activeThreadIdRef.current
        || branchScopeSignature !== JSON.stringify(activeMessageBranchScopesRef.current)
      ) return;
      olderMessageCursorRef.current = page.olderCursor;
      loadedBaseMessageCountRef.current += page.baseMessageCount;
      setHasEarlierMessages(page.hasEarlierMessages);
      replaceMessages(mergeOlderMessagePage(page.messages, messagesRef.current));
    } finally {
      isLoadingEarlierRef.current = false;
    }
  })();
}, [space]);
```

Increment `olderPageRequestIdRef.current` whenever the active thread or branch route resets so a late older-page result cannot cross a route change.

- [ ] **Step 6: Adopt valid prefetches without an unconditional refresh**

When applying a valid snapshot:

```ts
olderMessageCursorRef.current = prefetched.olderCursor;
loadedBaseMessageCountRef.current = prefetched.baseMessageCount;
```

Delete the unconditional:

```ts
void reloadMessages(targetThreadId, { forceToLatest: true });
```

If revision validation fails, do not render the stale snapshot; continue through the existing normal load.

- [ ] **Step 7: Run screen contracts and typecheck**

```powershell
node --test tests/ai-chat-route-loading-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
pnpm typecheck
```

Expected: PASS and no references to cumulative page-size growth remain.

- [ ] **Step 8: Commit incremental screen paging**

```powershell
git add src/screens/AiChatScreen.tsx tests/ai-chat-route-loading-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
git commit -m "perf(chat): append older history pages" -m "What: merge cursor pages into the loaded transcript and trust revision-current prefetches. Why: eliminate O(total-loaded) reloads and duplicate prefetch hydration. Verification: route, performance, chat-fix policies and typecheck. Limitation: branch changes intentionally reload the currently visible depth for correctness."
```

## Task 5: Decouple UI streaming publication from persistence draining

**Files:**

- Modify: `src/ai/aiChatService.ts:4574-4650`
- Modify: `tests/ai-chat-streaming-runtime-policy.test.cjs`
- Modify: `tests/ai-chat-first-token-pipeline-policy.test.cjs`

- [ ] **Step 1: Write failing publication-order contracts**

Add a test that extracts `emitStreamingPatch` and `scheduleStreamingPatch` and asserts:

```js
assert.match(emitBody, /if \(!force && now - lastUiPatchAt < effectivePatchIntervalMs\)[\s\S]*flushStreamingTextChunks\(\);[\s\S]*lastUiPatchAnswerChars = answerText\.length/);
assert.match(scheduleBody, /hasUnpublishedStreamingText\(\)[\s\S]*emitStreamingPatch\(true\)/);
assert.doesNotMatch(scheduleBody, /pendingAnswerChunks\.length > 0 \|\| pendingReasoningChunks\.length > 0/);
```

The contract is intentional: interval/backlog decisions may inspect pending counts, but the accepted publication must flush before counters, metrics, and payload are committed.

- [ ] **Step 2: Run the streaming policies and verify failure**

```powershell
node --test tests/ai-chat-streaming-runtime-policy.test.cjs tests/ai-chat-first-token-pipeline-policy.test.cjs
```

Expected: FAIL because current code updates publication counters before flushing and the timer only checks pending arrays.

- [ ] **Step 3: Add an unpublished-text predicate**

Inside `streamAssistantReply`, add:

```ts
const hasUnpublishedStreamingText = () =>
  answerText.length + pendingAnswerChars !== lastUiPatchAnswerChars
  || reasoningText.length + pendingReasoningChars !== lastUiPatchReasoningChars;
```

- [ ] **Step 4: Flush only after a UI patch passes throttling**

Keep existing visibility, backlog, FPS, and interval calculations. Immediately after the interval early return and before updating `lastUiPatchAt`, add:

```ts
flushStreamingTextChunks();
const publishedAnswerChars = answerText.length;
const publishedReasoningChars = reasoningText.length;
lastUiPatchAt = now;
lastUiPatchAnswerChars = publishedAnswerChars;
lastUiPatchReasoningChars = publishedReasoningChars;
```

Use `publishedAnswerChars + publishedReasoningChars > 0` for `firstUiPatchAt`. Emit exactly the flushed `answerText` and `reasoningText`. Do not flush on interval-skipped provider events, preserving chunk batching.

- [ ] **Step 5: Make the timer check publication counters**

Replace its pending-array condition with:

```ts
if (!streamFailed && hasUnpublishedStreamingText()) {
  emitStreamingPatch(true);
}
```

This ensures persistence may drain pending chunks without suppressing the later UI timer.

- [ ] **Step 6: Run streaming tests and benchmark**

```powershell
node --test tests/ai-chat-streaming-runtime-policy.test.cjs tests/ai-chat-first-token-pipeline-policy.test.cjs tests/ai-chat-latency-metrics-policy.test.cjs
pnpm bench:ai-chat
pnpm typecheck
```

Expected: tests and typecheck pass; benchmark remains informational and should not show a material regression in splitter/token-estimate fields.

- [ ] **Step 7: Commit streaming publication**

```powershell
git add src/ai/aiChatService.ts tests/ai-chat-streaming-runtime-policy.test.cjs tests/ai-chat-first-token-pipeline-policy.test.cjs
git commit -m "fix(chat): publish flushed streaming snapshots" -m "What: flush accepted UI patches before counters/payload and detect unpublished text independently of pending arrays. Why: persistence could drain chunks and suppress or stale the scheduled UI patch. Verification: streaming runtime, first-token, latency metrics tests, benchmark, and typecheck. Limitation: Android frame pacing still requires device validation."
```

## Task 6: Remove normal terminal full reloads and duplicate continuity reads

**Files:**

- Modify: `src/screens/AiChatScreen.tsx:2615-2659,3527-3616,3910-3983`
- Modify: `tests/ai-chat-streaming-runtime-policy.test.cjs`
- Modify: `tests/ai-chat-performance-hardening-policy.test.cjs`

- [ ] **Step 1: Write failing terminal-settlement contracts**

Replace the old assertion requiring `await reloadMessages(targetThreadId)` in attached `onSettled`. Require instead:

```js
assert.doesNotMatch(attachedSettledBody, /reloadMessages\(targetThreadId/);
assert.match(attachedSettledBody, /await reloadContinuityMilestones\(targetThreadId\)/);
assert.match(attachedSettledBody, /await reloadMemoryCaptures\(targetThreadId\)/);
assert.match(bufferedSettledBody, /pendingFinalReloadRef\.current = true/);
assert.match(flushBufferedBody, /await reloadMessages\(targetThreadId/);
```

Also assert that `onUpdated` does not reload messages and only refreshes thread-title presentation.

- [ ] **Step 2: Run and verify the old behavior fails**

```powershell
node --test tests/ai-chat-streaming-runtime-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs
```

Expected: FAIL because attached settlement and `onUpdated` currently issue full reloads.

- [ ] **Step 3: Keep the canonical reload only for buffered final state**

In attached `onSettled`, after clearing generation UI state, keep the existing buffered/read-history branch unchanged. Replace the normal async work with sequential secondary refreshes:

```ts
void (async () => {
  await reloadContinuityMilestones(targetThreadId);
  await reloadMemoryCaptures(targetThreadId);
  await reloadThreadTitle(targetThreadId);
  if (isCurrentStream(targetThreadId, generation)) {
    clearActiveStreamingIdentity();
  }
})();
```

The terminal patch is the message source of truth for this attached path.

- [ ] **Step 4: Narrow `onUpdated`**

Use:

```ts
onUpdated: () => {
  if (!isCurrentStream(targetThreadId, generation)) return;
  void reloadThreadTitle(targetThreadId);
},
```

Do not use it to reload transcript messages or continuity milestones.

- [ ] **Step 5: Remove the duplicated continuity call in buffered flush**

Add an option to `ReloadMessagesOptions`:

```ts
refreshContinuityMilestones?: boolean;
```

Guard the internal refresh:

```ts
if (options.refreshContinuityMilestones !== false) {
  void reloadContinuityMilestones(targetThreadId);
}
```

In `flushBufferedStreamingState`, call:

```ts
await reloadMessages(targetThreadId, {
  refreshContinuityMilestones: false,
});
await reloadContinuityMilestones(targetThreadId);
```

This path performs one canonical message load and one continuity load.

- [ ] **Step 6: Run terminal tests and typecheck**

```powershell
node --test tests/ai-chat-streaming-runtime-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
pnpm typecheck
```

Expected: PASS; the normal attached path contains no `reloadMessages`, while the buffered path retains one.

- [ ] **Step 7: Commit terminal reload removal**

```powershell
git add src/screens/AiChatScreen.tsx tests/ai-chat-streaming-runtime-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
git commit -m "perf(chat): avoid terminal transcript reloads" -m "What: trust terminal live patches when attached and keep one canonical reload only for buffered read-history settlement. Why: generation completion previously rehydrated the same page multiple times. Verification: streaming runtime, performance, chat-fix policies and typecheck. Limitation: buffered mode deliberately retains a database reload for recovery correctness."
```

## Task 7: Lazy-load secondary chat-page data

**Files:**

- Modify: `src/screens/AiChatScreen.tsx:3844-3908,4499-4532,6830-6840,7209-7238`
- Modify: `tests/ai-chat-performance-hardening-policy.test.cjs`

- [ ] **Step 1: Write failing lazy-load contracts**

Add assertions requiring:

```js
assert.match(chat, /if \(!recordDrawerVisible\) \{\s*return;\s*\}[\s\S]*reloadRecentThreads\(\)/);
assert.doesNotMatch(chat, /\[activeThreadId, isInitialMessageLoading, reloadRecentThreads\]/);
assert.match(chat, /InteractionManager\.runAfterInteractions/);
assert.match(participantBody, /await loadThreadMessageAppearanceConfig/);
assert.match(participantBody, /await settingsRepository\.getProfileAvatarUri/);
assert.match(participantBody, /await settingsRepository\.getProfileNickname/);
assert.doesNotMatch(participantBody, /Promise\.all/);
```

- [ ] **Step 2: Run the policy and verify failure**

```powershell
node --test tests/ai-chat-performance-hardening-policy.test.cjs
```

Expected: FAIL because recent history loads on every opened chat and participant reads run concurrently.

- [ ] **Step 3: Serialize participant appearance reads**

Replace the `Promise.all` block with:

```ts
const nextAppearanceConfig = await loadThreadMessageAppearanceConfig(
  space,
  targetThreadId,
);
const profile = await runWithDatabaseSpace(space, async (db) => ({
  avatarUri: await settingsRepository.getProfileAvatarUri(db),
  nickname: await settingsRepository.getProfileNickname(db),
}));
```

Apply `profile.avatarUri` and `profile.nickname` only after the existing request-ID stale-result check.

- [ ] **Step 4: Load recent threads only while the record drawer is visible**

Replace the chat-open effect with:

```ts
useEffect(() => {
  if (!recordDrawerVisible) return;
  void reloadRecentThreads();
}, [recordDrawerVisible, reloadRecentThreads]);
```

Keep explicit reloads after archive/delete actions so an already open drawer updates immediately.

- [ ] **Step 5: Defer memory-capture loading until interactions settle**

Import `InteractionManager` from React Native and replace the initial memory effect with:

```ts
useEffect(() => {
  if (isInitialMessageLoading) return;
  const interaction = InteractionManager.runAfterInteractions(() => {
    void reloadMemoryCaptures(threadId ?? null);
  });
  return () => interaction.cancel();
}, [isInitialMessageLoading, reloadMemoryCaptures, threadId]);
```

Do not defer title, model label, or participant appearance in this task; they are visible above the fold.

- [ ] **Step 6: Run lazy-load tests and typecheck**

```powershell
node --test tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
pnpm typecheck
```

Expected: PASS; no recent-thread query effect is keyed by `activeThreadId`.

- [ ] **Step 7: Commit lazy secondary data**

```powershell
git add src/screens/AiChatScreen.tsx tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
git commit -m "perf(chat): defer secondary page queries" -m "What: lazy-load drawer history, defer memory notices, and serialize participant reads. Why: reduce the SQLite burst immediately after first message paint. Verification: performance/chat policy tests and typecheck. Limitation: visible header identity remains eagerly loaded by design."
```

## Task 8: Defer remote model-title generation through a serial queue

**Files:**

- Create: `src/ai/aiPostReplyTaskQueue.ts`
- Create: `src/ai/aiThreadPresentationEvents.ts`
- Create: `tests/ai-post-reply-task-queue-unit.test.cjs`
- Create: `tests/ai-thread-presentation-events-unit.test.cjs`
- Modify: `src/ai/aiChatService.ts:3763-3821,5074-5101`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `tests/ai-final-acceptance-policy.test.cjs`
- Modify: `tests/ai-chat-performance-hardening-policy.test.cjs`

- [ ] **Step 1: Write failing queue tests**

Create `tests/ai-post-reply-task-queue-unit.test.cjs` using the existing TypeScript require hook. Cover serial execution and space/thread isolation:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { enqueueAiPostReplyTask } = require(path.join(
  __dirname,
  '..',
  'src/ai/aiPostReplyTaskQueue.ts',
));

test('post-reply tasks serialize per space and thread', async () => {
  const order = [];
  const first = enqueueAiPostReplyTask('normal', 'thread-a', async () => {
    order.push('first:start');
    await Promise.resolve();
    order.push('first:end');
  });
  const second = enqueueAiPostReplyTask('normal', 'thread-a', async () => {
    order.push('second');
  });
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first:start', 'first:end', 'second']);
});

test('a failed post-reply task does not block the next task', async () => {
  const order = [];
  await enqueueAiPostReplyTask('normal', 'thread-a', async () => {
    throw new Error('expected');
  });
  await enqueueAiPostReplyTask('normal', 'thread-a', async () => {
    order.push('recovered');
  });
  assert.deepEqual(order, ['recovered']);
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
node --test tests/ai-post-reply-task-queue-unit.test.cjs
```

Expected: FAIL because the queue module does not exist.

- [ ] **Step 3: Implement the focused queue**

Create `src/ai/aiPostReplyTaskQueue.ts`:

```ts
import type { PixorySpace } from '../database';

const activeTasks = new Map<string, Promise<void>>();

function taskKey(space: PixorySpace, threadId: string): string {
  return `${space}:${threadId}`;
}

export function enqueueAiPostReplyTask(
  space: PixorySpace,
  threadId: string,
  run: () => Promise<void>,
): Promise<void> {
  const key = taskKey(space, threadId);
  const previous = activeTasks.get(key) ?? Promise.resolve();
  const task = previous
    .catch(() => undefined)
    .then(run)
    .catch((error) => {
      console.warn('Pixory AI post-reply task failed.', error);
    });
  activeTasks.set(key, task);
  void task.finally(() => {
    if (activeTasks.get(key) === task) activeTasks.delete(key);
  });
  return task;
}
```

- [ ] **Step 4: Schedule only the remote model-title pass**

Create `src/ai/aiThreadPresentationEvents.ts` so background completion does not depend on a generation subscriber that has already settled:

```ts
import type { PixorySpace } from '../database';

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

function presentationKey(space: PixorySpace, threadId: string): string {
  return `${space}:${threadId}`;
}

export function subscribeAiThreadPresentation(
  space: PixorySpace,
  threadId: string,
  listener: Listener,
): () => void {
  const key = presentationKey(space, threadId);
  const current = listeners.get(key) ?? new Set<Listener>();
  current.add(listener);
  listeners.set(key, current);
  return () => {
    current.delete(listener);
    if (current.size === 0) listeners.delete(key);
  };
}

export function emitAiThreadPresentationUpdated(
  space: PixorySpace,
  threadId: string,
): void {
  listeners.get(presentationKey(space, threadId))
    ?.forEach((listener) => listener());
}
```

Create `tests/ai-thread-presentation-events-unit.test.cjs` with the same imports and TypeScript require hook as the queue test, then load and test the event module with:

```js
const {
  emitAiThreadPresentationUpdated,
  subscribeAiThreadPresentation,
} = require(path.join(
  __dirname,
  '..',
  'src/ai/aiThreadPresentationEvents.ts',
));

test('thread presentation events are scoped and unsubscribe cleanly', () => {
  const updates = [];
  const unsubscribe = subscribeAiThreadPresentation('normal', 'thread-a', () => {
    updates.push('a');
  });
  emitAiThreadPresentationUpdated('normal', 'thread-b');
  emitAiThreadPresentationUpdated('personal', 'thread-a');
  emitAiThreadPresentationUpdated('normal', 'thread-a');
  unsubscribe();
  emitAiThreadPresentationUpdated('normal', 'thread-a');
  assert.deepEqual(updates, ['a']);
});
```

Subscribe independently in `AiChatScreen`:

```ts
useEffect(() => {
  if (!threadId) return;
  return subscribeAiThreadPresentation(space, threadId, () => {
    void reloadThreadTitle(threadId);
  });
}, [reloadThreadTitle, space, threadId]);
```

Keep `recordSuccessfulProviderModel`, continuity-import round completion, `finalizeThreadTitleAfterReply`, Personal-space resume writes, companion scheduling, and atomic generation settlement in their existing foreground/correctness positions.

Replace the direct remote title await with:

```ts
void enqueueAiPostReplyTask(input.space, input.thread.id, async () => {
  await maybeGenerateModelThreadTitleAfterReply({
    branchScopes,
    onUpdated: () => emitAiThreadPresentationUpdated(input.space, input.thread.id),
    space: input.space,
    thread: input.thread,
  });
});
```

This is the only generation-finalization work deferred by this task.

- [ ] **Step 5: Update title acceptance policy**

Replace the old requirement for a foreground `await maybeGenerateModelThreadTitleAfterReply` with assertions that:

```js
assert.match(chatService, /await finalizeThreadTitleAfterReply\([\s\S]*void enqueueAiPostReplyTask\(/);
assert.match(chatService, /enqueueAiPostReplyTask\([\s\S]{0,400}await maybeGenerateModelThreadTitleAfterReply/);
assert.doesNotMatch(chatService, /await finalizeThreadTitleAfterReply\([\s\S]{0,300}\);\s*await maybeGenerateModelThreadTitleAfterReply/);
assert.match(queue, /const key = taskKey\(space, threadId\)/);
assert.match(queue, /previous[\s\S]*\.then\(run\)[\s\S]*\.catch/);
assert.match(chatService, /current\.titleStatus !== 'generated'/);
assert.match(chatService, /current\.modelTitleGeneratedAt/);
assert.match(chatScreen, /subscribeAiThreadPresentation/);
assert.match(chatService, /emitAiThreadPresentationUpdated/);
```

- [ ] **Step 6: Run queue/title tests and typecheck**

```powershell
node --test tests/ai-post-reply-task-queue-unit.test.cjs tests/ai-thread-presentation-events-unit.test.cjs tests/ai-final-acceptance-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs
pnpm typecheck
```

Expected: PASS; the foreground reply path no longer awaits the remote title model call.

- [ ] **Step 7: Commit deferred title work**

```powershell
git add src/ai/aiPostReplyTaskQueue.ts src/ai/aiThreadPresentationEvents.ts src/ai/aiChatService.ts src/screens/AiChatScreen.tsx tests/ai-post-reply-task-queue-unit.test.cjs tests/ai-thread-presentation-events-unit.test.cjs tests/ai-final-acceptance-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs
git commit -m "perf(chat): defer model title finalization" -m "What: queue the non-critical remote model-title pass serially per thread. Why: a completed reply should not keep the foreground generation task open for a second provider request. Verification: queue unit tests, title acceptance, performance policy and typecheck. Limitation: the queue is process-local and title generation remains best-effort, matching its existing non-critical contract."
```

## Task 9: Document behavior and run final verification

**Files:**

- Modify: `docs/feature-matrix.md`
- Modify: `docs/superpowers/plans/2026-08-13-ai-chat-p0-p1-runtime-performance.md` only to record execution evidence after implementation.

- [ ] **Step 1: Update the feature matrix**

In the AI chat performance/testing rows, record:

- bounded cursor history pages with deterministic equal-timestamp ordering;
- exact `hasEarlierMessages` without snapshot `COUNT(*)`;
- route prefetch validation by lineage and thread revision;
- streaming UI publication independent from recoverability persistence;
- attached terminal completion without transcript rehydration;
- deferred, serialized remote model-title work;
- Android device verification status.

Do not claim FlashList, attachment optimization, provider retry, or Android verification until those are actually completed.

- [ ] **Step 2: Run focused verification**

```powershell
node --test tests/ai-chat-message-pagination-integration.test.cjs tests/ai-thread-history-projection-policy.test.cjs tests/ai-chat-route-loading-policy.test.cjs tests/ai-chat-streaming-runtime-policy.test.cjs tests/ai-chat-first-token-pipeline-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-post-reply-task-queue-unit.test.cjs tests/ai-thread-presentation-events-unit.test.cjs tests/ai-final-acceptance-policy.test.cjs
pnpm typecheck
pnpm bench:ai-chat
git diff --check
```

Expected: zero focused failures, typecheck success, benchmark JSON, and no whitespace errors.

- [ ] **Step 3: Run the full JavaScript suite**

```powershell
pnpm test
```

Expected: zero failures from the clean implementation worktree. If newer unrelated tests fail, record and prove the baseline relationship rather than editing unrelated behavior.

- [ ] **Step 4: Inspect exact changed scope**

```powershell
git status --short
git diff --stat HEAD~8..HEAD
git diff --name-only HEAD~8..HEAD
```

Expected: only files listed by this plan plus execution evidence are changed. Adjust the commit range to the actual first implementation commit.

- [ ] **Step 5: Run Android validation when a device is available**

```powershell
D:\Develop\Android\Sdk\platform-tools\adb.exe devices -l
```

Use a release-like build and real data. Validate:

1. Open a 1,000+ message branchable conversation from Home/History; a valid prefetch must not flash or immediately requery the full page.
2. Load at least five older pages while slowly and rapidly scrolling; no duplicate/missing equal-timestamp messages, jump, or blank region is allowed.
3. Generate a long Markdown/code reply while bottom-locked; the first visible patch must contain text and output must not pause when SQLite persistence runs.
4. Scroll into history during generation; the detached tail must remain stable, and returning to latest must perform one canonical buffered reload.
5. Complete the sixth eligible reply that triggers model-title generation; the composer/generation state must settle before the title-provider request finishes, and the title must update later.
6. Background and foreground the app during streaming; recoverability and final content must remain correct.
7. Open the record drawer after chat paint; recent threads should load then, not during initial message paint.

Capture Perfetto/React profiling evidence for initial paint, older-page load, streaming first patch, and final patch-to-settlement. Acceptance is no regression against the pre-change build on the same device/data and bounded work per added page rather than growth with total loaded messages.

- [ ] **Step 6: Commit docs and evidence**

```powershell
git add docs/feature-matrix.md docs/superpowers/plans/2026-08-13-ai-chat-p0-p1-runtime-performance.md
git commit -m "docs(chat): record P0 P1 performance coverage" -m "What: document cursor paging, snapshot validation, streaming publication, settlement behavior, and verification evidence. Why: keep the feature inventory and implementation handoff aligned. Verification: focused/full tests, typecheck, benchmark, diff check, and Android results when available. Limitation: attachment and FlashList work remain explicitly excluded."
```

## Integration and rollback boundaries

- Merge commits in task order. Pagination repository/service/screen commits are one dependency chain; streaming, lazy secondary reads, and deferred title commits can be reviewed independently afterward.
- Resolve `AiChatScreen.tsx` conflicts by preserving the user's avatar/UI changes and reapplying only cursor state, paging, prefetch, settlement, and lazy-query hunks from this branch.
- If cursor paging regresses branch visibility, revert Tasks 2–4 together; do not keep the screen cursor state without the repository/service boundary.
- If streaming publication regresses pacing, revert Task 5 only; persistence and final forced flush remain otherwise unchanged.
- If deferred title behavior regresses, revert Task 8 only; local title generation and final message settlement remain intact.
- Never solve an integration conflict by restoring cumulative history loading, removing generation guards, widening branch scopes, or bypassing Personal-space isolation.

## Self-review record

- Spec coverage: all approved P0/P1 findings are mapped to Tasks 2–8; image attachment work is explicitly excluded.
- Simplicity check: no list-library migration, schema bump, provider parser rewrite, or presentation-service redesign is introduced.
- Correctness check: branch routes, selected versions, buffered-stream canonical reload, generation recovery, local title, continuity processing, and memory maintenance remain protected.
- Type consistency: `AiMessagePageCursor` is defined once in the repository and reused by service, route snapshot, and screen; page results consistently expose `messages`, `hasEarlierMessages`, and `olderCursor`.
- Verification check: every production task starts with a failing test, has an exact focused command, and ends with a scoped commit.
