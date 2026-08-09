# Adopted Chat Route Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chat, prefetch, history, search and branch entry use one persisted adopted-route identity so the correct thread always renders its correct latest visible messages.

**Architecture:** Add a bounded `AiAdoptedThreadRouteSnapshot` service which resolves persisted lineage, loads a branch-filtered stable page, and checks the route identity once more before returning. The UI consumes that snapshot synchronously for prefetch and normal entry; repository history projection selects the latest visible terminal message under the same route rules.

**Tech Stack:** TypeScript, Expo SQLite, React Native, Node `node:test`, TypeScript transpile-backed SQLite integration tests.

---

### Task 1: Lock down route-scoped paging semantics

**Files:**
- Create: `tests/ai-thread-route-snapshot-integration.test.cjs`
- Modify: `src/database/repositories/aiThreadRepository.ts:3783-3810`

- [ ] **Step 1: Write the failing test**

```js
test('base scope and adopted scope exclude newer sibling rows and keep equal timestamps stable', async () => {
  const base = await repository.listMessagesBase(db, 'thread', 60, []);
  const adopted = await repository.listMessagesBase(db, 'thread', 60, [{ branchRootMessageId: 'root', branchVersionIndex: 2 }]);
  assert.deepEqual(base.map((row) => row.id), ['base-user', 'base-assistant']);
  assert.deepEqual(adopted.slice(-2).map((row) => row.id), ['same-time-first', 'same-time-second']);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/ai-thread-route-snapshot-integration.test.cjs`

Expected: the old page contains sibling rows or lacks a stable same-time order.

- [ ] **Step 3: Implement the minimal ordering fix**

```sql
ORDER BY createdAt DESC, rowid DESC
LIMIT ?
) ORDER BY createdAt ASC, rowid ASC
```

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/ai-thread-route-snapshot-integration.test.cjs`

Expected: PASS.

### Task 2: Build an adopted-route snapshot

**Files:**
- Create: `src/ai/aiThreadRouteSnapshotService.ts`
- Create: `tests/ai-thread-route-snapshot-unit.test.cjs`
- Modify: `src/ai/aiChatService.ts`

- [ ] **Step 1: Write failing tests**

```js
test('snapshot returns persisted scopes, a selection map and the adopted tail', async () => {
  const snapshot = await loadAdoptedThreadRouteSnapshot({ space: 'normal', threadId: 'thread', limit: 60 });
  assert.deepEqual(snapshot.branchScopes, [{ branchRootMessageId: 'root', branchVersionIndex: 2 }]);
  assert.equal(snapshot.selectedVersionByMessageId.root, 2);
  assert.equal(snapshot.messages.at(-1).id, 'adopted-tail');
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/ai-thread-route-snapshot-unit.test.cjs`

Expected: module/function missing.

- [ ] **Step 3: Implement the bounded loader**

```ts
export interface AiAdoptedThreadRouteSnapshot {
  branchScopes: AiBranchScope[];
  hasEarlierMessages: boolean;
  lineageVersion: number;
  messages: AiMessageWithCitations[];
  routeHash: string;
  selectedVersionByMessageId: Record<string, number>;
  threadId: string;
}
```

Read route, read page/count in that route, reread route, retry once only if route identity changed.

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/ai-thread-route-snapshot-unit.test.cjs tests/ai-thread-route-snapshot-integration.test.cjs`

Expected: PASS.

### Task 3: Replace bare-message prefetch and first-load paths

**Files:**
- Modify: `src/ai/aiThreadMessagePrefetch.ts:15-66`
- Modify: `src/screens/AiChatScreen.tsx:3668-3751,4447-4516`
- Create: `tests/ai-chat-route-loading-policy.test.cjs`

- [ ] **Step 1: Write failing policy tests**

```js
test('prefetch carries a complete adopted route snapshot rather than bare messages', () => {
  assert.match(prefetch, /loadAdoptedThreadRouteSnapshot/);
  assert.match(chat, /prefetched\.selectedVersionByMessageId/);
  assert.match(chat, /selectedVersionByMessageIdRef\.current = prefetched\.selectedVersionByMessageId/);
});

test('chat never widens an explicit base-route scope to undefined', () => {
  assert.doesNotMatch(chat, /branchScopes && branchScopes\.length > 0 \? branchScopes : undefined/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/ai-chat-route-loading-policy.test.cjs`

Expected: assertions fail against the current prefetch and empty-scope conversion.

- [ ] **Step 3: Implement UI wiring**

```ts
selectedVersionByMessageIdRef.current = snapshot.selectedVersionByMessageId;
setSelectedVersionByMessageId(snapshot.selectedVersionByMessageId);
setPersistedCurrentBranchScopes(snapshot.branchScopes);
replaceMessages(snapshot.messages);
setHasEarlierMessages(snapshot.hasEarlierMessages);
```

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/ai-chat-route-loading-policy.test.cjs tests/ai-branch-tree-navigation-policy.test.cjs`

Expected: PASS.

### Task 4: Align history, settings entry and adoption transaction

**Files:**
- Modify: `src/database/repositories/aiThreadRepository.ts:2485-2528`
- Modify: `src/ai/aiBranchTreeService.ts:294-365`
- Modify: `App.tsx:206-222,1992-2023`
- Modify: `tests/ai-thread-route-snapshot-integration.test.cjs`
- Modify: `tests/ai-branch-tree-navigation-policy.test.cjs`

- [ ] **Step 1: Write failing tests**

```js
test('history preview and lastMessageAt come from the same adopted terminal message', async () => {
  const [history] = await repository.listHistoryItems(db, 'normal');
  assert.equal(history.lastMessagePreview, 'adopted assistant tail');
  assert.equal(history.lastMessageAt, '2026-08-09T12:00:00.000Z');
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/ai-thread-route-snapshot-integration.test.cjs`

Expected: the old history query uses hidden sibling activity or a stale preview.

- [ ] **Step 3: Implement projection and transaction**

```ts
await db.withTransactionAsync(async () => {
  await aiThreadRepository.setThreadCurrentBranch(db, route);
  await aiThreadRepository.upsertBranchRouteMetadata(db, metadata);
});
```

Use persisted scopes at settings entry; do not fabricate an empty route.

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/ai-thread-route-snapshot-integration.test.cjs tests/ai-branch-tree-navigation-policy.test.cjs`

Expected: PASS.

### Task 5: Validate and hand off

**Files:**
- Modify: `docs/feature-matrix.md`
- Modify: `docs/ai-chat-research/chat-branch-loading-audit-2026-08-09.md`

- [ ] **Step 1: Record the implemented snapshot contract and exact tests.**
- [ ] **Step 2: Run `pnpm typecheck`, `pnpm test`, and `git diff --check`; each must return zero failures.**
- [ ] **Step 3: Run `android\\gradlew.bat clean` followed by `android\\gradlew.bat assembleDebug` and inspect the produced APK.**
- [ ] **Step 4: Commit with What, Why, Verification and Limitations paragraphs.**
