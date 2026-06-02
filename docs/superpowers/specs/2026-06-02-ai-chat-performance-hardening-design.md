# AI Chat Performance Hardening Design

## Goal

Harden Pixory AI chat against extreme long-thread scenarios without changing its local-only product model. The work reduces avoidable latency from branch lineage loading, streaming UI patches, material retrieval, and background memory maintenance while preserving existing chat behavior.

## Context

Pixory already has strong long-chat defenses:

- `AiChatScreen` loads messages in pages of 60 and renders them through an inverted `FlatList` with bounded virtualization props.
- `aiChatService` caps short-term chat history at 30 messages and applies `trimMessagesToContextBudget`.
- active memory lookup uses SQLite FTS through `searchActiveMemoryFts`.
- memory maintenance is asynchronous and already coalesces repeated jobs for the same `space:threadId`.

The remaining risks are local hot paths that can still grow with loaded message count, branch depth, document chunk count, or background task concurrency.

## Scope

This design covers four targeted improvements:

1. Replace application-layer branch lineage walking with a single SQLite recursive query.
2. Reduce streaming patch work when many historical messages are loaded.
3. Bound material retrieval work before every AI request.
4. Make memory maintenance globally polite while preserving per-thread coalescing.

The implementation must remain Android-first, offline-capable, and local-only. It must not add cloud sync, accounts, a backend, server storage, or new AI generation features.

## Non-Goals

- Replacing `FlatList` with another list library.
- Redesigning the AI chat screen.
- Changing model/provider selection.
- Changing the 30-message context cap.
- Adding semantic search features or a new embedding provider.
- Reworking memory summary prompts or user-facing memory semantics.
- Performing destructive cleanup of existing chat history or material data.

## Current Risks

### Branch Lineage N+1 Query

`resolveBranchLineage` currently walks parent branch roots in JavaScript and performs one `SELECT` per lineage level. This is acceptable for shallow branches, but a deeply nested branch route can produce many sequential JS-to-SQLite round trips during chat entry, route sync, regeneration, branch tree navigation, and branch selection.

### Streaming Patch Array Walk

`applyStreamingMessagePatch` currently maps over the whole loaded `messages` array for each streaming UI patch. FlatList virtualization bounds mounted rows, but it does not eliminate JavaScript state-array work. If a user loads many earlier pages, frequent streaming patches can become a UI-thread pressure point.

### Material Retrieval Candidate Growth

`retrieveForThread` runs before AI requests and combines keyword search, IP context snippets, query embedding, vector retrieval, and snippet loading. Current vector retrieval can load every matching embedding row for the owner and compute cosine similarity in JavaScript. Large material collections can increase request preflight time, especially on weaker Android devices.

### Memory Maintenance Resource Contention

The memory maintenance queue coalesces jobs per thread, but different threads can still run maintenance concurrently. `reply_completed` maintenance can also start while the user continues chatting. This can compete for database access, network bandwidth, and remote model quota with foreground chat.

## Design

### 1. Recursive Branch Lineage Query

`aiThreadRepository.resolveBranchLineage` should use one `WITH RECURSIVE` query to walk from the selected branch root up through parent branch roots.

Required behavior:

- Return the same `AiBranchScope[]` order as the current implementation: selected scope first, then parent scopes.
- Return `[]` when `branchRootMessageId` or `branchVersionIndex` is missing.
- Return `[]` when a referenced root message cannot be found.
- Return `[]` when a lineage cycle is detected.
- Stop at a conservative maximum depth and treat hitting that maximum as invalid lineage instead of returning a partial route.
- Preserve support for normal positive branch version indexes. `0` is not a valid persisted branch version index in the current branch model.

The recursive query may track a path string to detect repeated `id:version` pairs. The result should include enough metadata to distinguish a clean termination from a missing parent or cycle.

### 2. Indexed Streaming Patch Updates

`AiChatScreen` should maintain a lightweight `messageIndexByIdRef` synchronized with `messagesRef`.

Required behavior:

- Streaming patches update only the matching message index when possible.
- If the index is missing or stale, fall back to the current safe map behavior and rebuild the index.
- Every place that replaces the full message array must rebuild the index.
- Buffered streaming behavior, read-mode freezing, scroll-to-latest visibility, and citation updates must remain unchanged.
- No loaded message should be dropped or reordered by the optimization.

This is a local UI optimization. It must not change persistence cadence, provider streaming behavior, or message status transitions.

### 3. Bounded Retrieval Candidates

Material retrieval should keep work proportional to a bounded candidate set.

Required behavior:

- Add a repository or service-level constant for maximum vector candidate rows per owner query.
- `tryEmbeddingRetrieval` should order candidate rows by a stable indexed column such as document/chunk order or updated row order, and apply a SQL `LIMIT` before loading vectors into JavaScript.
- Existing final snippet limit behavior stays unchanged.
- If embeddings are unavailable or fail, keyword and owner-preview fallback behavior remains unchanged.
- Add an index if needed to support the bounded candidate query shape without bumping unrelated schema semantics more than necessary.

This is a pragmatic guardrail, not a full approximate-nearest-neighbor implementation.

### 4. Global Memory Maintenance Politeness

Memory maintenance should remain per-thread coalesced and become globally polite.

Required behavior:

- At most one maintenance pass runs globally at a time inside the JS runtime.
- New jobs for a thread that is already queued or active should continue to coalesce using the stronger reason and latest pending input.
- `app_background` and `leave_chat` remain higher priority than `reply_completed`.
- Foreground `reply_completed` jobs may be queued behind active work rather than starting immediately.
- The public API shape of `scheduleMemoryMaintenance`, `scheduleCompanionMemoryMaintenance`, and `isThreadMemoryMaintenanceActive` should remain compatible.
- Failure recording must still happen for the affected thread when a pass throws.

This change reduces contention. It does not guarantee OS-level background execution after process suspension.

## Testing

Add focused policy and behavior tests where the project already uses structural tests.

Required coverage:

- `resolveBranchLineage` no longer contains a JS `while` loop with per-level `getFirstAsync`.
- `resolveBranchLineage` contains `WITH RECURSIVE`, cycle detection, missing-parent invalidation, and maximum-depth invalidation.
- `AiChatScreen` maintains and rebuilds a message id-to-index ref, and streaming patch code uses direct index replacement before falling back.
- `tryEmbeddingRetrieval` applies a SQL candidate limit before parsing vectors.
- memory maintenance has a global queue/active runner in addition to per-thread coalescing.
- existing long-chat and memory policy tests continue to pass.

Verification commands:

```powershell
node --test tests/ai-chat-performance-hardening-policy.test.cjs
node --test tests/ai-chat-fixes-policy.test.cjs tests/ai-rag-policy.test.cjs tests/ai-branch-tree-navigation-policy.test.cjs
pnpm typecheck
git diff --check
pnpm test
```

## Acceptance Criteria

- Branch lineage loading performs one SQLite call per requested lineage and rejects cycles or incomplete routes.
- Streaming UI patch work is no longer proportional to all loaded messages on the normal indexed path.
- Material retrieval vector scoring is bounded by a documented candidate limit.
- Memory maintenance cannot run multiple passes concurrently in the JS runtime.
- No new network path is introduced except existing provider calls.
- Existing chat navigation, branch routing, memory behavior, image safety rules, and local-only guarantees remain intact.

## Review Notes

This spec intentionally chooses bounded, conservative hardening over broad rewrites. It does not claim that all long-chat latency disappears; it targets the specific local growth paths found in the current code.

## Independent Spec Review

Review result: pass.

- Placeholder scan: no `TBD`, `TODO`, or deferred requirements.
- Scope check: the work is focused on four related AI chat performance hot paths and can be executed as one implementation plan.
- Product boundary check: the spec preserves Pixory's Android-first, offline/local-only rules and does not introduce server, sync, account, or AI generation features.
- Testability check: each requirement maps to a policy or verification command, with no requirement depending only on subjective performance impressions.
- Risk check: the spec avoids claiming that all long-chat latency disappears and instead targets measurable local growth paths.
