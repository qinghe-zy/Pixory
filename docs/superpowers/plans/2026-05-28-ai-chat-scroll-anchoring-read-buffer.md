# AI Chat Scroll Anchoring And Read Buffer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the AI chat viewport stable while an assistant reply is streaming, without making the "回到最新" affordance appear too aggressively.

**Architecture:** Use native scroll anchoring as the first low-cost stabilization layer, then add a deterministic read-mode buffer for Android-first reliability. Split the current `latestVisible` behavior into separate scroll-lock and button-visibility states so UX thresholds no longer fight layout thresholds.

**Tech Stack:** Expo 54, React Native 0.81.5, TypeScript, FlatList with `inverted`, existing `aiGenerationManager` streaming subscription, existing Node policy tests.

---

## Product Spec

### Current Problem

`src/screens/AiChatScreen.tsx` currently uses an inverted `FlatList`. The newest assistant message is visually at the bottom but is `index = 0` in `invertedMessageItems`. During streaming, every patch updates `messages` through `setMessages`, so the newest bubble height changes frequently. When the user is reading older messages above, the changing bottom bubble can move the physical viewport.

The current `latestVisible` state carries two different meanings:

- Visual affordance: whether to show `AiScrollToLatestButton`.
- Scroll logic: whether streaming should keep updating the visible list and following the newest message.

This forced the threshold to become `1200px`, which is good for reducing button obstruction but too large for scroll-lock logic.

### Desired Behavior

1. When the user is near the latest message, streaming remains live:
   - Text continues typing into the assistant bubble.
   - The list may follow the latest message.
   - The "回到最新" button stays hidden.

2. When the user scrolls away from the latest message beyond a small logic threshold:
   - The chat enters read mode.
   - Incoming streaming patches are buffered in refs instead of immediately changing React state.
   - The visible message list height stays frozen.
   - Background generation, SQLite writes, title generation, and memory maintenance continue normally.

3. The button visibility uses its own UX threshold:
   - In normal browsing, keep the existing large visual threshold: `1200px`.
   - If unseen streaming/final content exists, show the button earlier, using a smaller notice threshold such as `96px`.
   - The button remains a small affordance, not a modal or blocking status.

4. When the user taps "回到最新" or manually scrolls back near the latest message:
   - Flush the latest buffered patch into UI state.
   - Run any deferred final `reloadMessages`.
   - Scroll to `offset: 0`.
   - Resume live streaming updates.

5. Once read-mode buffering starts, it stays latched until a safe flush point:
   - Do not flush from `onScroll`.
   - Do not resume live patch application merely because `offsetY` crosses back under `48px`.
   - Safe flush points are button press, physical bottom after scroll end, and active send.

6. When the user actively sends a new message while reading history:
   - Treat sending as the highest-priority interruption.
   - Flush any buffered streaming patch and pending final reload before starting the new request.
   - Then force the chat back to latest so the new user message and assistant reply begin from a clean bottom-locked state.

7. When the user focuses the composer while reading history:
   - Do not flush buffered content just because the keyboard resized the viewport.
   - Sending the message, not focus, is the safe point that consumes buffered state.

8. Do not use manual height compensation:
   - No `onContentSizeChange` offset math.
   - No `scrollToEnd`.
   - No repeated forced scrolling while the user is reading history.

### Proposed Constants

```ts
const MESSAGE_STREAM_FOLLOW_THRESHOLD = 48;
const MESSAGE_SCROLL_BUTTON_THRESHOLD = 1200;
const MESSAGE_STREAMING_BUTTON_THRESHOLD = 96;
const MESSAGE_SAFE_FLUSH_OFFSET = 1;
const MESSAGE_LIST_ANCHOR_CONFIG = { minIndexForVisible: 0 };
```

Meaning:

- `MESSAGE_STREAM_FOLLOW_THRESHOLD`: logic threshold for whether streaming may mutate visible UI immediately.
- `MESSAGE_SCROLL_BUTTON_THRESHOLD`: visual threshold for normal "回到最新" button visibility.
- `MESSAGE_STREAMING_BUTTON_THRESHOLD`: smaller threshold used only when there is unseen streaming/final content.
- `MESSAGE_SAFE_FLUSH_OFFSET`: physical-bottom tolerance used only after scrolling has ended.
- `MESSAGE_LIST_ANCHOR_CONFIG`: native anchoring layer, passed as a named constant rather than a bare inline prop.

### State Model

Replace the overloaded `latestVisible` concept with:

```ts
const bottomLockedRef = useRef(true);
const userScrolledAwayFromBottomRef = useRef(false);
const streamingReadBufferActiveRef = useRef(false);
const bufferedStreamingPatchRef = useRef<AiStreamingMessagePatch | null>(null);
const pendingFinalReloadRef = useRef(false);
const hasBufferedStreamingUpdateRef = useRef(false);
const frozenStreamingMessageByIdRef = useRef(new Map<string, AiMessageWithCitations>());
const messagesRef = useRef<AiMessageWithCitations[]>([]);

const [showScrollToLatest, setShowScrollToLatest] = useState(false);
const [hasBufferedStreamingUpdate, setHasBufferedStreamingUpdate] = useState(false);
```

Derived behavior:

```ts
const bottomLocked = offsetY <= MESSAGE_STREAM_FOLLOW_THRESHOLD;
const showButton =
  offsetY > MESSAGE_SCROLL_BUTTON_THRESHOLD ||
  ((hasBufferedStreamingUpdateRef.current || pendingFinalReloadRef.current) &&
    offsetY > MESSAGE_STREAMING_BUTTON_THRESHOLD);
```

Important latch rule:

```ts
const mayApplyLivePatch =
  bottomLockedRef.current &&
  !streamingReadBufferActiveRef.current &&
  !pendingFinalReloadRef.current;
```

Once `streamingReadBufferActiveRef.current` becomes `true`, all later patches keep merging into the buffer until a safe flush point clears the latch. This prevents a user slowly crossing from `offsetY = 49` to `offsetY = 47` from accidentally triggering live UI growth in the middle of a gesture.

### Patch Buffer Rules

Incoming `AiStreamingMessagePatch` should go through one path:

```ts
function applyOrBufferStreamingMessagePatch(patch: AiStreamingMessagePatch) {
  const mayApplyLivePatch =
    bottomLockedRef.current &&
    !streamingReadBufferActiveRef.current &&
    !pendingFinalReloadRef.current;
  if (mayApplyLivePatch) {
    applyStreamingMessagePatch(patch);
    return;
  }

  if (!streamingReadBufferActiveRef.current) {
    freezeVisibleStreamingMessage(patch.id);
    streamingReadBufferActiveRef.current = true;
  }
  bufferedStreamingPatchRef.current = mergeBufferedStreamingPatch(bufferedStreamingPatchRef.current, patch);
  hasBufferedStreamingUpdateRef.current = true;
  setHasBufferedStreamingUpdate(true);
  setShowScrollToLatest(true);
}
```

The merge should keep the newest defined values, while preserving older values when a patch omits a field:

```ts
function mergeBufferedStreamingPatch(
  current: AiStreamingMessagePatch | null,
  patch: AiStreamingMessagePatch
): AiStreamingMessagePatch {
  if (!current || current.id !== patch.id) {
    return patch;
  }
  return {
    ...current,
    ...patch,
    content: patch.content ?? current.content,
    reasoningText: patch.reasoningText === undefined ? current.reasoningText : patch.reasoningText,
    errorMessage: patch.errorMessage === undefined ? current.errorMessage : patch.errorMessage,
    completedAt: patch.completedAt === undefined ? current.completedAt : patch.completedAt,
  };
}
```

Keep the buffer intentionally small: store only the latest merged patch for the currently streaming assistant message. Do not append patch chunks into arrays, do not concatenate Markdown strings inside `mergeBufferedStreamingPatch`, and do not parse Markdown in the buffer path. `content` should be overwritten by the newest full patch value, which matches the current streaming service contract and keeps memory bounded to one latest reply snapshot.

### Reload Protection Rules

`reloadMessages` can become a backdoor because streaming content is persisted to SQLite while the UI is intentionally frozen. Any reload that happens during read-mode buffering must preserve the frozen visible message until a safe flush point.

Add a frozen message snapshot when buffering starts:

```ts
function freezeVisibleStreamingMessage(messageId: string) {
  if (frozenStreamingMessageByIdRef.current.has(messageId)) {
    return;
  }
  const visibleMessage = messagesRef.current.find((message) => message.id === messageId);
  if (visibleMessage) {
    frozenStreamingMessageByIdRef.current.set(messageId, visibleMessage);
  }
}
```

Protect `reloadMessages` before calling `setMessages`:

```ts
function preserveReadModeFrozenMessages(nextMessages: AiMessageWithCitations[]): AiMessageWithCitations[] {
  if (!streamingReadBufferActiveRef.current && !pendingFinalReloadRef.current) {
    return nextMessages;
  }
  const frozenMessages = frozenStreamingMessageByIdRef.current;
  if (frozenMessages.size === 0) {
    return nextMessages;
  }
  return nextMessages.map((message) => frozenMessages.get(message.id) ?? message);
}
```

Use:

```ts
setMessages(preserveReadModeFrozenMessages(nextMessages));
```

Clear `frozenStreamingMessageByIdRef.current` only when flushing or when the active thread changes.

### Safe Flush Rules

Never call `flushBufferedStreamingState` from `handleMessageScroll`.

Allowed flush points:

1. Button press:

```ts
function handleReturnToLatestPress() {
  bottomLockedRef.current = true;
  userScrolledAwayFromBottomRef.current = false;
  setShowScrollToLatest(false);
  flushBufferedStreamingState({ followLatest: true });
}
```

2. Physical bottom after scroll end:

```ts
function handleMessageScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
  const offsetY = event.nativeEvent.contentOffset.y;
  if (offsetY > MESSAGE_SAFE_FLUSH_OFFSET) {
    return;
  }
  if (!hasBufferedStreamingUpdateRef.current && !pendingFinalReloadRef.current) {
    return;
  }
  bottomLockedRef.current = true;
  userScrolledAwayFromBottomRef.current = false;
  setShowScrollToLatest(false);
  flushBufferedStreamingState({ followLatest: false });
}
```

Wire this to both:

```tsx
onMomentumScrollEnd={handleMessageScrollEnd}
onScrollEndDrag={handleMessageScrollEnd}
```

3. Active send:

```ts
flushBufferedStreamingState({ followLatest: false });
```

Then continue the existing send flow and scroll to latest after the new user message path takes over.

### Final Reload Rules

`onSettled` currently calls `reloadMessages(targetThreadId)` immediately. In read mode this can still move the list. Change it to defer whenever buffering is active, even if `bottomLockedRef.current` was set to true by a recent scroll event:

```ts
const shouldDeferFinalReload = streamingReadBufferActiveRef.current || !bottomLockedRef.current;
if (!shouldDeferFinalReload) {
  void reloadMessages(targetThreadId);
} else {
  streamingReadBufferActiveRef.current = true;
  pendingFinalReloadRef.current = true;
  hasBufferedStreamingUpdateRef.current = true;
  setHasBufferedStreamingUpdate(true);
  setShowScrollToLatest(true);
}
```

When the user returns to the latest message:

```ts
function flushBufferedStreamingState({ followLatest }: { followLatest: boolean }) {
  const bufferedPatch = bufferedStreamingPatchRef.current;
  bufferedStreamingPatchRef.current = null;
  streamingReadBufferActiveRef.current = false;
  hasBufferedStreamingUpdateRef.current = false;
  setHasBufferedStreamingUpdate(false);

  if (bufferedPatch) {
    applyStreamingMessagePatch(bufferedPatch);
  }

  const shouldReload = pendingFinalReloadRef.current;
  pendingFinalReloadRef.current = false;
  frozenStreamingMessageByIdRef.current.clear();
  if (shouldReload) {
    void reloadMessages(activeThreadIdRef.current);
  }

  if (followLatest) {
    scrollToLatestMessage(true, true);
  }
}
```

### Non-Goals

- Do not change `aiGenerationManager`.
- Do not change persistence cadence in `aiChatService`.
- Do not change Markdown rendering.
- Do not redesign the button visually in this task.
- Do not introduce server, sync, notification, or background service behavior.

## File Map

- Modify `src/screens/AiChatScreen.tsx`
  - Split scroll state.
  - Add native anchor prop.
  - Add streaming patch buffer.
  - Preserve frozen visible messages across read-mode reloads.
  - Restrict buffer flushes to explicit safe points.
  - Defer final reload while reading history.
  - Keep existing composer, generation, and drawer flows intact.

- Modify `tests/ai-chat-fixes-policy.test.cjs`
  - Update old `latestVisible` expectations.
  - Assert dual-threshold constants exist.
  - Assert `maintainVisibleContentPosition={MESSAGE_LIST_ANCHOR_CONFIG}` exists.
  - Assert `onMessagePatch` uses buffering path.
  - Assert no `onContentSizeChange`, no `scrollToEnd`, no manual delta compensation.

- Modify `tests/ai-navigation-policy.test.cjs`
  - Update streaming scroll policy expectations from one `latestVisible` threshold to dual thresholds.
  - Assert upward scroll does not force bottom.
  - Assert unseen buffered content can show the "回到最新" button before `1200px`.

## Implementation Plan

### Task 1: Lock The Spec With Failing Policy Tests

**Files:**
- Modify: `tests/ai-chat-fixes-policy.test.cjs`
- Modify: `tests/ai-navigation-policy.test.cjs`

- [ ] **Step 1: Add failing assertions for dual thresholds**

In `tests/ai-chat-fixes-policy.test.cjs`, update the current scroll-button test to expect:

```js
assert.match(chat, /const MESSAGE_STREAM_FOLLOW_THRESHOLD = 48/);
assert.match(chat, /const MESSAGE_SCROLL_BUTTON_THRESHOLD = 1200/);
assert.match(chat, /const MESSAGE_STREAMING_BUTTON_THRESHOLD = 96/);
assert.match(chat, /const MESSAGE_SAFE_FLUSH_OFFSET = 1/);
assert.match(chat, /bottomLockedRef/);
assert.match(chat, /streamingReadBufferActiveRef/);
assert.match(chat, /showScrollToLatest/);
assert.doesNotMatch(chat, /const \[latestVisible, setLatestVisible\]/);
```

- [ ] **Step 2: Add failing assertions for native anchoring**

In the same test file:

```js
assert.match(chat, /const MESSAGE_LIST_ANCHOR_CONFIG = \{ minIndexForVisible: 0 \}/);
assert.match(chat, /maintainVisibleContentPosition=\{MESSAGE_LIST_ANCHOR_CONFIG\}/);
assert.doesNotMatch(chat, /maintainVisibleContentPosition=\{\{ minIndexForVisible: 0 \}\}/);
```

- [ ] **Step 3: Add failing assertions for read-mode buffering**

In the same test file:

```js
assert.match(chat, /bufferedStreamingPatchRef/);
assert.match(chat, /pendingFinalReloadRef/);
assert.match(chat, /hasBufferedStreamingUpdateRef/);
assert.match(chat, /frozenStreamingMessageByIdRef/);
assert.match(chat, /mergeBufferedStreamingPatch/);
assert.match(chat, /freezeVisibleStreamingMessage/);
assert.match(chat, /preserveReadModeFrozenMessages/);
assert.match(chat, /applyOrBufferStreamingMessagePatch/);
assert.match(chat, /flushBufferedStreamingState/);
assert.match(chat, /onMessagePatch: \(patch\) => \{[\s\S]{0,220}applyOrBufferStreamingMessagePatch\(patch\)/);
assert.match(chat, /content: patch\.content \?\? current\.content/);
assert.doesNotMatch(chat, /bufferedStreamingPatchRef[\s\S]{0,260}\.push\(/);
assert.doesNotMatch(chat, /mergeBufferedStreamingPatch[\s\S]{0,420}\+=/);
```

- [ ] **Step 4: Keep anti-regression assertions**

In both test files, keep or add:

```js
assert.doesNotMatch(chat, /onContentSizeChange=/);
assert.doesNotMatch(chat, /scrollToEnd/);
assert.doesNotMatch(chat, /contentSize|contentHeight|previousHeight|heightDelta/);
const scrollHandlerBlock = /const handleMessageScroll[\s\S]*?\}, \[\]\);/.exec(chat)?.[0] ?? '';
assert.doesNotMatch(scrollHandlerBlock, /flushBufferedStreamingState/);
assert.match(chat, /handleMessageScrollEnd/);
assert.match(chat, /onMomentumScrollEnd=\{handleMessageScrollEnd\}/);
assert.match(chat, /onScrollEndDrag=\{handleMessageScrollEnd\}/);
assert.match(chat, /handleSend[\s\S]{0,1200}flushBufferedStreamingState\(\{ followLatest: false \}\)/);
```

- [ ] **Step 5: Run tests and verify they fail**

Run:

```powershell
node --test tests/ai-chat-fixes-policy.test.cjs tests/ai-navigation-policy.test.cjs
```

Expected: FAIL because `AiChatScreen.tsx` still uses `latestVisible` and has no buffering path.

### Task 2: Add Dual Scroll State In AiChatScreen

**Files:**
- Modify: `src/screens/AiChatScreen.tsx`

- [ ] **Step 1: Replace threshold constants**

Replace:

```ts
const MESSAGE_BOTTOM_LOCK_THRESHOLD = 1200;
```

With:

```ts
const MESSAGE_STREAM_FOLLOW_THRESHOLD = 48;
const MESSAGE_SCROLL_BUTTON_THRESHOLD = 1200;
const MESSAGE_STREAMING_BUTTON_THRESHOLD = 96;
const MESSAGE_SAFE_FLUSH_OFFSET = 1;
const MESSAGE_LIST_ANCHOR_CONFIG = { minIndexForVisible: 0 };
```

- [ ] **Step 2: Replace the visual state**

Replace:

```ts
const latestVisibleRef = useRef(true);
const [latestVisible, setLatestVisible] = useState(true);
```

With:

```ts
const bottomLockedRef = useRef(true);
const streamingReadBufferActiveRef = useRef(false);
const [showScrollToLatest, setShowScrollToLatest] = useState(false);
const bufferedStreamingPatchRef = useRef<AiStreamingMessagePatch | null>(null);
const pendingFinalReloadRef = useRef(false);
const hasBufferedStreamingUpdateRef = useRef(false);
const frozenStreamingMessageByIdRef = useRef(new Map<string, AiMessageWithCitations>());
const messagesRef = useRef<AiMessageWithCitations[]>([]);
const [hasBufferedStreamingUpdate, setHasBufferedStreamingUpdate] = useState(false);
```

- [ ] **Step 3: Update scroll handler**

Replace the old `handleMessageScroll` body with logic equivalent to:

```ts
const offsetY = event.nativeEvent.contentOffset.y;
const nextBottomLocked = offsetY <= MESSAGE_STREAM_FOLLOW_THRESHOLD;
const nextShowScrollToLatest =
  offsetY > MESSAGE_SCROLL_BUTTON_THRESHOLD ||
  ((hasBufferedStreamingUpdateRef.current || pendingFinalReloadRef.current) &&
    offsetY > MESSAGE_STREAMING_BUTTON_THRESHOLD);

bottomLockedRef.current = nextBottomLocked;
userScrolledAwayFromBottomRef.current = !nextBottomLocked;
setShowScrollToLatest(nextShowScrollToLatest);
```

`handleMessageScroll` must not call `flushBufferedStreamingState`. It only updates scroll state and visual button state.

- [ ] **Step 4: Add scroll-end safe flush handler**

Add:

```ts
const handleMessageScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
  const offsetY = event.nativeEvent.contentOffset.y;
  if (offsetY > MESSAGE_SAFE_FLUSH_OFFSET) {
    return;
  }
  if (!hasBufferedStreamingUpdateRef.current && !pendingFinalReloadRef.current) {
    return;
  }
  bottomLockedRef.current = true;
  userScrolledAwayFromBottomRef.current = false;
  setShowScrollToLatest(false);
  flushBufferedStreamingState({ followLatest: false });
}, [flushBufferedStreamingState]);
```

Wire it to `FlatList`:

```tsx
onMomentumScrollEnd={handleMessageScrollEnd}
onScrollEndDrag={handleMessageScrollEnd}
```

- [ ] **Step 5: Update reset paths**

Where the old code resets:

```ts
latestVisibleRef.current = true;
setLatestVisible(true);
```

Use:

```ts
bottomLockedRef.current = true;
setShowScrollToLatest(false);
```

Also clear buffered refs when switching threads or clearing messages:

```ts
bufferedStreamingPatchRef.current = null;
pendingFinalReloadRef.current = false;
streamingReadBufferActiveRef.current = false;
hasBufferedStreamingUpdateRef.current = false;
frozenStreamingMessageByIdRef.current.clear();
setHasBufferedStreamingUpdate(false);
```

Create a helper so every reset path uses the same atomic cleanup:

```ts
function resetStreamingReadBufferState() {
  bufferedStreamingPatchRef.current = null;
  pendingFinalReloadRef.current = false;
  streamingReadBufferActiveRef.current = false;
  hasBufferedStreamingUpdateRef.current = false;
  frozenStreamingMessageByIdRef.current.clear();
  setHasBufferedStreamingUpdate(false);
}
```

Call it from a thread-change effect:

```ts
useEffect(() => {
  resetStreamingReadBufferState();
}, [activeThreadId]);
```

Also call it when `reloadMessages(null)` clears the current chat. This prevents buffered patches from one thread from leaking into another reused `AiChatScreen` instance.

### Task 3: Add Buffer And Flush Functions

**Files:**
- Modify: `src/screens/AiChatScreen.tsx`

- [ ] **Step 1: Add merge function near `applyStreamingMessagePatch`**

Add:

```ts
function mergeBufferedStreamingPatch(
  current: AiStreamingMessagePatch | null,
  patch: AiStreamingMessagePatch
): AiStreamingMessagePatch {
  if (!current || current.id !== patch.id) {
    return patch;
  }
  return {
    ...current,
    ...patch,
    content: patch.content ?? current.content,
    reasoningText: patch.reasoningText === undefined ? current.reasoningText : patch.reasoningText,
    errorMessage: patch.errorMessage === undefined ? current.errorMessage : patch.errorMessage,
    completedAt: patch.completedAt === undefined ? current.completedAt : patch.completedAt,
  };
}
```

- [ ] **Step 2: Add apply-or-buffer callback**

Add:

```ts
const applyOrBufferStreamingMessagePatch = useCallback(
  (patch: AiStreamingMessagePatch) => {
    const mayApplyLivePatch =
      bottomLockedRef.current &&
      !streamingReadBufferActiveRef.current &&
      !pendingFinalReloadRef.current;
    if (mayApplyLivePatch) {
      applyStreamingMessagePatch(patch);
      return;
    }
    if (!streamingReadBufferActiveRef.current) {
      freezeVisibleStreamingMessage(patch.id);
      streamingReadBufferActiveRef.current = true;
    }
    bufferedStreamingPatchRef.current = mergeBufferedStreamingPatch(bufferedStreamingPatchRef.current, patch);
    hasBufferedStreamingUpdateRef.current = true;
    setHasBufferedStreamingUpdate(true);
    setShowScrollToLatest(true);
  },
  [applyStreamingMessagePatch]
);
```

- [ ] **Step 3: Add flush callback**

Add:

```ts
const flushBufferedStreamingState = useCallback(
  ({ followLatest }: { followLatest: boolean }) => {
    const bufferedPatch = bufferedStreamingPatchRef.current;
    const shouldReload = pendingFinalReloadRef.current;

    bufferedStreamingPatchRef.current = null;
    pendingFinalReloadRef.current = false;
    streamingReadBufferActiveRef.current = false;
    hasBufferedStreamingUpdateRef.current = false;
    frozenStreamingMessageByIdRef.current.clear();
    setHasBufferedStreamingUpdate(false);

    if (bufferedPatch) {
      applyStreamingMessagePatch(bufferedPatch);
    }
    if (shouldReload) {
      void reloadMessages(activeThreadIdRef.current);
    }
    if (followLatest) {
      scrollToLatestMessage(true, true);
    }
  },
  [applyStreamingMessagePatch, reloadMessages, scrollToLatestMessage]
);
```

- [ ] **Step 4: Add frozen reload protection**

Add the message ref:

```ts
useEffect(() => {
  messagesRef.current = messages;
}, [messages]);
```

Add:

```ts
function freezeVisibleStreamingMessage(messageId: string) {
  if (frozenStreamingMessageByIdRef.current.has(messageId)) {
    return;
  }
  const visibleMessage = messagesRef.current.find((message) => message.id === messageId);
  if (visibleMessage) {
    frozenStreamingMessageByIdRef.current.set(messageId, visibleMessage);
  }
}

function preserveReadModeFrozenMessages(nextMessages: AiMessageWithCitations[]): AiMessageWithCitations[] {
  if (!streamingReadBufferActiveRef.current && !pendingFinalReloadRef.current) {
    return nextMessages;
  }
  const frozenMessages = frozenStreamingMessageByIdRef.current;
  if (frozenMessages.size === 0) {
    return nextMessages;
  }
  return nextMessages.map((message) => frozenMessages.get(message.id) ?? message);
}
```

In `reloadMessages`, replace:

```ts
setMessages(nextMessages);
```

With:

```ts
setMessages(preserveReadModeFrozenMessages(nextMessages));
```

- [ ] **Step 5: Wire streaming patches**

In `createGenerationSubscriber`, replace:

```ts
applyStreamingMessagePatch(patch);
```

With:

```ts
applyOrBufferStreamingMessagePatch(patch);
```

### Task 4: Defer Final Reload While Reading

**Files:**
- Modify: `src/screens/AiChatScreen.tsx`

- [ ] **Step 1: Update `onSettled`**

Replace the immediate final reload block:

```ts
void reloadMessages(targetThreadId);
void reloadMemoryCaptures(targetThreadId);
```

With:

```ts
const shouldDeferFinalReload = streamingReadBufferActiveRef.current || !bottomLockedRef.current;
if (!shouldDeferFinalReload) {
  void reloadMessages(targetThreadId);
  void reloadMemoryCaptures(targetThreadId);
} else {
  streamingReadBufferActiveRef.current = true;
  pendingFinalReloadRef.current = true;
  hasBufferedStreamingUpdateRef.current = true;
  setHasBufferedStreamingUpdate(true);
  setShowScrollToLatest(true);
}
```

- [ ] **Step 2: Add explicit button flush handler**

Do not make every `followLatestMessage()` call flush buffered content, because composer focus and keyboard resize paths can call latest-follow helpers. Add a dedicated button handler:

```ts
const handleReturnToLatestPress = useCallback(() => {
  bottomLockedRef.current = true;
  userScrolledAwayFromBottomRef.current = false;
  setShowScrollToLatest(false);
  flushBufferedStreamingState({ followLatest: true });
}, [flushBufferedStreamingState]);
```

Wire the button to this handler:

```tsx
<AiScrollToLatestButton
  bottomOffset={composerPanelHeight + spacing[4]}
  visible={showScrollToLatest && !inlineEditingActive}
  onPress={handleReturnToLatestPress}
/>
```

- [ ] **Step 3: Guard composer focus during buffered read mode**

In `handleComposerFocus`, avoid flushing or forced latest jumps while buffered read mode is active:

```ts
if (streamingReadBufferActiveRef.current || pendingFinalReloadRef.current) {
  return;
}
```

Then keep the existing normal-path focus behavior. Sending a message remains the safe point that consumes the buffer.

### Task 5: Treat Active Send As Highest-Priority Latest Jump

**Files:**
- Modify: `src/screens/AiChatScreen.tsx`

- [ ] **Step 1: Flush before sending**

In `handleSend`, after `beginGenerationAction()` succeeds and before clearing the composer, add:

```ts
bottomLockedRef.current = true;
userScrolledAwayFromBottomRef.current = false;
setShowScrollToLatest(false);
flushBufferedStreamingState({ followLatest: false });
```

This consumes any buffered patch and pending final reload before the next request starts. The user has chosen to continue the conversation, so stale buffered UI state must not survive into the next request.

- [ ] **Step 2: Keep existing send follow behavior**

Keep the existing:

```ts
followLatestMessage();
```

This is the scroll step after the old buffer has been consumed and the new send flow takes over.

- [ ] **Step 3: Add a policy assertion**

In `tests/ai-chat-fixes-policy.test.cjs`, assert:

```js
assert.match(chat, /async function handleSend\(\)[\s\S]{0,1200}flushBufferedStreamingState\(\{ followLatest: false \}\)/);
assert.match(chat, /async function handleSend\(\)[\s\S]{0,1200}bottomLockedRef\.current = true/);
```

### Task 6: Add Native Scroll Anchoring

**Files:**
- Modify: `src/screens/AiChatScreen.tsx`

- [ ] **Step 1: Add FlatList prop**

Add to the `FlatList`:

```tsx
maintainVisibleContentPosition={MESSAGE_LIST_ANCHOR_CONFIG}
```

- [ ] **Step 2: Keep existing no-manual-compensation guarantees**

Do not add:

```tsx
onContentSizeChange={...}
```

Do not add:

```ts
scrollToEnd()
```

### Task 7: Verify And Commit

**Files:**
- Modified files from tasks above.

- [ ] **Step 1: Run targeted tests**

Run:

```powershell
node --test tests/ai-chat-fixes-policy.test.cjs tests/ai-navigation-policy.test.cjs
```

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run:

```powershell
pnpm typecheck
pnpm test
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Manual Android validation**

On a real Android device or emulator:

1. Open an AI chat with enough history to scroll.
2. Ask the assistant for a long Markdown answer.
3. While it streams, scroll up slightly beyond one screen.
4. Confirm the visible history no longer drifts.
5. Confirm the "回到最新" button does not appear merely from tiny movement in normal browsing.
6. Confirm unseen streaming content makes the button appear earlier than `1200px`.
7. Tap "回到最新" and confirm the final text appears and the list returns to the newest message.
8. Repeat by manually scrolling all the way to the physical bottom and lifting the finger; confirm the buffered content flushes only after the scroll ends.
9. While in read mode, focus the composer without sending; confirm keyboard resize does not flush buffered content or jump the list.
10. While in read mode, send a new message; confirm the previous buffered reply finalizes before the new message is sent and the list returns to latest.
11. While in read mode, load earlier messages; confirm the visible frozen assistant bubble is not replaced by the newer SQLite content until a safe flush.
12. Switch to another AI thread while buffered content exists; confirm no button or buffered content from the previous thread leaks into the next thread.
13. Repeat with Markdown code blocks and tables.

- [ ] **Step 4: Commit**

Run:

```powershell
git add src/screens/AiChatScreen.tsx tests/ai-chat-fixes-policy.test.cjs tests/ai-navigation-policy.test.cjs
git commit -m "fix: stabilize ai chat streaming scroll"
```

## Risk Notes

- `maintainVisibleContentPosition` may behave differently across Android ROMs with inverted lists. This is why buffering is the deterministic layer.
- Deferring `reloadMessages` means the offscreen latest bubble may not update its final citations/status until the user returns to latest. This is acceptable because the user is reading history; the database remains current.
- If a generation fails while the user is in read mode, the error state should be flushed when the user returns. The buffered patch merge must preserve `errorMessage` and `status`.
- If the user switches thread while buffered content exists, clear the buffer instead of applying it to the next thread.
- If the user sends a new message while buffered content exists, the send path must flush buffered and pending final state before creating the new request, then jump to latest through the existing send flow. Sending is an intentional context change and should not preserve read-mode frozen UI.
- The buffer should remain a single latest patch object. It must not become a growing patch list or Markdown accumulator; the streaming service already sends full `content` snapshots.
- `reloadMessages` is a known backdoor because SQLite keeps receiving streaming content. During read-mode buffering, reloads must preserve frozen visible message snapshots.
- Composer focus and keyboard resize are not safe flush points. They should not consume the read-mode buffer.

## Acceptance Criteria

- User reading older messages during streaming sees a stable viewport.
- User near latest still sees live streaming.
- "回到最新" remains visually quiet in normal browsing.
- Unseen streaming/final content can show the button earlier than `1200px`.
- No buffered content is flushed from `onScroll`; buffered state flushes only on button press, physical bottom after scroll end, or active send.
- Loading earlier messages during read mode cannot inject newer SQLite streaming text into the frozen visible UI.
- Switching threads clears all buffered refs and pending reload flags.
- Composer focus and keyboard resize do not flush buffered content.
- Sending a new message from read mode flushes buffered content and starts from the latest position.
- Buffered streaming content is represented by one latest patch object, with no array accumulation or Markdown concatenation.
- No manual content-size height compensation exists.
- Full test suite and typecheck pass.
