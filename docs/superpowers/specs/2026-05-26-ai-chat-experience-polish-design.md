# AI Chat Experience Polish Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan after this spec is approved.

**Goal:** Polish the AI chat page so first-run, streaming, markdown image, and Android keyboard behavior feel closer to Claude/ChatGPT: quiet, smooth, and local-first.

**Architecture:** Keep the existing AI chat screen and message renderer. Make small targeted changes in the current components: `AiThinkingBlock` for opacity animation, `AiChatScreen` for first-message greeting and Android keyboard behavior, and `AiMessageContent` for image markdown rendering.

**Tech Stack:** Expo, React Native, TypeScript, SQLite/local-only data model, existing Pixory design tokens, existing AI light theme.

---

## Current Findings

- `src/components/ai/AiThinkingBlock.tsx` animates `expandedProgress` with `useNativeDriver: false` even though only `opacity` is animated.
- `src/screens/AiChatScreen.tsx` renders an inverted `FlatList` without a first-message greeting or lightweight starter hints.
- `src/components/ai/AiMessageContent.tsx` parses `[text](https://...)` links but not `![alt](url)` image markdown.
- `src/screens/AiChatScreen.tsx` wraps the chat layout in `KeyboardAvoidingView behavior="height"` on Android, while `android/app/src/main/AndroidManifest.xml` already uses `windowSoftInputMode="adjustResize"` for `MainActivity`.

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

Do not put these strings in the composer placeholder. The composer placeholder should remain the existing Pixory behavior unless a future spec changes it.

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

## Android Keyboard Behavior

For Android, remove the extra `KeyboardAvoidingView behavior="height"` from the chat screen path and rely on the existing `adjustResize`.

The goal is to avoid double resize with an inverted `FlatList`.

Expected behavior:

- Android: chat layout uses normal `View` sizing under `adjustResize`.
- iOS: no behavior regression should be introduced. If the existing wrapper is removed globally, verify composer visibility manually or keep an iOS-only wrapper only if needed.
- The inverted list should remain pinned to offset zero and keep the existing no-jitter scroll policy.

## Tests and Verification

Add policy/regression coverage that checks:

- `AiThinkingBlock` uses `useNativeDriver: true` for `expandedProgress`.
- `AiChatScreen` exposes a lightweight starter greeting via `ListEmptyComponent` or equivalent empty-list rendering.
- Greeting copy includes the three approved Chinese time-aware strings.
- Greeting suggestions fill composer text and do not directly call send.
- `AiMessageContent` parses and renders image markdown separately from normal links.
- Android chat screen no longer combines `KeyboardAvoidingView behavior="height"` with an inverted `FlatList`.

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
