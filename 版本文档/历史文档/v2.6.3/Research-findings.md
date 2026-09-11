# AI Chat Streaming Tail Research Findings

This file stores research notes, source links, repo observations, and design evidence for the virtual tail occupancy spec.

## External Source Notes

### React Native maintainVisibleContentPosition
- Source: https://reactnative.dev/docs/scrollview
- Key point: `maintainVisibleContentPosition` adjusts scroll position so the first visible child at or beyond `minIndexForVisible` does not change position.
- Relevance: This is the native primitive behind "do not move what the user is reading." Pixory's design must treat current viewport anchoring as a hard invariant.

### TanStack Virtual Chat
- Source: https://tanstack.com/virtual/latest/docs/chat
- Key points: stable item keys, fixed scroll element height, dynamic height measurement, `anchorTo: 'end'`, append-follow only when user is at the latest, and "Jump to latest" when reading history.
- Relevance: Confirms that chat streaming is end-anchored and dynamic-height, not ordinary start-anchored virtualization. Streaming growth should follow only if the user was already at the end.

### TanStack Blog: Chat UIs Are Lists Until They Aren't
- Source: https://tanstack.com/blog/tanstack-virtual-chat
- Key points: chat flips normal list contracts because new output appears at the end, old history prepends at the start, the last message grows token by token, and the user should only follow output if already at latest.
- Relevance: Strongly supports a detached tail model rather than mutating the visible history viewport during streaming.

### FlashList v2
- Sources: https://shopify.github.io/flash-list/docs/v2-changes/ and https://shopify.engineering/flashlist-v2
- Key points: `maintainVisibleContentPosition` is available and enabled by default; v2 emphasizes precise rendering without item size estimates.
- Relevance: Mature RN list systems are moving away from developer-supplied whole-item estimates. Pixory should avoid whole-message final-height estimates and prefer measured block heights.

### react-native-streaming-message-list
- Source: https://github.com/bacarybruno/react-native-streaming-message-list
- Key point from repo summary: FlatList-compatible component aiming to replicate ChatGPT/Claude-like streaming message list behavior.
- Relevance: Candidate source for practical RN streaming-list mechanics; needs local source inspection.

### GetStream flat-list-mvcp
- Source: https://github.com/GetStream/flat-list-mvcp
- Key point: Android support/polyfill history for `maintainVisibleContentPosition`.
- Relevance: Useful background for Android anchoring caveats, though current RN versions may differ.

## Local Source Inspection

### react-native-streaming-message-list
- Local path: `D:\Project\PixoryStreamingResearch\react-native-streaming-message-list`
- Core files inspected:
  - `src/StreamingMessageList.tsx`
  - `src/StreamingItem.tsx`
  - `src/AnchorItem.tsx`
  - `src/hooks/usePlaceholderState.ts`
  - `src/hooks/useScrollBehavior.ts`
  - `src/scrollCalculations.ts`
- Architecture:
  - Wraps the last user message in `AnchorItem` to measure anchor height.
  - Wraps the last assistant message in `StreamingItem` to measure growing streaming height.
  - Computes a bottom placeholder height as `availableSpace - (anchorHeight + streamingContentHeight)`.
  - Debounces placeholder height and waits for a stable delay before performing scroll-to-new-message.
  - Tracks whether bottom whitespace is visible and dismisses placeholder after the user scrolls away from it.
- Strong reusable ideas:
  - Do not rely purely on estimates; measure actual streaming content layout.
  - Placeholder/whitespace is a real list footer, not an overlay.
  - Streaming content height updates are monotonic: `setStreamingContentHeight` ignores shrink unless forced.
  - Placeholder is debounced and considered stable only after a short delay.
  - Scroll-to-new-message waits until placeholder and anchor measurements are available.
- Limitations for Pixory:
  - It targets "new message snaps near top" behavior, not detached history reading while AI continues below.
  - It measures whole streaming item height, which can still be too coarse for very long Markdown and code blocks.
  - It does not implement block-level height debt/over-reservation handling.
  - It uses LegendList; Pixory currently uses FlatList and already has custom streaming store integration.

### GetStream flat-list-mvcp
- Local path: `D:\Project\PixoryStreamingResearch\flat-list-mvcp`
- Core file inspected: `src/useMvcpTuner.ts`
- Architecture:
  - On Android, calls a native module to enable maintain-visible-content-position with `minIndexForVisible` and `autoscrollToTopThreshold`.
  - Avoids repeated native calls when MVCP values have not changed.
- Relevance:
  - Reinforces that Android anchoring is a native scroll-view concern, not something to emulate only with JS scroll calls.
  - Pixory should keep relying on native anchoring for visible history and avoid JS scroll corrections during ordinary streaming.

### Vercel ai-chatbot
- Local path: `D:\Project\PixoryStreamingResearch\ai-chatbot`
- Core files inspected:
  - `hooks/use-scroll-to-bottom.tsx`
  - `hooks/use-messages.tsx`
  - `components/chat/messages.tsx`
  - `components/ai-elements/conversation.tsx`
  - `components/ai-elements/code-block.tsx`
- Architecture:
  - Maintains an explicit `isAtBottom` state.
  - Uses DOM mutation and resize observers to scroll only if the user is still at bottom and not actively scrolling.
  - Shows a scroll-to-bottom button when not at bottom.
  - Uses `use-stick-to-bottom` in its AI elements component library for bottom-stick behavior.
  - Code block rendering caches highlighted tokens, shows raw tokens immediately, and improves expensive blocks asynchronously.
  - Web code blocks use `contentVisibility: auto` and `containIntrinsicSize` for rendering containment.
- Reusable ideas:
  - Follow streaming only when the viewport was already at the bottom.
  - Treat user scrolling as a temporary veto against automatic bottom following.
  - Expensive rich rendering should be progressively enhanced from a lightweight representation.
  - Complex block rendering should cache expensive computation by content/language key.
- Limitations for Pixory:
  - Web DOM observers do not map directly to React Native.
  - It does not implement mobile virtual tail occupancy or block-height debt handling.

### Open WebUI
- Local path: `D:\Project\PixoryStreamingResearch\open-webui`
- Core files inspected:
  - `src/lib/components/chat/Chat.svelte`
  - `src/lib/components/chat/Messages.svelte`
  - `src/lib/components/chat/Messages/Markdown.svelte`
  - `src/lib/components/chat/Messages/ResponseMessage.svelte`
  - `src/lib/components/chat/Messages/UserMessage.svelte`
- Architecture:
  - Keeps an explicit `autoScroll` boolean and updates it from bottom distance checks such as `scrollHeight - scrollTop <= clientHeight + 50`.
  - Calls `scrollToBottom` only while `autoScroll` is true; user scrolling away disables bottom following.
  - Uses repeated `requestAnimationFrame` bottom corrections because web `content-visibility: auto` can resolve offscreen heights across multiple frames.
  - Throttles message-list rebuild and Markdown token parsing to once per animation frame while streaming.
  - Saves and restores `scrollTop` around edit-mode transitions to prevent input/edit UI from jumping the reading position.
- Strong reusable ideas:
  - Streaming speed is achieved by frame-batching UI work, not by rendering every provider delta synchronously.
  - Bottom follow is a state, not a side effect; it is disabled immediately by user scroll intent.
  - Expensive layout features need post-layout reconciliation because height can resolve after the initial render.
  - Edit, branch switch, and textarea growth must preserve the container scroll position explicitly.
- Limitations for Pixory:
  - It is web/Svelte and can rely on DOM APIs unavailable in React Native.
  - It still mostly scrolls to bottom while locked; it does not fully solve "history reading while hidden streaming tail grows" on mobile.

### LibreChat
- Local path: `D:\Project\PixoryStreamingResearch\LibreChat`
- Core files inspected:
  - `client/src/hooks/Messages/useMessageScrolling.ts`
  - `client/src/hooks/Messages/messageLayout.ts`
  - `client/src/components/Chat/Messages/MessagesView.tsx`
  - `client/src/components/Chat/Messages/Message.tsx`
  - `client/src/components/Chat/Messages/ui/MessageRender.tsx`
  - `client/src/components/Chat/Messages/Content/Markdown.tsx`
  - `client/src/components/Chat/Messages/Content/MarkdownBlocks.tsx`
  - `client/src/components/Chat/Messages/Content/splitMarkdown.ts`
  - `client/src/components/Chat/Messages/Content/MarkdownBlocks.bench.tsx`
  - `client/src/components/Chat/Messages/Content/Parts/useLazyHighlight.ts`
- Architecture:
  - Uses `IntersectionObserver`/distance checks to track near-bottom state and show a scroll button.
  - Uses `ResizeObserver` on the content container; if the user is near bottom and generation is submitting, content growth follows bottom.
  - Suppresses automatic resize-follow after pointer/keyboard interaction inside content.
  - Reconciles scroll position after layout changes for 350 ms to clamp overscroll caused by dynamic content height changes.
  - Memoizes message rendering with a custom comparator because tree building can create new message objects even when old message content did not change.
  - Splits Markdown into top-level blocks; completed block slices keep stable keys and avoid re-parsing/re-rendering during append-only streaming.
  - Includes a benchmark showing the intended metric: code-block render count across a simulated stream should drop by more than half.
  - Lazy-loads syntax highlighting and returns raw code first when the highlighter is not ready.
- Strong reusable ideas:
  - Long chat performance depends on isolating old messages from latest streaming updates.
  - Markdown should be block-segmented; the final growing block may update, but completed blocks should become immutable render/measurement units.
  - Expensive code highlighting should be lazy and cached; raw text should render immediately.
  - Layout reconciliation needs a time window after dynamic expand/collapse, images, tools, or rich blocks.
- Limitations for Pixory:
  - React Native cannot use DOM observers; equivalent measurement must come from `onLayout`, `onViewableItemsChanged`, and FlatList anchoring.
  - LibreChat does not virtualize the core chat list like RN FlatList; its lessons are mainly about memoization, block segmentation, and resize reconciliation.

## Pixory Current Architecture Notes

### Current strengths
- Uses `AiStreamingMessageStore` with `useSyncExternalStore`, so the active streaming text can update without forcing the whole message array through React state every provider delta.
- Uses inverted `FlatList`, `maintainVisibleContentPosition`, bounded `initialNumToRender`, `maxToRenderPerBatch`, `windowSize`, and Android `removeClippedSubviews`.
- Streaming render path intentionally avoids Markdown parsing while `streaming=true`; `AiStreamingMessageText` renders lightweight plain text plus cursor.
- `aiStreamingRuntime.ts` already separates provider/network deltas from UI patch cadence and persistence cadence.
- Current button threshold is `MESSAGE_SCROLL_BUTTON_THRESHOLD`; earlier requirement says no latest button before `4800`.

### Current weaknesses
- The detached-history prototype freezes the visible message and reveals buffered text by scroll ratio. This prevents some pushing, but it is not a true height model.
- Scroll-ratio reveal can make the user see a sudden large text jump when returning toward bottom if the API generated a lot while detached.
- The hidden tail does not currently occupy measured real height in the list. Therefore the user is not strictly "scrolling into already existing content"; the content is still being disclosed.
- The model uses character ratio, not visual block height. Markdown, CJK wrapping, code blocks, tables, images, and thinking blocks can all break the character-to-height relationship.
- `revealBufferedStreamingStateForScroll` still updates `setMessages`, which can touch the list data path during user scrolling.
- There is no explicit block-level height cache, height debt ledger, or delayed shrink policy.

## Cross-Project Conclusions

- Fast mature streaming is not raw token-by-token rendering. It is usually "network as fast as possible, UI publish at most once per frame or semantic chunk, durable persistence slower."
- Mature bottom follow is conditional. If the user was at bottom, growth follows. If the user scrolls away, the viewport belongs to the user and generation must not fight it.
- Long-history performance comes from keeping old rows immutable/memoized and virtualized, not from optimizing one large render tree.
- Rich Markdown must be progressive. Streaming should use lightweight text or block-level rendering; finalized content can upgrade to richer Markdown, syntax highlighting, citations, and tables.
- Real-height occupancy should be measured, monotonic, and conservative. Shrink corrections are more dangerous than over-reservation because shrink can pull the current viewport.
