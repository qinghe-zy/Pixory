# Chat Message Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move chat message actions into a finger-anchored long-press menu while preserving distinct existing handlers, version navigation, latest-AI footer behavior, and no-avatar timestamps.

**Architecture:** Add a focused `AiMessageContextMenu` Modal with a pure positioning helper, plus a full-screen selectable-text Modal. `AiMessageBubble` reports long-press coordinates and separates action buttons from version controls. `AiChatScreen` owns menu state, builds role/status-specific items from the existing handlers, keeps the footer only for the latest visible AI message, and passes a time-only label into every menu.

**Tech Stack:** Expo React Native, TypeScript, `Modal`, `Pressable`, `Ionicons`, Safe Area Context, Node test runner.

---

### Task 1: Add failing policy and positioning tests

**Files:**
- Create: `tests/ai-message-context-menu-policy.test.cjs`
- Test: `src/components/ai/AiMessageContextMenu.tsx`
- Test: `src/components/ai/AiMessageBubble.tsx`
- Test: `src/screens/AiChatScreen.tsx`

- [ ] **Step 1: Write the failing tests**

Add tests that assert:

```js
const { resolveContextMenuPosition } = require('../src/components/ai/AiMessageContextMenu.tsx');

test('context menu opens below an upper-half finger point', () => {
  assert.deepEqual(
    resolveContextMenuPosition({
      anchorX: 180,
      anchorY: 240,
      menuWidth: 236,
      menuHeight: 208,
      screenWidth: 360,
      screenHeight: 800,
      topInset: 24,
      bottomInset: 24,
      gap: 5,
      margin: 12,
    }),
    { left: 62, top: 245 },
  );
});

test('context menu opens above a lower-half finger point', () => {
  const result = resolveContextMenuPosition({
    anchorX: 300,
    anchorY: 620,
    menuWidth: 236,
    menuHeight: 208,
    screenWidth: 360,
    screenHeight: 800,
    topInset: 24,
    bottomInset: 24,
    gap: 5,
    margin: 12,
  });
  assert.equal(result.top, 407);
  assert.equal(result.left, 112);
});
```

Also assert source policies:

- `AiMessageBubble` accepts a long-press callback and no longer renders a常驻 action button for every user/non-latest message.
- `AiChatScreen` passes `pageX/pageY`, keeps `继续生成` and `续答/回复` as separate handlers, and provides a context-menu time label when no avatar is shown.
- the chat list gap uses `spacing[2]`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/ai-message-context-menu-policy.test.cjs
```

Expected: FAIL because the context-menu module and long-press/action policies do not exist yet.

### Task 2: Implement finger-anchored context menu

**Files:**
- Create: `src/components/ai/AiMessageContextMenu.tsx`
- Test: `tests/ai-message-context-menu-policy.test.cjs`

- [ ] **Step 1: Add the pure placement helper**

Export:

```ts
export interface ContextMenuPositionInput {
  anchorX: number;
  anchorY: number;
  menuWidth: number;
  menuHeight: number;
  screenWidth: number;
  screenHeight: number;
  topInset: number;
  bottomInset: number;
  gap?: number;
  margin?: number;
}

export function resolveContextMenuPosition(input: ContextMenuPositionInput): { left: number; top: number } {
  const gap = input.gap ?? 5;
  const margin = input.margin ?? 12;
  const topBound = input.topInset + margin;
  const bottomBound = input.screenHeight - input.bottomInset - margin;
  const left = Math.min(
    Math.max(input.anchorX - input.menuWidth / 2, margin),
    input.screenWidth - input.menuWidth - margin,
  );
  const prefersBelow = input.anchorY < input.screenHeight / 2;
  const belowTop = input.anchorY + gap;
  const aboveTop = input.anchorY - input.menuHeight - gap;
  const preferredTop = prefersBelow ? belowTop : aboveTop;
  const alternateTop = prefersBelow ? aboveTop : belowTop;
  const fits = (top: number) => top >= topBound && top + input.menuHeight <= bottomBound;
  const unclampedTop = fits(preferredTop) ? preferredTop : fits(alternateTop) ? alternateTop : preferredTop;
  return {
    left,
    top: Math.min(Math.max(unclampedTop, topBound), Math.max(topBound, bottomBound - input.menuHeight)),
  };
}
```

This keeps the 5px finger gap whenever the preferred side has space, flips to the other side near a boundary, and clamps only as a last resort.

- [ ] **Step 2: Render the Modal menu**

Use `Modal transparent statusBarTranslucent animationType="fade"` with:

- a full-screen transparent `Pressable` backdrop that calls `onClose`;
- a measured menu shell (`width: 236`, `borderRadius: radius.xl`, white surface, light shadow);
- `Pressable` rows with `Ionicons`, label text, 52dp minimum row height, and hairline separators;
- a non-clickable time footer when `timeLabel` is provided;
- `onRequestClose={onClose}` for Android back;
- menu position derived from `useWindowDimensions()`, `useSafeAreaInsets()`, the pure helper, and the supplied `anchorX/anchorY`.

- [ ] **Step 3: Run placement tests**

Run:

```bash
node --test tests/ai-message-context-menu-policy.test.cjs
```

Expected: placement tests pass; source-policy assertions remain red until the screen and bubble wiring tasks are complete.

### Task 3: Add full-screen selectable text view

**Files:**
- Create: `src/components/ai/AiMessageTextSelectionModal.tsx`
- Test: `tests/ai-message-context-menu-policy.test.cjs`

- [ ] **Step 1: Implement the full-screen Modal**

Render a `Modal` with:

- `animationType="slide"`, `presentationStyle="fullScreen"`;
- a safe-area-aware header containing a close button and `选择文本` title;
- a `ScrollView` with the message’s visible plain content in `<Text selectable>`;
- the existing message text typography and AI light surface;
- no save action and no mutation of the message record.

- [ ] **Step 2: Add the selectable-text policy assertion**

Assert the component contains `Text selectable`, `ScrollView`, and an accessible close action. Run the focused test and confirm this assertion passes.

### Task 4: Refactor message bubble footer and long-press entry

**Files:**
- Modify: `src/components/ai/AiMessageBubble.tsx`
- Modify: `src/components/ai/AiStreamingTailMessageSegment.tsx` only if needed to suppress detached tail footers
- Test: `tests/ai-message-context-menu-policy.test.cjs`

- [ ] **Step 1: Add long-press and footer visibility props**

Add:

```ts
onLongPress?: (message: AiMessageWithCitations, event: GestureResponderEvent) => void;
showActionButtons?: boolean;
```

Wrap the rendered message bubble surface in a `Pressable` that forwards `event.nativeEvent.pageX/pageY`, with `delayLongPress={500}` and no `onPress`. Disable the long-press entry for generating, empty, or currently editing messages.

- [ ] **Step 2: Keep only the allowed footer**

Change `AiMessageFooterActions` so `showActionButtons={false}` renders no copy/favorite/continue/reply/edit/regenerate buttons and no time text, but still renders the version control when `message.versionTotal > 1`. Keep the existing action handlers and labels unchanged.

- [ ] **Step 3: Add tests for the split**

Assert:

- separate strings/handlers remain for `继续生成`, `续答`, `回复`, and `重新生成`;
- version control remains guarded by `message.versionTotal > 1`;
- no footer time is rendered when action buttons are hidden.

### Task 5: Wire role/status menu actions and latest-AI footer policy

**Files:**
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `src/components/ai/AiMessageBubble.tsx`
- Test: `tests/ai-message-context-menu-policy.test.cjs`

- [ ] **Step 1: Add screen state**

Add:

```ts
const [contextMenuTarget, setContextMenuTarget] = useState<{
  message: AiMessageWithCitations;
  anchorX: number;
  anchorY: number;
} | null>(null);
const [textSelectionTarget, setTextSelectionTarget] = useState<AiMessageWithCitations | null>(null);
```

- [ ] **Step 2: Build the menu item matrix**

For a user message return exactly: copy, select text, edit.

For an assistant message return:

- copy and select text;
- favorite or unfavorite;
- `继续生成` only when `canContinue` is true;
- `续答` or `回复` only when the existing completed-reply mode allows it;
- `重新生成` only when `canRegenerate` is true.

Each item closes the menu first and calls the existing handler without changing its business logic.

- [ ] **Step 3: Pass the menu time**

Build `timeLabel` for every message with `formatAiMessageMinute(message.completedAt ?? message.updatedAt ?? message.createdAt)`. Pass it to every context menu regardless of avatar visibility. Remove the old footer time rendering; the menu footer is always a non-clickable `HH:mm` row with no date.

- [ ] **Step 4: Decide latest AI footer**

Compute `latestVisibleMessageId = visibleMessages[visibleMessages.length - 1]?.id ?? null`. Pass `showActionButtons={message.role === 'assistant' && message.id === latestVisibleMessageId}`. Keep `versionTotal > 1` version controls for all messages, including users and non-latest assistants.

- [ ] **Step 5: Mount both Modals**

Mount `AiMessageContextMenu` and `AiMessageTextSelectionModal` once below the message list. The text modal receives the selected message content and closes back to the same chat state.

- [ ] **Step 6: Tighten message list rhythm**

Change `styles.messageScrollContent.gap` from `rhythm.listCardGap` to `spacing[2]` and add a policy assertion for the reduced gap.

### Task 6: Update documentation and verify

**Files:**
- Modify: `docs/feature-matrix.md`
- Modify: `docs/superpowers/plans/2026-07-29-chat-message-context-menu-implementation.md`

- [ ] **Step 1: Record the user-visible behavior**

Add a feature-matrix row documenting the role-specific long-press menu, finger-anchored 5px placement, selectable text Modal, latest-AI footer exception, version-only footer for other messages, and an always-visible time-only menu footer for both roles.

- [ ] **Step 2: Run focused verification**

```bash
node --test tests/ai-message-context-menu-policy.test.cjs tests/ai-chat-composer-safe-spacing-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs tests/ai-navigation-policy.test.cjs
pnpm typecheck
git diff --check
```

- [ ] **Step 3: Run the full suite**

```bash
pnpm test
```

Expected: all applicable tests pass with zero failures.

- [ ] **Step 4: Commit**

```bash
git add src/components/ai/AiMessageContextMenu.tsx src/components/ai/AiMessageTextSelectionModal.tsx src/components/ai/AiMessageBubble.tsx src/screens/AiChatScreen.tsx tests/ai-message-context-menu-policy.test.cjs docs/feature-matrix.md docs/superpowers/plans/2026-07-29-chat-message-context-menu-implementation.md
git commit -m "feat: add chat message context menus"
```
