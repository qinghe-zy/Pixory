# Companion Runtime Stage B Implementation Plan

> **Execution guardrail:** implement this plan sequentially with test-driven development. Stage B must remain independently migratable, testable, reviewable, committable, and revertible.

**Goal:** Add a branch-aware, append-only Companion Event ledger with a local fast observer, durable asynchronous enrichment jobs, deterministic temporal anchors, OpenLoop lifecycle, single-slot topic arbitration, dynamic prompt compilation, and content-free traceability.

**Architecture:** Policy remains pure under `src/ai/companion/`; SQLite repositories own persistence and visibility; a thin runtime service observes the just-persisted user message before prompt construction without any network call. Remote enrichment is optional, asynchronous, evidence-gated, lease-protected, and affects only later turns. Temporal/OpenLoop context is compiled into the existing dynamic prompt layers and never changes `memoryEpoch` or `stablePrefixHash`.

**Stage boundary:** V52 creates only Stage B tables. Affect/relationship/repair projections and dream/thought artifacts remain Stage C; citations/backups remain Stage D; generation recovery/voice/native share completion remains Stage E.

## Task 1: Freeze Stage B contracts with failing tests

**Files**

- Create `tests/companion-event-observer-unit.test.cjs`
- Create `tests/companion-temporal-open-loop-unit.test.cjs`
- Create `tests/companion-event-repository-integration.test.cjs`
- Create `tests/companion-runtime-policy.test.cjs`

- [ ] Write observer fixtures covering asserted, corrected, negated, hypothetical, joke, quoted, roleplay and uncertain speech modes; first-person versus quoted/third-party speakers; strong boundary/correction; affect; interaction; commitment and temporal candidates.
- [ ] Assert quoted/hypothetical/joke/roleplay content cannot create effective boundary, correction, commitment or relationship events.
- [ ] Assert every accepted event has exact message/version evidence, evidence span, confidence, extractor version and a deterministic semantic idempotency key.
- [ ] Write clock-injected temporal tests for today/tomorrow/day-after-tomorrow, weekdays, month/year boundaries, leap day, explicit dates, deadlines, recurrences, anniversaries and unknown phrases. Historical anchors retain their parse timezone when the device timezone changes.
- [ ] Write OpenLoop tests for 7-day deadline grace, 30-day result/default expiry, 14-day weak commitment expiry, recurring occurrence settlement, immediate resolve/dismiss, two-mention cap and 7-day unanswered cooldown.
- [ ] Write arbitration tests proving current request is never displaced, at most one optional topic is selected, repair/boundary beats time, sub-60 non-repair candidates are rejected and ties are deterministic.
- [ ] Write real SQLite tests for V52 migration, idempotent append, event sequence ordering, selected-branch visibility, sibling isolation, message-version invalidation, source deletion, lease acquisition/takeover, retry/dead states, anchor/loop transitions and normal/personal physical isolation.
- [ ] Verify RED before adding implementation.

## Task 2: Add V52 data model and typed repositories

**Files**

- Modify `src/database/schema.ts`
- Modify `src/database/db.ts`
- Create `src/ai/companion/companionTypes.ts`
- Create `src/ai/companion/companionRuntimeValidation.ts`
- Create `src/ai/companion/companionEventRepository.ts`
- Create `src/ai/companion/companionDiagnostics.ts`
- Modify space-move/import/export tests where the new thread-owned records must be preserved or intentionally rebuilt

- [ ] Bump the database from V51 to V52 and apply V52 after V51.
- [ ] Create `companion_events`, `companion_temporal_anchors`, `companion_open_loops`, `companion_runtime_jobs`, and `companion_context_traces` with stable role/thread/branch/source references, unique idempotency keys and compound ready/visibility indexes.
- [ ] Store exact `sourceMessageId`, selected message-version hash, branch route hash, lineage version, evidence span JSON, confidence, speech mode, extractor/policy versions and append-only status transitions.
- [ ] Runtime-validate every JSON field and enum. Malformed rows are excluded and reported as content-free diagnostics instead of entering prompt context.
- [ ] Repository reads always receive the already-selected physical database and exact branch route; no normal/personal cross-query helper is allowed.
- [ ] Event IDs and idempotency keys are content-derived; leases and attempt timestamps may use the injected/runtime clock but never enter stable prompt blocks.
- [ ] Verify migration from a V51 fixture and a fresh database, then rerun schema/import/move tests.

## Task 3: Implement the pure fast observer

**Files**

- Create `src/ai/companion/companionEventObserver.ts`
- Create `src/ai/companion/companionEventPolicy.ts`
- Reuse `src/ai/memory/memoryTypes.ts` speech-mode vocabulary without writing ordinary companion observations as Memory Claims

- [ ] Normalize Unicode, whitespace, action brackets and mixed Chinese/English punctuation while preserving offsets for evidence spans.
- [ ] Determine speaker and speech mode before event matching. Negation scope, quotes, conditionals, jokes, roleplay narration and third-party reports must suppress effective high-impact events.
- [ ] Detect explicit boundary/correction/commitment using anchored patterns and context windows, not whole-message naked `includes`.
- [ ] Detect conservative affect and interaction signals with policy thresholds: boundary/correction/explicit commitment `>=0.85`, affect `>=0.65`, ordinary interaction/relationship `>=0.70`.
- [ ] Return accepted events plus diagnostic-only candidates. The observer is pure, network-free and bounded to the current message plus a small caller-provided context window.
- [ ] Benchmark representative fixtures and assert the observer stays below the 5ms P95 design threshold on the development machine without making the test flaky on slower CI.

## Task 4: Implement temporal anchors, OpenLoops and arbitration

**Files**

- Create `src/ai/companion/companionTemporalService.ts`
- Create `src/ai/companion/companionOpenLoopService.ts`
- Create `src/ai/companion/companionTopicArbitrator.ts`

- [ ] Parse clock-injected time phrases into UTC ranges plus raw text, IANA timezone, local date key, precision and point/range/deadline/recurrence/anniversary type. Default to the device timezone and fall back to `Asia/Shanghai`.
- [ ] Materialize anchors only from accepted asserted events and exact visible evidence.
- [ ] Create/update/resolve/dismiss OpenLoops deterministically from commitment events. Store priority, earliest mention, expiry, mention count, last-mentioned round and resolution evidence.
- [ ] Expire items lazily on app/foreground/chat coordination; never poll every minute and never generate proactive messages or notifications.
- [ ] Select at most one optional temporal/OpenLoop candidate with the Spec score and deterministic tie-breaking. Enforce two mentions and a seven-day silent cooldown after an unanswered mention.

## Task 5: Add durable enrichment and maintenance orchestration

**Files**

- Create `src/ai/companion/companionEventEnrichmentService.ts`
- Create `src/ai/companion/companionMaintenanceQueue.ts`
- Create `src/ai/companion/companionRuntimeService.ts`
- Reuse `src/ai/aiMemoryMaintenanceModelService.ts` only behind the asynchronous queue

- [ ] `observeCurrentTurn` loads the selected message version, runs the local observer, appends accepted events and materializes anchors/loops in one database transaction where possible.
- [ ] Queue enrichment only for strong ambiguous signals, a bounded cadence, or leave/background maintenance. Non-candidate chat creates no remote request.
- [ ] Persist an exact source snapshot and idempotency key before any remote call. Acquire a SQLite lease; expired leases are recoverable, live leases are single-flight, attempts back off and terminal invalid output becomes `dead`.
- [ ] Enrichment requests use the current session/maintenance model, independent prompt/history and strict JSON. Model candidates require confidence `>=0.75`, visible evidence IDs, valid scope/enums/time ranges and current source/version hashes.
- [ ] Merge model provenance into the same semantic event when local and remote observations match; never double-count. Invalid or late results have zero database effect.
- [ ] No model configuration/offline failure leaves local behavior intact and the job recoverable. Personal remote enrichment remains disabled unless the existing explicit Personal remote-maintenance permission is supplied.
- [ ] App/foreground/leave hooks reconcile ready/expired jobs without blocking normal chat.

## Task 6: Compile current constraints and one optional loop into the prompt

**Files**

- Create `src/ai/companion/companionContextCompiler.ts`
- Modify `src/ai/aiChatService.ts` only for orchestration calls
- Modify `src/ai/promptBuilder.ts` only if a typed segment path is missing
- Modify `src/ai/aiGenerationMetrics.ts`
- Extend prompt/cache and chat policy tests

- [ ] Before provider dispatch, call the local runtime service once for the just-persisted user message. Failure falls back to the last valid state and does not fail chat.
- [ ] Compile strong current-turn correction/boundary constraints into `companion_runtime` and at most one prior eligible anchor/OpenLoop into `temporal_open_loops`.
- [ ] Never inject raw event IDs, job IDs, trace IDs, unvalidated JSON, reasoning/thinking text or exact current timestamps into stable blocks.
- [ ] Current request remains authoritative. OpenLoop/temporal content is a clearly labelled optional continuity hint and cannot command the model to ignore the user.
- [ ] Record only content-free projection/event/candidate/selected-topic counts, policy versions, durations and dynamic token count. Personal diagnostics omit evidence spans/text.
- [ ] Prove ten turns of changing companion events keep `stablePrefixHash` and `memoryEpoch` unchanged.

## Task 7: Stage B documentation, review and independent commit

**Files**

- Modify `docs/feature-matrix.md`
- Review every Stage B file and integration point

- [ ] Document event ledger, local observation, optional asynchronous enrichment, temporal/OpenLoop lifecycle, single-slot prompt behavior, privacy boundary and test coverage.
- [ ] Run focused Stage B tests plus all affected AI prompt/cache/memory/branch/import/move/schema tests.
- [ ] Run `pnpm typecheck`, `pnpm test`, `git diff --check`, and `npx expo install --check` if dependency metadata changed.
- [ ] Perform one centralized review for event replay, exact source/version validation, branch/space isolation, JSON safety, lease/idempotency behavior, no pre-send remote call, no stable-hash pollution, no proactive delivery, query indexes and unrelated churn.
- [ ] Fix every finding, rerun verification and create one Stage B commit.

## Rollback boundary

Reverting the Stage B commit removes the V52 declaration, Stage B companion modules, orchestration, tests and feature-matrix entries together. Existing V52 databases retain additive ledger tables that older builds ignore. No rollback path deletes messages, memory claims, diaries or Personal-space content.

## Completion and centralized review record

- Implemented all Stage B tasks above with V52, a local observer, exact source/version visibility, temporal/OpenLoop lifecycle, one-slot prompt compilation, durable asynchronous enrichment and content-free metrics.
- Central review verified branch-route and physical-space isolation, stable-prefix purity, source edit invalidation, current-turn boundary/correction precedence, prompt-injection labelling, deterministic idempotency, lease takeover and late-result rejection.
- Review fixes included real round-based cooldowns, local-calendar recurrence advancement across DST, invalid-date rejection, a seven-day one-off temporal grace period, lifecycle completion/cancellation/dismissal, source revalidation inside the final enrichment transaction, and preservation of anchor mention state during space moves.
- Cost/privacy review removed duplicated message content from job payloads and limits each maintenance pass to one optional model call. The no-model and Personal-without-authorization paths remain local and recoverable.
- Verification: Stage B and affected Stage A/prompt/cache/memory/branch/schema/move suites pass; `pnpm typecheck` and `git diff --check` pass. The full suite has one pre-existing Stage E gate only: the generated native `PixoryShareActivity.kt` is absent and will be restored at the Stage E native boundary.
