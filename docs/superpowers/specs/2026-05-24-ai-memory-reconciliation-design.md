# Pixory AI Memory Reconciliation Spec

Date: 2026-05-24

## Status

Design approved for specification. Pending implementation plan.

This spec extends Pixory's existing mature memory foundation with a memory reconciliation layer. It does not replace the current Memory Board, deep-memory switch, FTS retrieval, user profile, summary segments, or unified maintenance queue.

## Goal

Upgrade Pixory memory from "append-only capture" to "safe reconciliation" so long-term chat memory can correct, supersede, and de-duplicate itself over time.

The user-facing outcome is simple:

- When the user changes a preference, the old preference stops polluting future replies.
- When the user corrects AI, the correction can replace the wrong memory.
- When duplicate memories are captured, the memory database stays compact.
- When memory changes happen, the user can see and undo/edit them close to the triggering chat message.

Pixory AI must remain:

- Daily-chat friendly.
- Deep-memory opt-in.
- Local-first for stored memory.
- Conservative about automatic deletion.
- Transparent enough for users to trust memory behavior.

## Current Foundation

Already available in the current codebase:

- `ai_memories` stores long-term memories with `scope`, `type`, `content`, `normalizedContent`, `confidence`, `importance`, and `status`.
- Memory scopes include `global`, `thread`, `role`, `ip`, and `knowledge_base`.
- IP-aware memory exists through `scope = 'ip'`, `scopeId`, `ipId`, `groupId`, `imageAssetId`, and `assetSnapshotJson`.
- `ai_memory_fts` provides local FTS candidate retrieval for active memories.
- Deep memory is off by default.
- `AiMemoryBoardScreen` exposes memories, user profile, summary segments, maintenance state, edit, delete, and manual add.
- `AiMemoryCaptureNotice` exists and supports manage, undo, edit, and inaccurate handling.
- `aiMemoryMaintenanceQueue` is the unified per-thread background maintenance entry.
- Remote maintenance model failure can fall back to local整理 and is visible in status.

## Problem

Append-only memory is not enough for long-running companion chat.

Example:

1. The user says: "记住，我喜欢红色。"
2. Later the user says: "我最近更喜欢蓝色，以后默认蓝色。"

If Pixory simply adds both memories, future retrieval may inject both "喜欢红色" and "更喜欢蓝色". The assistant may respond inconsistently because the memory store has no explicit concept of superseding, correction, or staleness.

This becomes worse over time:

- Preferences drift.
- Recent status changes.
- User corrections contradict old extracted memories.
- Similar memories accumulate with small wording differences.
- Memory Board becomes harder to review.

## Design Summary

Add a **Memory Reconciliation** stage to the existing memory maintenance pipeline.

Instead of asking the maintenance model to only add new memories, Pixory will provide:

- the current triggering conversation fragment,
- candidate new memory facts,
- a small set of strongly related existing active memories,
- strict output rules.

The maintenance model must return structured operations:

- `add`
- `update`
- `stale`
- `keep`

Pixory then validates those operations locally before writing anything.

The model never receives the full memory table and never gets authority to freely delete memory.

## Out Of Scope

This version will not implement:

- Full memory event sourcing.
- Full branch-aware memory.
- Physical deletion by model instruction.
- Whole-database memory cleanup.
- Automatic modification of user profile.
- Automatic deletion of manual memories.
- Heavy chat-page memory logs.
- Separate IP memory dashboard.
- Cloud memory service.

## Memory Operation Semantics

### `add`

Create a new active memory when the new information is stable, useful, and not already represented by a candidate old memory.

Allowed when:

- The user clearly asks Pixory to remember something.
- The same preference/fact appears repeatedly.
- The model has high confidence that the information is useful in future chats.
- Local fallback extraction finds a strong explicit记忆 phrase.

### `update`

Update one existing candidate memory when the new statement changes, clarifies, or improves it.

Examples:

- "用户喜欢红色" becomes "用户过去偏好红色，近期更偏好蓝色。"
- "用户希望回答简短" becomes "用户默认偏好简洁回答，但要求详细时应展开。"

Allowed only when:

- `targetMemoryId` belongs to the candidate old-memory set provided to the model.
- The target memory is `status = active`.
- The target memory is not `sourceKind = manual`, unless the user explicitly says to modify a manually added memory.
- The operation confidence is high enough.

### `stale`

Mark an existing candidate memory as stale when the user explicitly corrects it or the new memory supersedes it.

Examples:

- Old: "用户喜欢红色。"
- New: "以后默认蓝色，不要再按红色来。"
- Result: old memory becomes `stale`, new memory is active.

`stale` is preferred over physical delete because it keeps the system auditable and reversible.

Allowed only when:

- `targetMemoryId` belongs to the candidate old-memory set.
- The operation confidence is high enough.
- The memory is not manual.
- The memory type is safe to stale automatically.

### `keep`

Leave a candidate old memory unchanged.

Use when:

- The new message is unrelated.
- The old memory remains compatible.
- The new evidence is ambiguous.
- The model is uncertain.

## Data Model

Additive schema extension to `ai_memories`:

- `supersededByMemoryId TEXT`
- `mergeReason TEXT`
- `mergedAt TEXT`
- `lastReconciledAt TEXT`
- `reconcileSourceMessageId TEXT`

Semantics:

- `supersededByMemoryId` points from an old stale memory to the active memory that replaced it.
- `mergeReason` stores a short human-readable explanation.
- `mergedAt` records when an update/stale operation happened.
- `lastReconciledAt` records that a memory was reviewed by reconciliation, even if kept.
- `reconcileSourceMessageId` points to the user or assistant message that triggered the operation when available.

Do not add a full `ai_memory_events` table in V1. If audit history becomes important later, add it as a separate spec.

## Candidate Retrieval

The reconciliation stage must not scan all memories.

For each candidate new memory:

1. Build a query from:
   - new memory content,
   - normalized content,
   - type,
   - scope,
   - source message text.
2. Search active memories using existing FTS and fallback keyword logic.
3. Restrict by relevant scope:
   - `global`
   - current `thread`
   - current `role`
   - current `ip` if the thread is IP-bound
   - current `knowledge_base` if the thread is knowledge-base-bound
4. Prefer same `type`.
5. Prefer same scope or more specific scope.
6. Limit the model-facing candidate set to at most 8 memories per maintenance pass.

Ordinary normal chat does not bind IP memory unless the thread is IP-bound. If the user mentions an IP by name in normal chat, V1 should not guess and bind it automatically.

## Maintenance Queue Integration

`aiMemoryMaintenanceQueue` remains the only scheduling entry.

Current pass order should become:

1. Summary compression.
2. User profile initialization/update.
3. Long-term memory extraction.
4. Memory reconciliation.
5. Summary segment merge.

Remote model use:

- A single maintenance pass should still avoid multiple independent remote calls when practical.
- If extraction and reconciliation can share one model call safely, use one prompt that returns both candidates and operations.
- If implementation keeps extraction and reconciliation separate in V1, only run reconciliation when there are strong candidate memories or explicit correction signals.

Failure behavior:

- If remote reconciliation fails, do not modify existing active memories.
- Local fallback may add only high-confidence explicit memories.
- Local fallback must not mark old memories stale automatically.
- Failure/fallback state should continue to be visible in maintenance status.

## Reconciliation Prompt Contract

The remote maintenance model must output JSON only.

Shape:

```json
{
  "operations": [
    {
      "op": "update",
      "targetMemoryId": "aimem_1",
      "content": "用户近期更喜欢蓝色，但过去曾偏好红色。",
      "type": "preference",
      "confidence": 0.86,
      "importance": 3,
      "reason": "新偏好覆盖旧偏好"
    },
    {
      "op": "stale",
      "targetMemoryId": "aimem_2",
      "confidence": 0.82,
      "reason": "与用户最新纠正冲突"
    },
    {
      "op": "add",
      "content": "用户最近更喜欢蓝色系视觉。",
      "scope": "global",
      "type": "preference",
      "confidence": 0.81,
      "importance": 3,
      "reason": "新稳定偏好"
    },
    {
      "op": "keep",
      "targetMemoryId": "aimem_3",
      "confidence": 0.7,
      "reason": "与新信息不冲突"
    }
  ]
}
```

Prompt requirements:

- Do not infer facts not present in the conversation.
- Prefer `keep` when uncertain.
- Prefer `update` over `stale + add` when one old memory can be clarified cleanly.
- Use `stale` only when the user clearly corrected, replaced, or invalidated old information.
- Never output operations for memories not listed as candidates.
- Never modify manual memories unless the conversation explicitly asks to modify a manually added memory.
- Keep content concise and useful for future chat.
- Do not include API keys, system prompts, file paths, or private local identifiers in memory content.

## Local Validation Rules

Before applying model operations, Pixory must validate:

- `targetMemoryId` exists in the provided candidate set.
- Target memory is active.
- Target memory belongs to the current space.
- Target memory scope is allowed for the current thread.
- `content` is non-empty for `add` and `update`.
- `scope` and `type` are valid enum values.
- `confidence` is within `0..1`.
- `importance` is within the current accepted range.
- `manual` memories cannot be automatically staled.
- Low-confidence `stale` is rejected.
- Operations that would create duplicate active `normalizedContent` should update/keep instead of add.

Rejected operations should be ignored and counted in maintenance status for diagnostics. They should not block the entire maintenance pass.

## Manual Memory Policy

Manual memory has higher user authority than automatically extracted memory.

V1 policy:

- Manual memory can be shown as a conflict candidate to the model.
- Manual memory can receive `keep`.
- Manual memory cannot be automatically `stale`.
- Manual memory cannot be automatically overwritten.
- If a new user statement conflicts with manual memory, Pixory may create a capture notice:
  - "发现与手动记忆冲突，是否更新？"
- Actual manual-memory update requires user action in the inline notice or Memory Board.

## Chat Inline Feedback

Upgrade memory feedback from only global notice to message-level inline feedback.

Behavior:

- When memory changes are written, associate feedback with the source user message when possible.
- Render a small capsule near the triggering message or adjacent assistant reply:
  - `记忆已更新：偏好暗色系`
  - `已记住：默认简洁回答`
  - `已修正：不再使用旧偏好`
- The capsule is low-profile and does not change the main bubble layout.
- Tapping opens the existing lightweight controls:
  - edit,
  - undo,
  - inaccurate,
  - manage.
- If a memory update is queued but not written, do not show "已记住".
- If remote failed but local fallback wrote a memory, the copy may say:
  - `已用本地方式整理记忆`

Compatibility:

- Keep the current input-area notice as fallback for older capture records or if source-message association is missing.
- Do not add a heavy log panel in chat.

## Memory Board UX

Memory Board should make reconciliation understandable without becoming a database console.

Requirements:

- Active memories remain the default view.
- Add a low-key filter for stale memories.
- Stale memories show why they became stale when `mergeReason` exists.
- Superseded memories show the replacing memory when available.
- Manual memories remain visually distinct from automatic memories.
- Editing or restoring stale memory should be explicit user action.

Not required in V1:

- Timeline event history.
- Diff view.
- Bulk reconciliation UI.

## Prompt Injection Rules

Only memories that pass all rules may enter prompt:

- `status = active`
- no `supersededByMemoryId`
- relevant to current thread/query
- allowed by scope
- sorted by relevance, importance, recency, and scope specificity

Never inject:

- `stale`
- `deleted`
- superseded old memories
- manual-conflict suggestions that were not accepted by user

## Privacy And Safety

Remote reconciliation may send:

- the triggering conversation slice,
- candidate new memory text,
- selected old memory candidates,
- memory metadata required for operation selection.

Remote reconciliation must not send:

- API keys,
- SecureStore values,
- private local paths,
- full chat history,
- full memory table,
- raw database dumps.

All stored memory remains local SQLite data.

## Tests And Acceptance

### Automatic Tests

Add or update tests covering:

- Deep memory off:
  - reconciliation is not scheduled,
  - no old memories are read,
  - no operations are applied.
- Candidate retrieval:
  - uses FTS/keyword candidates,
  - limits candidate count,
  - includes IP-scope candidates only for IP-bound threads.
- Operation parsing:
  - accepts valid JSON operations,
  - rejects unknown ops,
  - rejects operations targeting unknown memory IDs,
  - rejects low-confidence stale.
- Apply operations:
  - `add` creates active memory.
  - `update` changes content and normalized content.
  - `stale` marks old memory stale and removes it from FTS.
  - `keep` updates `lastReconciledAt` only.
- Manual memory safety:
  - model cannot stale manual memory automatically.
  - conflict with manual memory surfaces user-facing notice instead.
- Prompt injection:
  - stale/superseded memories do not enter prompt.
  - updated active memory does enter prompt when relevant.
- Inline feedback:
  - successful update shows message-level capsule.
  - undo marks the memory deleted/stale and removes it from prompt.
  - fallback records still show in the old global notice location.

### Manual Android Acceptance

Use a real device or emulator when available.

Scenarios:

1. Turn deep memory off, chat with "记住我喜欢红色"; confirm no memory is written.
2. Turn deep memory on, say "记住我喜欢红色"; confirm inline memory capsule appears.
3. Later say "以后默认蓝色，不要再按红色"; confirm old red memory becomes stale or superseded.
4. Ask a related question; confirm prompt no longer injects the stale red memory.
5. Add a manual memory in Memory Board; then say conflicting information; confirm it is not automatically staled.
6. Open Memory Board; confirm stale memory is understandable and active memory remains concise.
7. Simulate remote maintenance failure; confirm local fallback does not stale old memories automatically.
8. Use a 200+ message conversation; confirm maintenance remains asynchronous and chat streaming is not blocked.

## Implementation Notes

Likely files:

- `src/ai/aiMemoryMaintenanceQueue.ts`
- `src/ai/aiMemoryCaptureService.ts`
- `src/ai/aiMemoryPrompts.ts`
- `src/ai/aiMemoryService.ts`
- `src/database/schema.ts`
- `src/database/db.ts`
- `src/database/repositories/aiThreadRepository.ts`
- `src/components/ai/AiMemoryCaptureNotice.tsx`
- `src/components/ai/AiMessageBubble.tsx`
- `src/screens/AiChatScreen.tsx`
- `src/screens/AiMemoryBoardScreen.tsx`
- policy tests under `tests/*.test.cjs`

Prefer small focused helpers:

- parse reconciliation JSON,
- validate operations,
- retrieve related memory candidates,
- apply operations transactionally,
- build inline feedback records.

## Open Decision

Manual memories should default to user-authority mode:

- remote model may detect conflict,
- UI may ask user to resolve,
- but automatic update/stale is blocked.

This spec assumes that policy unless the user explicitly changes it before implementation planning.
