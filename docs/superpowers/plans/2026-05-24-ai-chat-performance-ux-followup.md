# Pixory AI Chat Performance And UX Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved follow-up fixes for AI chat long-conversation performance, memory-query efficiency, generation feedback, history interactions, memory board safety, and related UI polish.

**Architecture:** Keep the current mature memory system and AI chat architecture. Apply surgical improvements: additive SQLite migration, repository-level query bounds, prompt-build read sharing, React render stabilization, lightweight animated feedback, and small UI copy/interaction fixes. Do not redesign the chat page, change the six-line composer cap, hide action rows, or add empty-state work.

**Tech Stack:** Expo React Native, TypeScript, expo-sqlite, existing Pixory AI services/repositories, existing AI light theme/tokens, Node `node:test` policy tests, Android emulator/manual validation.

---

## Scope

Implements:

- `docs/superpowers/specs/2026-05-24-ai-chat-performance-ux-followup.md`

Do not implement:

- Empty-state redesigns or new empty-state CTAs.
- Composer expansion beyond six visible lines.
- Hidden message action bars.
- Citation bottom sheet preview.
- Homepage suggested prompt cards.
- Large attachment preview redesign.
- Complex attachment count limits.
- Real-time voice waveform animation.
- Full branch tree.
- Code syntax highlighting.
- Markdown image rendering.
- Release versioning or packaging.

## File Structure

Create:

- `src/components/ai/AiTypingIndicator.tsx`: lightweight waiting/typing dots.
- `src/ai/aiErrorMessageService.ts`: normalize provider/network errors into readable Chinese.
- `src/utils/aiTimeFormatters.ts`: shared AI time formatting helpers.

Modify:

- `src/database/schema.ts`: next additive migration for normalized memory index.
- `src/database/db.ts`: run the new migration.
- `src/database/repositories/aiThreadRepository.ts`: atomic pending turn increment, bounded memory board query, single-timestamp memory touch, optional memory board pagination.
- `src/ai/aiMemoryService.ts`: use atomic pending increment; accept optional preloaded memory settings/candidates where needed.
- `src/ai/aiChatService.ts`: reduce duplicate prompt-building DB reads; use error normalization; expose context-trim state for UI.
- `src/ai/aiContextBudget.ts`: conservative Chinese-heavy token estimation.
- `src/components/ai/AiMessageBubble.tsx`: memoization, selectable text, typing indicator, failed retry button, blinking cursor, avatar dedupe input.
- `src/components/ai/AiMessageContent.tsx`: selectable paragraphs, HR support, lightweight nested-list support.
- `src/components/ai/AiThinkingBlock.tsx`: expand/collapse animation.
- `src/screens/AiChatScreen.tsx`: stable render item, presentation items/date separators, context trim notice, memoized callbacks, avatar dedupe flag.
- `src/screens/AiHistoryScreen.tsx`: search debounce, improved grouping, animated swipe archive.
- `src/screens/AiSessionConfigScreen.tsx`: clearer save/autosave copy.
- `src/screens/AiMemoryBoardScreen.tsx`: delete confirmation/undo, user-facing importance/confidence labels, optional paged loading.
- `tests/ai-chat-fixes-policy.test.cjs`: chat performance and feedback policies.
- `tests/ai-schema-policy.test.cjs`: migration/index policies.
- `tests/ai-rag-policy.test.cjs`: context budget and prompt-build policies.
- `tests/ai-navigation-policy.test.cjs`: history debounce/group/swipe and chat render policy.
- `tests/ai-final-acceptance-policy.test.cjs`: memory board safety, session setting semantics, error recovery policy.

## Task 1: Schema And Repository Performance Fixes

**Files:**

- Modify: `src/database/schema.ts`
- Modify: `src/database/db.ts`
- Modify: `src/database/repositories/aiThreadRepository.ts`
- Modify: `src/ai/aiMemoryService.ts`
- Modify: `tests/ai-schema-policy.test.cjs`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] **Step 1: Add failing schema policy**

Append this test to `tests/ai-schema-policy.test.cjs`:

```js
test('AI memory performance migration adds normalized content index', () => {
  assert.match(schema, /DATABASE_VERSION = 27/);
  assert.match(schema, /MIGRATION_STATEMENTS_V27/);
  assert.match(schema, /idx_ai_memories_normalized_content/);
  assert.match(schema, /space,\s*scope,\s*scopeId,\s*normalizedContent,\s*status/);
  assert.match(db, /MIGRATION_STATEMENTS_V27/);
  assert.match(db, /currentVersion < 27/);
});
```

- [ ] **Step 2: Add failing repository policy**

Append this test to `tests/ai-chat-fixes-policy.test.cjs`:

```js
test('AI memory repository uses atomic pending increments bounded board queries and stable touch timestamps', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const memoryService = read('src/ai/aiMemoryService.ts');

  assert.match(repository, /incrementThreadMemoryPendingTurn/);
  assert.match(repository, /pendingTurnCount = pendingTurnCount \+ 1/);
  assert.match(memoryService, /incrementThreadMemoryPendingTurn\(db, threadId\)/);
  assert.doesNotMatch(memoryService, /const current = await aiThreadRepository\.getThreadMemoryJob\(db, threadId\)[\s\S]*pendingTurnCount: current\.pendingTurnCount \+ 1/);
  assert.match(repository, /listMemoryBoardItems\(db:[\s\S]*limit\?: number[\s\S]*offset\?: number/);
  assert.match(repository, /LIMIT \?/);
  assert.match(repository, /OFFSET \?/);
  assert.match(repository, /const now = createTimestamp\(\);[\s\S]*lastUsedAt = \?, updatedAt = \?[\s\S]*now,\s*now/);
});
```

- [ ] **Step 3: Run focused tests and confirm failure**

Run:

```powershell
pnpm test -- tests/ai-schema-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
```

Expected:

- Fails on missing `DATABASE_VERSION = 27`.
- Fails on missing `incrementThreadMemoryPendingTurn`.
- Fails on current unbounded `listMemoryBoardItems`.

- [ ] **Step 4: Add migration V27**

In `src/database/schema.ts`, bump:

```ts
export const DATABASE_VERSION = 27;
```

Add:

```ts
export const MIGRATION_STATEMENTS_V27 = `
CREATE INDEX IF NOT EXISTS idx_ai_memories_normalized_content
  ON ai_memories(space, scope, scopeId, normalizedContent, status);
`;
```

In `src/database/db.ts`, import and apply:

```ts
MIGRATION_STATEMENTS_V27,
```

```ts
if (currentVersion < 27) {
  await database.execAsync(MIGRATION_STATEMENTS_V27);
}
```

- [ ] **Step 5: Add atomic pending-turn repository method**

In `src/database/repositories/aiThreadRepository.ts`, add:

```ts
async incrementThreadMemoryPendingTurn(db: SQLiteDatabase, threadId: string): Promise<void> {
  const now = createTimestamp();
  await db.runAsync(
    `INSERT INTO ai_thread_memory_jobs (threadId, pendingTurnCount, lastCaptureNoticeJson, updatedAt)
     VALUES (?, 1, '[]', ?)
     ON CONFLICT(threadId) DO UPDATE SET
       pendingTurnCount = pendingTurnCount + 1,
       updatedAt = excluded.updatedAt`,
    threadId,
    now
  );
},
```

Then replace `incrementPendingMemoryTurn` in `src/ai/aiMemoryService.ts`:

```ts
export async function incrementPendingMemoryTurn(db: SQLiteDatabase, threadId: string): Promise<void> {
  await aiThreadRepository.incrementThreadMemoryPendingTurn(db, threadId);
}
```

- [ ] **Step 6: Bound memory board query**

Change `listMemoryBoardItems` input in `src/database/repositories/aiThreadRepository.ts`:

```ts
async listMemoryBoardItems(
  db: SQLiteDatabase,
  input: {
    space: PixorySpace;
    threadId?: string | null;
    roleCardId?: string | null;
    boundIpId?: number | null;
    boundKnowledgeBaseId?: string | null;
    limit?: number;
    offset?: number;
  }
): Promise<AiMemoryRecord[]> {
```

Change the query tail:

```ts
const limit = Math.max(1, Math.min(input.limit ?? 80, 200));
const offset = Math.max(0, input.offset ?? 0);
return db.getAllAsync<AiMemoryRecord>(
  `SELECT * FROM ai_memories
   WHERE ${clauses.join(' AND ')}
   ORDER BY scope ASC, importance DESC, createdAt ASC, id ASC
   LIMIT ? OFFSET ?`,
  ...values,
  limit,
  offset
);
```

Update prompt path callers to pass a smaller limit, for example:

```ts
const memories = await aiThreadRepository.listMemoryBoardItems(db, {
  ...scopedBoardInput(thread),
  limit: STABLE_MEMORY_LIMIT * 2,
});
```

Keep Memory Board initial load at a larger but bounded value:

```ts
await listMemoryBoardItems(space, nextThread, { limit: 100 });
```

- [ ] **Step 7: Fix `touchMemories` timestamp**

Change `touchMemories` in `src/database/repositories/aiThreadRepository.ts`:

```ts
async touchMemories(db: SQLiteDatabase, memoryIds: string[]): Promise<void> {
  if (memoryIds.length === 0) {
    return;
  }
  const now = createTimestamp();
  await db.runAsync(
    `UPDATE ai_memories SET lastUsedAt = ?, updatedAt = ? WHERE id IN (${makeInClause(memoryIds)})`,
    now,
    now,
    ...memoryIds
  );
}
```

- [ ] **Step 8: Run focused tests**

Run:

```powershell
pnpm test -- tests/ai-schema-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
```

Expected: all tests in these two files pass.

- [ ] **Step 9: Commit**

```powershell
git add src/database/schema.ts src/database/db.ts src/database/repositories/aiThreadRepository.ts src/ai/aiMemoryService.ts tests/ai-schema-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
git commit -m "perf: bound ai memory maintenance queries"
```

## Task 2: Context Budget And Prompt Build Read Sharing

**Files:**

- Modify: `src/ai/aiContextBudget.ts`
- Modify: `src/ai/aiMemoryService.ts`
- Modify: `src/ai/aiChatService.ts`
- Modify: `tests/ai-rag-policy.test.cjs`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] **Step 1: Add failing budget policy**

Append to `tests/ai-rag-policy.test.cjs`:

```js
test('AI context budget estimates Chinese text conservatively', () => {
  const budget = read('src/ai/aiContextBudget.ts');

  assert.match(budget, /CJK_CHAR_PATTERN/);
  assert.match(budget, /asciiTokenEstimate/);
  assert.match(budget, /cjkTokenEstimate/);
  assert.match(budget, /Math\.ceil\(cjkChars \* 0\.8\)/);
  assert.doesNotMatch(budget, /Math\.ceil\(value\.length \/ 3\)/);
});
```

- [ ] **Step 2: Add failing prompt-build policy**

Append to `tests/ai-chat-fixes-policy.test.cjs`:

```js
test('AI prompt build reuses deep memory settings instead of repeating settings reads', () => {
  const chat = read('src/ai/aiChatService.ts');
  const memoryService = read('src/ai/aiMemoryService.ts');

  assert.match(memoryService, /BuildMemoryPrefixOptions/);
  assert.match(memoryService, /settings\?: AiThreadMemorySettingsRecord/);
  assert.match(chat, /const memorySettings = await aiThreadRepository\.getThreadMemorySettings\(db, thread\.id\)/);
  assert.match(chat, /buildCompanionMemoryPrefix\(db, thread, \{ settings: memorySettings/);
  assert.match(chat, /buildStableMemoryPrefix\(db, thread, \{ settings: memorySettings/);
  assert.match(chat, /retrieveDynamicMemoryContext\(db, thread, userMessage, \{ settings: memorySettings/);
});
```

- [ ] **Step 3: Run focused tests and confirm failure**

```powershell
pnpm test -- tests/ai-rag-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
```

Expected: fails on missing `CJK_CHAR_PATTERN` and missing `BuildMemoryPrefixOptions`.

- [ ] **Step 4: Implement conservative token estimation**

Replace `estimatePromptTokens` in `src/ai/aiContextBudget.ts` with:

```ts
const CJK_CHAR_PATTERN = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g;

export function estimatePromptTokens(value: string): number {
  const cjkChars = value.match(CJK_CHAR_PATTERN)?.length ?? 0;
  const nonCjkChars = Math.max(0, value.length - cjkChars);
  const cjkTokenEstimate = Math.ceil(cjkChars * 0.8);
  const asciiTokenEstimate = Math.ceil(nonCjkChars / 4);
  return Math.max(1, cjkTokenEstimate + asciiTokenEstimate);
}
```

- [ ] **Step 5: Add shared memory-prefix options**

In `src/ai/aiMemoryService.ts`, import the settings record type if it exists in the repository:

```ts
import type { AiThreadMemorySettingsRecord } from '../database/repositories/aiThreadRepository';
```

Add:

```ts
export interface BuildMemoryPrefixOptions {
  settings?: AiThreadMemorySettingsRecord;
}

async function resolveMemorySettings(db: SQLiteDatabase, thread: AiThreadRecord, options?: BuildMemoryPrefixOptions): Promise<AiThreadMemorySettingsRecord> {
  return options?.settings ?? aiThreadRepository.getThreadMemorySettings(db, thread.id);
}
```

Update signatures:

```ts
export async function buildStableMemoryPrefix(db: SQLiteDatabase, thread: AiThreadRecord, options?: BuildMemoryPrefixOptions): Promise<string> {
  const settings = await resolveMemorySettings(db, thread, options);
  if (!settings.deepMemoryEnabled) {
    return '';
  }
  // existing body
}

export async function buildCompanionMemoryPrefix(db: SQLiteDatabase, thread: AiThreadRecord, options?: BuildMemoryPrefixOptions): Promise<string> {
  const settings = await resolveMemorySettings(db, thread, options);
  if (!settings.deepMemoryEnabled) {
    return '';
  }
  // existing body
}

export async function retrieveDynamicMemoryContext(db: SQLiteDatabase, thread: AiThreadRecord, userMessage: string, options?: BuildMemoryPrefixOptions): Promise<string> {
  const settings = await resolveMemorySettings(db, thread, options);
  if (!settings.deepMemoryEnabled) {
    return '';
  }
  // existing body
}
```

- [ ] **Step 6: Reuse settings in `buildPromptForThread`**

In `src/ai/aiChatService.ts`, add `aiThreadRepository` access inside the existing `runWithDatabaseSpace` block:

```ts
const { companionMemoryPrefix, stableMemoryPrefix, dynamicMemoryContext } = await runWithDatabaseSpace(thread.space, async (db) => {
  const memorySettings = await aiThreadRepository.getThreadMemorySettings(db, thread.id);
  return {
    companionMemoryPrefix: await buildCompanionMemoryPrefix(db, thread, { settings: memorySettings }),
    dynamicMemoryContext: await retrieveDynamicMemoryContext(db, thread, userMessage, { settings: memorySettings }),
    stableMemoryPrefix: await buildStableMemoryPrefix(db, thread, { settings: memorySettings }),
  };
});
```

Do not change prompt ordering in this task.

- [ ] **Step 7: Run focused tests**

```powershell
pnpm test -- tests/ai-rag-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
```

Expected: pass.

- [ ] **Step 8: Commit**

```powershell
git add src/ai/aiContextBudget.ts src/ai/aiMemoryService.ts src/ai/aiChatService.ts tests/ai-rag-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
git commit -m "perf: tighten ai prompt budget and memory reads"
```

## Task 3: Message List Render Stability And Avatar Dedupe

**Files:**

- Modify: `src/components/ai/AiMessageBubble.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`
- Modify: `tests/ai-navigation-policy.test.cjs`

- [ ] **Step 1: Add failing memo/avatar policy**

Append to `tests/ai-chat-fixes-policy.test.cjs`:

```js
test('AI message bubbles are memoized and support assistant avatar dedupe', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(bubble, /import \{ memo,/);
  assert.match(bubble, /showAvatar\?: boolean/);
  assert.match(bubble, /const showAssistantAvatar = !isUser && showAvatar && assistantAvatar\?\.avatarEnabled/);
  assert.match(bubble, /export const AiMessageBubble = memo\(AiMessageBubbleComponent\)/);
  assert.match(chat, /showAvatar: message\.role === 'assistant' && previousMessage\?\.role !== 'assistant'/);
});
```

- [ ] **Step 2: Add failing render stability policy**

Update the existing `AI chat keeps the top bar fixed while only messages scroll` test in `tests/ai-navigation-policy.test.cjs` so it expects stable render item:

```js
assert.match(content, /type VisibleMessageItem/);
assert.match(content, /const visibleMessageItems = useMemo/);
assert.match(content, /const renderMessageItem = useCallback/);
assert.match(content, /renderItem=\{renderMessageItem\}/);
assert.match(content, /keyExtractor=\{messageKeyExtractor\}/);
```

Remove the old assertion that requires:

```js
assert.match(content, /renderItem=\{\(\{ item: message, index \}\) =>/);
```

- [ ] **Step 3: Run focused tests and confirm failure**

```powershell
pnpm test -- tests/ai-chat-fixes-policy.test.cjs tests/ai-navigation-policy.test.cjs
```

Expected: fails on missing memoized bubble and `renderMessageItem`.

- [ ] **Step 4: Memoize `AiMessageBubble`**

In `src/components/ai/AiMessageBubble.tsx`, change import:

```ts
import { memo, useEffect, useState } from 'react';
```

Add prop:

```ts
showAvatar?: boolean;
```

Rename function:

```ts
function AiMessageBubbleComponent({
  assistantAvatar,
  generating = false,
  message,
  showAvatar = true,
  // rest unchanged
}: AiMessageBubbleProps) {
```

Change avatar expression:

```ts
const showAssistantAvatar = !isUser && showAvatar && assistantAvatar?.avatarEnabled;
```

At the bottom:

```ts
export const AiMessageBubble = memo(AiMessageBubbleComponent);
```

- [ ] **Step 5: Precompute visible message items**

In `src/screens/AiChatScreen.tsx`, add a local type near state declarations:

```ts
type VisibleMessageItem = {
  message: AiMessageWithCitations;
  showDateSeparator: boolean;
  showAvatar: boolean;
};
```

Add memoized items:

```ts
const visibleMessageItems = useMemo<VisibleMessageItem[]>(
  () =>
    visibleMessages.map((message, index) => {
      const previousMessage = index > 0 ? visibleMessages[index - 1] : null;
      return {
        message,
        showAvatar: message.role === 'assistant' && previousMessage?.role !== 'assistant',
        showDateSeparator: shouldShowDateSeparator(visibleMessages, index),
      };
    }),
  [visibleMessages]
);
```

- [ ] **Step 6: Stabilize key extractor and render item**

Add:

```ts
const messageKeyExtractor = useCallback((item: VisibleMessageItem) => item.message.id, []);
```

Add `renderMessageItem`:

```tsx
const renderMessageItem = useCallback(
  ({ item }: { item: VisibleMessageItem }) => {
    const message = item.message;
    return (
      <>
        {item.showDateSeparator ? <Text style={styles.dateSeparator}>{formatDateSeparator(message.createdAt)}</Text> : null}
        <AiMessageBubble
          assistantAvatar={assistantAvatar}
          editingMessageId={editingUserMessageId}
          generating={generating}
          message={message}
          onCancelEdit={cancelInlineEdit}
          onChangeEditDraft={setEditingDraft}
          onCopy={handleCopyMessage}
          onEditUser={handleEditUserMessage}
          onOpenCitation={handleOpenCitation}
          onRegenerate={handleRegenerate}
          onSelectVersion={handleSelectVersion}
          onSubmitEdit={handleSubmitInlineEdit}
          showAvatar={item.showAvatar}
          space={space}
          streaming={streamingMessageId === message.id}
        />
      </>
    );
  },
  [
    assistantAvatar,
    cancelInlineEdit,
    editingUserMessageId,
    generating,
    handleCopyMessage,
    handleEditUserMessage,
    handleOpenCitation,
    handleRegenerate,
    handleSelectVersion,
    handleSubmitInlineEdit,
    space,
    streamingMessageId,
  ]
);
```

If any handler is not currently stable, wrap it in `useCallback` with the smallest correct dependency list.

- [ ] **Step 7: Update FlatList**

Change:

```tsx
data={visibleMessages}
keyExtractor={(message) => message.id}
renderItem={({ item: message, index }) => (...)}
```

To:

```tsx
data={visibleMessageItems}
keyExtractor={messageKeyExtractor}
renderItem={renderMessageItem}
```

- [ ] **Step 8: Run focused tests**

```powershell
pnpm test -- tests/ai-chat-fixes-policy.test.cjs tests/ai-navigation-policy.test.cjs
```

Expected: pass.

- [ ] **Step 9: Commit**

```powershell
git add src/components/ai/AiMessageBubble.tsx src/screens/AiChatScreen.tsx tests/ai-chat-fixes-policy.test.cjs tests/ai-navigation-policy.test.cjs
git commit -m "perf: stabilize ai chat message rendering"
```

## Task 4: Typing Indicator, Blinking Cursor, And Failed Bubble Retry

**Files:**

- Create: `src/components/ai/AiTypingIndicator.tsx`
- Create: `src/ai/aiErrorMessageService.ts`
- Modify: `src/components/ai/AiMessageBubble.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `src/ai/aiChatService.ts`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`
- Modify: `tests/ai-final-acceptance-policy.test.cjs`

- [ ] **Step 1: Add failing typing/cursor policy**

Append to `tests/ai-chat-fixes-policy.test.cjs`:

```js
test('AI assistant waiting and streaming states use lightweight animated feedback', () => {
  const typing = read('src/components/ai/AiTypingIndicator.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');

  assert.match(typing, /Animated/);
  assert.match(typing, /typingDot/);
  assert.match(bubble, /AiTypingIndicator/);
  assert.match(bubble, /waitingForFirstToken/);
  assert.match(bubble, /Animated\.loop/);
  assert.match(bubble, /streamingCursorOpacity/);
});
```

- [ ] **Step 2: Add failing error recovery policy**

Append to `tests/ai-final-acceptance-policy.test.cjs`:

```js
test('AI failed assistant bubbles provide readable errors and inline retry', () => {
  const errors = read('src/ai/aiErrorMessageService.ts');
  const chatService = read('src/ai/aiChatService.ts');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');

  assert.match(errors, /normalizeAiErrorMessage/);
  assert.match(errors, /API Key 无效或已过期/);
  assert.match(errors, /额度不足或请求过于频繁/);
  assert.match(errors, /模型暂时不可用/);
  assert.match(errors, /网络连接失败/);
  assert.match(chatService, /normalizeAiErrorMessage/);
  assert.match(bubble, /inlineRetryButton/);
  assert.match(bubble, /重试/);
});
```

- [ ] **Step 3: Run focused tests and confirm failure**

```powershell
pnpm test -- tests/ai-chat-fixes-policy.test.cjs tests/ai-final-acceptance-policy.test.cjs
```

Expected: fails on missing `AiTypingIndicator.tsx` and `aiErrorMessageService.ts`.

- [ ] **Step 4: Create typing indicator**

Create `src/components/ai/AiTypingIndicator.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { radius, rhythm, spacing } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

export function AiTypingIndicator() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { duration: 420, toValue: 1, useNativeDriver: true }),
        Animated.timing(progress, { duration: 420, toValue: 0, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [progress]);

  return (
    <View accessibilityLabel="AI 正在准备回复" style={styles.wrap}>
      {[0, 1, 2].map((index) => (
        <Animated.View
          key={index}
          style={[
            styles.typingDot,
            {
              opacity: progress.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: index === 1 ? [0.35, 1, 0.35] : index === 2 ? [0.25, 0.45, 1] : [1, 0.45, 0.25],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.microGap,
    paddingVertical: spacing[1],
  },
  typingDot: {
    backgroundColor: aiLightColors.coralActive,
    borderRadius: radius.pill,
    height: 5,
    width: 5,
  },
});
```

- [ ] **Step 5: Create error normalization service**

Create `src/ai/aiErrorMessageService.ts`:

```ts
export function normalizeAiErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const text = raw.toLowerCase();

  if (/api[_\s-]?key|unauthorized|401|invalid key|missing key/.test(text)) {
    return 'API Key 无效或已过期，请检查模型账号设置。';
  }
  if (/quota|balance|billing|insufficient|rate limit|429|too many requests/.test(text)) {
    return '额度不足或请求过于频繁，请稍后再试或检查模型账号额度。';
  }
  if (/model.*not found|model.*unavailable|404|unsupported model|invalid model/.test(text)) {
    return '模型暂时不可用，请切换模型或检查模型 ID。';
  }
  if (/network|timeout|failed to fetch|connection|econn|socket/.test(text)) {
    return '网络连接失败，请检查网络后重试。';
  }
  return raw.trim() || '生成失败，请稍后重试。';
}
```

- [ ] **Step 6: Use normalized errors in chat service**

In `src/ai/aiChatService.ts`, import:

```ts
import { normalizeAiErrorMessage } from './aiErrorMessageService';
```

Where stream/provider errors are passed to failed messages, wrap:

```ts
const readableError = normalizeAiErrorMessage(event.message);
await markAssistantFailed(input.space, input.assistantMessageId, readableError, answerText, reasoningText || null);
```

For caught exceptions:

```ts
const readableError = normalizeAiErrorMessage(error);
await markAssistantFailed(input.space, input.assistantMessageId, readableError, partialContent, reasoningText || null);
```

- [ ] **Step 7: Add waiting indicator and blinking cursor in bubble**

In `src/components/ai/AiMessageBubble.tsx`, import:

```ts
import { Animated } from 'react-native';
import { AiTypingIndicator } from './AiTypingIndicator';
```

Add state/ref:

```ts
const streamingCursorOpacity = useRef(new Animated.Value(1)).current;
const waitingForFirstToken = streaming && !message.content.trim();
```

Add effect:

```ts
useEffect(() => {
  if (!streaming) {
    streamingCursorOpacity.setValue(1);
    return undefined;
  }
  const animation = Animated.loop(
    Animated.sequence([
      Animated.timing(streamingCursorOpacity, { duration: 520, toValue: 0.2, useNativeDriver: true }),
      Animated.timing(streamingCursorOpacity, { duration: 520, toValue: 1, useNativeDriver: true }),
    ])
  );
  animation.start();
  return () => animation.stop();
}, [streaming, streamingCursorOpacity]);
```

Render assistant content:

```tsx
{waitingForFirstToken ? <AiTypingIndicator /> : <AiMessageContent content={content} />}
{streaming && !waitingForFirstToken ? (
  <Animated.Text style={[styles.streamingCursor, { opacity: streamingCursorOpacity }]}>▌</Animated.Text>
) : null}
```

- [ ] **Step 8: Add inline retry for failed assistant bubble**

Inside failed assistant bubble, after content:

```tsx
{isFailed && !isUser && canRegenerate ? (
  <Pressable accessibilityRole="button" onPress={() => onRegenerate(message.id)} style={({ pressed }) => [styles.inlineRetryButton, pressed && styles.pressed]}>
    <Ionicons color={aiLightColors.coralActive} name="refresh-outline" size={15} />
    <Text style={styles.inlineRetryText}>重试</Text>
  </Pressable>
) : null}
```

Add styles:

```ts
inlineRetryButton: {
  alignItems: 'center',
  alignSelf: 'flex-start',
  borderColor: aiLightColors.hairline,
  borderRadius: radius.pill,
  borderWidth: StyleSheet.hairlineWidth,
  flexDirection: 'row',
  gap: spacing[1],
  paddingHorizontal: spacing[2],
  paddingVertical: spacing[1],
},
inlineRetryText: {
  ...typography.textStyles.caption,
  color: aiLightColors.coralActive,
  fontWeight: '700',
},
```

- [ ] **Step 9: Run focused tests**

```powershell
pnpm test -- tests/ai-chat-fixes-policy.test.cjs tests/ai-final-acceptance-policy.test.cjs
```

Expected: pass.

- [ ] **Step 10: Commit**

```powershell
git add src/components/ai/AiTypingIndicator.tsx src/ai/aiErrorMessageService.ts src/components/ai/AiMessageBubble.tsx src/screens/AiChatScreen.tsx src/ai/aiChatService.ts tests/ai-chat-fixes-policy.test.cjs tests/ai-final-acceptance-policy.test.cjs
git commit -m "feat: improve ai generation feedback"
```

## Task 5: Context Trim Notice

**Files:**

- Modify: `src/ai/aiChatService.ts`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] **Step 1: Add failing policy**

Append to `tests/ai-chat-fixes-policy.test.cjs`:

```js
test('AI chat surfaces a subtle notice when older context was trimmed', () => {
  const service = read('src/ai/aiChatService.ts');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(service, /contextTrimmedByBudget/);
  assert.match(service, /contextTrimmedByCount/);
  assert.match(chat, /contextTrimNotice/);
  assert.match(chat, /较早的部分对话可能不会被本次回复参考/);
  assert.match(chat, /promptSnapshotJson/);
});
```

- [ ] **Step 2: Run focused test and confirm failure**

```powershell
pnpm test -- tests/ai-chat-fixes-policy.test.cjs
```

Expected: fails on missing `contextTrimNotice`.

- [ ] **Step 3: Parse trim status when messages load**

In `src/screens/AiChatScreen.tsx`, add helper:

```ts
function messageHasContextTrim(message: AiMessageWithCitations): boolean {
  try {
    const snapshot = message.promptSnapshotJson ? JSON.parse(message.promptSnapshotJson) : null;
    return Boolean(snapshot?.contextTrimmedByBudget || snapshot?.contextTrimmedByCount || snapshot?.contextTrimmed);
  } catch {
    return false;
  }
}
```

Add memo:

```ts
const contextTrimNotice = useMemo(
  () => [...visibleMessages].reverse().some((message) => message.role === 'assistant' && messageHasContextTrim(message)),
  [visibleMessages]
);
```

- [ ] **Step 4: Render low-key notice above composer**

Near existing composer panel/notice area:

```tsx
{contextTrimNotice ? (
  <Text style={styles.contextTrimNotice}>较早的部分对话可能不会被本次回复参考。</Text>
) : null}
```

Add style:

```ts
contextTrimNotice: {
  ...typography.textStyles.caption,
  color: aiLightColors.muted,
  paddingHorizontal: spacing[4],
  paddingBottom: spacing[1],
  textAlign: 'center',
},
```

- [ ] **Step 5: Run focused test**

```powershell
pnpm test -- tests/ai-chat-fixes-policy.test.cjs
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add src/screens/AiChatScreen.tsx tests/ai-chat-fixes-policy.test.cjs
git commit -m "feat: show ai context trim notice"
```

## Task 6: Selectable Text And Markdown HR

**Files:**

- Modify: `src/components/ai/AiMessageBubble.tsx`
- Modify: `src/components/ai/AiMessageContent.tsx`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] **Step 1: Add failing policy**

Append to `tests/ai-chat-fixes-policy.test.cjs`:

```js
test('AI message text supports selection and lightweight markdown separators', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const content = read('src/components/ai/AiMessageContent.tsx');

  assert.match(bubble, /<Text selectable style=\{\[styles\.content, styles\.userText\]\}/);
  assert.match(content, /selectable/);
  assert.match(content, /type: 'hr'/);
  assert.match(content, /isHorizontalRule/);
  assert.match(content, /styles\.horizontalRule/);
  assert.match(content, /nestLevel/);
});
```

- [ ] **Step 2: Run focused test and confirm failure**

```powershell
pnpm test -- tests/ai-chat-fixes-policy.test.cjs
```

Expected: fails on missing `type: 'hr'` and selectable user text.

- [ ] **Step 3: Make user text selectable**

In `src/components/ai/AiMessageBubble.tsx`, change:

```tsx
<Text style={[styles.content, styles.userText]}>{content}</Text>
```

To:

```tsx
<Text selectable style={[styles.content, styles.userText]}>{content}</Text>
```

- [ ] **Step 4: Add HR parsing to message content**

In `src/components/ai/AiMessageContent.tsx`, extend block type:

```ts
type MarkdownBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; ordered: boolean; items: Array<{ checked?: boolean; text: string; nestLevel: number }> }
  | { type: 'quote'; text: string }
  | { type: 'code'; language: string | null; text: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'hr' };
```

Add:

```ts
function isHorizontalRule(line: string): boolean {
  return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
}
```

In parser before paragraph handling:

```ts
if (isHorizontalRule(line)) {
  blocks.push({ type: 'hr' });
  index += 1;
  continue;
}
```

- [ ] **Step 5: Add lightweight nested-list level**

When parsing list lines, calculate:

```ts
const indent = /^(\s*)/.exec(line)?.[1].length ?? 0;
const nestLevel = Math.min(3, Math.floor(indent / 2));
```

Store each item:

```ts
items.push({ checked, nestLevel, text });
```

Apply item padding:

```tsx
<View key={`${key}-${itemIndex}`} style={[styles.listItem, item.nestLevel > 0 && { paddingLeft: item.nestLevel * spacing[3] }]}>
```

- [ ] **Step 6: Render selectable paragraphs and HR**

For paragraph/heading/quote text components, add `selectable`.

Add HR render branch:

```tsx
if (block.type === 'hr') {
  return <View key={key} style={styles.horizontalRule} />;
}
```

Add style:

```ts
horizontalRule: {
  backgroundColor: aiLightColors.hairline,
  height: StyleSheet.hairlineWidth,
  marginVertical: spacing[2],
  width: '100%',
},
```

- [ ] **Step 7: Run focused test**

```powershell
pnpm test -- tests/ai-chat-fixes-policy.test.cjs
```

Expected: pass.

- [ ] **Step 8: Commit**

```powershell
git add src/components/ai/AiMessageBubble.tsx src/components/ai/AiMessageContent.tsx tests/ai-chat-fixes-policy.test.cjs
git commit -m "feat: improve ai message text selection"
```

## Task 7: Thinking Block Expand Animation

**Files:**

- Modify: `src/components/ai/AiThinkingBlock.tsx`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] **Step 1: Add failing policy**

Append to `tests/ai-chat-fixes-policy.test.cjs`:

```js
test('AI thinking block expands and collapses with a lightweight animation', () => {
  const thinking = read('src/components/ai/AiThinkingBlock.tsx');

  assert.match(thinking, /Animated/);
  assert.match(thinking, /expandedProgress/);
  assert.match(thinking, /Animated\.timing/);
  assert.match(thinking, /useNativeDriver: false/);
  assert.match(thinking, /thinkingAnimatedBody/);
});
```

- [ ] **Step 2: Run focused test and confirm failure**

```powershell
pnpm test -- tests/ai-chat-fixes-policy.test.cjs
```

Expected: fails on missing `expandedProgress`.

- [ ] **Step 3: Add animation state**

In `src/components/ai/AiThinkingBlock.tsx`, import:

```ts
import { Animated } from 'react-native';
import { useEffect, useRef } from 'react';
```

Add:

```ts
const expandedProgress = useRef(new Animated.Value(expanded ? 1 : 0)).current;

useEffect(() => {
  Animated.timing(expandedProgress, {
    duration: 180,
    toValue: expanded ? 1 : 0,
    useNativeDriver: false,
  }).start();
}, [expanded, expandedProgress]);
```

- [ ] **Step 4: Wrap reasoning body**

Replace direct expanded body render with:

```tsx
<Animated.View
  style={[
    styles.thinkingAnimatedBody,
    {
      maxHeight: expandedProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 320],
      }),
      opacity: expandedProgress,
    },
  ]}
>
  {expanded ? <Text style={styles.reasoningText}>{reasoningText}</Text> : null}
</Animated.View>
```

Add style:

```ts
thinkingAnimatedBody: {
  overflow: 'hidden',
},
```

The `maxHeight` cap is deliberate to avoid measuring every list item; long content can continue using existing text flow inside the cap if the current component already scrolls, or can use the existing non-scroll behavior if not.

- [ ] **Step 5: Run focused test**

```powershell
pnpm test -- tests/ai-chat-fixes-policy.test.cjs
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add src/components/ai/AiThinkingBlock.tsx tests/ai-chat-fixes-policy.test.cjs
git commit -m "feat: animate ai thinking expansion"
```

## Task 8: History Search Debounce, Grouping, And Animated Swipe

**Files:**

- Modify: `src/screens/AiHistoryScreen.tsx`
- Modify: `tests/ai-navigation-policy.test.cjs`

- [ ] **Step 1: Add failing history policy**

Append to `tests/ai-navigation-policy.test.cjs`:

```js
test('AI history search is debounced and older chats are grouped by month', () => {
  const history = read('src/screens/AiHistoryScreen.tsx');

  assert.match(history, /debouncedSearchText/);
  assert.match(history, /setTimeout\(\(\) => setDebouncedSearchText\(searchText\), 300\)/);
  assert.match(history, /searchText: debouncedSearchText/);
  assert.match(history, /过去 30 天/);
  assert.match(history, /toLocaleDateString\('zh-CN', \{ year: 'numeric', month: 'long' \}\)/);
});

test('AI history archive swipe follows the finger and snaps with animation', () => {
  const history = read('src/screens/AiHistoryScreen.tsx');

  assert.match(history, /Animated/);
  assert.match(history, /swipeAnimatedValuesRef/);
  assert.match(history, /Animated\.spring/);
  assert.match(history, /useNativeDriver: true/);
  assert.match(history, /onPanResponderMove/);
  assert.match(history, /translateX: swipeTranslateX/);
});
```

- [ ] **Step 2: Run focused test and confirm failure**

```powershell
pnpm test -- tests/ai-navigation-policy.test.cjs
```

Expected: fails on missing `debouncedSearchText` and animated swipe refs.

- [ ] **Step 3: Add search debounce**

In `src/screens/AiHistoryScreen.tsx`, add state:

```ts
const [debouncedSearchText, setDebouncedSearchText] = useState(searchText);
```

Add effect:

```ts
useEffect(() => {
  const timer = setTimeout(() => setDebouncedSearchText(searchText), 300);
  return () => clearTimeout(timer);
}, [searchText]);
```

Change reload dependency/query:

```ts
const reload = useCallback(async () => {
  setItems(await listAiHistoryThreads({ filter, searchText: debouncedSearchText, space }));
}, [debouncedSearchText, filter, space]);
```

Use `debouncedSearchText.trim()` for empty-result labels where the query has actually applied. Keep the input bound to `searchText`.

- [ ] **Step 4: Improve grouping**

Replace `historyGroupLabel` logic with:

```ts
function historyGroupLabel(value: string | null | undefined): string {
  if (!value) {
    return '更早';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '更早';
  }
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.floor((startOfToday - startOfDate) / 86400000);
  if (diffDays <= 0) {
    return '今天';
  }
  if (diffDays === 1) {
    return '昨天';
  }
  if (diffDays <= 7) {
    return '过去 7 天';
  }
  if (diffDays <= 30) {
    return '过去 30 天';
  }
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
}
```

- [ ] **Step 5: Add animated swipe values**

Import `Animated`:

```ts
import { Animated, PanResponder, Pressable, ... } from 'react-native';
```

Add ref:

```ts
const swipeAnimatedValuesRef = useRef(new Map<string, Animated.Value>());

function getSwipeAnimatedValue(threadId: string): Animated.Value {
  let value = swipeAnimatedValuesRef.current.get(threadId);
  if (!value) {
    value = new Animated.Value(0);
    swipeAnimatedValuesRef.current.set(threadId, value);
  }
  return value;
}
```

Add helper:

```ts
function animateSwipe(threadId: string, toValue: number) {
  Animated.spring(getSwipeAnimatedValue(threadId), {
    damping: 18,
    stiffness: 180,
    toValue,
    useNativeDriver: true,
  }).start();
}
```

- [ ] **Step 6: Update pan handlers**

Inside `getThreadSwipeHandlers(thread)`:

```ts
const swipeValue = getSwipeAnimatedValue(thread.id);
return PanResponder.create({
  onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
  onPanResponderMove: (_event, gesture) => {
    if (isSelecting) {
      return;
    }
    const next = Math.max(-ARCHIVE_ACTION_WIDTH, Math.min(0, gesture.dx));
    swipeValue.setValue(next);
  },
  onPanResponderRelease: (_event, gesture) => {
    if (gesture.dx < -ARCHIVE_SWIPE_THRESHOLD) {
      setSwipedThreadId(thread.id);
      animateSwipe(thread.id, -ARCHIVE_ACTION_WIDTH);
      return;
    }
    setSwipedThreadId(null);
    animateSwipe(thread.id, 0);
  },
  onPanResponderTerminate: () => {
    animateSwipe(thread.id, swipedThreadId === thread.id ? -ARCHIVE_ACTION_WIDTH : 0);
  },
}).panHandlers;
```

When closing a swiped row:

```ts
animateSwipe(thread.id, 0);
setSwipedThreadId(null);
```

- [ ] **Step 7: Render animated row**

Before returning each row:

```ts
const swipeTranslateX = getSwipeAnimatedValue(thread.id);
```

Change row wrapper from `View` to `Animated.View`:

```tsx
<Animated.View
  {...getThreadSwipeHandlers(thread)}
  style={[
    styles.row,
    selected && styles.selectedRow,
    { transform: [{ translateX: swipeTranslateX }] },
  ]}
>
```

Remove the old `swipedRow` transform or keep it unused-free by deleting the style.

- [ ] **Step 8: Run focused test**

```powershell
pnpm test -- tests/ai-navigation-policy.test.cjs
```

Expected: pass.

- [ ] **Step 9: Commit**

```powershell
git add src/screens/AiHistoryScreen.tsx tests/ai-navigation-policy.test.cjs
git commit -m "feat: smooth ai history interactions"
```

## Task 9: Session Settings Save Semantics

**Files:**

- Modify: `src/screens/AiSessionConfigScreen.tsx`
- Modify: `tests/ai-final-acceptance-policy.test.cjs`

- [ ] **Step 1: Add failing policy**

Append to `tests/ai-final-acceptance-policy.test.cjs`:

```js
test('AI session settings clearly distinguish autosaved options from role instruction saves', () => {
  const session = read('src/screens/AiSessionConfigScreen.tsx');

  assert.match(session, /这些选项会自动保存/);
  assert.match(session, /角色指令需要点击保存后生效/);
  assert.match(session, /保存角色指令并开始聊天/);
  assert.match(session, /仅保存角色指令/);
  assert.match(session, /dangerSection/);
});
```

- [ ] **Step 2: Run focused test and confirm failure**

```powershell
pnpm test -- tests/ai-final-acceptance-policy.test.cjs
```

Expected: fails on missing copy or labels.

- [ ] **Step 3: Add autosave explanation**

In the reply/material/deep-memory settings section, add caption:

```tsx
<Text style={styles.caption}>资料范围、回复倾向和深度记忆开关会自动保存。</Text>
```

If the exact section already has explanatory copy, replace it with this shorter text.

- [ ] **Step 4: Add role-instruction save explanation**

Near advanced role instruction textarea:

```tsx
<Text style={styles.caption}>角色指令需要点击保存后生效，避免输入过程中频繁改写当前会话。</Text>
```

- [ ] **Step 5: Rename save buttons**

Change labels:

```tsx
<AiLightButton label="保存角色指令并开始聊天" ... />
<AiLightButton label="仅保存角色指令" ... />
```

If a button saves more than role instruction, update handler name only if necessary; do not change persistence semantics.

- [ ] **Step 6: Ensure danger section style exists**

Wrap delete current session action:

```tsx
<View style={styles.dangerSection}>
  ...
</View>
```

Add style using existing tokens:

```ts
dangerSection: {
  borderTopColor: aiLightColors.hairline,
  borderTopWidth: StyleSheet.hairlineWidth,
  gap: rhythm.cardContentGap,
  paddingTop: rhythm.sectionGap,
},
```

- [ ] **Step 7: Run focused test**

```powershell
pnpm test -- tests/ai-final-acceptance-policy.test.cjs
```

Expected: pass.

- [ ] **Step 8: Commit**

```powershell
git add src/screens/AiSessionConfigScreen.tsx tests/ai-final-acceptance-policy.test.cjs
git commit -m "fix: clarify ai session setting saves"
```

## Task 10: Memory Board Delete Safety And Human Labels

**Files:**

- Modify: `src/screens/AiMemoryBoardScreen.tsx`
- Modify: `tests/ai-final-acceptance-policy.test.cjs`

- [ ] **Step 1: Add failing policy**

Append to `tests/ai-final-acceptance-policy.test.cjs`:

```js
test('AI memory board uses confirmation or undo and human memory quality labels', () => {
  const board = read('src/screens/AiMemoryBoardScreen.tsx');

  assert.match(board, /pendingDeleteMemory/);
  assert.match(board, /AppDialog/);
  assert.match(board, /删除这条记忆/);
  assert.match(board, /formatMemoryImportanceLabel/);
  assert.match(board, /formatMemoryConfidenceLabel/);
  assert.doesNotMatch(board, /重要度 \{memory\.importance\} · 可信度 \{Math\.round\(memory\.confidence \* 100\)\}%/);
});
```

- [ ] **Step 2: Run focused test and confirm failure**

```powershell
pnpm test -- tests/ai-final-acceptance-policy.test.cjs
```

Expected: fails on missing `pendingDeleteMemory`.

- [ ] **Step 3: Add label helpers**

In `src/screens/AiMemoryBoardScreen.tsx`, add:

```ts
function formatMemoryImportanceLabel(value: number): string {
  if (value >= 4) {
    return '很重要';
  }
  if (value >= 2) {
    return '较重要';
  }
  return '普通重要';
}

function formatMemoryConfidenceLabel(value: number): string {
  if (value >= 0.85) {
    return '判断很可信';
  }
  if (value >= 0.65) {
    return '判断较可信';
  }
  return '待确认';
}
```

Replace raw caption:

```tsx
<Text style={styles.caption}>
  {TYPE_LABELS[memory.type]} · {formatMemoryImportanceLabel(memory.importance)} · {formatMemoryConfidenceLabel(memory.confidence)}
</Text>
```

- [ ] **Step 4: Add delete confirmation state**

Import `AppDialog` if not already imported:

```ts
import { AppDialog } from '../components/AppDialog';
```

Add state:

```ts
const [pendingDeleteMemory, setPendingDeleteMemory] = useState<AiMemoryRecord | null>(null);
const [pendingDeleteSummary, setPendingDeleteSummary] = useState<AiThreadSummarySegmentRecord | null>(null);
```

Change delete buttons:

```tsx
onPress={() => setPendingDeleteMemory(memory)}
```

```tsx
onPress={() => setPendingDeleteSummary(segment)}
```

- [ ] **Step 5: Add confirm handlers**

Add:

```ts
async function confirmDeleteMemory() {
  if (!pendingDeleteMemory) {
    return;
  }
  await handleDelete(pendingDeleteMemory.id);
  setPendingDeleteMemory(null);
}

async function confirmDeleteSummary() {
  if (!pendingDeleteSummary) {
    return;
  }
  await handleDeleteSummary(pendingDeleteSummary.id);
  setPendingDeleteSummary(null);
}
```

- [ ] **Step 6: Render dialogs**

At the bottom of the screen fragment:

```tsx
<AppDialog
  danger
  message="删除后，这条记忆不会再进入后续回复。"
  onClose={() => setPendingDeleteMemory(null)}
  onPrimary={() => void confirmDeleteMemory()}
  primaryLabel="删除"
  title="删除这条记忆"
  visible={Boolean(pendingDeleteMemory)}
/>
<AppDialog
  danger
  message="删除后，这段会话摘要不会再进入后续回复。"
  onClose={() => setPendingDeleteSummary(null)}
  onPrimary={() => void confirmDeleteSummary()}
  primaryLabel="删除"
  title="删除这段摘要"
  visible={Boolean(pendingDeleteSummary)}
/>
```

- [ ] **Step 7: Run focused test**

```powershell
pnpm test -- tests/ai-final-acceptance-policy.test.cjs
```

Expected: pass.

- [ ] **Step 8: Commit**

```powershell
git add src/screens/AiMemoryBoardScreen.tsx tests/ai-final-acceptance-policy.test.cjs
git commit -m "fix: make ai memory deletion safer"
```

## Task 11: Shared AI Time Formatting

**Files:**

- Create: `src/utils/aiTimeFormatters.ts`
- Modify: `src/components/ai/AiMessageBubble.tsx`
- Modify: `src/screens/AiHistoryScreen.tsx`
- Modify: `src/screens/AiHomeScreen.tsx`
- Modify: `src/screens/AiMemoryBoardScreen.tsx`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`
- Modify: `tests/ai-navigation-policy.test.cjs`

- [ ] **Step 1: Add failing time formatter policy**

Append to `tests/ai-chat-fixes-policy.test.cjs`:

```js
test('AI screens use shared time formatting helpers', () => {
  const formatter = read('src/utils/aiTimeFormatters.ts');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const board = read('src/screens/AiMemoryBoardScreen.tsx');

  assert.match(formatter, /formatAiMessageMinute/);
  assert.match(formatter, /formatAiFullMinute/);
  assert.match(formatter, /formatAiHistoryMinute/);
  assert.match(bubble, /formatAiMessageMinute/);
  assert.doesNotMatch(bubble, /function formatMessageMinute/);
  assert.match(board, /formatAiFullMinute/);
  assert.doesNotMatch(board, /function formatMinute/);
});
```

Append to `tests/ai-navigation-policy.test.cjs`:

```js
test('AI history and home use shared AI history time formatter', () => {
  const history = read('src/screens/AiHistoryScreen.tsx');
  const home = read('src/screens/AiHomeScreen.tsx');

  assert.match(history, /formatAiHistoryMinute/);
  assert.match(home, /formatAiHistoryMinute/);
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
pnpm test -- tests/ai-chat-fixes-policy.test.cjs tests/ai-navigation-policy.test.cjs
```

Expected: fails on missing `src/utils/aiTimeFormatters.ts`.

- [ ] **Step 3: Create formatter utility**

Create `src/utils/aiTimeFormatters.ts`:

```ts
function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatAiMessageMinute(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) {
    return '';
  }
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

export function formatAiFullMinute(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) {
    return value ?? '';
  }
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

export function formatAiHistoryMinute(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) {
    return '未知时间';
  }
  return `${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}
```

- [ ] **Step 4: Replace local formatters**

In `AiMessageBubble.tsx`, remove `formatMessageMinute` and import:

```ts
import { formatAiMessageMinute } from '../../utils/aiTimeFormatters';
```

Change:

```ts
const messageTime = formatAiMessageMinute(message.completedAt ?? message.updatedAt);
```

In `AiMemoryBoardScreen.tsx`, remove `formatMinute` and import:

```ts
import { formatAiFullMinute } from '../utils/aiTimeFormatters';
```

Replace calls:

```ts
formatAiFullMinute(profile.lastUpdatedAt)
formatAiFullMinute(maintenanceStatus.lastMaintenanceCompletedAt)
formatAiFullMinute(maintenanceStatus.profileUpdatedAt)
```

In `AiHistoryScreen.tsx` and `AiHomeScreen.tsx`, replace local minute formatting with:

```ts
import { formatAiHistoryMinute } from '../utils/aiTimeFormatters';
```

- [ ] **Step 5: Run focused tests**

```powershell
pnpm test -- tests/ai-chat-fixes-policy.test.cjs tests/ai-navigation-policy.test.cjs
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add src/utils/aiTimeFormatters.ts src/components/ai/AiMessageBubble.tsx src/screens/AiHistoryScreen.tsx src/screens/AiHomeScreen.tsx src/screens/AiMemoryBoardScreen.tsx tests/ai-chat-fixes-policy.test.cjs tests/ai-navigation-policy.test.cjs
git commit -m "refactor: share ai time formatting"
```

## Task 12: Final Verification And Android Acceptance

**Files:**

- No planned source changes unless verification finds defects.

- [ ] **Step 1: Run typecheck**

```powershell
pnpm typecheck
```

Expected:

- Exit code 0.

- [ ] **Step 2: Run full tests**

```powershell
pnpm test
```

Expected:

- Exit code 0.
- All policy tests pass.

- [ ] **Step 3: Check whitespace**

```powershell
git diff --check
```

Expected:

- Exit code 0.

- [ ] **Step 4: Check Android device availability**

```powershell
D:\Develop\Android\Sdk\platform-tools\adb.exe devices
```

Expected:

- If a device/emulator is listed, run the manual acceptance below.
- If no device is listed, report Android manual validation as blocked.

- [ ] **Step 5: Android manual acceptance**

Use real data, not empty states.

1. Open an AI thread with 200+ messages.
2. Send a new message and confirm first-token waiting indicator appears.
3. Confirm streaming cursor blinks while text arrives.
4. Scroll upward during streaming; confirm the list does not force-scroll to bottom.
5. Tap the latest button or return to latest; confirm keyboard and composer remain stable.
6. Load earlier messages; confirm the viewport does not jump.
7. Expand and collapse a thinking block; confirm animation is smooth and content remains readable.
8. Confirm consecutive assistant messages show only the first avatar.
9. Trigger a forced provider/API error; confirm readable error and inline retry.
10. Use history search with quick typing; confirm visible results update after the debounce, not every keystroke.
11. Swipe a history row; confirm it follows the finger and snaps open/closed.
12. Open Memory Board with several memories; delete a memory and confirm dialog.
13. Delete a summary segment and confirm it no longer appears after reload.
14. Check session settings copy; confirm autosaved options and role-instruction save semantics are clear.

- [ ] **Step 6: Final report**

Report:

- Changed files.
- Test commands and results.
- Android device availability.
- Manual checks completed or blocked.
- Any known residual risks.

## Self-Review Checklist

- Every in-scope item from the spec maps to a task:
  - Database and memory performance: Tasks 1-2.
  - Long chat rendering: Task 3.
  - Generation feedback/recovery: Tasks 4-5.
  - Message reading/microinteractions: Tasks 3, 6, 7.
  - History interaction: Task 8.
  - Session settings: Task 9.
  - Memory board safety: Task 10.
  - Time formatting: Task 11.
- Out-of-scope items are not included:
  - No empty-state redesign.
  - No 10-line composer.
  - No hidden action bar.
  - No citation bottom sheet.
  - No homepage suggested prompts.
  - No voice waveform.
  - No branch tree.
- Verification is explicit:
  - Focused tests after each task.
  - Full `pnpm typecheck`, `pnpm test`, `git diff --check`.
  - Android long-chain manual acceptance.
