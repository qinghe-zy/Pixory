# AI Chat Performance Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Pixory AI chat local performance for extreme long-thread, deep-branch, large-material, and background-memory scenarios.

**Architecture:** Add one focused policy test file, then make surgical changes in the existing repository, UI, embedding retrieval, and memory queue boundaries. Preserve public service APIs and existing chat behavior while replacing growth-prone local hot paths with bounded or serialized paths.

**Tech Stack:** Expo React Native, TypeScript, Expo SQLite, Node policy tests, existing Pixory AI chat repository/service/screen layers.

---

## File Map

- Create: `tests/ai-chat-performance-hardening-policy.test.cjs` for regression coverage.
- Modify: `src/database/repositories/aiThreadRepository.ts` for recursive branch lineage query.
- Modify: `src/screens/AiChatScreen.tsx` for indexed streaming patch updates and duplicate buffered patch cleanup.
- Modify: `src/ai/aiEmbeddingService.ts` for bounded vector candidate loading.
- Modify: `src/ai/aiMemoryMaintenanceQueue.ts` for global maintenance serialization with per-thread coalescing preserved.

---

### Task 1: Add Performance Hardening Policy Coverage

**Files:**
- Create: `tests/ai-chat-performance-hardening-policy.test.cjs`

- [ ] **Step 1: Write the failing policy test**

Create `tests/ai-chat-performance-hardening-policy.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('branch lineage uses one recursive SQLite query with invalid lineage guards', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const lineageBody = /async resolveBranchLineage[\s\S]*?\r?\n  \},\r?\n\r?\n  async listRecentCompletedMessagesBefore/.exec(repository)?.[0] ?? '';

  assert.match(lineageBody, /BRANCH_LINEAGE_MAX_DEPTH/);
  assert.match(lineageBody, /WITH RECURSIVE/);
  assert.match(lineageBody, /lineage/);
  assert.match(lineageBody, /path/);
  assert.match(lineageBody, /cycleDetected/);
  assert.match(lineageBody, /missingParentDetected/);
  assert.match(lineageBody, /depthLimitReached/);
  assert.match(lineageBody, /ORDER BY depth ASC/);
  assert.doesNotMatch(lineageBody, /while \(currentRootMessageId && currentVersionIndex\)/);
  assert.doesNotMatch(lineageBody, /getFirstAsync<AiMessageRecord>\('SELECT \* FROM ai_messages WHERE id = \?', currentRootMessageId\)/);
});

test('AI chat streaming patches update by indexed message id before falling back', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const patchBody = /const applyStreamingMessagePatch = useCallback[\s\S]*?\r?\n  \}, \[\]\);/.exec(chat)?.[0] ?? '';
  const bufferBody = /const applyOrBufferStreamingMessagePatch = useCallback[\s\S]*?\r?\n  \}, \[applyStreamingMessagePatch\]\);/.exec(chat)?.[0] ?? '';

  assert.match(chat, /messageIndexByIdRef/);
  assert.match(chat, /function rebuildMessageIndex/);
  assert.match(chat, /function replaceMessages/);
  assert.match(patchBody, /const messageIndex = messageIndexByIdRef\.current\.get\(patch\.id\)/);
  assert.match(patchBody, /current\[messageIndex\]/);
  assert.match(patchBody, /nextMessages\[messageIndex\] =/);
  assert.match(patchBody, /current\.map/);
  assert.match(patchBody, /rebuildMessageIndex\(nextMessages\)/);
  assert.match(chat, /replaceMessages\(\[\]\)/);
  assert.match(chat, /replaceMessages\(renderedMessages\)/);
  const mergeMatches = bufferBody.match(/mergeBufferedStreamingPatch\(patch\)/g) ?? [];
  assert.equal(mergeMatches.length, 1);
});

test('embedding retrieval limits vector candidates before JS cosine scoring', () => {
  const embedding = read('src/ai/aiEmbeddingService.ts');
  const retrievalBody = /export async function tryEmbeddingRetrieval[\s\S]*?\r?\n}\r?\n?$/.exec(embedding)?.[0] ?? '';

  assert.match(embedding, /const EMBEDDING_VECTOR_CANDIDATE_LIMIT =/);
  assert.match(retrievalBody, /const candidateLimit = Math\.max/);
  assert.match(retrievalBody, /LIMIT \?/);
  assert.match(retrievalBody, /candidateLimit/);
  assert.match(retrievalBody, /ORDER BY ai_chunks\.documentId ASC, ai_chunks\.chunkIndex ASC, ai_embeddings\.chunkId ASC/);
  assert.match(retrievalBody, /\.slice\(0, input\.limit \?\? 6\)/);
});

test('memory maintenance preserves per-thread coalescing and serializes global passes', () => {
  const queue = read('src/ai/aiMemoryMaintenanceQueue.ts');

  assert.match(queue, /const activeMaintenanceTasks = new Map/);
  assert.match(queue, /const queuedMaintenanceTasks: ActiveMaintenanceTask\[\] = \[\]/);
  assert.match(queue, /let globalMaintenanceRunnerActive = false/);
  assert.match(queue, /function enqueueMaintenanceTask/);
  assert.match(queue, /async function drainMaintenanceQueue/);
  assert.match(queue, /queuedMaintenanceTasks\.sort/);
  assert.match(queue, /reasonPriority\(right\.reason\) - reasonPriority\(left\.reason\)/);
  assert.match(queue, /let currentInput = entry\.currentInput/);
  assert.match(queue, /await runUnifiedMemoryMaintenancePass\(currentInput\)/);
  assert.match(queue, /recordMaintenanceFailure\(currentInput\.space, currentInput\.threadId, error\)/);
  assert.match(queue, /entry\.done\(undefined\)/);
  assert.match(queue, /activeMaintenanceTasks\.set\(key, entry\)/);
  assert.match(queue, /return entry\.promise/);
});
```

- [ ] **Step 2: Run the new policy test and verify RED**

Run:

```powershell
node --test tests/ai-chat-performance-hardening-policy.test.cjs
```

Expected: FAIL because the new hardening code is not present yet.

---

### Task 2: Replace Branch Lineage N+1 Query

**Files:**
- Modify: `src/database/repositories/aiThreadRepository.ts`

- [ ] **Step 1: Add a lineage depth guard constant**

Near the existing repository constants, add:

```ts
const BRANCH_LINEAGE_MAX_DEPTH = 1000;
```

- [ ] **Step 2: Replace `resolveBranchLineage` implementation**

Replace the body of `resolveBranchLineage` with:

```ts
    if (!branchRootMessageId || !branchVersionIndex) {
      return [];
    }
    const rows = await db.getAllAsync<{
      branchRootMessageId: string;
      branchVersionIndex: number;
      cycleDetected: number;
      depth: number;
      depthLimitReached: number;
      missingParentDetected: number;
    }>(
      `WITH RECURSIVE lineage(
         id,
         branchRootMessageId,
         branchVersionIndex,
         parentBranchRootMessageId,
         parentBranchVersionIndex,
         depth,
         path,
         cycleDetected,
         missingParentDetected
       ) AS (
         SELECT
           root.id,
           root.id,
           CAST(? AS INTEGER),
           root.branchRootMessageId,
           root.branchVersionIndex,
           0,
           '|' || root.id || ':' || CAST(? AS TEXT) || '|',
           0,
           0
         FROM ai_messages root
         WHERE root.id = ?

         UNION ALL

         SELECT
           parent.id,
           parent.id,
           lineage.parentBranchVersionIndex,
           parent.branchRootMessageId,
           parent.branchVersionIndex,
           lineage.depth + 1,
           lineage.path || parent.id || ':' || CAST(lineage.parentBranchVersionIndex AS TEXT) || '|',
           CASE
             WHEN instr(lineage.path, '|' || parent.id || ':' || CAST(lineage.parentBranchVersionIndex AS TEXT) || '|') > 0 THEN 1
             ELSE 0
           END,
           0
         FROM lineage
         JOIN ai_messages parent ON parent.id = lineage.parentBranchRootMessageId
         WHERE lineage.parentBranchRootMessageId IS NOT NULL
           AND lineage.parentBranchVersionIndex IS NOT NULL
           AND lineage.cycleDetected = 0
           AND lineage.depth < ?

         UNION ALL

         SELECT
           '__missing_parent__',
           lineage.parentBranchRootMessageId,
           lineage.parentBranchVersionIndex,
           NULL,
           NULL,
           lineage.depth + 1,
           lineage.path,
           0,
           1
         FROM lineage
         LEFT JOIN ai_messages parent ON parent.id = lineage.parentBranchRootMessageId
         WHERE lineage.parentBranchRootMessageId IS NOT NULL
           AND lineage.parentBranchVersionIndex IS NOT NULL
           AND parent.id IS NULL
           AND lineage.cycleDetected = 0
           AND lineage.depth < ?
       )
       SELECT
         branchRootMessageId,
         branchVersionIndex,
         cycleDetected,
         depth,
         CASE WHEN depth >= ? THEN 1 ELSE 0 END AS depthLimitReached,
         missingParentDetected
       FROM lineage
       ORDER BY depth ASC`,
      branchVersionIndex,
      branchVersionIndex,
      branchRootMessageId,
      BRANCH_LINEAGE_MAX_DEPTH,
      BRANCH_LINEAGE_MAX_DEPTH,
      BRANCH_LINEAGE_MAX_DEPTH
    );
    if (
      rows.length === 0
      || rows.some((row) => row.cycleDetected || row.missingParentDetected || row.depthLimitReached)
    ) {
      return [];
    }
    return rows.map((row) => ({
      branchRootMessageId: row.branchRootMessageId,
      branchVersionIndex: row.branchVersionIndex,
    }));
```

- [ ] **Step 3: Run focused tests**

Run:

```powershell
node --test tests/ai-chat-performance-hardening-policy.test.cjs
node --test tests/ai-branch-tree-navigation-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
```

Expected: new policy test still FAILS on later tasks; branch-related existing tests PASS.

---

### Task 3: Add Indexed Streaming Patch Updates

**Files:**
- Modify: `src/screens/AiChatScreen.tsx`

- [ ] **Step 1: Add message index ref**

After `const messagesRef = useRef<AiMessageWithCitations[]>([]);`, add:

```ts
  const messageIndexByIdRef = useRef(new Map<string, number>());
```

- [ ] **Step 2: Add index helpers**

Inside the component before `reloadMessages`, add:

```ts
  function rebuildMessageIndex(nextMessages: AiMessageWithCitations[]): void {
    messageIndexByIdRef.current = new Map(nextMessages.map((message, index) => [message.id, index]));
  }

  function replaceMessages(nextMessages: AiMessageWithCitations[]): void {
    messagesRef.current = nextMessages;
    rebuildMessageIndex(nextMessages);
    setMessages(nextMessages);
  }
```

- [ ] **Step 3: Replace full-message assignments**

Change the empty-thread branch from:

```ts
        messagesRef.current = [];
        setMessages([]);
```

to:

```ts
        replaceMessages([]);
```

Change the normal reload assignment from:

```ts
      messagesRef.current = renderedMessages;
      setMessages(renderedMessages);
```

to:

```ts
      replaceMessages(renderedMessages);
```

- [ ] **Step 4: Update streaming patch implementation**

Replace `applyStreamingMessagePatch` with:

```ts
  const applyStreamingMessagePatch = useCallback((patch: AiStreamingMessagePatch) => {
    setMessages((current) => {
      const buildPatchedMessage = (message: AiMessageWithCitations): AiMessageWithCitations => ({
        ...message,
        status: patch.status ?? message.status,
        content: patch.content ?? message.content,
        reasoningText: patch.reasoningText === undefined ? message.reasoningText : patch.reasoningText,
        errorMessage: patch.errorMessage === undefined ? message.errorMessage : patch.errorMessage,
        providerId: patch.providerId === undefined ? message.providerId : patch.providerId,
        modelId: patch.modelId === undefined ? message.modelId : patch.modelId,
        modelSnapshotJson: patch.modelSnapshotJson ?? message.modelSnapshotJson,
        promptSnapshotJson: patch.promptSnapshotJson ?? message.promptSnapshotJson,
        createdAt: patch.createdAt ?? message.createdAt,
        completedAt: patch.completedAt === undefined ? message.completedAt : patch.completedAt,
        citations: patch.citations ?? message.citations,
        updatedAt: patch.completedAt ?? new Date().toISOString(),
      });
      const messageIndex = messageIndexByIdRef.current.get(patch.id);
      if (messageIndex != null && current[messageIndex]?.id === patch.id) {
        const nextMessages = current.slice();
        nextMessages[messageIndex] = buildPatchedMessage(current[messageIndex]);
        messagesRef.current = nextMessages;
        return nextMessages;
      }
      const nextMessages = current.map((message) => (message.id === patch.id ? buildPatchedMessage(message) : message));
      messagesRef.current = nextMessages;
      rebuildMessageIndex(nextMessages);
      return nextMessages;
    });
  }, []);
```

- [ ] **Step 5: Remove duplicate buffered merge**

In `applyOrBufferStreamingMessagePatch`, keep only one block:

```ts
    hasBufferedStreamingUpdateRef.current = true;
    freezeVisibleStreamingMessage(patch.id);
    mergeBufferedStreamingPatch(patch);
```

Remove the duplicated second copy if present.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
node --test tests/ai-chat-performance-hardening-policy.test.cjs
node --test tests/ai-chat-fixes-policy.test.cjs
```

Expected: new policy test still FAILS on later tasks; existing chat fixes tests PASS.

---

### Task 4: Bound Embedding Retrieval Candidates

**Files:**
- Modify: `src/ai/aiEmbeddingService.ts`

- [ ] **Step 1: Add candidate limit constant**

After the interfaces and before helper functions, add:

```ts
const EMBEDDING_VECTOR_CANDIDATE_LIMIT = 320;
```

- [ ] **Step 2: Limit vector rows in SQL**

Inside `tryEmbeddingRetrieval`, after `const queryVector = input.queryVector;`, add:

```ts
  const candidateLimit = Math.max(input.limit ?? 6, EMBEDDING_VECTOR_CANDIDATE_LIMIT);
```

Change the SQL to:

```ts
      `SELECT ai_embeddings.chunkId, ai_embeddings.vectorJson
       FROM ai_embeddings
       INNER JOIN ai_chunks ON ai_chunks.id = ai_embeddings.chunkId
       WHERE ai_chunks.space = ?
         AND ai_chunks.ownerType = ?
         AND ai_chunks.ownerId = ?
         AND ai_embeddings.providerId = ?
         AND ai_embeddings.modelId = ?
       ORDER BY ai_chunks.documentId ASC, ai_chunks.chunkIndex ASC, ai_embeddings.chunkId ASC
       LIMIT ?`,
```

Add `candidateLimit` as the final SQL parameter.

- [ ] **Step 3: Run focused tests**

Run:

```powershell
node --test tests/ai-chat-performance-hardening-policy.test.cjs
node --test tests/ai-rag-policy.test.cjs
```

Expected: new policy test still FAILS on memory queue task; RAG policy tests PASS.

---

### Task 5: Serialize Memory Maintenance Globally

**Files:**
- Modify: `src/ai/aiMemoryMaintenanceQueue.ts`

- [ ] **Step 1: Add global queue state**

After `const activeMaintenanceTasks = new Map<string, ActiveMaintenanceTask>();`, add:

```ts
const queuedMaintenanceTasks: ActiveMaintenanceTask[] = [];
let globalMaintenanceRunnerActive = false;
```

- [ ] **Step 2: Add enqueue and drain helpers**

Add before `scheduleMemoryMaintenance`:

```ts
function enqueueMaintenanceTask(entry: ActiveMaintenanceTask): void {
  queuedMaintenanceTasks.push(entry);
  queuedMaintenanceTasks.sort((left, right) => reasonPriority(right.reason) - reasonPriority(left.reason));
  void drainMaintenanceQueue();
}

async function drainMaintenanceQueue(): Promise<void> {
  if (globalMaintenanceRunnerActive) {
    return;
  }
  globalMaintenanceRunnerActive = true;
  try {
    while (queuedMaintenanceTasks.length > 0) {
      const entry = queuedMaintenanceTasks.shift();
      if (!entry) {
        continue;
      }
      let currentInput = entry.currentInput;
      while (true) {
        try {
          await runUnifiedMemoryMaintenancePass(currentInput);
        } catch (error) {
          await recordMaintenanceFailure(currentInput.space, currentInput.threadId, error);
        }
        const pendingReason = entry.pendingReason;
        const pendingInput = entry.pendingInput;
        entry.pendingReason = null;
        entry.pendingInput = null;
        if (!pendingReason) {
          break;
        }
        const hasPendingExchange = Boolean(pendingInput?.thread && pendingInput.userMessage && pendingInput.assistantMessageId);
        const hasStrongerReason = reasonPriority(pendingReason) > reasonPriority(currentInput.reason);
        const hasDifferentReason = pendingReason !== currentInput.reason;
        if (!hasPendingExchange && !hasStrongerReason && !hasDifferentReason) {
          break;
        }
        currentInput = {
          ...(pendingInput ?? currentInput),
          reason: pendingReason,
        };
        entry.reason = pendingReason;
      }
      entry.done(undefined);
    }
  } finally {
    globalMaintenanceRunnerActive = false;
  }
}
```

- [ ] **Step 3: Extend `ActiveMaintenanceTask`**

Change the interface to:

```ts
interface ActiveMaintenanceTask {
  currentInput: ScheduleMemoryMaintenanceInput;
  done: (error?: unknown) => void;
  pendingReason: MemoryMaintenanceReason | null;
  pendingInput: ScheduleMemoryMaintenanceInput | null;
  promise: Promise<void>;
  reason: MemoryMaintenanceReason;
}
```

- [ ] **Step 4: Rewrite `scheduleMemoryMaintenance` to enqueue**

Replace the new-entry branch in `scheduleMemoryMaintenance` with:

```ts
  let finishTask: (error?: unknown) => void = () => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    finishTask = (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };
  });
  const entry: ActiveMaintenanceTask = {
    currentInput: input,
    done: finishTask,
    pendingInput: null,
    pendingReason: null,
    promise,
    reason: input.reason,
  };
  entry.promise = entry.promise.finally(() => {
    if (activeMaintenanceTasks.get(key) === entry) {
      activeMaintenanceTasks.delete(key);
    }
  });
  activeMaintenanceTasks.set(key, entry);
  enqueueMaintenanceTask(entry);
  return entry.promise;
```

Keep the existing active-entry branch unchanged so per-thread coalescing still returns the same promise.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
node --test tests/ai-chat-performance-hardening-policy.test.cjs
node --test tests/ai-chat-fixes-policy.test.cjs
```

Expected: focused tests PASS.

---

### Task 6: Full Verification And Manual Review

**Files:**
- Review all touched files.

- [ ] **Step 1: Run related policy tests**

Run:

```powershell
node --test tests/ai-chat-performance-hardening-policy.test.cjs
node --test tests/ai-chat-fixes-policy.test.cjs tests/ai-rag-policy.test.cjs tests/ai-branch-tree-navigation-policy.test.cjs
```

Expected: PASS.

- [ ] **Step 2: Run project verification**

Run:

```powershell
pnpm typecheck
git diff --check
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Manual diff review**

Inspect:

```powershell
git diff -- src/database/repositories/aiThreadRepository.ts src/screens/AiChatScreen.tsx src/ai/aiEmbeddingService.ts src/ai/aiMemoryMaintenanceQueue.ts tests/ai-chat-performance-hardening-policy.test.cjs
```

Confirm:

- Branch lineage returns `[]` for missing root, missing parent, cycle, and depth limit.
- Streaming patch indexed path does not drop citations, status, provider/model data, reasoning, or error fields.
- `replaceMessages` is used for full message-array replacement paths touched by this plan.
- Embedding retrieval still returns the top scored rows from the bounded candidate set.
- Memory maintenance still records failures and removes completed thread entries from `activeMaintenanceTasks`.
- No remote, server, sync, account, or destructive data path was introduced.

- [ ] **Step 4: Final independent review**

Without spawning agents, reread the spec, plan, tests, and diff as a reviewer. List any P0/P1/P2 findings. Fix all P0/P1 findings, rerun the relevant focused test, then rerun project verification if code changed after full verification.
