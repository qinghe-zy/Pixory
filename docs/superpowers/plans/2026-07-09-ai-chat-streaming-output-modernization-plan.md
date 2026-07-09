# AI Chat Streaming Output Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Pixory AI chat streaming feel fast, modern, and stable by fixing first-token visibility, maximizing fast API output through adaptive batching, and isolating streaming output from historical message reading.

**Architecture:** Keep the existing Expo React Native chat stack, `FlatList`, and generation-scoped streaming store. Decouple three concerns that are currently entangled: API/network ingestion, visible streaming text progression, and scroll-follow behavior. The final behavior should match mature AI chat products: fast attached streaming, stable detached history reading, and seamless reattachment.

**Tech Stack:** Expo, React Native, TypeScript, `FlatList`, `useSyncExternalStore`, Expo SQLite, existing Pixory AI generation manager, node:test policy/unit tests.

---

## Current Problem Summary

Pixory already has a good foundation: the active assistant message can render through `AiStreamingMessageText` and `aiStreamingMessageStore` without replacing the full message array on each tick. However, the current runtime still treats scroll attachment as permission to stream UI patches.

Current failure mode:

- `AiChatScreen.getActiveStreamingVisibility()` reports `bottomLocked: routeFocused && bottomLockedRef.current && !hasPendingStreamingReadBuffer()`.
- `targetStreamingFps()` returns `0` when `bottomLocked` is false.
- `applyOrBufferStreamingMessagePatch()` buffers patches when the screen is not bottom-locked.
- A scroll/touch event can later flush or refresh that state, making it look like content had already generated but was not displayed.

Observed user symptom:

- After sending, the thinking timer may continue increasing while no assistant content appears.
- Touching or scrolling can cause content to appear, suggesting API output was available but UI streaming was blocked by scroll/buffer state.

Root cause to address:

- The app currently couples "should auto-scroll to latest" with "should publish live streaming text".

New invariant:

- `bottomLocked` controls only scroll following.
- `routeFocused && appActive && currentGeneration` controls whether live streaming text may publish.

---

## Design Principles

1. **First token has priority over scroll state**
   The first visible content token must publish to the streaming store as soon as the current generation receives it, as long as the app is active and the route is focused.

2. **API ingestion should not wait for UI rendering**
   Provider deltas should enter in-memory state as quickly as possible. UI frame cadence, SQLite snapshot persistence, and scroll state must not slow down network reading more than necessary.

3. **Fast APIs should feel fast**
   The UI should not be limited to the current conservative `20/15/10fps` behavior when the API is producing content quickly. Instead, the UI should use adaptive batching: fewer frames when needed, more content per frame when backlog is large.

4. **History reading must be stable**
   When the user scrolls upward to read history, streaming output continues in the background but does not pull the visible historical viewport.

5. **Reattachment must be seamless**
   Returning to the latest message should show the newest streaming content without flashing, sudden full reloads, or visible catch-up jumps.

6. **Completion should not be a visual cliff**
   Streaming uses lightweight text rendering; completed messages may switch to richer markdown rendering. That switch must be delayed or staged when the user is detached, and it must not cause a large visual jump.

---

## Final Product Behavior

### Attached

Definition:

- User is at or near the latest message.
- `messageScrollOffsetRef.current <= MESSAGE_STREAM_FOLLOW_THRESHOLD`, or the app has just intentionally jumped to latest after send.

Behavior:

- Streaming text publishes live.
- The list may follow the latest message.
- The current assistant bubble can grow in place.
- First token appears immediately when available.
- Backlog is consumed aggressively enough to match fast API output.

### Detached

Definition:

- User has clearly scrolled away from latest content to read history.
- This state is about scroll behavior only, not generation behavior.

Behavior:

- Streaming text continues to publish to the generation-scoped store.
- No forced `scrollToOffset({ offset: 0 })`.
- No streaming patch should update the main `messages` array during normal generating ticks.
- The historical viewport remains stable.
- A lightweight "AI is replying / return to latest" affordance is visible.
- Completion, citations, markdown replacement, and final reload are deferred until reattachment or a safe structural merge point.

### Reattaching

Definition:

- User taps "return to latest" or naturally scrolls back into the attached threshold.

Behavior:

- The screen scrolls to the latest message once.
- The latest streaming snapshot is already available from the store.
- If display backlog is small, continue normal fast typewriter output.
- If display backlog is large, sync close to the latest visible content and continue fast typewriter output from there.
- After reattachment, completion/rich rendering may be merged safely.

---

## Acceptance Criteria

### First Token

- Sending a message must never leave the assistant body blank indefinitely while the thinking timer continues.
- The first content or reasoning delta for the current generation must publish to `aiStreamingMessageStore` even if `bottomLockedRef.current` is false.
- A user touch or scroll must not be required to reveal already received content.
- Starting a new generation must clear stale buffered state from previous generations.

### Fast Streaming

- Fast provider output should not be capped by the old slow visual cadence.
- API deltas should be merged into raw/latest content immediately.
- UI rendering should use adaptive batching: when backlog grows, the displayed content advances by larger chunks.
- Performance pressure should reduce frame frequency but increase batch size, not fall back to slow one-character output.

### Detached History Reading

- While the user is reading history, streaming output continues.
- No forced scroll to latest occurs during detached streaming.
- Main `messages` state is not rewritten on every streaming tick.
- Historical visible content does not jump because the active assistant message grows at the bottom.
- A return-to-latest affordance remains available.

### Reattachment

- Tapping return-to-latest shows the current streaming content immediately.
- Natural scroll back to the bottom reattaches without a visible reload flash.
- If generation completed while detached, the final content appears without a sudden "blank to full answer" transition.
- Citations, markdown rendering, and final message metadata merge after the latest message is safely visible.

### Long Conversation

- With 300+ messages loaded, streaming ticks do not repeatedly recompute the full visible message list.
- During generation, only the active streaming text component should update for normal content deltas.
- Final structural updates should be batched and limited to completion/failure/stop/citation boundaries.

### Recoverability

- App background, route blur, stop, error, and completion still force a durable snapshot flush.
- SQLite writes remain throttled during normal streaming.
- No generation should lose content because display and scroll state were decoupled.

---

## File Structure

### Modify

- `src/ai/aiStreamingRuntime.ts`
  - Replace scroll-coupled target FPS with a display policy that separates live publishing from auto-scroll attachment.
  - Add adaptive patch cadence and backlog-aware display pacing helpers.

- `src/ai/aiChatService.ts`
  - Keep provider delta ingestion fast.
  - Stop using `bottomLocked=false` as a reason to suppress live UI patches.
  - Ensure persistence does not become the foreground streaming bottleneck.

- `src/ai/aiStreamingMessageStore.ts`
  - Preserve the existing generation-scoped snapshot API for this change.
  - Keep `content` as the latest live display content unless Task 4 explicitly introduces a tested displayed/latest split.
  - Keep generation-scoped subscriptions and separate content/reasoning notification channels.

- `src/components/ai/AiStreamingMessageText.tsx`
  - Render the displayed streaming text.
  - Preserve lightweight rendering during generation.
  - Avoid switching to rich markdown until the message is structurally complete and safe to merge.

- `src/screens/AiChatScreen.tsx`
  - Implement attached/detached/reattaching scroll contract.
  - Ensure first token publishes even when detached.
  - Keep detached history viewport stable.
  - Defer final reload/markdown/citations while detached.
  - Make return-to-latest reattachment deterministic.

- `src/components/ai/AiScrollToLatestButton.tsx`
  - Add a compact streaming-aware state so detached users can tell the assistant is still replying.

### Test

- `tests/ai-chat-streaming-runtime-policy.test.cjs`
  - Policy tests for decoupled streaming visibility, adaptive cadence, and no `bottomLocked=false => fps 0`.

- `tests/ai-streaming-message-store-unit.test.cjs`
  - Unit tests for generation-scoped store updates, displayed/latest content behavior, and channel notifications.

- `tests/ai-chat-performance-hardening-policy.test.cjs`
  - Policy tests that streaming patches do not update the full message array during normal live generation.

- `tests/ai-chat-first-token-pipeline-policy.test.cjs`
  - Policy tests that first-token display is not gated by scroll attachment or stale pending buffer.

- `tests/ai-chat-latency-final-acceptance-policy.test.cjs`
  - Final acceptance policy checks for first token, streaming decoupling, persistence throttling, and long-chat safety.

### Documentation

- `docs/feature-matrix.md`
  - Update only when implementation changes user-visible streaming behavior.
  - This plan document alone does not require a matrix update.

---

## Implementation Plan

### Task 1: Lock The New Streaming Contract In Tests

**Files:**

- Modify: `tests/ai-chat-streaming-runtime-policy.test.cjs`
- Modify: `tests/ai-chat-first-token-pipeline-policy.test.cjs`
- Modify: `tests/ai-chat-performance-hardening-policy.test.cjs`

- [x] **Step 1: Update runtime policy test for decoupled live streaming**

Add assertions that reject the old scroll-coupled behavior:

```js
const runtime = read('src/ai/aiStreamingRuntime.ts');
const screen = read('src/screens/AiChatScreen.tsx');

assert.doesNotMatch(runtime, /if \(!input\.bottomLocked \|\| input\.appActive === false \|\| input\.routeFocused === false\) \{\s*return 0;\s*\}/);
assert.match(runtime, /canPublishStreamingPatch/);
assert.match(runtime, /targetStreamingPatchIntervalMs/);
assert.match(runtime, /targetStreamingDisplayStep/);
assert.match(screen, /bottomLocked.*auto/i);
```

- [x] **Step 2: Update first-token policy test**

Add assertions that first token publication cannot be gated by pending buffer:

```js
const screen = read('src/screens/AiChatScreen.tsx');

assert.match(screen, /function shouldPublishLiveStreamingPatch/);
assert.match(screen, /routeFocused/);
assert.match(screen, /appActive/);
assert.match(screen, /isCurrentStreamingPatch/);
assert.doesNotMatch(screen, /bottomLockedRef\.current && !hasPendingStreamingReadBuffer\(\)[\s\S]{0,200}publishStreamingMessage/);
assert.match(screen, /resetStreamingReadBufferState\(\)/);
```

- [x] **Step 3: Update performance policy test**

Add assertions that normal generating patches publish to store instead of main message state:

```js
const screen = read('src/screens/AiChatScreen.tsx');
const livePatchBody = /const applyOrBufferStreamingMessagePatch = useCallback[\s\S]*?\r?\n  \}, \[[^\]]*\]\);/.exec(screen)?.[0] ?? '';

assert.match(livePatchBody, /publishStreamingMessage/);
assert.match(livePatchBody, /shouldPublishLiveStreamingPatch/);
assert.doesNotMatch(livePatchBody, /bottomLockedRef\.current && !hasPendingStreamingReadBuffer\(\)/);
assert.doesNotMatch(livePatchBody, /applyStreamingMessagePatch\(patch\);[\s\S]{0,120}status: 'generating'/);
```

- [x] **Step 4: Run tests and verify failure**

Run:

```bash
node --test tests/ai-chat-streaming-runtime-policy.test.cjs tests/ai-chat-first-token-pipeline-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs
```

Expected:

- Tests fail because the current implementation still couples scroll attachment to streaming publication.

---

### Task 2: Split Live Streaming Permission From Auto-Scroll Attachment

**Files:**

- Modify: `src/ai/aiStreamingRuntime.ts`
- Modify: `src/screens/AiChatScreen.tsx`
- Test: `tests/ai-chat-streaming-runtime-policy.test.cjs`
- Test: `tests/ai-chat-first-token-pipeline-policy.test.cjs`

- [x] **Step 1: Add explicit live streaming permission helper**

In `src/ai/aiStreamingRuntime.ts`, add:

```ts
export function canPublishStreamingPatch(input: StreamingVisibilityState): boolean {
  return input.appActive !== false && input.routeFocused !== false;
}
```

- [x] **Step 2: Keep target FPS focused on visual cadence only**

Change `targetStreamingFps()` so route/app focus can stop streaming patches, but `bottomLocked` no longer returns `0`.

Target behavior:

```ts
export function targetStreamingFps(input: StreamingVisibilityState & { visibleChars: number }): number {
  if (!canPublishStreamingPatch(input)) {
    return 0;
  }
  if (input.visibleChars <= 1000) {
    return input.devicePressure ? 18 : 36;
  }
  if (input.visibleChars <= 4000) {
    return input.devicePressure ? 15 : 30;
  }
  return input.devicePressure ? 12 : 24;
}
```

- [x] **Step 3: Rename screen visibility meaning**

In `src/screens/AiChatScreen.tsx`, make `getActiveStreamingVisibility()` report both route/app focus and scroll attachment. The scroll value remains useful for auto-follow and batching, but it must not mean "do not stream".

Target shape:

```ts
function getActiveStreamingVisibility(targetThreadId: string, generation: number) {
  const routeFocused = screenMountedRef.current && appActiveRef.current && isCurrentStream(targetThreadId, generation);
  return {
    appActive: screenMountedRef.current && appActiveRef.current,
    bottomLocked: bottomLockedRef.current,
    routeFocused,
  };
}
```

- [x] **Step 4: Add screen-level live patch predicate**

In `src/screens/AiChatScreen.tsx`, add a helper near `isCurrentStreamingPatch()`:

```ts
function shouldPublishLiveStreamingPatch(targetThreadId: string, generation: number, patch: AiStreamingMessagePatch): boolean {
  if (!isCurrentStreamingPatch(targetThreadId, generation, patch)) {
    return false;
  }
  return screenMountedRef.current && appActiveRef.current;
}
```

- [x] **Step 5: Run targeted tests**

Run:

```bash
node --test tests/ai-chat-streaming-runtime-policy.test.cjs tests/ai-chat-first-token-pipeline-policy.test.cjs
```

Expected:

- New policy tests pass.
- Existing generation ID/stale patch tests still pass.

---

### Task 3: Ensure First Token Always Publishes To The Live Store

**Files:**

- Modify: `src/screens/AiChatScreen.tsx`
- Test: `tests/ai-chat-first-token-pipeline-policy.test.cjs`
- Test: `tests/ai-streaming-message-store-unit.test.cjs`

- [x] **Step 1: Adjust live patch application**

Replace the current logic that only publishes when `bottomLockedRef.current && !hasPendingStreamingReadBuffer()` with this rule:

```ts
const applyOrBufferStreamingMessagePatch = useCallback((patch: AiStreamingMessagePatch) => {
  const streamingIdentity = activeStreamingIdentityRef.current;
  const canPublishLive =
    streamingIdentity &&
    patch.id === streamingIdentity.messageId &&
    patch.generationId === streamingIdentity.generationId &&
    shouldUseLiveStreamingPatch(patch) &&
    screenMountedRef.current &&
    appActiveRef.current;

  if (canPublishLive) {
    publishStreamingMessage(streamingIdentity, {
      content: patch.content,
      reasoningText: patch.reasoningText,
      status: patch.status === 'generating' ? patch.status : undefined,
    });
  }

  if (bottomLockedRef.current && !hasPendingStreamingReadBuffer()) {
    if (canPublishLive) {
      return;
    }
    applyStreamingMessagePatch(patch);
    return;
  }

  bottomLockedRef.current = false;
  streamingReadBufferActiveRef.current = true;
  hasBufferedStreamingUpdateRef.current = true;
  freezeVisibleStreamingMessage(patch.id);
  mergeBufferedStreamingPatch(patch);
  syncScrollToLatestVisibility();
}, [applyStreamingMessagePatch]);
```

Important:

- Live store publication happens before detached buffering.
- Detached buffering protects layout only.
- The current generation still receives content in the live store.

- [x] **Step 2: Make new generation clear stale buffer before generation starts**

Verify `beginStreamingRequest()` continues to call:

```ts
resetStreamingReadBufferState();
clearActiveStreamingIdentity();
```

The policy test must fail if this order is removed or reordered around generation startup.

- [x] **Step 3: Update store unit tests if displayed/latest fields are introduced**

If Task 4 introduces displayed/latest split, extend `tests/ai-streaming-message-store-unit.test.cjs` to verify:

```js
store.publishStreamingMessage(id, { content: 'hello' });
assert.equal(store.getStreamingMessageSnapshot(id).content, 'hello');
```

For this task, the store can still expose `content` as the live display content.

- [x] **Step 4: Run targeted tests**

Run:

```bash
node --test tests/ai-chat-first-token-pipeline-policy.test.cjs tests/ai-streaming-message-store-unit.test.cjs
```

Expected:

- Tests pass.
- Policy confirms first token publication does not require bottom lock.

---

### Task 4: Add Adaptive Streaming Display Runtime

**Files:**

- Modify: `src/ai/aiStreamingRuntime.ts`
- Test: `tests/ai-chat-streaming-runtime-policy.test.cjs`

- [x] **Step 1: Add backlog-aware display step helper**

In `src/ai/aiStreamingRuntime.ts`, add:

```ts
export function targetStreamingDisplayStep(input: {
  backlogChars: number;
  devicePressure?: boolean;
  visibleChars: number;
}): number {
  if (input.backlogChars <= 0) {
    return 0;
  }
  const pressureScale = input.devicePressure ? 0.72 : 1;
  const longTextScale = input.visibleChars > 4000 ? 1.35 : input.visibleChars > 1000 ? 1.15 : 1;
  if (input.backlogChars <= 24) {
    return Math.max(1, Math.ceil(6 * pressureScale));
  }
  if (input.backlogChars <= 120) {
    return Math.ceil(18 * pressureScale * longTextScale);
  }
  if (input.backlogChars <= 600) {
    return Math.ceil(48 * pressureScale * longTextScale);
  }
  return Math.ceil(120 * pressureScale * longTextScale);
}
```

Rationale:

- Small backlog keeps typewriter feel.
- Medium backlog advances by phrase-sized chunks.
- Large backlog catches up aggressively.
- Device pressure lowers frame pressure but still advances enough text.

- [x] **Step 2: Add focused unit-like policy checks**

Extend runtime policy test with source-level checks:

```js
assert.match(runtime, /targetStreamingDisplayStep/);
assert.match(runtime, /backlogChars <= 24/);
assert.match(runtime, /backlogChars <= 120/);
assert.match(runtime, /backlogChars <= 600/);
assert.match(runtime, /visibleChars > 4000/);
assert.match(runtime, /devicePressure/);
```

- [x] **Step 3: Run runtime test**

Run:

```bash
node --test tests/ai-chat-streaming-runtime-policy.test.cjs
```

Expected:

- Runtime policy test passes.

---

### Task 5: Decouple Provider Reading From Durable Snapshot Persistence

**Files:**

- Modify: `src/ai/aiChatService.ts`
- Test: `tests/ai-chat-streaming-runtime-policy.test.cjs`
- Test: `tests/ai-chat-latency-final-acceptance-policy.test.cjs`

- [x] **Step 1: Replace awaited per-delta persistence with scheduled persistence**

Current event handling awaits:

```ts
await persistStreamingSnapshot();
```

Replace with a scheduled write that keeps only the latest pending snapshot:

```ts
let persistInFlight = false;
let persistPending = false;

const schedulePersistStreamingSnapshot = () => {
  if (input.signal?.aborted) {
    return;
  }
  persistPending = true;
  if (persistInFlight) {
    return;
  }
  persistInFlight = true;
  void (async () => {
    try {
      while (persistPending && !input.signal?.aborted) {
        persistPending = false;
        await persistStreamingSnapshot();
      }
    } finally {
      persistInFlight = false;
      if (persistPending && !input.signal?.aborted) {
        schedulePersistStreamingSnapshot();
      }
    }
  })();
};
```

- [x] **Step 2: Use scheduled persistence for normal deltas**

Inside the delta event handler:

```ts
emitStreamingPatch();
generationMetrics.counters.streamMergedDeltaCount = Math.max(
  0,
  generationMetrics.counters.providerDeltaCount - generationMetrics.counters.streamUiPatchCount
);
schedulePersistStreamingSnapshot();
```

- [x] **Step 3: Preserve forced persistence**

Keep forced writes awaited:

```ts
await persistStreamingSnapshot(true);
```

Required for:

- completion
- stop
- error
- app background flush through `flushStreamingMessageSnapshot`

- [x] **Step 4: Update tests to reject awaited normal persistence**

Add source assertion:

```js
assert.match(service, /schedulePersistStreamingSnapshot/);
assert.doesNotMatch(service, /await persistStreamingSnapshot\(\);\s*\n\s*\}/);
assert.match(service, /await persistStreamingSnapshot\(true\)/);
```

- [x] **Step 5: Run targeted tests**

Run:

```bash
node --test tests/ai-chat-streaming-runtime-policy.test.cjs tests/ai-chat-latency-final-acceptance-policy.test.cjs
```

Expected:

- Streaming runtime and latency acceptance policy tests pass.

---

### Task 6: Define Detached History Isolation In The Screen

**Files:**

- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `src/components/ai/AiScrollToLatestButton.tsx`
- Test: `tests/ai-chat-performance-hardening-policy.test.cjs`
- Test: `tests/ai-chat-streaming-runtime-policy.test.cjs`

- [x] **Step 1: Treat detached buffering as layout protection**

Keep these detached behaviors:

```ts
bottomLockedRef.current = false;
streamingReadBufferActiveRef.current = true;
hasBufferedStreamingUpdateRef.current = true;
freezeVisibleStreamingMessage(patch.id);
mergeBufferedStreamingPatch(patch);
syncScrollToLatestVisibility();
```

But ensure this path happens after live store publication for current generation.

- [x] **Step 2: Do not force scroll while detached**

Verify detached patch handling does not call:

```ts
scrollToLatestMessage(...)
followLatestMessage(...)
messageListRef.current?.scrollToOffset(...)
```

Add policy checks:

```js
const detachedBody = /bottomLockedRef\.current = false;[\s\S]*?syncScrollToLatestVisibility\(\);/.exec(screen)?.[0] ?? '';
assert.doesNotMatch(detachedBody, /scrollToOffset/);
assert.doesNotMatch(detachedBody, /followLatestMessage/);
```

- [x] **Step 3: Make return-to-latest the only explicit reattachment action**

`handleReturnToLatestPress()` should:

```ts
bottomLockedRef.current = true;
userScrolledAwayFromBottomRef.current = false;
messageScrollOffsetRef.current = 0;
setShowScrollToLatest(false);
showScrollToLatestRef.current = false;
void flushBufferedStreamingState({ followLatest: true });
```

- [x] **Step 4: Show detached streaming affordance**

If current `AiScrollToLatestButton` only indicates scroll position, extend props to allow a streaming state:

```ts
<AiScrollToLatestButton
  bottomOffset={composerPanelHeight + spacing[4]}
  streaming={generating && hasBufferedStreamingUpdateRef.current}
  visible={showScrollToLatest && !inlineEditingActive}
  onPress={handleReturnToLatestPress}
/>
```

Button copy can remain compact, such as:

- `回到最新`
- `AI 正在回复`

Use existing visual style and tokens.

- [x] **Step 5: Run targeted tests**

Run:

```bash
node --test tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-chat-streaming-runtime-policy.test.cjs
```

Expected:

- Tests confirm detached streaming does not force scroll and live store still receives content.

---

### Task 7: Make Completion And Rich Rendering Safe

**Files:**

- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `src/components/ai/AiMessageBubble.tsx`
- Modify: `src/components/ai/AiMessageContent.tsx`
- Test: `tests/ai-chat-performance-hardening-policy.test.cjs`

- [x] **Step 1: Keep completion final reload deferred while detached**

Current `onSettled()` already marks pending final reload when detached. Preserve and strengthen:

```ts
if (hasPendingStreamingReadBuffer() || !bottomLockedRef.current || userScrolledAwayFromBottomRef.current) {
  streamingReadBufferActiveRef.current = true;
  pendingFinalReloadRef.current = true;
  hasBufferedStreamingUpdateRef.current = true;
  pendingFinalStreamingIdentityRef.current = activeStreamingIdentityRef.current;
  syncScrollToLatestVisibility();
  return;
}
```

- [x] **Step 2: Avoid clearing live snapshot before final reload is visible**

Keep this order for attached completion:

```ts
await reloadMessages(targetThreadId);
await reloadContinuityMilestones(targetThreadId);
await reloadMemoryCaptures(targetThreadId);
if (isCurrentStream(targetThreadId, generation)) {
  clearActiveStreamingIdentity();
}
```

- [x] **Step 3: Delay rich markdown replacement while detached**

During generation, `AiStreamingMessageText` remains plain text. The final markdown render should only replace it after:

- attached reload completes, or
- reattachment flush completes.

Do not render rich markdown inside active streaming text.

- [x] **Step 4: Add policy checks**

Add or keep assertions:

```js
assert.match(content, /if \(streaming\) \{/);
assert.match(content, /return <Text selectable style=\{\[styles\.body, styles\.assistantText\]\}>/);
assert.doesNotMatch(content, /streaming[\s\S]{0,120}getCachedMarkdownContent/);
assert.match(screen, /pendingFinalReloadRef/);
assert.match(screen, /pendingFinalStreamingIdentityRef/);
```

- [x] **Step 5: Run targeted tests**

Run:

```bash
node --test tests/ai-chat-performance-hardening-policy.test.cjs
```

Expected:

- Streaming remains lightweight.
- Final reload order remains safe.

---

### Task 8: Add Final Acceptance Coverage

**Files:**

- Modify: `tests/ai-chat-latency-final-acceptance-policy.test.cjs`
- Modify: `tests/ai-chat-streaming-runtime-policy.test.cjs`
- Modify: `tests/ai-chat-first-token-pipeline-policy.test.cjs`

- [x] **Step 1: Add final acceptance policy**

Add assertions covering:

```js
const runtime = read('src/ai/aiStreamingRuntime.ts');
const service = read('src/ai/aiChatService.ts');
const screen = read('src/screens/AiChatScreen.tsx');
const store = read('src/ai/aiStreamingMessageStore.ts');

assert.match(runtime, /canPublishStreamingPatch/);
assert.match(runtime, /targetStreamingDisplayStep/);
assert.doesNotMatch(runtime, /bottomLocked[\s\S]{0,120}return 0/);
assert.match(service, /schedulePersistStreamingSnapshot/);
assert.match(screen, /shouldPublishLiveStreamingPatch/);
assert.match(screen, /publishStreamingMessage/);
assert.match(screen, /pendingFinalReloadRef/);
assert.match(store, /useSyncExternalStore/);
```

- [x] **Step 2: Run final acceptance tests**

Run:

```bash
node --test tests/ai-chat-latency-final-acceptance-policy.test.cjs tests/ai-chat-streaming-runtime-policy.test.cjs tests/ai-chat-first-token-pipeline-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-streaming-message-store-unit.test.cjs
```

Expected:

- All targeted streaming and performance tests pass.

---

### Task 9: Update Feature Matrix After Implementation

**Files:**

- Modify: `docs/feature-matrix.md`

- [x] **Step 1: Update AI chat streaming capability row**

Add or update the AI chat capability notes to include:

```md
| AI chat streaming output | First-token live display, adaptive streaming display cadence, detached history reading protection, seamless return-to-latest, recoverable streaming snapshots | `aiStreamingRuntime`, `aiStreamingMessageStore`, `AiChatScreen`, `AiStreamingMessageText` |
```

Use the existing table format in `docs/feature-matrix.md`.

- [x] **Step 2: Verify docs diff**

Run:

```bash
git diff -- docs/feature-matrix.md
```

Expected:

- Only AI chat streaming capability wording changes.

---

### Task 10: Full Verification

**Files:**

- All modified source, tests, and docs.

- [x] **Step 1: Run focused tests**

Run:

```bash
node --test tests/ai-chat-latency-final-acceptance-policy.test.cjs tests/ai-chat-streaming-runtime-policy.test.cjs tests/ai-chat-first-token-pipeline-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-streaming-message-store-unit.test.cjs
```

Expected:

- Exit code `0`.
- No failed subtests.

- [x] **Step 2: Run full test suite**

Status:

- Verified on 2026-07-09 with `D:\Develop\Nodejs\pnpm.CMD test`.
- Result: 573 tests passed, 0 failed.
- Earlier non-streaming policy mismatches in profile storage, personal-space routing, update-check, and toast UI tests were resolved with compatibility-preserving fixes so the old feature contracts still pass.

Run:

```bash
pnpm test
```

Expected:

- Exit code `0`.
- Existing policy and unit tests pass.

- [x] **Step 3: Run TypeScript check**

Run:

```bash
pnpm typecheck
```

Expected:

- Exit code `0`.
- No TypeScript errors.

- [x] **Step 4: Run whitespace diff check**

Run:

```bash
git diff --check
```

Expected:

- Exit code `0`.
- No trailing whitespace or conflict markers.

- [x] **Step 5: Manual Android validation**

Status:

- Partially smoke-tested on 2026-07-09 with Android emulator `Pixory_API_35`.
- `D:\Develop\Android\Sdk\platform-tools\adb.exe devices` reported `emulator-5554	device`.
- `com.pixory.app` launched successfully, the AI workbench opened, and the normal chat screen/composer opened without a visible startup crash.
- Real streaming and scroll validation was not completed because the emulator state reported `全局默认模型已失效`, so a configured provider/API-backed generation was not available.
- On 2026-07-09 the user explicitly waived real-device/emulator streaming validation for this plan and requested proceeding based on code logic review and automated verification.
- Keep the real streaming scenario list below as a future release/manual QA checklist, not as a blocking requirement for this implementation plan.

Run the app on Android and verify:

- Send a normal text-only message.
- Send a long prompt that produces a multi-thousand-character response.
- Observe first token appears without touching the screen.
- Let the response stream while staying attached.
- Start a long response, then scroll upward into history.
- Confirm content continues generating and the history viewport does not jump.
- Tap return-to-latest.
- Confirm the latest content appears immediately and continues streaming.
- Stop generation mid-stream.
- Confirm stopped state appears without full-screen jump.
- Background the app during streaming.
- Return to app and confirm latest content is recoverable.
- Test with at least 300 loaded messages if fixture data is available.

Expected:

- No blank thinking-only state after first token arrives.
- No scroll gesture required to reveal generated text.
- No forced auto-scroll while reading history.
- No completion flash when detached.
- No obvious jank in long chat scenarios.

---

## Non-Goals

- Do not replace `FlatList` with FlashList in this change.
- Do not redesign the chat bubble UI.
- Do not change provider APIs or model settings.
- Do not implement semantic caching.
- Do not parse markdown while the message is actively streaming.
- Do not physically persist every provider delta to SQLite.

---

## Risk Controls

### Risk: Detached live store updates still cause layout changes if the active bubble remains mounted

Mitigation:

- Current active bubble may still be mounted when near the bottom. That is acceptable in `attached` or near-bottom states.
- In clearly detached historical reading, do not auto-scroll.
- If layout still moves in real device testing, add a stricter detached rendering rule: keep active streaming bubble visually frozen in the `FlatList` item while the live store continues updating outside the current viewport, then sync on reattachment.

### Risk: Higher FPS causes Android text reflow jank on very long replies

Mitigation:

- Use adaptive batching, not unlimited per-delta rendering.
- Device pressure lowers FPS.
- Large backlog increases chunk size so the app catches up with fewer renders.

### Risk: Scheduled persistence loses latest content on abrupt app background

Mitigation:

- Preserve `flushActiveStreamingSnapshot()` on background/unmount/abort.
- Keep forced completion/stop/error flush awaited.

### Risk: Completion rich rendering causes a height jump

Mitigation:

- Keep active streaming text lightweight until safe reload.
- Defer final structure merge while detached.
- Reattach before final rich rendering when needed.

---

## Final Acceptance Statement

The implementation is acceptable only when all of the following are true:

- First token displays without requiring a user scroll or touch.
- Fast API output visibly streams faster than the current fixed conservative cadence.
- Reading history during generation does not pause output.
- Reading history during generation does not force-scroll the user.
- Returning to latest feels continuous, not like a delayed full reload.
- Completion, stop, error, citations, and markdown rendering do not create a visible flash.
- Long conversations avoid per-token full message-list recalculation.
- Recoverability snapshots still protect local chat continuity.
