# Pixory AI Memory And Chat Experience Upgrade Spec

Date: 2026-05-23

## Status

Approved product direction, pending implementation.

## Goal

Upgrade Pixory's AI memory, context, and chat interaction system from hidden background text stitching plus a functional chat surface into a user-controlled, cache-aware, IP-asset-aware, polished mobile AI experience that can compete with mature AI chat products while preserving Pixory's local-first Android foundation.

This spec intentionally optimizes for AI experience quality. It does not constrain the work to a lightweight daily-chat surface, but it still must respect Pixory's core product rules: no cloud account system, no server-side storage, no image original mutation, no sync, and all structured AI memory must stay in local SQLite.

This unified spec merges the memory engine upgrade direction, the AI chat experience review findings, and the follow-up product decisions about what should not be done now.

## Product Principles

1. Memory must be visible and controllable.
2. Memory must be useful without becoming a hallucination trap.
3. Memory extraction must be cost-aware and not run a second model call after every ordinary chat turn.
4. Prompt assembly must be stable enough to benefit providers that support context caching.
5. Pixory memory must understand IP assets, not only chat text.
6. The system must degrade gracefully when no embedding provider is configured.

## Core Experience

### Memory Board

Add a Memory Board reachable from session settings.

Entry point:

- `AiSessionConfigScreen.tsx`
- The "深度记忆" card becomes both a switch and a management entry.
- Tapping the management entry opens a dedicated memory management screen.

The Memory Board displays "AI 记住了这些" and groups memory by scope:

- 全局
- 本会话
- 当前角色
- 当前 IP
- 当前知识库

Each memory row shows:

- memory content
- memory type: preference, fact, decision, instruction, task, correction
- scope label
- optional linked IP / group / image asset label
- last used time or created time
- confidence / importance in a subtle form

Each memory row supports:

- edit content
- delete memory by marking `status = 'deleted'`
- restore stale memory if a future stale state is surfaced

The board supports manual memory creation:

- User selects scope.
- User enters content.
- Optional type defaults to `fact`.
- Optional asset binding can attach current IP, group, or image asset when the board is opened from a scoped chat.

### Memory Capture Feedback

When the background memory pipeline creates one or more new high-confidence memories, the chat screen shows a compact notice near the composer:

`已记住 1 条内容 · 撤销 · 管理`

Rules:

- Show only for newly created active memories.
- Do not show for every summary update.
- Do not interrupt streaming.
- `撤销` marks the captured memory as deleted.
- `管理` opens the Memory Board.
- The notice can disappear after a short delay or after user action.

This prevents memory from feeling like a black box and gives immediate correction control.

### Triggered And Lazy Memory Updates

Deep memory remains opt-in per thread. When disabled:

- no summary loading
- no memory loading
- no history retrieval for memory
- no summary or memory update

When enabled, memory update uses two tracks.

Immediate track:

- Trigger only when the latest exchange contains strong intent markers:
  - 记住
  - 以后
  - 之后默认
  - 默认
  - 不对
  - 纠正
  - 更正
  - 最终版
  - 确认
  - 决定
- Run extraction shortly after the assistant reply completes.
- Surface Memory Capture Feedback when new high-confidence memories are saved.

Lazy track:

- Ordinary turns increment a local pending-turn counter.
- Run one memory consolidation pass after every 5 completed user-assistant turns.
- Also allow a consolidation pass when the user leaves the chat screen or the app backgrounds, if there are pending turns.
- The lazy pass should update summary and extract conservative memories in one model call.

The first version can store pending turn count in SQLite memory settings or a thread-local memory state table. It must survive app restart.

### Cache-Friendly Prompt Assembly

The prompt should be split into stable and dynamic sections.

Stable prefix:

1. Pixory base system rules.
2. Current role instruction frame.
3. Reply preference, if not `auto`.
4. Deep memory usage rules.
5. Thread summary.
6. Stable high-importance memories for current thread and bound scope.
7. Current IP / knowledge-base memory summary, when scoped.

Dynamic suffix:

1. Current question.
2. Related history retrieval.
3. Current RAG snippets.
4. Optional linked image asset metadata.

The stable prefix must use deterministic ordering:

- scope priority: global, role, thread, ip, knowledge_base
- importance descending
- createdAt ascending within equal importance
- id ascending as final tie-breaker

Do not inject every memory without limits. The default first version limits stable memory injection to:

- user-created memories: up to 12
- high-importance automatic memories: up to 12
- scoped IP / knowledge-base memories: up to 10

This design improves cache friendliness without allowing old memory to dominate every prompt. Actual latency and cost improvements are provider-dependent and must not be promised as guaranteed.

### IP Asset Memory

Pixory memory should be able to bind to IP assets.

New memory metadata can reference:

- `ipId`
- `groupId`
- `imageAssetId`
- optional `assetSnapshotJson`

When a user says "记住，这张立绘是小红的最终版", Pixory should store:

- the textual memory
- the current IP if available
- the selected image asset if the chat was launched from an image or image context
- relevant local metadata snapshot:
  - internal filename
  - original filename
  - width / height
  - tags
  - group
  - note
  - favorite state

Original images must not be modified. Thumbnails may be shown as references if already available through existing secure image components.

The assistant can later use this memory to answer asset-aware questions and optionally expose linked asset sources.

### Hybrid Local Retrieval

Replace pure character scoring with a hybrid retrieval layer.

Required first-version behavior:

- Keep keyword retrieval as the always-available offline baseline.
- Add SQLite FTS-based retrieval for memory and historical messages if FTS5 is available in the bundled SQLite runtime.
- Keep the existing embedding-enhanced path when embedding provider is configured.
- When no embedding key is configured, memory retrieval must still work through keyword / FTS.

Retrieval ranking should combine:

- lexical match
- memory importance
- memory scope relevance
- recency
- asset binding relevance
- embedding similarity when available

The system must not require local ONNX embedding in this iteration. Local ONNX can be a future upgrade after Android size and performance are evaluated.

## Chat Experience Upgrade

The chat experience upgrade focuses on feedback, discoverability, long-conversation handling, and recovery behavior.

### Explicitly Not Included

Do not implement:

- Removing or bypassing the AI Workbench entry structure.
- Hiding all message actions behind a long-press-only menu.
- Enabling Enter-to-send as default behavior.

Temporarily defer:

- Code syntax highlighting.
- Markdown image rendering.
- Changing the 0.1-second thinking timer cadence.

### Interaction Feedback

Implement:

- Copy success feedback for full-message copy.
- Copy success feedback for code-block copy.
- Markdown links that open safe `http` / `https` URLs.
- Readable failure feedback when clipboard or link opening fails.
- Voice input states: listening, recognizing, error, cancelled.
- Error messages near the latest chat/composer area instead of only above the message list.
- Failed assistant messages with distinct visual treatment and retry affordance when recoverable.

### Empty And Guidance States

Implement empty chat suggestions:

- normal chat suggestions for everyday conversation
- IP chat suggestions for IP summary, tags/groups, asset gaps
- knowledge-base chat suggestions for document summary, key points, action extraction

Suggestions must disappear after the first user message.

Improve empty AI history and filtered history states so they are designed product states, not one-line dead ends.

### Context Safety

Add approximate context budgeting:

- estimate prompt size by a conservative token/character heuristic
- protect current user message
- protect current role instruction and system rules
- prefer recent messages over old messages
- trim memory, history, and RAG snippets by priority
- show a subtle note when older messages may no longer be referenced
- use a conservative fallback when model context window is unknown

### Long Chat Navigation

Implement:

- floating "scroll to latest" button when user is away from bottom
- loading state for "加载更早消息"
- date separators across day boundaries
- user message timestamps
- chat-page quick new-chat action
- chat-page recent-session quick switcher while keeping the AI Workbench
- history search by title and last message preview
- history grouping by today/yesterday/past 7 days/older

### Thinking And Streaming Polish

Keep:

- `正在思考中... X.X秒`
- `思考完成 X.X秒`
- 0.1-second precision

Add:

- live reasoning text visibility while generation is running when provider emits `reasoning_delta`
- subtle thinking activity indicator
- expand/collapse transition
- subtle streaming cursor or typing indicator for assistant output

### Settings Polish

Implement:

- autosave for lightweight settings:
  - reply preference
  - material boundary mode
  - deep memory switch
- explicit save or blur-save for advanced role instruction
- short explanatory text for material scope and reply preference
- no raw internal thread ID in session settings subtitle
- dangerous delete action visually separated from save/start actions

### Composer And Attachment Polish

Implement:

- smoother composer height transition while preserving the six-line cap
- image attachment thumbnail preview
- clearer disabled send state
- context-aware placeholder text
- voice state timeout and cancel affordance

## Data Model

Extend memory data around the existing `ai_memories` table.

Required additions:

- `ipId INTEGER`
- `groupId INTEGER`
- `imageAssetId INTEGER`
- `assetSnapshotJson TEXT NOT NULL DEFAULT '{}'`
- `sourceKind TEXT NOT NULL DEFAULT 'auto' CHECK (sourceKind IN ('auto', 'manual'))`

Add a persisted memory update state table:

- `ai_thread_memory_jobs`
  - `threadId`
  - `pendingTurnCount`
  - `lastConsolidatedMessageId`
  - `lastCaptureNoticeJson`
  - `updatedAt`

If FTS is supported, add a virtual FTS table or a normal fallback index strategy for:

- active memory content
- optional normalized content

The implementation must keep migrations additive and compatible with existing databases.

## Service Interfaces

Add memory board service functions near AI chat/memory services:

- `listMemoryBoardItems(space, input)`
- `createManualMemory(space, input)`
- `updateMemoryContent(space, memoryId, content)`
- `deleteMemory(space, memoryId)`
- `listRecentMemoryCaptures(space, threadId)`
- `dismissMemoryCapture(space, threadId)`

Add context assembly functions:

- `buildStableMemoryPrefix(thread, options)`
- `retrieveDynamicMemoryContext(thread, userMessage)`
- `buildCacheFriendlyPromptForThread(thread, userMessage)`

Add lazy update functions:

- `shouldRunImmediateMemoryCapture(exchange)`
- `incrementPendingMemoryTurn(threadId)`
- `maybeRunLazyMemoryConsolidation(threadId, reason)`

## UI Surfaces

Create:

- `src/screens/AiMemoryBoardScreen.tsx`

Modify:

- `src/screens/AiSessionConfigScreen.tsx`
- `src/screens/AiChatScreen.tsx`
- `App.tsx`
- AI route types in `App.tsx` or existing route definitions

Optional supporting components:

- `src/components/ai/AiMemoryCaptureNotice.tsx`
- `src/components/ai/AiMemoryScopeBadge.tsx`
- `src/components/ai/AiMemoryAssetChip.tsx`

Use the existing AI light theme and tokens. Memory management can be denser than daily chat, but it must still feel native to Pixory.

## Prompt Rules

Memory prompt rules:

- Memory is background context, not a hard command.
- Current user request wins over older memory.
- Current role instruction wins over older memory unless the user explicitly asks to ignore it.
- Current source material facts win over inferred memory.
- User-created memories have higher trust than automatic memories.
- Stale or deleted memories must not be injected.
- Do not mention "I used memory" unless the user asks, or unless a source/citation UI explicitly displays it.

## Acceptance Criteria

Memory Board:

- Deep memory settings open a Memory Board.
- Active memories are grouped by scope.
- User can manually add memory.
- User can edit memory content.
- User can delete memory and deleted memory is no longer injected.
- Memory board survives app restart.

Capture feedback:

- Strong memory intent creates a visible capture notice.
- User can undo the captured memory.
- User can open Memory Board from the notice.
- Ordinary chat does not constantly show memory notices.

Triggered and lazy updates:

- Deep memory off performs no memory update.
- Strong intent triggers immediate extraction.
- Ordinary chat increments pending count.
- Every 5 completed turns can consolidate once.
- Background / leaving chat can consolidate pending turns once.
- Repeated ordinary turns do not cause one model call per reply.

Cache-friendly prompt:

- Stable memory prefix order is deterministic.
- Reply preference and role instruction priority remain unchanged.
- Dynamic query-specific snippets are placed after stable context.
- Prompt does not inject deleted/stale memories.

IP asset memory:

- Memory can store IP / group / image asset references.
- Manual memory can be scoped to current IP.
- A memory tied to an image can display enough asset metadata to identify it.
- Original images are never modified.

Hybrid retrieval:

- Keyword retrieval works without embedding key.
- Embedding retrieval still works when configured.
- Memory retrieval ranking considers scope, importance, recency, and lexical relevance.

Chat feedback and navigation:

- Copy message and copy code show visible success feedback.
- Safe Markdown links open through the platform URL handler.
- Voice input always shows current state while recognition is active.
- Empty chats show context-appropriate suggestions.
- Errors appear near the latest interaction area and recoverable failures can retry.
- Scroll-to-latest appears only when the newest message is not visible.
- Date separators and user message times render in long conversations.
- Chat page can start a new chat and switch recent sessions without removing the AI Workbench.
- History search works by title and last message preview.

Context safety:

- Prompt assembly uses a budget, not only fixed message count.
- Current user request and role/system instructions are preserved.
- Older context is trimmed by priority.
- UI can indicate that older messages may not be referenced.

Thinking and composer:

- Live reasoning can be viewed during generation when available.
- Thinking timer keeps 0.1-second precision.
- Composer height transitions smoothly and still caps at six visible lines.
- Image attachments show thumbnails.

Settings polish:

- Reply preference, material boundary mode, and deep memory switch autosave.
- Advanced role instruction is not saved on every keystroke.
- Session settings does not expose raw thread IDs.
- Delete action is visually separated from normal save/start actions.

Verification:

- `pnpm typecheck`
- `pnpm test`
- `git diff --check`
- Android manual checks for Memory Board, capture notice, prompt behavior, IP-scoped memory, empty suggestions, voice states, link/copy feedback, context trimming, long chat navigation, and history search.

## Out Of Scope For First Implementation

- Server-side memory service.
- Account sync.
- Cloud storage.
- Local ONNX embedding runtime.
- Vision model analysis of images.
- Automatic image description generation.
- Editing or rewriting source image files.
- Multi-user collaboration.
- Replacing AI Workbench.
- Long-press-only message actions.
- Default Enter-to-send.
- Code syntax highlighting.
- Markdown image rendering.
- Conversation export as PDF/Markdown.
- Message sharing as image.
- Prompt template library.
