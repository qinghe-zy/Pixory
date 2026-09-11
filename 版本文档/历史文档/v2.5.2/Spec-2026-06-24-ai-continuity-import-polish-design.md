# Pixory AI Continuity Import Polish Spec

Date: 2026-06-24

## Status

Design supplement to `2026-06-23-ai-chat-continuity-import-design.md`.

Pending implementation plan.

## Why This Supplement Exists

The 2026-06-23 continuity-import spec established the main branch-safe import architecture, but review of the real code path exposed several gaps between the original intent and actual product behavior:

- External `txt` or loose `md` imports still depend on a narrow local parser before anything becomes renderable.
- The current memory model call happens mainly as post-import review, not as first-stage structure recovery.
- When local parsing fails to recover `messages`, semantically understandable continuity text does not render into chat and may not trigger the expected continuity maintenance flow.
- The import rollback affordance is visually too heavy and competes with the normal chat UI.
- Imported continuity protection currently inflates ordinary "待整理" expectations in a misleading way.
- Session settings still need the final unified import entry shape:
  - `导入外部记忆`
  - `导入角色卡`
- Provider model cleanup needs stronger deletion ergonomics in both global model settings and current-session model settings.

This supplement closes those gaps and is binding for the next implementation pass.

## Relationship To The Base Spec

Unless this document explicitly overrides something, the 2026-06-23 continuity-import spec remains in force.

This supplement adds or tightens requirements in five areas:

1. External continuity structure recovery.
2. Import review fan-out and acceptance storage.
3. Import UI polish and rollback presentation.
4. Session-settings import and role-card behavior.
5. Global/session model deletion ergonomics.

## Product Goals

After this supplement lands, Pixory must support the following real user scenario end to end:

1. A user chats in Pixory for a long time.
2. The user temporarily continues on another platform.
3. The user brings back either:
   - a Pixory-native continuity Markdown package, or
   - an external `txt`/`md` continuity document generated from Pixory's migration prompt, or
   - a role-card file for role reuse.
4. Pixory continues inside the same long-lived thread without destroying the old route.
5. Imported content becomes understandable to both the visible chat UI and Pixory's memory system.
6. Imported continuity does not overwrite existing trusted memory blindly.
7. Rollback is available only during the intended short observation window and disappears automatically afterward.
8. The user can clean stale provider models quickly when changing gateway/provider environments.

## Non-Goals

This supplement still does not require:

- Arbitrary third-party JSON conversation import.
- Batch importing many continuity files at once.
- Unlimited rollback after later maintenance has absorbed imported continuity.
- Automatic role-card merging across semantically similar but not byte-identical payloads.
- A visual diff workbench for import review decisions.

## Core Decisions

- External `txt`/`md` continuity import must no longer rely on local rule parsing alone.
- Pixory-native continuity Markdown import must remain deterministic and model-free.
- Model-assisted structure recovery is automatic when local recovery confidence is insufficient.
- Model-assisted recovery must be followed by a separate memory-review acceptance pass; the recovery result itself is not trusted as direct memory.
- The review pass must consume the final rendered continuity messages and continuity blocks, not only the raw document.
- Review acceptance must support dedicated fan-out into:
  - reversible summary artifacts,
  - reversible profile updates,
  - reversible formal memory operations.
- The top-of-chat rollback hint must be reduced to a compact inline notice and must replace the old context-trim notice in that position.
- The compact rollback hint must auto-disappear after the rollback window closes.
- Session settings must expose two separate imports:
  - `导入外部记忆`
  - `导入角色卡`
- Role-card import through session settings must use strict de-duplication.
- Global provider settings and per-session model settings must both support:
  - long-press multi-select,
  - batch delete,
  - delete all selected models from the same provider/source in one action.

## Native Pixory Import Rules

### Authoritative Native Artifact

The authoritative native continuity import source remains the Pixory continuity Markdown file, not the PNG role-card image.

This continues to satisfy the requirement that Pixory-native continuity can be restored without memory-model reasoning.

### Native Recognition Must Be Precise

Pixory-native recognition must not rely on file extension or file name alone.

A document is considered Pixory-native only if all required structural markers are present and parseable, including:

- native title marker,
- native source marker,
- native format version marker,
- required machine-readable sections,
- structurally valid native payload blocks for branch/messages/summary/memory sections where applicable.

For the current export format, the importer should key off the exact exported section contract produced by `aiRoleCardContinuityExport`, including:

- `# Pixory Role Continuity Export`
- `## Native Continuity Metadata`
- `- Format Version: <n>`
- `- Source: pixory-native`
- `## Native Branch Payload`
- `## Native Message Payload`
- `## Native Summary Payload`
- `## Native Memory Payload`

Each native payload section must contain parseable fenced JSON in the expected structural shape. Missing title/source markers alone are enough to disqualify native mode; present markers with broken payload JSON must also disqualify native exact import and trigger safe downgrade to external evaluation.

If any required native marker is missing or malformed, the importer must not crash and must fall back to external-document evaluation instead of pretending native exact recovery succeeded.

### Native Role-Card Handling

Pixory-native continuity Markdown import does not require the role-card file to be present.

If the user separately imports a role-card file:

- if an exactly matching saved role card already exists, Pixory must reuse it and not create a duplicate library entry;
- otherwise Pixory must import it into the role library;
- role-card import remains a separate role-library concern and not the authoritative continuity reconstruction source.

## External Continuity Import: Required New Pipeline

### Problem In Current Real Behavior

Today, Pixory first tries strict local parsing for external text. Only recovered `messages` become visible chat messages. The memory model mainly reviews what was already parsed. This means a semantically understandable but loosely formatted `txt` document can fail to render into chat and fail to enter the intended continuity path even when a model could clearly recover the structure.

That behavior is insufficient and must change.

### New Three-Stage External Pipeline

External continuity import must run through three explicit stages:

1. Deterministic local recovery.
2. Automatic model-assisted structure recovery when local recovery is insufficient.
3. Separate import review and acceptance fan-out.

#### Stage 1: Deterministic Local Recovery

Pixory should still try local parsing first because it is cheap, fast, and auditable.

The local parser should extract when possible:

- transcript messages,
- relationship or background summaries,
- psychology or emotional trajectory,
- biological or physiological state,
- state continuity summary,
- compressed history,
- candidate memory blocks,
- unknown residue blocks.

Local parsing must never throw on malformed files. It must degrade into residue blocks safely.

#### Stage 2: Automatic Model-Assisted Structure Recovery

If local recovery confidence is insufficient, Pixory must automatically call the memory-maintenance model path to restore structure before import rendering is finalized.

This is the default implementation choice for this pass. No extra user confirmation is required before the automatic recovery attempt.

Model-assisted recovery must trigger when any of the following is true:

- local parsing recovers zero transcript messages,
- transcript recovery is clearly partial while strong continuity sections exist,
- large residue blocks remain but clearly contain dialogue or structured continuity,
- the file is external `txt` and role labels are missing or inconsistent,
- the document appears semantically segmented but not in Pixory's strict local format.

The recovery prompt must ask the model to return structured JSON only, separated into at least:

- `messages`
- `blocks`
- `sourcePlatform`
- `containsCompressedContinuity`
- `confidence`
- `warnings`

The model is helping recover structure, not granting memory truth.

#### Stage 2 Validation Requirements

Model-assisted recovery output must be sanitized before use.

Pixory must reject or trim invalid recovery output when:

- roles are not one of `user`, `assistant`, `system`,
- content fields are missing or excessively large,
- message ordering is nonsensical,
- the model injects instructions outside the expected JSON schema,
- blocks exceed safe limits,
- total parsed payload exceeds import safety thresholds.

If model recovery fails, Pixory must still not crash. It must preserve the document as continuity blocks and surface a clear partial-import result.

#### Stage 2 Merge Rules

When both local parsing and model-assisted recovery succeed, Pixory must merge conservatively:

- keep deterministic native/local recoveries as the first authority where they are structurally valid;
- use model recovery to fill missing transcript sections or classify residue blocks;
- avoid duplicating the same message twice;
- preserve unresolved text as residue blocks instead of forcing hallucinated structure.

### Stage 3: Import Review And Acceptance

After the final renderable import payload is assembled, Pixory must send all of the following into the review pass:

- raw document text,
- final rendered continuity messages,
- final continuity blocks,
- source mode and recovery provenance,
- whether model-assisted structure recovery was used,
- native-detection outcome,
- rollback/import-session context.

This review pass is required even if Stage 2 used the same underlying model path. Structure recovery and memory acceptance are separate responsibilities.

## Import Review Fan-Out Must Be Dedicated

### Problem To Avoid

The earlier implementation direction of "review passed, then mostly land a reversible summary carrier and let later ordinary maintenance do the rest" is not sufficient as the dedicated import-acceptance path.

That creates a hidden gap between:

- what the reviewer already knows,
- what should immediately become reversible accepted import artifacts,
- and what is deferred to later generic maintenance.

### Required Acceptance Fan-Out

When review passes, the acceptance path must support dedicated, reversible routing into separate targets:

1. `profile`
   - user/background/relationship/profile facts that belong in the thread-scoped profile.
2. `formal memory`
   - atomic memories or memory reconciliation operations that belong in the formal memory store.
3. `summary`
   - continuity summaries that should remain summary-only and not become formal memory.

The implementation may still reuse existing repositories and reversible effect ledgers, but the acceptance logic must explicitly distinguish these targets instead of treating everything as one generic summary artifact.

### Required Reviewer Output Shape

The review path should normalize accepted results into an internal structure equivalent to:

- accepted profile patch
- accepted formal memory operations
- accepted summary artifacts
- rejected or unresolved items
- reviewer warnings

The reviewer may still return one JSON envelope, but Pixory must split it into target-specific acceptance handling before persistence.

For this pass, the JSON envelope should expose dedicated target fields rather than relying on one shared free-form blob. The intended shape is equivalent to:

- `profilePatch`
- `memoryOperations`
- `summaryArtifacts`
- `rejectedItems`
- `warnings`

Pixory must not treat "parse the whole review text again and hope profile fields fall out" as the primary acceptance path for imported continuity. Parsing the full review text may remain a backward-compatible fallback during migration, but the new dedicated import-acceptance path must read explicit target fields first.

### Reversible Storage Requirement

Every accepted import-side effect written before stabilization must be reversible and attributable to the import session, including:

- profile upserts,
- memory creates,
- memory updates,
- memory stale/keep operations,
- summary segments or import-summary artifacts.

Rollback must restore or remove these effects through the existing effect ledger path rather than relying on soft UI hiding alone.

## Rendering Rules After External Import

### Chat Rendering

If transcript messages can be recovered safely, they must render directly in the chat page as imported continuity content.

This includes transcript messages recovered by model-assisted structure recovery, not only messages recovered by local parsing.

### Continuity Blocks

Continuity blocks that are not safe to render as ordinary user/assistant messages must remain attached to the import session and participate in review, retrieval, and future maintenance according to acceptance state.

### Partial Import UX

When Pixory can recover only part of the transcript:

- recovered messages must still render,
- unresolved content must remain as continuity blocks,
- the success banner must clearly say it was a partial recovery,
- the user must not be misled into thinking the whole document became visible chat.

## Rollback And Branch Behavior

### Branch Attachment

Imported continuity still attaches as a new branch inside the same thread.

After successful import:

- Pixory switches to the imported branch,
- the composer stays empty,
- the conversation feels visually continuous.

### Rollback Window

Rollback remains limited to the first 10 effective post-import rounds.

Before stabilization:

- the user may switch back to the pre-import state,
- all reversible import effects must roll back,
- the active route returns to the pre-import anchor route.

After stabilization:

- rollback is forbidden,
- the compact rollback hint disappears automatically,
- imported content remains part of the thread history as an ordinary stabilized branch.

### No "Ten-Round Manual Undo" In Memory Board

The earlier idea of a temporary memory-board undo path inside ten rounds is not required in this version.

The authoritative rollback action is branch rollback from the import milestone path during the bounded window.

## Chat UI Changes

### Replace The Old Context-Trim Notice

The old top-of-chat notice:

- `较早的部分对话可能不会被本次回复参考。`

must no longer appear in its old form.

That placement must instead host the compact continuity rollback notice whenever an active imported branch still has rollback eligibility.

### Compact Rollback Notice

The new notice must be visually small and low-friction, for example a slim inline card/chip row above the composer area or above the message list in the same location as the former trim notice.

It must show at minimum:

- imported continuity label,
- remaining rollback rounds,
- tap affordance for details.

Example copy direction:

- `已接回外部记忆 · 剩余 7 轮`
- `已接回 Pixory 连续性 · 剩余 3 轮`

Tapping the compact notice must open a details sheet/dialog with:

- import source,
- import time,
- recovered message count,
- whether compressed continuity was present,
- review state,
- rollback action if still available.

The compact notice must be bound only to the currently active imported branch route. If a thread contains multiple historical import milestones, the top notice must not pick an unrelated older milestone merely because it is still present in thread history. The active notice must resolve from the visible/current branch lineage and prefer the active rollback-eligible import session for that route.

### Chat Milestone Persistence

The transcript milestone at the import point should remain in history as an auditable marker even after the compact top notice disappears.

After stabilization, the milestone may still expose detail but must not offer rollback.

## Session Settings Changes

### Import Entry Layout

Session settings must expose a dedicated continuity/import area rather than mixing all actions into the role-display row.

This area must include:

- `导入外部记忆`
- `导入角色卡`
- `复制迁移提示词`

`导出当前角色包` may remain nearby, but import and export should read as a coherent continuity toolset instead of a single overloaded action row.

### External Memory Import Entry

`导入外部记忆` must accept:

- `.txt`
- `.md`

and auto-detect:

- Pixory-native continuity Markdown
- external Markdown
- external text

### Role-Card Import Entry

`导入角色卡` must reuse the existing local role-card parser/preview pipeline where possible.

Accepted role-card file types remain:

- PNG role card
- JSON role card

Import result behavior:

- if exact imported payload already exists in the role library, do not create a duplicate;
- otherwise save into the role library;
- if the current session wants to apply that role card after import, reuse the imported or existing role entry.

When role-card import is launched from session settings, the default behavior should be:

- import-or-reuse the role card in the library,
- then apply that role card to the current session,
- without creating duplicate library rows for the same exact imported payload.

## Strict Role-Card De-Duplication

This supplement keeps the chosen strict de-duplication policy.

Strict de-duplication means:

- dedupe only on exact import identity/payload rules,
- do not merge merely because names are similar,
- do not silently overwrite an existing manual role card.

For imported role cards, the exact-match rule should be based on the persisted import identity, equivalent to:

- `sourceType`
- exact normalized `sourceJson`

If either import-identity field is absent, Pixory must not pretend strict dedupe succeeded. In that case it should treat the card as non-deduplicable and import it as a new entry unless the user is explicitly editing an existing role card.

If a matching imported role card already exists, Pixory should report a reuse-style success state rather than pretending a new role was created.

## Imported "待整理" Count Must Be Honest

### Problem

Imported continuity can create a large protected backlog during the observation/review window. Showing that entirely as ordinary pending rounds is misleading because the normal irreversible maintenance path is intentionally gated.

### Required Status Split

Memory-maintenance status must distinguish between:

- ordinary pending rounds,
- import-protected pending continuity.

The UI copy does not need to be complex, but it must avoid implying that the system simply "forgot" to summarize the imported rounds.

Acceptable directions include:

- `待整理 4 轮 · 导入观察期 26 轮`
- or equivalent phrasing that separates ordinary backlog from reversible imported backlog.

### Functional Meaning

During review-pending or rollback-available states:

- imported continuity may contribute to protected counts,
- but must not be represented as already eligible for ordinary irreversible compression.

This distinction should not live only in presentation copy. The underlying maintenance-status load path should expose separate values so both session settings and Memory Board can render the same truth consistently, for example:

- `ordinaryPendingRoundCount`
- `protectedImportPendingRoundCount`

## Provider/Model Deletion UX

### Problem

When users import a gateway or switch providers, dozens of stale models may remain in both global settings and per-session model lists, degrading selection usability.

### Required Behavior

Both global provider settings and current-session model settings must support:

- long-press on a deletable model row to enter multi-select mode,
- tap additional deletable models to select/unselect,
- batch delete selected models,
- one-tap delete of all selected models from the same provider/source,
- clear exit from selection mode.

### Guardrails

- Built-in protected models must not become deletable.
- Deleting a model currently used by a thread must fall back safely according to existing resolver rules.
- Deleting a provider's default model must clear that binding and resolve to the next valid chat-capable model or follow existing fallback rules.
- Session-level multi-delete must reflect the same underlying provider model removal semantics as global settings.

## Failure Handling Requirements

Pixory must never crash or hard-fail the chat thread because an imported external document is malformed.

For malformed or weakly structured input:

- native recognition failure must downgrade to external evaluation,
- local parse failure must downgrade to model-assisted recovery attempt,
- model-assisted recovery failure must downgrade to partial import or block-only import,
- review failure must preserve chat continuity visibility but keep long-term memory effects gated or reversible according to policy,
- all user-visible failure states must use truthful wording.

No path may claim:

- `已接回`

if nothing renderable or reviewable was actually attached.

If the result is only a protected block import with no recovered transcript, the status copy must say so explicitly.

## Testing Strategy

### Parser And Recovery Tests

Add or extend tests to cover:

- precise Pixory-native recognition with required markers,
- malformed native files downgrading safely to external mode,
- external `txt` with semantic sections but no strict role labels,
- external `md` with understandable context sections and loose transcript formatting,
- model-assisted recovery merging with local parsing,
- invalid model JSON recovery being rejected safely,
- residue preservation without duplicate message injection.

### Review And Fan-Out Tests

Add or extend tests to cover:

- review input includes final rendered messages and blocks,
- accepted review results fan out into profile/memory/summary targets,
- review-passed imports do not collapse into summary-only artifacts,
- reversible import effects are recorded for each accepted target,
- rollback restores/removes those target-specific effects correctly.

### UI Policy Tests

Add or extend tests to cover:

- session settings shows `导入外部记忆` and `导入角色卡`,
- top compact continuity notice replaces old context-trim copy,
- compact notice includes remaining rounds and detail affordance,
- notice disappears after stabilization,
- partial-import status copy is truthful,
- protected pending-round UI copy distinguishes import observation backlog.

### Role-Card Tests

Add or extend tests to cover:

- session settings can launch role-card import,
- strict dedupe reuses existing imported role cards,
- duplicate imports do not create duplicate library rows.

### Model-Deletion Tests

Add or extend tests to cover:

- long-press multi-select in provider settings,
- long-press multi-select in session model settings,
- batch delete,
- same-provider delete shortcut,
- protected models remain non-deletable,
- current-thread invalidation falls back safely after delete.

## Acceptance Criteria

This supplement is complete only when all of the following are true:

- A loose but semantically clear external `txt`/`md` continuity file can recover renderable chat messages through automatic model-assisted structure recovery when local parsing is insufficient.
- Pixory-native continuity Markdown still imports deterministically without calling the model for structural understanding.
- The review pass consumes the final rendered import payload and fans accepted results into reversible summary/profile/memory targets.
- The chat page shows a compact rollback notice instead of the old context-trim notice and removes it automatically after the rollback window closes.
- Session settings exposes `导入外部记忆` and `导入角色卡`.
- Role-card import uses strict de-duplication and avoids duplicate library entries for exact matches.
- Memory-maintenance status distinguishes ordinary pending rounds from import-protected backlog.
- Global and per-session model lists support long-press multi-select deletion and same-provider cleanup without harming protected models or resolver safety.
- Malformed external files degrade safely without crashes or false-success messaging.

## Implementation Order Recommendation

The next implementation plan should proceed in this order:

1. Write failing parser/recovery/review-fan-out tests.
2. Add model-assisted structure recovery and safe merge logic.
3. Tighten review fan-out into dedicated reversible profile/memory/summary acceptance handling.
4. Polish session settings import entries and role-card import reuse path.
5. Replace the large rollback panel with the compact notice and protected pending-count UI.
6. Add multi-select deletion UX to global and session model lists.
7. Run focused review against real code paths to confirm there is no fake success or hidden irreversible side effect.
