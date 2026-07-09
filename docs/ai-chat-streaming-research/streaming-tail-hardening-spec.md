# Pixory AI Chat Streaming Tail Hardening Spec

## 1. Goal

This document hardens Pixory's measured streaming tail occupancy implementation so that it behaves more like mature chat products under long-running, high-volume, Android-first usage.

It does **not** replace the existing measured-tail architecture. It assumes the following are already true:

- live streaming text is isolated in `AiStreamingMessageStore`
- detached reading uses a real `FlatList` tail spacer and block items
- promotion is block-based and monotonic
- `thinking` / `reasoning` can be detached independently from main content

This hardening phase focuses on:

- safer shrink correction without viewport jumps
- more accurate bubble-width-driven estimation
- smoother replay through prewarm promotion
- post-layout reconciliation that does not fight the user
- development-time observability for performance and regression review

## 2. Hard Constraint: No Invented Product Constants

This phase must not introduce arbitrary timing, pixel, or FPS constants just because they "feel right".

Allowed constants must come from one of two sources only:

1. **Public reference implementations already cloned into** `D:\Project\PixoryStreamingResearch`
2. **Runtime geometry or measured state**, such as:
   - actual `onLayout` width
   - actual `PixelRatio.getFontScale()`
   - actual viewport height
   - actual promoted block count

If a value does not come from one of those two sources, it must not be added.

## 3. Source-Grounded Reference Values

The following public values are acceptable because they are explicitly present in the local reference repositories:

### `react-native-streaming-message-list`

Files:

- `D:\Project\PixoryStreamingResearch\react-native-streaming-message-list\src\hooks\usePlaceholderState.ts`
- `D:\Project\PixoryStreamingResearch\react-native-streaming-message-list\src\StreamingMessageList.tsx`

Allowed values:

- placeholder debounce: `150 ms`
- placeholder stable delay: `200 ms`

Meaning in Pixory:

- debounce height settlement before publishing "stable enough" spacer changes
- wait a short stability window before consuming or correcting placeholder/tail occupancy

### `use-stick-to-bottom`

File:

- `D:\Project\PixoryStreamingResearch\use-stick-to-bottom\src\useStickToBottom.ts`

Allowed values:

- near-bottom offset: `70 px`
- retained resize animation window: `350 ms`

Meaning in Pixory:

- explicit distinction between "locked enough to follow" and "escaped from lock"
- a bounded reconciliation window after dynamic layout change

### `ai-chatbot`

File:

- `D:\Project\PixoryStreamingResearch\ai-chatbot\hooks\use-scroll-to-bottom.tsx`

Allowed values:

- user scrolling idle timeout: `150 ms`

Meaning in Pixory:

- user gesture ownership should not be considered settled immediately on every scroll event

## 4. Non-Goals

- Do not replace `FlatList`
- Do not add overlay/floating fake tail content
- Do not add a final whole-response height estimate
- Do not invent Gemini or Claude internal thresholds; those are not public
- Do not require emulator or real-device testing for acceptance in this phase
- Do not rewrite message rendering architecture outside the measured-tail path

## 5. Optimization Areas

## 5.1 Safe Shrink Correction

### Problem

Current detached reservation is intentionally monotonic. This avoids viewport jumps, but it can leave temporary over-reserved blank space.

### Required behavior

- `reservedHeight` must still grow monotonically while the user is detached
- measured shrink must not immediately reduce visible spacer height
- shrink must be converted into deferred debt
- shrink may be applied only in a safe reconciliation window

### Safe application conditions

Shrink correction is allowed only when at least one of the following is true:

1. the user intentionally returned to latest
2. the affected tail region is fully outside the current viewport
3. the affected block has already been promoted and scrolled through

### Timing

Use only sourced windows:

- `150 ms` debounce before settling shrink candidates
- `200 ms` stable confirmation before applying them
- `350 ms` retained reconciliation window after completion or structural layout changes

### Data model addition

The tail state should explicitly track deferred shrink debt, not silently discard it. Example fields:

```ts
type TailShrinkState = {
  overReservedHeight: number;
  pendingShrinkHeight: number;
  shrinkStableSince: number | null;
};
```

## 5.2 Real Bubble Width Registry

### Problem

Tail height estimation should depend on the real assistant content width, not a loose window-width approximation.

### Required behavior

- register the most recent actual assistant content width from `onLayout`
- bucket that width with the existing `8 px` rule
- feed that width into both estimation and height-cache key generation
- use actual `PixelRatio.getFontScale()` in both estimation and cache identity

### Fallback

If no measured width exists yet, only use a geometry-derived fallback based on:

- current screen width
- current page horizontal padding
- current assistant stack width ratio
- current bubble horizontal padding

No raw `window * ratio` fallback is allowed without accounting for those layout terms.

## 5.3 Promotion Prewarm

### Problem

Even with measured occupancy, waiting until a block fully enters the reserved region can make replay feel reactive rather than naturally pre-existing.

### Required behavior

- promotion remains monotonic
- prewarm must be based on **block count**, not an invented pixel threshold
- default prewarm window:
  - promote the next complete block ahead of the visible frontier
  - if that block is very small, allow one more block
- `reasoning` blocks may prewarm only when the thinking lane is expanded

### Why block-count prewarm

This stays aligned with the existing measured-block model and avoids reintroducing unsourced pixel heuristics.

## 5.4 Reconciliation Window

### Problem

Dynamic layout changes still need a disciplined follow/recompute path after:

- thinking expand/collapse
- composer height change
- measured rich content growth
- final completion flush

### Required behavior

- introduce explicit `isUserDragging` / `gestureSettled` state
- if locked or near-bottom, reconcile within a retained `350 ms` window
- if detached, do not force-scroll; only rebuild effective tail occupancy and render state
- every reconcile pass must be `requestAnimationFrame`-scheduled
- user drag must always beat programmatic correction

### Lock semantics

Pixory should explicitly distinguish:

- `atBottom`
- `nearBottom`
- `escapedFromLock`

The acceptable public near-bottom threshold is `70 px`, from `use-stick-to-bottom`.

## 5.5 Development-Time Observability

### Problem

Without structured counters, future regressions will be judged by feel rather than evidence.

### Required behavior

Add a dev-only instrumentation path that records:

- tail state update count
- measurement count
- promotion count
- max reserved height
- max over-reserved height
- detached patch count
- reconcile count
- current lock state (`atBottom`, `nearBottom`, `escapedFromLock`)

This must have zero production effect.

## 6. File Scope

Likely touched files:

- `src/screens/AiChatScreen.tsx`
- `src/ai/aiStreamingTailModel.ts`
- `src/ai/aiStreamingBlockSplitter.ts`
- `src/ai/aiStreamingHeightCache.ts`
- `src/components/ai/AiMeasuredStreamBlock.tsx`
- `src/components/ai/AiMessageBubble.tsx`

Likely new files:

- `src/ai/aiStreamingBubbleWidthRegistry.ts`
- `src/ai/aiStreamingPerfDebug.ts`

Likely tests:

- `tests/ai-chat-streaming-tail-policy.test.cjs`
- `tests/ai-chat-performance-hardening-policy.test.cjs`
- `tests/ai-chat-streaming-runtime-policy.test.cjs`

## 7. Acceptance Criteria

### Logic

- no detached shrink correction can move the current visible anchor
- a new `messageId` or `generationId` cannot inherit stale tail occupancy
- `thinking` collapse removes reasoning from effective occupancy and promotion
- `thinking` re-expand immediately rebuilds effective replay state at the current scroll position

### Experience

- replay while scrolling downward feels like reading existing history, not revealing a hidden substring
- long detached sessions do not end in a sudden full-content insertion
- completion while detached does not flash

### Performance

- width-aware estimation reduces spacer correction churn compared with geometry-only fallback
- dev counters can identify whether churn is caused by measurement, promotion, or reconciliation
- no production-only behavior depends on debug instrumentation

## 8. Review Notes

This spec is intentionally narrower than the original occupancy spec. It does not propose a new architecture. It hardens the existing one with publicly grounded timing and geometry rules so another AI or engineer can implement it without inventing product constants.
