# Android Chat Block Streaming Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace character-step live chat rendering with a measured semantic-block renderer that remains stable while users read history.

**Architecture:** Keep aiChatService authoritative for Provider text, citation parsing and persistence. Add a pure display scheduler that turns buffered deltas into stable blocks; both attached live rendering and detached tail replay consume that same block contract, while existing height measurement and shrink-debt logic preserves list geometry.

**Tech Stack:** Expo 54, React Native 0.81, React 19, TypeScript, FlatList, useSyncExternalStore, existing aiStreaming runtime and Node test suite.

---

## Preconditions

- Read AGENTS.md, the paired design spec, the existing latency spec, and git status before editing.
- Do not overwrite or stage unrelated release/icon work.
- Do not change Provider requests, Prompt/cache, persistence cadence, generation-job schema, message schema, dream/thought/memory/branch behavior, or user settings.
- Implement behind aiBlockStreamingRendererEnabled. The existing character-step renderer remains the kill-switch fallback.
- Every changed runtime path must preserve messageId + generationId + threadId + space ownership checks.

## File map

| File | Responsibility |
| --- | --- |
| src/ai/aiStreamingDisplayScheduler.ts | New pure display buffer, semantic boundary and viewport budget planner. |
| src/ai/aiStreamingRuntime.ts | Central timing/line/viewport policy values. |
| src/ai/aiChatService.ts | Feed scheduler from authoritative deltas; force terminal flush; record content-free metrics. |
| src/ai/aiStreamingMessageStore.ts | Publish immutable display-session blocks and reservation metadata to attached renderer. |
| src/ai/aiStreamingBlockSplitter.ts | Keep height estimate/cache contract for stable blocks. |
| src/ai/aiStreamingTailModel.ts | Consume supplied block deltas without re-splitting whole text; retain monotonic reservation/debt behavior. |
| src/ai/aiStreamingTailFeatureFlags.ts | Add isolated aiBlockStreamingRendererEnabled remote flag. |
| src/components/ai/aiChatBubbleRail.ts | New shared composerShell/message horizontal rail token; owns no rendering or runtime measurement. |
| src/components/ai/AiLiveStreamingMessage.tsx | New attached renderer using measured block segments as one continuous bubble. |
| src/components/ai/AiMessageBubble.tsx | Route active generation to live block renderer only when flag is enabled. |
| src/screens/AiChatScreen.tsx | Coordinate attached/detached transitions and preserve historical layout. |
| src/ai/aiGenerationMetrics.ts | Add redacted block/reservation metrics. |
| tests/ai-streaming-display-scheduler-unit.test.cjs | New scheduler invariant tests. |
| tests/ai-streaming-block-rendering-policy.test.cjs | New renderer, feature flag and regression tests. |

## Task 1: Freeze the behavioral contract with failing pure tests

**Files:**
- Create: tests/ai-streaming-display-scheduler-unit.test.cjs
- Modify: tests/ai-chat-latency-final-acceptance-policy.test.cjs

- [ ] **Step 1: Write the failing semantic-boundary test.**

~~~
test('flushes a complete CJK sentence as one block without character stepping', () => {
  const state = appendStreamingDisplayDelta(createStreamingDisplayState(), '第一句已经完整。');
  const result = planStreamingDisplayFlush({ attached: true, nowMs: 100, state, viewportHeight: 720 });
  assert.equal(result.blocks.length, 1);
  assert.equal(result.blocks[0].raw, '第一句已经完整。');
  assert.equal(result.reason, 'boundary');
});
~~~

- [ ] **Step 2: Write the failing max-latency test.**

~~~
test('forces a readable block after max latency when a provider never sends punctuation', () => {
  const state = appendStreamingDisplayDelta(createStreamingDisplayState(), '没有标点但已经足够长的连续文字'.repeat(8));
  const result = planStreamingDisplayFlush({ attached: true, nowMs: 121, state, viewportHeight: 720 });
  assert.equal(result.reason, 'max_latency');
  assert.ok(result.blocks[0].raw.length > 0);
});
~~~

- [ ] **Step 3: Write reservation and viewport-budget failures.**

~~~
test('never shrinks reservation while detached and records debt instead', () => {
  const reserved = reserveDisplayBlocks(createStreamingDisplayState(), [block({ estimatedHeight: 220 })]);
  const measured = reconcileDisplayBlockMeasurement(reserved, { blockId: 'b1', measuredHeight: 160, nowMs: 10 });
  assert.equal(measured.reservedHeight, 220);
  assert.equal(measured.pendingShrinkHeight, 60);
});

test('caps one attached flush below the viewport budget but may promote multiple blocks', () => {
  const state = reserveDisplayBlocks(createStreamingDisplayState(), [
    block({ estimatedHeight: 180 }),
    block({ estimatedHeight: 180 }),
    block({ estimatedHeight: 180 }),
    block({ estimatedHeight: 180 }),
  ]);
  const result = planStreamingDisplayFlush({ attached: true, nowMs: 200, state, viewportHeight: 720 });
  assert.equal(result.blocks.length, 2);
  assert.ok(result.totalPromotedHeight <= 504);
});
~~~

- [ ] **Step 4: Run the new test to prove the module does not yet exist.**

Run: node --test tests/ai-streaming-display-scheduler-unit.test.cjs
Expected: FAIL because src/ai/aiStreamingDisplayScheduler.ts does not exist.

- [ ] **Step 5: Add acceptance assertions for the enabled path.**

~~~
assert.match(service, /planStreamingDisplayFlush/);
assert.match(runtime, /STREAMING_DISPLAY_MAX_LATENCY_MS/);
assert.match(flagSource, /aiBlockStreamingRendererEnabled/);
~~~

- [ ] **Step 6: Commit test contract only.**

~~~
git add tests/ai-streaming-display-scheduler-unit.test.cjs tests/ai-chat-latency-final-acceptance-policy.test.cjs
git commit -m "test: define block streaming display contract"
~~~

## Task 2: Implement the pure display scheduler and policy

**Files:**
- Create: src/ai/aiStreamingDisplayScheduler.ts
- Modify: src/ai/aiStreamingRuntime.ts
- Test: tests/ai-streaming-display-scheduler-unit.test.cjs

- [ ] **Step 1: Define the display types.**

~~~
export type StreamingDisplayFlushReason =
  | 'boundary'
  | 'max_latency'
  | 'terminal'
  | 'viewport_budget';

export type StreamingDisplayBlock = {
  id: string;
  lane: 'content' | 'reasoning';
  raw: string;
  startOffset: number;
  finalized: boolean;
  estimatedHeight: number;
  reservedHeight: number;
};

export type StreamingDisplayState = {
  lastFlushAtMs: number;
  pendingContent: string;
  pendingReasoning: string;
  blocks: StreamingDisplayBlock[];
  pendingShrinkHeight: number;
};
~~~

- [ ] **Step 2: Implement boundary planning as a pure function.**

~~~
export function planStreamingDisplayFlush(input: {
  attached: boolean;
  nowMs: number;
  state: StreamingDisplayState;
  viewportHeight: number;
}): {
  blocks: StreamingDisplayBlock[];
  reason: StreamingDisplayFlushReason | null;
  totalPromotedHeight: number;
} {
  // Prefer paragraph, complete Markdown line and terminal punctuation.
  // Force a block after the policy max latency.
  // In attached mode, promote only blocks within the viewport budget.
  // Never split a grapheme or mutate a finalized block.
}
~~~

- [ ] **Step 3: Put all tuning constants in aiStreamingRuntime.**

~~~
export const STREAMING_DISPLAY_FIRST_READABLE_MAX_LATENCY_MS = 120;
export const STREAMING_DISPLAY_MAX_LATENCY_MS = 180;
export const STREAMING_DISPLAY_MIN_CJK_CHARS = 80;
export const STREAMING_DISPLAY_MAX_BLOCK_VIEWPORT_RATIO = 0.36;
export const STREAMING_DISPLAY_MAX_FLUSH_VIEWPORT_RATIO = 0.70;
export const STREAMING_DISPLAY_MAX_BLOCKS_PER_FLUSH = 3;
~~~

Keep targetStreamingDisplayStep intact for the disabled-flag fallback.

- [ ] **Step 4: Run the focused unit test.**

Run: node --test tests/ai-streaming-display-scheduler-unit.test.cjs
Expected: PASS.

- [ ] **Step 5: Commit scheduler and policy.**

~~~
git add src/ai/aiStreamingDisplayScheduler.ts src/ai/aiStreamingRuntime.ts tests/ai-streaming-display-scheduler-unit.test.cjs
git commit -m "feat: add semantic streaming display scheduler"
~~~

## Task 3: Publish display blocks without changing persistence truth

**Files:**
- Modify: src/ai/aiChatService.ts
- Modify: src/ai/aiStreamingMessageStore.ts
- Modify: src/ai/aiGenerationMetrics.ts
- Test: tests/ai-streaming-block-rendering-policy.test.cjs

- [ ] **Step 1: Write failing tests proving authoritative text and UI blocks are separate.**

~~~
assert.match(service, /pendingAnswerChunks\.push/);
assert.match(service, /appendStreamingDisplayDelta/);
assert.match(service, /flushStreamingDisplay\(\{ force: true, reason: 'terminal' \}\)/);
assert.match(store, /displayBlocks/);
assert.match(store, /reservedHeight/);
~~~

- [ ] **Step 2: Feed visible deltas to both existing persistence truth and display state.**

~~~
pendingAnswerChunks.push(visibleDelta); // existing persistence truth
displayState = appendStreamingDisplayDelta(displayState, {
  lane: 'content',
  text: visibleDelta,
});
scheduleStreamingDisplayFlush();
~~~

Do not delay flushStreamingTextChunks, citation parsing, generation jobs or SQLite persistence behind display scheduling.

- [ ] **Step 3: Implement the feature-flagged patch path.**

~~~
if (getAiBlockStreamingRendererEnabled()) {
  const plan = planStreamingDisplayFlush({
    attached: visibility.bottomLocked,
    nowMs: Date.now(),
    state: displayState,
    viewportHeight: visibility.viewportHeight,
  });
  publishStreamingMessage(identity, {
    displayBlocks: plan.blocks,
    reservedHeight: plan.reservedHeight,
    status: 'generating',
  });
  return;
}
// Existing targetStreamingDisplayStep fallback remains below.
~~~

The production path must receive actual viewport height from AiChatScreen; 720 is allowed only in deterministic unit tests.

- [ ] **Step 4: Add only content-free metrics.**

~~~
generationMetrics.counters.streamSemanticFlushCount += 1;
generationMetrics.context.streamFirstReadableBlockMs ??=
  Date.now() - firstProviderDeltaAt;
generationMetrics.counters.streamMaxReservationHeight = Math.max(
  generationMetrics.counters.streamMaxReservationHeight,
  plan.reservedHeight,
);
~~~

No text, hashes, prompt data, memory data or Personal content may enter metrics.

- [ ] **Step 5: Force flush display state before all terminal persistence.**

~~~
flushStreamingDisplay({ force: true, reason: 'terminal' });
await persistStreamingSnapshot(true);
emitStreamingPatch(true);
~~~

- [ ] **Step 6: Run focused tests and commit.**

Run: node --test tests/ai-streaming-display-scheduler-unit.test.cjs tests/ai-streaming-block-rendering-policy.test.cjs
Expected: PASS.

~~~
git add src/ai/aiChatService.ts src/ai/aiStreamingMessageStore.ts src/ai/aiGenerationMetrics.ts tests/ai-streaming-block-rendering-policy.test.cjs
git commit -m "feat: publish measured streaming display blocks"
~~~

## Task 4: Render attached blocks as one continuous bubble

**Files:**
- Create: src/components/ai/AiLiveStreamingMessage.tsx
- Modify: src/components/ai/AiMessageBubble.tsx
- Modify: src/components/ai/AiMeasuredStreamBlock.tsx
- Test: tests/ai-streaming-block-rendering-policy.test.cjs

- [ ] **Step 1: Write the renderer contract.**

~~~
assert.match(liveRenderer, /AiMeasuredStreamBlock/);
assert.match(liveRenderer, /accessibilityLiveRegion="polite"/);
assert.doesNotMatch(liveRenderer, /Animated\.timing|opacity:\s*0|translateY/);
assert.match(liveRenderer, /AiStreamingCursor/);
~~~

- [ ] **Step 2: Implement a single-bubble block renderer.**

~~~
export function AiLiveStreamingMessage({ blocks, onMeasured }: Props) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.assistantBubble}>
      {blocks.map((block, index) => (
        <AiMeasuredStreamBlock
          block={block}
          key={block.id}
          onMeasured={onMeasured}
          verticalInset={edgeInset(index, blocks.length)}
        />
      ))}
      <AiStreamingCursor visible />
    </View>
  );
}
~~~

The cursor reserves no text height and disappears on terminal status. Do not animate text or remount completed keys.

- [ ] **Step 3: Route only the active attached generation to this renderer.**

~~~
if (blockStreamingEnabled && liveSnapshot.hasSnapshot && liveSnapshot.displayBlocks.length > 0) {
  return <AiLiveStreamingMessage blocks={liveSnapshot.displayBlocks} onMeasured={onMeasured} />;
}
return <ExistingMessageContent />;
~~~

- [ ] **Step 4: Preserve existing 1dp measurement suppression and 4dp accumulated reconciliation.**

Run: node --test tests/ai-streaming-block-rendering-policy.test.cjs
Expected: PASS.

- [ ] **Step 5: Commit attached renderer.**

~~~
git add src/components/ai/AiLiveStreamingMessage.tsx src/components/ai/AiMessageBubble.tsx src/components/ai/AiMeasuredStreamBlock.tsx tests/ai-streaming-block-rendering-policy.test.cjs
git commit -m "feat: render live chat as semantic blocks"
~~~

## Task 4A: Align message maximum widths to the composer rail

**Files:**
- Create: src/components/ai/aiChatBubbleRail.ts
- Modify: src/components/ai/AiChatComposer.tsx
- Modify: src/components/ai/AiMessageBubble.tsx
- Modify: src/components/ai/AiLiveStreamingMessage.tsx
- Modify: src/components/ai/AiStreamingTailMessageSegment.tsx
- Modify: src/components/ai/AiThinkingBlock.tsx
- Modify: src/components/ai/AiStreamingMessageText.tsx
- Test: tests/ai-streaming-block-rendering-policy.test.cjs

- [ ] **Step 1: Write a failing rail contract test.**

~~~
assert.match(railSource, /composerShell/);
assert.match(messageBubble, /aiChatBubbleRail/);
assert.match(liveRenderer, /aiChatBubbleRail/);
assert.match(tailRenderer, /aiChatBubbleRail/);
assert.match(thinkingBlock, /aiChatBubbleRail/);
assert.doesNotMatch(messageBubble, /maxWidth:\s*'94%'/);
assert.doesNotMatch(tailRenderer, /width:\s*"94%"/);
assert.doesNotMatch(messageBubble, /thinkingWrap:[\s\S]{0,80}maxWidth:\s*'98%'/);
~~~

- [ ] **Step 2: Extract one shared rail token from the existing page/composer layout token.**

~~~
export const aiChatBubbleRail = {
  // composerShell and message content both consume this token.
  horizontalInset: layout.pagePaddingHorizontal,
  maxWidth: '100%' as const,
};
~~~

The source of truth is the visible outer edge of composerShell. Do not use TextInput padding, `Dimensions`, onLayout coordinates, or a separately maintained percentage.

- [ ] **Step 3: Apply rail styles to the composer and message containers.**

~~~
composerShell: {
  marginHorizontal: aiChatBubbleRail.horizontalInset,
}

userStack: {
  alignSelf: 'flex-end',
  maxWidth: aiChatBubbleRail.maxWidth,
}

assistantStack: {
  alignSelf: 'flex-start',
  maxWidth: aiChatBubbleRail.maxWidth,
}
~~~

The implementation must preserve natural width for short messages. The user bubble reaches the rail left edge only at max width; the assistant bubble reaches the rail right edge only at max width.

- [ ] **Step 4: Apply the same rail to live and detached block renderers.**

~~~
<View style={[styles.assistantStack, aiChatBubbleRail.assistantStack]}>
  <AiMeasuredStreamBlock ... />
</View>
~~~

No tail-specific 94% override may remain. Thinking must consume the same rail for both normal and streaming `AiThinkingBlock` paths; a short thinking surface stays left aligned, while a long one reaches the rail right edge. Action rows, citations and date separators keep their existing independent geometry.

- [ ] **Step 5: Verify with focused tests and Android screenshots.**

Run: node --test tests/ai-streaming-block-rendering-policy.test.cjs
Expected: PASS.

On Android, capture a long user message, long assistant reply, attached streaming reply and detached tail reply. At maximum width, use a screenshot ruler or Inspector to verify each required composer-edge alignment is within 1dp.

- [ ] **Step 6: Commit rail alignment separately.**

~~~
git add src/components/ai/aiChatBubbleRail.ts src/components/ai/AiChatComposer.tsx src/components/ai/AiMessageBubble.tsx src/components/ai/AiLiveStreamingMessage.tsx src/components/ai/AiStreamingTailMessageSegment.tsx src/components/ai/AiThinkingBlock.tsx src/components/ai/AiStreamingMessageText.tsx tests/ai-streaming-block-rendering-policy.test.cjs
git commit -m "style: align chat bubbles with composer rail"
~~~

## Task 5: Unify detached tail with the same block contract

**Files:**
- Modify: src/ai/aiStreamingTailModel.ts
- Modify: src/screens/AiChatScreen.tsx
- Modify: src/ai/aiStreamingTailRenderContract.ts
- Test: tests/ai-streaming-block-rendering-policy.test.cjs

- [ ] **Step 1: Write failing detached-mode tests.**

~~~
assert.match(tailModel, /mergeStreamingDisplayBlocks/);
assert.match(chatScreen, /freezeVisibleStreamingMessage/);
assert.match(chatScreen, /reserve.*before.*promote/i);
assert.match(renderContract, /pendingShrinkHeight/);
~~~

- [ ] **Step 2: Merge scheduler blocks into the tail instead of re-splitting full text.**

~~~
const nextTail = mergeStreamingDisplayBlocks({
  blocks: patch.displayBlocks,
  previous: currentTailState,
  reservationHeight: patch.reservedHeight,
});
~~~

Use the old full-text splitter only when the feature flag is disabled or a recovery patch has no block data.

- [ ] **Step 3: Enforce reservation-before-promotion.**

~~~
streamingTailStateRef.current = reserveStreamingTailBlocks(nextTail);
forceUpdateTailState();
requestAnimationFrame(() => promoteStreamingTailBlocksForViewport());
~~~

Never call settleStreamingTailShrinkDebt while isUserDraggingRef or isMomentumScrollingRef is true.

- [ ] **Step 4: Add commit-safety test.**

~~~
test('does not commit detached blocks to the primary message until all promoted blocks are measured and debt is zero', () => {
  assert.equal(canCommitStreamingTailToMessage({
    dragging: false,
    pendingShrinkHeight: 8,
    replayVisible: false,
    remainingTailHeight: 0,
    unmeasuredBlockCount: 0,
  }), false);
});
~~~

- [ ] **Step 5: Commit detached integration.**

~~~
git add src/ai/aiStreamingTailModel.ts src/screens/AiChatScreen.tsx src/ai/aiStreamingTailRenderContract.ts tests/ai-streaming-block-rendering-policy.test.cjs
git commit -m "feat: preserve scroll geometry for block streaming"
~~~

## Task 6: Feature flag, fallback and release guardrails

**Files:**
- Modify: src/ai/aiStreamingTailFeatureFlags.ts
- Modify: src/ai/aiChatService.ts
- Modify: docs/feature-matrix.md
- Test: tests/ai-streaming-block-rendering-policy.test.cjs

- [ ] **Step 1: Add an independent remote flag.**

~~~
const value = (payload as {
  aiBlockStreamingRendererEnabled?: unknown;
}).aiBlockStreamingRendererEnabled;
return typeof value === 'boolean' ? value : false;
~~~

Default must remain false until physical Android acceptance passes. A malformed or timed-out payload preserves the safe fallback.

- [ ] **Step 2: Test fallback ownership.**

~~~
test('block renderer flag is independent from tail replay and falls back to character display', () => {
  assert.match(flags, /aiBlockStreamingRendererEnabled/);
  assert.match(service, /targetStreamingDisplayStep/);
});
~~~

- [ ] **Step 3: Update the feature matrix only after implementation exists.**

Document the renderer as “灰度/feature flag” first; do not call it fully released until the Android matrix below passes.

- [ ] **Step 4: Commit guarded rollout.**

~~~
git add src/ai/aiStreamingTailFeatureFlags.ts src/ai/aiChatService.ts docs/feature-matrix.md tests/ai-streaming-block-rendering-policy.test.cjs
git commit -m "feat: guard block streaming renderer rollout"
~~~

## Task 7: Verification and Android acceptance

**Files:**
- Modify when needed: docs/feature-matrix.md
- Test: focused tests and full suite

- [ ] **Step 1: Run static and focused verification.**

~~~
pnpm typecheck
node --test tests/ai-streaming-display-scheduler-unit.test.cjs tests/ai-streaming-block-rendering-policy.test.cjs tests/ai-chat-latency-final-acceptance-policy.test.cjs
git diff --check
~~~

Expected: all commands exit 0.

- [ ] **Step 2: Run the full regression suite.**

Run: pnpm test
Expected: all non-skipped tests pass. If unrelated parallel-work tests fail, record their exact file and preserve the user’s work; do not alter this renderer to mask them.

- [ ] **Step 3: Collect Android baseline and after data.**

On one baseline Android device, record build type, model, Android version, physical/emulator status, provider/model and network condition. With flag disabled and enabled, run:

1. normal short response;
2. 1000+ character fast burst;
3. 10,000 character response in a 200+ loaded-message thread;
4. user scrolls upward during generation for at least 10 seconds;
5. return to latest during generation;
6. stop, provider error, app background, route blur and continuation;
7. code fence, table, citation and thinking output;
8. Personal space and a branch-route switch.

Record firstDeltaToFirstVisibleTextMs, streamFirstReadableBlockMs, streamUiPatchCount, streamSemanticFlushCount, streamPersistCount, maxUiBacklogAgeMs, frame delay, streamMaxReservationHeight, streamMaxShrinkDebtHeight, visible-coordinate observations and any fallback activation.

- [ ] **Step 4: Promote the feature flag only if every gate passes.**

~~~
first readable block p95 <= 150ms
no historical reading-position jump in the upward-scroll case
no sustained JS delay > 250ms during the 10,000-character case
no terminal/recovery text loss or duplicate block
block UI flush count is lower than baseline without worse first-readable latency
~~~

- [ ] **Step 5: Final commit and report.**

~~~
git add docs/feature-matrix.md src/ai/aiStreamingDisplayScheduler.ts src/ai/aiStreamingRuntime.ts src/ai/aiChatService.ts src/ai/aiStreamingMessageStore.ts src/ai/aiStreamingBlockSplitter.ts src/ai/aiStreamingTailModel.ts src/ai/aiStreamingTailFeatureFlags.ts src/ai/aiGenerationMetrics.ts src/components/ai/AiLiveStreamingMessage.tsx src/components/ai/AiMessageBubble.tsx src/components/ai/AiMeasuredStreamBlock.tsx src/screens/AiChatScreen.tsx tests/ai-streaming-display-scheduler-unit.test.cjs tests/ai-streaming-block-rendering-policy.test.cjs
git commit -m "feat: enable verified block streaming renderer"
~~~

Report baseline/after metrics separately from Provider latency, declare every unverified Android scenario, and state the final feature-flag default.

## Plan self-review

| Spec requirement | Covered by |
| --- | --- |
| Semantic blocks and no text fade | Tasks 1, 2, 4 |
| Composer-aligned maximum bubble widths | Task 4A |
| Known-block-only reservation and debt | Tasks 1, 2, 5 |
| Attached speed and detached scroll stability | Tasks 3, 4, 5 |
| Stop/error/background/recovery/branch correctness | Tasks 3, 5, 7 |
| Metrics and Personal privacy | Tasks 3, 7 |
| Safe rollout and feature-matrix maintenance | Task 6 |

This plan intentionally excludes database migrations, FlashList, Provider changes and companion runtime changes because they are outside the rendering boundary.
