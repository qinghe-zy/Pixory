# AI Chat Navigation And Stability Polish Design

## Status

Approved design for implementation planning.

## Goal

Improve Pixory AI chat navigation and interaction stability before release. The work covers three related areas:

1. Chat history and generation stability fixes.
2. A new Claude-style AI comprehensive record drawer.
3. A compact attachment popover that replaces the current large bottom sheet.

The feature must keep Pixory Android-first, offline-first, local-only, and visually calm. It must not add cloud services, accounts, sync, or any new remote AI capability.

## User Problems

### History Archive And Restore

- The current history archive / restore interaction shows an extra exposed block behind a card during swipe, as seen in the provided Pixory screenshot.
- Archive and restore animation should feel closer to Gmail: finger-following swipe, clear threshold, smooth completion, and clean spring-back when cancelled.

### Chat Message Actions

- Editing an original user message and tapping send currently appears to do nothing.
- Tapping refresh / regenerate currently appears to do nothing.
- These actions need a real pending state, error feedback, and confirmed message update behavior.

### Streaming Cursor And Scroll Stability

- The streaming cursor is currently shown at the beginning of the next line instead of immediately after the generated text.
- Returning to the latest message must not cause repeated jitter.
- Streaming must not force-scroll when the user has intentionally scrolled upward.
- Streaming while the keyboard opens, while editing, or after leaving and returning to the chat must not cause list jumps.
- If generation is half complete and the user leaves the screen, existing generated content must remain when they return.
- If generation is still active after return, the UI must restore into a stable state without scroll jitter.

### Navigation Structure

- The AI chat page should use a two-line menu icon at the top-left instead of the current back button.
- The menu opens a new left-side drawer named the AI comprehensive record drawer. This is distinct from the existing `历史会话` page.
- The existing `历史会话` page remains available through the drawer.
- AI workbench should remove the current `最近继续` entry and recent-chat display.
- Recent chats should not be shown above the chat input.

### Attachment Picker

- The current add-attachment bottom sheet is too large for the small number of options.
- The new attachment picker should be a compact popover above the add button.
- It should use only icons, no text labels.
- Options should be horizontal and lightweight, similar in spirit to ChatGPT's attachment menu but scaled down for Pixory.

## Non-Goals

- Do not redesign the whole AI workbench.
- Do not remove the existing full `历史会话` page.
- Do not add Claude-style projects, artifacts, or paid upgrade concepts.
- Do not add web search, image generation, camera capture, or other new attachment capabilities unless they already exist in Pixory.
- Do not change provider selection, model routing, or AI prompt behavior except where needed to fix edit/regenerate actions.
- Do not implement release packaging in this work.

## Proposed Design

### 1. AI Comprehensive Record Drawer

Add a new left-side drawer surface opened from the AI chat top-left menu icon. It is a drawer overlay, not a normal full-screen page.

The drawer content order is fixed:

1. `新聊天`
2. `历史记录`
3. `最近`

`新聊天` starts a new normal AI chat in the active Pixory space. It should close the drawer and navigate to a clean normal chat.

`历史记录` opens the existing `AiHistoryScreen`. It should not duplicate archive/search/filter logic inside the drawer.

`最近` lists the latest 15 conversations in the active space. The list supports vertical scrolling inside the drawer. Each row opens the selected conversation and closes the drawer.

The drawer should feel like a Pixory-native interpretation of the Claude layout:

- left panel with rounded right corners or clean sheet edge;
- subtle right-side scrim;
- calm off-white surface;
- compact icon + label rows for primary actions;
- recent rows without large cards;
- no project/artifact entries in this version.

### 2. AI Chat Header Changes

Replace the current top-left back button in `AiChatScreen` with a two-line menu icon.

Behavior:

- Tapping the menu icon opens the comprehensive record drawer.
- Existing back behavior should remain available through Android system back and route stack handling where appropriate, but the visible chat-header control becomes the drawer entry.
- The right-side settings/model controls remain as they are unless they directly conflict with the drawer trigger.
- Recent-chat shortcuts must not appear above the composer.

### 3. AI Workbench Cleanup

Remove the `最近继续` section and recent-chat display from `AiHomeScreen`.

The workbench remains focused on primary AI entry points such as normal chat, IP chat, knowledge base, role library, and provider settings. Recent conversation recovery moves to the new drawer.

This avoids having recent chats duplicated in three places: workbench, composer area, and history.

### 4. History Archive / Restore Interaction

Keep the existing history page and archive/restore service methods, but redesign the row interaction.

Expected behavior:

- Swipe reveals only the intended archive/restore action area, with no extra exposed block.
- The action background width follows the swipe distance and is clipped to the row bounds.
- Crossing a threshold commits archive/restore.
- Releasing before the threshold springs the row back.
- Completed archive/restore animates smoothly out of the current list or updates in place depending on the active filter.
- Restoring from the archived filter uses the same interaction model, with restore icon/state.

The animation reference is Gmail's archive interaction, not a heavy custom animation.

### 5. Edit And Regenerate Reliability

Fix action paths in `AiChatScreen` and `aiChatService` so:

- editing a user message and pressing send calls the rewrite path exactly once;
- a pending/editing state prevents duplicate taps;
- on success, affected trailing messages are handled according to existing rewrite semantics;
- on failure, the original editable content remains visible and an error is shown;
- regenerate / refresh calls the regenerate path exactly once;
- regenerate shows an immediate pending/generating state;
- failures remain recoverable through the existing failed assistant bubble path.

The implementation should first identify why the current taps appear inert before changing UI. Avoid masking a service error with only a visual state.

### 6. Streaming Cursor

Move the streaming cursor rendering so it is inline with the final generated text, immediately after the last character.

Rules:

- Cursor should not render as a separate paragraph or next-line prefix.
- Empty assistant content can still show a waiting indicator before text exists.
- Once content exists, cursor belongs inside the text flow at the end of the visible assistant content.
- Cursor must work with the current lightweight markdown rendering. If markdown block boundaries make true inline placement unsafe, render an inline trailing cursor only for the final text node and avoid adding a block-level cursor.

### 7. Scroll And Keyboard Stability

Preserve the current inverted-list and Android `adjustResize` direction. Do not reintroduce JS keyboard bottom margins, forced `scrollToEnd`, or `onContentSizeChange` auto-scroll loops.

Scroll policy:

- If the user is already at latest, streaming may keep the latest content visible.
- If the user scrolls upward, streaming must not pull them back.
- `回到最新` scrolls once to latest and then stops.
- Opening the edit field or keyboard should not trigger repeated list corrections.
- Leaving and returning to a generating chat should hydrate persisted/generated content without resetting list position in a way that jitters.

Generation persistence:

- Existing partial assistant content should remain stored locally as it streams.
- Returning to the chat should show the latest persisted partial content.
- If the generation cannot continue after navigation, the UI should surface a recoverable stopped/failed state rather than silently losing text.
- If generation does continue, the list should follow the same "only auto-follow when already at latest" rule.

### 8. Compact Attachment Popover

Replace the large `添加附件` bottom sheet with a small popover anchored above the add button.

Options are horizontal icon-only buttons. Initial options:

- image upload;
- video upload;
- document upload.

Interaction:

- Tap add button to toggle the popover.
- Tap outside, choose an option, or navigate away to close.
- The popover appears above the add button and does not cover the composer.
- It should remain usable when the keyboard is open.
- The popover should not trigger chat-list jumps.

Accessibility:

- Even though the visual UI is icon-only, each button must have an accessibility label such as `上传图片`, `上传视频`, and `上传文档`.

## Data And State

No new database tables are required.

The drawer uses existing recent-thread query behavior from `listAiHistoryThreads`, with a limit of 15 and active Pixory space scoping.

The attachment popover uses existing attachment picker callbacks and should not introduce new file storage behavior. Existing import rules still apply: attachments copied or referenced only through current local-safe paths.

Edit/regenerate fixes may touch message state transitions, but should reuse existing `rewriteUserMessage`, `regenerateAssistantMessage`, message versioning, and local SQLite persistence.

## Suggested File Scope

Likely modified files:

- `src/screens/AiChatScreen.tsx`
- `src/screens/AiHistoryScreen.tsx`
- `src/screens/AiHomeScreen.tsx`
- `src/components/ai/AiChatComposer.tsx`
- `src/ai/aiChatService.ts`
- `App.tsx`
- `tests/ai-chat-fixes-policy.test.cjs`
- `tests/ai-navigation-policy.test.cjs`

Possible new file:

- `src/components/ai/AiComprehensiveRecordDrawer.tsx`

The final implementation plan should verify the exact component boundaries before editing.

## Testing Plan

Add or update policy tests for:

- AI chat header exposes a two-line drawer/menu entry instead of a visible back button.
- App route state can open the new comprehensive drawer from chat.
- Drawer exposes `新聊天`, `历史记录`, and `最近`.
- Drawer recent list is limited to 15.
- AI workbench no longer renders `最近继续`.
- Existing `ai-history` route remains registered.
- Composer attachment picker uses a compact anchored popover, icon-only visual labels, and accessibility labels.
- History archive/restore rows do not render the extra exposed block pattern.
- Edit-send path calls `rewriteUserMessage`.
- Regenerate path calls `regenerateAssistantMessage`.
- Streaming cursor is attached inline to assistant text.
- Existing no-jitter protections remain: no `keyboardBottomInset`, no forced `scrollToEnd`, no message-list `onContentSizeChange` auto-scroll.

Manual Android validation:

- Swipe archive and restore in normal and archived history filters.
- Confirm swipe follows finger and no extra background block appears.
- Edit an earlier user message and send; verify new assistant response starts.
- Tap regenerate / refresh; verify response regenerates.
- Watch streaming cursor placement on one-line and multi-line replies.
- During streaming, scroll upward and confirm the list does not pull back.
- Tap `回到最新` during and after streaming; confirm one smooth movement and no repeated jitter.
- During streaming, open editing / keyboard; confirm no list jump.
- Leave a generating chat and return; confirm partial content is preserved.
- Open the drawer from chat; start a new chat; open full history; open one recent chat.
- Confirm AI workbench has no `最近继续`.
- Open attachment popover with and without keyboard; choose image/video/document.

## Acceptance Criteria

- The drawer is the main chat-level navigation entry and uses the confirmed order: new chat, history, recent.
- Recent chat display is removed from the AI workbench and composer area.
- Existing full history page still works and is reachable.
- Archive/restore swipe has no visual extra block and feels Gmail-like.
- Edit-send and regenerate are functional and recoverable on failure.
- Streaming cursor appears at the end of current assistant text.
- Streaming, keyboard opening, returning to latest, and route leave/return do not create visible jitter.
- Attachment picker is compact, icon-only, horizontal, and anchored above the add button.
- All changes keep Pixory local-only and Android-first.

## Open Risks

- True inline cursor placement may be constrained by the current markdown renderer. If so, implementation should use a narrowly scoped final-text-node cursor rather than a block-level cursor.
- Continuing generation after route leave depends on current streaming lifecycle. If background continuation is not reliable, the acceptable first release behavior is to persist partial content and show a recoverable stopped/failed state.
- Drawer gestures and history row swipe gestures must not conflict with Android back gestures.
- Keyboard behavior must be verified on a real Android device because emulator and static tests cannot fully catch IME resize jitter.
