# Pixory AI Chat Streaming Tail Render Readiness Spec

## 1. Goal

This spec closes the largest remaining gap in Pixory's detached streaming experience:

- the list already reserves physical tail height correctly,
- but when the user scrolls back down, the viewport can enter blank reserved space before the real bubble and text mount,
- which makes the product feel slower than the provider/network actually is.

The goal is to make detached tail replay feel like mature chat products:

- the user can scroll up without jitter,
- the user can scroll back down as if reading already-existing history,
- the tail region is visually ready before it enters the viewport,
- the system remains performant on Android after hundreds of turns.

This spec is additive to `docs/ai-chat-streaming-research/streaming-tail-occupancy-spec.md`.
It does not replace measured tail occupancy. It hardens it into a product-grade rendering model.

## 2. Problem Statement

Current Pixory behavior is not blocked by API speed.

The current failure is:

```txt
reserved tail height exists
> user scrolls into that region
> tail blocks are promoted too late
> FlatList virtualization mounts them late
> bubble/text appear after the blank space is already visible
```

This creates a "blank first, content later" symptom even when generation has already completed or the stream buffer is far ahead.

## 3. Evidence From Current Pixory Code

### 3.1 Real Spacer Exists Before Real Content

In `src/screens/AiChatScreen.tsx`:

- `streamTailSpacer` is inserted as a real list item.
- `streamTailBlock` items are inserted only after promotion.
- promotion is driven by `promoteStreamingTailBlocks(...)`.

This is correct for occupancy, but not sufficient for render readiness.

### 3.2 Promotion Is Frame-Scheduled, Not Synchronous To Downward Reading

`scheduleStreamingTailReconcile(...)` uses `requestAnimationFrame`.

This is generally good for batching, but it means:

- the user can scroll into the tail hot zone,
- while reconcile and promotion are still waiting for the next frame or are deferred during active drag,
- so reserved space can enter the viewport before the render tree is ready.

### 3.3 FlatList Configuration Is Tuned For Long History, Not Tail Hot-Zone Entry

Current list settings in `src/screens/AiChatScreen.tsx`:

- `windowSize={11}`
- `maxToRenderPerBatch={8}`
- `removeClippedSubviews={Platform.OS === 'android'}`

These are reasonable defaults for long chat history, but they can worsen this specific symptom:

- spacer is lightweight and reaches the viewport quickly,
- tail blocks are virtualized and mounted later,
- clipped Android rows can re-enter late,
- the user sees blank occupancy before render completion.

### 3.4 Tail Blocks Are Not Full Message Shells

Current `streamTailBlock` rendering uses:

- `src/components/ai/AiMeasuredStreamBlock.tsx`
- a container in `AiChatScreen.tsx` with only horizontal padding

This means the tail region does not have the same pre-existing visual structure as a real assistant message bubble.
Even when the row mounts, the bubble shell and text appear together instead of the shell already existing.

### 3.5 Streaming Runtime Is Still Conservative When Detached

`src/ai/aiStreamingRuntime.ts` currently keeps detached cadence low:

- `12 fps` without pressure
- `8 fps` with pressure

This is good for distant detached reading, but too conservative when the user is actively approaching the tail hot zone.

## 4. Reference Evidence

### 4.1 React Native Official VirtualizedList / FlatList Guidance

React Native's official guidance explicitly accepts a tradeoff:

- offscreen items are rendered asynchronously,
- tighter virtualization can produce blank areas if scroll speed outruns fill rate,
- props like `windowSize`, `maxToRenderPerBatch`, and clipping affect this behavior.

Pixory is currently hitting this exact tradeoff in the tail replay region.

### 4.2 `use-stick-to-bottom`

This project is useful because it models AI chat as:

- a bottom-lock state,
- an escape state when the user scrolls away,
- scroll anchoring during content growth,
- a distinction between user scroll and programmatic follow.

Pixory already follows the same philosophy, but `use-stick-to-bottom` also reinforces a key product idea:

```txt
content growth should feel physically present before and while the user arrives there
```

### 4.3 Vercel `ai-chatbot`

The open-source Vercel chatbot stack uses:

- a stick-to-bottom abstraction,
- minimal visible structure changes during streaming,
- a history-first render tree instead of synthetic overlay tricks.

It does not expose Pixory's exact mobile detached tail problem, but it supports the same architectural direction:

- keep user scroll in control,
- let content exist in a stable document structure,
- avoid rebuilding heavy surfaces unnecessarily.

### 4.4 Open WebUI

Open WebUI throttles structural work to animation frames and distinguishes:

- structural list updates
- streaming content updates

This is a useful model for Pixory:

- promotion and hot-zone render preparation are structural,
- token publication is content-level,
- the two should not be coupled more than necessary.

### 4.5 GetStream `flat-list-mvcp`

This library exists because chat-style scroll anchoring on Android is hard.

The relevant lesson is not to switch libraries immediately, but:

- anchor correctness and virtualization policy are chat-critical,
- Android needs stricter handling around content insertion near the visible area.

## 5. Non-Goals

- Do not revert to overlay/floating fake content.
- Do not replace measured tail occupancy with ratio reveal.
- Do not disable virtualization globally for the whole chat list.
- Do not force full Markdown rendering for streaming tail rows.
- Do not degrade live bottom-locked streaming speed to solve detached replay.

## 6. Product Model

The detached tail model must now satisfy two distinct guarantees:

### 6.1 Occupancy Guarantee

The list must physically reserve correct height for hidden generated content.

This is already the job of measured tail occupancy.

### 6.2 Render Readiness Guarantee

Before the user visually enters that reserved region, the list must have already:

- promoted enough tail blocks,
- mounted lightweight bubble rows,
- prepared a render window beyond the current viewport,
- avoided exposing blank space as the first thing the user sees.

This new guarantee is the focus of this spec.

## 7. New Concepts

### 7.1 Tail Hot Zone

Introduce an explicit "tail hot zone".

Definition:

- the region near the latest message where the user is close enough that hidden generated content may soon enter the viewport.

The hot zone is not based on token count.
It is based on real or reserved tail height.

Suggested model:

```ts
type TailHotZoneState =
  | 'cold'
  | 'warming'
  | 'active';
```

Semantics:

- `cold`: user is detached and far from the tail; keep detached work cheap
- `warming`: user is moving toward the tail; start early promotion and render-window expansion
- `active`: user is very near the tail; prioritize visible readiness over maximum memory savings

### 7.2 Render-Ready Tail Shell

Each promoted tail block must render inside a shell visually compatible with an assistant bubble:

- same horizontal placement,
- same bubble background/border/radius,
- same internal content width assumptions,
- but using lightweight content rendering.

The shell must exist before or as the row enters the viewport.

### 7.3 Pre-Promotion Window

Promotion must no longer wait until the user directly reaches the exact reserved height boundary.

Instead, promote based on:

```txt
visible tail height
+ one additional viewport of pre-promotion budget
+ a small safety margin
```

This is not ratio reveal.
It is still block-based and height-based, but it mounts rows earlier.

### 7.4 Tail Replay Fast Path

Detached mode must be split:

- far-detached low-cost mode
- near-tail high-readiness mode

When the user is close enough to the tail, detached cadence and reconciliation must speed up.

## 8. Required Behavior Changes

### 8.1 Promotion Must Happen Ahead Of Viewport Entry

Current behavior promotes based on currently visible tail height.

Required behavior:

- compute an effective replay horizon,
- promote blocks whose cumulative reserved height falls within that horizon,
- keep promotion monotonic.

Required invariant:

```txt
the first thing the user sees when entering tail space should be a mounted row,
not naked spacer
```

### 8.2 Tail Spacer Must Represent Only The Still-Unrendered Remainder

Spacer and promoted block rows must be kept in sync so that:

- promoted height is removed from the remaining spacer,
- the user does not see both full spacer and promoted rows double-counting the same distance.

### 8.3 Tail Rows Must Use Lightweight Content But Full Bubble Shell

Current `AiMeasuredStreamBlock` should remain lightweight in content logic.

But visually it must be wrapped to resemble a real assistant row:

- assistant-side positioning
- bubble surface
- stable content width
- optional thinking lane styling when relevant

This avoids the "blank, then bubble and text both pop in" effect.

### 8.4 Tail Hot Zone Must Override Conservative Detached Cadence

While detached and cold:

- low-frequency model updates remain acceptable.

While detached and warming/active:

- reconciliation cadence must increase,
- buffered streaming deltas should update the tail model sooner,
- render readiness should take priority over detached CPU thrift.

This does not mean publishing visible text into the frozen message.
It means keeping the hidden tail structure ready.

### 8.5 Tail Hot Zone Must Adjust FlatList Behavior Locally

Global history virtualization should stay conservative.
But near the tail:

- list render window must widen,
- batch size may increase,
- Android clipping may need to be relaxed during the active hot-zone window.

This policy must be dynamic and scoped.

## 9. Concrete Design

### 9.1 Hot-Zone State Calculation

Add a pure helper that derives hot-zone state from:

- `tailState.totalReservedHeight`
- current scroll offset
- whether the user is moving toward latest
- viewport height

Inputs:

```ts
type StreamingTailViewportInput = {
  scrollOffset: number;
  totalReservedHeight: number;
  viewportHeight: number;
  scrollingTowardLatest: boolean;
};
```

Outputs:

```ts
type StreamingTailViewportPolicy = {
  hotZone: 'cold' | 'warming' | 'active';
  prePromotionHeight: number;
  targetDetachedFps: number;
  shouldRelaxClipping: boolean;
  shouldExpandRenderWindow: boolean;
};
```

### 9.2 Pre-Promotion Horizon

Promotion should use:

```txt
visibleTailHeight + prePromotionHeight
```

Where:

- `visibleTailHeight` is how much tail is already within the replay region,
- `prePromotionHeight` is a viewport-derived buffer in front of the user.

Rule:

- `cold`: no extra pre-promotion or a very small buffer
- `warming`: roughly one viewport of future tail
- `active`: one viewport plus safety margin

The exact values should be derived from viewport height, not arbitrary constants detached from layout.

### 9.3 Tail Bubble Shell Component

Introduce a focused visual container for promoted tail blocks.

Recommended file:

- `src/components/ai/AiStreamingTailBlockBubble.tsx`

Responsibilities:

- render assistant-side row alignment
- render assistant bubble shell tokens
- host `AiMeasuredStreamBlock`
- report width if needed

Non-responsibilities:

- full message action row
- citations
- avatar management
- favorite/version controls

This keeps replay lightweight but visually coherent.

### 9.4 Light-First Content Strategy

Promoted tail blocks must continue to avoid heavy final rendering.

Required rule:

- content lane uses lightweight streaming/plain rendering while detached replay is active
- reasoning lane uses lightweight text treatment or existing compact thinking presentation
- final rich Markdown upgrade remains a post-attach concern, not a tail-entry concern

This matches the same mature pattern seen in web chat apps:

```txt
show readable content first
upgrade expensive formatting after stability
```

### 9.5 Dynamic FlatList Tail Policy

Add a derived tail performance policy for the list:

- base mode: existing long-history virtualization settings
- active tail mode: widened render window and larger batch budget

This should not require swapping list implementations.

The policy must be tied to hot-zone state and current generation status.

### 9.6 Reconcile Priority Split

Split reconcile work into:

- structural tail readiness reconcile
- low-priority detached bookkeeping

If the user is moving toward latest and hot zone is warming/active:

- structural reconcile should not wait behind lower-value deferred work.

### 9.7 No Blank-First Entry Invariant

New invariant:

If the user can see a non-zero portion of tail replay space, then at least one of these must be true:

- a promoted tail bubble row is already mounted in or just ahead of viewport
- spacer remainder is below the mounted row, not above it as the first visible element

This is the main UX acceptance invariant.

## 10. Reasoning Lane Requirements

The same render-readiness rules must apply to reasoning blocks when reasoning is expanded:

- expansion must immediately recompute active lanes and replay horizon
- collapsed reasoning must not reserve or consume hidden replay space
- expanded reasoning must enter the same pre-promotion model as content lane

The user must not need to "scroll again" to make expanded reasoning appear.

## 11. Performance Strategy

### 11.1 Preserve Long-History Efficiency

Do not solve hot-zone entry by making the whole chat list heavy all the time.

Long history still requires:

- message row memoization
- bounded rendering
- clipped/offscreen cleanup when safe
- streaming isolated from full-message rerenders

### 11.2 Spend Budget Only Near The Tail

When tail hot zone is `warming` or `active`, spend extra UI budget on:

- earlier promotion
- larger render buffer
- quicker detached tail reconciliation
- reduced clipping risk

This is where user-perceived smoothness matters most.

### 11.3 Keep Heavy Markdown Out Of The Critical Tail Path

Tail replay should not trigger:

- whole-message markdown reparsing
- HTML/WebView render path
- expensive code highlighting
- citation-heavy finalized layout

Those belong after final attach or stable finalized history rendering.

## 12. Files And Boundaries

### Modify

- `src/screens/AiChatScreen.tsx`
  - derive tail hot-zone state
  - drive pre-promotion horizon
  - apply dynamic FlatList tail policy
  - render new tail bubble shell
- `src/ai/aiStreamingTailModel.ts`
  - add hot-zone-aware promotion inputs if needed
  - support spacer remainder calculations cleanly
- `src/ai/aiStreamingRuntime.ts`
  - support near-tail detached fast path without affecting bottom-locked live path
- `src/components/ai/AiMeasuredStreamBlock.tsx`
  - keep lightweight render path
  - support shell integration cleanly

### Create

- `src/ai/aiStreamingTailViewportPolicy.ts`
  - pure hot-zone policy calculator
- `src/components/ai/AiStreamingTailBlockBubble.tsx`
  - assistant-side replay shell for promoted blocks

### Update Tests

- add new policy coverage under `tests/ai-chat-streaming-tail-policy.test.cjs`
- add coverage for `AiChatScreen.tsx` tail hot-zone logic
- update tests that currently only assert occupancy behavior

## 13. Acceptance Criteria

### 13.1 Product Behavior

- User scrolling upward while generation continues sees no jitter in the visible history viewport.
- User scrolling downward toward the generated tail does not first see blank reserved space.
- Tail replay content feels like existing history rather than a delayed patch insertion.
- If the provider is far ahead, near-tail replay keeps up closely with the buffered data instead of remaining artificially slow.

### 13.2 Structural Guarantees

- Promotion remains block-based, not ratio-based.
- Spacer only represents still-unrendered tail remainder.
- Promoted rows render inside an assistant-style tail bubble shell.
- Reasoning and content lanes obey the same active-lane replay rules.

### 13.3 Performance Guarantees

- Long history remains virtualized outside the tail hot zone.
- Hot-zone policy is dynamic, not a global permanent list expansion.
- Heavy markdown rendering is not reintroduced into the detached replay critical path.

### 13.4 Review Guarantees

- No overlay/floating fake tail implementation.
- No reintroduction of scroll-percentage or character-percentage reveal.
- No full completed reply flash while detached.
- No requirement for emulator or device testing for this phase; logic review and policy tests are sufficient.

## 14. Recommended Implementation Order

1. Add pure tail viewport policy helper.
2. Add tail bubble shell component.
3. Change promotion horizon from visible-only to visible-plus-prepromotion.
4. Make spacer represent only remaining hidden height after promotion.
5. Add dynamic FlatList hot-zone policy.
6. Add near-tail detached fast-path cadence.
7. Add reasoning-lane replay recalculation coverage.

## 15. Decision

The correct product-grade direction is not "more spacer" and not "faster typewriter only".

It is:

```txt
measured occupancy
> pre-promotion ahead of viewport
> mounted lightweight bubble shell before entry
> tail hot-zone virtualization policy
> near-tail detached fast path
> heavy render deferred until safe
```

This preserves the architectural strengths already built in Pixory while solving the remaining blank-gap symptom honestly at the render pipeline level.
