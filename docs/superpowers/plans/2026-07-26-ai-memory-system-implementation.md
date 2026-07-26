# Pixory AI Memory System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved memory-system v1.1 in the existing Pixory SQLite, chat, memory-maintenance, import/export, retrieval, and board paths without breaking legacy data.

**Architecture:** Add a versioned event ledger and rebuildable projections beside the legacy `ai_memories` tables. Route all new writes through `MemoryFacade`; keep the existing chat provider/model resolver and memory-maintenance model resolver; use deterministic local intent/observation handling before any remote maintenance. Integrate in stages so the legacy path remains readable during migration and can be shadow-compared.

**Tech Stack:** Expo SQLite, TypeScript, existing Pixory repositories/services, Node `node:test` policy tests, TypeScript transpilation in tests.

> **Implementation checkpoint (2026-07-27):** Tasks 1–6 are implemented and the retired v0.46/old-board assertions have been migrated. TypeScript and the repository suite pass. The final audit additionally closed projection rebuild for episode/relation/profile, unrelated-memory admission, destructive-intent false positives, confirmation governance, command replay, synchronous FTS deletion, native import resume/full rollback, external user/assistant-only migration prompts, independent candidate/audit passes, v1 profile synchronization, and session-scoped external rollback. Release acceptance remains open only for real Android migration, provider cache reconciliation, adversarial quality metrics, TTFT, and seven-day cost measurement.

---

### Task 1: Add the v1 memory schema and migration

**Files:**
- Modify: `src/database/schema.ts`
- Modify: `src/database/db.ts`
- Test: `tests/ai-memory-v1-schema-policy.test.cjs`

- [ ] **Step 1: Write the failing schema test**

Assert that the source contains migration version 47, all v1 tables and indexes, the partial active-claim uniqueness index, ontology seeds, and the `ai_threads.lineageVersion` column.

- [ ] **Step 2: Run the test and confirm it fails**

Run `node --test tests/ai-memory-v1-schema-policy.test.cjs`.

- [ ] **Step 3: Add `MIGRATION_STATEMENTS_V47`**

Create `memory_claims`, `memory_events`, `memory_evidence`, `memory_outbox`, `memory_projection_meta`, `memory_import_id_map`, `memory_deletion_certificates`, `memory_episodes`, `memory_relational_states`, `memory_profiles`, `memory_board_projection`, `memory_current_turn_observations`, `memory_ontology_predicates`, `memory_ontology_aliases`, `memory_embeddings`, and `memory_lineage_meta`. Add indexes and ontology-v1 seed rows with `INSERT OR IGNORE`. Add `ai_threads.lineageVersion` only when absent through an explicit helper, because `ALTER TABLE ADD COLUMN IF NOT EXISTS` is not portable in SQLite.

- [ ] **Step 4: Wire migration 47**

Import the statement into `db.ts`, execute it when `currentVersion < 47`, set `DATABASE_VERSION = 47`, and keep the migration safe for both normal and personal databases.

- [ ] **Step 5: Run schema tests and typecheck**

Run `node --test tests/ai-memory-v1-schema-policy.test.cjs` and `pnpm typecheck`.

### Task 2: Implement event ledger, canonicalization, projections, and facade

**Files:**
- Create: `src/ai/memory/memoryTypes.ts`
- Create: `src/ai/memory/memoryCanonicalization.ts`
- Create: `src/ai/memory/memoryEventRepository.ts`
- Create: `src/ai/memory/memoryProjectionService.ts`
- Create: `src/ai/memory/memoryFacade.ts`
- Test: `tests/ai-memory-v1-ledger-policy.test.cjs`

- [ ] **Step 1: Write failing behavior tests**

Cover canonical tuple hashing, null calibrated-confidence fallback, event idempotency derivation, user edit producing supersede/create events, tombstone exclusion, and projection rebuild.

- [ ] **Step 2: Run the test and confirm it fails**

Run `node --test tests/ai-memory-v1-ledger-policy.test.cjs`.

- [ ] **Step 3: Add shared types and pure canonicalization**

Define the v1 enums and records. Implement NFKC/full-width normalization, longest alias match, predicate/object/time normalization, canonical tuple serialization with `0x1F`, and lowercase SHA-256 using `@noble/hashes/sha256`.

- [ ] **Step 4: Add event repository**

Implement append with `SHA256(space|commandId|aggregateType|aggregateId|eventType|eventSequence)`, return the existing event on replay, and list events by projection/version.

- [ ] **Step 5: Add projection rebuild**

Project claims, board rows, episodes, relational states, profiles, and metadata from events. Deleted/suppressed claims must not enter FTS-ready active projections.

- [ ] **Step 6: Add `MemoryFacade` commands**

Implement `createClaim`, `editClaim`, `confirmClaim`, `suppressClaim`, `deleteClaim`, `restoreClaim`, `forgetByCanonicalId`, `rebuild`, and `getProjectionMeta`, all with space/scope/version validation and one transaction.

- [ ] **Step 7: Run ledger tests and typecheck**

Run `node --test tests/ai-memory-v1-ledger-policy.test.cjs` and `pnpm typecheck`.

### Task 3: Implement current-turn observation and post-response local extraction

**Files:**
- Create: `src/ai/memory/memoryIntentDetector.ts`
- Create: `src/ai/memory/localFastExtractor.ts`
- Create: `src/ai/memory/memoryCurrentTurnRepository.ts`
- Modify: `src/ai/aiMemoryCaptureService.ts`
- Modify: `src/ai/aiMemoryMaintenanceQueue.ts`
- Modify: `src/ai/aiMemoryMaintenanceModelService.ts`
- Test: `tests/ai-memory-current-turn-policy.test.cjs`

- [ ] **Step 1: Write failing cadence/privacy tests**

Assert generation-side intent detection is local and bounded, assistant persistence queues extraction, local extraction writes Working/current-turn observations, next-turn drain is available, reasoning is excluded, and Personal remote maintenance is denied without per-pass authorization.

- [ ] **Step 2: Run the test and confirm it fails**

Run `node --test tests/ai-memory-current-turn-policy.test.cjs`.

- [ ] **Step 3: Implement deterministic intent detector**

Recognize explicit remember/forget/correction/safety/recall phrases and return structured payload only; return `none` for ordinary messages without writing a claim before generation.

- [ ] **Step 4: Implement observation repository and local extractor**

Persist observations by message/thread/branch with idempotency, seven-day/twenty-turn expiry, and a local candidate extractor that writes low-risk Working claims through `MemoryFacade`.

- [ ] **Step 5: Integrate the existing capture/queue path**

Queue `memory_extract_current_turn` after assistant persistence, drain it before the next send with a 20 ms local budget, and leave remote maintenance at the existing five-turn/background cadence.

- [ ] **Step 6: Run cadence tests and typecheck**

Run `node --test tests/ai-memory-current-turn-policy.test.cjs` and `pnpm typecheck`.

### Task 4: Implement retrieval, context compilation, and cache-safe plan persistence

**Files:**
- Create: `src/ai/memory/memoryRetrievalService.ts`
- Create: `src/ai/memory/contextCompiler.ts`
- Modify: `src/ai/aiRetrievalService.ts`
- Modify: `src/ai/aiChatService.ts`
- Test: `tests/ai-memory-retrieval-policy.test.cjs`

- [ ] **Step 1: Write failing retrieval and budget tests**

Cover no-Embedding lexical fallback, null calibration prior, score weights/penalties, no-noise admission, adaptive budgets for 4k/8k contexts, usage-contract certainty labels, and ContextPlan persistence.

- [ ] **Step 2: Run the test and confirm it fails**

Run `node --test tests/ai-memory-retrieval-policy.test.cjs`.

- [ ] **Step 3: Implement retrieval-v1**

Use FTS, optional memory embeddings, temporal/continuity fit, importance, confidence prior, stale/conflict/redundancy penalties, threshold 0.55, max 20 candidates, max 6 injected claims, and scorer version `retrieval-v1`.

- [ ] **Step 4: Implement adaptive context compiler**

Allocate C0–C6 with the v1.1 proportional algorithm, apply the degradation ladder, and emit structured memory usage blocks.

- [ ] **Step 5: Persist and invalidate ContextPlan**

Store plan metadata with projectionVersion, lineageVersion, claim/evidence IDs, segment hashes, cache tier and provider usage; exclude old lineage/epoch plans from cache hits.

- [ ] **Step 6: Run retrieval tests and typecheck**

Run `node --test tests/ai-memory-retrieval-policy.test.cjs` and `pnpm typecheck`.

### Task 5: Migrate board, import/export, and legacy projection

**Files:**
- Modify: `src/ai/aiMemoryService.ts`
- Modify: `src/ai/aiContinuityImportService.ts`
- Modify: `src/ai/aiContinuityImportReviewService.ts`
- Modify: `src/ai/aiContinuityImportParser.ts`
- Modify: `src/screens/AiMemoryBoardScreen.tsx`
- Modify: `src/database/repositories/aiThreadRepository.ts`
- Modify: `src/ai/aiMemoryService.ts`
- Test: `tests/ai-memory-migration-board-policy.test.cjs`

- [ ] **Step 1: Write failing migration and board tests**

Cover v1 legacy memory adapter, native package deterministic import, external Personal consent gate, board edit affecting the next ContextPlan, delete certificates, and read-switch rollback.

- [ ] **Step 2: Run the test and confirm it fails**

Run `node --test tests/ai-memory-migration-board-policy.test.cjs`.

- [ ] **Step 3: Add legacy shadow projection**

Convert legacy `ai_memories` into v1 claims/events without automatically promoting legacy automatic global memories. Keep old reads behind a feature switch until v1 projection parity is measured.

- [ ] **Step 4: Route board writes through `MemoryFacade`**

Map edit/confirm/forget/delete/restore actions to commands and refresh the board from `memory_board_projection`.

- [ ] **Step 5: Route imports**

Keep native v2/v1 imports deterministic; require explicit per-package consent before external model review in Personal; preserve quarantine and rollback behavior.

- [ ] **Step 6: Run migration tests and typecheck**

Run `node --test tests/ai-memory-migration-board-policy.test.cjs` and `pnpm typecheck`.

### Task 6: Full verification and requirement audit

**Files:**
- Modify: `docs/feature-matrix.md`
- Modify: `D:\Project\Pixory\pixory\progress.md`
- Modify: `D:\Project\Pixory\pixory\findings.md`

- [ ] **Step 1: Run focused memory tests**

Run all new memory tests plus existing memory, import, cache, provider, branch, and schema policy tests.

- [ ] **Step 2: Run project verification**

Run `pnpm typecheck`, `pnpm test`, and `git diff --check`.

- [ ] **Step 3: Audit every Spec acceptance item**

Check the 15 invariants, all Task 1–7 acceptance bullets, privacy/deletion/cache constraints, and no-Embedding behavior against code and test evidence.

- [ ] **Step 4: Update feature inventory and handoff**

Record implemented capabilities, known unimplemented P1 enhancements, commands run, and any remaining risks. Do not mark complete unless the evidence proves all P0 requirements.
