# AI Chat Message Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local favorite support for assistant AI messages, show them in the existing Favorites Center with chat names, and jump back to the favorited message.

**Architecture:** Store assistant message favorites in a dedicated SQLite table keyed by a deterministic `favoriteKey`. Expose repository and service APIs, then wire `AiMessageBubble`, `AiChatScreen`, `FavoritesScreen`, and `App.tsx` through the existing AI chat search-target scroll path. Preserve image favorite behavior and current branch/version navigation.

**Tech Stack:** React Native, Expo, TypeScript, Expo SQLite, local route stack in `App.tsx`, existing AI chat service/repository layer, existing design tokens.

---

## File Map

- `tests/ai-message-favorites-policy.test.cjs`: new policy test for schema, service, UI, route, and regression expectations.
- `src/database/schema.ts`: bump database version to 37 and add `MIGRATION_STATEMENTS_V37`.
- `src/database/db.ts`: import and execute migration v37.
- `src/database/repositories/aiThreadRepository.ts`: add favorite record types, normalized key helpers, favorite CRUD/list APIs.
- `src/ai/aiChatService.ts`: add screen-facing favorite types and service wrappers.
- `src/components/ai/AiMessageBubble.tsx`: add assistant-only star action between copy and regenerate.
- `src/screens/AiChatScreen.tsx`: load favorite state for visible messages, toggle favorites with branch/version identity, pass state/actions into bubbles.
- `src/screens/FavoritesScreen.tsx`: add `图片` / `AI 消息` segmented mode, load AI favorite rows, render chat-title rows, call open callback.
- `App.tsx`: pass AI favorite open callback into `FavoritesScreen` and build `ai-chat` route using existing search target props.

---

### Task 1: Add Policy Coverage

**Files:**
- Create: `tests/ai-message-favorites-policy.test.cjs`

- [ ] **Step 1: Write the failing policy test**

Create `tests/ai-message-favorites-policy.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('AI message favorites schema uses a dedicated local table with stable key', () => {
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');

  assert.match(schema, /DATABASE_VERSION = 37/);
  assert.match(schema, /MIGRATION_STATEMENTS_V37/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_message_favorites/);
  assert.match(schema, /favoriteKey TEXT NOT NULL/);
  assert.match(schema, /branchScopesJson TEXT NOT NULL DEFAULT '\\[\\]'/);
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_message_favorites_key/);
  assert.match(schema, /ON ai_message_favorites\(favoriteKey\)/);
  assert.match(schema, /FOREIGN KEY \(threadId\) REFERENCES ai_threads\(id\) ON DELETE CASCADE/);
  assert.match(schema, /FOREIGN KEY \(messageId\) REFERENCES ai_messages\(id\) ON DELETE CASCADE/);
  assert.match(db, /MIGRATION_STATEMENTS_V37/);
  assert.match(db, /currentVersion < 37/);
});

test('AI message favorite repository only accepts assistant messages and normalizes identity', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(repository, /export interface AiMessageFavoriteRecord/);
  assert.match(repository, /export interface AiFavoriteAssistantMessageInput/);
  assert.match(repository, /function normalizeFavoriteBranchScopes/);
  assert.match(repository, /branchRootMessageId\.localeCompare/);
  assert.match(repository, /branchVersionIndex - right\.branchVersionIndex/);
  assert.match(repository, /function buildAiMessageFavoriteKey/);
  assert.match(repository, /favoriteAssistantMessage/);
  assert.match(repository, /unfavoriteAssistantMessage/);
  assert.match(repository, /listFavoriteAssistantMessages/);
  assert.match(repository, /findFavoriteAssistantMessageState/);
  assert.match(repository, /message\.role !== 'assistant'/);
  assert.match(repository, /Only assistant messages can be favorited/);
});

test('AI chat service exposes local favorite wrappers without remote calls', () => {
  const service = read('src/ai/aiChatService.ts');

  assert.match(service, /export interface AiMessageFavoriteListItem/);
  assert.match(service, /export async function toggleAssistantMessageFavorite/);
  assert.match(service, /export async function listFavoriteAssistantMessages/);
  assert.match(service, /export async function findFavoriteAssistantMessageState/);
  assert.match(service, /branchScopesJson/);
  const toggleStart = service.indexOf('export async function toggleAssistantMessageFavorite');
  const toggleEnd = service.indexOf('export async function findFavoriteAssistantMessageState');
  assert.notEqual(toggleStart, -1);
  assert.notEqual(toggleEnd, -1);
  const toggleBody = service.slice(toggleStart, toggleEnd);
  assert.match(toggleBody, /runWithDatabaseSpace/);
  assert.match(toggleBody, /aiThreadRepository\.favoriteAssistantMessage/);
  assert.match(toggleBody, /aiThreadRepository\.unfavoriteAssistantMessage/);
  assert.doesNotMatch(toggleBody, /streamChat|embedding|retrieveForThread|generate/);
});

test('assistant message bubbles expose favorite action beside copy and regenerate', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');

  assert.match(bubble, /favorited\?: boolean/);
  assert.match(bubble, /favoritePending\?: boolean/);
  assert.match(bubble, /onToggleFavorite\?: \(message: AiMessageWithCitations\) => void/);
  assert.match(bubble, /accessibilityLabel=\{favorited \? '取消收藏 AI 消息' : '收藏 AI 消息'\}/);
  assert.match(bubble, /name=\{favorited \? 'star' : 'star-outline'\}/);
  assert.match(bubble, /onToggleFavorite\?\(message\)/);
  assert.match(bubble, /canFavorite/);
  assert.match(bubble, /!isUser/);
  assert.match(bubble, /favoriteDisabledByGeneration\?: boolean/);
  assert.match(bubble, /onCopy[\s\S]*onToggleFavorite[\s\S]*onRegenerate/);
});

test('AI chat screen toggles favorites with current branch and visible version identity', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /favoriteStateByKey/);
  assert.match(chat, /favoritePendingByKey/);
  assert.match(chat, /buildMessageFavoriteIdentity/);
  assert.match(chat, /getPersistedCurrentBranchScopes\(\)/);
  assert.match(chat, /message\.versionIndex/);
  assert.match(chat, /toggleAssistantMessageFavorite/);
  assert.match(chat, /findFavoriteAssistantMessageState/);
  assert.match(chat, /favorited=\{/);
  assert.match(chat, /favoritePending=\{/);
  assert.match(chat, /onToggleFavorite=\{/);
});

test('Favorites Center includes AI message segment and opens source chat target', () => {
  const favorites = read('src/screens/FavoritesScreen.tsx');
  const app = read('App.tsx');

  assert.match(favorites, /onOpenAiMessageFavorite/);
  assert.match(favorites, /listFavoriteAssistantMessages/);
  assert.match(favorites, /图片/);
  assert.match(favorites, /AI 消息/);
  assert.match(favorites, /还没有收藏 AI 消息/);
  assert.match(favorites, /favorite\.threadTitle/);
  assert.match(favorites, /favorite\.snippet/);
  assert.match(favorites, /aiFavoriteErrorMessage/);
  assert.match(favorites, /favoriteMode === 'ai' \? `\\$\\{aiMessages\.length\\} 条` : `\\$\\{images\.length\\} 张`/);
  assert.match(app, /onOpenAiMessageFavorite/);
  assert.match(app, /searchTargetMessageId: favorite\.messageId/);
  assert.match(app, /searchTargetBranchScopes: favorite\.branchScopes/);
  assert.match(app, /contextTitle: favorite\.threadTitle/);
});
```

- [ ] **Step 2: Run the policy test and verify it fails**

Run:

```powershell
node --test tests/ai-message-favorites-policy.test.cjs
```

Expected: FAIL because none of the new favorite schema/API/UI wiring exists yet.

---

### Task 2: Add Database Migration And Repository APIs

**Files:**
- Modify: `src/database/schema.ts`
- Modify: `src/database/db.ts`
- Modify: `src/database/repositories/aiThreadRepository.ts`

- [ ] **Step 1: Add schema migration v37**

In `src/database/schema.ts`, change:

```ts
export const DATABASE_VERSION = 36;
```

to:

```ts
export const DATABASE_VERSION = 37;
```

Append after `MIGRATION_STATEMENTS_V36`:

```ts
export const MIGRATION_STATEMENTS_V37 = `
CREATE TABLE IF NOT EXISTS ai_message_favorites (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  threadId TEXT NOT NULL,
  messageId TEXT NOT NULL,
  favoriteKey TEXT NOT NULL,
  branchRootMessageId TEXT,
  branchVersionIndex INTEGER,
  branchScopesJson TEXT NOT NULL DEFAULT '[]',
  messageVersionIndex INTEGER,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (messageId) REFERENCES ai_messages(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_message_favorites_key
  ON ai_message_favorites(favoriteKey);

CREATE INDEX IF NOT EXISTS idx_ai_message_favorites_space_created_at
  ON ai_message_favorites(space, createdAt);

CREATE INDEX IF NOT EXISTS idx_ai_message_favorites_thread
  ON ai_message_favorites(threadId, createdAt);
`;
```

- [ ] **Step 2: Wire migration v37**

In `src/database/db.ts`, add `MIGRATION_STATEMENTS_V37` to the schema import list.

After the v36 migration block, add:

```ts
    if (currentVersion < 37) {
      await database.execAsync(MIGRATION_STATEMENTS_V37);
    }
```

- [ ] **Step 3: Add favorite types and helpers**

In `src/database/repositories/aiThreadRepository.ts`, add after `AiMessageVersionRecord`:

```ts
export interface AiMessageFavoriteRecord {
  id: string;
  space: PixorySpace;
  threadId: string;
  messageId: string;
  favoriteKey: string;
  branchRootMessageId: string | null;
  branchVersionIndex: number | null;
  branchScopesJson: string;
  messageVersionIndex: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessageFavoriteListItem extends AiMessageFavoriteRecord {
  threadTitle: string;
  contextType: AiContextType;
  boundIpId: number | null;
  boundKnowledgeBaseId: string | null;
  includeIpDocuments: boolean;
  messageContent: string;
  messageCreatedAt: string;
  messageUpdatedAt: string;
  versionTotal: number;
}

export interface AiFavoriteAssistantMessageInput {
  space: PixorySpace;
  threadId: string;
  messageId: string;
  branchScopes?: AiBranchScope[];
  messageVersionIndex?: number | null;
}
```

Add helper functions near existing branch helper functions:

```ts
function normalizeFavoriteBranchScopes(branchScopes?: AiBranchScope[]): AiBranchScope[] {
  return normalizeBranchScopes(branchScopes)
    ?? [];
}

function stableFavoriteBranchScopesJson(branchScopes?: AiBranchScope[]): string {
  const normalized = normalizeFavoriteBranchScopes(branchScopes)
    .slice()
    .sort((left, right) => {
      const rootCompare = left.branchRootMessageId.localeCompare(right.branchRootMessageId);
      return rootCompare !== 0 ? rootCompare : left.branchVersionIndex - right.branchVersionIndex;
    });
  return JSON.stringify(normalized);
}

function getPrimaryFavoriteBranchScope(branchScopes?: AiBranchScope[]): AiBranchScope | null {
  return normalizeFavoriteBranchScopes(branchScopes).at(-1) ?? null;
}

function buildAiMessageFavoriteKey(input: AiFavoriteAssistantMessageInput): string {
  return [
    input.space,
    input.messageId,
    stableFavoriteBranchScopesJson(input.branchScopes),
    input.messageVersionIndex ?? 'current',
  ].join('|');
}
```

`favoriteKey` must use the complete stable branch scope JSON as the branch identity. `branchRootMessageId` and `branchVersionIndex` are persisted only as quick display/filter metadata from the last normalized scope; they must not be required for identity correctness.

- [ ] **Step 4: Add repository methods**

Inside `aiThreadRepository`, after `updateMessage`, add:

```ts
  async favoriteAssistantMessage(db: SQLiteDatabase, input: AiFavoriteAssistantMessageInput): Promise<AiMessageFavoriteRecord> {
    const message = await aiThreadRepository.findMessageById(db, input.messageId);
    if (!message || message.threadId !== input.threadId) {
      throw new Error('AI message was not found.');
    }
    if (message.role !== 'assistant') {
      throw new Error('Only assistant messages can be favorited.');
    }
    const now = createTimestamp();
    const primaryScope = getPrimaryFavoriteBranchScope(input.branchScopes);
    const favoriteKey = buildAiMessageFavoriteKey(input);
    const branchScopesJson = stableFavoriteBranchScopesJson(input.branchScopes);
    await db.runAsync(
      `INSERT INTO ai_message_favorites (
        id, space, threadId, messageId, favoriteKey, branchRootMessageId, branchVersionIndex,
        branchScopesJson, messageVersionIndex, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(favoriteKey) DO UPDATE SET updatedAt = excluded.updatedAt`,
      `ai-favorite-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      input.space,
      input.threadId,
      input.messageId,
      favoriteKey,
      primaryScope?.branchRootMessageId ?? null,
      primaryScope?.branchVersionIndex ?? null,
      branchScopesJson,
      input.messageVersionIndex ?? null,
      now,
      now
    );
    const row = await db.getFirstAsync<AiMessageFavoriteRecord>('SELECT * FROM ai_message_favorites WHERE favoriteKey = ?', favoriteKey);
    if (!row) {
      throw new Error('AI message favorite was saved but could not be reloaded.');
    }
    return row;
  },

  async unfavoriteAssistantMessage(db: SQLiteDatabase, input: AiFavoriteAssistantMessageInput): Promise<void> {
    await db.runAsync('DELETE FROM ai_message_favorites WHERE favoriteKey = ?', buildAiMessageFavoriteKey(input));
  },

  async findFavoriteAssistantMessageState(db: SQLiteDatabase, input: AiFavoriteAssistantMessageInput): Promise<AiMessageFavoriteRecord | null> {
    return db.getFirstAsync<AiMessageFavoriteRecord>(
      'SELECT * FROM ai_message_favorites WHERE favoriteKey = ?',
      buildAiMessageFavoriteKey(input)
    );
  },

  async listFavoriteAssistantMessages(
    db: SQLiteDatabase,
    input: { space: PixorySpace; limit?: number; offset?: number }
  ): Promise<AiMessageFavoriteListItem[]> {
    const limit = Math.max(1, Math.min(input.limit ?? 80, 200));
    const offset = Math.max(0, input.offset ?? 0);
    const rows = await db.getAllAsync<AiMessageFavoriteRecord & AiThreadRow & {
      threadTitle: string;
      messageContent: string;
      messageCreatedAt: string;
      messageUpdatedAt: string;
      versionTotal: number;
    }>(
      `SELECT
         ai_message_favorites.*,
         ai_threads.title AS threadTitle,
         ai_threads.contextType,
         ai_threads.boundIpId,
         ai_threads.boundKnowledgeBaseId,
         ai_threads.includeIpDocuments,
         CASE
           WHEN ai_message_versions.id IS NOT NULL THEN ai_message_versions.content
           WHEN ai_message_favorites.messageVersionIndex IS NULL THEN ai_messages.content
           WHEN ai_message_favorites.messageVersionIndex = COALESCE(version_counts.versionTotal, 1) THEN ai_messages.content
           ELSE ''
         END AS messageContent,
         CASE
           WHEN ai_message_versions.id IS NOT NULL THEN ai_message_versions.messageCreatedAt
           ELSE ai_messages.createdAt
         END AS messageCreatedAt,
         CASE
           WHEN ai_message_versions.id IS NOT NULL THEN ai_message_versions.messageUpdatedAt
           ELSE ai_messages.updatedAt
         END AS messageUpdatedAt,
         COALESCE(version_counts.versionTotal, 1) AS versionTotal
       FROM ai_message_favorites
       JOIN ai_threads ON ai_threads.id = ai_message_favorites.threadId
       JOIN ai_messages ON ai_messages.id = ai_message_favorites.messageId
       LEFT JOIN ai_message_versions
         ON ai_message_versions.originalMessageId = ai_message_favorites.messageId
        AND ai_message_versions.versionIndex = ai_message_favorites.messageVersionIndex
       LEFT JOIN (
         SELECT originalMessageId, COUNT(*) + 1 AS versionTotal
         FROM ai_message_versions
         GROUP BY originalMessageId
       ) version_counts ON version_counts.originalMessageId = ai_message_favorites.messageId
       WHERE ai_message_favorites.space = ?
         AND ai_messages.role = 'assistant'
         AND (
           ai_message_favorites.messageVersionIndex IS NULL
           OR ai_message_versions.id IS NOT NULL
           OR ai_message_favorites.messageVersionIndex = COALESCE(version_counts.versionTotal, 1)
         )
       ORDER BY ai_message_favorites.createdAt DESC, ai_message_favorites.id DESC
       LIMIT ? OFFSET ?`,
      input.space,
      limit,
      offset
    );
    return rows.map((row) => ({
      ...row,
      includeIpDocuments: sqliteToBoolean(row.includeIpDocuments),
    }));
  },
```

This SQL intentionally prefers an exact `ai_message_versions.versionIndex` match. If the user favorites current version `2/2` and later regenerates to `3/3`, `messageVersionIndex = 2` resolves to the historical version row and does not drift to the new current message. Fallback to `ai_messages.content` is allowed only for `messageVersionIndex IS NULL` or when the saved version index still equals the current `versionTotal`.

- [ ] **Step 5: Run focused policy test**

Run:

```powershell
node --test tests/ai-message-favorites-policy.test.cjs
```

Expected: FAIL moves forward from schema/repository assertions to service/UI assertions.

---

### Task 3: Add Service Wrappers

**Files:**
- Modify: `src/ai/aiChatService.ts`

- [ ] **Step 1: Import favorite repository types**

Update the existing import from `aiThreadRepository` to include:

```ts
  type AiMessageFavoriteListItem as AiMessageFavoriteRepositoryListItem,
```

- [ ] **Step 2: Add exported favorite list type**

Near existing public AI chat interfaces, add:

```ts
export interface AiMessageFavoriteListItem {
  id: string;
  threadId: string;
  messageId: string;
  threadTitle: string;
  contextType: AiContextType;
  boundIpId: number | null;
  boundKnowledgeBaseId: string | null;
  includeIpDocuments: boolean;
  content: string;
  snippet: string;
  branchScopes: AiBranchScope[];
  messageVersionIndex: number | null;
  versionTotal: number;
  createdAt: string;
  messageCreatedAt: string;
  messageUpdatedAt: string;
}
```

- [ ] **Step 3: Add service helpers**

Add:

```ts
function parseFavoriteBranchScopes(value: string): AiBranchScope[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((scope): scope is AiBranchScope =>
          Boolean(scope)
          && typeof scope.branchRootMessageId === 'string'
          && typeof scope.branchVersionIndex === 'number'
        )
      : [];
  } catch {
    return [];
  }
}

function createFavoriteSnippet(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function mapFavoriteListItem(row: AiMessageFavoriteRepositoryListItem): AiMessageFavoriteListItem {
  return {
    id: row.id,
    threadId: row.threadId,
    messageId: row.messageId,
    threadTitle: row.threadTitle,
    contextType: row.contextType,
    boundIpId: row.boundIpId,
    boundKnowledgeBaseId: row.boundKnowledgeBaseId,
    includeIpDocuments: row.includeIpDocuments,
    content: row.messageContent,
    snippet: createFavoriteSnippet(row.messageContent),
    branchScopes: parseFavoriteBranchScopes(row.branchScopesJson),
    messageVersionIndex: row.messageVersionIndex,
    versionTotal: row.versionTotal,
    createdAt: row.createdAt,
    messageCreatedAt: row.messageCreatedAt,
    messageUpdatedAt: row.messageUpdatedAt,
  };
}
```

- [ ] **Step 4: Add exported service methods**

Add:

```ts
export async function toggleAssistantMessageFavorite(input: {
  space: PixorySpace;
  threadId: string;
  messageId: string;
  branchScopes?: AiBranchScope[];
  messageVersionIndex?: number | null;
  favorited: boolean;
}): Promise<boolean> {
  await runWithDatabaseSpace(input.space, async (db) => {
    if (input.favorited) {
      await aiThreadRepository.favoriteAssistantMessage(db, input);
    } else {
      await aiThreadRepository.unfavoriteAssistantMessage(db, input);
    }
  });
  return input.favorited;
}

export async function findFavoriteAssistantMessageState(input: {
  space: PixorySpace;
  threadId: string;
  messageId: string;
  branchScopes?: AiBranchScope[];
  messageVersionIndex?: number | null;
}): Promise<boolean> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const row = await aiThreadRepository.findFavoriteAssistantMessageState(db, input);
    return Boolean(row);
  });
}

export async function listFavoriteAssistantMessages(input: {
  space: PixorySpace;
  limit?: number;
  offset?: number;
}): Promise<AiMessageFavoriteListItem[]> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const rows = await aiThreadRepository.listFavoriteAssistantMessages(db, input);
    return rows.map(mapFavoriteListItem);
  });
}
```

- [ ] **Step 5: Run focused policy test**

Run:

```powershell
node --test tests/ai-message-favorites-policy.test.cjs
```

Expected: FAIL moves forward to bubble/chat/favorites route assertions.

---

### Task 4: Add Assistant Bubble Favorite Action

**Files:**
- Modify: `src/components/ai/AiMessageBubble.tsx`

- [ ] **Step 1: Extend props**

Add to `AiMessageBubbleProps`:

```ts
  favorited?: boolean;
  favoriteDisabledByGeneration?: boolean;
  favoritePending?: boolean;
  onToggleFavorite?: (message: AiMessageWithCitations) => void;
```

In component parameters, default them:

```ts
  favorited = false,
  favoriteDisabledByGeneration = false,
  favoritePending = false,
  onToggleFavorite,
```

- [ ] **Step 2: Add favorite capability**

Near `canRegenerate`, add:

```ts
  const canFavorite = !isUser && !favoriteDisabledByGeneration && !favoritePending && !actionPending && Boolean(onToggleFavorite);
```

- [ ] **Step 3: Render favorite button between copy and regenerate**

After the copy button and before the user/edit or assistant/regenerate branch, add:

```tsx
          {!isUser ? (
            <Pressable
              accessibilityLabel={favorited ? '取消收藏 AI 消息' : '收藏 AI 消息'}
              accessibilityRole="button"
              accessibilityState={{ selected: favorited, disabled: !canFavorite }}
              disabled={!canFavorite}
              hitSlop={8}
              onPress={() => onToggleFavorite?.(message)}
              style={({ pressed }) => [styles.messageActionButton, favorited ? styles.favoriteActionButtonActive : null, !canFavorite && styles.disabledAction, pressed && canFavorite && styles.pressed]}
            >
              <Ionicons color={favorited ? aiLightColors.coralActive : aiLightColors.muted} name={favorited ? 'star' : 'star-outline'} size={15} />
            </Pressable>
          ) : null}
```

Add style:

```ts
  favoriteActionButtonActive: {
    backgroundColor: aiLightColors.coralSoft,
    borderColor: aiLightColors.coral,
  },
```

- [ ] **Step 4: Update memo equality**

Add:

```ts
    previous.favorited === next.favorited &&
    previous.favoriteDisabledByGeneration === next.favoriteDisabledByGeneration &&
    previous.favoritePending === next.favoritePending &&
```

to `areAiMessageBubblePropsEqual`.

- [ ] **Step 5: Run focused policy test**

Run:

```powershell
node --test tests/ai-message-favorites-policy.test.cjs
```

Expected: FAIL moves forward to chat/favorites route assertions.

---

### Task 5: Wire Favorite State In Chat Screen

**Files:**
- Modify: `src/screens/AiChatScreen.tsx`

- [ ] **Step 1: Import service wrappers**

Add imports from `../ai/aiChatService`:

```ts
  findFavoriteAssistantMessageState,
  toggleAssistantMessageFavorite,
```

- [ ] **Step 2: Add state and identity helper**

Add state near other message state:

```ts
  const [favoriteStateByKey, setFavoriteStateByKey] = useState<Record<string, boolean>>({});
  const [favoritePendingByKey, setFavoritePendingByKey] = useState<Record<string, boolean>>({});
```

Add helper inside the component:

```ts
  function buildMessageFavoriteIdentity(message: AiMessageWithCitations) {
    const branchScopes = getPersistedCurrentBranchScopes();
    const primaryScope = branchScopes.at(-1) ?? null;
    const normalizedScopes = branchScopes
      .slice()
      .sort((left, right) => {
        const rootCompare = left.branchRootMessageId.localeCompare(right.branchRootMessageId);
        return rootCompare !== 0 ? rootCompare : left.branchVersionIndex - right.branchVersionIndex;
      });
    const key = [
      space,
      message.id,
      primaryScope?.branchRootMessageId ?? 'main',
      primaryScope?.branchVersionIndex ?? 0,
      JSON.stringify(normalizedScopes),
      message.versionIndex ?? 'current',
    ].join('|');
    return {
      branchScopes,
      key,
      messageVersionIndex: message.versionIndex,
    };
  }
```

- [ ] **Step 3: Load favorite state for visible assistant messages**

Add an effect after `visibleMessagesRef` updates:

```ts
  useEffect(() => {
    const targetThreadId = activeThreadIdRef.current;
    const assistantMessages = visibleMessages.filter((message) => message.role === 'assistant');
    if (!targetThreadId || assistantMessages.length === 0) {
      setFavoriteStateByKey({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        assistantMessages.map(async (message) => {
          const identity = buildMessageFavoriteIdentity(message);
          const favorited = await findFavoriteAssistantMessageState({
            branchScopes: identity.branchScopes,
            messageId: message.id,
            messageVersionIndex: identity.messageVersionIndex,
            space,
            threadId: targetThreadId,
          });
          return [identity.key, favorited] as const;
        })
      );
      if (!cancelled) {
        setFavoriteStateByKey(Object.fromEntries(entries));
      }
    })().catch((error) => {
      if (!cancelled) {
        setErrorMessage(error instanceof Error ? error.message : '读取 AI 消息收藏状态失败');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [space, visibleMessages, selectedVersionByMessageId, persistedCurrentBranchScopes]);
```

- [ ] **Step 4: Add toggle handler**

Add:

```ts
  async function handleToggleMessageFavorite(message: AiMessageWithCitations) {
    const targetThreadId = activeThreadIdRef.current;
    if (!targetThreadId || message.role !== 'assistant') {
      return;
    }
    const identity = buildMessageFavoriteIdentity(message);
    const nextFavorited = !favoriteStateByKey[identity.key];
    setFavoritePendingByKey((current) => ({ ...current, [identity.key]: true }));
    try {
      await toggleAssistantMessageFavorite({
        branchScopes: identity.branchScopes,
        favorited: nextFavorited,
        messageId: message.id,
        messageVersionIndex: identity.messageVersionIndex,
        space,
        threadId: targetThreadId,
      });
      setFavoriteStateByKey((current) => ({ ...current, [identity.key]: nextFavorited }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '更新 AI 消息收藏失败');
    } finally {
      setFavoritePendingByKey((current) => {
        const next = { ...current };
        delete next[identity.key];
        return next;
      });
    }
  }
```

- [ ] **Step 5: Pass props to bubbles**

Inside `renderMessageItem`, compute:

```ts
      const favoriteIdentity = message.role === 'assistant' ? buildMessageFavoriteIdentity(message) : null;
```

Pass:

```tsx
              favorited={favoriteIdentity ? Boolean(favoriteStateByKey[favoriteIdentity.key]) : false}
              favoriteDisabledByGeneration={generating && message.id === activeAssistantId}
              favoritePending={favoriteIdentity ? Boolean(favoritePendingByKey[favoriteIdentity.key]) : false}
              onToggleFavorite={(targetMessage) => {
                void handleToggleMessageFavorite(targetMessage);
              }}
```

Add `activeAssistantId`, `favoriteStateByKey`, `favoritePendingByKey`, and `handleToggleMessageFavorite` to the render callback dependencies.

- [ ] **Step 6: Run focused policy test**

Run:

```powershell
node --test tests/ai-message-favorites-policy.test.cjs
```

Expected: FAIL moves forward to Favorites Center/App assertions.

---

### Task 6: Add AI Message Mode To Favorites Center

**Files:**
- Modify: `src/screens/FavoritesScreen.tsx`

- [ ] **Step 1: Import AI favorite service type and function**

Add:

```ts
import { listFavoriteAssistantMessages, type AiMessageFavoriteListItem } from '../ai/aiChatService';
```

- [ ] **Step 2: Extend props and mode state**

Add to `FavoritesScreenProps`:

```ts
  onOpenAiMessageFavorite: (favorite: AiMessageFavoriteListItem) => void;
```

Add state:

```ts
  const [favoriteMode, setFavoriteMode] = useState<'images' | 'ai'>('images');
  const [aiMessages, setAiMessages] = useState<AiMessageFavoriteListItem[]>([]);
  const [aiFavoriteErrorMessage, setAiFavoriteErrorMessage] = useState<string | null>(null);
  const [aiFavoritesLoading, setAiFavoritesLoading] = useState(false);
```

- [ ] **Step 3: Keep image loader scoped to image data**

Leave the current image `useScreenLoad` data shape as:

```ts
    images: ImageListItem[];
    ips: IpRecord[];
    groups: GroupRecord[];
    tags: TagUsageItem[];
```

Do not add AI favorites to this loader. This keeps image filters, sorting, multi-select, and image error handling scoped to image favorites.

- [ ] **Step 4: Add independent AI favorite loader**

Add a reload function:

```ts
  const reloadAiFavorites = useCallback(async () => {
    setAiFavoritesLoading(true);
    setAiFavoriteErrorMessage(null);
    try {
      setAiMessages(await listFavoriteAssistantMessages({ space }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setAiFavoriteErrorMessage(`读取 AI 消息收藏失败：${message}`);
    } finally {
      setAiFavoritesLoading(false);
    }
  }, [space]);
```

Import `useCallback` and `useEffect` from React:

```ts
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
```

Add an effect:

```ts
  useEffect(() => {
    void reloadAiFavorites();
  }, [refreshToken, reloadAiFavorites]);
```

Pass `reloadAiFavorites` to the AI `PageStateBlock` retry. Keep the image `PageStateBlock` retry as `reload`.

- [ ] **Step 5: Add segmented control**

Below the summary pill, add:

```tsx
      <View style={styles.favoriteModeTabs}>
        <Pressable onPress={() => setFavoriteMode('images')} style={({ pressed }) => [styles.favoriteModeTab, favoriteMode === 'images' ? styles.favoriteModeTabActive : null, pressed && styles.pressed]}>
          <Text style={[styles.favoriteModeText, favoriteMode === 'images' ? styles.favoriteModeTextActive : null]}>图片</Text>
        </Pressable>
        <Pressable onPress={() => setFavoriteMode('ai')} style={({ pressed }) => [styles.favoriteModeTab, favoriteMode === 'ai' ? styles.favoriteModeTabActive : null, pressed && styles.pressed]}>
          <Text style={[styles.favoriteModeText, favoriteMode === 'ai' ? styles.favoriteModeTextActive : null]}>AI 消息</Text>
        </Pressable>
      </View>
```

- [ ] **Step 6: Render AI favorites branch**

Rename the current image `PageStateBlock` JSX to `imageFavoritesContent` just before `return`:

```tsx
  const imageFavoritesContent = (
    <PageStateBlock
      emptyActionLabel={undefined}
      emptyDescription="给图片加星标后，这里会展示当前所有收藏图片。"
      emptyIconName="star-outline"
      emptyTitle="还没有收藏图片"
      errorMessage={errorMessage}
      isEmpty={!isLoading && images.length === 0}
      loading={isLoading}
      loadingDescription="本地收藏索引读取完成后，这里会展示收藏图片。"
      loadingTitle="正在读取收藏图片"
      onRetry={reload}
    >
      <View style={styles.gridHeader}>
        <Text style={styles.gridTitle}>图片</Text>
        <SortMenuButton onChange={setSortOrder} orderBy={sortOrder} />
        <Pressable
          accessibilityLabel={viewMode === 'detail' ? '切换为宫格展示' : '切换为详细信息展示'}
          onPress={() => setViewMode(viewMode === 'detail' ? 'grid' : 'detail')}
          style={({ pressed }) => [styles.viewModeButton, viewMode === 'detail' ? styles.viewModeButtonActive : null, pressed && styles.pressed]}
        >
          <Ionicons color={viewMode === 'detail' ? colors.primary.active : colors.text.secondary} name={viewMode === 'detail' ? 'list-outline' : 'grid-outline'} size={15} />
        </Pressable>
        <Pressable
          disabled={selectableAssets.length === 0}
          onPress={multiSelect.toggleSelectAll}
          style={({ pressed }) => [styles.selectAllButton, selectableAssets.length === 0 ? styles.disabled : null, pressed && selectableAssets.length > 0 ? styles.pressed : null]}
        >
          <Text style={styles.selectAllText}>{multiSelect.allSelected ? '取消全选' : '全选'}</Text>
        </Pressable>
      </View>
      {viewMode === 'detail' ? (
        <View {...swipeSelection.panHandlers} style={styles.detailList}>
          {images.map((image) => (
            <AssetDetailRow
              image={image}
              key={image.id}
              onLayout={(event) => swipeSelection.registerItemLayout(image.id, event.nativeEvent.layout)}
              onLongPress={() => handleImageLongPress(image)}
              onPress={handleOpenImage}
              selected={multiSelect.selectedImageIds.includes(image.id)}
              space={space}
            />
          ))}
        </View>
      ) : (
        <View {...swipeSelection.panHandlers} style={styles.grid}>
          {images.map((image) => (
            <ThumbnailTile
              image={image}
              key={image.id}
              onLayout={(event) => swipeSelection.registerItemLayout(image.id, event.nativeEvent.layout)}
              onLongPress={() => handleImageLongPress(image)}
              onPress={handleOpenImage}
              selected={multiSelect.selectedImageIds.includes(image.id)}
              space={space}
            />
          ))}
        </View>
      )}
    </PageStateBlock>
  );
```

This is the same image favorite content that currently sits inside the inline `PageStateBlock`; keep behavior unchanged.

Add this AI branch constant next to it:

```tsx
  const aiFavoritesContent = (
    <PageStateBlock
      emptyDescription="在 AI 回复下点亮星标后，这里会展示收藏消息。"
      emptyIconName="star-outline"
      emptyTitle="还没有收藏 AI 消息"
      errorMessage={aiFavoriteErrorMessage}
      isEmpty={!aiFavoritesLoading && aiMessages.length === 0}
      loading={aiFavoritesLoading}
      loadingDescription="正在读取本地 AI 消息收藏。"
      loadingTitle="正在读取收藏"
      onRetry={reloadAiFavorites}
    >
      <View style={styles.aiFavoriteList}>
        {aiMessages.map((favorite) => (
          <Pressable
            accessibilityLabel={`打开收藏消息，来自${favorite.threadTitle}`}
            accessibilityRole="button"
            key={favorite.id}
            onPress={() => onOpenAiMessageFavorite(favorite)}
            style={({ pressed }) => [styles.aiFavoriteRow, pressed && styles.pressed]}
          >
            <View style={styles.aiFavoriteHeader}>
              <Text numberOfLines={1} style={styles.aiFavoriteThread}>{favorite.threadTitle}</Text>
              <Text style={styles.aiFavoriteRole}>AI</Text>
            </View>
            <Text numberOfLines={3} style={styles.aiFavoriteSnippet}>{favorite.snippet || favorite.content}</Text>
            <Text numberOfLines={1} style={styles.aiFavoriteMeta}>
              {favorite.messageVersionIndex && favorite.versionTotal > 1 ? `版本 ${favorite.messageVersionIndex}/${favorite.versionTotal} · ` : ''}
              {new Date(favorite.createdAt).toLocaleDateString()}
            </Text>
          </Pressable>
        ))}
      </View>
    </PageStateBlock>
  );
```

In the screen return, replace the old inline image `PageStateBlock` with:

```tsx
      {favoriteMode === 'ai' ? aiFavoritesContent : imageFavoritesContent}
```

Do not change the JSX inside the moved image favorites content except indentation required by the move.

- [ ] **Step 7: Add mode-aware summary**

Change summary text:

```tsx
        <Text numberOfLines={1} style={styles.subtitle}>
          {favoriteMode === 'ai' ? 'AI 消息收藏' : hasActiveFilters ? '筛选结果' : '全部收藏'}
        </Text>
        <Text numberOfLines={1} style={styles.countText}>
          {favoriteMode === 'ai' ? `${aiMessages.length} 条` : `${images.length} 张`}
        </Text>
```

- [ ] **Step 8: Add styles using tokens**

Add styles:

```ts
  favoriteModeTabs: {
    alignSelf: 'stretch',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    padding: spacing[1],
  },
  favoriteModeTab: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
  },
  favoriteModeTabActive: {
    backgroundColor: colors.primary.weak,
  },
  favoriteModeText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    fontWeight: '700',
  },
  favoriteModeTextActive: {
    color: colors.primary.active,
  },
  aiFavoriteList: {
    gap: rhythm.listCardGap,
  },
  aiFavoriteRow: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[3],
  },
  aiFavoriteHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  aiFavoriteThread: {
    ...typography.textStyles.caption,
    color: colors.text.title,
    flex: 1,
    fontWeight: '700',
  },
  aiFavoriteRole: {
    ...typography.textStyles.micro,
    color: colors.primary.active,
    fontWeight: '800',
  },
  aiFavoriteSnippet: {
    ...typography.textStyles.body,
    color: colors.text.primary,
    lineHeight: 21,
  },
  aiFavoriteMeta: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
  },
```

- [ ] **Step 9: Run focused policy test**

Run:

```powershell
node --test tests/ai-message-favorites-policy.test.cjs
```

Expected: FAIL only on App route assertions if this task is complete.

---

### Task 7: Wire Favorites Route To AI Chat Jump

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Import favorite type**

Add:

```ts
import type { AiMessageFavoriteListItem } from './src/ai/aiChatService';
```

- [ ] **Step 2: Add route builder**

Near `buildAiChatRouteFromSearch`, add:

```ts
function buildAiChatRouteFromFavorite(
  favorite: AiMessageFavoriteListItem,
  space: PixorySpace
): Extract<AppRoute, { name: 'ai-chat' }> {
  return {
    composerEntranceReason: 'replace_current',
    contextTitle: favorite.threadTitle,
    contextType: favorite.contextType,
    includeIpDocuments: favorite.includeIpDocuments,
    ipId: favorite.boundIpId ?? undefined,
    knowledgeBaseId: favorite.boundKnowledgeBaseId ?? undefined,
    searchTargetBranchScopes: favorite.branchScopes,
    searchTargetKey: `${favorite.messageId}:${Date.now()}`,
    searchTargetMessageId: favorite.messageId,
    space,
    threadId: favorite.threadId,
    name: 'ai-chat',
  };
}
```

- [ ] **Step 3: Pass callback into FavoritesScreen**

In the `currentRoute.name === 'favorites'` render branch, add:

```tsx
        onOpenAiMessageFavorite={(favorite) =>
          openAiChatRoute(buildAiChatRouteFromFavorite(favorite, currentRoute.space))
        }
```

Use `openAiChatRoute` for this jump. It already replaces the current route when the current route is `ai-chat` and pushes the chat route from non-chat screens.

- [ ] **Step 4: Run focused policy test**

Run:

```powershell
node --test tests/ai-message-favorites-policy.test.cjs
```

Expected: PASS.

---

### Task 8: Verification And Review

**Files:**
- Review all touched files.

- [ ] **Step 1: Run focused related tests**

Run:

```powershell
node --test tests/ai-message-favorites-policy.test.cjs
node --test tests/ai-chat-search-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs tests/ai-branch-tree-navigation-policy.test.cjs
```

Expected: PASS.

- [ ] **Step 2: Run project checks**

Run:

```powershell
pnpm typecheck
git diff --check
pnpm test
```

Expected: all PASS.

- [ ] **Step 3: Manual code review checklist**

Inspect `git diff` and verify:

- `ai_message_favorites` is local SQLite only.
- Favorite toggle rejects non-assistant messages.
- `favoriteKey` uses sorted normalized branch scopes, not raw caller JSON.
- Favorites Center image mode remains the default and image filters still exist.
- AI favorites show chat title and snippet.
- Favorite click builds `ai-chat` with `searchTargetMessageId` and `searchTargetBranchScopes`.
- No favorite path calls generation, embedding, remote search, or memory maintenance.
- Normal/personal space is passed through every favorite API.

- [ ] **Step 4: Independent final review**

Spawn an independent review subagent after implementation. Ask it to inspect the diff against the spec and verification output. Fix all P0/P1 findings and rerun the relevant tests before final reporting.