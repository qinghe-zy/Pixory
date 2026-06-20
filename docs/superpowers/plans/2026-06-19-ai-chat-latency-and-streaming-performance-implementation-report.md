# AI Chat Latency And Streaming Performance Implementation Report

Date: 2026-06-19

## Status

Automated implementation acceptance for Phase 0/1/2/3/4 is complete.

Full spec acceptance is not complete because Android device/manual validation and real runtime sample metrics were not available in this environment. `D:\Develop\Android\Sdk\platform-tools\adb.exe devices` returned no connected device or emulator.

## Completed Scope

### Phase 0/1 Baseline And Metrics

- Added content-free `generationMetrics` under `promptSnapshotJson.generationMetrics`.
- Threaded real `sendPressedAt` from `AiChatScreen` through `aiGenerationManager` into generation service calls.
- Recorded provider resolve, branch resolve, prompt build, memory resolve, retrieval, history load, provider request, first provider delta, first UI patch, final persistence, and generation settle timestamps.
- Recorded streaming UI patch and persistence counters.
- Kept `generationMetrics` out of prompt construction, provider prompts, prompt cache metadata, stable prefix hashes, provider cache policy inputs, and usage/cache-hit query windows.
- Sanitized failure metrics into stable codes rather than raw provider/user-visible text.

### Phase 2 Streaming Runtime And Rendering

- Added adaptive streaming runtime tiers:
  - Up to 1000 visible chars: 20fps.
  - 1000-4000 visible chars: 15fps.
  - Above 4000 visible chars: 10fps.
  - Under repeated JS event-loop pressure, tiers back off to 12/10/8fps and record `devicePressureThrottled`.
  - Non-visible/background-style state can return 0fps/null patch interval.
- Added a generation-scoped external streaming message store.
- Active assistant text now updates through `AiStreamingMessageText` subscriptions instead of replacing the full messages array on every streaming tick.
- Active assistant reasoning text now uses the same generation-scoped external store, so reasoning-only early deltas do not disappear behind the full-message-array throttling optimization.
- Streaming patches and `onCreated` callbacks carry `generationId`.
- Screen-side stale patch handling rejects mismatched generation/thread/message patches.
- Partial SQLite persistence uses the runtime recoverability interval instead of the previous fixed high-frequency interval.
- Streaming still bypasses markdown parsing; completed messages continue through normal markdown/code/citation/action rendering.
- Read-history buffering and no-forced-scroll behavior are preserved.

### Phase 3 First Token And Prompt Pipeline

- Added fast-path classification:
  - `normal_no_material_fast_path`
  - `normal_memory_only`
  - `material_keyword_only`
  - `material_full_retrieval`
  - `ip_context_retrieval`
  - `knowledge_base_retrieval`
  - `long_companion_context`
- Normal chat without a material reference skips retrieval and records `retrievalSkippedReason = normal_fast_path`, even if thread materials exist but are not referenced by the current turn.
- `normal_memory_only` is now reachable when deep memory is enabled, while still skipping material retrieval unless the current turn references materials.
- Ambiguous material references such as `这个文档`, `那张图`, `上面的设定`, and `according to the material` fail closed into bounded keyword retrieval.
- Explicit material references use full thread-material retrieval when thread materials exist, while material keywords without attached thread materials use keyword retrieval.
- Long companion classification is reachable by passing real completed message count into the classifier.
- Retrieval now supports skipped, keyword, and full/hybrid tiers with timeout/partial metrics.
- Prompt history trimming now uses the resolved model context window and preserves stable prompt, role/memory/retrieval context, and current user request as protected prompt content.
- Prompt block trimming treats `current_user_message` as required and skips trimming it, so context fitting cannot remove the active user request.
- Conservative context budget no longer exceeds the actual resolved model context window.
- Prompt blocks are also fit to the resolved model context window before cache policy and provider request construction; trimmed prompts rebuild cache metadata, stable blocks, system prompt, and user prompt from the same post-trim layers.

### Phase 4 Prompt Modes And Cache Invariants

- Added internal-only performance profiles:
  - `balanced_companion`
  - `low_latency`
  - `long_companion`
  - `material_grounding`
- No user-visible latency/performance setting was added.
- Prompt layers are fixed in the required order:
  1. `stable_app_policy`
  2. `stable_role`
  3. `stable_material_rules`
  4. `stable_tool_definitions`
  5. `memory_snapshot`
  6. `history_window`
  7. `dynamic_memory`
  8. `retrieval_context`
  9. `current_user_message`
- OpenAI prompt cache key now includes provider, model, prompt version, stable prefix hash, memory epoch, retrieval version, scope, branch route, and generation params.
- Dynamic retrieval changes `retrievalHash` without entering `stablePrefixHash`.
- Role instructions and reply preference live in `stable_role`; memory snapshots no longer carry role prompt text.
- Semantic final-answer caches remain forbidden for private companion, Personal space, and role-play replies.

## Review Findings Fixed

- Fixed stale generation identity gaps for regenerate/resubscribe by forwarding and replaying `generationId`.
- Fixed durable SQLite writes so streaming partial/final/error/stop/background flush paths are guarded by current `generationId`.
- Tightened generation-guarded message writes to a repository-level conditional update against the stored generation token, reducing the read-then-write stale race window.
- Fixed finalization so a stale generation whose final message write is rejected does not continue to emit final UI patches, update titles, or schedule memory maintenance.
- Fixed regenerate initialization so the reused assistant row is reset to `generating` with a fresh generation guard before streaming starts.
- Fixed streaming live text selection during generation by disabling selection in the lightweight streaming text component.
- Fixed streaming reasoning/text split so both answer and reasoning deltas are driven by the external generation-scoped store without reintroducing full message-array updates on every tick.
- Fixed settled-stream cleanup ordering so completed markdown/citation rendering reloads before clearing the live store, avoiding a blank/loading flicker between live text and final message rendering.
- Fixed pending final reload identity handling so a delayed read-history flush cannot clear a newer generation's live store.
- Fixed new-generation startup so old buffered streaming/read-state cannot throttle the next reply to 0fps.
- Fixed app background, route-unmount, and local abort paths to flush the latest external streaming snapshot before clearing the live buffer.
- Tightened route visibility from mounted-only to current-thread/current-generation/app-active visibility, so blurred or stale routes buffer instead of patching UI.
- Added lightweight JS event-loop pressure sampling that reduces streaming target FPS and records throttling diagnostics without adding a dependency.
- Reduced partial-persist SQLite pressure by skipping FTS maintenance for generation-guarded partial/background/prompt-snapshot-only writes while keeping final completed writes indexed.
- Fixed metrics failure reasons so provider/private text is not stored in diagnostic metrics.
- Fixed fast-path input wiring so thread material document presence, completed message count, and memory-enabled state are passed into production classification.
- Fixed normal thread material retrieval so thread materials are retrieved only when the current turn references materials; mere material presence no longer slows unrelated companion replies.
- Fixed ambiguous material reference precedence so phrases like `这个文档` stay on bounded keyword retrieval instead of being upgraded to full retrieval by generic document keywords.
- Fixed first visible text metrics so reasoning-only early deltas can set `firstUiPatchAt`.
- Fixed user-stop metrics so stop-button aborts are recorded as `user_stopped` instead of generic `aborted`.
- Fixed abort-check snapshot construction so `stopReason` and `generationSettledAt` are only written when the abort path is actually taken, not while merely checking for abort before handling another error path.
- Fixed OpenAI `prompt_cache_key` to include prompt version.
- Fixed context budget lower bound and prompt block trimming so small model windows are not exceeded by retained history or protected prompt content.
- Fixed prompt layer semantics so role instructions stay in `stable_role`, memory snapshots contain only memory-like context, and current user messages are never trimmed by prompt block fitting.
- Fixed long companion mode reachability.
- Final narrow re-review found no remaining findings for the prior material fast-path and prompt context-window P1s.

## Automated Verification

- `node --test tests/ai-chat-fixes-policy.test.cjs`
- `node --test tests/ai-chat-first-token-pipeline-policy.test.cjs tests/ai-chat-prompt-mode-cache-invariants-policy.test.cjs tests/ai-prompt-cache-policy.test.cjs`
- `node --test tests/ai-chat-first-token-pipeline-policy.test.cjs tests/ai-rag-policy.test.cjs tests/ai-chat-prompt-mode-cache-invariants-policy.test.cjs tests/ai-prompt-cache-policy.test.cjs`
- `pnpm test`
  - Result: 501/501 passing.
- `pnpm typecheck`
  - Result: passed.
- `git diff --check`
  - Result: passed; Git reported LF-to-CRLF working-copy warnings only.
- `D:\Develop\Android\Sdk\platform-tools\adb.exe devices`
  - Result: no connected device/emulator.

## Android Acceptance

Unverified.

The required Android scenarios were not executed because no device or emulator was connected:

- Short normal chat.
- 200+ message long thread.
- 10,000-character streamed reply.
- Material-bound thread with citations.
- Personal space thread.
- Stop while streaming.
- Provider error or simulated error.
- Regenerate/edit after streamed reply.

## Runtime Sample Metrics

Unverified.

No real on-device generation samples were captured for:

- Normal chat.
- Long-thread chat.
- Personal space chat.
- `sendToProviderRequestMs`.
- `providerRequestToFirstDeltaMs`.
- `firstDeltaToFirstUiPatchMs`.
- `streamUiPatchCount`.
- `streamPersistCount`.
- `cachedTokenRatio`.

The instrumentation and policy tests are in place, but real baseline/sample values still need device execution.

## Deliberate Deferrals

- No server gateway was added.
- No private companion final-answer semantic cache was added.
- No Personal space final-answer cache was added.
- No role-play answer semantic cache was added.
- No FlashList migration was added.
- No markdown parser rewrite was added.
- No user-visible low-latency setting was added.

## Changed Area Summary

- Streaming runtime/store/UI:
  - `src/ai/aiStreamingRuntime.ts`
  - `src/ai/aiStreamingMessageStore.ts`
  - `src/components/ai/AiStreamingMessageText.tsx`
  - `src/components/ai/AiMessageBubble.tsx`
  - `src/screens/AiChatScreen.tsx`
- Generation service and manager:
  - `src/ai/aiChatService.ts`
  - `src/ai/aiGenerationManager.ts`
  - `src/ai/aiGenerationMetrics.ts`
- Prompt, retrieval, cache, and budget:
  - `src/ai/aiChatFastPath.ts`
  - `src/ai/aiChatPerformanceMode.ts`
  - `src/ai/aiPromptCache.ts`
  - `src/ai/aiRetrievalService.ts`
  - `src/ai/aiContextBudget.ts`
  - `src/ai/promptBuilder.ts`
  - `src/database/repositories/aiKnowledgeRepository.ts`
  - `src/database/repositories/aiThreadRepository.ts`
- Policy and acceptance tests:
  - `tests/ai-chat-streaming-runtime-policy.test.cjs`
  - `tests/ai-chat-first-token-pipeline-policy.test.cjs`
  - `tests/ai-chat-prompt-mode-cache-invariants-policy.test.cjs`
  - `tests/ai-chat-latency-metrics-policy.test.cjs`
  - `tests/ai-chat-cache-hit-protection-policy.test.cjs`
  - `tests/ai-chat-latency-final-acceptance-policy.test.cjs`
  - Existing AI chat/cache policy tests updated for the new runtime contracts.
