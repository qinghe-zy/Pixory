# Pixory AI Chat Streaming Tail Occupancy Spec

## 1. Goal

Pixory's streaming chat must feel like a mature mobile chat product:

- When the user stays at the latest message, AI output should use as much API/network speed as the device can comfortably display.
- When the user scrolls upward to read history, streaming must not push, pull, jitter, or compete with the user's finger.
- When the user scrolls back down, the newly generated content should feel like natural existing history, not a sudden block of text appearing.
- Long conversations with hundreds of turns must keep old messages stable and avoid unnecessary re-rendering.

This spec replaces the current "scroll-ratio text reveal" prototype with a real measured tail-occupancy model.

Implementation handoff:

- Use `docs/ai-chat-streaming-research/implementation-plan.md` for step-by-step coding instructions.
- If another AI implements this work, give it both this spec and the implementation plan. The plan contains exact file paths, test commands, forbidden shortcuts, and review checks.

## 2. Non-Goals

- Do not estimate a whole assistant response's final height.
- Do not implement a custom list from scratch unless FlatList proves insufficient after code review.
- Do not make streaming slower just to reduce renders; instead isolate streaming renders from the full list.
- Do not require emulator or real-device validation for this phase unless the user asks. The acceptance path is code logic review and policy tests.

## 3. Reference Evidence

### react-native-streaming-message-list

Useful mechanics:

- Measures an anchor item and streaming item.
- Adds a real placeholder inside the list rather than overlaying fake space.
- Treats streaming height as monotonic by ignoring shrink unless forced.
- Debounces placeholder changes and waits for stable measurement before scroll correction.

Pixory adaptation:

- Use a real tail spacer row inside `FlatList`.
- Keep height monotonic while the user is detached from bottom.
- Measure actual content, but move from whole-message measurement to block-level measurement.

### Vercel ai-chatbot and use-stick-to-bottom

Useful mechanics:

- Tracks `isAtBottom`, `isNearBottom`, and escaped-from-lock state.
- Follows bottom only while locked.
- Uses observers and rAF to follow dynamic content growth.
- Renders raw code immediately and upgrades expensive highlighting later.

Pixory adaptation:

- Keep user scroll as the master signal.
- Bottom lock should be an explicit state machine, not incidental scroll calls.
- Streaming output can be published quickly, but list movement only happens while locked.

### Open WebUI

Useful mechanics:

- Uses `autoScroll` as a first-class state.
- Throttles list rebuild and Markdown parsing to once per animation frame during streaming.
- Re-runs bottom scroll across animation frames because height can resolve late.
- Saves/restores scroll position around edit-mode UI changes.

Pixory adaptation:

- UI publication must be frame-batched.
- Dynamic layout changes need post-layout reconciliation windows.
- Editing, branch switching, composer height changes, and thinking expansion must not unexpectedly move the user's reading position.

### LibreChat

Useful mechanics:

- Custom memo comparator prevents old messages from re-rendering when tree objects are rebuilt.
- Markdown is split into top-level blocks so completed blocks stay memoized during streaming.
- Syntax highlighting is lazy-loaded and raw text displays first.
- Resize reconciliation clamps scroll after dynamic layout changes.

Pixory adaptation:

- Split assistant content into measured render blocks.
- Cache block render and block height by stable block key.
- Old message rows must not re-render because the active stream changes.

## 4. Current Pixory Baseline

Current strengths:

- `AiStreamingMessageStore` already uses `useSyncExternalStore` for active streaming snapshots.
- `AiStreamingMessageText` renders streaming as lightweight plain text, avoiding full Markdown parsing.
- `aiStreamingRuntime.ts` already separates UI patch cadence from persistence cadence.
- The chat list uses inverted `FlatList`, `maintainVisibleContentPosition`, and bounded render windows.
- Current code already buffers streaming patches when the user leaves bottom.

Current gaps:

- Detached mode reveals hidden output by text ratio, not by measured visual height.
- Hidden tail has no real measured list occupancy, so returning to bottom can reveal a large block suddenly.
- Character count does not map safely to visual height, especially for Chinese wrapping, code, tables, math, images, and thinking blocks.
- Some detached reveal paths still call `setMessages` while the user scrolls.
- No block height cache, height debt ledger, stable boundary detach, or delayed shrink policy exists yet.

## 5. Product Model

The model should behave as if streaming is happening below the user's current viewport in a real extended document.

### At Bottom

- The active assistant row renders live.
- New text publishes quickly through `AiStreamingMessageStore`.
- The list follows bottom only while `bottomLocked=true`.
- Rich Markdown is deferred during streaming; lightweight text remains the default.

### User Scrolls Away

- The currently visible stream finishes to a stable boundary and then freezes.
- Later provider deltas continue accumulating in the streaming buffer.
- New hidden content contributes to a real tail spacer height.
- The visible viewport is not updated by generated text.
- `maintainVisibleContentPosition` and FlatList anchoring protect the visible row.

### User Scrolls Down

- As the hidden tail enters view, blocks are promoted from virtual occupancy to visible rendered rows/content.
- The user controls the speed by scrolling.
- No large patch should suddenly appear just because generation completed.
- If measurement is missing, conservative placeholder height remains until measured.

### User Taps Return To Latest

- Buffered stream is flushed.
- Tail spacer is cleared or reconciled.
- Latest message is fully rendered.
- Bottom lock is restored.

## 6. State Machine

Use an explicit streaming viewport state:

```ts
type StreamingViewportMode =
  | 'live_locked'
  | 'graceful_detaching'
  | 'detached_reading'
  | 'tail_replaying'
  | 'returning_latest'
  | 'completed_detached'
  | 'idle';
```

### `live_locked`

Conditions:

- Latest message is visible at bottom.
- `contentOffset.y <= MESSAGE_STREAM_FOLLOW_THRESHOLD`.
- User is not dragging away.

Behavior:

- Publish streaming text to `AiStreamingMessageStore`.
- Do not update the whole `messages` array for every patch.
- Follow bottom with `scrollToOffset({ offset: 0 })` only when needed and not during active user drag.

### `graceful_detaching`

Entry:

- User scrolls away while generation is active.

Behavior:

- Do not freeze at an arbitrary character if a line/sentence is half-rendered.
- Allow a short stable-boundary budget:
  - Stop at newline, sentence punctuation, code fence line, table row boundary, list item boundary, or paragraph boundary.
  - Hard cap: `80-160 ms` or `24-64` extra characters, whichever comes first.
- After the boundary, freeze the visible stream snapshot.
- Route all later deltas into hidden tail buffer.

Reason:

- If the AI was midway through a line, freezing instantly can leave a visually broken line. Mature products usually avoid making the detach feel like a rendering fault.

### `detached_reading`

Conditions:

- User is away from bottom.
- Generation may still be active or completed.

Behavior:

- Do not publish hidden deltas to visible message text.
- Do not call `setMessages` for hidden streaming text.
- Update tail block model and tail spacer only.
- Show return-to-latest button only when offset exceeds `4800`.

### `tail_replaying`

Entry:

- User scrolls down into the reserved tail region.

Behavior:

- Promote blocks from virtual to rendered based on measured or estimated block boundaries.
- Promotion must be monotonic: once the user has seen a block, do not hide it again.
- Do not jump to full completed content unless the user reaches latest or presses the button.

### `completed_detached`

Entry:

- Provider stream completed while user is detached.

Behavior:

- Keep the completed content represented by block occupancy.
- Do not flush all content into the visible message just because generation completed.
- Final DB reload may happen, but visible list must preserve the frozen + tail model until user intentionally returns or scrolls through.

### `returning_latest`

Entry:

- User taps latest button, sends a new message, switches thread intentionally, or scrolls to bottom threshold.

Behavior:

- Flush final buffered message.
- Clear tail spacer after layout confirmation.
- Restore live bottom lock.

## 7. Block Model

Introduce a block-level stream model:

```ts
type AiStreamBlockType =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'blockquote'
  | 'code'
  | 'table'
  | 'math'
  | 'image'
  | 'html'
  | 'thinking'
  | 'plain';

type AiStreamBlock = {
  blockId: string;
  messageId: string;
  generationId: string;
  type: AiStreamBlockType;
  raw: string;
  finalized: boolean;
  ordinal: number;
  estimatedHeight: number;
  measuredHeight?: number;
  reservedHeight: number;
};
```

### Block Boundary Rules

Parse streaming text into stable top-level blocks:

- Paragraph: split on blank lines or stable sentence boundary when detached.
- Heading: line beginning with `#`.
- List: contiguous list-item lines.
- Code: fenced block from opening fence through closing fence; while unclosed, treat as a growing code block.
- Table: header + delimiter + rows; each complete row is a stable sub-boundary.
- Math: fenced or display math block.
- Thinking: reasoning block separate from answer content.
- HTML/rich blocks: fallback to whole block and conservative estimate.

### Stable Block Keys

Block key should be stable while appending:

```txt
{space}:{threadId}:{messageId}:{generationId}:{ordinal}:{blockType}:{startOffset}
```

Do not use raw content hash alone for active blocks because the growing final block would remount every token.

## 8. Height Measurement Cache

Use a small in-memory cache plus optional persisted cache:

```ts
type AiStreamBlockHeightEntry = {
  key: string;
  widthBucket: number;
  fontScaleBucket: number;
  rendererVersion: number;
  blockType: AiStreamBlockType;
  rawLength: number;
  lineCount: number;
  measuredHeight: number;
  updatedAt: number;
};
```

### Width Bucket

Width materially affects wrapping. Bucket by actual bubble/content width:

- `Math.round(width / 8) * 8`

Invalidate or separate cache when:

- screen width changes
- font scale changes
- typography tokens change
- message bubble horizontal padding changes
- Markdown renderer version changes

### Measurement Source

- Visible rendered block uses `onLayout` to report real height.
- Hidden measurement may use an offscreen measuring host only if needed and only for a bounded number of blocks per frame.
- If offscreen measurement is not stable in Expo/RN, defer measurement until block naturally enters viewport.

### Monotonic Reservation

While detached:

```txt
reservedHeight = max(previousReservedHeight, measuredHeight ?? estimatedHeight)
```

Never shrink reserved height in or near the user's viewport.

Shrink can happen only when:

- user returns to latest, or
- affected spacer is safely outside viewport, or
- generation is completed and reconciliation can be applied without changing visible anchor.

## 9. Estimation Strategy

Estimation is temporary and conservative. It must never be trusted as final layout.

### Estimate Inputs

- block type
- raw length
- line count
- CJK ratio
- code fence line count
- table row count
- bubble width bucket
- typography line height

### Conservative Defaults

- Paragraph: estimate by wrapped line count plus vertical margin.
- CJK paragraph: use higher chars-per-line precision because CJK wraps more predictably than mixed Markdown.
- Code: line count times code line height plus header/padding.
- Table: row count times row height plus header/padding; if table may horizontally scroll, cap vertical estimate by row count.
- Image/rich/html: reserve a safe placeholder height and update after measurement.

### Height Debt

Track difference between reserved and measured:

```ts
type HeightDebt = {
  overReserved: number;
  underReserved: number;
};
```

Rules:

- Under-reservation is more dangerous because it can cause content to appear late. Prefer slight over-reservation.
- Over-reservation becomes blank tail space. It is acceptable temporarily and can be paid down later.
- Debt correction must not move the visible anchor.

## 10. Tail Spacer Design

Add a real list item or footer-like row to the inverted FlatList data model.

For Pixory's inverted list:

- The latest visual bottom corresponds to `offset=0`.
- Tail spacer must be placed adjacent to the active/latest assistant item in the inverted data order.
- It must participate in FlatList layout, not overlay the list.

Suggested item model:

```ts
type VisibleMessageItem =
  | { type: 'message'; message: AiMessageWithCitations }
  | { type: 'streamTailSpacer'; generationId: string; height: number }
  | { type: 'streamTailBlock'; block: AiStreamBlock };
```

Implementation preference:

- Phase 1 can use one spacer row representing total hidden reserved height.
- Phase 2 can replace portions of spacer with block rows as the user scrolls into the tail.

Invariant:

- Spacer height changes may extend content below the user's current viewport, but must not move currently visible history.

## 11. Promotion From Spacer To Content

When detached, hidden output exists as:

```txt
frozen visible prefix
virtual tail blocks
tail spacer height
```

As user scrolls down:

1. Determine how much of the tail spacer region has entered the viewport.
2. Promote complete blocks whose cumulative reserved height is now within or near viewport.
3. Replace promoted spacer height with rendered block height.
4. Keep any remaining hidden blocks represented by spacer.

Rules:

- Promotion should happen by block, not arbitrary character ratio.
- For a very long paragraph, sub-segment by sentence/newline/soft line group.
- For a code block, promote complete lines or the full block if small.
- For a table, promote complete rows.
- For an unfinished last block, promote only up to a graceful stable boundary.

## 12. Streaming Refresh Speed Policy

Current `aiStreamingRuntime.ts` caps visible streaming at 24-36 fps depending on visible chars and pressure. The direction is good, but can be more aggressive without list jank if the active stream remains isolated.

Recommended policy:

- Provider/network reader consumes deltas immediately.
- Aggregate deltas in an in-memory generation buffer.
- First visible token publishes immediately or within `0-32 ms`.
- While `live_locked`:
  - publish at rAF cadence, target up to 60 fps on short text if JS is healthy
  - target 30-45 fps for medium text
  - target 18-30 fps for very long visible text or pressure
  - if backlog grows, increase characters per frame rather than increasing frame count beyond device capacity
- While `detached_reading`:
  - do not publish visible text
  - update block model and spacer at a lower cadence, for example 8-15 fps or semantic boundary only
  - final content remains buffered until replay or return
- Persistence:
  - keep durable DB snapshots at `500 ms` or force on background/completion/error/stop
  - never persist on every token

The core speed principle:

```txt
network speed is unlimited by UI
UI speed is frame-batched
list speed is detached from stream speed
DB speed is recoverability-batched
```

## 13. Long Conversation Rendering Policy

### FlatList

Keep:

- inverted `FlatList`
- `maintainVisibleContentPosition`
- `removeClippedSubviews` on Android
- bounded `initialNumToRender`, `maxToRenderPerBatch`, `windowSize`

Review:

- `windowSize=11` may be too high for extremely rich message rows; keep initially, but define it as tunable.
- Do not call `setMessages` for active stream snapshots in live mode.
- Avoid rebuilding `invertedMessageItems` with unstable object identities for all rows.

### Message Rows

Rules:

- Old message rows must compare equal when only the latest streaming text changes.
- Row comparator should compare message key fields and avoid deep array/object churn.
- Attachments/citations arrays should preserve identity unless changed.
- Thinking expansion state should stay outside message content if possible.

### Markdown

Current Pixory renders streaming as plain text, which is good. For finalized messages:

- Add block-level Markdown parsing/cache.
- Completed blocks should be memoized.
- Syntax highlighting should be lazy and cached.
- Code/math/table rendering should not block first text display.

## 14. Dynamic Content Reconciliation

Dynamic layout can happen after initial render:

- images load
- code blocks expand
- thinking block opens/closes
- citations appear
- attachments load dimensions
- Markdown upgrades from plain to rich
- composer height changes

Rules:

- If `live_locked`, follow bottom after layout settles.
- If detached, preserve current visible anchor.
- For expand/collapse inside visible content, save current offset and restore/anchor after layout.
- Reconcile for a bounded window, for example `300-400 ms`, similar to LibreChat's layout reconcile window.

React Native tools:

- `maintainVisibleContentPosition`
- `onLayout` per measured block/row
- `onViewableItemsChanged`
- guarded `scrollToOffset` only for intentional bottom follow or anchor restoration

## 15. Failure Modes And Fallbacks

### Measurement Missing

Fallback:

- Keep conservative spacer estimate.
- Promote block only when measured or safely entering viewport.
- Never shrink visible region.

### Estimate Too Small

Fallback:

- Increase spacer when measurement arrives.
- If user is detached, growth must happen below current anchor.
- If user is live locked, follow bottom.

### Estimate Too Large

Fallback:

- Keep over-reserved blank space until safe correction.
- Correct when user returns latest or spacer region leaves viewport.

### Final DB Reload Arrives While Detached

Fallback:

- Do not replace visible frozen message with full final text.
- Merge final content into block/tail model.
- Keep replay model until user returns latest.

### User Sends New Message While Detached

Fallback:

- Treat as intentional return to latest.
- Flush previous tail.
- Start new generation at bottom.

### Route Blur / App Background

Fallback:

- Force persistence.
- Keep in-memory model if screen remains mounted.
- On resume, reload final durable snapshot and clear stale streaming identity safely.

## 16. Migration Plan

### Phase 0: Lock Current Intent

- Keep existing removal of "AI 正在回复".
- Keep latest button hidden until offset exceeds `4800`.
- Keep first-token fix policy and streaming external store.
- Document that current scroll-ratio reveal is transitional and should be replaced.

### Phase 1: Tail Spacer Without Block Replay

Implement:

- `streamTailSpacer` item in FlatList data.
- Tail occupancy manager with total reserved height.
- Monotonic spacer height while detached.
- Graceful detach boundary.
- No ratio-based text reveal during detached reading.

Acceptance:

- User scrolling upward while streaming sees no message growth in the current viewport.
- Completion while detached does not flash or replace content.
- Return-to-latest flushes the complete reply.

### Phase 2: Block Segmentation And Measurement Cache

Implement:

- Streaming text splitter into top-level blocks.
- `AiStreamBlock` model.
- `onLayout` measurement collection.
- height cache by width/font/renderer version.
- block-level reserved height.

Acceptance:

- Spacer height is based on cumulative block reservations.
- Estimates are replaced by measured heights without visible anchor jumps.
- CJK paragraphs, code blocks, tables, and reasoning blocks have separate estimation paths.

### Phase 3: Scroll-Through Tail Replay

Implement:

- Promotion from spacer to rendered block rows/content as user scrolls down.
- Monotonic promotion.
- Safe sub-block promotion for long paragraphs/code/table rows.

Acceptance:

- User can scroll down through generated content at their own speed.
- No sudden full-response insertion unless user intentionally returns latest.
- If generation completed while user was away, the user can still read into the generated content naturally.

### Phase 4: Rich Rendering Performance

Implement:

- finalized block-level Markdown renderer/cache.
- lazy syntax highlighting.
- optional cache for expensive block parse/render inputs.

Acceptance:

- Old blocks do not reparse during append-only streaming.
- Code-heavy long replies do not stall the first visible text.

## 17. Code Areas

Likely touched Pixory files:

- `src/screens/AiChatScreen.tsx`
- `src/ai/aiStreamingRuntime.ts`
- `src/ai/aiStreamingMessageStore.ts`
- `src/components/ai/AiStreamingMessageText.tsx`
- `src/components/ai/AiMessageContent.tsx`
- `src/components/ai/AiMessageBubble.tsx`

Likely new files:

- `src/ai/aiStreamingTailModel.ts`
- `src/ai/aiStreamingBlockSplitter.ts`
- `src/ai/aiStreamingHeightCache.ts`
- `src/components/ai/AiStreamingTailSpacer.tsx`
- `src/components/ai/AiMeasuredStreamBlock.tsx`

Tests/policy files:

- Add or update tests under `tests/ai-chat-*.test.cjs`.
- Tests should assert policies and pure model behavior; no real-device testing required for this phase.

## 18. Acceptance Criteria

### Streaming Speed

- First non-empty provider delta reaches visible UI immediately or in the next frame while live locked.
- Long replies do not intentionally type one character at a time when backlog is available.
- UI publish cadence is adaptive and can catch up by increasing characters per frame.

### No Jitter While Reading History

- If user offset is above stream-follow threshold, live stream cannot mutate visible message content.
- Tail spacer height may grow, but current viewport anchor must not move.
- Completion cannot trigger a visible flash or full-content replacement while detached.

### Natural Scroll Back

- User sees generated content by scrolling down into it.
- Content promotion happens by measured blocks or stable sub-block boundaries.
- No large completed reply appears all at once unless user taps return-to-latest.

### Height Safety

- No whole-response final-height estimate.
- Measurement cache is keyed by width/font/renderer version.
- Reservation is monotonic while detached.
- Shrink corrections are delayed until safe.

### Long History

- Old message rows do not re-render because the active stream changes.
- Rich Markdown parsing is avoided during streaming and block-cached after finalization.
- Hundreds of messages remain virtualized and clipped on Android.

## 19. Review Checklist

- Does any provider delta path call `setMessages` while detached?
- Can final DB reload replace frozen visible content while detached?
- Can spacer shrink while the affected region is near viewport?
- Are block keys stable during append-only streaming?
- Are height cache keys invalidated by width/font/renderer changes?
- Is latest button hidden below `4800` offset?
- Is bottom follow impossible after user scroll intent unless user returns latest?
- Are code/table/math/image blocks estimated separately from normal paragraphs?
- Are old rows memoized against unrelated stream changes?

## 20. Recommended Decision

Adopt the measured tail-occupancy architecture.

The current ratio-reveal prototype is acceptable as a short-lived stopgap, but it cannot fully satisfy the product goal because it maps scroll distance to character count instead of content height. The product-grade path is:

```txt
external streaming store
> explicit bottom-lock/detached state machine
> graceful detach
> real FlatList tail spacer
> block segmentation
> measured height cache
> monotonic reservation
> scroll-through block promotion
> finalized rich-render cache
```

This is the safest path because every uncertain value is either measured later or corrected only when it cannot move the user's current viewport.
