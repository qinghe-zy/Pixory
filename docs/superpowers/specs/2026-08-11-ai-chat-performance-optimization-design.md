# AI Chat Performance Optimization Design

**Status:** Approved and self-reviewed; ready for implementation planning

**Date:** 2026-08-11

**Scope:** P0/P1 executable optimization program; P2/P3 triaged roadmap only

## 2026-08-13 implementation review addendum

第二轮全量复审确认总体分波和风险边界仍成立，并补充两项数据一致性约束：missing-embedding 生成只能 upsert 本轮缺失 chunk，不得删除同文档已有的同模型向量；批量 embedding 替换在重复 `(chunkId, providerId, modelId)` 输入下必须保持旧实现的 last-write-wins 语义。对应行为由 repository 与 service integration tests 固定。

原 Task 10 的桌宠 resize-handle opacity 优化已被后续“完整关闭 Live2D 运行时”取代；该改变不授权删除桌宠源码、下载文件或持久设置。Android 设备仍不可用，因此 detached streaming、单源测量、Composer、splitter 与 drawer 的设备门禁结论没有改变。

## Goal

Improve Pixory's Android-first AI chat responsiveness without regressing chat continuity, detached streaming replay, controlled composer sizing, Personal space isolation, generation recovery, or original local data safety.

## Source and constraints

The source audit is `docs/ai-chat-research/chat_performance_report_v2.md`. Static findings are treated as hypotheses until confirmed against current source, tests, commit history, and Android measurements. The reviewed status of each P0/P1 item is recorded in `docs/ai-chat-research/chat_performance_report_v2_triage.md`.

The design obeys these constraints:

- Android correctness takes priority over theoretical render-count reductions.
- Normal and Personal space continue to use isolated database execution paths.
- Streaming generation remains recoverable across route changes and app lifecycle events.
- Existing detached-tail block identity, promotion, measurement-cache, and shrink-debt contracts remain intact unless an equivalent replacement passes all contract tests.
- No navigation framework migration, root-state rewrite, FlashList adoption, or broad state-library introduction is included in P0/P1.
- Claimed gains must be measured; the report's unsupported percentages are not acceptance criteria.

## Chosen approach

Use an evidence-first, multi-wave optimization program.

Wave 0 creates repeatable fixtures, metrics, and regression gates. Wave 1 applies low-risk algorithmic and SQL optimizations with explicit equivalence tests. Wave 2 introduces bounded network concurrency and localized rendering changes. Wave 3 contains high-risk streaming and gesture work and only starts when Wave 0 reproduces a material problem and the proposed change beats the current implementation without correctness loss.

This approach is preferred over directly applying the report because current source already contains deliberate workarounds that the report recommends deleting. It is preferred over an architecture-first rewrite because the chat screen currently combines live streaming, detached replay, branches, companion artifacts, memory, citations, and recoverable generation; a broad rewrite would make attribution and rollback unreliable.

## Architecture boundaries

### Measurement and benchmark boundary

Performance fixtures and instrumentation observe production modules without changing product output. They cover:

- a 200-message active thread with branches, citations, diary/dream artifacts, and a 15K-character assistant message;
- bottom-locked live streaming and detached replay while the user reads history;
- composer controlled updates containing short text, multiline CJK, pasted long text, clearing after send, keyboard open/close, and font-scale changes;
- 1MB Chinese/English/Japanese/Korean prompt text and boundary-sized token budgets;
- a knowledge document with 1000 chunks and embedding replacement/deletion;
- math content whose WebView reports multiple height messages;
- drawer open, drag, cancel, close, Android back, and accessibility button flows.

Metrics include JS commit counts, detached merge duration, measured-vs-reserved height differences, visible scroll jumps, input height transitions, query plans and statement counts, token-estimator duration/allocation proxies, embedding throughput/concurrency, and KaTeX compilation count.

### Safe optimization boundary

Safe optimizations preserve public interfaces and output:

- token estimates and trimming results remain byte-for-byte equivalent for the regression corpus;
- KaTeX compilation is cached per `math` input while WebView height remains stateful;
- knowledge deletion and embedding replacement use set-based SQL and bounded batches inside the existing space-scoped database transaction;
- rich-message detection is cached only when component state and trailing cursor semantics remain correct.

The reported generation-job scan is a false positive: `generationId` has a SQLite automatic unique index. The implementation adds a query-plan regression assertion but does not rewrite the production query.

### Controlled concurrency boundary

Embedding generation uses a small worker pool rather than unbounded `Promise.all`. The pool:

- defaults to a maximum of three active requests;
- keeps result association deterministic by chunk id;
- writes completed embeddings in bounded SQLite batches after network work;
- preserves the current generated/failed result contract without leaking provider secrets.

Retry, exponential backoff, request cancellation, and provider-specific batch APIs remain P2 roadmap work. They are not bundled into the concurrency change.

### High-risk streaming boundary

Live bottom-locked streaming and detached replay remain separate paths. The current live path already avoids top-level message updates for publishable patches. Optimization therefore targets only measured sources of detached-path work:

- stable callbacks/props and memoized tail wrapper surfaces;
- a narrowly scoped external-store subscription only if profiler evidence shows top-level commits are the bottleneck;
- incremental splitter state only if it produces the same block ids, raw content, finalized flags, lane ordering, reserved-height policy, and terminal flush result as full parsing for every contract fixture;
- measurement-source changes only if Android tests show no missing measurements or replay jumps after removing the rAF fallback.

No high-risk streaming change may combine parser, measurement, list, and store rewrites in one commit.

### Animation and gesture boundary

Animation changes are divided by value ownership:

- values used only for opacity/transform timing may use the native driver or Reanimated after focused verification;
- values shared with JS `PanResponder`, `setValue`, or listeners are migrated as a complete gesture unit, not toggled piecemeal;
- drawer migration preserves scrim interpolation, drag threshold, press-to-close, explicit close button, recent-thread actions, Android back behavior, and accessibility roles;
- pet gesture migration is a separate unit from the drawer and is not required for the first safe performance release.

## Data flow

### Streaming

Provider patch → generation manager → streaming subscriber → either live external message store (bottom locked) or detached tail model (reading history) → FlatList tail item → measured block → reserved-height reconciliation.

The optimization may shorten work inside a stage, but it must not bypass generation persistence, terminal settlement, buffered patch recovery, or scroll-lock policy.

### Knowledge embeddings

Document chunks → missing-chunk query → bounded provider worker pool → per-chunk result map → space-scoped transaction → batched embedding upsert → retrieval-availability cache invalidation.

Partial provider failure keeps the current generated/failed reporting contract. Retry and cancellation semantics are unchanged in this P1 work.

### Database deletion

Document id → transaction → bulk citation deletion by document/chunk subquery → bulk embedding deletion by chunk subquery → chunk deletion → document deletion → affected-row result.

All statements execute against the database selected by `runWithDatabaseSpace`; no cross-space identifiers are accepted.

## Error handling and rollback

- Each wave is independently committable and revertible.
- Query changes retain integration tests for both normal and Personal space database instances.
- Embedding cancellation and provider errors return structured counts and never expose API keys or raw authorization responses.
- Incremental streaming parser failures fall back to the current full parser behind a narrow runtime switch until Android acceptance is complete.
- Measurement experiments retain the existing dual-source implementation until the single-source candidate passes; lack of improvement closes the item without a source change.
- Gesture migrations retain non-gesture close paths so a failed drag implementation cannot trap the user in an overlay.

## Acceptance gates

All code waves must pass:

```text
pnpm typecheck
pnpm test
git diff --check
```

Focused gates:

- Generation lookup: `EXPLAIN QUERY PLAN` continues to report `SEARCH ... USING INDEX sqlite_autoindex_ai_generation_jobs_2 (generationId=?)` and no table scan; production SQL remains unchanged.
- Token estimator: identical outputs for ASCII, CJK, emoji/surrogate pairs, mixed-language, empty, and 1MB fixtures; median benchmark time improves and does not regress small-input latency materially.
- Knowledge operations: statement count does not scale linearly with chunk count; deletion preserves citation/embedding/chunk/document integrity in both spaces.
- KaTeX: one compilation per distinct `math` value even after repeated WebView height updates; invalid math still renders the current error surface.
- Embeddings: active requests never exceed the configured limit; result-to-chunk mapping and partial-failure counts are deterministic in tests.
- Streaming: no lost/duplicated/reordered text, stable block ids, no forced scroll while reading history, and no regression in existing tail replay contract tests.
- Android UI: no composer height collapse, no visible detached-tail jump, no drawer trap, and no release-only crash. Screenshots or recordings use real populated data.

For high-risk Wave 3 work, implementation proceeds only when the baseline reproduces at least one of these conditions on the target Android profile: a repeated JS task over 16ms in the affected interaction, a visible layout jump, sustained detached-render work above its configured target rate, or a database/network operation whose cost scales linearly where a set/batch operation is available. The candidate must improve the primary measured metric by at least 20% without worsening correctness metrics; otherwise the current implementation remains.

## Documentation and release behavior

- The original report receives a caution marker linking to the reviewed triage and this design.
- The triage table is the status source for P0/P1. Implemented items must record commit, verification, Android device/profile, and measured result.
- P2/P3 remain roadmap candidates. Navigation migration and root-state migration require separate design documents.
- This documentation-only change does not update `docs/feature-matrix.md`. Any later user-visible, repository, schema, privacy, storage, backup, or test-coverage change updates the matrix in the same implementation change.
- No APK, OTA update, release, tag, push, or remote deployment is part of this plan.

## Out of scope

- Native-stack/Expo Router migration.
- Zustand introduction solely for performance.
- FlashList adoption.
- Automatic cancellation when a generation has zero subscribers; this requires a separate product decision about background completion.
- Navigation animations, broad home-screen redesign, or unrelated UI polish.
- P2/P3 implementation before their own evidence review.
