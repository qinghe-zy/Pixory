# AI Chat Continuity Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Pixory AI chat continuity import with one auto-detected entry, deterministic native Markdown import, external continuity document import, import-session tracking, import-aware memory review gating, and 10-round rollback for imported continuity branches.

**Architecture:** Add a dedicated continuity-import service layer on top of the existing thread/message/branch system. Use a new import-session persistence model plus a synthetic import branch root so native and external imports converge on the same branch workflow. Gate external imported messages out of irreversible ordinary memory maintenance until review acceptance, and treat all import-derived maintenance outputs as reversible during the observation window.

**Tech Stack:** TypeScript, Expo React Native, Expo SQLite, expo-document-picker, existing Pixory AI chat services, node:test policy tests, repo-local unit tests for pure parsers/services.

---

## File Map

### New files

- `src/ai/aiContinuityImportTypes.ts`
  - Shared import-session enums, parser result types, rollback state, review gate state, and native/external mode tags.
- `src/ai/aiContinuityImportParser.ts`
  - Detect native vs external files, parse native Markdown deterministically, parse external template/tolerant sections, split reconstructible transcript messages from continuity text blocks.
- `src/ai/aiContinuityImportService.ts`
  - High-level import orchestration, synthetic import root creation, import-session persistence wiring, branch injection, review-gate decisions, rollback entry point, stabilization updates.
- `src/ai/aiContinuityImportReviewService.ts`
  - Bridge external continuity import payloads into Pixory's existing memory-review flow, persist accepted/failed review state, and emit reversible review outputs during observation.
- `tests/ai-chat-continuity-import-policy.test.cjs`
  - Policy coverage for schema, service integration, memory gate, branch root, rollback, UI entry, and feature-matrix update.
- `tests/ai-chat-continuity-import-parser.test.cjs`
  - Focused parser tests for native detection, external section extraction, transcript splitting, and fallback behavior.

### Modified files

- `src/database/schema.ts`
  - Add migration V43 and database version bump for import-session tables and import-related message metadata.
- `src/database/db.ts`
  - Run migration V43.
- `src/ai/types.ts`
  - Add import-related source kinds / synthetic message metadata types when needed by shared records.
- `src/database/repositories/aiThreadRepository.ts`
  - Add import-session CRUD, synthetic import root helpers, import-aware message metadata helpers, rollback/stabilization updates, round counting helpers, maintenance query gating support.
- `src/ai/aiRoleCardContinuityExport.ts`
  - Add explicit native Markdown markers and machine-parseable structural sections for deterministic import.
- `src/ai/aiRoleCardContinuityExportService.ts`
  - Ensure export output satisfies the V1 native Markdown contract.
- `src/ai/aiChatService.ts`
  - Expose thread-level continuity import entry points, import-aware message listing if needed, and route switching after import.
- `src/ai/aiMemoryMaintenanceQueue.ts`
  - Skip irreversible ordinary maintenance for external imported messages before review acceptance; preserve import-aware reversible outputs during observation.
- `src/ai/aiMemoryCaptureService.ts`
  - Respect import review gate / reversible attribution when capture is triggered from imported continuity context.
- `src/ai/aiMemoryProfileService.ts`
  - Respect import review gate and reversible attribution.
- `src/ai/aiMemoryReconciliationService.ts`
  - Reuse structured review output rules for external continuity acceptance where possible.
- `src/ai/aiMemorySummaryService.ts`
  - Respect import review gate and reversible attribution for summary segments.
- `src/screens/AiSessionConfigScreen.tsx`
  - Add continuity-import action near current role continuity export controls.
- `src/screens/AiChatScreen.tsx`
  - Add continuity milestone rendering / action hooks if milestone is rendered in chat flow rather than only through repository data.
- `docs/feature-matrix.md`
  - Add continuity import capability and rollback/memory-review coverage.

### Existing files to inspect while implementing

- `src/ai/aiBranchTreeService.ts`
- `src/ai/aiMemoryMaintenanceService.ts`
- `src/database/repositories/aiRoleCardRepository.ts`
- `tests/ai-role-card-export-policy.test.cjs`
- `tests/ai-chat-fixes-policy.test.cjs`

## Task 1: Add Continuity Import Persistence And Shared Types

**Files:**
- Create: `src/ai/aiContinuityImportTypes.ts`
- Modify: `src/database/schema.ts`
- Modify: `src/database/db.ts`
- Modify: `src/ai/types.ts`
- Modify: `src/database/repositories/aiThreadRepository.ts`
- Test: `tests/ai-chat-continuity-import-policy.test.cjs`

- [ ] **Step 1: Write the failing policy test for schema/version/import-session metadata**

```js
test('continuity import persistence adds import sessions and V43 migration', () => {
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const types = read('src/ai/aiContinuityImportTypes.ts');

  assert.match(schema, /DATABASE_VERSION = 43/);
  assert.match(schema, /export const MIGRATION_STATEMENTS_V43 = `/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_continuity_import_sessions/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_continuity_import_blocks/);
  assert.match(schema, /ALTER TABLE ai_messages ADD COLUMN continuityImportSessionId TEXT/);
  assert.match(schema, /ALTER TABLE ai_messages ADD COLUMN continuitySyntheticKind TEXT/);
  assert.match(schema, /CREATE INDEX IF NOT EXISTS idx_ai_messages_continuity_import_session/);
  assert.match(db, /MIGRATION_STATEMENTS_V43/);
  assert.match(db, /currentVersion < 43/);
  assert.match(repository, /export interface AiContinuityImportSessionRecord/);
  assert.match(repository, /createContinuityImportSession/);
  assert.match(repository, /listContinuityImportBlocksBySessionId/);
  assert.match(repository, /createContinuityImportBlocks/);
  assert.match(types, /export type AiContinuityImportSourceKind/);
  assert.match(types, /export type AiContinuityImportReviewGateState/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/ai-chat-continuity-import-policy.test.cjs
```

Expected: FAIL with missing `DATABASE_VERSION = 43`, missing `MIGRATION_STATEMENTS_V43`, and missing continuity import types/repository symbols.

- [ ] **Step 3: Add minimal schema/types/repository scaffolding**

```ts
// src/ai/aiContinuityImportTypes.ts
export type AiContinuityImportSourceKind = 'pixory_native_markdown' | 'external_markdown' | 'external_text';
export type AiContinuityImportReviewGateState = 'not_required' | 'pending_review' | 'accepted' | 'failed' | 'rolled_back' | 'stabilized';
export type AiContinuityImportRollbackState = 'available' | 'locked' | 'rolled_back';
export type AiContinuitySyntheticMessageKind = 'continuity_import_root' | 'continuity_import_milestone';
```

```sql
-- src/database/schema.ts, MIGRATION_STATEMENTS_V43
CREATE TABLE IF NOT EXISTS ai_continuity_import_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  threadId TEXT NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  sourceKind TEXT NOT NULL,
  sourcePlatform TEXT,
  formatVersion TEXT,
  status TEXT NOT NULL,
  rollbackState TEXT NOT NULL,
  rollbackRoundsRemaining INTEGER NOT NULL DEFAULT 10,
  reviewGateState TEXT NOT NULL,
  preImportBranchRootMessageId TEXT,
  preImportBranchVersionIndex INTEGER,
  importedBranchRootMessageId TEXT,
  importedBranchVersionIndex INTEGER,
  importAnchorMessageId TEXT,
  importAnchorMessageRole TEXT,
  importBranchRootKind TEXT,
  rawDocumentText TEXT NOT NULL,
  rawDocumentHash TEXT NOT NULL,
  parsedMessageCount INTEGER NOT NULL DEFAULT 0,
  containsCompressedContinuity INTEGER NOT NULL DEFAULT 0,
  memoryReviewStatus TEXT,
  memoryReviewError TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  rolledBackAt TEXT,
  stabilizedAt TEXT,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_continuity_import_blocks (
  id TEXT PRIMARY KEY NOT NULL,
  importSessionId TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (importSessionId) REFERENCES ai_continuity_import_sessions(id) ON DELETE CASCADE
);

ALTER TABLE ai_messages ADD COLUMN continuityImportSessionId TEXT REFERENCES ai_continuity_import_sessions(id) ON DELETE SET NULL;
ALTER TABLE ai_messages ADD COLUMN continuitySyntheticKind TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_messages_continuity_import_session
  ON ai_messages(continuityImportSessionId, continuitySyntheticKind, createdAt);
```

```ts
// src/database/repositories/aiThreadRepository.ts
export interface AiContinuityImportSessionRecord {
  id: string;
  threadId: string;
  space: PixorySpace;
  sourceKind: string;
  reviewGateState: string;
  rollbackRoundsRemaining: number;
  importedBranchRootMessageId: string | null;
  importedBranchVersionIndex: number | null;
  rawDocumentText: string;
  createdAt: string;
  updatedAt: string;
}

async function createContinuityImportSession(/* ... */) { /* minimal insert */ }
async function createContinuityImportBlocks(/* ... */) { /* minimal insert */ }
```

- [ ] **Step 4: Run the focused policy test to verify it passes**

Run:

```bash
node --test tests/ai-chat-continuity-import-policy.test.cjs
```

Expected: PASS for schema/version/import-session scaffolding assertions.

- [ ] **Step 5: Commit**

```bash
git add src/ai/aiContinuityImportTypes.ts src/database/schema.ts src/database/db.ts src/ai/types.ts src/database/repositories/aiThreadRepository.ts tests/ai-chat-continuity-import-policy.test.cjs
git commit -m "feat: add continuity import persistence scaffolding"
```

## Task 2: Upgrade Native Continuity Markdown Export For Deterministic Import

**Files:**
- Modify: `src/ai/aiRoleCardContinuityExport.ts`
- Modify: `src/ai/aiRoleCardContinuityExportService.ts`
- Test: `tests/ai-role-card-export-policy.test.cjs`
- Test: `tests/ai-chat-continuity-import-parser.test.cjs`

- [ ] **Step 1: Write the failing native-format tests**

```js
test('role continuity markdown exports explicit pixory native continuity markers', () => {
  const exporter = read('src/ai/aiRoleCardContinuityExport.ts');
  assert.match(exporter, /# Pixory Role Continuity Export/);
  assert.match(exporter, /## Native Continuity Metadata/);
  assert.match(exporter, /- Format Version: 1/);
  assert.match(exporter, /- Source: pixory-native/);
  assert.match(exporter, /## Native Branch Payload/);
  assert.match(exporter, /## Native Message Payload/);
  assert.match(exporter, /## Native Summary Payload/);
  assert.match(exporter, /## Native Memory Payload/);
});
```

```js
test('native continuity parser recognizes pixory markdown deterministically', async () => {
  const { detectContinuityImportMode } = await import('../src/ai/aiContinuityImportParser.ts');
  const mode = detectContinuityImportMode(`# Pixory Role Continuity Export\n\n## Native Continuity Metadata\n- Format Version: 1\n- Source: pixory-native\n`);
  assert.equal(mode.mode, 'pixory_native_markdown');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test tests/ai-role-card-export-policy.test.cjs tests/ai-chat-continuity-import-parser.test.cjs
```

Expected: FAIL with missing native continuity metadata markers and missing parser module/symbol.

- [ ] **Step 3: Add explicit native sections to the exporter**

```ts
// inside buildRoleContinuityMarkdown(...)
return [
  '# Pixory Role Continuity Export',
  '',
  '## Native Continuity Metadata',
  '',
  '- Format Version: 1',
  '- Source: pixory-native',
  `- Space: ${input.space}`,
  `- Exported At: ${input.exportedAt}`,
  '',
  '## Native Branch Payload',
  '',
  fencedText(JSON.stringify({
    threadId: thread?.id ?? null,
    currentBranchRootMessageId: thread?.currentBranchRootMessageId ?? null,
    currentBranchVersionIndex: thread?.currentBranchVersionIndex ?? null,
    exportBranchScopes: messages.map((message) => ({
      branchRootMessageId: message.branchRootMessageId ?? null,
      branchVersionIndex: message.branchVersionIndex ?? null,
    })),
  }, null, 2)),
  '',
  '## Native Message Payload',
  '',
  fencedText(JSON.stringify(messages, null, 2)),
  '',
  '## Native Summary Payload',
  '',
  fencedText(JSON.stringify({ threadSummary: thread?.summary ?? null }, null, 2)),
  '',
  '## Native Memory Payload',
  '',
  fencedText(JSON.stringify(memories, null, 2)),
  // ...existing human-readable sections...
].join('\n');
```

- [ ] **Step 4: Add parser-side native mode detection**

```ts
// src/ai/aiContinuityImportParser.ts
export function detectContinuityImportMode(text: string): { mode: 'pixory_native_markdown' | 'external_markdown' | 'external_text' } {
  if (/^# Pixory Role Continuity Export/m.test(text) && /Source:\s*pixory-native/i.test(text)) {
    return { mode: 'pixory_native_markdown' };
  }
  if (/^#|^##/m.test(text)) {
    return { mode: 'external_markdown' };
  }
  return { mode: 'external_text' };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
node --test tests/ai-role-card-export-policy.test.cjs tests/ai-chat-continuity-import-parser.test.cjs
```

Expected: PASS for native marker and native detection coverage.

- [ ] **Step 6: Commit**

```bash
git add src/ai/aiRoleCardContinuityExport.ts src/ai/aiRoleCardContinuityExportService.ts src/ai/aiContinuityImportParser.ts tests/ai-role-card-export-policy.test.cjs tests/ai-chat-continuity-import-parser.test.cjs
git commit -m "feat: mark continuity markdown as native import format"
```

## Task 3: Build The Continuity Parser And Import Session Service

**Files:**
- Create: `src/ai/aiContinuityImportParser.ts`
- Create: `src/ai/aiContinuityImportService.ts`
- Modify: `src/database/repositories/aiThreadRepository.ts`
- Test: `tests/ai-chat-continuity-import-parser.test.cjs`
- Test: `tests/ai-chat-continuity-import-policy.test.cjs`

- [ ] **Step 1: Write the failing parser/service tests for external split behavior**

```js
test('external continuity parser separates transcript messages from continuity blocks', async () => {
  const { parseContinuityImportDocument } = await import('../src/ai/aiContinuityImportParser.ts');
  const parsed = parseContinuityImportDocument({
    fileName: 'handoff.md',
    text: [
      '# Continuity',
      '## State Continuity Summary',
      '他们在车站分别前仍未说开。',
      '## Chat Transcript',
      'user: 你还会回来吗？',
      'assistant: 我会。',
    ].join('\n'),
  });

  assert.equal(parsed.mode, 'external_markdown');
  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.blocks.length, 1);
  assert.equal(parsed.blocks[0].kind, 'state_continuity_summary');
});
```

```js
test('continuity import service creates a pending review gate for external imports', () => {
  const service = read('src/ai/aiContinuityImportService.ts');
  assert.match(service, /reviewGateState:\s*parsed\.mode === 'pixory_native_markdown' \? 'not_required' : 'pending_review'/);
  assert.match(service, /createContinuityImportSession/);
  assert.match(service, /createContinuityImportBlocks/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test tests/ai-chat-continuity-import-parser.test.cjs tests/ai-chat-continuity-import-policy.test.cjs
```

Expected: FAIL because parser result shape and service review gate logic do not exist yet.

- [ ] **Step 3: Implement parser result shapes and section splitting**

```ts
export interface ParsedContinuityTranscriptMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string | null;
}

export interface ParsedContinuityBlock {
  kind: 'relationship_summary' | 'psychology' | 'biological_state' | 'state_continuity_summary' | 'compressed_history' | 'memory_candidates' | 'unknown';
  title: string;
  content: string;
}

export function parseContinuityImportDocument(input: { fileName: string; text: string }) {
  const mode = detectContinuityImportMode(input.text).mode;
  // native markdown branch here...
  // external markdown/text section extraction here...
  return {
    mode,
    messages,
    blocks,
    rawText: input.text,
    containsCompressedContinuity,
  };
}
```

- [ ] **Step 4: Implement import-session creation scaffolding in the service**

```ts
export async function createContinuityImportDraft(input: {
  fileName: string;
  text: string;
  space: PixorySpace;
  threadId: string;
}) {
  const parsed = parseContinuityImportDocument({ fileName: input.fileName, text: input.text });
  return runWithDatabaseSpace(input.space, async (db) => {
    const session = await aiThreadRepository.createContinuityImportSession(db, {
      id: createAiId('aiimport'),
      threadId: input.threadId,
      space: input.space,
      sourceKind: parsed.mode,
      reviewGateState: parsed.mode === 'pixory_native_markdown' ? 'not_required' : 'pending_review',
      rollbackState: 'available',
      rollbackRoundsRemaining: 10,
      rawDocumentText: parsed.rawText,
      parsedMessageCount: parsed.messages.length,
      containsCompressedContinuity: parsed.containsCompressedContinuity,
    });
    await aiThreadRepository.createContinuityImportBlocks(db, session.id, parsed.blocks);
    return session;
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
node --test tests/ai-chat-continuity-import-parser.test.cjs tests/ai-chat-continuity-import-policy.test.cjs
```

Expected: PASS for parser splitting and pending review gate expectations.

- [ ] **Step 6: Commit**

```bash
git add src/ai/aiContinuityImportParser.ts src/ai/aiContinuityImportService.ts src/database/repositories/aiThreadRepository.ts tests/ai-chat-continuity-import-parser.test.cjs tests/ai-chat-continuity-import-policy.test.cjs
git commit -m "feat: add continuity import parser and session drafts"
```

## Task 4: Inject Imported Continuity Into A Synthetic Import Branch

**Files:**
- Modify: `src/database/repositories/aiThreadRepository.ts`
- Modify: `src/ai/aiChatService.ts`
- Modify: `src/ai/aiContinuityImportService.ts`
- Test: `tests/ai-chat-continuity-import-policy.test.cjs`

- [ ] **Step 1: Write the failing policy test for synthetic import root and branch activation**

```js
test('continuity import creates a synthetic branch root and activates the imported route', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const service = read('src/ai/aiContinuityImportService.ts');
  const chatService = read('src/ai/aiChatService.ts');

  assert.match(repository, /createSyntheticContinuityImportRoot/);
  assert.match(repository, /continuitySyntheticKind:\s*input\.continuitySyntheticKind/);
  assert.match(repository, /continuityImportSessionId:\s*input\.continuityImportSessionId/);
  assert.match(service, /createSyntheticContinuityImportRoot/);
  assert.match(service, /branchRootMessageId:\s*importRoot\.id/);
  assert.match(service, /branchVersionIndex:\s*1/);
  assert.match(repository, /listThreadContinuityMilestones/);
  assert.match(chatService, /export async function importThreadContinuity/);
});
```

- [ ] **Step 2: Run the policy test to verify it fails**

Run:

```bash
node --test tests/ai-chat-continuity-import-policy.test.cjs
```

Expected: FAIL because synthetic import root helpers and thread import entry point do not exist.

- [ ] **Step 3: Add repository helpers for synthetic import root and imported message insertion**

```ts
async function createSyntheticContinuityImportRoot(db: SQLiteDatabase, input: {
  id: string;
  threadId: string;
  importSessionId: string;
  createdAt: string;
}): Promise<AiMessageRecord> {
  return aiThreadRepository.createMessage(db, {
    id: input.id,
    threadId: input.threadId,
    role: 'system',
    status: 'completed',
    content: '已接回外部对话',
    branchRootMessageId: null,
    branchVersionIndex: null,
    continuityImportSessionId: input.importSessionId,
    continuitySyntheticKind: 'continuity_import_root',
    completedAt: input.createdAt,
  });
}
```

- [ ] **Step 4: Implement import orchestration and thread route activation**

```ts
export async function importThreadContinuity(input: {
  fileName: string;
  text: string;
  space: PixorySpace;
  threadId: string;
}) {
  const parsed = parseContinuityImportDocument({ fileName: input.fileName, text: input.text });
  return runWithDatabaseSpace(input.space, async (db) => {
    const session = await aiThreadRepository.createContinuityImportSession(db, /* ... */);
    const importRoot = await aiThreadRepository.createSyntheticContinuityImportRoot(db, /* ... */);
    for (const message of parsed.messages) {
      await aiThreadRepository.createMessage(db, {
        id: createAiId('aimsg'),
        threadId: input.threadId,
        role: message.role,
        status: 'completed',
        content: message.content,
        branchRootMessageId: importRoot.id,
        branchVersionIndex: 1,
        continuityImportSessionId: session.id,
      });
    }
    await aiThreadRepository.updateThread(db, input.threadId, {
      currentBranchRootMessageId: importRoot.id,
      currentBranchVersionIndex: 1,
    });
    return { importRoot, session };
  });
}
```

- [ ] **Step 5: Run the policy test to verify it passes**

Run:

```bash
node --test tests/ai-chat-continuity-import-policy.test.cjs
```

Expected: PASS for synthetic root and imported branch activation assertions.

- [ ] **Step 6: Commit**

```bash
git add src/database/repositories/aiThreadRepository.ts src/ai/aiContinuityImportService.ts src/ai/aiChatService.ts tests/ai-chat-continuity-import-policy.test.cjs
git commit -m "feat: inject continuity imports into synthetic branches"
```

## Task 5: Add External Import Memory Review Integration, Gating, And Reversible Maintenance

**Files:**
- Create: `src/ai/aiContinuityImportReviewService.ts`
- Modify: `src/ai/aiMemoryMaintenanceQueue.ts`
- Modify: `src/ai/aiMemoryCaptureService.ts`
- Modify: `src/ai/aiMemoryProfileService.ts`
- Modify: `src/ai/aiMemoryReconciliationService.ts`
- Modify: `src/ai/aiMemorySummaryService.ts`
- Modify: `src/ai/aiContinuityImportService.ts`
- Modify: `src/database/repositories/aiThreadRepository.ts`
- Test: `tests/ai-chat-continuity-import-policy.test.cjs`

- [ ] **Step 1: Write the failing policy test for review gate and reversible maintenance**

```js
test('external imported messages are reviewed, gated, and only become accepted after review result persistence', () => {
  const review = read('src/ai/aiContinuityImportReviewService.ts');
  const queue = read('src/ai/aiMemoryMaintenanceQueue.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const summary = read('src/ai/aiMemorySummaryService.ts');
  const profile = read('src/ai/aiMemoryProfileService.ts');
  const reconciliation = read('src/ai/aiMemoryReconciliationService.ts');

  assert.match(review, /export async function reviewContinuityImportSession/);
  assert.match(review, /rawDocumentText/);
  assert.match(review, /parsedMessages/);
  assert.match(review, /continuityBlocks/);
  assert.match(review, /markContinuityImportReviewAccepted/);
  assert.match(review, /markContinuityImportReviewFailed/);
  assert.match(queue, /loadContinuityImportReviewGateState/);
  assert.match(queue, /if \(reviewGateState === 'pending_review' \|\| reviewGateState === 'failed'\)/);
  assert.match(queue, /reversibleImportSessionId/);
  assert.match(summary, /reversibleImportSessionId/);
  assert.match(profile, /reversibleImportSessionId/);
  assert.match(reconciliation, /buildMemoryReconciliationPrompt/);
  assert.match(repository, /createReversibleContinuitySummarySegment/);
});
```

- [ ] **Step 2: Run the policy test to verify it fails**

Run:

```bash
node --test tests/ai-chat-continuity-import-policy.test.cjs
```

Expected: FAIL because no review service, no review state transitions, and no reversible attribution exists yet.

- [ ] **Step 3: Add the continuity import review service and review result persistence**

```ts
// src/ai/aiContinuityImportReviewService.ts
export async function reviewContinuityImportSession(input: {
  importSessionId: string;
  space: PixorySpace;
}) {
  const session = await loadContinuityImportReviewInput(input.space, input.importSessionId);
  try {
    const prompt = buildMemoryReconciliationPrompt({
      conversationText: buildContinuityConversationText(session.rawDocumentText, session.parsedMessages, session.continuityBlocks),
      candidateMemories: session.candidateMemories,
    });
    const result = await runContinuityReviewModel(prompt);
    await persistContinuityReviewAccepted(input.space, input.importSessionId, result);
  } catch (error) {
    await persistContinuityReviewFailed(input.space, input.importSessionId, error);
  }
}
```

```ts
// aiThreadRepository helpers
async function markContinuityImportReviewAccepted(/* ... */) { /* set reviewGateState='accepted' */ }
async function markContinuityImportReviewFailed(/* ... */) { /* set reviewGateState='failed' */ }
```

- [ ] **Step 4: Add import-aware maintenance context loading**

```ts
// aiMemoryMaintenanceQueue.ts
const reviewGateState = await aiThreadRepository.loadContinuityImportReviewGateState(db, input.threadId, branchScopes);
if (reviewGateState === 'pending_review' || reviewGateState === 'failed') {
  allowIrreversibleImportEffects = false;
}
```

```ts
// shared context shape passed through maintenance functions
type ImportAwareMaintenanceContext = {
  reversibleImportSessionId?: string | null;
  allowIrreversibleImportEffects: boolean;
};
```

- [ ] **Step 5: Thread reversible attribution through summary/profile/capture paths**

```ts
await maybeUpdateUserProfile(input.space, input.threadId, reason, {
  allowRemoteModel,
  branchScopes,
  reversibleImportSessionId,
  allowIrreversibleImportEffects,
});
```

```ts
if (!options.allowIrreversibleImportEffects && options.reversibleImportSessionId) {
  await aiThreadRepository.createReversibleContinuitySummarySegment(db, {
    importSessionId: options.reversibleImportSessionId,
    // ...
  });
  return localStepResult;
}
```

- [ ] **Step 6: Trigger external review after import branch creation**

```ts
// src/ai/aiContinuityImportService.ts
if (session.reviewGateState === 'pending_review') {
  void reviewContinuityImportSession({
    importSessionId: session.id,
    space: input.space,
  });
}
```

- [ ] **Step 7: Run the policy test to verify it passes**

Run:

```bash
node --test tests/ai-chat-continuity-import-policy.test.cjs
```

Expected: PASS for review service, review gate, and reversible maintenance assertions.

- [ ] **Step 8: Commit**

```bash
git add src/ai/aiContinuityImportReviewService.ts src/ai/aiMemoryMaintenanceQueue.ts src/ai/aiMemoryCaptureService.ts src/ai/aiMemoryProfileService.ts src/ai/aiMemoryReconciliationService.ts src/ai/aiMemorySummaryService.ts src/ai/aiContinuityImportService.ts src/database/repositories/aiThreadRepository.ts tests/ai-chat-continuity-import-policy.test.cjs
git commit -m "feat: add continuity import review and maintenance gating"
```

## Task 6: Track Observation Window, Stabilize Imports, And Implement Rollback

**Files:**
- Modify: `src/ai/aiContinuityImportService.ts`
- Modify: `src/database/repositories/aiThreadRepository.ts`
- Modify: `src/ai/aiChatService.ts`
- Test: `tests/ai-chat-continuity-import-policy.test.cjs`

- [ ] **Step 1: Write the failing policy test for rollback window and audit-preserving rollback**

```js
test('continuity rollback stays available for 10 effective rounds and preserves audit payload', () => {
  const service = read('src/ai/aiContinuityImportService.ts');
  const chatService = read('src/ai/aiChatService.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(service, /rollbackRoundsRemaining/);
  assert.match(service, /if \(rollbackRoundsRemaining <= 0\)/);
  assert.match(service, /rolledBackAt/);
  assert.match(service, /setContinuityImportRollbackState/);
  assert.match(repository, /excludeRolledBackContinuityPayload/);
  assert.match(repository, /reviewGateState:\s*'rolled_back'/);
  assert.match(chatService, /onContinuityImportConversationRoundCompleted/);
  assert.match(chatService, /assistantMessageId/);
});
```

- [ ] **Step 2: Run the policy test to verify it fails**

Run:

```bash
node --test tests/ai-chat-continuity-import-policy.test.cjs
```

Expected: FAIL with missing round tracking, rollback state update, and rolled-back payload hiding hooks.

- [ ] **Step 3: Add round counting / stabilization updates**

```ts
export async function onContinuityImportConversationRoundCompleted(input: {
  importSessionId: string;
  space: PixorySpace;
}) {
  const session = await aiThreadRepository.decrementContinuityRollbackRoundsRemaining(db, input.importSessionId);
  if (session.rollbackRoundsRemaining <= 0) {
    await aiThreadRepository.stabilizeContinuityImportSession(db, input.importSessionId, new Date().toISOString());
  }
}
```

- [ ] **Step 4: Wire round countdown into successful post-import conversation completion**

```ts
// src/ai/aiChatService.ts, after a completed assistant reply is durably written
const activeImportSessionId = await aiThreadRepository.findActiveContinuityImportSessionIdForBranch(
  db,
  input.thread.id,
  input.assistantMessageId
);
if (activeImportSessionId) {
  await onContinuityImportConversationRoundCompleted({
    importSessionId: activeImportSessionId,
    space: input.space,
  });
}
```

- [ ] **Step 5: Implement rollback without physical deletion**

```ts
export async function rollbackThreadContinuityImport(input: { importSessionId: string; space: PixorySpace }) {
  return runWithDatabaseSpace(input.space, async (db) => {
    const session = await aiThreadRepository.findContinuityImportSessionById(db, input.importSessionId);
    if (!session || session.rollbackState !== 'available' || session.rollbackRoundsRemaining <= 0) {
      throw new Error('该导入已稳定接入，不能回退。');
    }
    await aiThreadRepository.updateThread(db, session.threadId, {
      currentBranchRootMessageId: session.preImportBranchRootMessageId,
      currentBranchVersionIndex: session.preImportBranchVersionIndex,
    });
    await aiThreadRepository.markContinuityImportRolledBack(db, input.importSessionId, new Date().toISOString());
  });
}
```

- [ ] **Step 6: Run the policy test to verify it passes**

Run:

```bash
node --test tests/ai-chat-continuity-import-policy.test.cjs
```

Expected: PASS for rollback window, lifecycle wiring, and audit-preserving rollback assertions.

- [ ] **Step 7: Commit**

```bash
git add src/ai/aiContinuityImportService.ts src/database/repositories/aiThreadRepository.ts src/ai/aiChatService.ts tests/ai-chat-continuity-import-policy.test.cjs
git commit -m "feat: add continuity import stabilization and rollback"
```

## Task 7: Add UI Entry, Import Action, Milestone State, And Feature Matrix Update

**Files:**
- Modify: `src/screens/AiSessionConfigScreen.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `src/ai/aiChatService.ts`
- Modify: `src/database/repositories/aiThreadRepository.ts`
- Modify: `docs/feature-matrix.md`
- Test: `tests/ai-chat-continuity-import-policy.test.cjs`

- [ ] **Step 1: Write the failing policy test for UI entry and docs update**

```js
test('session config exposes continuity import and feature matrix records the capability', () => {
  const session = read('src/screens/AiSessionConfigScreen.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const matrix = read('docs/feature-matrix.md');

  assert.match(session, /接回外部对话/);
  assert.match(session, /DocumentPicker\.getDocumentAsync/);
  assert.match(session, /importThreadContinuity/);
  assert.match(repository, /listThreadContinuityMilestones/);
  assert.match(chat, /还可回退：剩余/);
  assert.match(chat, /已稳定接入，不能回退/);
  assert.match(matrix, /连续性导入|外部对话接回|原生连续性导入/);
});
```

- [ ] **Step 2: Run the policy test to verify it fails**

Run:

```bash
node --test tests/ai-chat-continuity-import-policy.test.cjs
```

Expected: FAIL because the UI entry, milestone text, and feature-matrix row do not exist yet.

- [ ] **Step 3: Add the session-config import action**

```tsx
<Pressable
  accessibilityRole="button"
  disabled={!threadId || exportingRolePackage || importingContinuity}
  onPress={() => void pickAndImportContinuity()}
  style={({ pressed }) => [styles.compactButton, pressed && styles.pressed]}
>
  <Text style={styles.compactButtonText}>{importingContinuity ? '导入中' : '接回外部对话'}</Text>
</Pressable>
```

```ts
async function pickAndImportContinuity() {
  const result = await DocumentPicker.getDocumentAsync({ multiple: false, type: ['text/plain', 'text/markdown', '*/*'] });
  if (result.canceled || !threadId) return;
  const asset = result.assets[0];
  const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
  await importThreadContinuity({ fileName: asset.name, text, space, threadId });
}
```

- [ ] **Step 4: Expose milestone state from repository/service to chat UI**

```ts
// src/database/repositories/aiThreadRepository.ts
export interface AiThreadContinuityMilestoneRecord {
  importSessionId: string;
  branchRootMessageId: string;
  rollbackState: 'available' | 'locked' | 'rolled_back';
  rollbackRoundsRemaining: number;
  sourceKind: string;
  sourcePlatform: string | null;
}

async function listThreadContinuityMilestones(db: SQLiteDatabase, threadId: string): Promise<AiThreadContinuityMilestoneRecord[]> {
  // join sessions with importedBranchRootMessageId / active state
}
```

```ts
// src/ai/aiChatService.ts
export async function loadThreadContinuityMilestones(space: PixorySpace, threadId: string) {
  return runWithDatabaseSpace(space, (db) => aiThreadRepository.listThreadContinuityMilestones(db, threadId));
}
```

- [ ] **Step 5: Surface milestone state and feature matrix entry**

```tsx
// AiChatScreen milestone copy when loading/imported messages
{rollbackState === 'available'
  ? `还可回退：剩余 ${rollbackRoundsRemaining} 轮`
  : '已稳定接入，不能回退'}
```

```md
| 连续性导入 | 原生 Markdown 精确导入、外部文档接回、10 轮回退窗口、导入记忆审读门禁 | `aiContinuityImport*`, `AiSessionConfigScreen`, `AiChatScreen` |
```

- [ ] **Step 6: Run the policy test and broad suite**

Run:

```bash
node --test tests/ai-chat-continuity-import-policy.test.cjs tests/ai-role-card-export-policy.test.cjs
pnpm typecheck
git diff --check
```

Expected:

- policy tests PASS
- `pnpm typecheck` exits 0
- `git diff --check` exits 0

- [ ] **Step 7: Commit**

```bash
git add src/screens/AiSessionConfigScreen.tsx src/screens/AiChatScreen.tsx src/ai/aiChatService.ts src/database/repositories/aiThreadRepository.ts docs/feature-matrix.md tests/ai-chat-continuity-import-policy.test.cjs
git commit -m "feat: add continuity import UI and docs"
```

## Task 8: Final Verification And Integration Sweep

**Files:**
- Verify only; no new code unless failures require surgical fixes

- [ ] **Step 1: Run the full targeted automated suite**

Run:

```bash
node --test tests/ai-chat-continuity-import-policy.test.cjs tests/ai-chat-continuity-import-parser.test.cjs tests/ai-role-card-export-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
```

Expected: PASS

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS with exit code 0

- [ ] **Step 3: Run repository diff sanity check**

Run:

```bash
git diff --check
git status --short
```

Expected:

- `git diff --check` prints nothing
- `git status --short` shows only intended continuity-import changes

- [ ] **Step 4: Manual acceptance checklist**

Run through this exact flow in the app or Android emulator:

```text
1. Open an existing AI thread with at least one completed message.
2. Export current role continuity and inspect the Markdown file for native markers.
3. Re-import that Markdown file through "接回外部对话".
4. Confirm mode auto-detect chooses native.
5. Confirm a new imported branch becomes active immediately.
6. Confirm the milestone shows remaining rollback rounds.
7. Import an external Markdown handoff file with transcript + compressed sections.
8. Confirm transcript messages render and compressed sections do not become fake bubbles.
9. Confirm memory review state is pending/visible and external import does not silently become irreversible memory.
10. Send enough rounds to cross the 10-round threshold.
11. Confirm milestone now says "已稳定接入，不能回退".
12. Confirm rollback succeeds before the threshold and is blocked after it.
```

Expected: Each step behaves as described in the spec.

- [ ] **Step 5: Commit any final surgical fixes**

```bash
git add -A
git commit -m "test: verify continuity import integration"
```

## Spec Coverage Check

- Single entry with auto-detect: Task 7
- Native deterministic Markdown import: Tasks 2, 3, 4
- External transcript/continuity-block split: Task 3
- Synthetic import branch root: Task 4
- External memory review execution + gate: Task 5
- 10-round observation and stabilization: Task 6
- Rollback preserving audit payload: Task 6
- Chat milestone state source + UI copy: Task 7
- Feature matrix update: Task 7
- Automated and manual verification: Task 8

## Placeholder Scan

- No `TODO`, `TBD`, or “implement later” placeholders are intentionally left in the task steps.
- Every task names exact files, exact commands, and concrete code targets.

## Type Consistency Check

- Native mode is consistently named `pixory_native_markdown`.
- External mode is consistently represented as `external_markdown` or `external_text`.
- Review gate uses `reviewGateState`.
- Rollback uses `rollbackState` and `rollbackRoundsRemaining`.
- Synthetic branch root uses `continuity_import_root`.
