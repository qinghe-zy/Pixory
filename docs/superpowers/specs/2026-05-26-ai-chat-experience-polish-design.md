# AI Chat Experience Polish Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan after this spec is approved.

**Goal:** Polish the AI chat page so first-run, streaming, markdown image, Android keyboard, and thousand-plus-message long-chat behavior feel closer to Claude/ChatGPT: quiet, smooth, stable, and local-first.

**Architecture:** Keep the existing AI chat screen and message renderer. Make targeted changes in the current components and repository layer: `AiThinkingBlock` for native opacity animation and lower-frequency timing, `AiChatScreen` for first-message greeting, Android keyboard behavior, FlatList memory controls, guarded scroll state, and dynamic scroll affordance placement, `AiMessageContent` for memoized markdown and image rendering, `AiMessageBubble` for timeout cleanup, and `aiThreadRepository` for chunked message-version/citation queries.

**Tech Stack:** Expo, React Native, TypeScript, SQLite/local-only data model, existing Pixory design tokens, existing AI light theme.

---

## Current Findings

- `src/components/ai/AiThinkingBlock.tsx` animates `expandedProgress` with `useNativeDriver: false` even though only `opacity` is animated.
- `src/screens/AiChatScreen.tsx` renders an inverted `FlatList` without a first-message greeting or lightweight starter hints.
- `src/components/ai/AiMessageContent.tsx` parses `[text](https://...)` links but not `![alt](url)` image markdown.
- `src/screens/AiChatScreen.tsx` wraps the chat layout in `KeyboardAvoidingView behavior="height"` on Android, while `android/app/src/main/AndroidManifest.xml` already uses `windowSoftInputMode="adjustResize"` for `MainActivity`.
- `src/components/ai/AiThinkingBlock.tsx` updates elapsed thinking time every `100ms`, which adds avoidable React updates while a reply is streaming.
- `src/components/ai/AiMessageContent.tsx` reparses markdown on every render, including feedback-only state changes such as code-copy success.
- `src/components/ai/AiMessageContent.tsx`, `src/components/ai/AiMessageBubble.tsx`, and the voice-cancel path in `src/screens/AiChatScreen.tsx` use one-shot timers that should be cleaned up on unmount.
- `src/screens/AiChatScreen.tsx` can call `setLatestVisible` on every scroll event even when the boolean value has not changed.
- `src/screens/AiChatScreen.tsx` uses copied `reverse()` scans to find latest assistant state. Remove these scans while touching the chat render path.
- `src/components/ai/AiScrollToLatestButton.tsx` positions itself with a fixed bottom offset, so it can drift when the composer grows because of multi-line input or attachments.
- `src/database/repositories/aiThreadRepository.ts` loads message versions and citations with a single `IN (${makeInClause(messageIds)})` query. When a user pages into 1000+ visible messages, SQLite can exceed the binding-variable limit and throw.
- `src/screens/AiChatScreen.tsx` leaves FlatList virtualization at defaults. For thousand-message histories with markdown-heavy bubbles, default resident windows can keep too many complex rows mounted and cause memory spikes or UI freezes.

## Experience Direction

The target is Claude-like calm rather than a product empty-state card.

The first blank chat should not show a card, illustration, or large explanatory block. It should show a single quiet greeting in the message area, plus a small row of faint starter chips. Once the user sends the first message, the greeting disappears.

The public Claude mobile reference uses a time-aware greeting such as `How can I help you this evening` and a simple input placeholder such as `Chat with Claude`. Pixory should keep its own identity and use Chinese time-aware greeting text in the message area only.

## First-Message Greeting

### Copy

Show exactly one of these greetings based on local time:

- Morning: `今天想聊点什么？`
- Afternoon: `现在想聊点什么？`
- Evening/night: `今晚想聊点什么？`

Do not put these strings in the composer placeholder. The composer placeholder must remain the existing Pixory behavior in this pass.

### Visibility

Show the greeting only when the visible message list is empty.

Hide it immediately after the first user message is added locally, before waiting for the assistant response.

Do not show it in a conversation that has historical messages, failed messages, stopped messages, or loaded earlier messages.

### Typography

The greeting should visually approximate Claude's large calm prompt:

- Use the existing AI light display font path rather than adding a new font dependency.
- Use a large but not heroic size: `28`.
- Use regular weight: `400`.
- Use relaxed line height: `36`.
- Use zero letter spacing.
- Use `aiLightColors.ink` with reduced visual intensity through text opacity, for example `opacity: 0.78`.

The greeting should sit slightly above the composer side of the empty message area, not at the top of the screen. It should feel like a prompt in open space, not a card header.

## Starter Suggestions

Starter suggestions are allowed, but they must be visually faint.

Suggested initial chip text:

- `整理这段资料`
- `帮我发散想法`
- `总结当前设定`

Rules:

- No card container.
- No icon-heavy treatment.
- No filled high-contrast buttons.
- Use caption/body-small typography.
- Use transparent or nearly transparent background with a subtle hairline border.
- Tapping a suggestion fills the composer text. It must not auto-send.
- Suggestions disappear together with the greeting once the conversation has any message.

## Thinking Animation

`AiThinkingBlock` should keep the existing expand/collapse behavior, but opacity animation must use the native driver:

- Keep `Animated.Value` and `Animated.timing`.
- Set `useNativeDriver: true` for `expandedProgress`.
- Do not add height, maxHeight, padding, or layout animations to this same native-driven value.
- Keep the detail body mounted behavior minimal so the change is low risk during streaming.

This avoids putting a purely opacity-based animation on the JS thread while streaming markdown parsing and React updates are active.

The elapsed-time display should also stop updating at `100ms` cadence. Use a `500ms` interval while thinking is active. Keep the current one-decimal label format, but do not force ten React updates per second for every active thinking block.

## Markdown Image Rendering

`AiMessageContent` should treat image markdown as a first-class inline/block element instead of rendering a stray `!` and a normal link.

Supported syntax:

- `![alt](https://example.com/image.png)`
- `![alt](file:///...)`
- `![alt](content://...)` only if React Native image loading already accepts the URI in this environment.

Rendering:

- Use React Native `Image` or the project's existing safe image path if suitable.
- Render a rounded image preview inside assistant messages.
- Preserve the `alt` text as a small caption when present.
- Keep dimensions stable with a max width and aspect-ratio or fixed preview height, so streaming text does not cause violent layout shifts.
- On load failure, show a quiet fallback row with the alt text or `图片无法预览`.

Interaction:

- Do not kick the user to the browser by default for image markdown.
- Do not add a press action for image markdown in this pass. Render the image preview in place; internal full-screen preview is outside this spec.

Security and locality:

- Keep existing safe-link behavior for normal links.
- Do not introduce network fetching logic beyond React Native image rendering of the provided URI.
- Do not add cloud or backend behavior.

## Markdown Render Cost

`AiMessageContent` should memoize parsed markdown blocks by `content`.

Rules:

- Use `useMemo(() => parseMarkdownBlocks(content), [content])`.
- Feedback state changes such as copy-success banners must not re-run markdown block parsing.
- Image markdown parsing should integrate with the same block/inline render path rather than adding a second full parse pass.
- Keep the parser local and dependency-free in this pass.

## Android Keyboard Behavior

For Android, remove the extra `KeyboardAvoidingView behavior="height"` from the chat screen path and rely on the existing `adjustResize`.

The goal is to avoid double resize with an inverted `FlatList`.

Expected behavior:

- Android: chat layout uses normal `View` sizing under `adjustResize`.
- iOS: no behavior regression should be introduced. If the existing wrapper is removed globally, verify composer visibility manually or keep an iOS-only wrapper only if needed.
- The inverted list should remain pinned to offset zero and keep the existing no-jitter scroll policy.

## Scroll and Long-Chat Smoothness

The chat list should keep the current inverted-list strategy, but avoid avoidable React work during scroll and streaming. Pixory should support thousand-plus-message local conversations without SQLite variable-limit crashes or runaway resident row memory.

### SQLite Attached Data Chunking

Repository methods that hydrate message attachments must chunk large message-id inputs.

Required methods:

- `aiThreadRepository.listMessageVersionsForMessages`
- `aiThreadRepository.listCitationsForMessages`

Implementation direction:

- Reuse `DELETE_MESSAGE_CHUNK_SIZE = 200` or introduce a nearby `MESSAGE_LOOKUP_CHUNK_SIZE = 200`.
- For each chunk, run the existing ordered query with `IN (${makeInClause(chunk)})`.
- Append rows into one array.
- Preserve existing grouping output: `Record<string, AiMessageVersionRecord[]>` and `Record<string, AiCitationRecord[]>`.
- Preserve deterministic order inside each message group by keeping SQL `ORDER BY originalMessageId ASC, versionIndex ASC` for versions and `ORDER BY messageId ASC, createdAt ASC` for citations.
- Do not silently drop ids, versions, or citations when chunking.

Tests should fail if either method still uses `makeInClause(messageIds)` directly.

### FlatList Memory Controls

The chat FlatList must set conservative virtualization props for long histories.

Required props:

```tsx
initialNumToRender={10}
maxToRenderPerBatch={8}
windowSize={11}
removeClippedSubviews={Platform.OS === 'android'}
```

Rationale:

- `initialNumToRender={10}` keeps cold render bounded.
- `maxToRenderPerBatch={8}` avoids large JS render batches while scrolling.
- `windowSize={11}` reduces mounted offscreen rows compared with the default window.
- `removeClippedSubviews={Platform.OS === 'android'}` lets Android aggressively detach offscreen native views while avoiding iOS clipping surprises.

These props must be applied to the existing inverted `FlatList`, not a replacement list component.

### Latest Visibility Guard

`handleMessageScroll` should update `latestVisible` only when the computed value changes.

Implementation direction:

- Add a `latestVisibleRef`.
- Compute `nextLatestVisible` from `contentOffset.y <= MESSAGE_BOTTOM_LOCK_THRESHOLD`.
- Only call `setLatestVisible(nextLatestVisible)` when `latestVisibleRef.current !== nextLatestVisible`.

### Latest Assistant Lookup

Avoid copied-array `reverse()` scans for latest assistant lookup.

Implementation direction:

- Replace `[...messages].reverse().find(...)` and `[...visibleMessages].reverse().find(...)` with a tiny helper that scans from the end.
- Keep the helper local to `AiChatScreen`.

### Scroll-To-Latest Button Placement

`AiScrollToLatestButton` should not rely on a fixed bottom offset that assumes one composer height.

Implementation direction:

- Track composer panel height in `AiChatScreen` with `onLayout`.
- Pass a numeric bottom offset into `AiScrollToLatestButton`.
- Place the button above the current composer height plus a small tokenized gap.
- Keep the visual style quiet and compact; do not redesign the button.

## Timer Cleanup

One-shot UI timers should be cleaned up on unmount.

Required cleanup:

- Code-copy feedback timer in `AiMessageContent`.
- Message-copy feedback timer in `AiMessageBubble`.
- Voice-cancel reset timer in `AiChatScreen`.

Implementation direction:

- Store timeout handles in refs.
- Clear existing timeout before setting a new one.
- Clear timeout refs in component unmount effects.

## Tests and Verification

Add policy/regression coverage that checks:

- `AiThinkingBlock` uses `useNativeDriver: true` for `expandedProgress`.
- `AiChatScreen` exposes a lightweight starter greeting via `ListEmptyComponent` or equivalent empty-list rendering.
- Greeting copy includes the three approved Chinese time-aware strings.
- Greeting suggestions fill composer text and do not directly call send.
- `AiMessageContent` parses and renders image markdown separately from normal links.
- Android chat screen no longer combines `KeyboardAvoidingView behavior="height"` with an inverted `FlatList`.
- `AiThinkingBlock` no longer uses a `100ms` thinking timer.
- `AiMessageContent` memoizes `parseMarkdownBlocks(content)`.
- UI feedback timeout handles are stored in refs and cleared on unmount.
- `AiChatScreen` guards `setLatestVisible` behind a value-change check.
- Latest assistant lookup avoids copied-array `reverse()` scans.
- `AiScrollToLatestButton` receives a dynamic bottom offset from the chat screen.
- `aiThreadRepository.listMessageVersionsForMessages` and `listCitationsForMessages` chunk message-id input instead of binding every id in one SQL statement.
- `AiChatScreen` sets `initialNumToRender={10}`, `maxToRenderPerBatch={8}`, `windowSize={11}`, and `removeClippedSubviews={Platform.OS === 'android'}` on the chat FlatList.

Run:

- `pnpm typecheck`
- `pnpm test`
- `git diff --check`

Manual Android smoke check remains useful because keyboard jitter and animation smoothness are partly perceptual.

## Non-Goals

- Do not redesign the whole chat page.
- Do not add a large empty-state card, illustration, onboarding panel, or marketing copy.
- Do not change the AI provider, streaming protocol, retrieval, memory, or SQLite data model.
- Do not add a backend, cloud image proxy, or remote sync.
- Do not replace the markdown parser with a large new dependency in this pass.

## Open Risk

Exact Claude font files are not available in the project and should not be bundled by assumption. The implementation should match the Claude-like visual feel using Pixory's existing AI light display font and typography tokens.
