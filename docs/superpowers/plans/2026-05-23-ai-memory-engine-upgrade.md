# Pixory AI Memory And Chat Experience Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a visible, controllable, cache-friendly, IP-asset-aware AI memory engine and complete the approved AI chat experience upgrades for feedback, context safety, long-chat navigation, settings polish, and voice/input state.

**Architecture:** Extend the existing local AI stack instead of replacing it. Add SQLite-backed memory metadata and job state, a Memory Board UI, capture notices in chat, triggered/lazy memory update scheduling, deterministic stable prompt assembly, hybrid memory retrieval, and focused chat UX components for feedback, empty guidance, long conversation navigation, context budgeting, and voice state.

**Tech Stack:** Expo React Native, TypeScript, expo-sqlite, existing Pixory SQLite repositories, existing AI provider adapters, existing AI light theme/tokens, Node `node:test` policy tests, Android manual validation.

---

## Scope

This plan implements the final approved AI memory and chat experience upgrade spec:

- `docs/superpowers/specs/2026-05-23-ai-memory-engine-upgrade.md`

Do not implement these during this plan:

- server-side memory
- accounts or sync
- local ONNX embedding
- automatic vision analysis
- image original mutation
- replacing or bypassing AI Workbench
- long-press-only message actions
- default Enter-to-send
- code syntax highlighting
- Markdown image rendering
- changing the 0.1-second thinking timer precision

## File Structure

Create:

- `src/screens/AiMemoryBoardScreen.tsx`: memory management screen.
- `src/components/ai/AiMemoryCaptureNotice.tsx`: compact chat notice for newly captured memories.
- `src/ai/aiMemoryService.ts`: board CRUD, capture notice state, triggered/lazy consolidation orchestration, stable memory prefix helpers.

Modify:

- `src/ai/types.ts`: memory source kind, asset-linked memory view types, memory board input types if colocated with domain types.
- `src/ai/aiChatService.ts`: use cache-friendly prompt assembly, emit capture notices, replace per-turn extraction with triggered/lazy logic.
- `src/ai/promptBuilder.ts`: accept stable memory prefix and dynamic memory context without changing reply preference semantics.
- `src/database/schema.ts`: add migration for memory asset references and memory job state.
- `src/database/db.ts`: run the new migration.
- `src/database/repositories/aiThreadRepository.ts`: add memory board queries, edit/delete/manual create helpers, job state helpers, deterministic memory listing.
- `src/screens/AiSessionConfigScreen.tsx`: open Memory Board from the deep memory section.
- `src/screens/AiChatScreen.tsx`: render capture notice, undo captured memory, open board.
- `App.tsx`: add route for Memory Board.
- `tests/ai-chat-fixes-policy.test.cjs`: capture notice, lazy update, prompt stability policies.
- `tests/ai-final-acceptance-policy.test.cjs`: board route and user-visible memory control policies.
- `tests/ai-rag-policy.test.cjs`: hybrid retrieval and stable prompt policies.
- `tests/ai-schema-policy.test.cjs`: schema migration policies.

## Task 1: Schema For Asset-Aware Memory And Lazy Jobs

**Files:**

- Modify: `src/database/schema.ts`
- Modify: `src/database/db.ts`
- Modify: `tests/ai-schema-policy.test.cjs`

- [ ] **Step 1: Add failing schema policy**

Add assertions to `tests/ai-schema-policy.test.cjs`:

```js
assert.match(schema, /DATABASE_VERSION = 24/);
assert.match(schema, /MIGRATION_STATEMENTS_V24/);
assert.match(schema, /ALTER TABLE ai_memories ADD COLUMN ipId INTEGER/);
assert.match(schema, /ALTER TABLE ai_memories ADD COLUMN groupId INTEGER/);
assert.match(schema, /ALTER TABLE ai_memories ADD COLUMN imageAssetId INTEGER/);
assert.match(schema, /ALTER TABLE ai_memories ADD COLUMN assetSnapshotJson TEXT NOT NULL DEFAULT '\{\}'/);
assert.match(schema, /ALTER TABLE ai_memories ADD COLUMN sourceKind TEXT NOT NULL DEFAULT 'auto'/);
assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_thread_memory_jobs/);
assert.match(db, /MIGRATION_STATEMENTS_V24/);
assert.match(db, /currentVersion < 24/);
```

- [ ] **Step 2: Run the schema policy and verify it fails**

Run:

```powershell
pnpm test -- tests/ai-schema-policy.test.cjs
```

Expected: failure mentioning `DATABASE_VERSION = 24` or `MIGRATION_STATEMENTS_V24`.

- [ ] **Step 3: Add migration V24**

In `src/database/schema.ts`, bump:

```ts
export const DATABASE_VERSION = 24;
```

Add:

```ts
export const MIGRATION_STATEMENTS_V24 = `
ALTER TABLE ai_memories ADD COLUMN ipId INTEGER;
ALTER TABLE ai_memories ADD COLUMN groupId INTEGER;
ALTER TABLE ai_memories ADD COLUMN imageAssetId INTEGER;
ALTER TABLE ai_memories ADD COLUMN assetSnapshotJson TEXT NOT NULL DEFAULT '{}';
ALTER TABLE ai_memories ADD COLUMN sourceKind TEXT NOT NULL DEFAULT 'auto' CHECK (sourceKind IN ('auto', 'manual'));

CREATE TABLE IF NOT EXISTS ai_thread_memory_jobs (
  threadId TEXT PRIMARY KEY NOT NULL,
  pendingTurnCount INTEGER NOT NULL DEFAULT 0,
  lastConsolidatedMessageId TEXT,
  lastCaptureNoticeJson TEXT NOT NULL DEFAULT '[]',
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (lastConsolidatedMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_memories_asset_refs ON ai_memories(space, ipId, groupId, imageAssetId, status);
CREATE INDEX IF NOT EXISTS idx_ai_memory_jobs_updated_at ON ai_thread_memory_jobs(updatedAt);
`;
```

In `src/database/db.ts`, import and run V24:

```ts
MIGRATION_STATEMENTS_V24,
```

```ts
if (currentVersion < 24) {
  await database.execAsync(MIGRATION_STATEMENTS_V24);
}
```

- [ ] **Step 4: Verify schema policy passes**

Run:

```powershell
pnpm test -- tests/ai-schema-policy.test.cjs
```

Expected: pass.

## Task 2: Repository Memory Board And Job State APIs

**Files:**

- Modify: `src/database/repositories/aiThreadRepository.ts`
- Modify: `src/ai/types.ts`
- Modify: `tests/ai-final-acceptance-policy.test.cjs`

- [ ] **Step 1: Add failing repository policy**

Add a test that checks:

```js
const types = read('src/ai/types.ts');
const repository = read('src/database/repositories/aiThreadRepository.ts');

assert.match(types, /AiMemorySourceKind = 'auto' \| 'manual'/);
assert.match(repository, /listMemoryBoardItems/);
assert.match(repository, /createManualMemory/);
assert.match(repository, /updateMemoryContent/);
assert.match(repository, /updateMemoryStatus\(db, memoryId, 'deleted'\)/);
assert.match(repository, /getThreadMemoryJob/);
assert.match(repository, /updateThreadMemoryJob/);
assert.match(repository, /sourceKind: 'manual'/);
assert.match(repository, /ORDER BY scope ASC, importance DESC, createdAt ASC, id ASC/);
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
pnpm test -- tests/ai-final-acceptance-policy.test.cjs
```

Expected: failure on missing repository functions.

- [ ] **Step 3: Extend types**

In `src/ai/types.ts`, add:

```ts
export type AiMemorySourceKind = 'auto' | 'manual';
```

If memory row types live in the repository, add there:

```ts
export interface AiThreadMemoryJobRecord {
  threadId: string;
  pendingTurnCount: number;
  lastConsolidatedMessageId: string | null;
  lastCaptureNoticeJson: string;
  updatedAt: string;
}
```

- [ ] **Step 4: Extend memory repository row/input types**

In `src/database/repositories/aiThreadRepository.ts`, extend `AiMemoryRecord`:

```ts
ipId: number | null;
groupId: number | null;
imageAssetId: number | null;
assetSnapshotJson: string;
sourceKind: AiMemorySourceKind;
```

Extend `CreateAiMemoryInput`:

```ts
ipId?: number | null;
groupId?: number | null;
imageAssetId?: number | null;
assetSnapshotJson?: string;
sourceKind?: AiMemorySourceKind;
```

- [ ] **Step 5: Update createMemory insert**

Update the `INSERT INTO ai_memories` column list to include:

```sql
ipId, groupId, imageAssetId, assetSnapshotJson, sourceKind
```

Pass:

```ts
input.ipId ?? null,
input.groupId ?? null,
input.imageAssetId ?? null,
input.assetSnapshotJson ?? '{}',
input.sourceKind ?? 'auto',
```

- [ ] **Step 6: Add board and job methods**

Add repository methods:

```ts
async listMemoryBoardItems(db: SQLiteDatabase, input: { space: PixorySpace; threadId?: string | null; roleCardId?: string | null; boundIpId?: number | null; boundKnowledgeBaseId?: string | null }): Promise<AiMemoryRecord[]> {
  const clauses = ["space = ?", "status = 'active'"];
  const values: Array<string | number | null> = [input.space];
  const scopeClauses = ["scope = 'global'"];
  if (input.threadId) {
    scopeClauses.push("(scope = 'thread' AND scopeId = ?)");
    values.push(input.threadId);
  }
  if (input.roleCardId) {
    scopeClauses.push("(scope = 'role' AND scopeId = ?)");
    values.push(input.roleCardId);
  }
  if (input.boundIpId != null) {
    scopeClauses.push("(scope = 'ip' AND scopeId = ?)");
    values.push(String(input.boundIpId));
  }
  if (input.boundKnowledgeBaseId) {
    scopeClauses.push("(scope = 'knowledge_base' AND scopeId = ?)");
    values.push(input.boundKnowledgeBaseId);
  }
  clauses.push(`(${scopeClauses.join(' OR ')})`);
  return db.getAllAsync<AiMemoryRecord>(
    `SELECT * FROM ai_memories
     WHERE ${clauses.join(' AND ')}
     ORDER BY scope ASC, importance DESC, createdAt ASC, id ASC`,
    ...values
  );
}
```

Add:

```ts
async createManualMemory(db: SQLiteDatabase, input: CreateAiMemoryInput): Promise<AiMemoryRecord> {
  return this.createMemory(db, { ...input, sourceKind: 'manual', confidence: input.confidence ?? 1, importance: input.importance ?? 4 });
}
```

Add:

```ts
async updateMemoryContent(db: SQLiteDatabase, memoryId: string, content: string): Promise<AiMemoryRecord | null> {
  const now = createTimestamp();
  const normalizedContent = content.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 180);
  await db.runAsync(
    `UPDATE ai_memories SET content = ?, normalizedContent = ?, updatedAt = ? WHERE id = ? AND status = 'active'`,
    content.trim(),
    normalizedContent,
    now,
    memoryId
  );
  return db.getFirstAsync<AiMemoryRecord>('SELECT * FROM ai_memories WHERE id = ?', memoryId);
}
```

Add job helpers:

```ts
async getThreadMemoryJob(db: SQLiteDatabase, threadId: string): Promise<AiThreadMemoryJobRecord> {
  const row = await db.getFirstAsync<AiThreadMemoryJobRecord>('SELECT * FROM ai_thread_memory_jobs WHERE threadId = ?', threadId);
  return row ?? { threadId, pendingTurnCount: 0, lastConsolidatedMessageId: null, lastCaptureNoticeJson: '[]', updatedAt: createTimestamp() };
}

async updateThreadMemoryJob(db: SQLiteDatabase, input: Partial<AiThreadMemoryJobRecord> & { threadId: string }): Promise<AiThreadMemoryJobRecord> {
  const current = await this.getThreadMemoryJob(db, input.threadId);
  const next = { ...current, ...input, updatedAt: createTimestamp() };
  await db.runAsync(
    `INSERT INTO ai_thread_memory_jobs (threadId, pendingTurnCount, lastConsolidatedMessageId, lastCaptureNoticeJson, updatedAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(threadId) DO UPDATE SET
       pendingTurnCount = excluded.pendingTurnCount,
       lastConsolidatedMessageId = excluded.lastConsolidatedMessageId,
       lastCaptureNoticeJson = excluded.lastCaptureNoticeJson,
       updatedAt = excluded.updatedAt`,
    next.threadId,
    next.pendingTurnCount,
    next.lastConsolidatedMessageId,
    next.lastCaptureNoticeJson,
    next.updatedAt
  );
  return next;
}
```

- [ ] **Step 7: Verify repository policy passes**

Run:

```powershell
pnpm test -- tests/ai-final-acceptance-policy.test.cjs
```

Expected: pass.

## Task 3: AI Memory Service

**Files:**

- Create: `src/ai/aiMemoryService.ts`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] **Step 1: Add failing service policy**

Add assertions:

```js
const service = read('src/ai/aiMemoryService.ts');

assert.match(service, /listMemoryBoardItems/);
assert.match(service, /createManualMemory/);
assert.match(service, /deleteMemory/);
assert.match(service, /shouldRunImmediateMemoryCapture/);
assert.match(service, /MEMORY_CAPTURE_PATTERNS/);
assert.match(service, /maybeRunLazyMemoryConsolidation/);
assert.match(service, /pendingTurnCount >= 5/);
assert.match(service, /buildStableMemoryPrefix/);
assert.match(service, /retrieveDynamicMemoryContext/);
assert.match(service, /importance DESC/);
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
pnpm test -- tests/ai-chat-fixes-policy.test.cjs
```

Expected: failure because `src/ai/aiMemoryService.ts` does not exist.

- [ ] **Step 3: Create service skeleton**

Create `src/ai/aiMemoryService.ts` with:

```ts
import type { SQLiteDatabase } from 'expo-sqlite';

import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type { AiMemoryRecord, CreateAiMemoryInput } from '../database/repositories/aiThreadRepository';
import type { AiThreadRecord } from './types';

export const MEMORY_CAPTURE_PATTERNS = [
  /记住/,
  /以后/,
  /之后默认/,
  /默认/,
  /不对/,
  /纠正/,
  /更正/,
  /最终版/,
  /确认/,
  /决定/,
];

export function shouldRunImmediateMemoryCapture(text: string): boolean {
  return MEMORY_CAPTURE_PATTERNS.some((pattern) => pattern.test(text));
}

export async function listMemoryBoardItems(space: PixorySpace, thread: AiThreadRecord): Promise<AiMemoryRecord[]> {
  return runWithDatabaseSpace(space, (db) =>
    aiThreadRepository.listMemoryBoardItems(db, {
      boundIpId: thread.boundIpId,
      boundKnowledgeBaseId: thread.boundKnowledgeBaseId,
      roleCardId: thread.roleCardId,
      space,
      threadId: thread.id,
    })
  );
}

export async function createManualMemory(space: PixorySpace, input: CreateAiMemoryInput): Promise<AiMemoryRecord> {
  return runWithDatabaseSpace(space, (db) => aiThreadRepository.createManualMemory(db, input));
}

export async function updateMemoryContent(space: PixorySpace, memoryId: string, content: string): Promise<AiMemoryRecord | null> {
  return runWithDatabaseSpace(space, (db) => aiThreadRepository.updateMemoryContent(db, memoryId, content));
}

export async function deleteMemory(space: PixorySpace, memoryId: string): Promise<void> {
  await runWithDatabaseSpace(space, (db) => aiThreadRepository.updateMemoryStatus(db, memoryId, 'deleted'));
}

export async function incrementPendingMemoryTurn(db: SQLiteDatabase, threadId: string): Promise<void> {
  const current = await aiThreadRepository.getThreadMemoryJob(db, threadId);
  await aiThreadRepository.updateThreadMemoryJob(db, {
    threadId,
    pendingTurnCount: current.pendingTurnCount + 1,
  });
}

export async function maybeRunLazyMemoryConsolidation(input: {
  db: SQLiteDatabase;
  thread: AiThreadRecord;
  reason: 'turn_threshold' | 'leave_chat' | 'app_background';
  runConsolidation: () => Promise<void>;
}): Promise<boolean> {
  const job = await aiThreadRepository.getThreadMemoryJob(input.db, input.thread.id);
  if (job.pendingTurnCount < 5 && input.reason === 'turn_threshold') {
    return false;
  }
  if (job.pendingTurnCount < 1) {
    return false;
  }
  await input.runConsolidation();
  await aiThreadRepository.updateThreadMemoryJob(input.db, {
    threadId: input.thread.id,
    pendingTurnCount: 0,
  });
  return true;
}

export async function buildStableMemoryPrefix(db: SQLiteDatabase, thread: AiThreadRecord): Promise<string> {
  const memories = await aiThreadRepository.listActiveMemories(db, {
    boundIpId: thread.boundIpId,
    boundKnowledgeBaseId: thread.boundKnowledgeBaseId,
    roleCardId: thread.roleCardId,
    space: thread.space,
    threadId: thread.id,
    limit: 40,
  });
  const stable = memories
    .filter((memory) => memory.status === 'active')
    .sort((left, right) => {
      if (right.importance !== left.importance) {
        return right.importance - left.importance;
      }
      return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
    })
    .slice(0, 24);
  if (stable.length === 0) {
    return '';
  }
  return ['稳定记忆背景：', ...stable.map((memory, index) => `${index + 1}. ${memory.content}`)].join('\n');
}

export async function retrieveDynamicMemoryContext(): Promise<string> {
  return '';
}
```

- [ ] **Step 4: Verify service policy passes**

Run:

```powershell
pnpm test -- tests/ai-chat-fixes-policy.test.cjs
```

Expected: pass.

## Task 4: Cache-Friendly Prompt Assembly

**Files:**

- Modify: `src/ai/aiChatService.ts`
- Modify: `src/ai/promptBuilder.ts`
- Modify: `tests/ai-rag-policy.test.cjs`

- [ ] **Step 1: Add failing prompt policy**

Add assertions:

```js
const chatService = read('src/ai/aiChatService.ts');
const promptBuilder = read('src/ai/promptBuilder.ts');

assert.match(chatService, /buildStableMemoryPrefix/);
assert.match(chatService, /retrieveDynamicMemoryContext/);
assert.match(chatService, /stableMemoryPrefix/);
assert.match(chatService, /dynamicMemoryContext/);
assert.match(promptBuilder, /stableMemoryPrefix/);
assert.match(promptBuilder, /dynamicMemoryContext/);
assert.match(promptBuilder, /\[frameRoleInstruction[\s\S]*input\.stableMemoryPrefix[\s\S]*input\.rolePrompt\]/);
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
pnpm test -- tests/ai-rag-policy.test.cjs
```

Expected: failure on missing stable memory prefix.

- [ ] **Step 3: Extend prompt builder inputs**

Add optional fields to both prompt builders:

```ts
stableMemoryPrefix?: string | null;
dynamicMemoryContext?: string | null;
```

For normal chat, system array order becomes:

```ts
[
  frameRoleInstruction(input.systemPrompt, input.roleInstructionWeight),
  frameReplyPreference(input.replyPreference),
  input.stableMemoryPrefix,
  input.rolePrompt,
]
```

For material chat, system array order becomes:

```ts
[
  frameRoleInstruction(input.editablePrompt, input.roleInstructionWeight),
  frameReplyPreference(input.replyPreference),
  input.stableMemoryPrefix,
  '资料规则：',
  materialRules,
]
```

For user body, place dynamic memory before current user question:

```ts
[input.dynamicMemoryContext, input.userMessage].filter(Boolean).join('\n\n用户当前问题：\n')
```

- [ ] **Step 4: Wire aiChatService**

Import from `aiMemoryService.ts`:

```ts
import { buildStableMemoryPrefix, retrieveDynamicMemoryContext } from './aiMemoryService';
```

Inside `buildPromptForThread`, compute:

```ts
const { stableMemoryPrefix, dynamicMemoryContext } = await runWithDatabaseSpace(thread.space, async (db) => ({
  stableMemoryPrefix: await buildStableMemoryPrefix(db, thread),
  dynamicMemoryContext: await retrieveDynamicMemoryContext(),
}));
```

Pass both fields into `buildNormalChatPrompt` and `buildMaterialBoundPrompt`.

Keep existing `loadDeepMemoryContext` until replacement is verified, but do not duplicate memory content in both stable and dynamic paths. If `loadDeepMemoryContext` remains, restrict it to summary-related context only or remove its memory injection in a later cleanup task.

- [ ] **Step 5: Verify prompt policy passes**

Run:

```powershell
pnpm test -- tests/ai-rag-policy.test.cjs
```

Expected: pass.

## Task 5: Triggered And Lazy Memory Update Flow

**Files:**

- Modify: `src/ai/aiChatService.ts`
- Modify: `src/ai/aiMemoryService.ts`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] **Step 1: Add failing update policy**

Add assertions:

```js
const chatService = read('src/ai/aiChatService.ts');

assert.match(chatService, /shouldRunImmediateMemoryCapture/);
assert.match(chatService, /incrementPendingMemoryTurn/);
assert.match(chatService, /maybeRunLazyMemoryConsolidation/);
assert.match(chatService, /pendingTurnCount/);
assert.doesNotMatch(chatService, /void updateDeepMemoryAfterReply\(\{[\s\S]*\}\);/);
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
pnpm test -- tests/ai-chat-fixes-policy.test.cjs
```

Expected: failure while old per-reply update is still used.

- [ ] **Step 3: Replace unconditional memory update**

In `streamAssistantReply`, replace unconditional:

```ts
void updateDeepMemoryAfterReply(...)
```

with:

```ts
void scheduleDeepMemoryAfterReply({
  assistantMessageId: input.assistantMessageId,
  assistantReply: answerText,
  space: input.space,
  thread: input.thread,
  userMessage: input.userMessage,
});
```

Add `scheduleDeepMemoryAfterReply`:

```ts
async function scheduleDeepMemoryAfterReply(input: {
  assistantMessageId: string;
  assistantReply: string;
  space: PixorySpace;
  thread: AiThreadRecord;
  userMessage: Pick<AiMessageRecord, 'id' | 'content'>;
}): Promise<void> {
  await runWithDatabaseSpace(input.space, async (db) => {
    const settings = await aiThreadRepository.getThreadMemorySettings(db, input.thread.id);
    if (!settings.deepMemoryEnabled) {
      return;
    }
    const exchangeText = `${input.userMessage.content}\n${input.assistantReply}`;
    if (shouldRunImmediateMemoryCapture(exchangeText)) {
      await updateDeepMemoryAfterReply(input);
      return;
    }
    await incrementPendingMemoryTurn(db, input.thread.id);
    await maybeRunLazyMemoryConsolidation({
      db,
      reason: 'turn_threshold',
      thread: input.thread,
      runConsolidation: () => updateDeepMemoryAfterReply(input),
    });
  });
}
```

If nested `runWithDatabaseSpace` transactions conflict with `updateDeepMemoryAfterReply`, split the pending-turn logic into one DB call and run consolidation outside the transaction.

- [ ] **Step 4: Verify update policy passes**

Run:

```powershell
pnpm test -- tests/ai-chat-fixes-policy.test.cjs
```

Expected: pass.

## Task 6: Memory Capture Notice UI

**Files:**

- Create: `src/components/ai/AiMemoryCaptureNotice.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] **Step 1: Add failing UI policy**

Add assertions:

```js
const notice = read('src/components/ai/AiMemoryCaptureNotice.tsx');
const chat = read('src/screens/AiChatScreen.tsx');

assert.match(notice, /已记住/);
assert.match(notice, /撤销/);
assert.match(notice, /管理/);
assert.match(notice, /aiLightColors/);
assert.match(chat, /AiMemoryCaptureNotice/);
assert.match(chat, /onUndoMemoryCapture/);
assert.match(chat, /onOpenMemoryBoard/);
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
pnpm test -- tests/ai-chat-fixes-policy.test.cjs
```

Expected: failure because component does not exist.

- [ ] **Step 3: Create notice component**

Create a compact token-based component:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiMemoryCaptureNoticeProps {
  count: number;
  onManage: () => void;
  onUndo: () => void;
}

export function AiMemoryCaptureNotice({ count, onManage, onUndo }: AiMemoryCaptureNoticeProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>已记住 {count} 条内容</Text>
      <Pressable accessibilityRole="button" onPress={onUndo} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
        <Text style={styles.actionText}>撤销</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onManage} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
        <Text style={styles.actionText}>管理</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  text: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  action: {
    paddingHorizontal: spacing[1],
    paddingVertical: spacing[1],
  },
  actionText: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.78,
  },
});
```

- [ ] **Step 4: Wire into chat screen**

In `AiChatScreen.tsx`, import `AiMemoryCaptureNotice`.

Add state:

```ts
const [memoryCaptureCount, setMemoryCaptureCount] = useState(0);
```

Render it just above the composer when `memoryCaptureCount > 0`.

Add handlers:

```ts
function onUndoMemoryCapture() {
  setMemoryCaptureCount(0);
}

function onOpenMemoryBoard() {
  // Use existing route callback pattern. If route support is added in Task 7, call it here.
}
```

The first UI pass may show the notice only after service wiring is complete. Do not fake memory creation.

- [ ] **Step 5: Verify UI policy passes**

Run:

```powershell
pnpm test -- tests/ai-chat-fixes-policy.test.cjs
```

Expected: pass.

## Task 7: Memory Board Screen And Routing

**Files:**

- Create: `src/screens/AiMemoryBoardScreen.tsx`
- Modify: `src/screens/AiSessionConfigScreen.tsx`
- Modify: `App.tsx`
- Modify: `tests/ai-final-acceptance-policy.test.cjs`

- [ ] **Step 1: Add failing route policy**

Add assertions:

```js
const app = read('App.tsx');
const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');
const board = read('src/screens/AiMemoryBoardScreen.tsx');

assert.match(app, /ai-memory-board/);
assert.match(app, /AiMemoryBoardScreen/);
assert.match(sessionConfig, /onOpenMemoryBoard/);
assert.match(sessionConfig, /管理记忆/);
assert.match(board, /AI 记住了这些/);
assert.match(board, /createManualMemory/);
assert.match(board, /updateMemoryContent/);
assert.match(board, /deleteMemory/);
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
pnpm test -- tests/ai-final-acceptance-policy.test.cjs
```

Expected: failure on missing screen or route.

- [ ] **Step 3: Create Memory Board screen**

Build a screen using `AiLightScaffold`, `AiLightCard`, `AiLightButton`, `AiLightTextareaRow`, and existing tokens.

Required screen props:

```ts
interface AiMemoryBoardScreenProps {
  space: PixorySpace;
  threadId: string;
  onBack: () => void;
}
```

Required behavior:

- Load thread by `threadId`.
- Load memory board items through `listMemoryBoardItems`.
- Group by `scope`.
- Show empty state text: `还没有可管理的记忆。`
- Edit memory in a small inline textarea or dialog.
- Delete memory by calling `deleteMemory`.
- Manual add creates a `manual` memory in current thread scope by default.

- [ ] **Step 4: Route from session settings**

Add prop to `AiSessionConfigScreenProps`:

```ts
onOpenMemoryBoard?: () => void;
```

In the deep memory card, add a low-profile action:

```tsx
<Pressable accessibilityRole="button" onPress={onOpenMemoryBoard}>
  <Text style={styles.textActionLabel}>管理记忆</Text>
</Pressable>
```

Disable or hide it when no `threadId` exists.

- [ ] **Step 5: Add route in App**

Follow the existing AI route pattern. Add an `ai-memory-board` route carrying:

```ts
space: PixorySpace;
threadId: string;
```

Render `AiMemoryBoardScreen`.

Pass `onOpenMemoryBoard` from `AiSessionConfigScreen` route to push the board route.

- [ ] **Step 6: Verify route policy passes**

Run:

```powershell
pnpm test -- tests/ai-final-acceptance-policy.test.cjs
```

Expected: pass.

## Task 8: IP Asset Memory Binding

**Files:**

- Modify: `src/ai/aiMemoryService.ts`
- Modify: `src/database/repositories/aiThreadRepository.ts`
- Modify: `tests/ai-rag-policy.test.cjs`

- [ ] **Step 1: Add failing asset memory policy**

Add assertions:

```js
const service = read('src/ai/aiMemoryService.ts');
const repository = read('src/database/repositories/aiThreadRepository.ts');

assert.match(repository, /ipId/);
assert.match(repository, /groupId/);
assert.match(repository, /imageAssetId/);
assert.match(repository, /assetSnapshotJson/);
assert.match(service, /buildMemoryAssetSnapshot/);
assert.match(service, /internalFilename/);
assert.match(service, /originalFilename/);
assert.match(service, /width/);
assert.match(service, /height/);
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
pnpm test -- tests/ai-rag-policy.test.cjs
```

Expected: failure on missing `buildMemoryAssetSnapshot`.

- [ ] **Step 3: Add asset snapshot builder**

In `aiMemoryService.ts`, add:

```ts
export function buildMemoryAssetSnapshot(input: {
  internalFilename?: string | null;
  originalFilename?: string | null;
  width?: number | null;
  height?: number | null;
  tags?: string[];
  groupName?: string | null;
  note?: string | null;
  isFavorite?: boolean | null;
}): string {
  return JSON.stringify({
    groupName: input.groupName ?? null,
    height: input.height ?? null,
    internalFilename: input.internalFilename ?? null,
    isFavorite: input.isFavorite ?? null,
    note: input.note ?? null,
    originalFilename: input.originalFilename ?? null,
    tags: input.tags ?? [],
    width: input.width ?? null,
  });
}
```

- [ ] **Step 4: Use snapshot in manual memory creation**

When `createManualMemory` receives asset metadata, pass:

```ts
assetSnapshotJson: buildMemoryAssetSnapshot(assetInput)
```

Do not load or mutate original files.

- [ ] **Step 5: Verify asset policy passes**

Run:

```powershell
pnpm test -- tests/ai-rag-policy.test.cjs
```

Expected: pass.

## Task 9: Hybrid Memory Retrieval

**Files:**

- Modify: `src/ai/aiMemoryService.ts`
- Modify: `src/ai/aiChatService.ts`
- Modify: `tests/ai-rag-policy.test.cjs`

- [ ] **Step 1: Add failing retrieval policy**

Add assertions:

```js
const service = read('src/ai/aiMemoryService.ts');

assert.match(service, /scoreMemoryForQuery/);
assert.match(service, /scopeScore/);
assert.match(service, /importanceScore/);
assert.match(service, /recencyScore/);
assert.match(service, /assetScore/);
assert.match(service, /keywordScore/);
assert.match(service, /embedding/);
assert.match(service, /fallback/);
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
pnpm test -- tests/ai-rag-policy.test.cjs
```

Expected: failure on missing ranking functions.

- [ ] **Step 3: Implement local ranking helper**

Add:

```ts
function queryTerms(value: string): string[] {
  return [...new Set(value.toLowerCase().split(/[\s,，。！？!?;；:：、]+/).filter((term) => term.length >= 2))].slice(0, 12);
}

export function scoreMemoryForQuery(memory: AiMemoryRecord, query: string, thread: AiThreadRecord): number {
  const normalized = `${memory.content} ${memory.normalizedContent}`.toLowerCase();
  const terms = queryTerms(query);
  const keywordScore = terms.reduce((score, term) => score + (normalized.includes(term) ? 3 : 0), 0);
  const scopeScore =
    memory.scope === 'thread' && memory.scopeId === thread.id ? 5 :
    memory.scope === 'ip' && memory.scopeId === String(thread.boundIpId ?? '') ? 5 :
    memory.scope === 'knowledge_base' && memory.scopeId === (thread.boundKnowledgeBaseId ?? '') ? 5 :
    memory.scope === 'global' ? 2 : 0;
  const importanceScore = memory.importance * 2;
  const assetScore = memory.imageAssetId != null || memory.groupId != null || memory.ipId != null ? 2 : 0;
  const recencyScore = memory.lastUsedAt ? 1 : 0;
  const embeddingScore = 0;
  const fallbackScore = keywordScore === 0 ? 0.5 : 0;
  return keywordScore + scopeScore + importanceScore + assetScore + recencyScore + embeddingScore + fallbackScore;
}
```

Update `retrieveDynamicMemoryContext(thread, userMessage)` to:

- list active memories
- score them
- take top 6
- format as `相关记忆：`

Keep embedding hook as a future optional extension if no current embedding vector exists for memory.

- [ ] **Step 4: Verify retrieval policy passes**

Run:

```powershell
pnpm test -- tests/ai-rag-policy.test.cjs
```

Expected: pass.

## Task 10: Full Verification And Android Acceptance

**Files:**

- No required file changes unless verification finds defects.

- [ ] **Step 1: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: pass.

- [ ] **Step 2: Run full tests**

Run:

```powershell
pnpm test
```

Expected: all tests pass.

- [ ] **Step 3: Check whitespace**

Run:

```powershell
git diff --check
```

Expected: no whitespace errors. LF/CRLF warnings are acceptable if consistent with current repository behavior.

- [ ] **Step 4: Android manual acceptance**

On a device or emulator:

1. Enable deep memory for a thread.
2. Send: `记住，我更喜欢扁平插画风格。`
3. Confirm capture notice appears.
4. Tap `管理`.
5. Confirm Memory Board shows the memory.
6. Edit the memory and return to chat.
7. Ask a related question and confirm the memory can influence the answer naturally.
8. Delete the memory.
9. Ask again and confirm deleted memory is no longer used.
10. Send 5 ordinary turns and confirm the UI remains responsive.
11. Open an IP-scoped chat and manually add an IP memory.
12. Confirm the memory is scoped and visible in Memory Board.

- [ ] **Step 5: Report remaining risks**

Report:

- whether FTS5 is available or deferred
- whether Android background consolidation was verified
- whether capture notice is wired to real saved memories or only local state
- whether IP image binding was manually tested with real assets

## Task 11: Chat Feedback And Safe Links

**Files:**

- Create: `src/components/ai/AiInlineFeedback.tsx`
- Modify: `src/components/ai/AiMessageBubble.tsx`
- Modify: `src/components/ai/AiMessageContent.tsx`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] Add policy tests for message copy feedback, code copy feedback, `Linking.openURL`, and unsupported scheme protection.
- [ ] Create a compact AI-light feedback chip for success/error states using shared tokens.
- [ ] Show temporary feedback after full-message copy and code-block copy without significant layout shift.
- [ ] In `AiMessageContent`, open only `http` and `https` URLs through `Linking.openURL`.
- [ ] Show readable feedback if opening a link fails.
- [ ] Verify with `pnpm test -- tests/ai-chat-fixes-policy.test.cjs`.

Acceptance:

- Copy message and copy code provide visible feedback.
- Safe links open.
- Unsupported links do not open.
- Markdown images remain unsupported.

## Task 12: Voice Input State

**Files:**

- Create: `src/components/ai/AiVoiceInputStatus.tsx`
- Modify: `src/components/ai/AiChatComposer.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] Add policy tests for listening, recognizing, error, cancel, permission denied, and unavailable recognizer states.
- [ ] Create `AiVoiceInputStatus`.
- [ ] Add `voiceState` and `voiceError` props to `AiChatComposer`.
- [ ] Set state immediately when mic is tapped.
- [ ] Clear state after success, cancellation, or handled error.
- [ ] Verify focused tests.

Acceptance:

- Voice input never leaves the user blind-waiting.
- Permission and unavailable errors are readable.
- Mic remains available after replies.

## Task 13: Empty Chat Suggestions

**Files:**

- Create: `src/components/ai/AiEmptyChatSuggestions.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `tests/ai-navigation-policy.test.cjs`

- [ ] Add policy tests for normal/IP/knowledge-base suggestions.
- [ ] Create compact suggestion chips/cards using AI light tokens.
- [ ] Render only when the thread has no messages.
- [ ] Tapping a suggestion fills the composer.
- [ ] Hide suggestions after the first user message.
- [ ] Verify focused tests.

Acceptance:

- New empty chats are not blank.
- Suggestions match context.

## Task 14: Error Presentation And Recovery

**Files:**

- Create: `src/components/ai/AiChatErrorBanner.tsx`
- Modify: `src/components/ai/AiMessageBubble.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `src/ai/aiChatService.ts`
- Modify: `tests/ai-final-acceptance-policy.test.cjs`

- [ ] Add policy tests for readable API key, quota/balance, unavailable model, network, and generic errors.
- [ ] Show thread-level errors near the composer/latest area.
- [ ] Style failed assistant bubbles distinctly.
- [ ] Add retry affordance for recoverable failed assistant messages.
- [ ] Preserve partial content after stream failure.
- [ ] Verify focused tests.

Acceptance:

- User sees errors near the place they act.
- Recoverable errors can retry.

## Task 15: Context Budget Manager

**Files:**

- Create: `src/ai/aiContextBudget.ts`
- Modify: `src/ai/aiChatService.ts`
- Modify: `src/ai/promptBuilder.ts`
- Modify: `tests/ai-rag-policy.test.cjs`

- [ ] Add policy tests for approximate token budget and protected current user message/role instruction.
- [ ] Implement `estimatePromptTokens`.
- [ ] Implement conservative model context budget fallback.
- [ ] Trim chat history, memory context, and RAG snippets by priority.
- [ ] Store context-trimmed state in prompt snapshot.
- [ ] Surface a subtle UI note when older context may no longer be referenced.
- [ ] Verify focused tests.

Acceptance:

- Prompt assembly is budget-aware, not only count-aware.
- Current user request and core instructions are preserved.

## Task 16: Long Chat Navigation

**Files:**

- Create: `src/components/ai/AiScrollToLatestButton.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] Add policy tests for scroll-to-latest visibility and loading earlier state.
- [ ] Track whether latest message is visible.
- [ ] Show floating button only when away from latest.
- [ ] Add loading state for `加载更早消息`.
- [ ] Ensure streaming does not force-scroll while user reads older messages.
- [ ] Verify focused tests.

Acceptance:

- Long chats can return to latest quickly.
- Loading older messages gives visible state.

## Task 17: Date Separators And User Time

**Files:**

- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `src/components/ai/AiMessageBubble.tsx`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] Add policy tests for date separators and user message timestamps.
- [ ] Add date separator list items.
- [ ] Format today/yesterday/absolute date.
- [ ] Show minute-level time for user messages.
- [ ] Keep version/action row usable.
- [ ] Verify focused tests.

Acceptance:

- Long conversations have clear time structure.

## Task 18: Quick New Chat And Recent Switcher

**Files:**

- Create: `src/components/ai/AiRecentThreadSwitcher.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `App.tsx`
- Modify: `tests/ai-navigation-policy.test.cjs`

- [ ] Add policy tests for chat-page new chat and recent switcher.
- [ ] Add new-chat action in chat header.
- [ ] Add compact recent thread switcher.
- [ ] Switching routes to selected thread without mutating current thread.
- [ ] Keep AI Workbench unchanged.
- [ ] Verify focused tests.

Acceptance:

- User can start and switch chats from the chat page.

## Task 19: History Search And Grouping

**Files:**

- Modify: `src/screens/AiHistoryScreen.tsx`
- Modify: `src/database/repositories/aiThreadRepository.ts`
- Modify: `tests/ai-navigation-policy.test.cjs`

- [ ] Add policy tests for search and date grouping.
- [ ] Extend history query with `searchText`.
- [ ] Search title and last message preview.
- [ ] Preserve normal/personal space scoping and existing filters.
- [ ] Group by today/yesterday/past 7 days/older.
- [ ] Add designed empty states for no history and no results.
- [ ] Verify focused tests.

Acceptance:

- Old conversations are findable and time-organized.

## Task 20: Thinking And Streaming Polish

**Files:**

- Modify: `src/components/ai/AiThinkingBlock.tsx`
- Modify: `src/components/ai/AiMessageBubble.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] Add policy tests for live reasoning display, activity indicator, and unchanged 0.1-second precision.
- [ ] Allow reasoning text to be viewed while generating.
- [ ] Add subtle activity indicator.
- [ ] Add expand/collapse transition.
- [ ] Add subtle assistant streaming cursor/typing indicator.
- [ ] Keep timer precision unchanged.
- [ ] Verify focused tests.

Acceptance:

- Thinking feels active without changing requested timing behavior.

## Task 21: Session Settings Polish

**Files:**

- Modify: `src/screens/AiSessionConfigScreen.tsx`
- Modify: `src/ai/aiChatService.ts`
- Modify: `tests/ai-final-acceptance-policy.test.cjs`

- [ ] Add policy tests for lightweight autosave, no raw thread ID subtitle, option explanations, and delete isolation.
- [ ] Autosave reply preference, material boundary mode, and deep memory switch.
- [ ] Keep advanced role instruction explicit-save or blur-save.
- [ ] Add explanations for material scope and reply preference.
- [ ] Remove raw thread ID from subtitle.
- [ ] Move delete into a visually separate danger section.
- [ ] Verify focused tests.

Acceptance:

- Lightweight settings cannot be forgotten.
- Dangerous actions are clearly separated.

## Task 22: Composer And Attachment Polish

**Files:**

- Modify: `src/components/ai/AiChatComposer.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] Add policy tests for smooth height transition, image thumbnails, disabled send visual state, and context-aware placeholder.
- [ ] Add smooth composer height transition while preserving six-line cap.
- [ ] Show thumbnails for image attachments.
- [ ] Keep non-image attachments compact.
- [ ] Improve disabled send state.
- [ ] Generate placeholder by context type.
- [ ] Verify focused tests.

Acceptance:

- Composer feels smoother and image attachments are recognizable.

## Task 23: Unified Final Verification

**Files:**

- No planned source changes unless defects are found.

- [ ] Run:

```powershell
pnpm typecheck
pnpm test
git diff --check
```

- [ ] Android manual acceptance must cover:

1. Memory Board add/edit/delete.
2. Capture notice undo/manage.
3. IP-scoped memory.
4. Empty chat suggestions.
5. Voice states.
6. Copy and link feedback.
7. Context trimming note.
8. Scroll-to-latest.
9. Date separators and user times.
10. Quick new chat and recent switcher.
11. History search and grouping.
12. Settings autosave.
13. Inline rewrite, version switch, regenerate, RAG, and video long-press regressions.
