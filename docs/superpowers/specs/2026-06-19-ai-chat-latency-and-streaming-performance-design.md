# Pixory AI Chat Latency And Streaming Performance Spec

Date: 2026-06-19

## Status

Reviewed implementation spec, ready for detailed implementation planning.

This document is intended to drive a long multi-phase implementation. Unless the user explicitly overrides a decision in a later task, the defaults and phase gates in this spec are binding for the first implementation pass.

This spec consolidates the four optimization phases requested after the SillyTavern performance review:

1. Observability and measurement.
2. Streaming UI runtime and rendering.
3. First-token latency and prompt pipeline.
4. Prompt design, cache behavior, and product modes.

It extends the existing Pixory AI chat performance specs instead of replacing them:

- `docs/superpowers/specs/2026-05-24-ai-chat-performance-ux-followup.md`
- `docs/superpowers/specs/2026-06-02-ai-chat-performance-hardening-design.md`
- `docs/superpowers/specs/2026-06-15-ai-chat-prompt-cache-design.md`

## Normative Language

- `must` and `required` mean acceptance-blocking requirements.
- `should` means the default implementation choice. Deviating requires a measured reason and explicit note in the implementation report.
- `may` means optional follow-up work only after the phase's required acceptance criteria already pass.
- If a requirement conflicts with implementation convenience, preserve chat continuity, privacy isolation, correctness, and recoverability first.

## Execution Guardrails

These rules exist to keep a long implementation effort from drifting or silently changing scope.

- Implement phases in order: Phase 1 instrumentation, Phase 2 streaming runtime, Phase 3 first-token pipeline, Phase 4 prompt/cache modes.
- Do not claim a performance improvement in any phase until the relevant Phase 1 metrics exist on the same path being optimized.
- Do not start FlashList evaluation, markdown parser changes, or new dependency adoption before Phase 2 proves the current architecture is still the bottleneck.
- Do not introduce user-facing settings, server work, semantic final-answer caching, or new provider-routing behavior in this project unless the user explicitly asks for them in a later task.
- When a validation environment is missing, mark the relevant acceptance as unverified. Do not silently treat "not tested" as passed.
- If a phase uncovers a hidden prerequisite, add it to the current phase or explicitly defer it in writing; do not quietly spill it into unrelated phases.
- Any implementation report must include: scope completed, metrics captured, acceptance passed, acceptance unverified, regressions checked, and deliberate deferrals.

## Goal

Make Pixory AI chat feel fast and stable in long-running Android companion conversations.

The target user-visible improvements are:

- Lower perceived time from send tap to first visible assistant text.
- Smoother streaming on long threads.
- Fewer frame drops while the assistant is generating.
- Typewriter output that follows provider output without overwhelming React Native rendering.
- More predictable prompt length, memory usage, retrieval work, and provider cache behavior.
- Better diagnostics when a reply is slow.

The implementation must preserve Pixory's product direction:

- Android-first mobile chat.
- Local SQLite chat, memory, role, branch, and material data.
- SecureStore for local provider secrets.
- Strong Personal space isolation.
- Companion-style role continuity and memory trust.
- Recoverable streaming when stopped, failed, backgrounded, or route-changed.

## Current Findings

Pixory already has several good foundations:

- `AiMessageContent` skips markdown parsing while a message is streaming.
- `AiChatScreen` has an indexed streaming patch path through `messageIndexByIdRef`.
- Chat history is capped by `CHAT_HISTORY_MESSAGE_LIMIT`.
- `trimMessagesToContextBudget` exists and has a conservative CJK token estimator.
- Prompt cache metadata, provider cache policy, and usage analytics already exist.
- Retrieval has some availability caching.
- Streaming has UI and persistence throttles.

The remaining performance risks are:

- The active assistant message still receives the accumulated full text on every streaming UI patch.
- Each streaming state patch can still trigger React state updates, derived visible-message work, list data changes, and text layout.
- `STREAMING_PERSIST_INTERVAL_MS = 120` can write to SQLite too frequently for low-end Android devices during high-throughput streaming.
- `STREAMING_UI_PATCH_INTERVAL_MS = 80` is fixed and does not adapt to output length, scroll position, device pressure, or provider throughput.
- First-token time includes several serial preflight steps: provider/model/key resolution, branch scopes, prompt build, memory prefix, dynamic memory, retrieval, history load, context trimming, prompt cache policy, and adapter setup.
- `buildChatHistory` currently calls `trimMessagesToContextBudget` without passing the actual model context window.
- Retrieval can be unnecessary for normal chat turns that have no attached material or context-bound request.
- Stable prompt blocks are ordered well, but stable block construction and memory snapshot reuse can be improved.
- Existing prompt/cache observations focus mostly on cache behavior, not on end-to-end latency phases.

## SillyTavern Reference Patterns

The useful SillyTavern ideas are engineering patterns, not product features to copy directly.

Relevant local references:

- `D:\Project\SillyTavern\public\script.js`
- `D:\Project\SillyTavern\public\scripts\streaming-display.js`
- `D:\Project\SillyTavern\public\scripts\openai.js`
- `D:\Project\SillyTavern\public\scripts\utils.js`

Patterns to adapt:

- Separate stream processing from UI display.
- Throttle display by a frame budget, similar to SillyTavern's `streaming_fps` control.
- Track `time_to_first_token`, output token count, total generation time, and token rate.
- Avoid doing expensive text or stopping-string processing for every token when it can be prepared once.
- Assemble prompt context within explicit budgets and trim older context first.
- Treat generation diagnostics as first-class data that can explain slowness.

Patterns not to copy:

- Browser DOM assumptions.
- Desktop-first UI affordances.
- Unbounded extension hooks in the hot streaming path.
- Any behavior that weakens Personal space privacy, role trust, or local data boundaries.

## Non-Goals

- No server AI gateway in this spec.
- No Redis, hosted vector database, semantic reply cache, or cross-device prompt cache.
- No semantic caching of private companion replies, role-play replies, or Personal space final answers.
- No broad redesign of the chat screen.
- No replacement of SQLite as the local source of truth.
- No provider-key migration away from SecureStore.
- No destructive cleanup of existing chat, memory, role cards, branches, or material data.
- No switch from `FlatList` to FlashList until streaming state churn has been reduced and measured.
- No markdown parser rewrite unless measurements show final markdown rendering is still a bottleneck after streaming fixes.

## Default Decisions

These decisions close the ambiguity that would otherwise make the implementation drift.

- Low latency mode remains internal-only in the first implementation pass. No new user-facing session setting is added in this project.
- `generationMetrics` remains inside `promptSnapshotJson.generationMetrics` in the first implementation pass. A separate `ai_generation_metrics` table is allowed only if snapshot size, queryability, or retention handling becomes measurably insufficient.
- The Android baseline device is the lowest-performance Android device or emulator actually used for validation. Every report must record device model, Android version, physical-vs-emulator status, and app build type.
- If no Android device or emulator is available, Android manual validation remains explicitly unverified even if unit and integration tests pass.
- Adaptive device-pressure throttling triggers when JS frame delay exceeds 250 ms in two consecutive one-second observation windows, or when a single delay exceeds 500 ms during active streaming.
- Very long reply segmentation becomes mandatory in Phase 2 only if Phase 1 profiling shows full-string relayout is a material cause of frame delay above 4000 visible characters. If segmentation is deferred, the implementation must still pass the 10,000-character acceptance case and explain the evidence for deferral.
- New runtime dependencies for scheduling, metrics, or list rendering are disallowed by default. Add one only if existing Expo/React Native primitives cannot satisfy a measured requirement.
- Provider network latency is measured and reported, but local optimization acceptance is based on prompt preflight, rendering, persistence, prompt assembly, and recovery work that Pixory controls.

## Success Metrics

Use p50 and p95 where enough local samples exist. Metrics must be collected on Android with real long-chat data, not only empty demo threads.

Primary metrics:

- `sendToFirstVisibleTextMs`: time from send press to first assistant text displayed.
- `sendToProviderRequestMs`: time from send press to provider request dispatch.
- `providerRequestToFirstDeltaMs`: time from provider request dispatch to first provider delta.
- `firstDeltaToFirstVisibleTextMs`: UI buffering delay after the first provider delta.
- `streamUiPatchCount`: number of UI patches emitted for one reply.
- `streamPersistCount`: number of SQLite partial-content persists for one reply.
- `streamDroppedOrMergedPatchCount`: number of provider deltas merged before UI display.
- `averageUiPatchIntervalMs`.
- `outputCharsPerSecond` and provider-reported token rate when available.
- JS frame health during streaming, measured by a lightweight frame monitor or Flipper/Hermes profiling.
- Prompt input tokens, output tokens, cached input tokens, and cache hit ratio when provider reports usage.

Required target outcomes for the Android baseline device:

- Normal no-material chat must start the provider request without retrieval work.
- First visible assistant text must appear shortly after the first provider delta, without a React state storm.
- Long replies must remain readable even if the displayed typewriter speed is intentionally lower than raw provider throughput.
- Long threads with 200+ loaded messages must remain scrollable while streaming.
- Backgrounding, stopping, or route changes must not lose the latest generated content beyond the configured partial-persist interval.

Quantitative acceptance budgets:

- `firstDeltaToFirstVisibleTextMs` p95 must be <= 150 ms after Phase 2 on the Android baseline device.
- `sendToProviderRequestMs` p95 for `normal_no_material_fast_path` must be <= 700 ms, excluding user-message and assistant-placeholder SQLite durability work.
- `streamUiPatchCount` must be <= `ceil(streamVisibleSeconds * targetFps) + 2`.
- `streamPersistCount` for a 30 second foreground reply must be <= 70 with the 500 ms recoverability tier and <= 40 with the 1000 ms tier.
- Sustained JS frame delay during a 200+ message foreground stream must not exceed 250 ms more than once per 30 second generation after Phase 2.
- A 10,000 character streamed reply must keep `averageUiPatchIntervalMs` within 25% of the active scheduler tier unless device-pressure throttling is recorded.
- On stop, error, completion, route blur, or app background, the latest SQLite content must be no older than the active partial-persist interval plus one in-flight write.

## Architecture Overview

The optimized chat path must be split into five layers:

1. Generation coordinator.
   - Owns abort, stop, provider call, final status, and recoverability.
2. Prompt pipeline.
   - Builds stable prefix, memory snapshot, dynamic memory, retrieval context, history, and current user message.
3. Stream buffer.
   - Receives provider deltas and stores the authoritative in-memory streaming text.
4. Display scheduler.
   - Converts buffered deltas into UI-visible text at an adaptive frame budget.
5. Persistence scheduler.
   - Writes partial content to SQLite at a slower recoverability budget and forces writes on lifecycle events.

The hot streaming path must not require rebuilding the entire message list for every provider delta.

## Phase 1: Observability And Measurement

### Requirements

Add generation-phase timestamps and counters to the existing prompt snapshot or a structured generation metrics object.

Required timestamps:

- `sendPressedAt`
- `userMessagePersistStartAt`
- `userMessagePersistEndAt`
- `assistantPlaceholderPersistStartAt`
- `assistantPlaceholderPersistEndAt`
- `generationStartAt`
- `providerResolveStartAt`
- `providerResolveEndAt`
- `branchResolveStartAt`
- `branchResolveEndAt`
- `memoryResolveStartAt`
- `memoryResolveEndAt`
- `retrievalStartAt`
- `retrievalEndAt`
- `historyLoadStartAt`
- `historyLoadEndAt`
- `promptBuildStartAt`
- `promptBuildEndAt`
- `providerRequestSentAt`
- `firstProviderDeltaAt`
- `firstUiPatchAt`
- `lastProviderDeltaAt`
- `finalPersistStartAt`
- `finalPersistEndAt`
- `generationSettledAt`

Required derived durations:

- `sendToProviderRequestMs`
- `providerRequestToFirstDeltaMs`
- `sendToFirstDeltaMs`
- `firstDeltaToFirstUiPatchMs`
- `sendToFirstVisibleTextMs`
- `promptPipelineMs`
- `retrievalMs`
- `memoryMs`
- `historyLoadMs`
- `finalizationMs`
- `totalGenerationMs`

Required streaming counters:

- `providerDeltaCount`
- `answerDeltaCount`
- `reasoningDeltaCount`
- `streamUiPatchCount`
- `streamPersistCount`
- `streamMergedDeltaCount`
- `streamSkippedUiPatchCount`
- `streamSkippedPersistCount`
- `maxBufferedChars`
- `finalAnswerChars`
- `finalReasoningChars`

Required environment/context fields:

- `space`
- `threadId`
- `messageId`
- `providerId`
- `modelId`
- `chatMode`
- `contextType`
- `branchScopeCount`
- `historyMessageCount`
- `loadedMessageCountAtSend`
- `retrievalSnippetCount`
- `memoryEpoch`
- `stablePrefixEstimatedTokens`
- `totalPromptTokens`
- `cachedInputTokens`
- `cachedTokenRatio`
- `stopReason`
- `failureReason`

### Privacy Requirements

Metrics must not expose sensitive content.

Normal space may store non-content metadata needed for diagnostics.

Personal space must not export or display raw prompt text, memory text, retrieved text, document text, user message text, assistant reply text, or reversible content hashes outside the local message record that already owns the content.

Diagnostics must treat prompt snapshots and generation metrics as different surfaces:

- `generationMetrics` is the preferred object for timings, counters, and non-content flags.
- `promptSnapshotJson` may contain prompt/debug content for existing features, but diagnostics UI must read only a redacted metrics view.
- Personal space diagnostics must never render `system`, `user`, `materialRules`, retrieved snippets, memory text, or any prompt text even if those fields exist in the stored snapshot.
- If metrics are stored inside `promptSnapshotJson` for migration simplicity, they must be nested under a content-free key such as `generationMetrics`, and all UI/reporting helpers must explicitly select that key.
- Any future export or support bundle must include Personal space metrics only after applying the same redaction rules.

Allowed Personal space diagnostics:

- Numeric timings.
- Counts.
- Provider/model IDs.
- Cache ratios.
- Boolean flags.
- Non-reversible local-only opaque IDs.

### UI Requirements

Add a developer-facing diagnostics surface only if it already fits the app's debug/settings patterns. If added, it must show concise timing phases for the latest generation and must not add visual noise to the main chat surface.

At minimum, the metrics must be persisted in `promptSnapshotJson` or an equivalent local field so a developer can inspect slow replies later.

### Acceptance

- Each completed, stopped, aborted, or failed generation records phase timings.
- A slow reply can be classified as prompt preflight, provider wait, UI display, persistence, or finalization delay.
- Personal space diagnostics do not leak prompt, memory, retrieval, material, user-message, or reply content, even when the raw local prompt snapshot contains those fields.
- Diagnostics UI and analytics helpers consume a redacted `generationMetrics` view, not raw prompt text fields.
- Existing cache observation data still works.
- Unit tests cover duration derivation with missing timestamps, aborted generation, and provider failure.
- Manual Android validation captures at least one long-thread generation and confirms the timing object is present.

## Phase 2: Streaming UI Runtime And Rendering

### Requirements

Introduce a streaming runtime that separates provider deltas from React message-list state.

The active streaming message must have an authoritative live text buffer outside the full `messages` array. The message list must only receive:

- A placeholder when generation starts.
- Occasional coarse metadata updates if needed.
- Final completed/stopped/failed message state.
- Buffered updates when the user explicitly returns to the bottom or the app needs a recoverable snapshot.

The active visible text must be driven by a dedicated store or component subscription, for example:

- `useStreamingMessageStore`
- `StreamingMessageText`
- `StreamingTextController`

The exact names are implementation choices, but the contract is fixed:

- Provider deltas append to an in-memory buffer.
- UI display reads from a scheduled visible buffer.
- Historical bubbles do not rerender on every streaming tick.
- Final message content is committed back into the normal message list.
- Every streaming buffer, display update, partial persist, and final patch is scoped by `space`, `threadId`, `messageId`, and a per-attempt `generationId`.
- A delta, partial persist, or final patch with a stale `generationId` must be ignored after stop, regenerate, edit, route switch, or a newer generation for the same message.
- The final SQLite message remains the durable source of truth; the live buffer is only the current attempt's transient display and recovery helper.

### Adaptive Display Scheduler

Replace the fixed `STREAMING_UI_PATCH_INTERVAL_MS` behavior with an adaptive frame budget.

Default display targets:

- First 1000 visible chars: 20 fps maximum.
- 1000 to 4000 visible chars: 15 fps maximum.
- Over 4000 visible chars: 8 to 10 fps maximum.
- User scrolled away from bottom: 0 fps for live text; buffer only and show a "new reply" affordance.
- App backgrounded or route not focused: 0 fps for UI; persist by recoverability rules.
- Device pressure detected or JS frame delay high: reduce one tier until stable.

The scheduler must merge multiple provider deltas into one display update. If provider throughput is higher than display speed, Pixory must show a smooth readable stream rather than trying to display every delta.

### Typewriter Behavior

The typewriter effect must be display-rate limited, not provider-rate limited.

Required behavior:

- The assistant text appears quickly after the first provider delta.
- Output must advance in chunks sized by elapsed time and buffered content, not necessarily one provider token at a time.
- The visible cursor remains inline.
- The active streaming text must not be `selectable`; selectable text can return after completion.
- Markdown parsing remains disabled during streaming.
- The final completed message renders with normal markdown and code-block actions.

### Long Reply Segmentation

For long active replies, avoid relayouting one huge text node at high frequency.

Implementation options:

- Segment visible text into stable chunks plus a small active tail.
- Freeze completed paragraphs while only updating the latest tail.
- Render the active tail as plain text and commit older segments less frequently.

Required behavior:

- A 10,000 character reply does not require relayouting the full string at high fps.
- Final content remains a single canonical message in SQLite.
- Copy, markdown, citations, and versioning behavior after completion remains unchanged.

Decision rule:

- If Phase 1 profiling shows full-string text layout is a material contributor to JS/UI frame delay for replies above 4000 visible characters, Phase 2 must include paragraph/tail segmentation.
- If profiling shows the scheduler split is sufficient, segmentation may remain deferred, but the implementation must still prove the 10,000 character acceptance case.

### Persistence Scheduler

Replace very frequent partial SQLite writes with a recoverability budget.

Default partial persist targets:

- Normal foreground streaming: every 500 to 1000 ms.
- Very long replies: every 1000 to 1500 ms after the first 4000 chars.
- User stop: force persist before marking stopped.
- Provider error: force persist before marking failed.
- Completion: force final persist.
- App background, route blur, or process-risk lifecycle event: force persist as soon as possible.

Partial persists must never block UI display. If a persist is already in flight, merge the next snapshot and write the latest content once the current write completes.

### Message List Interaction

Required behavior:

- If the user stays bottom-locked, the visible streaming text updates in place.
- If the user scrolls away, Pixory buffers streaming changes and does not keep mutating visible historical list data.
- Returning to bottom flushes the latest buffered text.
- `FlatList` data identity must not change for every streaming tick.
- Historical bubbles must not rerender just because the active assistant text changed.

### FlashList Decision Rule

Do not switch to FlashList as the first optimization.

FlashList may be evaluated after:

- Streaming live text is split from full message state.
- UI patch count is reduced.
- Persistence frequency is reduced.
- A long-thread profile still shows list virtualization as the primary bottleneck.

FlashList evaluation is blocked until:

- Phase 1 metrics exist for long-thread streaming.
- Phase 2 has already split live streaming state from the message list.
- The implementation report shows that list virtualization, not text relayout or state churn, is the remaining dominant cost.

### Acceptance

- Streaming no longer updates the full `messages` array for every display tick.
- Historical message rows do not rerender during active streaming except for intentional status changes.
- `streamUiPatchCount` is bounded by the adaptive fps target.
- `streamPersistCount` for a 30 second reply is <= 70 with the 500 ms tier and <= 40 with the 1000 ms tier, not one write per provider burst.
- A 200+ message thread remains scrollable while generating.
- A 10,000 character assistant reply streams on Android with no more than one sustained JS frame delay above 250 ms per 30 second generation, unless adaptive device-pressure throttling is recorded.
- Stopping, provider failure, app backgrounding, and completion all leave recoverable SQLite content.
- Stale deltas and final patches from old `generationId` values cannot mutate the active UI buffer or final message after stop, regenerate, edit, or route switch.
- Final markdown rendering still works after streaming completes.
- Existing message actions, branch actions, regenerate/edit flows, citations, and favorite/search behavior continue to work.

## Phase 3: First-Token Latency And Prompt Pipeline

### Requirements

Optimize the path before the provider request is sent.

The default normal chat fast path must avoid work that is not required for the current turn.

### Fast Path Classification

Add a preflight classifier before prompt construction.

Inputs:

- Thread context type.
- Current user message.
- Whether the user attached or referenced materials.
- Whether the thread is IP-bound or knowledge-base-bound.
- Whether deep memory is enabled.
- Whether role card requires material context.
- Whether retrieval was recently used.
- Whether the prompt mode is low-latency.

Outputs:

- `normal_no_material_fast_path`
- `normal_memory_only`
- `material_keyword_only`
- `material_full_retrieval`
- `ip_context_retrieval`
- `knowledge_base_retrieval`
- `long_companion_context`

Required behavior:

- Normal chat with no material requirement must skip retrieval.
- Fast path is fail-closed: if the classifier cannot prove that retrieval is unnecessary, it must choose `material_keyword_only` or the relevant material-bound mode instead of `normal_no_material_fast_path`.
- `normal_no_material_fast_path` is allowed only when the thread is not IP-bound or knowledge-base-bound, there are no current attachments, no role-card material dependency, no explicit material/document/image/reference wording in the user message, and no unresolved recent citation/material dependency needed for the current turn.
- Deep memory disabled must skip deep-memory queries.
- Dynamic memory must have a small time budget and degrade gracefully.
- Retrieval must never block the provider request indefinitely.

### Prewarm

Prewarm lightweight dependencies when entering or focusing a chat thread:

- Current provider.
- Current model.
- Provider key availability status, without exposing the key.
- Thread role/session settings.
- Deep memory settings.
- Prompt cache settings.
- Model context window.
- Current branch route.

Prewarm results must be invalidated on:

- Provider setting changes.
- Model changes.
- Role card/session prompt changes.
- Memory epoch changes.
- Thread branch route changes.
- Space changes.
- Personal space lock/unlock state changes.

### Retrieval Tiering

Retrieval must be tiered:

1. No retrieval for normal fast path.
2. Keyword or FTS retrieval with strict result and time bounds.
3. Embedding/vector retrieval only when material context is required or keyword retrieval is insufficient.
4. Full material context only for explicitly material-bound threads or requests.

Default time budgets:

- Keyword retrieval: 80 to 150 ms target.
- Embedding availability check: cached when possible.
- Embedding request: skipped unless required; otherwise bounded with timeout.
- Vector similarity in JavaScript: bounded by candidate count.

Required behavior:

- Retrieval returns partial results when the budget is hit.
- Prompt snapshot records whether retrieval was skipped, timed out, partial, or full.
- Retrieval failures degrade to normal chat when safe, with diagnostics.

### Memory Pipeline

Memory must be split into stable and dynamic layers:

- Stable memory snapshot: cached by `space`, `threadId`, `roleId`, `memoryEpoch`, and relevant scope.
- Dynamic memory context: small, recent, and time-bounded.
- Memory maintenance after reply: deferred and coalesced, never blocking first token.

Required behavior:

- Stable memory snapshot is reused within the same memory epoch.
- Dynamic memory has a token cap and query cap.
- Memory extraction, title generation, summary compression, profile updates, and usage analysis do not delay provider request dispatch for the current turn.

### Context Budget

Pass the actual model context window into history trimming.

Required behavior:

- `buildChatHistory` or equivalent logic passes `modelContextWindowTokens` to `trimMessagesToContextBudget`.
- Protected prompt text includes stable system, role, memory snapshot, retrieval context, and current user message estimates.
- The latest user request and role identity are protected.
- Oldest eligible history is trimmed first.
- Prompt snapshot records count-based trimming and budget-based trimming separately.

### Provider Request Dispatch

The provider request must be sent as soon as:

- User and assistant placeholder records are durable.
- Provider/model/key are resolved.
- Required prompt layers are built.
- Required fast-path retrieval or memory work has either completed or timed out.

Work that can be safely deferred must not run before `providerRequestSentAt`.

Defer by default:

- Model-generated title.
- Memory maintenance.
- Usage summary aggregation.
- Expensive diagnostics formatting.
- Non-critical material metadata refresh.
- Non-visible cache analytics rollups.

### Acceptance

- Normal no-material chat records `retrievalSkippedReason = normal_fast_path`.
- Classifier tests prove ambiguous references such as "the document", "that image", "the setting above", "according to the material", and recent citation follow-ups do not enter `normal_no_material_fast_path`.
- First-token diagnostics show separate provider wait and preflight durations.
- `buildChatHistory` uses the actual model context window when available.
- Retrieval timeouts do not fail ordinary chat unless the thread requires material grounding.
- Stable memory snapshot reuse is observable by memory epoch.
- Title generation and memory maintenance are not on the critical path before the provider request.
- Long-chat prompts preserve role identity, current user request, and required material rules while trimming older history.
- Unit tests cover fast-path classification, retrieval timeout fallback, model-window context trimming, and deferred post-reply jobs.

## Phase 4: Prompt Design, Cache Behavior, And Product Modes

### Prompt Layer Contract

Prompt assembly must keep stable reusable content before dynamic content.

Recommended order:

1. `stable_app_policy`
2. `stable_role`
3. `stable_material_rules`
4. `stable_tool_definitions`
5. `memory_snapshot`
6. `history_window`
7. `dynamic_memory`
8. `retrieval_context`
9. `current_user_message`

Required behavior:

- Role card prompt remains separate from material rules.
- Stable memory snapshot changes only by explicit epoch or scoped data change.
- Dynamic retrieval content stays near the end and does not poison reusable prompt prefixes.
- No timestamps, request IDs, random values, volatile retrieval text, or per-turn diagnostics are inserted into reusable stable prefix blocks.
- Cache keys include provider, model, prompt version, memory epoch, retrieval version, scope, branch route, and generation parameters where relevant.

### Product Modes

Add or formalize prompt/performance modes as internal execution profiles first. In this project they are not exposed as new user-facing settings.

#### Low Latency Mode

Use when the user prioritizes speed.

Behavior:

- Disable thinking/reasoning when provider supports it.
- Lower max output target.
- Use normal fast path unless material grounding is required.
- Reduce dynamic memory and retrieval budget.
- Use lower display fps after the first visible text.
- Prefer provider cache-friendly stable prefix.

Acceptance:

- Low latency mode changes generation parameters and prompt pipeline behavior without weakening role safety.
- Prompt snapshot records `chatPerformanceMode = low_latency`.

#### Balanced Companion Mode

Default mode.

Behavior:

- Preserve role identity and emotional continuity.
- Use stable memory snapshot and bounded dynamic memory.
- Use retrieval only when context indicates it is useful.
- Keep streaming readable and smooth.

Acceptance:

- Existing default chat behavior remains recognizable.
- Fast path applies to ordinary turns.
- Memory and role continuity remain stable.

#### Long Companion Mode

Use for long-running role or companionship sessions.

Behavior:

- Stronger summary/profile/memory layering.
- Clear token caps per layer.
- Conservative dynamic retrieval.
- More aggressive old-history trimming.
- Prefer stable prefix reuse.

Default token cap guidance:

- Stable role and app policy: protected.
- User profile: 300 to 800 tokens.
- Thread summary: 800 to 2000 tokens.
- Stable memories: 500 to 1500 tokens.
- Dynamic memory: 300 to 800 tokens.
- Retrieval context: 800 to 2000 tokens when needed.
- Recent history: remaining budget after protected layers.

Acceptance:

- Long companion prompts do not grow unbounded with thread length.
- Role identity, user profile, and current request survive history trimming.
- Prompt snapshot explains layer token estimates and trimming.

#### Material Grounding Mode

Use for IP-bound or knowledge-base-bound turns.

Behavior:

- Material rules stay in stable prompt blocks.
- Retrieved snippets stay dynamic and near the end.
- Citations remain tied to final answer.
- If required retrieval fails, the model must be instructed to be transparent rather than hallucinating material facts.

Acceptance:

- Required material grounding is not silently skipped.
- Retrieval failure or partial retrieval is visible in prompt snapshot.
- Citations still work after final response.

### Cache Policy

Follow the Pixory cache hierarchy:

1. Exact local cache for deterministic sub-tasks.
2. Provider prompt/prefix caching.
3. Embedding and retrieval cache.
4. Carefully scoped semantic cache only for low-risk non-private tasks.
5. Self-hosted KV cache only in future server work.

Allowed cache targets in this spec:

- Prompt block hashes and metadata.
- Stable memory snapshot by epoch.
- Provider prompt cache hints.
- Retrieval results by scoped query and document version.
- Embeddings and embedding availability.
- Deterministic sub-task outputs such as generated title, summary compression, and memory extraction when scoped safely.

Disallowed cache targets:

- Final private companion replies.
- Personal space final answers.
- Role-play answer semantic cache.
- Cross-space semantic reuse.
- Cache keys that omit memory epoch, branch route, scope, or document version.

### Acceptance

- Prompt layers follow the stable-before-dynamic order.
- Stable prefix hashes remain unchanged across adjacent turns when role, memory epoch, and stable settings do not change.
- Dynamic retrieval changes do not change stable prefix hash.
- Provider cache observations remain compatible with existing usage analytics.
- No semantic final-answer cache is introduced for private companion chat.
- Personal space cache metadata remains local and content-safe.

## Additional Optimizations

These optimizations are lower priority than the four phases, but they must be considered during implementation and either completed or explicitly deferred in the implementation report.

### Active Text Layout

- Disable text selection while streaming.
- Avoid full markdown parsing during streaming.
- Consider paragraph/tail segmentation for very long replies.
- Avoid recalculating code block state until completion.

Acceptance:

- Streaming text is plain, non-selectable, and cheap.
- Completed text remains selectable and feature-complete.

### Stop String And Output Cleanup

If provider adapters need stop-string cleanup, prepare stop strings once per request.

Acceptance:

- Per-delta cleanup does not rebuild stop rules.
- Final cleanup remains correct.

### Request Coalescing

Avoid duplicate post-reply jobs for the same thread and generation.

Acceptance:

- Rapid stop/regenerate/edit flows do not spawn redundant title or memory jobs.

### Lifecycle Recovery

Generation state must remain recoverable across:

- App background.
- Route blur.
- Stop button.
- Provider stream error.
- Network interruption.
- Thread switch.

Acceptance:

- Latest partial content is recoverable within the configured persist interval.
- The UI shows a coherent stopped/failed/completed state after recovery.

### Android Device Pressure

Add a lightweight frame-delay monitor or use available profiler hooks during development.

Acceptance:

- When sustained JS frame delay exceeds the threshold, display fps is reduced.
- Diagnostics record that adaptive throttling occurred.

### List Virtualization

After streaming-state split, profile whether `FlatList` remains sufficient.

Acceptance:

- FlashList migration is backed by measurements, not assumption.
- If `FlatList` remains sufficient, no list-library change is made.

## Data Model And Storage

Preferred approach:

- Keep content-free `generationMetrics` in `promptSnapshotJson` initially for low migration risk.
- If metrics become too large or need querying, add a local SQLite table such as `ai_generation_metrics`.

Storage boundary:

- `generationMetrics` must be a content-free object containing only timings, counters, non-content flags, provider/model IDs, and opaque local IDs.
- Prompt text, user text, assistant text, memory text, material text, retrieved snippet text, and reversible content hashes must not be copied into `generationMetrics`.
- Personal space diagnostics UI and any future export/reporting path must read only the redacted `generationMetrics` object, never raw prompt snapshot content.

If a table is added, it must include:

- `id`
- `space`
- `threadId`
- `messageId`
- `providerId`
- `modelId`
- `createdAt`
- `metricsJson`

Indexes:

- `(space, threadId, createdAt)`
- `(space, messageId)`

Retention:

- Metrics are local diagnostic data.
- Metrics are deleted when the owning message/thread is deleted according to the app's deletion model.
- Personal space metrics remain in Personal space storage boundaries.

## Testing Strategy

### Unit Tests

Cover:

- Metrics duration derivation.
- Missing timestamp handling.
- Fast-path classification.
- Retrieval skipped/timeout/partial/full states.
- Context trimming with actual model window.
- Stable prefix hash invariance.
- Dynamic retrieval not changing stable prefix hash.
- Memory snapshot cache invalidation by memory epoch.
- Streaming scheduler fps tiers.
- Persistence scheduler coalescing.

### Integration Tests

Cover:

- Normal no-material chat generation.
- Material-bound generation with citations.
- Long companion generation with memory enabled.
- Stop while streaming.
- Provider error while streaming.
- App background or route blur while streaming. If the current test infrastructure cannot simulate this reliably, mark this acceptance unverified and cover it in manual Android validation.
- Regenerate/edit path after a streamed reply.

### Manual Android Validation

Use real Android validation with:

- A short normal thread.
- A 200+ message long thread.
- A thread with a 10,000 character assistant reply.
- A material-bound thread.
- A Personal space thread.

Validate:

- First visible text timing.
- Scroll smoothness while generating.
- No obvious typewriter backlog.
- Stop and recovery behavior.
- Final markdown rendering.
- Prompt snapshot diagnostics.
- Personal space privacy.

### Profiling

Before and after implementation, collect:

- Hermes/Flipper or equivalent JS profile during streaming.
- UI patch count.
- SQLite partial persist count.
- First token phase timings.
- Long-thread scroll behavior.

## Rollout Plan

### Step 1: Instrument Only

Add metrics without changing behavior.

Exit criteria:

- Slow replies can be attributed to preflight, provider, UI, persistence, or finalization.
- No sensitive content leaks through diagnostics.
- No later phase starts until at least one normal chat run, one long-thread run, and one Personal space run produce valid timing objects.

### Step 2: Streaming Runtime

Split live streaming text from full message-list state.

Exit criteria:

- UI patch and historical rerender counts drop.
- Long-thread streaming remains smooth.
- Recovery behavior is unchanged or improved.
- If the 10,000-character case still fails and profiling points to full-string relayout, segmentation is no longer optional in this phase.

### Step 3: First-Token Fast Path

Add fast-path classification, retrieval tiering, prewarm, and model-window budget use.

Exit criteria:

- Normal no-material chat skips retrieval.
- Provider request dispatch happens earlier.
- Required material grounding remains correct.
- Fast-path classification has regression coverage for ambiguous material references and recent citation follow-ups.

### Step 4: Prompt Modes And Cache Refinement

Formalize performance modes, stable prompt contract, and cache invariants.

Exit criteria:

- Stable prefix reuse is observable.
- Low latency and long companion modes are testable.
- No private final-answer semantic cache is introduced.
- No new user-facing mode settings are added in this phase.

## Phase Gates

Each phase must close before the next phase is considered accepted.

### Gate 1: Instrumentation Complete

Required:

- Required timing fields exist.
- Required counters exist.
- Personal space diagnostics are redacted correctly.
- At least one normal, one long-thread, and one Personal space run have recorded data.

Blocks:

- Any claim about first-token improvement.
- Any claim about rendering improvement.
- Any decision to add FlashList, segmentation, or new dependencies.

### Gate 2: Streaming Runtime Complete

Required:

- Message-list churn is reduced on the active streaming path.
- Partial persistence follows the configured recoverability budget.
- Old `generationId` patches cannot mutate the current UI or final message.
- The 200+ message and 10,000-character validation cases pass, or the report explains exactly which acceptance remains open and why.

Blocks:

- Any claim that long-chat lag is solved without long-thread validation evidence.
- Any shift into prompt-mode productization before stream/runtime regressions are closed.

### Gate 3: First-Token Pipeline Complete

Required:

- Fast-path classification is in place.
- Retrieval tiering is measured.
- Actual model context window is used in trimming.
- Deferred post-reply jobs are off the provider-request critical path.

Blocks:

- Any claim that first-token latency is improved without before/after timing on the same provider/model path.

### Gate 4: Prompt And Cache Refinement Complete

Required:

- Stable prefix invariants are verifiable.
- Memory epoch reuse is observable.
- No forbidden semantic final-answer cache exists.
- Role continuity and material-grounding behavior still pass validation.

Blocks:

- Any UX or setting expansion beyond the internal execution profiles defined here.

## Global Acceptance Criteria

This spec is accepted when all of the following are true:

- Every generation records enough local metrics to diagnose first-token, streaming, persistence, and finalization delay.
- Normal no-material chat has a measured fast path that skips retrieval.
- Ambiguous material/document/image/reference requests fail closed into keyword or material retrieval rather than the normal fast path.
- Streaming display is decoupled from provider delta rate.
- Streaming display is decoupled from full message-list state updates.
- Partial SQLite persistence is slower, coalesced, and lifecycle-safe.
- Long replies do not repeatedly relayout one huge text node at high fps.
- Streaming buffers and final patches are guarded by `space`, `threadId`, `messageId`, and `generationId`.
- Actual model context window is used for context-budget trimming when available.
- Stable prompt prefix remains stable across adjacent compatible turns.
- Prompt cache observations remain compatible with existing cache analytics.
- Personal space diagnostics and caches do not leak content; diagnostics consume redacted `generationMetrics`, not raw prompt text fields.
- Role card identity, memory trust, branches, citations, stop/regenerate/edit flows, and final markdown rendering still work.
- Android manual validation passes on long chat, long reply, material-bound chat, and Personal space chat.
- `pnpm typecheck`, `pnpm test`, and `git diff --check` pass for the implementation changes.

## Risks And Mitigations

Risk: Splitting live text state from message state may create consistency bugs.

Mitigation:

- Keep SQLite and final message state as the source of truth.
- Force final commit on completion, stop, failure, and lifecycle events.
- Test regenerate/edit/version flows after streamed completion.

Risk: Lower display fps may feel slower even if provider output is fast.

Mitigation:

- Show first visible text quickly.
- Use adaptive chunk size so output remains readable and does not lag far behind.
- Record buffered char backlog and tune thresholds.

Risk: Skipping retrieval on the fast path could reduce answer grounding.

Mitigation:

- Only skip retrieval for normal no-material turns.
- Material-bound and explicit material-reference turns keep required retrieval.
- Record skip reason in diagnostics.

Risk: Metrics could leak private information.

Mitigation:

- Store counts and timings, not content.
- Apply stricter Personal space diagnostics.
- Do not export prompt text, memory text, retrieval text, or content hashes.

Risk: Prompt mode changes could weaken companion continuity.

Mitigation:

- Keep role identity and current user request protected in every mode.
- Add tests for prompt layer ordering and protected context.

## Resolved Decisions

- Low latency mode remains internal-only for this project.
- The Android baseline device is the lowest-performance Android device or emulator actually used during validation, and it must be named in reports.
- `generationMetrics` stays inside `promptSnapshotJson.generationMetrics` for the first implementation pass unless that approach proves measurably insufficient.
- Adaptive device-pressure throttling uses the thresholds defined in `Default Decisions`.
- Very long streaming segmentation is conditional on Phase 1 profiling evidence, but the 10,000-character acceptance case is unconditional.
