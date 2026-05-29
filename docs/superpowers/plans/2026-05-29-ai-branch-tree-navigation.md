# AI Branch Tree Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a compact AI chat branch tree navigator that lets users find branch nodes, preview nearby messages, and switch back to the selected route in long conversations.

**Architecture:** Derive the visible tree from existing `ai_messages` branch fields and `ai_message_versions`, and persist only lightweight route metadata in SQLite. Add a focused service for tree shaping, a dedicated `AiBranchTreeScreen` for the mobile graph UI, and a chat return contract that applies selected version lineage before scrolling to the branch root.

**Tech Stack:** Expo, React Native, TypeScript, Expo SQLite, existing Pixory AI light components, existing design tokens, Node policy tests via `pnpm test`.

---

## File Structure

Create:

- `src/ai/aiBranchTreeService.ts`
  - Owns UI-ready branch tree derivation, preview loading, route metadata helpers, and selection map construction.
- `src/screens/AiBranchTreeScreen.tsx`
  - Owns the AI light branch tree UI, compact graph nodes, preview expansion, status chips, empty state, and return action.
- `tests/ai-branch-tree-navigation-policy.test.cjs`
  - Policy tests for route entry, compact nodes, metadata safety, and branch switch contract.

Modify:

- `src/database/schema.ts`
  - Bump `DATABASE_VERSION` from `34` to `35`.
  - Add `MIGRATION_STATEMENTS_V35` for `ai_branch_route_metadata`.
- `src/database/db.ts`
  - Import and run `MIGRATION_STATEMENTS_V35`.
- `src/database/repositories/aiThreadRepository.ts`
  - Add route metadata types and CRUD.
  - Add bounded branch-candidate and preview query helpers.
- `App.tsx`
  - Add `ai-branch-tree` route.
  - Wire chat header opening and branch-tree return to chat.
- `src/screens/AiChatScreen.tsx`
  - Add header branch icon entry before session settings.
  - Accept pending branch-tree selection and apply `selectedVersionByMessageId`.
  - Scroll to the selected branch root after route switch.
- Existing tests with database version assertions
  - Update `DATABASE_VERSION = 34` expectations to `35` where they intentionally track current schema version.

Do not modify:

- Existing image original storage flows.
- Existing memory/canon promotion behavior.
- Existing branch creation semantics in `aiChatService` except where needed for navigation.

---

## Task 1: Add Branch Route Metadata Migration

**Files:**

- Modify: `src/database/schema.ts`
- Modify: `src/database/db.ts`
- Modify: `tests/ai-schema-policy.test.cjs`
- Modify: current version assertions in `tests/*.test.cjs`

- [ ] **Step 1: Write the failing schema policy test**

Add this test to `tests/ai-schema-policy.test.cjs`:

```js
test('AI branch route metadata migration stores only lightweight route labels', () => {
  assert.match(schema, /DATABASE_VERSION = 35/);
  assert.match(schema, /MIGRATION_STATEMENTS_V35/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_branch_route_metadata/);
  assert.match(schema, /branchRootMessageId TEXT NOT NULL/);
  assert.match(schema, /branchVersionIndex INTEGER NOT NULL/);
  assert.match(schema, /status TEXT NOT NULL DEFAULT 'exploring'/);
  assert.match(schema, /CHECK \(status IN \('exploring', 'adopted', 'paused', 'abandoned'\)\)/);
  assert.match(schema, /UNIQUE\(threadId, branchRootMessageId, branchVersionIndex\)/);
  assert.match(schema, /idx_ai_branch_route_metadata_thread/);
  assert.doesNotMatch(schema, /ai_branch_route_metadata[\s\S]{0,900}messageContent/);
  assert.doesNotMatch(schema, /ai_branch_route_metadata[\s\S]{0,900}promptSnapshotJson/);
  assert.match(db, /MIGRATION_STATEMENTS_V35/);
  assert.match(db, /currentVersion < 35/);
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```powershell
pnpm test -- tests/ai-schema-policy.test.cjs
```

Expected: FAIL because `DATABASE_VERSION = 35`, `MIGRATION_STATEMENTS_V35`, and db migration wiring do not exist yet.

- [ ] **Step 3: Add migration constants**

In `src/database/schema.ts`, change:

```ts
export const DATABASE_VERSION = 34;
```

to:

```ts
export const DATABASE_VERSION = 35;
```

Add after `MIGRATION_STATEMENTS_V34`:

```ts
export const MIGRATION_STATEMENTS_V35 = `
CREATE TABLE IF NOT EXISTS ai_branch_route_metadata (
  id TEXT PRIMARY KEY NOT NULL,
  threadId TEXT NOT NULL,
  branchRootMessageId TEXT NOT NULL,
  branchVersionIndex INTEGER NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'exploring'
    CHECK (status IN ('exploring', 'adopted', 'paused', 'abandoned')),
  note TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (branchRootMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE,
  UNIQUE(threadId, branchRootMessageId, branchVersionIndex)
);

CREATE INDEX IF NOT EXISTS idx_ai_branch_route_metadata_thread
  ON ai_branch_route_metadata(threadId, updatedAt);
`;
```

- [ ] **Step 4: Wire the migration runner**

In `src/database/db.ts`, import `MIGRATION_STATEMENTS_V35` beside `MIGRATION_STATEMENTS_V34`.

Add after the V34 migration block:

```ts
    if (currentVersion < 35) {
      await database.execAsync(MIGRATION_STATEMENTS_V35);
    }
```

- [ ] **Step 5: Update schema-version policy assertions**

Replace intentional current-version expectations from `34` to `35` in policy tests.

Run:

```powershell
rg -n "DATABASE_VERSION\\s*=\\s*34|DATABASE_VERSION = 34|DATABASE_VERSION\\s*\\\\s\\*=" tests
```

Update each assertion that tracks the current database version. Do not change historical migration assertions such as `currentVersion < 34`.

- [ ] **Step 6: Run schema tests**

Run:

```powershell
pnpm test -- tests/ai-schema-policy.test.cjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/database/schema.ts src/database/db.ts tests
git commit -m "feat: add AI branch route metadata schema"
```

---

## Task 2: Add Repository Branch Tree Queries and Metadata Methods

**Files:**

- Modify: `src/database/repositories/aiThreadRepository.ts`
- Test: `tests/ai-branch-tree-navigation-policy.test.cjs`

- [ ] **Step 1: Create failing repository policy tests**

Create `tests/ai-branch-tree-navigation-policy.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('AI branch tree repository derives candidates without loading ordinary transcript nodes', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(repository, /export type AiBranchRouteStatus = 'exploring' \| 'adopted' \| 'paused' \| 'abandoned'/);
  assert.match(repository, /export interface AiBranchTreeCandidateRecord/);
  assert.match(repository, /async listBranchTreeCandidates/);
  assert.match(repository, /FROM ai_message_versions/);
  assert.match(repository, /JOIN ai_messages root ON root\.id = ai_message_versions\.originalMessageId/);
  assert.match(repository, /ai_message_versions\.versionIndex < root_versions\.versionTotal/);
  assert.match(repository, /COUNT\(descendant\.id\) AS followUpMessageCount/);
  assert.doesNotMatch(repository, /listBranchTreeCandidates[\s\S]{0,1800}SELECT \* FROM ai_messages\s+WHERE threadId = \?/);
});

test('AI branch route metadata repository stores labels without deleting route history', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(repository, /export interface AiBranchRouteMetadataRecord/);
  assert.match(repository, /async listBranchRouteMetadata/);
  assert.match(repository, /async upsertBranchRouteMetadata/);
  assert.match(repository, /async deleteBranchRouteMetadata/);
  assert.match(repository, /ON CONFLICT\(threadId, branchRootMessageId, branchVersionIndex\) DO UPDATE/);
  assert.doesNotMatch(repository, /upsertBranchRouteMetadata[\s\S]{0,1800}DELETE FROM ai_messages/);
  assert.doesNotMatch(repository, /upsertBranchRouteMetadata[\s\S]{0,1800}UPDATE ai_messages SET/);
});
```

- [ ] **Step 2: Run failing repository tests**

Run:

```powershell
pnpm test -- tests/ai-branch-tree-navigation-policy.test.cjs
```

Expected: FAIL because branch tree repository types and methods do not exist.

- [ ] **Step 3: Add repository types**

Add near the existing `AiBranchScope` type in `src/database/repositories/aiThreadRepository.ts`:

```ts
export type AiBranchRouteStatus = 'exploring' | 'adopted' | 'paused' | 'abandoned';

export interface AiBranchRouteMetadataRecord {
  id: string;
  threadId: string;
  branchRootMessageId: string;
  branchVersionIndex: number;
  name: string | null;
  status: AiBranchRouteStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiBranchTreeCandidateRecord {
  branchRootMessageId: string;
  branchVersionIndex: number;
  rootThreadId: string;
  rootRole: AiMessageRole;
  rootContent: string;
  rootCreatedAt: string;
  rootUpdatedAt: string;
  versionContent: string;
  versionCreatedAt: string;
  versionUpdatedAt: string;
  versionTotal: number;
  followUpMessageCount: number;
  latestFollowUpAt: string | null;
  parentBranchRootMessageId: string | null;
  parentBranchVersionIndex: number | null;
}

export interface UpsertAiBranchRouteMetadataInput {
  threadId: string;
  branchRootMessageId: string;
  branchVersionIndex: number;
  name?: string | null;
  status?: AiBranchRouteStatus;
  note?: string;
}
```

- [ ] **Step 4: Add metadata repository helpers**

Inside `aiThreadRepository`, add methods:

```ts
  async listBranchRouteMetadata(db: SQLiteDatabase, threadId: string): Promise<AiBranchRouteMetadataRecord[]> {
    return db.getAllAsync<AiBranchRouteMetadataRecord>(
      `SELECT * FROM ai_branch_route_metadata
       WHERE threadId = ?
       ORDER BY updatedAt DESC, createdAt DESC`,
      threadId
    );
  },

  async upsertBranchRouteMetadata(
    db: SQLiteDatabase,
    input: UpsertAiBranchRouteMetadataInput
  ): Promise<AiBranchRouteMetadataRecord> {
    const now = createTimestamp();
    const existing = await db.getFirstAsync<AiBranchRouteMetadataRecord>(
      `SELECT * FROM ai_branch_route_metadata
       WHERE threadId = ? AND branchRootMessageId = ? AND branchVersionIndex = ?`,
      input.threadId,
      input.branchRootMessageId,
      input.branchVersionIndex
    );
    const id = existing?.id ?? `route_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await db.runAsync(
      `INSERT INTO ai_branch_route_metadata (
         id, threadId, branchRootMessageId, branchVersionIndex, name, status, note, createdAt, updatedAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(threadId, branchRootMessageId, branchVersionIndex) DO UPDATE SET
         name = excluded.name,
         status = excluded.status,
         note = excluded.note,
         updatedAt = excluded.updatedAt`,
      id,
      input.threadId,
      input.branchRootMessageId,
      input.branchVersionIndex,
      normalizeOptionalText(input.name),
      input.status ?? existing?.status ?? 'exploring',
      input.note ?? existing?.note ?? '',
      existing?.createdAt ?? now,
      now
    );
    const row = await db.getFirstAsync<AiBranchRouteMetadataRecord>('SELECT * FROM ai_branch_route_metadata WHERE id = ?', id);
    if (!row) {
      throw new Error('Failed to save AI branch route metadata.');
    }
    return row;
  },

  async deleteBranchRouteMetadata(
    db: SQLiteDatabase,
    input: { threadId: string; branchRootMessageId: string; branchVersionIndex: number }
  ): Promise<void> {
    await db.runAsync(
      `DELETE FROM ai_branch_route_metadata
       WHERE threadId = ? AND branchRootMessageId = ? AND branchVersionIndex = ?`,
      input.threadId,
      input.branchRootMessageId,
      input.branchVersionIndex
    );
  },
```

- [ ] **Step 5: Add bounded branch-candidate query**

Inside `aiThreadRepository`, add:

```ts
  async listBranchTreeCandidates(db: SQLiteDatabase, threadId: string): Promise<AiBranchTreeCandidateRecord[]> {
    return db.getAllAsync<AiBranchTreeCandidateRecord>(
      `WITH root_versions AS (
         SELECT originalMessageId, MAX(versionIndex) AS versionTotal
         FROM ai_message_versions
         WHERE threadId = ?
         GROUP BY originalMessageId
         HAVING versionTotal > 1
       )
       SELECT
         root.id AS branchRootMessageId,
         ai_message_versions.versionIndex AS branchVersionIndex,
         root.threadId AS rootThreadId,
         root.role AS rootRole,
         root.content AS rootContent,
         root.createdAt AS rootCreatedAt,
         root.updatedAt AS rootUpdatedAt,
         ai_message_versions.content AS versionContent,
         ai_message_versions.messageCreatedAt AS versionCreatedAt,
         ai_message_versions.messageUpdatedAt AS versionUpdatedAt,
         root_versions.versionTotal AS versionTotal,
         COUNT(descendant.id) AS followUpMessageCount,
         MAX(descendant.updatedAt) AS latestFollowUpAt,
         root.branchRootMessageId AS parentBranchRootMessageId,
         root.branchVersionIndex AS parentBranchVersionIndex
       FROM ai_message_versions
       JOIN root_versions ON root_versions.originalMessageId = ai_message_versions.originalMessageId
       JOIN ai_messages root ON root.id = ai_message_versions.originalMessageId
       LEFT JOIN ai_messages descendant
         ON descendant.threadId = root.threadId
        AND descendant.branchRootMessageId = root.id
        AND descendant.branchVersionIndex = ai_message_versions.versionIndex
        AND descendant.status IN ('completed', 'stopped', 'failed')
       WHERE root.threadId = ?
         AND ai_message_versions.versionIndex < root_versions.versionTotal
         AND ai_message_versions.status IN ('completed', 'stopped', 'failed')
       GROUP BY
         root.id,
         ai_message_versions.versionIndex,
         root.threadId,
         root.role,
         root.content,
         root.createdAt,
         root.updatedAt,
         ai_message_versions.content,
         ai_message_versions.messageCreatedAt,
         ai_message_versions.messageUpdatedAt,
         root_versions.versionTotal,
         root.branchRootMessageId,
         root.branchVersionIndex
       ORDER BY root.createdAt ASC, root.id ASC, ai_message_versions.versionIndex ASC`,
      threadId,
      threadId
    );
  },
```

This query intentionally lists historical branch versions where `versionIndex < versionTotal`. The current/latest version remains visible through current route path derivation in the service.

- [ ] **Step 6: Run repository policy tests**

Run:

```powershell
pnpm test -- tests/ai-branch-tree-navigation-policy.test.cjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/database/repositories/aiThreadRepository.ts tests/ai-branch-tree-navigation-policy.test.cjs
git commit -m "feat: derive AI branch tree repository data"
```

---

## Task 3: Add AI Branch Tree Service

**Files:**

- Create: `src/ai/aiBranchTreeService.ts`
- Modify: `tests/ai-branch-tree-navigation-policy.test.cjs`

- [ ] **Step 1: Add failing service policy test**

Append:

```js
test('AI branch tree service keeps graph labels compact and builds return selection maps', () => {
  const service = read('src/ai/aiBranchTreeService.ts');

  assert.match(service, /export interface AiBranchTreeNode/);
  assert.match(service, /export interface AiBranchTreePreview/);
  assert.match(service, /export async function loadBranchTree/);
  assert.match(service, /export async function loadBranchTreePreview/);
  assert.match(service, /export async function updateBranchRouteStatus/);
  assert.match(service, /export function buildBranchSelectionMap/);
  assert.match(service, /title: formatCompactNodeTitle/);
  assert.match(service, /followUpMessageCount/);
  assert.match(service, /resolveBranchLineage/);
  assert.doesNotMatch(service, /title:\s*candidate\.versionContent/);
  assert.doesNotMatch(service, /preview:\s*candidate\.versionContent\.slice\(0,\s*240\)/);
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
pnpm test -- tests/ai-branch-tree-navigation-policy.test.cjs
```

Expected: FAIL because `src/ai/aiBranchTreeService.ts` does not exist.

- [ ] **Step 3: Create service types and formatters**

Create `src/ai/aiBranchTreeService.ts`:

```ts
import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type {
  AiBranchRouteStatus,
  AiBranchScope,
  AiBranchTreeCandidateRecord,
  AiBranchRouteMetadataRecord,
  AiMessageRecord,
} from '../database/repositories/aiThreadRepository';

export interface AiBranchTreeNode {
  id: string;
  threadId: string;
  branchRootMessageId: string;
  branchVersionIndex: number;
  parentBranchRootMessageId: string | null;
  parentBranchVersionIndex: number | null;
  rootRole: AiMessageRecord['role'];
  title: string;
  preview: string;
  versionLabel: string;
  followUpMessageCount: number;
  status: AiBranchRouteStatus;
  name: string | null;
  isCurrentRoute: boolean;
  isRecent: boolean;
  isCollapsedRepresentative: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiBranchPreviewMessage {
  id: string;
  role: AiMessageRecord['role'];
  label: string;
  content: string;
  createdAt: string;
}

export interface AiBranchTreePreview {
  node: AiBranchTreeNode;
  previousMessages: AiBranchPreviewMessage[];
  selectedMessage: AiBranchPreviewMessage;
  followUpMessages: AiBranchPreviewMessage[];
}

export interface AiBranchTreeResult {
  nodes: AiBranchTreeNode[];
  collapsedShortBranchCount: number;
}

const IMPORTANT_FOLLOW_UP_THRESHOLD = 2;
const RECENT_BRANCH_LIMIT = 3;

function compactText(value: string, max = 42): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatCompactNodeTitle(candidate: AiBranchTreeCandidateRecord): string {
  const roundLabel = candidate.rootRole === 'assistant' ? '重生成' : '修改';
  const shortText = compactText(candidate.versionContent || candidate.rootContent, 8);
  return `${roundLabel} · ${shortText || '分叉'}`;
}

function metadataKey(rootId: string, versionIndex: number): string {
  return `${rootId}:${versionIndex}`;
}
```

- [ ] **Step 4: Add tree loading**

Add:

```ts
function mapCandidateToNode(
  candidate: AiBranchTreeCandidateRecord,
  metadata: AiBranchRouteMetadataRecord | undefined,
  currentScopes: AiBranchScope[],
  recentKeys: Set<string>
): AiBranchTreeNode {
  const key = metadataKey(candidate.branchRootMessageId, candidate.branchVersionIndex);
  const isCurrentRoute = currentScopes.some(
    (scope) =>
      scope.branchRootMessageId === candidate.branchRootMessageId &&
      scope.branchVersionIndex === candidate.branchVersionIndex
  );
  return {
    id: key,
    branchRootMessageId: candidate.branchRootMessageId,
    branchVersionIndex: candidate.branchVersionIndex,
    createdAt: candidate.versionCreatedAt,
    followUpMessageCount: candidate.followUpMessageCount,
    isCollapsedRepresentative: false,
    isCurrentRoute,
    isRecent: recentKeys.has(key),
    name: metadata?.name ?? null,
    parentBranchRootMessageId: candidate.parentBranchRootMessageId,
    parentBranchVersionIndex: candidate.parentBranchVersionIndex,
    preview: compactText(candidate.versionContent || candidate.rootContent, 72),
    rootRole: candidate.rootRole,
    status: metadata?.status ?? 'exploring',
    threadId: candidate.rootThreadId,
    title: formatCompactNodeTitle(candidate),
    updatedAt: candidate.latestFollowUpAt ?? candidate.versionUpdatedAt,
    versionLabel: `v${candidate.branchVersionIndex}/${candidate.versionTotal}`,
  };
}

export async function loadBranchTree(input: {
  space: PixorySpace;
  threadId: string;
  currentBranchScopes?: AiBranchScope[];
}): Promise<AiBranchTreeResult> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const [candidates, metadataRows] = await Promise.all([
      aiThreadRepository.listBranchTreeCandidates(db, input.threadId),
      aiThreadRepository.listBranchRouteMetadata(db, input.threadId),
    ]);
    const metadataByKey = new Map(
      metadataRows.map((row) => [metadataKey(row.branchRootMessageId, row.branchVersionIndex), row])
    );
    const recentKeys = new Set(
      [...candidates]
        .sort((left, right) => right.versionUpdatedAt.localeCompare(left.versionUpdatedAt))
        .slice(0, RECENT_BRANCH_LIMIT)
        .map((candidate) => metadataKey(candidate.branchRootMessageId, candidate.branchVersionIndex))
    );
    const allNodes = candidates.map((candidate) =>
      mapCandidateToNode(candidate, metadataByKey.get(metadataKey(candidate.branchRootMessageId, candidate.branchVersionIndex)), input.currentBranchScopes ?? [], recentKeys)
    );
    const visibleNodes = allNodes.filter(
      (node) =>
        node.isCurrentRoute ||
        node.isRecent ||
        node.followUpMessageCount >= IMPORTANT_FOLLOW_UP_THRESHOLD ||
        node.name ||
        node.status !== 'exploring'
    );
    return {
      collapsedShortBranchCount: Math.max(0, allNodes.length - visibleNodes.length),
      nodes: visibleNodes,
    };
  });
}
```

- [ ] **Step 5: Add selection map helper**

Add:

```ts
export function buildBranchSelectionMap(scopes: AiBranchScope[]): Record<string, number> {
  return scopes.reduce<Record<string, number>>((selected, scope) => {
    selected[scope.branchRootMessageId] = scope.branchVersionIndex;
    return selected;
  }, {});
}
```

- [ ] **Step 6: Add preview loading and metadata update**

Add:

```ts
function toPreviewMessage(message: AiMessageRecord, label: string): AiBranchPreviewMessage {
  return {
    content: message.content,
    createdAt: message.createdAt,
    id: message.id,
    label,
    role: message.role,
  };
}

export async function loadBranchTreePreview(input: {
  space: PixorySpace;
  threadId: string;
  branchRootMessageId: string;
  branchVersionIndex: number;
  currentBranchScopes?: AiBranchScope[];
}): Promise<AiBranchTreePreview | null> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const result = await loadBranchTree({
      currentBranchScopes: input.currentBranchScopes,
      space: input.space,
      threadId: input.threadId,
    });
    const node = result.nodes.find(
      (item) =>
        item.branchRootMessageId === input.branchRootMessageId &&
        item.branchVersionIndex === input.branchVersionIndex
    );
    const root = await aiThreadRepository.findMessageById(db, input.branchRootMessageId);
    if (!node || !root) {
      return null;
    }
    const lineage = await aiThreadRepository.resolveBranchLineage(db, input.branchRootMessageId, input.branchVersionIndex);
    const selectedMessages = await aiThreadRepository.listMessages(db, input.threadId, 80, lineage);
    const rootIndex = selectedMessages.findIndex((message) => message.id === input.branchRootMessageId);
    const previous = rootIndex > 0 ? selectedMessages.slice(Math.max(0, rootIndex - 1), rootIndex) : [];
    const followUp = rootIndex >= 0 ? selectedMessages.slice(rootIndex + 1, rootIndex + 3) : [];
    return {
      followUpMessages: followUp.map((message, index) => toPreviewMessage(message, index === 0 ? '后续' : '后续代表消息')),
      node,
      previousMessages: previous.map((message) => toPreviewMessage(message, '前文')),
      selectedMessage: toPreviewMessage(root, node.versionLabel),
    };
  });
}

export async function updateBranchRouteStatus(input: {
  space: PixorySpace;
  threadId: string;
  branchRootMessageId: string;
  branchVersionIndex: number;
  status: AiBranchRouteStatus;
}): Promise<void> {
  await runWithDatabaseSpace(input.space, async (db) => {
    await aiThreadRepository.upsertBranchRouteMetadata(db, {
      branchRootMessageId: input.branchRootMessageId,
      branchVersionIndex: input.branchVersionIndex,
      status: input.status,
      threadId: input.threadId,
    });
  });
}
```

- [ ] **Step 7: Run branch tree policy test**

Run:

```powershell
pnpm test -- tests/ai-branch-tree-navigation-policy.test.cjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/ai/aiBranchTreeService.ts tests/ai-branch-tree-navigation-policy.test.cjs
git commit -m "feat: add AI branch tree service"
```

---

## Task 4: Build AiBranchTreeScreen UI

**Files:**

- Create: `src/screens/AiBranchTreeScreen.tsx`
- Modify: `tests/ai-branch-tree-navigation-policy.test.cjs`

- [ ] **Step 1: Add failing UI policy test**

Append:

```js
test('AI branch tree screen uses light styling compact nodes and nearby preview actions', () => {
  const screen = read('src/screens/AiBranchTreeScreen.tsx');

  assert.match(screen, /AiLightScaffold/);
  assert.match(screen, /title="创作路线树"/);
  assert.match(screen, /当前会话 · 自动整理关键分叉/);
  assert.match(screen, /点关键节点查看附近消息/);
  assert.match(screen, /loadBranchTree/);
  assert.match(screen, /loadBranchTreePreview/);
  assert.match(screen, /切换并返回聊天/);
  assert.match(screen, /返回聊天定位此处/);
  assert.match(screen, /折叠短枝/);
  assert.match(screen, /aiLightColors\.canvas/);
  assert.match(screen, /rhythm\./);
  assert.match(screen, /spacing\[/);
  assert.doesNotMatch(screen, /当前采用：/);
  assert.doesNotMatch(screen, /LinearGradient/);
});
```

- [ ] **Step 2: Run failing UI test**

Run:

```powershell
pnpm test -- tests/ai-branch-tree-navigation-policy.test.cjs
```

Expected: FAIL because `AiBranchTreeScreen.tsx` does not exist.

- [ ] **Step 3: Create screen props and loading shell**

Create `src/screens/AiBranchTreeScreen.tsx`:

```tsx
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  loadBranchTree,
  loadBranchTreePreview,
  updateBranchRouteStatus,
  type AiBranchTreeNode,
  type AiBranchTreePreview,
} from '../ai/aiBranchTreeService';
import type { AiBranchRouteStatus, AiBranchScope } from '../database/repositories/aiThreadRepository';
import type { PixorySpace } from '../database';
import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { radius, rhythm, spacing, typography } from '../design/tokens';

interface AiBranchTreeScreenProps {
  currentBranchScopes?: AiBranchScope[];
  onBack: () => void;
  onSelectBranch: (input: { branchRootMessageId: string; branchVersionIndex: number }) => void;
  space: PixorySpace;
  threadId: string;
}

const STATUS_LABELS: Record<AiBranchRouteStatus, string> = {
  abandoned: '放弃',
  adopted: '已采用',
  exploring: '探索中',
  paused: '暂停',
};

export function AiBranchTreeScreen({
  currentBranchScopes = [],
  onBack,
  onSelectBranch,
  space,
  threadId,
}: AiBranchTreeScreenProps) {
  const [nodes, setNodes] = useState<AiBranchTreeNode[]>([]);
  const [collapsedShortBranchCount, setCollapsedShortBranchCount] = useState(0);
  const [selectedNode, setSelectedNode] = useState<AiBranchTreeNode | null>(null);
  const [preview, setPreview] = useState<AiBranchTreePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const currentNodeId = useMemo(() => selectedNode?.id ?? null, [selectedNode]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadBranchTree({ currentBranchScopes, space, threadId });
      setNodes(result.nodes);
      setCollapsedShortBranchCount(result.collapsedShortBranchCount);
      setStatus(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '加载创作路线失败');
    } finally {
      setLoading(false);
    }
  }, [currentBranchScopes, space, threadId]);

  useEffect(() => {
    void reload();
  }, [reload]);
```

- [ ] **Step 4: Add node preview and status update handlers**

Continue in the same component:

```tsx
  async function openNode(node: AiBranchTreeNode) {
    setSelectedNode(node);
    setPreview(null);
    setLoading(true);
    try {
      const nextPreview = await loadBranchTreePreview({
        branchRootMessageId: node.branchRootMessageId,
        branchVersionIndex: node.branchVersionIndex,
        currentBranchScopes,
        space,
        threadId,
      });
      setPreview(nextPreview);
      setStatus(nextPreview ? null : '这条路线暂时无法预览。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '加载附近消息失败');
    } finally {
      setLoading(false);
    }
  }

  async function setNodeStatus(nextStatus: AiBranchRouteStatus) {
    if (!selectedNode) {
      return;
    }
    setLoading(true);
    try {
      await updateBranchRouteStatus({
        branchRootMessageId: selectedNode.branchRootMessageId,
        branchVersionIndex: selectedNode.branchVersionIndex,
        space,
        status: nextStatus,
        threadId,
      });
      await reload();
      setSelectedNode((current) => current ? { ...current, status: nextStatus } : current);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '更新路线状态失败');
    } finally {
      setLoading(false);
    }
  }

  function selectPreviewBranch() {
    if (!selectedNode) {
      return;
    }
    onSelectBranch({
      branchRootMessageId: selectedNode.branchRootMessageId,
      branchVersionIndex: selectedNode.branchVersionIndex,
    });
  }
```

- [ ] **Step 5: Render compact graph nodes**

Add the component return:

```tsx
  return (
    <AiLightScaffold
      loading={loading}
      onBack={onBack}
      scrollable
      subtitle="当前会话 · 自动整理关键分叉"
      title="创作路线树"
    >
      <View style={styles.content}>
        {status ? <Text style={styles.status}>{status}</Text> : null}
        <View style={styles.hint}>
          <View style={styles.hintDot} />
          <Text style={styles.hintText}>点关键节点查看附近消息；确认后再切换并返回聊天定位。普通消息不会塞进树里。</Text>
        </View>
        <View style={styles.filterRow}>
          <Text style={[styles.filterChip, styles.filterChipActive]}>关键节点</Text>
          <Text style={styles.filterChip}>当前路线</Text>
          <Text style={styles.filterChip}>已标记</Text>
          {collapsedShortBranchCount > 0 ? <Text style={styles.filterChip}>折叠短枝 {collapsedShortBranchCount}</Text> : null}
        </View>
        {nodes.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>还没有分支路线</Text>
            <Text style={styles.caption}>修改旧消息或重新生成回复后，这里会自动出现路线节点。</Text>
            <AiLightButton label="返回聊天" onPress={onBack} />
          </View>
        ) : (
          <View style={styles.graphCard}>
            <View style={styles.mainLine} />
            {nodes.map((node, index) => {
              const side = index % 3 === 1 ? 'left' : index % 3 === 2 ? 'right' : 'center';
              const selected = currentNodeId === node.id;
              return (
                <Pressable
                  key={node.id}
                  accessibilityLabel={`查看${node.title}`}
                  accessibilityRole="button"
                  onPress={() => void openNode(node)}
                  style={({ pressed }) => [
                    styles.node,
                    side === 'left' && styles.nodeLeft,
                    side === 'right' && styles.nodeRight,
                    node.isCurrentRoute && styles.nodeCurrent,
                    selected && styles.nodeSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.nodeHeader}>
                    <View style={[styles.nodeDot, node.isCurrentRoute && styles.nodeDotCurrent]} />
                    <Text numberOfLines={1} style={styles.nodeTitle}>{node.name ?? node.title}</Text>
                  </View>
                  <View style={styles.nodeMetaRow}>
                    <Text style={[styles.nodeMeta, node.isCurrentRoute && styles.nodeMetaCurrent]}>{node.versionLabel}</Text>
                    <Text style={styles.nodeMeta}>{node.followUpMessageCount} 条</Text>
                    <Text style={styles.nodeMeta}>{STATUS_LABELS[node.status]}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
        {preview ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>附近消息预览</Text>
            <Text style={styles.caption}>先确认是不是你要找的分支，再切换回聊天定位。</Text>
            {[...preview.previousMessages, preview.selectedMessage, ...preview.followUpMessages].map((message) => (
              <View key={`${message.label}-${message.id}`} style={styles.previewMessage}>
                <Text style={styles.previewLabel}>{message.label}</Text>
                <Text numberOfLines={3} style={styles.previewContent}>{message.content || '这条消息没有可预览内容。'}</Text>
              </View>
            ))}
            <View style={styles.statusRow}>
              {(Object.keys(STATUS_LABELS) as AiBranchRouteStatus[]).map((routeStatus) => (
                <Pressable key={routeStatus} accessibilityRole="button" onPress={() => void setNodeStatus(routeStatus)} style={({ pressed }) => [styles.statusChip, selectedNode?.status === routeStatus && styles.statusChipActive, pressed && styles.pressed]}>
                  <Text style={[styles.statusChipText, selectedNode?.status === routeStatus && styles.statusChipTextActive]}>{STATUS_LABELS[routeStatus]}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.actions}>
              <AiLightButton label="收起" onPress={() => { setSelectedNode(null); setPreview(null); }} variant="outline" />
              <AiLightButton label={selectedNode?.isCurrentRoute ? '返回聊天定位此处' : '切换并返回聊天'} onPress={selectPreviewBranch} />
            </View>
          </View>
        ) : null}
      </View>
    </AiLightScaffold>
  );
}
```

- [ ] **Step 6: Add light styles**

Add:

```tsx
const styles = StyleSheet.create({
  actions: {
    gap: rhythm.compactGridGap,
  },
  caption: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  content: {
    gap: rhythm.listCardGap,
  },
  emptyCard: {
    backgroundColor: aiLightColors.cardWash,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[4],
  },
  emptyTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  filterChip: {
    ...typography.textStyles.caption,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.muted,
    minHeight: 28,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  filterChipActive: {
    backgroundColor: aiLightColors.coralSoft,
    borderColor: aiLightColors.coral,
    color: aiLightColors.coralActive,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  graphCard: {
    backgroundColor: aiLightColors.cardWash,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 420,
    overflow: 'hidden',
    padding: spacing[4],
  },
  hint: {
    alignItems: 'flex-start',
    backgroundColor: aiLightColors.cardWash,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    padding: spacing[3],
  },
  hintDot: {
    backgroundColor: aiLightColors.coral,
    borderRadius: radius.pill,
    height: 9,
    marginTop: spacing[1],
    width: 9,
  },
  hintText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    flex: 1,
  },
  mainLine: {
    backgroundColor: aiLightColors.coral,
    borderRadius: radius.pill,
    bottom: spacing[5],
    left: '50%',
    opacity: 0.72,
    position: 'absolute',
    top: spacing[5],
    width: 3,
  },
  node: {
    alignSelf: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginVertical: spacing[2],
    minHeight: 56,
    padding: spacing[2],
    width: 150,
  },
  nodeCurrent: {
    backgroundColor: aiLightColors.coralSoft,
    borderColor: aiLightColors.coral,
  },
  nodeDot: {
    backgroundColor: aiLightColors.mutedSoft,
    borderRadius: radius.pill,
    height: 10,
    width: 10,
  },
  nodeDotCurrent: {
    backgroundColor: aiLightColors.coralActive,
  },
  nodeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  nodeLeft: {
    alignSelf: 'flex-start',
  },
  nodeMeta: {
    ...typography.textStyles.micro,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.muted,
    paddingHorizontal: spacing[2],
  },
  nodeMetaCurrent: {
    color: aiLightColors.coralActive,
  },
  nodeMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
    marginTop: spacing[1],
  },
  nodeRight: {
    alignSelf: 'flex-end',
  },
  nodeSelected: {
    borderColor: aiLightColors.coralActive,
  },
  nodeTitle: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    flex: 1,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
  previewCard: {
    backgroundColor: aiLightColors.cardWash,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.compactGridGap,
    padding: spacing[3],
  },
  previewContent: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
  },
  previewLabel: {
    ...typography.textStyles.micro,
    color: aiLightColors.mutedSoft,
    fontWeight: '700',
  },
  previewMessage: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[2],
  },
  previewTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  status: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
  },
  statusChip: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  statusChipActive: {
    backgroundColor: aiLightColors.coralSoft,
    borderColor: aiLightColors.coral,
  },
  statusChipText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  statusChipTextActive: {
    color: aiLightColors.coralActive,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
});
```

- [ ] **Step 7: Run UI policy test**

Run:

```powershell
pnpm test -- tests/ai-branch-tree-navigation-policy.test.cjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/screens/AiBranchTreeScreen.tsx tests/ai-branch-tree-navigation-policy.test.cjs
git commit -m "feat: add AI branch tree screen"
```

---

## Task 5: Wire App Route, Chat Entry, and Return Selection

**Files:**

- Modify: `App.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `tests/ai-branch-tree-navigation-policy.test.cjs`

- [ ] **Step 1: Add failing navigation policy test**

Append:

```js
test('AI chat opens branch tree from header and accepts selected branch return', () => {
  const app = read('App.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(app, /import \{ AiBranchTreeScreen \}/);
  assert.match(app, /name: 'ai-branch-tree'/);
  assert.match(app, /onOpenBranchTree/);
  assert.match(app, /onSelectBranch/);
  assert.match(app, /pendingBranchSelection/);
  assert.match(chat, /onOpenBranchTree: \(threadId: string\) => void/);
  assert.match(chat, /git-branch-outline/);
  assert.match(chat, /accessibilityLabel="打开创作路线树"/);
  assert.match(chat, /branchTreeSelection/);
  assert.match(chat, /setSelectedVersionByMessageId/);
  assert.match(chat, /scrollToBranchRootMessage/);
});
```

- [ ] **Step 2: Run failing navigation test**

Run:

```powershell
pnpm test -- tests/ai-branch-tree-navigation-policy.test.cjs
```

Expected: FAIL because route wiring and chat props do not exist yet.

- [ ] **Step 3: Add route type and import**

In `App.tsx`, import:

```ts
import { AiBranchTreeScreen } from './src/screens/AiBranchTreeScreen';
import type { AiBranchScope } from './src/database/repositories/aiThreadRepository';
```

Add route union member:

```ts
  | {
      name: 'ai-branch-tree';
      space: PixorySpace;
      threadId: string;
      currentBranchScopes?: AiBranchScope[];
    }
```

Add to the `ai-chat` route:

```ts
      pendingBranchSelection?: {
        branchRootMessageId: string;
        branchVersionIndex: number;
      };
```

- [ ] **Step 4: Add AiChatScreen props**

In `src/screens/AiChatScreen.tsx`, add:

```ts
import type { AiBranchScope } from '../database/repositories/aiThreadRepository';
```

Extend props:

```ts
  branchTreeSelection?: {
    branchRootMessageId: string;
    branchVersionIndex: number;
  };
  onOpenBranchTree: (threadId: string, currentBranchScopes: AiBranchScope[]) => void;
```

Destructure `branchTreeSelection` and `onOpenBranchTree`.

- [ ] **Step 5: Add chat header branch icon**

In `AiChatScreen` header, insert this before the existing session settings button:

```tsx
        <Pressable
          accessibilityLabel="打开创作路线树"
          accessibilityRole="button"
          disabled={!activeThreadId}
          onPress={() => {
            if (activeThreadId) {
              onOpenBranchTree(activeThreadId, getActiveBranchForNextMessage() ? [getActiveBranchForNextMessage() as AiBranchScope] : []);
            }
          }}
          style={({ pressed }) => [styles.roundButton, !activeThreadId && styles.disabledAction, pressed && activeThreadId && styles.pressed]}
        >
          <Ionicons color={activeThreadId ? aiLightColors.ink : aiLightColors.mutedSoft} name="git-branch-outline" size={18} />
        </Pressable>
```

If `styles.disabledAction` does not exist, add:

```ts
  disabledAction: {
    opacity: 0.42,
  },
```

- [ ] **Step 6: Apply returned branch selection in chat**

Add helper in `AiChatScreen`:

```ts
  async function scrollToBranchRootMessage(messageId: string) {
    const visibleIndex = invertedMessageItems.findIndex((item) => item.message.id === messageId);
    if (visibleIndex >= 0) {
      messageListRef.current?.scrollToIndex({ animated: true, index: visibleIndex, viewPosition: 0.55 });
      return;
    }
    if (activeThreadId) {
      await reloadMessages(activeThreadId, false);
      setTimeout(() => {
        const nextIndex = invertedMessageItems.findIndex((item) => item.message.id === messageId);
        if (nextIndex >= 0) {
          messageListRef.current?.scrollToIndex({ animated: true, index: nextIndex, viewPosition: 0.55 });
        }
      }, 120);
    }
  }
```

Add effect:

```ts
  useEffect(() => {
    if (!branchTreeSelection) {
      return;
    }
    setSelectedVersionByMessageId((current) => ({
      ...current,
      [branchTreeSelection.branchRootMessageId]: branchTreeSelection.branchVersionIndex,
    }));
    void scrollToBranchRootMessage(branchTreeSelection.branchRootMessageId);
  }, [branchTreeSelection?.branchRootMessageId, branchTreeSelection?.branchVersionIndex]);
```

If nested branch lineage is not yet passed back from the tree route, this first implementation switches the selected root version. Add lineage expansion in Task 6.

- [ ] **Step 7: Wire App route rendering and callbacks**

In `App.tsx`, pass props to `AiChatScreen`:

```tsx
        branchTreeSelection={currentRoute.pendingBranchSelection}
        onOpenBranchTree={(threadId, currentBranchScopes) =>
          pushRoute({
            currentBranchScopes,
            name: 'ai-branch-tree',
            space: currentRoute.space,
            threadId,
          })
        }
```

Add route rendering:

```tsx
  } else if (currentRoute.name === 'ai-branch-tree') {
    content = (
      <AiBranchTreeScreen
        currentBranchScopes={currentRoute.currentBranchScopes}
        onBack={popRoute}
        onSelectBranch={(selection) => {
          replaceAiChatFlowWithRoute({
            name: 'ai-chat',
            pendingBranchSelection: selection,
            space: currentRoute.space,
            threadId: currentRoute.threadId,
          });
        }}
        space={currentRoute.space}
        threadId={currentRoute.threadId}
      />
    );
```

- [ ] **Step 8: Run navigation policy test**

Run:

```powershell
pnpm test -- tests/ai-branch-tree-navigation-policy.test.cjs
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add App.tsx src/screens/AiChatScreen.tsx tests/ai-branch-tree-navigation-policy.test.cjs
git commit -m "feat: wire AI branch tree navigation"
```

---

## Task 6: Add Lineage-Aware Branch Selection and Preview Reliability

**Files:**

- Modify: `src/ai/aiBranchTreeService.ts`
- Modify: `src/screens/AiBranchTreeScreen.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `tests/ai-branch-tree-navigation-policy.test.cjs`

- [ ] **Step 1: Add failing lineage policy test**

Append:

```js
test('AI branch tree returns lineage scopes so nested branches switch predictably', () => {
  const service = read('src/ai/aiBranchTreeService.ts');
  const screen = read('src/screens/AiBranchTreeScreen.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(service, /export async function resolveBranchSelection/);
  assert.match(service, /aiThreadRepository\.resolveBranchLineage/);
  assert.match(service, /buildBranchSelectionMap\(lineage\)/);
  assert.match(screen, /resolveBranchSelection/);
  assert.match(screen, /selectionMap/);
  assert.match(chat, /selectionMap: Record<string, number>/);
  assert.match(chat, /setSelectedVersionByMessageId\(\(current\) => \(\{[\s\S]*selectionMap/);
});
```

- [ ] **Step 2: Run failing lineage test**

Run:

```powershell
pnpm test -- tests/ai-branch-tree-navigation-policy.test.cjs
```

Expected: FAIL because `resolveBranchSelection` and `selectionMap` are not wired.

- [ ] **Step 3: Add service selection resolver**

In `src/ai/aiBranchTreeService.ts`, add:

```ts
export interface AiResolvedBranchSelection {
  branchRootMessageId: string;
  branchVersionIndex: number;
  lineage: AiBranchScope[];
  selectionMap: Record<string, number>;
}

export async function resolveBranchSelection(input: {
  space: PixorySpace;
  branchRootMessageId: string;
  branchVersionIndex: number;
}): Promise<AiResolvedBranchSelection> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const lineage = await aiThreadRepository.resolveBranchLineage(
      db,
      input.branchRootMessageId,
      input.branchVersionIndex
    );
    const scopes = lineage.length > 0
      ? lineage
      : [{ branchRootMessageId: input.branchRootMessageId, branchVersionIndex: input.branchVersionIndex }];
    return {
      branchRootMessageId: input.branchRootMessageId,
      branchVersionIndex: input.branchVersionIndex,
      lineage: scopes,
      selectionMap: buildBranchSelectionMap(scopes),
    };
  });
}
```

- [ ] **Step 4: Use resolved selection in branch tree screen**

Import `resolveBranchSelection` in `AiBranchTreeScreen.tsx`.

Change prop type:

```ts
  onSelectBranch: (input: {
    branchRootMessageId: string;
    branchVersionIndex: number;
    selectionMap: Record<string, number>;
  }) => void;
```

Change `selectPreviewBranch`:

```ts
  async function selectPreviewBranch() {
    if (!selectedNode) {
      return;
    }
    setLoading(true);
    try {
      const resolved = await resolveBranchSelection({
        branchRootMessageId: selectedNode.branchRootMessageId,
        branchVersionIndex: selectedNode.branchVersionIndex,
        space,
      });
      onSelectBranch(resolved);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '切换路线失败');
    } finally {
      setLoading(false);
    }
  }
```

- [ ] **Step 5: Update App and chat selection type**

In `App.tsx`, change pending selection route type to include:

```ts
selectionMap: Record<string, number>;
```

In `AiChatScreenProps`, change `branchTreeSelection` to:

```ts
  branchTreeSelection?: {
    branchRootMessageId: string;
    branchVersionIndex: number;
    selectionMap: Record<string, number>;
  };
```

Change the effect:

```ts
    setSelectedVersionByMessageId((current) => ({
      ...current,
      ...branchTreeSelection.selectionMap,
    }));
```

- [ ] **Step 6: Run lineage policy test**

Run:

```powershell
pnpm test -- tests/ai-branch-tree-navigation-policy.test.cjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add App.tsx src/ai/aiBranchTreeService.ts src/screens/AiBranchTreeScreen.tsx src/screens/AiChatScreen.tsx tests/ai-branch-tree-navigation-policy.test.cjs
git commit -m "feat: switch AI branch tree with lineage"
```

---

## Task 7: Verification and Android Smoke Test

**Files:**

- No planned source edits unless verification exposes defects.

- [ ] **Step 1: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```powershell
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Run diff whitespace check**

Run:

```powershell
git diff --check
```

Expected: no output.

- [ ] **Step 4: Start Android dev server**

Run:

```powershell
pnpm android
```

Expected: Expo starts and launches the app on an attached Android device or emulator.

- [ ] **Step 5: Manual smoke path**

In the app:

1. Open AI chat.
2. Create or open a conversation with at least one edited user message or regenerated assistant reply.
3. Tap the branch tree icon to the left of session settings.
4. Verify the tree page opens and uses light cream styling.
5. Verify graph nodes are compact and show no long explanatory sentence inside node cards.
6. Tap a branch node.
7. Verify nearby messages preview appears.
8. Tap `切换并返回聊天`.
9. Verify chat returns to the selected route and scrolls near the branch root.
10. Tap the branch tree icon again and verify the current route highlight updates.

- [ ] **Step 6: Capture any verification caveats**

If Android device validation is unavailable, write the caveat into the final report:

```text
Android smoke test was not completed because no compatible device/emulator was available.
```

- [ ] **Step 7: Final commit**

If verification required fixes, commit them:

```powershell
git add .
git commit -m "fix: stabilize AI branch tree navigation"
```

If no fixes were required, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage:
  - Chat header branch entry: Task 5.
  - Dedicated tree page: Task 4.
  - Clear tree shape and compact nodes: Task 4.
  - Nearby message preview before switching: Task 4.
  - Automatic derived tree: Tasks 2 and 3.
  - Lightweight metadata only: Tasks 1 and 2.
  - Lineage-aware switching: Task 6.
  - AI light styling: Task 4.
  - Tests and Android validation: Task 7.
- Placeholder scan: no placeholder markers or unspecified implementation steps.
- Type consistency:
  - Repository status type is `AiBranchRouteStatus`.
  - Service node type is `AiBranchTreeNode`.
  - Return selection uses `selectionMap: Record<string, number>`.
  - Chat applies `selectionMap` into `selectedVersionByMessageId`.
