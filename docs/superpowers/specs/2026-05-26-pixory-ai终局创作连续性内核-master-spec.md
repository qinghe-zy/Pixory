# Pixory AI Creative Continuity Kernel Master Spec

Date: 2026-05-26
Status: Master specification for future implementation planning
Product direction: Long-term creative companion

## 1. Vision

Pixory AI should evolve into a local-first creative continuity system for long-running IP, character, material, and text creation.

Its purpose is not to become a generic AI writing platform or a cloud knowledge product. Its purpose is to keep a creator's work continuous over time: conversations, branches, role settings, source materials, partial generations, memory, and retrieval context should remain durable, recoverable, traceable, and usable even as a project grows large.

The terminal product feeling is:

- The AI feels like a creative companion, not a document manager.
- Text streams naturally, as if it is breathing onto the page.
- Long creative sessions do not collapse under their own history.
- Interruptions do not waste the user's waiting time.
- Branches feel like creative routes, not technical version hashes.
- Memory helps preserve characters, worlds, tone, choices, rejected paths, and unresolved ideas.
- RAG acts like a proactive creative assistant, surfacing relevant materials and conflicts without turning creative writing into a citation workflow.

The first-order guarantees are:

- Do not lose user-visible creative work silently.
- Do not break creative continuity during long conversations, long outputs, branch exploration, app restarts, provider failures, or Android process death.

## 2. Product Boundaries

This master spec assumes Pixory remains Android-first, local-first, and offline-capable for its own data layer. External model providers may be used as pluggable inference sources, but Pixory-owned state must remain local.

The following are not part of this spec unless separately designed and approved:

- Cloud sync or a server-hosted knowledge base.
- Multi-user collaboration.
- Automatic canon decisions without user confirmation.
- Automatic physical deletion of user-visible history, formal materials, named creative routes, canonical memory, or original image/video assets.
- Lock-in to a specific model provider.
- A generic AI writing suite detached from Pixory's IP, character, material, and local archive model.

These are scope boundaries for this spec, not permanent product prohibitions.

## 3. Architectural Principle

All major AI systems should be organized around the Creative Continuity Kernel.

The kernel is the local coordination layer that keeps creative work durable and resumable across:

- Streaming generation.
- Message versions and creative branches.
- Imported materials and citations.
- Deep memory and creative journals.
- RAG indexes and token budgets.
- Provider failures and app lifecycle interruptions.
- Background maintenance and garbage collection.

Every module should answer one question:

How does this preserve or improve the user's ability to continue a creative thread later?

## 4. Seven-Layer Architecture

### 4.1 Local Integrity Layer

Purpose:
Provide durable local state for AI work, with explicit lifecycle tracking and conservative cleanup.

Owns:

- SQLite records.
- App-private material files.
- Integrity ledger records.
- Generation run state.
- Background job state.
- Recovery windows.
- Lazy garbage collection.

Responsibilities:

- Track every long-running AI operation with a durable local lifecycle.
- Make failed or interrupted work inspectable.
- Prevent orphaned files, chunks, embeddings, snapshots, and citations from accumulating without visibility.
- Provide dry-run GC and conservative automatic cleanup of only clearly disposable data.
- Preserve user-visible creative history unless the user explicitly deletes it.

Non-negotiable rules:

- No silent data loss.
- No automatic physical deletion of user-visible messages, named creative routes, formal materials, canonical memory, or original Pixory assets.
- GC must distinguish formal data from temporary, derived, or rebuildable data.

Candidate entities:

- `ai_integrity_events`
- `ai_generation_runs`
- `ai_recovery_items`
- `ai_background_jobs`
- `ai_gc_candidates`

### 4.2 Retrieval & Index Layer

Purpose:
Make local materials useful to creation without treating retrieval chunks as the source of truth.

Owns:

- Material versions.
- Chunks.
- Embeddings.
- FTS indexes.
- Citation mappings.
- Chunk overlap detection.
- RAG duplicate reduction.

Responsibilities:

- Retrieve relevant material snippets for the active creative context.
- Preserve stable citation links across material refreshes.
- Deduplicate overlapping chunks before prompt assembly.
- Keep original local files as the primary readable source.
- Track material and chunk versions so refreshes do not break historical citations.

Non-negotiable rules:

- Retrieval chunks are not the document body.
- IP snapshot refresh should preserve stable document identity when possible.
- RAG output should be token-efficient and source-aware.
- Rejected or abandoned branch materials must not silently affect the active route.

Candidate capabilities:

- Exact duplicate chunk suppression.
- Overlap-aware chunk merging.
- Citation source version mapping.
- Material scope filtering by thread, branch, IP, and knowledge base.

### 4.3 Streaming Runtime Layer

Purpose:
Make streaming output feel smooth while keeping partial generation durable and recoverable.

Owns:

- Generation run state.
- Streaming patch batching.
- Stream WAL or equivalent local draft persistence.
- Recoverable draft state.
- Progressive Markdown rendering.
- Provider cancellation and failure mapping.

Responsibilities:

- Persist partial assistant output frequently enough that process death does not waste long generations.
- Avoid UI jank during long streaming outputs.
- Separate user-visible message state from internal stream run state.
- Mark interrupted content explicitly instead of pretending it completed.
- Support continuation, retention, regeneration, or discard of interrupted drafts.

Target user experience:

- Short replies stream with low latency.
- Long replies remain visually continuous but internally use batching and parse throttling.
- Markdown may be progressively enhanced after text appears.
- Images, tables, and code blocks should not block the main text stream.

Message states should distinguish:

- `generating`
- `completed`
- `stopped`
- `failed`
- `interrupted`
- `recoverable_draft`

Non-negotiable rules:

- Interrupted text must not be marked as completed.
- UI parsing should degrade before input, scroll, or touch responsiveness degrades.
- A user should never have to guess whether a half answer is final.

### 4.4 Memory & Branch Layer

Purpose:
Preserve long-term creative meaning while keeping canon, working context, and exploratory branches separate.

Owns:

- Canonical Memory.
- Working Memory.
- Creative Journal.
- Creative route metadata.
- Branch scopes.
- Branch summaries.
- Adopted, paused, abandoned, and exploratory route states.

Memory model:

- Canonical Memory: stable user-confirmed facts, role settings, world rules, voice, relationships, and canon decisions.
- Working Memory: active route context, recent creative direction, unresolved local details, and short-to-mid-term session state.
- Creative Journal: process history, rejected ideas, route decisions, uncertain concepts, and user preference drift.

Branch model:

Branches should feel like creative routes, not Git graphs.

Each creative route can have:

- Name.
- Summary.
- Status: exploring, adopted, paused, abandoned.
- Key differences.
- Related materials.
- Related memories.
- Last active time.
- Entry point for continuing creation.

Non-negotiable rules:

- Abandoned or unadopted branch facts must not pollute Canonical Memory.
- Adopting a route may propose memory promotion, but the user should confirm meaningful canon changes.
- Branch metadata should help the user continue writing, not expose raw technical internals.

### 4.5 Creative Intelligence Layer

Purpose:
Provide proactive creative assistance on top of memory, branch, and retrieval state.

Owns:

- Active RAG suggestions.
- Material conflict detection.
- Canon conflict hints.
- Branch summary generation.
- Memory promotion suggestions.
- Creative route comparison.
- Material-inspired writing suggestions.

Responsibilities:

- Suggest relevant materials when they can help the current creative act.
- Warn about likely canon conflicts without blocking exploration.
- Summarize branch differences in creator language.
- Propose canon promotion from adopted routes.
- Surface useful visual or textual materials as optional inspiration.

Non-negotiable rules:

- The AI may suggest, but must not automatically decide the user's creative direction.
- Conflict warnings should preserve creative freedom.
- Creative assistance should not turn ordinary writing into a citation-heavy report unless the user asks for source-grounded output.

### 4.6 Context Scheduler Layer

Purpose:
Assemble the best possible prompt context from hot messages, memory, RAG, branches, and token budget.

Owns:

- Hot/cold conversation windows.
- Branch-aware message selection.
- Deep Memory selection.
- RAG candidate scoring.
- Token estimation.
- Prompt budget allocation.
- Context trimming explanations.

Responsibilities:

- Keep recent conversation responsive while allowing very long threads.
- Choose which memory and materials to include based on the user's current task.
- Respect branch scopes and route state.
- Deduplicate overlapping material and memory.
- Explain meaningful context trimming when it may affect output quality.

Scheduling examples:

- Roleplay: prioritize role canon, voice, relationship memory, active route context, and recent dialogue.
- Longform continuation: prioritize current route summary, unresolved plot points, recent chapter state, and relevant materials.
- Material-grounded Q&A: prioritize RAG snippets, source citations, IP records, and confirmed facts.
- "What did we decide before?": prioritize Creative Journal and route decision records.

Non-negotiable rules:

- Budget pressure must degrade predictably.
- The scheduler should not randomly drop important canon or active route state.
- Token estimation may be approximate, but should be conservative enough to avoid provider rejection and transparent enough to improve over time.

### 4.7 Creative UX Layer

Purpose:
Expose the kernel through calm, creator-friendly surfaces.

Owns:

- AI chat experience.
- Recovery prompts.
- Creative route drawer.
- Branch comparison views.
- Material suggestions.
- Memory promotion confirmations.
- Reader and citation entry points.

Responsibilities:

- Keep ordinary writing flow uninterrupted.
- Show light recovery hints for low-value interruptions.
- Show stronger recovery actions for long writing, material writes, memory jobs, or route state failures.
- Let users name, pause, adopt, abandon, and continue creative routes.
- Make material suggestions feel helpful, not bureaucratic.

Recovery UX:

- Short reply interruption: subtle "generation unfinished" hint.
- Long reply or longform interruption: visible recovery panel with continue, keep draft, regenerate, or discard.
- Material, memory, or branch persistence failure: visible status because long-term consistency may be affected.

Non-negotiable rules:

- Normal creative flow should not be over-alerted.
- High-value risk must not be hidden.
- The user should always understand whether a draft, route, memory, or material is stable.

## 5. Cross-Cutting Data Concepts

### 5.1 Integrity Ledger

The integrity ledger is a local audit trail for AI operations that can affect creative continuity.

It should record:

- Operation type.
- Target entity.
- Started time.
- Completed, failed, cancelled, or interrupted time.
- Error category when available.
- Recovery strategy.
- User-visible consequence.

Candidate operation types:

- Generation run.
- Prompt build.
- Material import.
- Material refresh.
- Memory maintenance.
- Branch adoption.
- Canon promotion.
- Retrieval index build.
- GC cleanup.

### 5.2 Generation Run

A generation run should be a durable entity separate from the final assistant message.

It should track:

- Thread id.
- Message id.
- Branch scope.
- Provider and model snapshot.
- Prompt snapshot reference.
- Streaming state.
- Partial output checkpoint.
- Failure or interruption reason.
- Recovery affordance.

### 5.3 Creative Route

A creative route is a product-level abstraction over branch metadata.

It should track:

- Route id.
- Thread id.
- Optional IP or role id.
- Name.
- Summary.
- Status.
- Branch root.
- Current head message.
- Key differences.
- Related memory ids.
- Related material ids.

### 5.4 Memory Layers

Memory should be stored with a layer and scope:

- Canonical Memory: stable and user-confirmed.
- Working Memory: active route or active thread.
- Creative Journal: process-level and route-aware.

Each memory item should know:

- Scope: global, IP, role, thread, route.
- Confidence or confirmation status.
- Source message, route, or material.
- Whether it can be used in prompts automatically.
- Whether it requires user confirmation before promotion.

### 5.5 Recovery Item

A recovery item is a user-visible or system-visible continuation point.

It should track:

- Type: stream, material, memory, branch, GC.
- Severity: subtle, visible, blocking.
- Suggested actions.
- Expiration or retention policy.
- Whether it was resolved by the user or by system repair.

## 6. Phased Roadmap

The roadmap should be bottom-up. Durable foundations come before advanced creative surfaces.

### Phase 0: Integrity Baseline

Goal:
Every AI operation that can affect continuity has a durable local lifecycle.

Scope:

- Integrity ledger.
- Generation run state model.
- Recovery item model.
- Background job state normalization.
- Lazy GC dry-run.
- Basic orphan accounting for AI temporary data.

Acceptance:

- Interrupted or failed generation can be distinguished from completed output.
- AI background jobs can be inspected by state.
- GC can report candidates without deleting formal user-visible data.
- Tests cover ledger state transitions and non-deletion rules.

### Phase 1: Streaming Runtime

Goal:
Streaming feels smooth and partial long output is recoverable.

Scope:

- Stream checkpointing or WAL-like draft persistence.
- Streaming patch throttling.
- Active assistant message-only parsing.
- Progressive Markdown enhancement.
- Recoverable draft UX for long generations.

Acceptance:

- Long streaming output does not force full-list rerendering or full Markdown parsing on every patch.
- Process death or provider interruption leaves a recoverable draft state.
- Interrupted text is never marked completed.
- User can continue, keep, regenerate, or discard high-value interrupted drafts.

### Phase 2: Retrieval & Index Efficiency

Goal:
RAG becomes token-efficient, stable, and source-aware.

Scope:

- Chunk duplicate suppression.
- Overlap-aware merge before prompt assembly.
- Stable source version mapping.
- Thread, route, IP, and knowledge-base scope filters.
- Citation dead-link prevention policies.

Acceptance:

- Duplicate or overlapping snippets are reduced before prompt construction.
- Source files remain the primary reader body.
- Historical citations remain resolvable after refresh where identity can be preserved.
- Retrieval tests include duplicate, overlap, and route-scope cases.

### Phase 3: Context Scheduler

Goal:
Long conversations remain useful without loading or prompting everything.

Scope:

- Hot/cold message scheduling.
- Branch-aware context windows.
- Memory/RAG/message budget allocation.
- Improved local token estimation.
- Context trimming explanations.

Acceptance:

- Scheduler behavior is deterministic under budget pressure.
- Canon and active route state have higher priority than low-value old chatter.
- Long-thread prompt construction stays bounded.
- Tests cover roleplay, longform continuation, material Q&A, and decision-recall scenarios.

### Phase 4: Memory & Branch Foundation

Goal:
Pixory can separate confirmed canon, working context, process journal, and creative routes.

Scope:

- Canonical Memory schema.
- Working Memory schema.
- Creative Journal schema.
- Creative Route schema over existing branch mechanics.
- Route status and summary.
- Memory promotion proposal records.

Acceptance:

- Abandoned routes do not contaminate canonical memory.
- Adopted routes can propose canon promotion.
- Creative Journal can answer "what did we try or reject before?"
- Branch selection and prompt assembly respect route scope.

### Phase 5: Creative Intelligence

Goal:
Pixory becomes proactive without becoming intrusive.

Scope:

- Relevant material suggestions.
- Canon conflict hints.
- Route difference summaries.
- Material-inspired writing suggestions.
- Memory promotion suggestions.

Acceptance:

- Suggestions are optional and non-blocking.
- Conflict hints preserve the user's right to continue exploring.
- Creative suggestions cite their basis when useful.
- User confirmation is required for meaningful canon promotion.

### Phase 6: Creative UX

Goal:
The terminal product experience becomes visible and coherent.

Scope:

- Creative Route drawer.
- Route naming, pausing, adoption, abandonment, and continuation.
- Route comparison.
- Recovery center or contextual recovery panels.
- Material suggestion surfaces.
- Canon promotion review UI.

Acceptance:

- Users can understand and continue major creative routes without reading raw message history.
- Recovery actions are available where the risk is high.
- Material suggestions help creation without turning writing into document management.
- UX uses existing Pixory design tokens and remains calm, practical, and Android-first.

## 7. Testing Strategy

Each phase should include behavior-focused tests that resist shallow string matching where possible.

Required categories:

- Repository state transition tests.
- Prompt scheduling tests.
- Recovery state tests.
- Route scope and memory contamination tests.
- RAG deduplication and citation stability tests.
- UI policy tests for recovery and route surfaces.
- Long-history performance guards.

High-risk behaviors should have either executable tests or structural verification that checks data flow, state transitions, and deletion constraints.

## 8. Performance Strategy

The target feeling is that text streams naturally and continuously.

Implementation should prefer:

- Streaming patch batching over patch-per-token UI updates.
- Active message parsing over whole-thread parsing.
- Progressive Markdown enhancement over blocking full Markdown rendering.
- Memoized completed messages.
- Bounded FlatList residency.
- Chunked SQLite lookups.
- Bounded prompt assembly.
- Background or deferred maintenance for indexes and memory jobs.

When the system is under pressure, it should reduce rendering and parsing frequency before it harms typing, scrolling, touch response, or data durability.

## 9. Storage and GC Strategy

Lazy GC should be intelligent but conservative.

Safe automatic cleanup candidates:

- Expired temporary streaming checkpoints after successful finalization.
- Rebuildable temporary prompt assembly artifacts.
- Failed staging data outside the recovery window.
- Rebuildable stale index rows proven to have no owning material version.
- Import temp files replaced by formal app-private material records.

Requires recovery window or user-visible accounting:

- Old prompt snapshots.
- Branch summaries.
- Memory job history.
- Deprecated chunk and embedding versions.
- Abandoned route support data.

Requires explicit user action:

- User-visible messages.
- Named creative routes.
- Formal materials and app-private source files.
- Canonical Memory.
- Original Pixory image and video assets.

## 10. Open Design Risks

### 10.1 Complexity Creep

The kernel can become too abstract if implemented all at once. Each phase must deliver a concrete reliability or continuity improvement.

### 10.2 Memory Contamination

The biggest product risk is allowing exploratory branch facts to become canon accidentally. Canon promotion must remain explicit and traceable.

### 10.3 Over-Alerting

Recovery and conflict hints can interrupt creativity if too loud. Use mixed severity: subtle by default, strong only for high-value or consistency-affecting events.

### 10.4 Token Scheduler Opacity

If context scheduling becomes invisible, users may not understand why the AI forgot something. Important trimming should be explainable.

### 10.5 GC Trust

Automatic cleanup must earn trust through dry-run accounting, conservative defaults, and clear separation between temporary data and formal creative work.

## 11. Success Criteria

The Creative Continuity Kernel is working when:

- Long creative sessions remain fast enough to use.
- Long generations survive interruption as recoverable drafts.
- Users can resume meaningful creative routes without reconstructing context manually.
- Canon, working context, and creative journals are distinct.
- RAG actively helps without dominating creative flow.
- The system can explain or surface important recovery, trimming, conflict, and cleanup events.
- Local data remains inspectable, durable, and scoped.

## 12. Implementation Planning Notes

This master spec should not be implemented as one large project.

Each phase should become its own implementation spec and plan. Recommended first implementation spec:

Phase 0: AI Integrity Baseline and Recovery State.

That phase should define concrete SQLite schema additions, repository APIs, recovery item handling, GC dry-run accounting, and regression tests before touching higher-level creative UX.
