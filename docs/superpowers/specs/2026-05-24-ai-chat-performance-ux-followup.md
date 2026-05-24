# Pixory AI Chat Performance And UX Follow-up Spec

Date: 2026-05-24

## Status

Approved follow-up scope, pending implementation.

This document replaces the completed AI memory upgrade execution specs from 2026-05-23 and 2026-05-24. Those historical implementation plans have been removed to avoid confusing future work. The current codebase already includes the mature memory system foundation; this spec only covers the remaining performance, reliability, and chat UX polish identified from:

- `report/ai_performance_report.md`
- `report/ux_gap_report.md`

## Goal

Improve long-chat performance, memory-query efficiency, error recovery, and daily chat polish without changing Pixory AI chat into a heavy professional tool.

Pixory AI remains:

- Android-first.
- Local-first.
- Daily-chat friendly.
- Light/Claude-style according to `design.md`.
- Conservative with layout height, palette, and existing action structure.

## Already Done

These items are considered implemented and should not be rebuilt in this follow-up:

- Deep memory is opt-in and defaults off.
- Ordinary chat uses recent completed context and does not require deep memory.
- Latest short-term context is 30 completed non-system messages.
- Memory Board exists and shows long-term memory, user profile, summary segments, and maintenance status.
- Memory capture notice exists with manage, undo, edit, and inaccurate handling.
- Unified memory maintenance queue exists.
- FTS tables exist for messages and memories.
- Remote memory maintenance failure falls back locally and is visible in status.
- Chat thinking timer shows `正在思考中... X.X秒` and `思考完成 X.X秒`.
- Composer supports multiline auto-height with a six-line cap.
- Voice input uses Android speech recognition and keeps the mic visible.
- Inline rewrite edits the original user bubble.
- Message version history exists for edits and regenerations.
- Assistant markdown rendering and code-block copy exist.
- Reply preference exists in session settings.
- Session settings keyboard avoidance is implemented.
- Video long-press speed-up no longer reveals controls.

## In Scope

### 1. Database And Memory Performance

Fix low-risk database inefficiencies that can affect long conversations.

Requirements:

- Make `incrementPendingMemoryTurn` atomic:
  - Replace read-then-write with SQL self-increment.
  - Avoid losing increments under rapid maintenance triggers.
- Add a normalized-content de-duplication index:
  - Cover `space`, `scope`, `scopeId`, `normalizedContent`, and `status`.
  - Keep migration additive.
- Fix `touchMemories` timestamp consistency:
  - Use one `now` value for `lastUsedAt` and `updatedAt`.
- Bound memory board queries:
  - Add repository-level `limit` and optional `offset` or cursor.
  - Prompt-building paths must not pull unlimited memory rows.
  - Memory Board may load an initial page and then load more.
- Reduce prompt construction duplicate DB reads:
  - Read deep-memory settings once per prompt build.
  - Reuse scoped memory candidates where practical.
  - Avoid reading stable and dynamic memories through two unrelated full scans.
- Improve Chinese context-budget estimation:
  - Use a more conservative character/token heuristic for Chinese-heavy text.
  - Preserve current user message, role/system instructions, and source facts.

Acceptance:

- Long-chat prompt build does not require unbounded memory-table reads.
- Rapid reply completion does not lose pending memory turn increments.
- `findActiveMemoryByNormalizedContent` can use the new index.
- `touchMemories` writes matching `lastUsedAt` and `updatedAt`.
- Existing migrations remain additive and existing databases upgrade safely.

### 2. Long Chat Rendering Performance

Reduce unnecessary rerendering during streaming and long-list use.

Requirements:

- Memoize `AiMessageBubble`.
- Stabilize `FlatList.renderItem` with `useCallback`.
- Stabilize message action callbacks with `useCallback` where needed.
- Precompute date separator flags instead of checking the whole visible list in every item render.
- Keep current message bubble sizing, action row layout, colors, and six-line composer behavior.
- Keep loading earlier messages stable and avoid scroll jumps.

Acceptance:

- During streaming, unchanged historical bubbles do not rerender just because the current assistant delta changed.
- 200+ message conversations remain scrollable while streaming.
- Loading older messages keeps the viewport anchored.
- Keyboard show/hide does not fight with forced scroll-to-bottom behavior.

### 3. Chat Generation Feedback And Recovery

Make generation states and failures clearer without adding heavy UI.

Requirements:

- Add a lightweight typing indicator for the first-token waiting phase.
- Add a subtle blinking streaming cursor for assistant output.
- Keep thinking timer precision unchanged.
- Add retry inside failed assistant bubbles when the failure is recoverable.
- Normalize common errors into readable Chinese:
  - API key invalid or missing.
  - quota, balance, or rate limit.
  - model unavailable.
  - network timeout or connection failure.
  - generic unknown error.
- Preserve partial generated text after final failure.
- Show a low-key context-trim notice when older context was trimmed by count or budget.

Acceptance:

- User can distinguish "waiting for first token" from a stuck UI.
- Failed assistant messages show a local retry affordance.
- Error text is readable by non-technical users.
- Partial content is not cleared by a final stream failure.
- Context trimming is visible but does not interrupt daily chat.

### 4. Message Reading And Microinteractions

Improve message readability without changing the main chat structure.

Requirements:

- Make user and assistant body text selectable where React Native supports it.
- Add Markdown horizontal rule support.
- Add lightweight nested-list rendering support when practical.
- Add smooth expand/collapse animation for `AiThinkingBlock`.
- Deduplicate assistant avatars:
  - Consecutive assistant messages show the avatar only on the first assistant message in that run.
  - If a user message appears between assistant messages, the next assistant message shows the avatar again.
- Do not hide message action buttons behind long-press.
- Do not change action row order.

Acceptance:

- Users can copy part of a message body.
- HR and simple nested lists render without breaking existing markdown.
- Thinking expand/collapse feels smooth and does not cause severe list jumping.
- Consecutive assistant messages have less repeated avatar noise.

### 5. History Screen Interaction

Improve history interactions while skipping empty-state work.

Requirements:

- Add 300ms debounce for history search.
- Preserve existing filters and normal/personal space scoping.
- Improve time grouping:
  - Today.
  - Yesterday.
  - Past 7 days.
  - Past 30 days.
  - Month groups for older records.
- Replace instant swipe-state jumps with an animated swipe-to-archive interaction:
  - Row follows finger movement.
  - Release snaps open or closed.
  - Existing archive/restore action remains.
- Do not add or redesign empty states in this follow-up.

Acceptance:

- Typing in history search does not trigger a DB query per keystroke.
- Older conversations are grouped more usefully than one large "更早" bucket.
- Swipe-to-archive feels continuous instead of snapping abruptly.
- Batch selection, delete, move, rename, archive, and restore still work.

### 6. Session Settings Consistency

Reduce confusion around save behavior without changing the page into a complex settings console.

Requirements:

- Clarify which settings autosave:
  - reply preference
  - material boundary mode
  - deep memory switch
- Role instruction remains explicit save or blur-save; do not save every keystroke.
- If both manual save buttons remain, labels must clearly describe what they save.
- Keep dangerous delete visually separated from save/start actions.
- Keep existing keyboard avoidance.

Acceptance:

- Users are not left thinking role instruction was saved when it was not.
- Lightweight setting changes still persist without extra confirmation.
- Delete action remains clearly separate.

### 7. Memory Board Deletion And Labels

Make memory management safer and easier to understand.

Requirements:

- Deleting memory or summary must have either:
  - confirmation dialog, or
  - undo feedback after soft delete.
- Convert raw importance/confidence numbers to user-facing labels:
  - Example: `较重要 · 自动判断较可信`.
- Keep edit/delete/manual add behavior.
- Keep current AI light style and token spacing.

Acceptance:

- Accidental memory deletion can be prevented or immediately undone.
- Users no longer see unexplained numeric importance/confidence values.
- Deleted memory and deleted summary still do not enter prompt.

### 8. Time Formatting Cleanup

Unify AI time formatting.

Requirements:

- Add or reuse a shared utility for AI chat/history/memory times.
- Keep message action-row time compact as `HH:mm`.
- Keep history/home recent rows minute-precision.
- Keep memory maintenance times full enough to identify date and minute.

Acceptance:

- AI screens no longer duplicate ad-hoc date formatting logic.
- Existing visible time precision does not regress.

## Out Of Scope

Do not implement in this follow-up:

- Empty-state redesigns or new empty-state CTAs.
- Composer expansion beyond six visible lines.
- Hiding message action buttons by default.
- Citation bottom sheet preview.
- Homepage suggested prompt cards.
- Large attachment preview redesign.
- Complex attachment count limits.
- Real-time voice waveform animation.
- Full message branch tree.
- Code syntax highlighting.
- Markdown image rendering.
- Prompt template library.
- Any server, account, sync, or cloud storage feature.

## Implementation Plan

### Phase 1: Low-Risk Performance Fixes

Files likely involved:

- `src/ai/aiMemoryService.ts`
- `src/ai/aiChatService.ts`
- `src/ai/aiContextBudget.ts`
- `src/database/schema.ts`
- `src/database/db.ts`
- `src/database/repositories/aiThreadRepository.ts`
- `tests/ai-chat-fixes-policy.test.cjs`
- `tests/ai-schema-policy.test.cjs`
- `tests/ai-rag-policy.test.cjs`

Tasks:

1. Add failing tests for atomic pending turn increment, normalized-content index, one-timestamp touch, bounded memory board query, and conservative budget estimation.
2. Implement DB migration and repository/service changes.
3. Refactor prompt build only enough to remove repeated settings reads and obvious duplicate memory scans.
4. Run focused tests, then full test suite.

### Phase 2: Long-Chat Render Stability

Files likely involved:

- `src/screens/AiChatScreen.tsx`
- `src/components/ai/AiMessageBubble.tsx`
- `tests/ai-chat-fixes-policy.test.cjs`
- `tests/ai-navigation-policy.test.cjs`

Tasks:

1. Add tests for memoized bubble, stable render item, precomputed date separator data, and avatar dedupe.
2. Memoize message bubble and stabilize callbacks.
3. Precompute list presentation data.
4. Validate loading earlier messages, keyboard behavior, version switching, rewrite, and regenerate.

### Phase 3: Generation Feedback

Files likely involved:

- `src/components/ai/AiMessageBubble.tsx`
- `src/components/ai/AiThinkingBlock.tsx`
- `src/components/ai/AiTypingIndicator.tsx`
- `src/components/ai/AiChatErrorBanner.tsx`
- `src/screens/AiChatScreen.tsx`
- `src/ai/aiChatService.ts`
- `tests/ai-chat-fixes-policy.test.cjs`
- `tests/ai-final-acceptance-policy.test.cjs`

Tasks:

1. Add typing indicator for first-token waiting.
2. Add blinking streaming cursor.
3. Add failed-bubble retry action and error normalization.
4. Add context-trim notice.
5. Add thinking expand/collapse animation.

### Phase 4: History And Settings Polish

Files likely involved:

- `src/screens/AiHistoryScreen.tsx`
- `src/screens/AiSessionConfigScreen.tsx`
- `src/utils/formatters.ts`
- `src/utils/aiTimeFormatters.ts`
- `tests/ai-navigation-policy.test.cjs`
- `tests/ai-final-acceptance-policy.test.cjs`

Tasks:

1. Add search debounce.
2. Add animated swipe-to-archive.
3. Improve history grouping.
4. Clarify session setting save behavior.
5. Centralize AI time formatting.

### Phase 5: Memory Board Safety

Files likely involved:

- `src/screens/AiMemoryBoardScreen.tsx`
- `src/ai/aiMemoryService.ts`
- `tests/ai-final-acceptance-policy.test.cjs`

Tasks:

1. Add delete confirmation or undo.
2. Replace raw importance/confidence numbers with labels.
3. Confirm summary deletion and memory deletion still stop prompt injection.

### Phase 6: Final Verification

Commands:

```powershell
pnpm typecheck
pnpm test
git diff --check
D:\Develop\Android\Sdk\platform-tools\adb.exe devices
```

Android manual acceptance:

1. Open a 200+ message AI thread and send a new message.
2. Confirm first-token wait, streaming, keyboard, and scroll behavior are stable.
3. Load earlier messages and confirm the viewport does not jump.
4. Trigger a failed response and confirm retry plus readable error.
5. Enable deep memory and confirm Memory Board still loads quickly.
6. Delete a memory or summary and confirm confirmation/undo plus non-injection behavior.
7. Use history search quickly and confirm debounce behavior.
8. Swipe history rows and confirm animated archive/restore behavior.
9. Expand/collapse thinking content and confirm smooth animation.
10. Confirm consecutive assistant avatars are deduplicated.

## Test Requirements

Automated tests should cover:

- Atomic pending turn increment.
- Normalized-content index exists.
- `touchMemories` single timestamp.
- Memory board query supports limit.
- Prompt build avoids repeated deep-memory settings reads.
- Chinese token estimate is conservative.
- `AiMessageBubble` memoization and stable render item.
- Avatar dedupe rule.
- Typing indicator and blinking cursor wiring.
- Failed bubble retry.
- Error normalization categories.
- Context trim notice.
- Selectable message body.
- Markdown HR support.
- Thinking animation wiring.
- History search debounce.
- History grouping labels.
- Animated swipe archive wiring.
- Session setting save semantics.
- Memory deletion confirmation/undo.
- User-facing importance/confidence labels.
- Shared AI time formatter usage.

Manual tests should cover:

- Long conversation scrolling and streaming on Android.
- Keyboard show/hide while latest message is visible.
- Loading older messages with mixed markdown/code heights.
- Memory Board with many memories.
- History search and swipe on Android.
- Failure retry path with a forced API/provider error.

## Risks And Constraints

- Memoization only helps if callbacks and item data are stable; avoid partial memo work that gives a false sense of improvement.
- Animated history swipe must not break long-press selection.
- Thinking animation must avoid expensive layout measurement for every list item.
- Context-trim notice should be subtle; it must not make daily chat feel like a professional dashboard.
- Database migrations must stay additive and must not rewrite existing user data.
- Do not touch release versioning or packaging in this follow-up unless the user explicitly asks to package.
