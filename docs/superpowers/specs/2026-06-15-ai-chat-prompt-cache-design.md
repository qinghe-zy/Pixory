# AI Chat Prompt Cache Design

Date: 2026-06-15

## Goal

Improve Pixory AI chat cost efficiency and long-chat stability without introducing a server in this phase.

The design focuses on helping model providers reuse stable prompt prefixes and keeping long-running companion chat context predictable. It does not cache private companion replies as final answers.

This is a layered prompt-cache strategy: provider prompt caching, prompt layering, memory snapshot freezing, and cache observation. It is not an answer-cache project.

The expected benefit depends on stable prefixes being long enough to meet provider thresholds. If `stable_app_policy`, `stable_role`, `stable_material_rules`, `stable_tool_definitions`, and `memory_snapshot` together do not reach the provider's minimum cacheable token count, provider prompt caching may not trigger even when the prefix is perfectly stable.

## Current Mode

Pixory currently runs AI chat from the mobile app:

- Threads, messages, branches, memories, materials, citations, and provider settings are stored locally in SQLite.
- Provider API keys are stored on device with SecureStore.
- The app directly calls configured providers through local provider adapters.
- Prompt construction combines role instructions, memory, materials, history, and the current user request.

This design keeps that mode. Server-side AI gateway, Redis, vector database, hosted semantic cache, and self-hosted KV cache are out of scope for this phase.

## Success Criteria

- Stable prompt content is consistently placed before dynamic content.
- Memory used in the reusable prefix changes by explicit epoch rules, not every turn.
- Provider adapters can request provider-side prompt caching where supported.
- Each assistant generation records enough cache metadata to explain cache behavior.
- Future server work can reuse the same prompt block, hash, epoch, and observation concepts.
- Private companion replies, role-play replies, and Personal space replies are not semantically cached as final answers.

## Non-Goals

- No server or AI gateway implementation in this phase.
- No Redis, Qdrant, Milvus, vLLM, SGLang, or cross-device cache.
- No semantic cache for complete private chat answers.
- No remote explicit Gemini context cache lifecycle in this phase.
- No large prompt compiler rewrite before the cache observations prove the direction.

## Reality Constraints

Provider prompt caching has real constraints that must be visible in product and engineering expectations.

### Minimum Token Thresholds

Provider prompt caching only helps when the stable prefix is long enough. If the stable prefix is below a provider threshold, reordering prompt sections may improve cleanliness but will not create provider cache hits.

Expected practical thresholds:

- OpenAI prompt caching generally starts around 1024 prompt tokens.
- Anthropic prompt caching commonly starts around 1024 tokens, while some small models require a higher threshold such as 2048 tokens.
- Gemini implicit caching also requires sufficiently large repeated context.

Pixory should record `stablePrefixEstimatedTokens` so misses can be explained when the stable prefix is too short.

### Short TTL

Provider prompt caches are short-lived. The design is most useful for tight continuous chat sessions.

Expected behavior:

- A user who sends several messages within a few minutes is likely to benefit.
- A user who pauses for longer than the provider TTL may see no prefix cache hit even if the prompt prefix is unchanged.
- Cache misses caused by long turn intervals are expected, not necessarily bugs.

Pixory should record `previousRequestAt`, `turnIntervalMs`, and a best-effort `ttlLikelyExpired` flag where possible.

### Cost Asymmetry

Some providers charge differently for cache writes and cache reads. Anthropic-style caching can make short conversations more expensive if cache write cost is paid but the cache is not reused.

Pixory should only enable explicit cache-control on stable blocks when:

- The stable prefix is above the provider threshold.
- The thread is likely to continue, or the provider write/read economics are favorable.
- The cache policy is supported by the chosen provider adapter.

When usage data is available, Pixory should record separate cache creation and cache read tokens.

## Prompt Layering

Prompt construction should use stable-to-dynamic layering.

Recommended logical layers:

```txt
stable_app_policy
stable_role
stable_material_rules
stable_tool_definitions
memory_snapshot
history_window
dynamic_memory
retrieval_context
current_user_message
```

Provider request shape:

```txt
system:
  stable_app_policy
  stable_role
  stable_material_rules
  stable_tool_definitions
  memory_snapshot

history:
  recent completed user/assistant messages

user:
  dynamic_memory
  retrieval_context
  current_user_message
```

Rules:

- `stable_app_policy` must be deterministic and versioned.
- `stable_app_policy`, `stable_role`, `stable_material_rules`, and `stable_tool_definitions` must not include per-request variables.
- `stable_role` should include role-card prompt and session role settings.
- `stable_material_rules` should include fixed material/citation rules, not retrieved snippets.
- `stable_tool_definitions` should include stable function/tool schemas when Pixory exposes tools to a provider. Tool definitions are normally more stable than memory snapshots and should not be placed in dynamic request sections.
- `memory_snapshot` should be frozen by epoch.
- `history_window` should stay outside the provider-cache target for this phase.
- `dynamic_memory` and `retrieval_context` must stay near the end and must not pollute stable prefix hashes.

Provider prefix caching depends on byte-for-byte prefix stability. Any timestamp, current date, random ID, request ID, A/B bucket, locale-formatted value, or unstable serialization inside a `stable_*` layer can invalidate the whole reusable prefix.

`memory_snapshot` intentionally sits at the end of the stable system prefix. When it changes, the prefix through the snapshot changes too. Snapshot refresh frequency therefore directly controls cache lifetime.

`chatMode` is a stable cache dimension with initial values:

- `companion`: normal companion chat.
- `roleplay`: role-card-led companion or role-play chat.
- `knowledge`: IP-bound or knowledge-base-bound material chat.
- `personal`: Personal space chat.

If a thread switches chat mode, the stable prefix is expected to miss. This should be treated as a normal cache-boundary change, not a bug.

## Memory Snapshot Epoch

Memory used in the reusable prefix should be represented as a frozen snapshot.

Snapshot fields:

```txt
memoryEpoch
memorySnapshotText
memorySnapshotHash
memorySnapshotUpdatedAt
memorySnapshotEstimatedTokens
```

The epoch must be frozen at request-build time. Streaming, deferred maintenance, and UI updates must not mutate the snapshot for the in-flight request.

If a refresh trigger fires while a request is streaming, the current request must finish with the old epoch. The refreshed snapshot can only be used by the next request.

Snapshot refresh triggers:

- First deep-memory request for a thread.
- After a configured turn count, initially 5 completed assistant replies.
- Leaving chat or app background when there is pending memory work.
- User edits memory/profile content in the memory board.
- User marks memory inaccurate or deletes memory.
- Session role card, boundary mode, or thread profile changes.
- Turn interval is likely beyond provider cache TTL and there is pending memory work.

Non-triggers:

- Normal per-turn dynamic memory retrieval.
- RAG retrieval changes.
- Streaming token updates.
- Assistant title finalization.

Refresh rules:

- Recompute the candidate snapshot and normalized hash before bumping epoch.
- Bump `memoryEpoch` only when the normalized hash changes.
- Coalesce repeated refresh triggers. For example, several memory-board edits in quick succession should produce one snapshot refresh, not one epoch bump per edit.
- If the trigger fires because the provider TTL is likely expired but the snapshot hash is unchanged, keep the existing epoch.

Hash rules:

- Normalize text before hashing.
- Use Unicode NFKC.
- Normalize newlines.
- Trim trailing whitespace.
- Use deterministic JSON key ordering for structured snapshot parts.
- Do not include timestamps, random IDs, request IDs, or locale-dependent formatting in the snapshot hash.

## Stable Prefix Purity

The stable prefix must be linted for accidental volatility.

Purity checks should flag:

- ISO timestamps or locale-formatted dates in stable layers.
- Random IDs, request IDs, UUIDs, or generated temp names.
- Unstable object serialization.
- Dynamic retrieval snippets.
- Current user message text.
- Provider response text.
- Branch route labels that are not part of the frozen request context.

Initial implementation can be a policy test and helper function. The goal is to detect changes that would silently destroy provider cache hits.

## Provider Cache Policies

Provider adapters should accept optional cache policy metadata without forcing every provider to implement it.

### OpenAI-Compatible

Use automatic prompt caching when available and pass a stable `promptCacheKey` only when the provider supports it.

Recommended key shape:

```txt
pixory:{providerId}:{modelId}:{chatMode}:{stablePrefixHash}:{memoryEpoch}
```

`promptCacheKey` is a routing hint, not the cache itself. It must avoid high-cardinality per-turn fields.

Actual cache reuse still depends on provider support, minimum token thresholds, and byte-for-byte stable prefix matching. If a provider does not support `promptCacheKey`, omit it silently and do not fail the chat request.

`stablePrefixHash` already includes the memory snapshot text. Including both `stablePrefixHash` and `memoryEpoch` in the key is intentionally redundant: the hash drives prefix identity, while the epoch makes observations and future server routing easier to reason about.

Default custom OpenAI-compatible providers should not receive non-standard fields unless the user or provider capability says they support them.

### Anthropic

Use `cache_control: { type: 'ephemeral' }` only on cacheable stable system blocks when the enablement heuristic passes.

Recommended breakpoints:

- One breakpoint after `stable_tool_definitions`, or after `stable_material_rules` when no stable tools are present.
- One breakpoint after `memory_snapshot`.

This lets the first stable layers remain useful even when the memory snapshot changes.

Constraints:

- Anthropic supports a limited number of cache breakpoints, so Pixory should target at most the two stable breakpoints above in this phase.
- Cache-control should not be attached when the stable text is below the provider/model threshold.
- Default ephemeral TTL is short. Longer TTL variants should be treated as explicit provider-policy work, not assumed.
- The second breakpoint after `memory_snapshot` should only be enabled when recent thread behavior suggests reuse within TTL. If average turn interval is likely beyond TTL, keep only the core stable breakpoint to avoid paying repeated cache-write costs for snapshots that will not be read.

Record cache write and cache read tokens separately.

### Gemini

Use implicit-cache-friendly ordering in this phase:

- Stable content first in `systemInstruction`.
- Dynamic memory, retrieval, and current user request later in the request.

Do not create explicit remote context caches in this phase. Explicit Gemini cache can be revisited if future usage patterns show long, repeated, high-token stable contexts and the lifecycle cost is justified.

## Cache Kill Switches

Provider cache behavior must be controllable without changing prompt correctness.

Initial switches:

- A local global switch to disable provider cache metadata for all providers.
- A per-provider switch to disable `promptCacheKey`, `cache_control`, or future explicit cache behavior.
- A safe fallback path that sends a normal provider request when cache metadata is disabled or unsupported.

The switches should not disable prompt layering, memory snapshot freezing, or observation hashes. They only disable provider-specific cache hints or cache-control fields.

## Cache Observation

Each completed assistant generation should record a normalized cache observation.

Suggested structure:

```json
{
  "provider": "openai",
  "modelId": "gpt-example",
  "requestedAt": "2026-06-15T00:01:30.000Z",
  "promptVersion": 1,
  "chatMode": "companion",
  "stableCoreHash": "sha256...",
  "stablePrefixHash": "sha256...",
  "stablePrefixEstimatedTokens": 1800,
  "memoryEpoch": "thread:aithread_x:7",
  "memorySnapshotHash": "sha256...",
  "retrievalHash": "sha256...",
  "historyMessageCount": 18,
  "contextTrimmed": false,
  "previousRequestAt": "2026-06-15T00:00:00.000Z",
  "turnIntervalMs": 90000,
  "ttlLikelyExpired": false,
  "providerCache": {
    "requested": true,
    "observed": true,
    "strategy": "openai_prompt_cache_key",
    "totalPromptTokens": 5000,
    "promptTokens": 5000,
    "completionTokens": 800,
    "cachedInputTokens": 1200,
    "cachedTokenRatio": 0.24,
    "cacheCreationInputTokens": 0,
    "cacheReadInputTokens": 1200,
    "estimatedCostSaved": 0.012,
    "estimatedCostDelta": -0.01,
    "missReason": null
  }
}
```

Provider usage mapping:

| Provider family | Native fields | Normalized fields |
| --- | --- | --- |
| OpenAI-compatible | `usage.prompt_tokens`, `usage.completion_tokens`, `usage.prompt_tokens_details.cached_tokens` | `totalPromptTokens = prompt_tokens`, `promptTokens = prompt_tokens`, `completionTokens`, `cachedInputTokens`, `cacheReadInputTokens` |
| Anthropic | `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` | `totalPromptTokens = input_tokens + cache_creation_input_tokens + cache_read_input_tokens`, `promptTokens = input_tokens`, `completionTokens`, `cacheCreationInputTokens`, `cacheReadInputTokens`, `cachedInputTokens` |
| Gemini | `promptTokenCount`, `candidatesTokenCount`, `cachedContentTokenCount` or equivalent usage metadata | `totalPromptTokens = promptTokenCount`, `promptTokens = promptTokenCount`, `completionTokens`, `cachedInputTokens` |

If the provider returns no usage data, record `observed: false` and keep hashes and timing fields.

Only hashes and numeric metrics should be recorded for cache observation. Do not store full stable prefix text in analytics-like observation fields.

`cachedTokenRatio` should be calculated as `cachedInputTokens / totalPromptTokens` when both values are available. This avoids invalid ratios for Anthropic, where `input_tokens` excludes cache creation and cache read tokens.

`estimatedCostSaved` means the gross estimated savings compared with sending the whole prompt without provider caching. `estimatedCostDelta` means the net estimated change after cache-write premiums or other cache-specific charges. Negative `estimatedCostDelta` means the cached request is estimated to be cheaper; positive means it is estimated to be more expensive. Both fields are best-effort estimates and must be nullable because provider pricing changes.

`stableCoreHash` covers the stable prefix before `memory_snapshot`: `stable_app_policy`, `stable_role`, `stable_material_rules`, and `stable_tool_definitions`. `stablePrefixHash` covers the whole cacheable stable prefix including `memory_snapshot`. This lets observations distinguish core-prefix reuse from snapshot-level misses.

`stablePrefixEstimatedTokens` is a local heuristic estimate. It may come from a local tokenizer or conservative character-based estimator. It is for miss explanation and cache-policy gating only, not for billing.

Multimodal image/video inputs are out of scope for this prompt-cache phase. If a provider request includes image parts, the text prefix should still remain stable, but multimodal cache behavior must be handled separately.

## Long Chat Stability

This design should reduce long-chat drift by making memory and context updates explicit.

Long chat behavior:

- Recent completed messages remain the short-term conversational window.
- Frozen memory snapshot carries stable long-term context.
- Dynamic memory retrieval supplies current-turn relevance without mutating the reusable prefix.
- Context trimming should record whether it trimmed by count, token budget, or both.
- Branch scopes must be part of snapshot and retrieval inputs when they affect visible context.
- Switching branch routes can change visible history, retrieval, and memory scope. Cache misses after branch switching are expected unless the stable prefix hashes remain identical.

The design should not force every old message into the prompt. Stable summaries and memory snapshots are preferred for long-running companion continuity.

## Future Server Compatibility

This phase should introduce concepts that can move to a server AI gateway later:

```txt
PromptBlock
PromptBlockHash
PromptVersion
MemoryEpoch
RetrievalHash
ProviderCachePolicy
CacheObservation
```

Keep the first implementation lightweight:

- Use local TypeScript types and local request metadata.
- Avoid designing a complete remote protocol before local observations exist.
- Keep provider-specific behavior behind adapter-level capability checks.
- Ensure future server work can receive either prompt blocks or thread/context identifiers and reproduce the same hashes.

Future server possibilities:

- Exact cache for deterministic sub-tasks.
- Semantic cache for FAQ and knowledge-base answers with strict scope.
- Provider routing and key custody.
- Centralized cache metrics and cost dashboards.
- Prefix-aware routing for self-hosted inference.

Server-side semantic cache must receive a separate privacy and isolation review before implementation. It must not inherit relaxed assumptions from local prompt caching because semantic answer reuse can introduce cross-user leakage, wrong-answer reuse, and Personal space boundary failures.

## Risks

- Stable prefix may be too short to meet provider thresholds.
- Real user turn intervals may exceed provider cache TTL.
- Explicit cache-control can cost more than it saves for short sessions.
- Hidden nondeterminism can silently break prefix matching.
- Prompt version changes invalidate provider cache reuse.
- Provider usage fields may be unavailable or inconsistent across OpenAI-compatible APIs.
- Over-structuring the prompt compiler too early could slow implementation.
- Server-side semantic caching can reintroduce privacy and false-hit risks that this local phase intentionally avoids.
- Cache metric ratios can be wrong if provider token fields are normalized without provider-specific total-token rules.

## Testing Strategy

Policy and unit tests should cover:

- Prompt layers are ordered stable-to-dynamic.
- Dynamic memory, RAG snippets, and current user messages do not appear in stable prefix blocks.
- Tool/function definitions appear in `stable_tool_definitions` when present and do not include per-request variables.
- Two runs with the same logical stable inputs produce the same `stableCoreHash` and `stablePrefixHash`.
- Memory snapshot hash is stable under whitespace, Unicode, and key-order normalization.
- Memory epoch does not bump when a refresh trigger produces the same normalized snapshot hash.
- Repeated memory refresh triggers are coalesced.
- Memory epoch is frozen for an in-flight request.
- OpenAI-compatible cache key excludes per-turn variables.
- Anthropic cache breakpoint count stays within the provider limit and this phase's two-breakpoint target.
- Anthropic cache-control is gated by threshold and policy heuristics.
- Provider usage is normalized into cache observation fields.
- Cache observations include provider, model, timestamp, cached-token ratio, and cost estimate fields when available.
- Provider cache kill switches disable cache hints while preserving normal chat requests.
- Stable prefix purity lint catches timestamps, request IDs, and retrieval snippets.

Manual verification should include:

- Several fast consecutive chat turns in the same thread.
- A pause longer than expected provider TTL, then another turn.
- A memory-board edit followed by a new turn.
- A role-card switch followed by a new turn.
- A knowledge-base or IP-bound thread with retrieval changes.

## Rollout Plan

1. Add prompt layer metadata and stable prefix hashing around the existing prompt builder.
2. Add frozen memory snapshot epoch behavior.
3. Add provider cache policy fields to provider adapters.
4. Add cache observation recording and provider usage normalization before enabling cost-affecting cache-control.
5. Add provider-specific cache behavior for OpenAI-compatible, Anthropic, and Gemini behind kill switches.
6. Add focused policy tests and a small manual verification checklist.
7. Review real observations before considering local exact cache, semantic cache, or server gateway work.
