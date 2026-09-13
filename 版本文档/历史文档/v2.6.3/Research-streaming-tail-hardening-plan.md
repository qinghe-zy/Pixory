# AI Chat Streaming Tail Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Pixory's measured streaming tail implementation so detached replay, shrink correction, dynamic layout reconciliation, and width-aware estimation behave like mature chat software without introducing invented timing or pixel constants.

**Architecture:** Keep the current measured tail model and add four bounded extensions: a real assistant bubble width registry, deferred shrink debt, block-count prewarm promotion, and a lock-aware reconciliation loop. Use only public reference values from the local research repositories or runtime measurement.

**Tech Stack:** Expo, React Native, TypeScript, inverted `FlatList`, `useSyncExternalStore`, Node policy tests, existing measured-tail architecture.

---

## 0. Hard Rules

- Do not replace `FlatList`
- Do not add overlay tail rendering
- Do not add any new fixed timing or pixel constants unless they come from:
  - `react-native-streaming-message-list`
  - `use-stick-to-bottom`
  - `ai-chatbot`
- Do not invent Gemini or Claude internal thresholds
- Do not weaken the current `4800` latest-button threshold
- Do not remove detached monotonic growth; convert shrink into deferred correction instead
- Do not require emulator or real-device validation for acceptance in this phase

## 1. Reference Constants To Reuse

Only these public values are allowed in the new implementation:

- `150 ms`
  - from `react-native-streaming-message-list/src/hooks/usePlaceholderState.ts`
  - from `ai-chatbot/hooks/use-scroll-to-bottom.tsx`
- `200 ms`
  - from `react-native-streaming-message-list/src/StreamingMessageList.tsx`
- `70 px`
  - from `use-stick-to-bottom/src/useStickToBottom.ts`
- `350 ms`
  - from `use-stick-to-bottom/src/useStickToBottom.ts`

Everything else must be geometry-driven, frame-driven, or block-count-driven.

## 2. File Map

### Create

- `src/ai/aiStreamingBubbleWidthRegistry.ts`
  - stores the latest measured assistant content width and exposes a safe fallback
- `src/ai/aiStreamingPerfDebug.ts`
  - dev-only counters for tail updates, measurements, promotions, reconcile passes, and lock state
- `docs/ai-chat-streaming-research/streaming-tail-hardening-review.md`
  - implementation review checklist and expected evidence

### Modify

- `src/components/ai/AiMessageBubble.tsx`
  - report real assistant content width
- `src/ai/aiStreamingBlockSplitter.ts`
  - consume real width + real font scale
- `src/ai/aiStreamingHeightCache.ts`
  - keep width/font-based keying strict
- `src/components/ai/AiMeasuredStreamBlock.tsx`
  - report measured block height with real font scale
- `src/ai/aiStreamingTailModel.ts`
  - add deferred shrink debt and prewarm promotion behavior
- `src/screens/AiChatScreen.tsx`
  - add lock-state refs, drag detection, reconcile scheduling, and safe shrink application
- `tests/ai-chat-streaming-tail-policy.test.cjs`
- `tests/ai-chat-performance-hardening-policy.test.cjs`

## 3. Success Criteria

- `pnpm typecheck` passes
- `pnpm test` passes
- `git diff --check` passes
- source-policy tests prove:
  - only sourced `150 / 200 / 350 / 70` constants are introduced
  - width estimation uses measured assistant content width instead of raw `window * ratio`
  - tail shrink is deferred, not immediately applied on measurement decrease
  - promotion prewarm is block-count-driven, not pixel-threshold-driven
  - reconciliation respects drag state and does not scroll during detached reading

## 4. Task 1: Add Assistant Bubble Width Registry

**Files:**

- Create: `src/ai/aiStreamingBubbleWidthRegistry.ts`
- Modify: `src/components/ai/AiMessageBubble.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Test: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] Add a small module-level registry for assistant content width with:
  - `setLatestAssistantBubbleContentWidth(width: number): void`
  - `getLatestAssistantBubbleContentWidth(): number | null`
  - `getAssistantBubbleContentWidthFallback(input: { screenWidth: number; pagePaddingHorizontal: number; messageStackRatio: number; bubbleHorizontalPadding: number; }): number`

- [ ] In `AiMessageBubble.tsx`, attach `onLayout` to the assistant content container inside the bubble and publish its width only for assistant messages.

- [ ] In `AiChatScreen.tsx`, replace direct bubble-width approximation with registry lookup first, then geometry-derived fallback.

- [ ] Add policy assertions that reject `Dimensions.get('window').width * 0.9` style fallback and require named geometry terms.

- [ ] Verify with:
  - `pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs`

## 5. Task 2: Make Height Estimation Font-Scale and Width Accurate

**Files:**

- Modify: `src/ai/aiStreamingBlockSplitter.ts`
- Modify: `src/ai/aiStreamingHeightCache.ts`
- Modify: `src/components/ai/AiMeasuredStreamBlock.tsx`
- Test: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] Ensure `splitStreamingTextIntoBlocks()` takes optional `fontScale` and otherwise uses `PixelRatio.getFontScale()`.

- [ ] Ensure cache-key generation includes:
  - `lane`
  - `blockType`
  - `widthBucket`
  - `fontScaleBucket`
  - `rendererVersion`
  - `rawLength`
  - `lineCount`
  - `contentHash`

- [ ] Ensure `AiMeasuredStreamBlock` writes measured height back with real `PixelRatio.getFontScale()`.

- [ ] Add policy coverage that requires `PixelRatio.getFontScale()` to appear in both splitter and measured block paths.

- [ ] Verify with:
  - `pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs`
  - `pnpm typecheck`

## 6. Task 3: Add Deferred Shrink Debt To Tail Model

**Files:**

- Modify: `src/ai/aiStreamingTailModel.ts`
- Modify: `src/screens/AiChatScreen.tsx`
- Test: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] Extend the tail state with explicit shrink debt fields, for example:

```ts
overReservedHeight: number;
pendingShrinkHeight: number;
shrinkStableSince: number | null;
```

- [ ] Change `updateStreamingTailBlockMeasurement()` so:
  - measured growth still expands `reservedHeight`
  - measured shrink does not reduce `reservedHeight`
  - measured shrink increases deferred shrink debt instead

- [ ] Add a pure helper such as `settleStreamingTailShrinkDebt()` that applies shrink only when the caller declares the region safe.

- [ ] In `AiChatScreen.tsx`, call that helper only from:
  - intentional return-to-latest path
  - detached reconcile pass when the affected region is fully outside viewport
  - completed replay path after promoted blocks have already been consumed

- [ ] Use only sourced windows:
  - `150 ms` shrink debounce
  - `200 ms` stability window
  - `350 ms` retained reconcile window after completion/layout change

- [ ] Add source-policy assertions that the shrink path is debt-based and does not immediately lower `reservedHeight`.

- [ ] Verify with:
  - `pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs`

## 7. Task 4: Add Explicit Lock-State and Drag-State Semantics

**Files:**

- Modify: `src/screens/AiChatScreen.tsx`
- Test: `tests/ai-chat-performance-hardening-policy.test.cjs`
- Test: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] Add refs or derived state for:
  - `isUserDraggingRef`
  - `isNearBottomRef`
  - `escapedFromLockRef`
  - `lastUserScrollAtRef`

- [ ] Base `nearBottom` only on the sourced `70 px` threshold.

- [ ] Add `onScrollBeginDrag`, `onScrollEndDrag`, and `onMomentumScrollEnd` handling that:
  - marks gesture ownership immediately on drag start
  - uses the sourced `150 ms` idle timeout before treating gesture ownership as settled

- [ ] Keep the current `bottomLocked` behavior, but derive:
  - `atBottom`
  - `nearBottom`
  - `escapedFromLock`

- [ ] Add policy tests that require those semantics and reject blind scroll correction while dragging.

- [ ] Verify with:
  - `pnpm test -- tests/ai-chat-performance-hardening-policy.test.cjs`

## 8. Task 5: Add Block-Count Promotion Prewarm

**Files:**

- Modify: `src/ai/aiStreamingTailModel.ts`
- Modify: `src/screens/AiChatScreen.tsx`
- Test: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] Extend promotion logic so replay can prewarm complete blocks ahead of the current visible frontier.

- [ ] Prewarm must be defined by block count only:
  - always allow the next complete block
  - if that block is small, allow one more block
  - never introduce a new pixel prewarm threshold

- [ ] `reasoning` lane prewarm is allowed only when the current message is expanded.

- [ ] Keep promotion monotonic.

- [ ] Add policy tests that reject raw pixel-threshold prewarm constants and require block-count-based prewarm logic.

- [ ] Verify with:
  - `pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs`

## 9. Task 6: Add Reconcile Scheduler

**Files:**

- Modify: `src/screens/AiChatScreen.tsx`
- Test: `tests/ai-chat-performance-hardening-policy.test.cjs`
- Test: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] Add a single reconcile entry point such as `scheduleStreamingTailReconcile(reason)`.

- [ ] Every reconcile pass must:
  - run in `requestAnimationFrame`
  - respect `isUserDraggingRef`
  - avoid forced scrolling while detached

- [ ] Locked or near-bottom path:
  - may re-follow latest
  - may retry within a retained `350 ms` window if dynamic height settles late

- [ ] Detached path:
  - may only rebuild effective tail occupancy and trigger render refresh
  - must not scroll to offset `0`

- [ ] Route these events through the same scheduler:
  - thinking expand/collapse
  - final completion flush
  - composer height changes
  - measured block growth

- [ ] Add policy tests that reject direct `scrollToOffset` from detached reconcile triggers.

- [ ] Verify with:
  - `pnpm test -- tests/ai-chat-fixes-policy.test.cjs`
  - `pnpm test -- tests/ai-chat-performance-hardening-policy.test.cjs`

## 10. Task 7: Add Dev-Only Performance Debugging

**Files:**

- Create: `src/ai/aiStreamingPerfDebug.ts`
- Modify: `src/ai/aiStreamingTailModel.ts`
- Modify: `src/screens/AiChatScreen.tsx`
- Test: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] Create a dev-only counter module that no-ops in production.

- [ ] Record:
  - tail state update count
  - block measurement count
  - promotion count
  - max reserved height
  - max over-reserved height
  - reconcile count
  - detached patch count
  - lock-state snapshots

- [ ] Surface the data only through throttled console logging or explicit debug accessors.

- [ ] Add policy tests that require `__DEV__` gating so production behavior stays unaffected.

- [ ] Verify with:
  - `pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs`

## 11. Task 8: Write Review Evidence Document

**Files:**

- Create: `docs/ai-chat-streaming-research/streaming-tail-hardening-review.md`

- [ ] Write a concise review file that another AI or reviewer can use after implementation.

- [ ] The review file must include:
  - which public constants are allowed
  - which files should contain them
  - which behaviors must be proven by policy tests
  - which remaining risks still require human feel-testing later

## 12. Final Verification

- [ ] Run:
  - `pnpm typecheck`
  - `pnpm test`
  - `git diff --check`

- [ ] Manually review these invariants in source:
  - no new invented timing constants
  - no new invented pixel prewarm constants
  - no detached forced scroll correction
  - no immediate shrink of detached reserved height
  - no regression to ratio reveal

- [ ] Stop before any git commit, push, tag, packaging, hot update, or deployment command.
