# Empty Chat History Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exclude zero-message threads from every recent/history surface without restoring the per-thread expo-sqlite query loop that previously crashed Android history loading.

**Architecture:** Keep `aiThreadRepository.listHistoryItems` as one recursive SQL projection of each adopted branch route. Make a projected visible message mandatory for a thread to enter the result set; all consumers already share this repository method, so the rule automatically covers the sidebar, home, search, and full history.

**Tech Stack:** TypeScript, Expo SQLite, Node `node:test`, `node:sqlite` integration fixtures.

---

## Repository preflight

The current working tree already contains the uncommitted Android route-loading hotfix in `aiThreadRepository`, `AiChatScreen`, and related policy tests. Do not reset, stash, or replace those edits. This plan deliberately finishes the empty-thread rule on top of that hotfix and commits the combined coherent repair after verification.

### Task 1: Add the zero-message regression expectation

**Files:**
- Modify: `tests/ai-thread-history-projection-policy.test.cjs:113-135`

- [ ] **Step 1: Change the existing integration fixture expectation**

Keep the `empty-thread` fixture because it proves the rule, but replace the final expectation with:

```js
const repository = loadRepository();
const items = await repository.listHistoryItems(db, 'normal');
assert.deepEqual(items.map((item) => item.id), ['other-thread', 'adopted-thread']);
assert.equal(items[1].lastMessagePreview, 'adopted route latest');
assert.equal(items.some((item) => item.id === 'empty-thread'), false);
db.close();
```

- [ ] **Step 2: Run the focused test and confirm the current query fails the new rule**

Run:

```powershell
node --test tests/ai-thread-history-projection-policy.test.cjs
```

Expected: FAIL because the actual ID list still contains `empty-thread`.

### Task 2: Require a projected visible message in the single SQL query

**Files:**
- Modify: `src/database/repositories/aiThreadRepository.ts:2562-2571`

- [ ] **Step 1: Replace the optional history projection join**

Change only the final join and ordering of `listHistoryItems`:

```ts
FROM ai_threads
LEFT JOIN ai_knowledge_bases ON ai_knowledge_bases.id = ai_threads.boundKnowledgeBaseId
JOIN projected_history ON projected_history.threadId = ai_threads.id
WHERE ${clauses.join(' AND ')}
ORDER BY projected_history.lastMessageAt DESC,
         ai_threads.createdAt DESC
```

Do not change `ranked_visible_messages`, adopted-route resolution, continuity rollback filtering, or the projected preview logic. Do not add a JavaScript loop over threads.

- [ ] **Step 2: Run the focused integration test**

Run:

```powershell
node --test tests/ai-thread-history-projection-policy.test.cjs
```

Expected: PASS; the adopted branch preview remains correct and `empty-thread` is absent.

- [ ] **Step 3: Run the policy tests that guard Android history loading**

Run:

```powershell
node --test tests/ai-navigation-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-chat-route-loading-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
```

Expected: PASS with no assertion requesting a per-thread async history loop.

### Task 3: Update the product inventory and verify the full hotfix

**Files:**
- Modify: `docs/feature-matrix.md:3,70`
- Verify existing scoped changes in:
  - `src/screens/AiChatScreen.tsx`
  - `tests/ai-branch-tree-navigation-policy.test.cjs`
  - `tests/ai-chat-fixes-policy.test.cjs`
  - `tests/ai-chat-performance-hardening-policy.test.cjs`
  - `tests/ai-chat-route-loading-policy.test.cjs`
  - `tests/ai-navigation-policy.test.cjs`

- [ ] **Step 1: Correct the history feature-matrix statement**

Replace the phrase claiming history “保留无消息的新线程” with a statement equivalent to:

```text
最近历史通过单条递归 SQL 按每个线程已采纳路线计算排序和预览；没有有效完成消息的空线程不会进入侧栏、首页、搜索或历史，同时避免逐线程 SQLite statement 竞争。
```

Keep the existing route visibility, retryable error, and immediate user-message visibility descriptions.

- [ ] **Step 2: Run type checking**

Run:

```powershell
pnpm typecheck
```

Expected: exit code 0.

- [ ] **Step 3: Run the complete test suite**

Run:

```powershell
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Check whitespace and inspect the exact combined hotfix diff**

Run:

```powershell
git diff --check
git diff -- docs/feature-matrix.md src/database/repositories/aiThreadRepository.ts src/screens/AiChatScreen.tsx tests/ai-branch-tree-navigation-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-chat-route-loading-policy.test.cjs tests/ai-navigation-policy.test.cjs tests/ai-thread-history-projection-policy.test.cjs
```

Expected: no whitespace errors; every changed line maps to route loading, history projection, message visibility, or the empty-thread rule.

- [ ] **Step 5: Commit the verified chat recovery as one coherent repair**

Run:

```powershell
git add -- docs/feature-matrix.md src/database/repositories/aiThreadRepository.ts src/screens/AiChatScreen.tsx tests/ai-branch-tree-navigation-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-chat-route-loading-policy.test.cjs tests/ai-navigation-policy.test.cjs tests/ai-thread-history-projection-policy.test.cjs
git commit -m "fix(chat): restore visible history and exclude empty threads" -m "What: keep adopted-route history projection in one SQL query, exclude zero-message threads, preserve retryable loading errors, and immediately surface persisted user messages. Why: recent Android hot updates exposed empty sessions and unstable route loading. Verification: pnpm typecheck, pnpm test, and git diff --check. Limitation: existing empty database rows are hidden rather than physically deleted."
```

Expected: one commit containing only the listed chat recovery files.
