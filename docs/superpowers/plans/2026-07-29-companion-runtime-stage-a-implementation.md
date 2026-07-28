# Companion Runtime Stage A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee lossless branch-aware conversation coverage for every configured history window while separating stable memory snapshots from per-turn companion observations and bridges.

**Architecture:** Add a pure coverage planner plus a thin SQLite compiler. The compiler materializes the selected branch, validates summary provenance against exact message/version hashes, and returns recent history plus either a raw bridge or a deterministic local provisional summary. Prompt assembly receives stable summary text and typed dynamic segments separately, so profiles, relationship observations, time-like data, and coverage repairs stay behind the provider cache boundary.

**Tech Stack:** Expo 54, React Native, TypeScript, expo-sqlite, Node test runner, `@noble/hashes`.

---

## File map

- Create `src/ai/context/conversationCoverage.ts`: pure round pairing, provenance hashing, summary validation, bridge selection, and deterministic provisional compression.
- Create `src/ai/context/conversationCoverageService.ts`: load one branch lineage from SQLite and compile a final coverage plan without remote model calls.
- Create `tests/ai-conversation-coverage-unit.test.cjs`: executable pure-function coverage matrix, branch/version invalidation, and bridge/provisional tests.
- Create `tests/ai-conversation-coverage-repository-integration.test.cjs`: SQLite migration/repository provenance round-trip and stale filtering.
- Modify `src/database/schema.ts`: V51 provenance columns and indexes for summary validation.
- Modify `src/database/db.ts`: apply V51 in order and advance `DATABASE_VERSION`.
- Modify `src/database/repositories/aiThreadRepository.ts`: summary provenance types, persistence, export/import, and branch-aware completed-message loading.
- Modify `src/ai/aiMemorySummaryService.ts`: dynamic prewarm threshold, exact source provenance, and source-ID union during merge.
- Modify `src/ai/aiMemoryService.ts`: split stable summary snapshot from dynamic unconfirmed profile/relationship observation.
- Modify `src/ai/aiPromptCache.ts`: declare dynamic companion, observation, open-loop, and summary-bridge layers.
- Modify `src/ai/promptBuilder.ts`: place stable summaries in `memory_snapshot` and typed dynamic segments after the cache boundary.
- Modify `src/ai/aiChatService.ts`: compile coverage before provider dispatch, reuse its recent messages, persist coverage diagnostics in the generation snapshot, and avoid a remote coverage call.
- Modify `src/ai/aiGenerationMetrics.ts`: content-free coverage and dynamic-token counters.
- Modify `tests/ai-prompt-builder-unit.test.cjs`: prove dynamic observations/bridges do not change `stablePrefixHash` while summary frontier changes do.
- Modify `tests/ai-context-round-policy.test.cjs`: replace the brittle source-regex import assertion with executable normalization/round behavior coverage plus a direct repository source assertion.
- Modify `tests/ai-chat-prompt-mode-cache-invariants-policy.test.cjs`: assert the complete stable-to-dynamic layer order.
- Modify `docs/feature-matrix.md`: record Stage A as implemented and tested.

### Task 1: Pure coverage planner

**Files:**
- Create: `src/ai/context/conversationCoverage.ts`
- Create: `tests/ai-conversation-coverage-unit.test.cjs`

- [ ] **Step 1: Write the failing coverage matrix test**

Add executable tests that synthesize 1–120 complete user/assistant rounds, then call `buildConversationCoveragePlan` with history limits 5, 20, 30, 50, and 100. Assert `coverageComplete === true`, `uncoveredMessageIds` is empty, recent IDs are exactly the final configured rounds, and every earlier message is represented by a valid summary, `bridgeMessageIds`, or `provisionalSourceMessageIds`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/ai-conversation-coverage-unit.test.cjs`

Expected: FAIL because `src/ai/context/conversationCoverage.ts` does not exist.

- [ ] **Step 3: Implement the pure contracts**

Implement these exported contracts:

```ts
export interface ConversationCoveragePlan {
  threadId: string;
  branchRouteHash: string;
  lineageVersion: number;
  summarySegmentIds: string[];
  recentMessageIds: string[];
  bridgeMessageIds: string[];
  provisionalSummaryId: string | null;
  provisionalSourceMessageIds: string[];
  uncoveredMessageIds: string[];
  coverageComplete: boolean;
}

export interface CompiledConversationCoverage {
  plan: ConversationCoveragePlan;
  recentMessages: AiMessageRecord[];
  stableSummaryText: string;
  summaryBridgeText: string;
}

export function hashBranchRoute(branchScopes?: AiBranchScope[]): string;
export function hashCoverageMessageVersions(messages: AiMessageRecord[]): string;
export function buildConversationCoveragePlan(input: CoveragePlannerInput): CompiledConversationCoverage;
```

Pair only completed `user -> assistant` rounds. Validate each summary only when status, route hash, lineage version, exact source IDs, and source version hash match. Use a raw bridge up to 16 messages; above that use a deterministic local summary capped at 1,800 characters. Derive the provisional ID from thread, route, lineage, source IDs, and version hash; do not use time, randomness, UUIDs, or a model call.

- [ ] **Step 4: Add invalidation and isolation cases**

Test sibling routes, edited content with the same message ID, regenerated branch versions, malformed JSON, legacy rows with empty provenance, incomplete user-only tails, and a 100-to-5 history-limit change. Assert stale/invalid summaries are excluded and repaired by bridge/provisional coverage.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/ai-conversation-coverage-unit.test.cjs`

Expected: all coverage unit tests pass.

### Task 2: Persist exact summary provenance

**Files:**
- Modify: `src/database/schema.ts`
- Modify: `src/database/db.ts`
- Modify: `src/database/repositories/aiThreadRepository.ts`
- Create: `tests/ai-conversation-coverage-repository-integration.test.cjs`

- [ ] **Step 1: Write the failing migration/repository test**

Create an in-memory SQLite test using the repository test harness. Assert V51 adds `sourceMessageIdsJson`, `branchRouteHash`, `lineageVersion`, `sourceMessageVersionHash`, `quality`, and `status`; a created segment round-trips all fields; export/import preserves them; and `listSummarySegments` returns only active records visible to the selected route.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/ai-conversation-coverage-repository-integration.test.cjs`

Expected: FAIL on missing V51 fields.

- [ ] **Step 3: Add V51 and repository contracts**

Advance `DATABASE_VERSION` from 50 to 51. Add nullable/default-safe columns so existing databases migrate without data loss:

```sql
ALTER TABLE ai_thread_summary_segments ADD COLUMN sourceMessageIdsJson TEXT NOT NULL DEFAULT '[]';
ALTER TABLE ai_thread_summary_segments ADD COLUMN branchRouteHash TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_thread_summary_segments ADD COLUMN lineageVersion INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_thread_summary_segments ADD COLUMN sourceMessageVersionHash TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_thread_summary_segments ADD COLUMN quality TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE ai_thread_summary_segments ADD COLUMN status TEXT NOT NULL DEFAULT 'stale';
CREATE INDEX IF NOT EXISTS idx_ai_summary_segments_coverage
  ON ai_thread_summary_segments(threadId, status, branchRouteHash, lineageVersion, createdAt);
```

Extend `AiThreadSummarySegmentRecord` and every create/export/import path. Add a repository loader that returns all completed non-system messages before an anchor for exactly one materialized branch route in chronological order.

- [ ] **Step 4: Verify repository GREEN and schema compatibility**

Run: `node --test tests/ai-conversation-coverage-repository-integration.test.cjs tests/ai-thread-space-move-repository-integration.test.cjs tests/ai-schema-policy.test.cjs`

Expected: all selected tests pass.

### Task 3: Compile coverage from SQLite and preserve it during maintenance

**Files:**
- Create: `src/ai/context/conversationCoverageService.ts`
- Modify: `src/ai/aiMemorySummaryService.ts`
- Modify: `tests/ai-conversation-coverage-unit.test.cjs`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] **Step 1: Write failing compiler and maintenance tests**

Assert `compileConversationCoverage` loads branch-materialized completed messages, filters at the anchor, validates summaries, and never imports or calls `callMemoryMaintenanceModel`. Assert `summaryPrewarmRoundThreshold(5) === 8`, `(30) === 25`, and `(100) === 95`. Assert compression and merge write exact source ID union, route hash, lineage version, and version hash.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/ai-conversation-coverage-unit.test.cjs tests/ai-chat-fixes-policy.test.cjs`

Expected: FAIL on missing compiler/prewarm/provenance behavior.

- [ ] **Step 3: Implement compiler and maintenance provenance**

`compileConversationCoverage` accepts `db`, `thread`, `anchorMessageId`, `historyRoundLimit`, and `branchScopes`. It returns the pure compiled result and throws if the final plan is incomplete. Export `summaryPrewarmRoundThreshold(historyRoundLimit)` as `Math.max(8, historyRoundLimit - 5)`. Pass the thread setting into maintenance, and preserve exact source IDs across compressed and merged segments. Legacy or hash-mismatched summaries remain stored but are marked stale and excluded.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/ai-conversation-coverage-unit.test.cjs tests/ai-chat-fixes-policy.test.cjs`

Expected: all selected tests pass.

### Task 4: Enforce the prompt cache boundary

**Files:**
- Modify: `src/ai/aiMemoryService.ts`
- Modify: `src/ai/aiPromptCache.ts`
- Modify: `src/ai/promptBuilder.ts`
- Modify: `tests/ai-prompt-builder-unit.test.cjs`
- Modify: `tests/ai-chat-prompt-mode-cache-invariants-policy.test.cjs`

- [ ] **Step 1: Write failing stable-hash tests**

Build otherwise identical prompts where `user_observation`, `companion_runtime`, and `summary_bridge` differ. Assert the stable prefix hash remains identical and the values appear only in `prompt.user`. Then alter `stableSummarySnapshot` and assert the stable prefix hash changes. Assert no dynamic segment is present in `stableSystemBlocks`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/ai-prompt-builder-unit.test.cjs tests/ai-chat-prompt-mode-cache-invariants-policy.test.cjs`

Expected: FAIL because the typed dynamic layers do not exist and companion data is still in `memory_snapshot`.

- [ ] **Step 3: Implement stable/dynamic separation**

Add prompt layer names `companion_runtime`, `temporal_open_loops`, `summary_bridge`, and `user_observation`. Keep `memory_snapshot` limited to confirmed/locked claims plus validated stable summary text. Move unconfirmed profile and relational projection text into `user_observation`. Place dynamic layers after all stable blocks and before retrieval/current request. Budget order must trim `summary_bridge` only after compressing its raw form and must never trim the current request or coverage metadata.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/ai-prompt-builder-unit.test.cjs tests/ai-chat-prompt-mode-cache-invariants-policy.test.cjs tests/ai-prompt-cache-unit.test.cjs tests/ai-prompt-cache-policy.test.cjs`

Expected: all selected tests pass with no new stable purity warning.

### Task 5: Integrate coverage into every chat generation path

**Files:**
- Modify: `src/ai/aiChatService.ts`
- Modify: `src/ai/aiGenerationMetrics.ts`
- Modify: `tests/ai-context-round-policy.test.cjs`
- Modify: `tests/ai-conversation-coverage-unit.test.cjs`

- [ ] **Step 1: Write failing integration-policy tests**

Assert normal, retry, continue, and follow-up generation all obtain history from `compileConversationCoverage`; the same compiled recent messages feed provider history; bridge text enters `summary_bridge`; incomplete coverage throws before provider dispatch; and coverage compilation contains no remote maintenance call. Replace the brittle `importThread` regex with an assertion scoped by explicit source markers plus executable `normalizeAiContextSettings` coverage.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/ai-context-round-policy.test.cjs tests/ai-conversation-coverage-unit.test.cjs`

Expected: FAIL because chat generation still uses a fixed recent-message load independent of summaries.

- [ ] **Step 3: Wire the compiler once per generation**

Pass `historyAnchorMessageId`, normalized history rounds, and branch scopes to prompt compilation. Return `coverage`, `recentMessages`, and typed segments with the built prompt; remove the second fixed history query. Record only counts, booleans, route hash, lineage/provisional version, and dynamic token count in generation metrics/snapshots—never Personal content. Ensure retry/continue/follow-up use the same route and anchor semantics.

- [ ] **Step 4: Verify targeted generation tests**

Run: `node --test tests/ai-context-round-policy.test.cjs tests/ai-conversation-coverage-unit.test.cjs tests/ai-chat-prompt-mode-cache-invariants-policy.test.cjs tests/ai-prompt-builder-unit.test.cjs`

Expected: all selected tests pass.

### Task 6: Stage A documentation, centralized review, and commit

**Files:**
- Modify: `docs/feature-matrix.md`
- Review: every Stage A file listed above

- [ ] **Step 1: Update the feature matrix**

Record branch-aware lossless conversation coverage, local provisional bridging, exact summary provenance/invalidation, dynamic companion cache isolation, database V51, and the new unit/integration coverage. Mark only verified behavior as implemented.

- [ ] **Step 2: Run the Stage A focused suite**

Run: `node --test tests/ai-conversation-coverage-unit.test.cjs tests/ai-conversation-coverage-repository-integration.test.cjs tests/ai-context-round-policy.test.cjs tests/ai-prompt-builder-unit.test.cjs tests/ai-prompt-cache-unit.test.cjs tests/ai-prompt-cache-policy.test.cjs tests/ai-chat-prompt-mode-cache-invariants-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs tests/ai-schema-policy.test.cjs tests/ai-thread-space-move-repository-integration.test.cjs`

Expected: all selected tests pass.

- [ ] **Step 3: Run full verification**

Run: `pnpm typecheck`

Expected: exit 0.

Run: `pnpm test`

Expected: all tests pass; if generated Android sources are absent, regenerate with `npx expo prebuild --platform android --no-install`, inspect and revert unrelated generated drift, then rerun.

Run: `git diff --check`

Expected: exit 0 with no whitespace errors.

- [ ] **Step 4: Perform one centralized Stage A review**

Review the complete diff against spec sections 5, 11, 21, 22, and Stage A. Check branch/privacy isolation, exact coverage, source-hash invalidation, no pre-send remote call, stable hash invariants, import/export compatibility, schema migration order, and absence of unrelated changes. Fix every finding and rerun the focused and full verification commands.

- [ ] **Step 5: Commit the isolated stage**

Run:

```powershell
git add src/ai/context src/ai/aiMemorySummaryService.ts src/ai/aiMemoryService.ts src/ai/aiPromptCache.ts src/ai/promptBuilder.ts src/ai/aiChatService.ts src/ai/aiGenerationMetrics.ts src/database/schema.ts src/database/db.ts src/database/repositories/aiThreadRepository.ts tests/ai-conversation-coverage-unit.test.cjs tests/ai-conversation-coverage-repository-integration.test.cjs tests/ai-context-round-policy.test.cjs tests/ai-prompt-builder-unit.test.cjs tests/ai-chat-prompt-mode-cache-invariants-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs docs/feature-matrix.md docs/superpowers/plans/2026-07-29-companion-runtime-stage-a-implementation.md
git commit -m "feat: guarantee companion context coverage"
```

Expected: one Stage A commit with no Stage B–E implementation mixed in.

## Rollback boundary

Reverting the Stage A commit removes the V51 migration declaration, coverage compiler, prompt-layer changes, tests, and feature-matrix entry together. Existing databases that already applied V51 retain additive summary columns; the pre-Stage-A app ignores them safely. No migration deletes or rewrites messages, summaries, user profiles, or Personal-space data.

## Self-review record

- Spec coverage: sections 5.2–5.6 and 11.1–11.4 map to Tasks 1–5; tests/quality gates map to Task 6.
- Boundary coverage: no Stage B event ledger, Stage C projection/dream/thought, Stage D citation/backup, or Stage E generation/voice implementation is included.
- Placeholder scan: no TBD, TODO, or deferred implementation step remains.
- Type consistency: `ConversationCoveragePlan`, `CompiledConversationCoverage`, provenance column names, and prompt layer names are identical across tasks.
- Safety: migration is additive, coverage repair is local/deterministic, and all queries remain scoped to the selected physical database, thread, and branch route.

## Implementation review result

- Reviewed the complete Stage A diff against Spec sections 5, 11, 21, 22 and the Stage A exit criteria.
- Verified exact message/version provenance invalidation, selected-branch filtering, normal/personal database separation, local-only pre-send repair, stable/dynamic prompt hashing, import/move compatibility and V51 migration order.
- Focused suite: 138 passing, 1 existing skipped UI assertion, 0 failures.
- TypeScript and `git diff --check`: passed.
- Full suite at this boundary: every Stage A assertion passes. The sole remaining failure is the baseline missing generated `PixoryShareActivity.kt`; it is owned by the Stage E native boundary and remains an explicit final-suite gate.
