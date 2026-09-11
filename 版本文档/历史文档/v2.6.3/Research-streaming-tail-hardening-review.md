# Streaming Tail Hardening Review Checklist

## Scope

This checklist is for reviewing the hardening phase defined by:

- `docs/ai-chat-streaming-research/streaming-tail-hardening-spec.md`
- `docs/ai-chat-streaming-research/streaming-tail-hardening-plan.md`

It is not a user feel-test checklist. It is a code and logic review checklist.

## Allowed Public Constants

Only these new hard-coded values are acceptable:

- `150`
  - sourced from `react-native-streaming-message-list` debounce
  - sourced from `ai-chatbot` scroll idle timer
- `200`
  - sourced from `react-native-streaming-message-list` stable delay
- `70`
  - sourced from `use-stick-to-bottom` near-bottom threshold
- `350`
  - sourced from `use-stick-to-bottom` retained resize/reconcile window

If any new `ms`, `px`, `fps`, or ratio-style constant appears outside already-existing Pixory values and is not traceable to those sources, the review should fail.

## Required Source Behaviors

The implementation should prove all of the following:

- actual assistant content width is measured and cached
- `PixelRatio.getFontScale()` participates in estimation and height-cache identity
- detached shrink is recorded as debt, not applied immediately
- prewarm promotion is block-count-driven, not pixel-threshold-driven
- reconciliation is drag-aware and detached-safe
- `thinking` collapse removes reasoning from effective replay occupancy
- `thinking` re-expand rebuilds replay immediately at the current scroll position

## Required Files To Inspect

- `src/components/ai/AiMessageBubble.tsx`
- `src/ai/aiStreamingBubbleWidthRegistry.ts`
- `src/ai/aiStreamingBlockSplitter.ts`
- `src/ai/aiStreamingHeightCache.ts`
- `src/components/ai/AiMeasuredStreamBlock.tsx`
- `src/ai/aiStreamingTailModel.ts`
- `src/screens/AiChatScreen.tsx`
- `src/ai/aiStreamingPerfDebug.ts`

## Required Tests To Pass

- `pnpm typecheck`
- `pnpm test`
- `git diff --check`

At minimum, the following policy suites must still be meaningful:

- `tests/ai-chat-streaming-tail-policy.test.cjs`
- `tests/ai-chat-performance-hardening-policy.test.cjs`
- `tests/ai-chat-fixes-policy.test.cjs`

## Fail Conditions

Reject the implementation if any of these are true:

- it adds a new guessed timing window outside `150 / 200 / 350`
- it adds a new guessed near-bottom / prewarm pixel threshold outside the sourced `70`
- it shrinks detached reserved height immediately on lower measurement
- it reintroduces ratio reveal
- it forces scroll during detached reading
- it leaves width estimation on a raw `window * ratio` fallback
- it adds production-visible debug overhead

## Remaining Honest Risks

Passing this review means the code is logically grounded and implementation-ready. It does **not** prove perfect final feel.

Still deferred to later human validation:

- whether replay feels fully invisible on real Android hardware
- whether some content classes still over-reserve too conservatively
- whether final completed-state blank space needs lighter debt repayment tuning
