# AI Chat Scroll-to-Latest Affordance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the large centered latest-message control with an 18px right-side affordance and let an explicit downward gesture reattach streaming chat at 160px without ever reattaching an upward gesture.

**Architecture:** Keep the existing 32/48/70px streaming-tail rules untouched. Add a pure policy module for the new 8px gesture latch, 160px directional reattach threshold, and 200px button threshold; wire it into `AiChatScreen`; keep visual animation inside `AiScrollToLatestButton` on the Reanimated UI thread.

**Tech Stack:** React Native 0.81, Expo 54, TypeScript, React Native Reanimated 4, Node test runner.

---

### Task 1: Directional latest-message policy

**Files:**
- Create: `src/ai/aiScrollToLatestPolicy.ts`
- Create: `tests/ai-scroll-to-latest-policy.test.cjs`

- [ ] **Step 1: Write the failing policy unit test**

Create `tests/ai-scroll-to-latest-policy.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'src/ai/aiScrollToLatestPolicy.ts');

function loadPolicy() {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: sourcePath,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { exports: module.exports, module, require }, { filename: sourcePath });
  return module.exports;
}

test('latest-message policy uses the approved thresholds', () => {
  const policy = loadPolicy();
  assert.equal(policy.SCROLL_TO_LATEST_GESTURE_DISTANCE, 8);
  assert.equal(policy.SCROLL_TO_LATEST_REATTACH_OFFSET, 160);
  assert.equal(policy.SCROLL_TO_LATEST_SHOW_OFFSET, 200);
});

test('gesture direction latches only after eight points of physical movement', () => {
  const { resolveScrollToLatestGestureDirection } = loadPolicy();
  assert.equal(resolveScrollToLatestGestureDirection('undetermined', 7.9), 'undetermined');
  assert.equal(resolveScrollToLatestGestureDirection('undetermined', 8), 'toward_latest');
  assert.equal(resolveScrollToLatestGestureDirection('undetermined', -8), 'away_from_latest');
  assert.equal(resolveScrollToLatestGestureDirection('away_from_latest', 40), 'away_from_latest');
  assert.equal(resolveScrollToLatestGestureDirection('toward_latest', -40), 'toward_latest');
});

test('only an explicit downward gesture can reattach within 160 points', () => {
  const { shouldReattachToLatest } = loadPolicy();
  assert.equal(shouldReattachToLatest({ direction: 'toward_latest', offsetY: 160 }), true);
  assert.equal(shouldReattachToLatest({ direction: 'toward_latest', offsetY: 161 }), false);
  assert.equal(shouldReattachToLatest({ direction: 'away_from_latest', offsetY: 0 }), false);
  assert.equal(shouldReattachToLatest({ direction: 'undetermined', offsetY: 0 }), false);
});

test('the affordance appears at 200 points', () => {
  const { shouldShowScrollToLatest } = loadPolicy();
  assert.equal(shouldShowScrollToLatest(199.9), false);
  assert.equal(shouldShowScrollToLatest(200), true);
});
```

- [ ] **Step 2: Run the unit test and verify RED**

Run: `node --test tests/ai-scroll-to-latest-policy.test.cjs`

Expected: FAIL because `src/ai/aiScrollToLatestPolicy.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure policy**

Create `src/ai/aiScrollToLatestPolicy.ts`:

```ts
export const SCROLL_TO_LATEST_GESTURE_DISTANCE = 8;
export const SCROLL_TO_LATEST_REATTACH_OFFSET = 160;
export const SCROLL_TO_LATEST_SHOW_OFFSET = 200;

export type ScrollToLatestGestureDirection =
  | 'undetermined'
  | 'toward_latest'
  | 'away_from_latest';

export function resolveScrollToLatestGestureDirection(
  current: ScrollToLatestGestureDirection,
  verticalTouchDelta: number,
): ScrollToLatestGestureDirection {
  if (current !== 'undetermined') return current;
  if (verticalTouchDelta >= SCROLL_TO_LATEST_GESTURE_DISTANCE) return 'toward_latest';
  if (verticalTouchDelta <= -SCROLL_TO_LATEST_GESTURE_DISTANCE) return 'away_from_latest';
  return current;
}

export function shouldReattachToLatest(input: {
  direction: ScrollToLatestGestureDirection;
  offsetY: number;
}): boolean {
  return input.direction === 'toward_latest'
    && input.offsetY <= SCROLL_TO_LATEST_REATTACH_OFFSET;
}

export function shouldShowScrollToLatest(offsetY: number): boolean {
  return offsetY >= SCROLL_TO_LATEST_SHOW_OFFSET;
}
```

- [ ] **Step 4: Run the unit test and verify GREEN**

Run: `node --test tests/ai-scroll-to-latest-policy.test.cjs`

Expected: 4 tests PASS.

### Task 2: Chat-screen wiring without changing existing streaming thresholds

**Files:**
- Modify: `src/screens/AiChatScreen.tsx:1-25,199-203,1125-1145,2775-2787,2947-3005,4090-4165,6450-6505,6658-6662`
- Modify: `tests/ai-chat-fixes-policy.test.cjs:204-248`

- [ ] **Step 1: Update the integration policy test first**

Require the policy functions, four touch handlers, `generating={generating}`, unchanged 32/48/70 thresholds, and removal of the old 2400px constant:

```js
assert.match(chat, /shouldShowScrollToLatest/);
assert.match(chat, /shouldReattachToLatest/);
assert.match(chat, /resolveScrollToLatestGestureDirection/);
assert.match(chat, /onTouchStart=\{handleMessageTouchStart\}/);
assert.match(chat, /onTouchMove=\{handleMessageTouchMove\}/);
assert.match(chat, /onTouchEnd=\{resetMessageTouchGesture\}/);
assert.match(chat, /onTouchCancel=\{resetMessageTouchGesture\}/);
assert.match(chat, /generating=\{generating\}/);
assert.match(chat, /const MESSAGE_STREAM_FOLLOW_THRESHOLD = 48/);
assert.match(chat, /const MESSAGE_SAFE_FLUSH_OFFSET = 32/);
assert.match(chat, /const STICK_TO_BOTTOM_OFFSET_PX = 70/);
assert.doesNotMatch(chat, /MESSAGE_SCROLL_BUTTON_THRESHOLD = 2400/);
```

- [ ] **Step 2: Run the integration test and verify RED**

Run: `node --test tests/ai-chat-fixes-policy.test.cjs`

Expected: FAIL because the screen does not yet wire the new policy.

- [ ] **Step 3: Wire the policy into the existing screen**

- Import `NativeTouchEvent` and the policy functions/type.
- Remove only `MESSAGE_SCROLL_BUTTON_THRESHOLD = 2400`; keep 32/48/70 unchanged.
- Add refs for touch start Y and latched direction.
- On touch start, store `pageY` and reset direction to `undetermined`.
- On touch move, call `resolveScrollToLatestGestureDirection(current, pageY - startY)`.
- On touch end/cancel, reset only the new gesture refs.
- Use `shouldShowScrollToLatest(offsetY)` in both visibility paths.
- During active `onScroll`, call existing `followLatestMessage(false)` only when `shouldReattachToLatest` returns true, then return so the stale offset cannot re-show the button.
- Attach the four touch handlers to the existing `FlatList`.
- Pass `generating={generating}` to `AiScrollToLatestButton`.

Do not change `maintainVisibleContentPosition`, tail buffering, 32/48/70 thresholds, or other scroll handlers.

- [ ] **Step 4: Run policy and integration tests and verify GREEN**

Run: `node --test tests/ai-scroll-to-latest-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs`

Expected: all tests PASS.

### Task 3: 18px right-side button and continuous three-dot animation

**Files:**
- Modify: `src/components/ai/AiScrollToLatestButton.tsx`
- Modify: `src/design/tokens/metrics.ts`
- Modify: `tests/ai-chat-latency-final-acceptance-policy.test.cjs:35-58`

- [ ] **Step 1: Update the visual acceptance test first**

Replace the old BlurView/blue-arrow expectations with:

```js
assert.match(button, /generating: boolean/);
assert.match(button, /accessibilityLabel=\{generating \? 'AI 正在生成，回到最新' : '回到最新'\}/);
assert.match(button, /useReducedMotion/);
assert.match(button, /withRepeat/);
assert.match(button, /Math\.sin/);
assert.match(button, /metrics\.scrollToLatestVisualSize/);
assert.match(button, /metrics\.minTouchSize/);
assert.match(button, /right: spacing\[4\]/);
assert.match(button, /name="arrow-down"/);
assert.doesNotMatch(button, /BlurView/);
assert.doesNotMatch(button, />回到最新</);
```

- [ ] **Step 2: Run the visual acceptance test and verify RED**

Run: `node --test tests/ai-chat-latency-final-acceptance-policy.test.cjs`

Expected: FAIL because the current component is 48px, blurred, and has no generation state.

- [ ] **Step 3: Add the shared visual-size token**

Add `scrollToLatestVisualSize: 18` to `src/design/tokens/metrics.ts`.

- [ ] **Step 4: Implement the minimal animated component**

- Add `generating: boolean` to props.
- Keep the mounted fade lifecycle with an eased 150–180ms transition.
- Use a 44px `Pressable` aligned with `right: spacing[4]`.
- Center an 18px neutral surface inside the hit area and remove `BlurView`.
- Render a 12px ink arrow and three 2px dots.
- Drive shared phase `0 → 2π` with linear `withTiming` inside infinite `withRepeat`.
- Use phase-shifted `Math.sin` values for continuous translation of at most 2px and subtle opacity.
- Crossfade arrow and dots in roughly 140ms.
- Cancel the loop when generation stops or the component unmounts.
- Use `useReducedMotion()` to render static dots.
- Preserve dynamic accessibility labels and the invisible 44px hit area.

- [ ] **Step 5: Run visual and integration tests and verify GREEN**

Run: `node --test tests/ai-chat-latency-final-acceptance-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs tests/ai-scroll-to-latest-policy.test.cjs`

Expected: all tests PASS.

### Task 4: Feature inventory and full verification

**Files:**
- Modify: `docs/feature-matrix.md:70,91`

- [ ] **Step 1: Update the feature matrix**

Record the 18px right-side affordance, continuous three-dot generation state, 200px appearance threshold, and explicit-downward-only 160px reattach behavior.

- [ ] **Step 2: Run type checking**

Run: `pnpm typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run the focused tests**

Run: `node --test tests/ai-scroll-to-latest-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs tests/ai-chat-latency-final-acceptance-policy.test.cjs tests/ai-chat-streaming-tail-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-navigation-policy.test.cjs`

Expected: all focused tests PASS.

- [ ] **Step 4: Run the full suite**

Run: `pnpm test`

Expected: all tests PASS.

- [ ] **Step 5: Check the patch**

Run `git diff --check`, inspect `git status --short`, and review only:

```text
src/ai/aiScrollToLatestPolicy.ts
src/screens/AiChatScreen.tsx
src/components/ai/AiScrollToLatestButton.tsx
src/design/tokens/metrics.ts
tests/ai-scroll-to-latest-policy.test.cjs
tests/ai-chat-fixes-policy.test.cjs
tests/ai-chat-latency-final-acceptance-policy.test.cjs
docs/feature-matrix.md
```

Expected: no whitespace errors and no unrelated files in the feature diff.
