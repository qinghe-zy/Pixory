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

- [x] **Step 1: Write the failing tests**

The project Node runner does not transpile TSX. The implemented regression test
therefore follows the repository's existing source-policy style and asserts the
placement formulas in `aiMessageContextMenuPosition.ts`, while TypeScript checks
the runtime module.

Also assert source policies:

- `AiMessageBubble` accepts a long-press callback and no longer renders a常驻 action button for every user/non-latest message.
- `AiChatScreen` passes `pageX/pageY`, keeps `继续生成` and `续答/回复` as separate handlers, and provides a context-menu time label when no avatar is shown.
- the chat list gap uses `spacing[2]`.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/ai-message-context-menu-policy.test.cjs
```

Expected: FAIL because the context-menu module and long-press/action policies do not exist yet.

### Task 2: Implement finger-anchored context menu

**Files:**
- Create: `src/components/ai/AiMessageContextMenu.tsx`
- Test: `tests/ai-message-context-menu-policy.test.cjs`

- [x] **Step 1: Add the pure placement helper**

Implemented in `src/components/ai/aiMessageContextMenuPosition.ts`. The helper
opens below an upper-half finger point and above a lower-half point with a `5px`
gap, horizontally centers on the finger, and clamps only when the measured menu
would cross a safe-area or viewport edge.

- [x] **Step 2: Render the Modal menu**

Use `Modal transparent statusBarTranslucent animationType="fade"` with:

- a full-screen transparent `Pressable` backdrop that calls `onClose`;
- a measured compact menu shell (`minWidth: 190`, `borderRadius: radius.md`, white surface, light shadow);
- `Pressable` rows with `Ionicons`, label text, the shared 44dp touch target, and hairline separators;
- a non-clickable time footer when `timeLabel` is provided;
- `onRequestClose={onClose}` for Android back;
- menu position derived from `useWindowDimensions()`, `useSafeAreaInsets()`, the pure helper, and the supplied `anchorX/anchorY`.

- [x] **Step 3: Run placement tests**

Run:

```bash
node --test tests/ai-message-context-menu-policy.test.cjs
```

Expected: placement tests pass; source-policy assertions remain red until the screen and bubble wiring tasks are complete.

### Task 3: Add full-screen selectable text view

**Files:**
- Create: `src/components/ai/AiMessageTextSelectionModal.tsx`
- Test: `tests/ai-message-context-menu-policy.test.cjs`

- [x] **Step 1: Implement the full-screen Modal**

Render a `Modal` with:

- `animationType="slide"`, `presentationStyle="fullScreen"`;
- a safe-area-aware header containing a close button and `选择文本` title;
- a `ScrollView` with the message’s visible plain content in `<Text selectable>`;
- the existing message text typography and AI light surface;
- no save action and no mutation of the message record.

- [x] **Step 2: Add the selectable-text policy assertion**

Assert the component contains `Text selectable`, `ScrollView`, and an accessible close action. Run the focused test and confirm this assertion passes.

### Task 4: Refactor message bubble footer and long-press entry

**Files:**
- Modify: `src/components/ai/AiMessageBubble.tsx`
- Modify: `src/components/ai/AiStreamingTailMessageSegment.tsx` only if needed to suppress detached tail footers
- Test: `tests/ai-message-context-menu-policy.test.cjs`

- [x] **Step 1: Add long-press and footer visibility props**

Add:

```ts
onLongPress?: (message: AiMessageWithCitations, pageX: number, pageY: number) => void;
showActionButtons?: boolean;
```

Wrap the rendered message bubble surface in a `Pressable` that forwards
`event.nativeEvent.pageX/pageY`, with `delayLongPress={500}` and no `onPress`.
Disable it only while the message is being edited; a generating assistant message
can still expose copy/select-text for already visible content while generation-only
actions remain disabled.

- [x] **Step 2: Keep only the allowed footer**

Change `AiMessageFooterActions` so `showActionButtons={false}` renders no copy/favorite/continue/reply/edit/regenerate buttons and no time text, but still renders the version control when `message.versionTotal > 1`. Keep the existing action handlers and labels unchanged.

- [x] **Step 3: Add tests for the split**

Assert:

- separate strings/handlers remain for `继续生成`, `续答`, `回复`, and `重新生成`;
- version control remains guarded by `message.versionTotal > 1`;
- no footer time is rendered when action buttons are hidden.

### Task 5: Wire role/status menu actions and latest-AI footer policy

**Files:**
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `src/components/ai/AiMessageBubble.tsx`
- Test: `tests/ai-message-context-menu-policy.test.cjs`

- [x] **Step 1: Add screen state**

Add:

```ts
const [messageContextMenuState, setMessageContextMenuState] = useState<{
  messageId: string;
  anchorX: number;
  anchorY: number;
} | null>(null);
const [messageTextSelectionContent, setMessageTextSelectionContent] =
  useState<string | null>(null);
```

- [x] **Step 2: Build the menu item matrix**

For a user message return exactly: copy, select text, edit.

For an assistant message return:

- copy and select text;
- favorite or unfavorite;
- `继续生成`, `续答`/`回复`, and `重新生成` remain separate rows and are
  disabled when their existing eligibility conditions are false;

Each item closes the menu first and calls the existing handler without changing its business logic.

- [x] **Step 3: Pass the menu time**

Build `timeLabel` for every message with `formatAiMessageMinute(message.completedAt ?? message.updatedAt ?? message.createdAt)`. Pass it to every context menu regardless of avatar visibility. Remove the old footer time rendering; the menu footer is always a non-clickable `HH:mm` row with no date.

- [x] **Step 4: Decide latest AI footer**

Compute `latestVisibleMessageId = visibleMessages[visibleMessages.length - 1]?.id ?? null`. Pass `showActionButtons={message.role === 'assistant' && message.id === latestVisibleMessageId}`. Keep `versionTotal > 1` version controls for all messages, including users and non-latest assistants.

- [x] **Step 5: Mount both Modals**

Mount `AiMessageContextMenu` and `AiMessageTextSelectionModal` once below the message list. The text modal receives the selected message content and closes back to the same chat state.

- [x] **Step 6: Tighten message list rhythm**

Change `styles.messageScrollContent.gap` from `rhythm.listCardGap` to `spacing[2]` and add a policy assertion for the reduced gap.

### Task 6: Update documentation and verify

**Files:**
- Modify: `docs/feature-matrix.md`
- Modify: `docs/superpowers/plans/2026-07-29-chat-message-context-menu-implementation.md`

- [x] **Step 1: Record the user-visible behavior**

Add a feature-matrix row documenting the role-specific long-press menu, finger-anchored 5px placement, selectable text Modal, latest-AI footer exception, version-only footer for other messages, and an always-visible time-only menu footer for both roles.

- [x] **Step 2: Run focused verification**

```bash
node --test tests/ai-message-context-menu-policy.test.cjs tests/ai-chat-composer-safe-spacing-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs tests/ai-navigation-policy.test.cjs
pnpm typecheck
git diff --check
```

- [x] **Step 3: Run the full suite**

```bash
pnpm test
```

Expected: all applicable tests pass with zero failures.

- [x] **Step 4: Commit**

```bash
git add src/components/ai/AiMessageContextMenu.tsx src/components/ai/AiMessageTextSelectionModal.tsx src/components/ai/AiMessageBubble.tsx src/screens/AiChatScreen.tsx tests/ai-message-context-menu-policy.test.cjs docs/feature-matrix.md docs/superpowers/plans/2026-07-29-chat-message-context-menu-implementation.md
git commit -m "feat: add chat message context menus"
```
