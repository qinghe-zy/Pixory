# Companion Runtime Stage C Implementation Plan

> **Execution guardrail:** implement sequentially with TDD. The product design and total Spec are already approved; autonomous execution must not reopen product questions. Review once after each large framework, then once for the whole stage.

**Goal:** Complete affect/relationship/repair projections, role dreams, offline thoughts, unified artifact arbitration, user controls, Android-first cards/readers, durable recovery and exact branch/space delivery.

**Architecture:** V53 adds all Stage C persistence in one additive migration. Pure policy and validators remain isolated under `src/ai/companion`, `src/ai/dream`, and `src/ai/thought`. `aiChatService` only coordinates observation, reservation and successful commit; screens subscribe to state and render. Every artifact is source/version/branch scoped, generated asynchronously behind SQLite leases, and injected only through one low-trust dynamic slot.

**Cost boundary:** local candidate detection is zero-token. Automatic dreams call a classifier only after frequency and persisted-roll pre-pruning, then make one generation call only when selected. Thoughts make at most one short generation call per meaningful session. Both use bounded output tokens, strict JSON where required, no embeddings and finite retries.

## Framework 1: Affect, relationship, stance and repair

### Task 1: Freeze projection and repair contracts

- [ ] Add pure tests for all V1 affect stimuli, damping, decay, per-turn clamps, unresolved-rupture modifiers, deterministic replay and no offline decay.
- [ ] Add relationship tests for trust clamps, meaningful-turn gates, all four stages, downgrade thresholds, branch overlay isolation and role-base eligibility.
- [ ] Add stance tests for neutral fallback, affect labels, current request precedence, repair priority and natural response-length constraints.
- [ ] Add repair state-machine tests for detected/constrained/acknowledged/observing/verified, three relevant assistant turns, exact violation reopen and explicit dismissal.
- [ ] Add SQLite tests for source/version invalidation, replay after branch adoption/edit, policy-version rebuild and normal/personal isolation.

### Task 2: Add V53 projection and repair persistence

- [ ] Create `companion_projection_snapshots`, `companion_affective_observations`, and `companion_repairs` with source, branch, sequence, policy, status and high-frequency indexes.
- [ ] Extend Stage B events only where needed for conflict, disclosure, reconciliation and assistant boundary violations; never reinterpret quoted/hypothetical/artifact content as relationship evidence.
- [ ] Implement deterministic replay, one-time event application, role-base plus branch-overlay composition and malformed-projection rebuild.
- [ ] Keep affect observations at six hours or eight effective rounds, whichever occurs first. Never convert them into stable memory claims.
- [ ] Create/update repairs on boundary or correction; verify assistant behavior locally when exact, queue semantic verification only when necessary, and preserve auditable transitions.
- [ ] Compile only short stance/repair language into `companion_runtime`; never inject internal numbers, event IDs or raw JSON.
- [ ] Record content-free projection version, stance label and repair status metrics.

### Framework 1 review gate

- [ ] Run projection/repair tests, affected prompt/cache/memory/branch suites, typecheck and diff check.
- [ ] Review deterministic replay, branch adoption, current-turn enforcement, three-turn verification, no punishment for corrections, no stable-hash pollution and no UI exposure of internal scores. Fix all findings.

## Framework 2: Role dreams

### Task 3: Add provider request controls and dream persistence

- [ ] Extend every provider adapter with optional `maxOutputTokens`, `thinkingDisabled` and structured JSON mode without changing ordinary chat defaults.
- [ ] Add `companion_dream_scenes`, `companion_dream_seeds`, `companion_dream_jobs`, `companion_dreams`, `companion_role_round_counters`, and idempotent role-round receipts.
- [ ] Persist scene state, exact adopted source versions, role/thread/branch, roll, classifier output, probability, quota reservation, lease, attempts, cancellation and context opt-in.
- [ ] Preserve Stage C records in thread space moves; clear leases and revalidate source scope after import.

### Task 4: Implement sparse candidate, classifier and frequency policy

- [ ] Build a bounded local detector covering dream, sleep, bedtime, environment, implicit action, shared interaction, waking, roleplay structure and Chinese/English mixed signals.
- [ ] Treat negation, hypothesis, past report, quotation, metaphor, medical/product/meta and third-party language as negative signals without brittle single-word vetoes.
- [ ] Scan only newly completed/adopted user+assistant rounds; never scan reasoning, system, tool, artifact, failed/stopped or sibling content.
- [ ] Create one scene/seed per continuous scene. Persist roll once; check 50-role-round cooldown, Beijing daily-two cap and reservations before any model call; pre-prune with the safe maximum probability.
- [ ] Classify with strict evidence-gated JSON and fail closed. Apply 55/40/30/10/10/0 probabilities locally; the model never samples or creates jobs.
- [ ] Explicit dream requests create one durable confirmation per exact adopted message version; confirmed manual jobs bypass automatic quota/cooldown but remain idempotent.

### Task 5: Generate, recover, cancel and present dreams

- [ ] Generate from a compact role snapshot, scene and at most 20 recent adopted messages. Enforce first person, 4–10-character title, dreamlike imagery, 80–160-character target and 220-character hard cap.
- [ ] Use a lease-protected at-least-once job with exactly-once artifact commit, source/branch revalidation before every commit, two automatic retries, stable retry seed and abortable cancellation.
- [ ] Reconcile on startup/database-open/Personal unlock/foreground; leaving the chat never owns task lifetime. No Android notification or proactive message.
- [ ] Add source-thread hint states: `梦境制作中` spinner + `取消`, `查看梦境`, and terminal `梦境未能完成  重试`; hints never block chat.
- [ ] Generate and include one calm abstract dream texture asset. Render a 2.6:1 list/chat background card and a 9:13 borderless vertical reader using diary pagination/preload/swipe behavior.
- [ ] Put `是否影响后续对话？ 是 / 否` on the final page, one text size below body with normal touch targets. Only explicit yes enables a low-trust `role_dream` segment in the exact source space/thread/branch.
- [ ] Verify cancellation, late results, retries, process recovery, message edits, regeneration/adoption, sibling isolation, cross-thread list visibility and recursive artifact exclusion.

### Framework 2 review gate

- [ ] Run dream policy/repository/runtime/UI tests, provider adapter tests, typecheck and diff check.
- [ ] Review zero-call negative path, persisted sampling, role-wide counters, quota release, exact source revalidation, cancellation races, content constraints, no notifications and token metrics. Fix all findings.

## Framework 3: Ackem-style offline thoughts

### Task 6: Detect, batch and generate session thoughts

- [ ] Add `companion_thought_events`, `companion_thought_jobs`, and `companion_thoughts` with exact user/assistant versions, session, role/thread/branch, source hash, status, lease, quota reservation and delivery fields.
- [ ] Detect vulnerable, hurtful, reconciliation, apology, praise and cold events locally after each newly completed/adopted round; reject politeness-only, product/code, translation, quote, fiction analysis, hypothesis, third-party and artifact-derived content.
- [ ] Persist events before scheduling. Settle on background, thread/role switch, ten-minute inactivity and startup recovery; merge a continuous session and create at most one normal generation request.
- [ ] Deduplicate sources and preserve hurtful→apology→reconciliation chains; prioritize high-value and recent events under a 500–1500-token input budget.
- [ ] Enforce three successful thoughts per role/Beijing day/physical space, reserve quotas transactionally and permit zero output. Retry at most twice after the first call.
- [ ] Validate strict JSON evidence and body constraints: first-person unsaid thought, 30–90 target, 120 hard max, no invented facts/system language/coercion/generic fallback or batch duplicates.

### Task 7: Implement list, deletion and one-time delivery

- [ ] Show thoughts only in `内心独白 → 独白`, newest first, with body and Beijing time; hide event type, priority, model and delivery fields.
- [ ] Soft delete by default and remove immediately from pending delivery; source changes mark `stale_source`; retain delivered thoughts in the list.
- [ ] Atomically reserve at most one eligible thought when a matching chat request is created. Reuse reservation for retries; release on failure/stop/cancel/non-adopted generation; commit delivered only with completed adopted assistant response.
- [ ] Inject one low-trust `role_thought` segment that may subtly affect wording but is not a fact, instruction or memory.
- [ ] Reconcile idle timers/jobs/expired leases on foreground and startup without page-unmount dependence.

### Framework 3 review gate

- [ ] Run thought detector/session/repository/delivery/UI tests, typecheck and diff check.
- [ ] Review one-job-per-session, daily quota races, event-chain preservation, no-event zero-call, source invalidation, retry reservation reuse, exactly-once delivery, soft deletion and physical isolation. Fix all findings.

## Framework 4: Unified artifact arbitration and user controls

### Task 8: Unify diary, dream and thought context

- [ ] Create `companionArtifactAdapter` with the common artifact identity/status/source contract for diary, dream and thought.
- [ ] Remove the role-wide diary bypass from `dynamic_memory`. Only exact source-thread/branch user-opted diary/dream or one pending thought may enter the single artifact slot.
- [ ] Arbitration order is explicit opted-in dream/diary first, then the highest eligible pending thought; at most one artifact segment per request and one optional topic overall.
- [ ] Validate source visibility before selection and again before thought delivery. Deleted/stale/sibling/cross-thread/cross-space artifacts are ineligible.
- [ ] Keep artifact segments dynamic, low-trust, budget-trimmable and outside stable prefix hash/memory epoch.

### Task 9: Finish Android-first UI and controls

- [ ] Make Diary/独白/梦境 tabs interactive with real loading, empty, refresh and error states; keep list rendering bounded and role-scoped.
- [ ] Add dream reader route, dream card, thought rows, delete/restore affordances and source-thread chat notices using shared design tokens and accessible touch targets.
- [ ] Add global `情感与时间感知` switch (default on), role reset/clear actions and a management surface for time anchors, OpenLoops and unfinished repairs; never display internal four-dimensional values.
- [ ] Closing awareness stops new automatic observation but does not delete history or suppress explicit current correction/boundary behavior.
- [ ] Update role deletion/space move cleanup and `docs/feature-matrix.md`.
- [ ] Validate Android screenshots with realistic diary/thought/dream data when a device/emulator is available; otherwise record the exact unverified visual surface.

### Framework 4 and Stage C final review gate

- [ ] Run all Stage C tests plus affected diary/chat/prompt/cache/memory/branch/import/move/schema/provider/UI tests.
- [ ] Run `pnpm typecheck`, `pnpm test`, `git diff --check`, and Expo dependency check only if package metadata changed.
- [ ] Review the complete Stage C diff against Spec sections 8–11, 16–21: privacy, adopted versions, branch/role scope, durable leases, quota reservations, finite retries, no proactive delivery, one artifact slot, source deletion, token bounds, user control, accessibility and unrelated churn.
- [ ] Fix every finding, rerun verification, update the plan review record and create one Stage C commit.

## Rollback boundary

Reverting the Stage C commit removes V53 declarations, projection/repair policies, dream/thought runtimes, artifact/UI integration and related tests together. Existing V53 databases retain additive tables ignored by earlier builds. Rollback never deletes conversations, memories, diaries or original assets.

## Stage C review record

- Status: all four frameworks and Tasks 1–9 implemented and centrally reviewed on 2026-07-29. The checklists above are acceptance criteria retained verbatim; completion evidence is the Stage C commit and test suite rather than destructive rewriting of the plan history.
- Framework 1 review: deterministic replay, reset cut-off, role/branch projection layering, present-turn boundary precedence, repair verification, score non-disclosure and stable-prefix separation reviewed; targeted projection/repair, prompt/cache, branch and repository tests pass.
- Framework 2 review: classifier/generator schemas, zero-call clear sleep-topic path, persisted roll, role-wide 50-round/two-per-day counters, quota release, in-transaction source revalidation, cancellation/retry, durable notices, structured provider controls and content-free classifier/generator token counts reviewed; targeted dream/provider tests pass.
- Framework 3 review: one job per ten-minute session, daily-three atomic quota, zero-output acceptance, source invalidation, one-time reservation reuse/release/delivery, soft deletion and Personal physical isolation reviewed; targeted thought/artifact tests pass.
- Framework 4 review: one artifact slot, exact source thread/branch/space, explicit dream/diary opt-in, low-trust semantics, cross-space preservation, reset/clear distinction, loading/error/empty states, touch targets and feature matrix reviewed.
- Verification: `pnpm typecheck`, Stage C targeted tests and `git diff --check` pass. Full `pnpm test` has one pre-existing Stage E native-bridge failure because `PixoryShareActivity.kt` is absent; the lifecycle policy regression exposed by added foreground reconciliation was fixed and its test passes. Package metadata did not change, so no Expo dependency check was needed.
- Android visual status: `adb devices` returned no connected emulator/device. The generated dream texture was visually inspected locally, but realistic on-device dream/thought/management screens remain explicitly unverified until Stage E device smoke testing.
