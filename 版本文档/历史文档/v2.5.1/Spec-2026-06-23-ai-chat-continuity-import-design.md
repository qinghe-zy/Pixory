# Pixory AI Chat Continuity Import Spec

Date: 2026-06-23

## Status

Design approved for specification. Pending implementation plan.

This spec defines a continuity-import system for Pixory AI chat. It extends the current role continuity export, branch routing, memory maintenance, summary compression, and Memory Board foundations. It does not replace Pixory's current deep-memory system.

## Goal

Let users bring conversation continuity back into an existing Pixory thread after chatting on another platform, without losing the original Pixory history, while preserving branch clarity, memory trust, and rollback safety.

The user-facing outcome is:

- A user can export continuity from Pixory and later import it back with exact structural recovery.
- A user can also bring back a plain-text or Markdown continuity document generated on another platform.
- Imported continuity becomes a new branch inside the current long-running Pixory thread, not a destructive overwrite of the existing route.
- Imported content can continue chatting immediately.
- Memory, summary, and profile updates remain governed by Pixory's existing memory system instead of bypassing it.
- Import rollback is allowed only during a bounded observation window before imported continuity has been deeply absorbed into later memory extraction and compression.

Pixory AI must remain:

- Android-first.
- Branch-safe.
- Local-first for stored chat and memory data.
- Conservative about long-term memory writes.
- Trustworthy about what came from original Pixory state versus what came from external reconstructed text.

## Normative Language

- `must` and `required` mean acceptance-blocking requirements.
- `should` means the default implementation choice.
- `may` means optional follow-up work only after the required acceptance criteria pass.
- If a requirement conflicts with implementation convenience, preserve chat continuity, privacy isolation, memory correctness, local data consistency, and recoverability first.

## Core Product Decisions

These decisions are binding for the first implementation pass unless the user explicitly changes them later.

- Continuity import must use a single user-facing entry and auto-detect whether the file is a Pixory-native continuity package or an external continuity document.
- Imported continuity must attach to the current thread as a new branch, not a new thread and not a destructive append to the current visible mainline.
- After import succeeds, the UI must automatically switch to the imported branch and leave the composer empty so the user can continue naturally.
- Pixory-native continuity packages must support exact structural import without calling the memory system or any model to understand the file.
- V1 Pixory-native import must target one exact artifact: the UTF-8 Markdown continuity document exported by Pixory's continuity export flow, upgraded with explicit native markers and structural sections. The companion PNG role card remains supplemental continuity metadata in V1 and is not the native import source of truth.
- External continuity documents may be plain text or Markdown and may require both structural parsing and model-assisted memory review.
- Imported content that is rendered as chat messages must still be reviewed by Pixory's existing memory system before it can influence formal long-term memory, summary, or profile state.
- External-import messages must not enter ordinary memory extraction, summary compression, or profile update paths until the import session enters an accepted review state or a dedicated import-aware maintenance mode explicitly marks its outputs as reversible.
- Rollback to the pre-import state is allowed only within the first 10 post-import effective conversation rounds.
- After the rollback window closes, the import is considered stabilized and must no longer be revertible because later memory extraction and summary compression may already depend on it.

## Current Foundation

Already available in the current codebase:

- Role continuity Markdown export exists through `src/ai/aiRoleCardContinuityExport.ts` and `src/ai/aiRoleCardContinuityExportService.ts`.
- Threads, messages, branch route metadata, branch selection, and persisted current branch route already exist.
- Chat rendering already supports branch-scoped visibility through `AiChatScreen` and `aiThreadRepository`.
- Thread summaries, summary segments, memory jobs, user profiles, memory scopes, reconciliation, and Memory Board flows already exist.
- Memory maintenance is already queued and branch-aware.
- Current continuity export already captures role instructions, thread summary, active memories, and visible messages.

This spec must reuse those foundations instead of inventing a parallel chat-memory stack.

## Problem

Pixory already supports exporting the current role continuity package, but it does not yet support bringing conversation continuity back in as a first-class continuation path.

Two distinct user needs must be satisfied:

1. Pixory-to-Pixory exact recovery.
   - A user exports continuity from Pixory.
   - Later, the user imports that package back into Pixory.
   - This path must recover structure exactly and deterministically.
   - In V1, the authoritative native package is the Pixory continuity Markdown document, not the PNG role card image.

2. External-platform continuity return.
   - A user chats on another platform.
   - That platform's AI generates a structured continuity text file from a prompt Pixory provides.
   - The user imports the file back into the original Pixory relationship thread.
   - This path cannot be trusted as authoritative structured Pixory state, so it must be reviewed through Pixory's memory system before long-term memory effects are accepted.

Without an explicit design:

- Import could overwrite or pollute the current route.
- Reconstructed content could bypass the memory system.
- External compressed summaries could be accepted too literally.
- Rollback could become inconsistent once memory extraction and summary compression already depend on the imported branch.

## Non-Goals

This version will not implement:

- Full backup restore of the whole app database.
- Multi-file batch continuity imports.
- Provider- or platform-specific import adapters for every external tool.
- Visual diff workbenches for imported-versus-existing memory.
- Automatic recovery from arbitrary third-party JSON exports.
- Permanent unlimited rollback after later chat has already incorporated imported continuity.
- Cross-device cloud sync.

## Terminology

### Native Continuity Package

A file exported by Pixory in a Pixory-defined continuity format. This package must be exact-import capable.

### External Continuity Document

A plain-text or Markdown document generated outside Pixory, typically by giving another platform AI a Pixory-provided prompt. This document is continuity-oriented but not authoritative structured Pixory state.

### Import Session

A single continuity-import transaction attached to one thread. It records:

- the source file and detected mode,
- the pre-import anchor route,
- the imported branch route,
- parsed messages,
- non-message continuity blocks,
- memory-review state,
- rollback eligibility state.

### Observation Window

The first 10 effective post-import conversation rounds. During this window the import remains revertible. After the window closes the import becomes stabilized.

### Stabilized Import

An import whose rollback window has closed because later chat, memory extraction, or summary compression may already depend on it.

## Design Summary

Continuity import must support two separate pipelines behind one auto-detected UI entry:

1. Native deterministic import.
   - Triggered when the imported file is recognized as a Pixory-native continuity package.
   - File parsing alone must be enough to recover the import branch structure and continuity payload accurately.
   - This path must not require model reasoning to understand the file.
   - In V1, this means a single UTF-8 Markdown file with explicit Pixory-native markers and stable structural sections.

2. External continuity re-entry.
   - Triggered when the imported file is an external continuity text or Markdown document.
   - Parse what can be safely reconstructed into messages.
   - Preserve remaining continuity blocks as text.
   - Feed the raw document, rendered messages, and compressed continuity blocks into Pixory's existing memory system for extraction and acceptance review.

Both pipelines converge on the same thread behavior:

- Create a new branch from the current visible route's last completed visible message.
- Inject imported continuity into that branch.
- Switch the thread's current route to the imported branch.
- Show a visible continuity milestone in chat.
- Allow rollback only during the 10-round observation window.

## User Experience

### Entry

The chat thread must expose one entry, such as `接回外部对话`, instead of separate user-facing flows for native and external import.

The entry must:

- allow selecting a `.txt` or `.md` file in V1,
- auto-detect native versus external mode,
- explain import errors clearly without silently polluting the current thread.

V1 file-mode rules are:

- `.md` may be either Pixory-native or external.
- `.txt` is always treated as external in V1.
- PNG role cards are not continuity-import inputs in V1, even if they were exported alongside the Markdown continuity file.

### After Successful Import

After import succeeds:

- the current thread remains the same thread,
- Pixory creates a new imported branch from the current visible route,
- chat automatically switches to that imported branch,
- imported messages render directly in the chat page when they can be reconstructed safely,
- the composer remains empty,
- the user can continue chatting normally on the imported branch.

### Continuity Milestone

At the import point, chat must render a visible milestone rather than pretending nothing special happened.

The milestone should include:

- imported from external continuity or Pixory native continuity,
- source platform when known,
- import time,
- message count recovered,
- whether compressed continuity blocks were present,
- current rollback state:
  - `还可回退：剩余 X 轮`
  - or `已稳定接入，不能回退`

During the observation window the milestone must expose `回到导入前状态`.

## Native Deterministic Import

### Requirement

Pixory-native continuity packages must support exact structural import without calling the memory system or any model to understand the file.

The goal is structural recovery, not semantic reinterpretation.

### Native Format Rules

The native format must declare:

- `formatVersion`
- `source = pixory-native`
- a stable Markdown section layout defined by Pixory
- enough structural fields to reconstruct continuity deterministically

V1 native import uses one exact artifact:

- a single UTF-8 Markdown continuity document produced by Pixory export,
- with the native markers above,
- and with machine-parseable structural sections for thread, branch, message, summary, and memory continuity payloads.

The package must contain enough information to recover:

- role identity and continuity metadata,
- thread-level continuity metadata relevant to import,
- import mode and file version,
- branch anchor identity,
- imported message list or explicitly defined compressed payload sections,
- summary-related continuity payload when exported,
- memory-related continuity payload when exported,
- any metadata needed to reconstruct the imported branch without inference.

### Native Import Behavior

Native import must:

- restore the imported continuity branch using exact file parsing,
- avoid model reasoning to understand the package,
- avoid memory-system gating for structural branch recovery,
- still allow the recovered messages to participate in later ordinary memory maintenance after import is complete.

In other words:

- import structure is deterministic,
- later memory maintenance is still ordinary Pixory behavior.

## External Continuity Document

### Purpose

An external continuity document is not authoritative Pixory state. It is a continuity source that must be parsed conservatively.

### File Form

V1 should support plain text and Markdown.

Pixory should provide a copyable prompt for external platforms that asks them to generate a continuity file in a structured template. The template should strongly encourage, but not absolutely require:

- metadata,
- relationship continuity summary,
- psychological background,
- biological or physical state notes when relevant,
- state continuity summary,
- long-term memory candidates,
- chat transcript,
- explicit compression notes when older content was summarized instead of fully retained.

### Parsing Strategy

External import must use `strict template first, tolerant parsing second`.

That means:

- if the file follows the Pixory continuity template, parse it directly,
- otherwise attempt tolerant section extraction,
- if some content still cannot be reconstructed safely as messages, preserve it as continuity text blocks instead of forcing fake message bubbles.

## Message Reconstruction

### Reconstructible Message Content

If content can be safely parsed into a standard chat transcript, it should be reconstructed into imported branch messages and rendered in chat.

This typically means clear role attribution such as:

- `user`
- `assistant`
- `system`

Optional timestamps may be preserved when available.

### Non-Reconstructible Continuity Content

Some continuity data should not be forced into message bubbles if safe reconstruction is not possible.

Examples:

- early-history compressed summaries,
- relationship continuity blocks,
- psychological background,
- biological or physical condition notes,
- state continuity summary,
- memory candidate lists generated by the external platform.

These must be preserved as continuity text blocks attached to the import session for later memory-system review.

## Memory System Integration

### Core Rule

Imported continuity must not be dumped directly into formal long-term memory.

### Imported Messages

Even when imported content has been parsed and rendered as messages, it must still be reviewed by Pixory's existing memory system before it can affect:

- formal memory records,
- summary segments,
- user profile updates.

Rendering and memory acceptance are parallel but separate concerns.

### Review Inputs

For external continuity import, Pixory's memory system must review all of the following together:

- the raw imported document,
- the parsed and rendered imported messages,
- the non-message continuity text blocks,
- any externally compressed continuity blocks.

### Review Gate During Observation

For external continuity import, there must be an explicit gate between `chat became renderable` and `ordinary long-term memory maintenance may absorb this continuity`.

During the observation window and before review acceptance:

- external imported messages may render and may be used as immediate conversational context on the imported branch,
- but they must not enter ordinary summary compression, profile update, or formal memory extraction as if they were already trusted Pixory-native history,
- any maintenance that does run on them must run in an import-aware mode that marks all resulting outputs as reversible and attributable to the import session,
- if import review is pending or failed, no irreversible formal memory, summary, or profile effects may be committed from those external imported messages.

After review acceptance:

- the imported branch may join ordinary memory maintenance behavior,
- subject to the same rollback-window reversibility rules defined later in this spec.

### Review Outcomes

Pixory's existing memory system must decide, conservatively:

- what should remain only as contextual chat history,
- what should become summary or summary segments,
- what should become profile updates,
- what should become formal memory candidates,
- what should be rejected as too uncertain, too lossy, or too externally speculative.

### Mixed Destination Strategy

The accepted continuity effects must use a mixed destination strategy:

- stable preferences, stable facts, durable relationship boundaries, and durable agreements should prefer formal memory,
- continuity-stage state, scene handoff, active emotional context, and compressed conversation phase transitions should prefer summary or summary segments,
- profile-like understanding should prefer user profile updates,
- rejected or uncertain content should remain attached only to the import session record.

### Native Import and Memory

Native deterministic import does not require the memory system to understand the file structure.

However, once the imported branch exists, later normal memory maintenance may still process the branch's messages just like ordinary thread history.

## Import Session Data Model

V1 should introduce an import-session record instead of scattering import state across unrelated tables.

Each import session should record at least:

- `id`
- `threadId`
- `space`
- `sourceKind` such as `pixory_native` or `external_document`
- `sourcePlatform`
- `formatVersion`
- `createdAt`
- `updatedAt`
- `status`
- `rollbackState`
- `rollbackRoundsRemaining`
- `preImportBranchRootMessageId`
- `preImportBranchVersionIndex`
- `importedBranchRootMessageId`
- `importedBranchVersionIndex`
- `rawDocumentText`
- `rawDocumentHash`
- `parsedMessageCount`
- `containsCompressedContinuity`
- `memoryReviewStatus`
- `memoryReviewError`
- `reviewGateState`
- `rolledBackAt`
- `stabilizedAt`
- `importAnchorMessageId`
- `importAnchorMessageRole`
- `importBranchRootKind`

V1 may represent non-message continuity blocks either:

- in a companion table keyed by `importSessionId`,
- or in structured JSON attached to the import session,

as long as the content remains locally auditable and rollback-safe.

## Branch Behavior

### Anchor Selection

Import must branch from the current visible route's last completed visible message, but V1 must not leave the branch-root mechanics implicit.

The import anchor is:

- the last completed visible message on the currently selected visible route at import time,
- or `null` if the thread has no completed visible messages yet.

This preserves the existing long-running relationship while making imported continuity an explicit alternate continuation path.

### Imported Branch Root

Because Pixory branch routing is version-root based, V1 must create an explicit imported branch root instead of relying on an ambiguous "fork anywhere" interpretation.

The imported branch root is:

- a dedicated synthetic system milestone message created by the import flow,
- inserted immediately after the import anchor,
- associated with the import session,
- used as the authoritative `branchRootMessageId` for the imported continuity route.

If the thread already has completed visible history:

- the synthetic import root is created after the last completed visible message on the selected route,
- and all reconstructed imported messages belong to the imported branch rooted at that synthetic message.

If the thread has no completed visible history yet:

- the synthetic import root becomes the first continuity message in the thread,
- and the imported branch starts from that root without needing a pre-existing conversational message root.

### Imported Branch

The imported branch becomes the active route immediately after successful import.

Subsequent user and assistant messages continue on that route normally.

### Why Not Mainline Append

Appending imported continuity directly into the current route would make rollback, auditability, and memory consistency materially harder.

Branch-based import is required in V1.

## Rollback Window And Stabilization

### Rollback Rule

Rollback to the pre-import state is allowed only during the first 10 effective post-import conversation rounds.

### Why The Window Exists

After enough later chat accumulates, imported continuity can affect:

- memory extraction,
- summary compression,
- user profile updates,
- downstream assistant responses,
- merged continuity understanding.

At that point the imported branch is no longer a lightweight reversible overlay.

### Observation Window State

During the first 10 effective post-import rounds:

- imported continuity is visible and usable,
- memory review can run,
- external imported continuity remains behind the review gate for irreversible long-term maintenance unless accepted,
- continuity-derived summary/profile/memory outputs must remain attributable to the import session,
- rollback remains available.

### Stabilized State

After the window closes:

- rollback becomes unavailable,
- the milestone must say the import has stabilized,
- the imported branch is treated as an ordinary long-running branch going forward.

## Rollback Semantics

Rollback must not be a superficial UI route switch.

If the user rolls back during the observation window, Pixory must restore the pre-import state by reverting import-session-derived reversible effects.

That includes:

- switching the current route back to the pre-import branch route,
- invalidating or removing the imported branch continuity payload from the active experience,
- clearing imported non-message continuity blocks from active use,
- reverting import-derived reversible memory candidates,
- reverting import-derived reversible summary or summary-segment outputs,
- reverting import-derived reversible profile updates.

Rollback in V1 must preserve auditability:

- the import session record must remain stored locally,
- the raw imported document must remain stored locally,
- parsed continuity blocks must remain stored locally,
- imported messages and the synthetic import root must remain recoverable as rolled-back historical import payload, not physically destroyed by default,
- rolled-back payload must be hidden from the active route and excluded from active maintenance and prompt use.

In other words, rollback in V1 is a reversible deactivation plus route restoration, not silent physical deletion of the imported payload.

Rollback must not modify:

- pre-existing thread history,
- pre-existing formal memories,
- pre-existing summary segments,
- pre-existing profiles,
- unrelated routes or threads.

## Effective Conversation Rounds

The rollback window should count effective post-import user-assistant rounds rather than raw message rows.

System milestones, internal import records, and other non-conversational rows must not consume the rollback budget.

If the codebase already has a stricter operational definition of round-counting in memory maintenance, V1 should reuse it so rollback and memory thresholds align.

## Import Failure Handling

### Parse Failure

If the file cannot be parsed well enough to create a safe import session:

- do not partially pollute the current thread,
- keep the current route unchanged,
- show a clear error,
- explain whether the file looked native or external,
- surface whether the user can retry as a looser external continuity import.

### Partial External Reconstruction

If only part of an external document can be safely reconstructed into messages:

- allow a partial-success import,
- record that the import was partial,
- render only the safely reconstructed messages,
- preserve the remainder as continuity text blocks,
- still send the full raw document plus parsed output to the memory system.

### Memory Review Failure

If memory review fails:

- imported chat continuity must still remain usable,
- the branch must remain available for continued chat,
- import session status must show memory review failed or pending retry,
- formal long-term memory effects must not be accepted silently.

## Security And Trust Boundaries

- External continuity documents must not be treated as authoritative Pixory internal state.
- External compressed memory-like content must not be injected directly into formal memory.
- Reconstructed imported messages must not bypass memory review just because they render successfully.
- Native Pixory packages are authoritative only for structural recovery, not for skipping future normal memory maintenance after the branch exists.
- Personal-space isolation rules must remain unchanged.

## Suggested Native File Evolution

Pixory's current continuity export should evolve so that native import can recognize a clearly defined native mode.

V1 should prefer an explicit native marker, such as:

- `formatVersion`
- `source = pixory-native`
- stable structural sections for branch and continuity recovery

V1 now fixes the exact native container type:

- the native continuity artifact is one UTF-8 Markdown document,
- exported by Pixory continuity export,
- parsed by Pixory native continuity import,
- with backward compatibility handled at the Markdown-structure version level via `formatVersion`.

The implementation plan must still choose the exact section schema, but it must remain within this single native Markdown artifact model.

## Suggested External Prompt Contract

Pixory should generate a copyable external prompt that asks another platform AI to produce a continuity file with:

- role and relationship continuity,
- current psychological background,
- relevant physical or biological state notes,
- state continuity summary,
- transcript when possible,
- explicit disclosure when early history was compressed,
- clear role labels for reconstructible messages.

If transcript length is too large:

- preserve recent transcript in fuller detail,
- compress older sections explicitly,
- do not pretend compressed content is literal transcript.

## Implementation Phases

### Phase 1: Native Format And Import Session Foundation

- Define import-session persistence.
- Define native continuity format marker and exact parser.
- Add single import entry with mode auto-detection.
- Support deterministic native import into a new branch.

### Phase 2: External Document Parsing

- Add structured external continuity template.
- Add tolerant section parser.
- Reconstruct safe transcript messages.
- Preserve non-message continuity blocks.

### Phase 3: Memory Review Integration

- Send raw document, parsed messages, and continuity blocks into the existing memory system review path.
- Mark import-derived reversible outputs.
- Surface memory review state.

### Phase 4: Rollback Window

- Track effective post-import rounds.
- Support rollback during the 10-round observation window.
- Revert import-derived reversible memory/summary/profile effects.
- Lock rollback after stabilization.

## Acceptance Criteria

### Native Import

- A Pixory-native continuity export can be re-imported through the single import entry.
- Mode detection identifies it as native.
- The authoritative native input is the Pixory continuity Markdown file, not the PNG role card.
- Structural recovery succeeds without using a model to understand the file.
- The imported branch renders correctly and becomes the active route.

### External Import

- A structured external continuity text or Markdown file can be imported through the same entry.
- Safe transcript sections render as messages on the imported branch.
- Non-message continuity blocks are preserved and attached to the import session.
- Raw document plus parsed output is sent to the memory review path.

### Branch Safety

- Pre-import thread history remains untouched.
- Imported continuity becomes a new branch rooted at a synthetic import milestone placed after the current visible route's last completed visible message, or at thread start when no completed visible message exists.
- The thread auto-switches to the imported branch.

### Rollback

- During the first 10 effective post-import rounds, the user can roll back to the pre-import state.
- Rollback restores the pre-import route and removes import-derived reversible active effects.
- Rollback preserves the import payload locally as rolled-back audit data instead of physically deleting it by default.
- After the observation window closes, rollback is no longer allowed.

### Memory Trust

- External compressed continuity content is not directly inserted into formal memory.
- Parsed imported messages do not bypass memory review.
- External imported messages do not enter irreversible ordinary memory maintenance before review acceptance.
- Accepted continuity effects land in summary, profile, or memory through Pixory's existing memory system rules.

### Failure Handling

- Parse failure leaves the current route unchanged.
- Partial external reconstruction is surfaced clearly.
- Memory review failure does not destroy chat continuity but does block silent formal memory acceptance.

## Out-Of-Scope Follow-Ups

These may be designed later but are not required in V1:

- multi-platform direct structured import adapters,
- visual memory-diff workbench,
- multiple import-session merge tools,
- imported continuity quality scoring UI,
- batch import queues,
- arbitrary third-party JSON package support.
