# Streaming Tail Render Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the "blank reserved space first, bubble/text later" symptom when the user scrolls back down into detached streaming output.

**Architecture:** Keep Pixory's measured tail occupancy model, but add a render-readiness layer: a pure tail hot-zone policy, earlier block promotion, a lightweight assistant bubble shell for promoted tail blocks, and a scoped FlatList performance mode near the tail.

**Tech Stack:** Expo, React Native, TypeScript, inverted `FlatList`, existing measured tail model, Node policy tests in `tests/*.test.cjs`.

---

## 0. Hard Rules

- Do not remove measured tail occupancy.
- Do not bring back ratio reveal.
- Do not implement overlay/floating fake content.
- Do not globally disable virtualization for the entire chat list.
- Do not turn promoted tail blocks into full `AiMessageBubble` rows with actions/citations/version controls.
- Do not force full Markdown/WebView render into the detached replay path.
- Do not modify unrelated chat features.
- Do not create a git commit, push, tag, PR, EAS update, package build, or deployment.

## 1. File Map

### Create

- `src/ai/aiStreamingTailViewportPolicy.ts`
  - Pure hot-zone policy derivation from scroll offset, viewport height, and tail reserved height.
- `src/components/ai/AiStreamingTailBlockBubble.tsx`
  - Lightweight assistant-side tail replay shell for promoted blocks.

### Modify

- `src/screens/AiChatScreen.tsx`
  - consume tail viewport policy
  - expand promotion horizon
  - render tail block shell
  - apply dynamic FlatList hot-zone settings
  - trigger immediate replay recalculation on lane changes
- `src/ai/aiStreamingTailModel.ts`
  - optionally expose helpers to compute remaining spacer height after promoted blocks
  - ensure promotion inputs can accept an expanded replay horizon
- `src/ai/aiStreamingRuntime.ts`
  - support near-tail detached fast path
- `src/components/ai/AiMeasuredStreamBlock.tsx`
  - integrate cleanly with the new shell while preserving lightweight content rendering
- `tests/ai-chat-streaming-tail-policy.test.cjs`
  - add new policy tests for hot-zone, shell, and pre-promotion behavior
- other policy tests only if needed for updated symbol names

## 2. Success Criteria

Implementation is acceptable when all are true:

- `pnpm typecheck` passes.
- `pnpm test` passes.
- `git diff --check` passes.
- `AiChatScreen.tsx` contains a hot-zone derived replay policy rather than visible-only tail promotion.
- promoted tail rows render inside a dedicated assistant-style tail block bubble component.
- spacer height reflects only the unpromoted remainder.
- there is a dynamic list-performance branch for the tail hot zone.
- no code path reintroduces ratio reveal or overlay tail UI.

## 3. Task 1: Add Pure Tail Viewport Policy

**Files:**

- Create: `src/ai/aiStreamingTailViewportPolicy.ts`
- Modify: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] **Step 1: Add a policy test**

Add to `tests/ai-chat-streaming-tail-policy.test.cjs`:

```js
test('tail viewport policy defines hot-zone state and pre-promotion budget', () => {
  const policy = read('src/ai/aiStreamingTailViewportPolicy.ts');
  assert.match(policy, /hotZone:\s*'cold'\s*\|\s*'warming'\s*\|\s*'active'/);
  assert.match(policy, /export function deriveStreamingTailViewportPolicy/);
  assert.match(policy, /prePromotionHeight/);
  assert.match(policy, /shouldRelaxClipping/);
  assert.match(policy, /shouldExpandRenderWindow/);
  assert.match(policy, /viewportHeight/);
  assert.match(policy, /totalReservedHeight/);
  assert.doesNotMatch(policy, /ratio|characterPercent|scrollPercent/);
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected: failure because `src/ai/aiStreamingTailViewportPolicy.ts` does not exist.

- [ ] **Step 3: Create the helper**

Create `src/ai/aiStreamingTailViewportPolicy.ts` with:

- exported `StreamingTailViewportInput`
- exported `StreamingTailViewportPolicy`
- exported `deriveStreamingTailViewportPolicy(...)`

Required behavior:

- compute distance from current scroll offset to latest/tail replay region
- derive `cold`, `warming`, `active`
- derive `prePromotionHeight` from `viewportHeight`, not a flat magic number
- derive `targetDetachedFps`
- derive `shouldRelaxClipping`
- derive `shouldExpandRenderWindow`

Required logic:

- `cold` when user is detached and far from tail
- `warming` when user is moving toward latest and within roughly one viewport to one-and-a-half viewports of replay space
- `active` when user is close enough that replay rows may enter the viewport immediately

- [ ] **Step 4: Run the targeted test**

Run:

```powershell
pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected: pass.

## 4. Task 2: Add Tail Bubble Shell

**Files:**

- Create: `src/components/ai/AiStreamingTailBlockBubble.tsx`
- Modify: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] **Step 1: Add a shell policy test**

Append:

```js
test('tail block replay uses a dedicated assistant-style bubble shell', () => {
  const shell = read('src/components/ai/AiStreamingTailBlockBubble.tsx');
  assert.match(shell, /export function AiStreamingTailBlockBubble/);
  assert.match(shell, /assistant/i);
  assert.match(shell, /borderRadius|borderColor|backgroundColor/);
  assert.doesNotMatch(shell, /favorite|versionControl|citation/i);
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected: failure because the file does not exist.

- [ ] **Step 3: Implement the shell component**

Create `src/components/ai/AiStreamingTailBlockBubble.tsx`.

Responsibilities:

- assistant-side row alignment
- assistant bubble visual tokens using existing design tokens
- host `children`
- keep max width consistent with assistant message content width assumptions

Non-responsibilities:

- action row
- citations
- avatar
- favorite/version controls
- full message orchestration

Implementation requirements:

- use existing tokens from `src/design/tokens`
- match assistant bubble surface in `AiMessageBubble.tsx` closely enough for visual continuity
- keep it lightweight and focused

- [ ] **Step 4: Run targeted tests**

Run:

```powershell
pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected: pass.

## 5. Task 3: Expand Promotion Horizon

**Files:**

- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `src/ai/aiStreamingTailModel.ts`
- Modify: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] **Step 1: Add a policy test for pre-promotion**

Append:

```js
test('AI chat screen promotes tail blocks with a pre-promotion horizon, not visible-only tail height', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  assert.match(chat, /deriveStreamingTailViewportPolicy/);
  assert.match(chat, /prePromotionHeight/);
  assert.match(chat, /visibleTailHeight/);
  assert.match(chat, /visibleTailHeight\s*\+\s*tailViewportPolicy\.prePromotionHeight/);
});
```

- [ ] **Step 2: Inspect current replay calculation**

In `AiChatScreen.tsx`, locate:

- `recomputeVisibleStreamingTailForCurrentScroll`
- the call to `promoteStreamingTailBlocks`
- current `visibleTailHeight` calculation

Do not rewrite surrounding detached logic beyond what this task needs.

- [ ] **Step 3: Add hot-zone policy usage**

In `AiChatScreen.tsx`:

- derive viewport height from current list/layout data
- derive `tailViewportPolicy` from the new helper
- compute `promotionHorizonHeight = visibleTailHeight + tailViewportPolicy.prePromotionHeight`
- pass `promotionHorizonHeight` into `promoteStreamingTailBlocks`

Implementation rule:

- keep promotion monotonic
- do not switch to ratio/substring reveal

- [ ] **Step 4: Adjust tail model input if needed**

If `promoteStreamingTailBlocks` currently assumes visible-only semantics, update `src/ai/aiStreamingTailModel.ts` so its input clearly represents replay horizon height instead of implicit viewport-only height.

If this requires renaming:

- use a precise name like `replayHorizonHeight`
- update all call sites and tests consistently

- [ ] **Step 5: Run verification**

Run:

```powershell
pnpm typecheck
pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected: pass.

## 6. Task 4: Make Spacer Represent Only Unpromoted Remainder

**Files:**

- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `src/ai/aiStreamingTailModel.ts`
- Modify: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] **Step 1: Add a spacer remainder policy test**

Append:

```js
test('tail spacer represents only the remaining unpromoted tail height', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  assert.match(chat, /hiddenTailHeight/);
  assert.match(chat, /promotedBlockIds/);
  assert.doesNotMatch(chat, /hiddenTailHeight\s*=\s*calculateEffectiveTotalReservedHeight\(\s*tailState\s*,\s*activeLanes\s*\)\s*;/);
});
```

- [ ] **Step 2: Add or expose a pure helper**

In `src/ai/aiStreamingTailModel.ts`, add a helper that computes remaining hidden height after subtracting promoted blocks for the active lanes.

Suggested signature:

```ts
export function calculateRemainingStreamingTailHeight(
  state: AiStreamingTailState,
  activeLanes?: Array<'content' | 'reasoning'>
): number
```

Required behavior:

- include only active lanes
- subtract promoted block reserved heights
- never return negative height

- [ ] **Step 3: Replace visible spacer height calculation**

In `AiChatScreen.tsx`, replace the spacer height source so that the spacer reflects only the unpromoted remainder.

Required invariant:

- promoted rows plus spacer remainder equal the active-lane total reserved tail height

- [ ] **Step 4: Run verification**

Run:

```powershell
pnpm typecheck
pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected: pass.

## 7. Task 5: Render Promoted Tail Blocks Inside The Shell

**Files:**

- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `src/components/ai/AiMeasuredStreamBlock.tsx`
- Modify: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] **Step 1: Add screen render policy test**

Append:

```js
test('promoted tail blocks render inside the dedicated tail bubble shell', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  assert.match(chat, /AiStreamingTailBlockBubble/);
  assert.match(chat, /<AiStreamingTailBlockBubble>[\s\S]*<AiMeasuredStreamBlock/s);
});
```

- [ ] **Step 2: Update imports**

In `AiChatScreen.tsx`, import:

- `AiStreamingTailBlockBubble`

- [ ] **Step 3: Wrap tail block rendering**

In the `streamTailBlock` render branch:

- wrap `AiMeasuredStreamBlock` in `AiStreamingTailBlockBubble`
- keep `onMeasured` wiring intact
- keep bubble width logic consistent with current tail measurement assumptions

- [ ] **Step 4: Keep measured block lightweight**

In `AiMeasuredStreamBlock.tsx`:

- do not switch back to heavy finalized Markdown rendering
- keep `block.lane === 'reasoning'` lightweight
- keep content lane using lightweight streaming/plain strategy

If needed, add a small comment clarifying that this component intentionally stays cheap for detached replay.

- [ ] **Step 5: Run verification**

Run:

```powershell
pnpm typecheck
pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected: pass.

## 8. Task 6: Add Dynamic FlatList Tail Hot-Zone Policy

**Files:**

- Modify: `src/screens/AiChatScreen.tsx`
- Modify: relevant tests

- [ ] **Step 1: Add list policy test**

Append to `tests/ai-chat-streaming-tail-policy.test.cjs`:

```js
test('AI chat screen derives dynamic tail hot-zone list settings', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  assert.match(chat, /shouldRelaxClipping/);
  assert.match(chat, /shouldExpandRenderWindow/);
  assert.match(chat, /removeClippedSubviews=/);
  assert.match(chat, /windowSize=/);
  assert.match(chat, /maxToRenderPerBatch=/);
});
```

- [ ] **Step 2: Derive list settings from hot-zone policy**

In `AiChatScreen.tsx`, derive dynamic values for:

- `removeClippedSubviews`
- `windowSize`
- `maxToRenderPerBatch`

Rules:

- preserve current conservative defaults outside the hot zone
- relax clipping in `active` hot zone on Android if needed
- expand render window only while generation is active and the user is near the tail

- [ ] **Step 3: Wire dynamic props into FlatList**

Replace hardcoded props with the derived values.

Do not turn the list into an always-heavy configuration.

- [ ] **Step 4: Run verification**

Run:

```powershell
pnpm typecheck
pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected: pass.

## 9. Task 7: Add Near-Tail Detached Fast Path

**Files:**

- Modify: `src/ai/aiStreamingRuntime.ts`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: runtime policy tests if they assert exact tiers

- [ ] **Step 1: Add policy test**

If exact runtime tests exist, extend them so detached state can distinguish:

- far-detached cadence
- near-tail cadence

Do not weaken existing bottom-locked live cadence assertions.

- [ ] **Step 2: Define the rule**

Near-tail detached fast path must mean:

- still detached
- still not publishing into frozen visible text
- but tail model updates and structural reconcile happen more aggressively

Implement this by:

- extending runtime cadence inputs, or
- adding a screen-level fast-path scheduling branch for the tail model

Prefer the smaller, less invasive change.

- [ ] **Step 3: Implement minimal safe version**

Recommended:

- keep `aiStreamingRuntime.ts` mostly intact for generic visible publishing
- in `AiChatScreen.tsx`, when hot zone is `warming` or `active`, schedule detached tail reconcile more aggressively than in `cold`

If `aiStreamingRuntime.ts` is touched, keep the public contract simple and fully update tests.

- [ ] **Step 4: Run verification**

Run:

```powershell
pnpm typecheck
pnpm test
```

Expected: pass.

## 10. Task 8: Ensure Reasoning Lane Immediate Replay Recalculation

**Files:**

- Modify: `src/screens/AiChatScreen.tsx`
- Modify: tail policy tests

- [ ] **Step 1: Add policy test**

Append:

```js
test('thinking expansion immediately recomputes active-lane tail replay', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  assert.match(chat, /thinking-expanded/);
  assert.match(chat, /forceRender:\s*true/);
  assert.match(chat, /activeLanes/);
});
```

- [ ] **Step 2: Review current thinking expansion path**

Locate:

- `onThinkingExpandedChange`
- any `scheduleStreamingTailReconcile("thinking-expanded"...`
- active-lane calculations

Ensure:

- expanding thinking immediately recalculates replay horizon
- collapsing thinking removes reasoning occupancy from both promotion and spacer remainder

- [ ] **Step 3: Patch the minimal missing logic**

If current code already mostly does this, only fix the missing recompute path and keep changes surgical.

- [ ] **Step 4: Run verification**

Run:

```powershell
pnpm typecheck
pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected: pass.

## 11. Task 9: Final Review And Verification

**Files:**

- No new files unless tests reveal a gap.

- [ ] **Step 1: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 2: Run all tests**

Run:

```powershell
pnpm test
```

Expected: all tests pass.

- [ ] **Step 3: Run diff whitespace check**

Run:

```powershell
git diff --check
```

Expected: no output.

- [ ] **Step 4: Review code against spec**

Confirm manually:

- no ratio reveal symbols return
- no overlay/fake tail layer exists
- spacer is remainder-only
- promoted tail rows use the new shell
- hot-zone policy is dynamic and viewport-based
- list settings change only near the tail, not globally
- detached replay remains lightweight
- reasoning lane obeys active-lane rules

- [ ] **Step 5: Stop before git/release actions**

Do not run:

```powershell
git commit
git push
git tag
npx eas-cli update
eas update
gradlew assembleRelease
scripts/deploy-docs-mist01.ps1
```

Expected final handoff:

- changed files
- verification results
- remaining risks
- wait for user inspection and acceptance

## 12. Risks To Watch

- Over-expanding render window permanently and hurting long-history performance.
- Accidentally double-counting promoted rows plus spacer height.
- Reintroducing heavy Markdown render in detached replay.
- Coupling hot-zone scheduling too tightly to live bottom-locked cadence.
- Fixing content lane replay while leaving reasoning lane one interaction behind.

## 13. Handoff Prompt

```txt
You are implementing Pixory's streaming tail render-readiness hardening.

Read these files first:
- docs/ai-chat-streaming-research/streaming-tail-occupancy-spec.md
- docs/ai-chat-streaming-research/streaming-tail-render-readiness-spec.md
- docs/ai-chat-streaming-research/streaming-tail-render-readiness-plan.md
- src/screens/AiChatScreen.tsx
- src/ai/aiStreamingTailModel.ts
- src/ai/aiStreamingRuntime.ts
- src/components/ai/AiMeasuredStreamBlock.tsx

You must preserve measured tail occupancy. Do not replace it with ratio reveal or overlay rendering.

The required design is:
- pre-promotion ahead of viewport entry
- remainder-only tail spacer
- lightweight promoted tail rows inside a dedicated assistant bubble shell
- dynamic FlatList hot-zone policy near the tail
- near-tail detached fast path
- immediate reasoning-lane replay recalculation on expansion changes

Forbidden shortcuts:
- no ratio reveal
- no overlay tail UI
- no global permanent virtualization relaxation
- no full Markdown/WebView replay path
- no commit/push/tag/PR/deploy/hot-update/build

Acceptance commands:
- pnpm typecheck
- pnpm test
- git diff --check
```
