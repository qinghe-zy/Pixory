# AI Chat In-Thread Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-page current-route chat search flow that lists matching messages and returns to the chat positioned on the selected result.

**Architecture:** Add one route and one screen for search. Keep search deterministic and local in `aiChatService`, scoped by existing `AiBranchScope[]`. Reuse the chat screen's existing pending scroll and load-earlier retry mechanics for result positioning.

**Tech Stack:** React Native, Expo Router-style local route stack in `App.tsx`, TypeScript, existing SQLite repository/service layer, existing AI light UI tokens/components.

---

### Task 1: Add Policy Coverage

**Files:**
- Create: `tests/ai-chat-search-policy.test.cjs`

- [x] **Step 1: Write the failing policy test**

Create a Node policy test that asserts:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('AI chat search is a full-page current-route search flow', () => {
  const app = read('App.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');
  const search = read('src/screens/AiChatSearchScreen.tsx');
  const service = read('src/ai/aiChatService.ts');

  assert.match(app, /name: 'ai-chat-search'/);
  assert.match(app, /<AiChatSearchScreen/);
  assert.match(app, /onOpenChatSearch/);
  assert.match(chat, /accessibilityLabel="搜索当前聊天"/);
  assert.match(chat, /handleOpenChatSearch/);
  assert.match(chat, /onOpenChatSearch\(nextThreadId, getPersistedCurrentBranchScopes\(\)\)/);
  assert.match(search, /AiLightSearchBar/);
  assert.match(search, /searchThreadMessages/);
  assert.match(search, /当前路线没有找到相关聊天/);
  assert.match(service, /export interface AiChatSearchResult/);
  assert.match(service, /export async function searchThreadMessages/);
  assert.match(service, /normalizeChatSearchText/);
  assert.match(service, /branchScopes/);
});

test('AI chat search result selection returns to chat and scrolls to target', () => {
  const app = read('App.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');
  const search = read('src/screens/AiChatSearchScreen.tsx');

  assert.match(app, /searchTargetMessageId\?: string/);
  assert.match(app, /searchTargetKey\?: string/);
  assert.match(app, /onSelectResult=\{\(result\) =>/);
  assert.match(app, /searchTargetMessageId: result\.messageId/);
  assert.match(chat, /searchTargetMessageId\?: string/);
  assert.match(chat, /pendingSearchScrollMessageIdRef/);
  assert.match(chat, /searchHighlightMessageId/);
  assert.match(chat, /scheduleSearchTargetScroll/);
  assert.match(chat, /retrySearchScrollToIndex/);
  assert.match(search, /onSelectResult\(result\)/);
});
```

- [x] **Step 2: Verify the test fails**

Run: `node --test tests/ai-chat-search-policy.test.cjs`

Expected: FAIL because `AiChatSearchScreen.tsx`, route wiring, and service APIs do not exist.

### Task 2: Implement Local Search Service

**Files:**
- Modify: `src/ai/aiChatService.ts`

- [x] **Step 1: Add search result types and normalization helpers**

Add `AiChatSearchResult` and helper functions near existing message list types:

```ts
export interface AiChatSearchResult {
  messageId: string;
  role: AiMessageRecord['role'];
  content: string;
  snippet: string;
  matchedTerms: string[];
  createdAt: string;
  versionIndex: number;
  versionTotal: number;
}

function normalizeChatSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[，。！？、；：,.!?;:()[\]{}"'`*_#>-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildChatSearchTerms(query: string): string[] {
  const normalized = normalizeChatSearchText(query);
  if (!normalized) {
    return [];
  }
  const terms = normalized.split(' ').filter(Boolean);
  return terms.length > 1 ? [...new Set(terms)] : [normalized];
}
```

- [x] **Step 2: Add searchThreadMessages**

Implement:

```ts
export async function searchThreadMessages(input: {
  space: PixorySpace;
  threadId: string;
  query: string;
  branchScopes?: AiBranchScope[];
  offset?: number;
  limit?: number;
}): Promise<{ results: AiChatSearchResult[]; hasMore: boolean }> {
  const terms = buildChatSearchTerms(input.query);
  const limit = Math.max(1, input.limit ?? 80);
  const offset = Math.max(0, input.offset ?? 0);
  if (terms.length === 0) {
    return { results: [], hasMore: false };
  }
  const messages = await listThreadMessages(input.space, input.threadId, {
    branchScopes: input.branchScopes,
  });
  const matches = messages
    .filter((message) => message.role !== 'system')
    .filter((message) => {
      const normalized = normalizeChatSearchText(message.content);
      return terms.every((term) => normalized.includes(term));
    })
    .map((message) => toChatSearchResult(message, terms));
  return {
    results: matches.slice(offset, offset + limit),
    hasMore: offset + limit < matches.length,
  };
}
```

Also add a `toChatSearchResult` helper that creates a compact snippet around the first matched term.

### Task 3: Add Search Screen

**Files:**
- Create: `src/screens/AiChatSearchScreen.tsx`

- [x] **Step 1: Build full-page search UI**

Create a screen component with props:

```ts
interface AiChatSearchScreenProps {
  branchScopes: AiBranchScope[];
  contextTitle?: string;
  space: PixorySpace;
  threadId: string;
  onBack: () => void;
  onSelectResult: (result: AiChatSearchResult) => void;
}
```

Use `AppScreen`, `AiLightSearchBar`, `aiLightColors`, `spacing`, `rhythm`, `typography`, and `FlatList`.

- [x] **Step 2: Wire local search behavior**

Use state for query, results, loading, offset, and hasMore. Debounce query by 220ms. On query change, reset offset and fetch first page. Add a footer button "继续加载更多结果" when `hasMore` is true.

### Task 4: Wire App Route

**Files:**
- Modify: `App.tsx`

- [x] **Step 1: Add route type**

Add:

```ts
| {
    name: 'ai-chat-search';
    space: PixorySpace;
    threadId: string;
    contextTitle?: string;
    contextType?: 'normal' | 'ip' | 'knowledge_base';
    branchScopes: AiBranchScope[];
  }
```

- [x] **Step 2: Render search screen**

Import `AiChatSearchScreen` and render it. On result selection, replace the search route with an `ai-chat` route using the previous chat route fields and `searchTargetMessageId`.

### Task 5: Wire Chat Entry and Target Scroll

**Files:**
- Modify: `src/screens/AiChatScreen.tsx`

- [x] **Step 1: Add props**

Add `searchTargetMessageId`, `searchTargetKey`, and `onOpenChatSearch`.

- [x] **Step 2: Add header search action**

Add a search icon button in the header. It is disabled until `activeThreadId` exists. It calls `onOpenChatSearch(nextThreadId, getPersistedCurrentBranchScopes())`.

- [x] **Step 3: Reuse scroll retry pattern**

Add a separate `pendingSearchScrollMessageIdRef`, search scroll timeout list, and functions mirroring branch-tree target scroll. If the message is not loaded and `hasEarlierMessages` is true, call `loadEarlierMessages()`. When found, scroll to it and set a temporary `searchHighlightMessageId`.

- [x] **Step 4: Highlight target row**

Wrap or style the target message row with a subtle highlighted background while `searchHighlightMessageId === message.id`.

### Task 6: Verify and Review

**Files:**
- Modify tests if policy expectations need exact regex updates.

- [x] **Step 1: Run focused tests**

Run:

```powershell
node --test tests/ai-chat-search-policy.test.cjs
node --test tests/ai-chat-fixes-policy.test.cjs tests/ai-navigation-policy.test.cjs tests/ai-branch-tree-navigation-policy.test.cjs
```

- [x] **Step 2: Run project checks**

Run:

```powershell
pnpm typecheck
git diff --check
pnpm test
```

- [x] **Step 3: Code review**

Inspect `git diff` for stale route fallback, hidden branch leakage, remote AI calls, and UI token violations. Fix any findings before final reporting.