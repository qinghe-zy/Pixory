# AI Cache Visualization And Session Model Settings Design

Date: 2026-06-15

## Goal

Add a clean, local-first visualization layer for AI token usage and provider prompt-cache hits.

The feature has two product surfaces:

- AI Workbench shows total AI usage and cache-hit overview for the current space.
- Session settings shows the current thread's model override and the current thread's token/cache usage.

This is a product-facing usage view, not a chat diagnostic console. It should help the user understand overall consumption and per-thread consumption without exposing prompt text, message text, prompt hashes, cache policy internals, or provider debugging details.

## Success Criteria

- AI Workbench can show total token usage, cached tokens, cache-hit ratio, request count, and provider/model distribution.
- Session settings can show current-thread token usage, cached tokens, cache-hit ratio, and recent-round token distribution.
- Session settings can edit the current thread's provider/model/base URL/API key override without changing global defaults.
- Usage aggregation respects normal space and Personal space isolation.
- Anthropic-style usage is aggregated with a normalized `totalPromptTokens` denominator so cache-hit ratios cannot be distorted.
- No prompt text, chat text, retrieved context, memory text, API key plaintext, or private diagnostic payload appears in the visualization UI.

## Non-Goals

- No server analytics dashboard.
- No semantic-cache dashboard.
- No final-answer cache management.
- No prompt text viewer.
- No chat diagnosis screen with TTL, breakpoint, purity warnings, stable-prefix hashes, or miss reasons.
- No provider pricing table in the first version.
- No global default model editor inside session settings.

## Product Surfaces

### AI Workbench Overview

AI Workbench should show a compact usage overview for the current space.

Required metrics:

- Total tokens.
- Input tokens.
- Output tokens.
- Cached input tokens.
- Cache-hit ratio.
- Observed request count.
- Provider/model distribution.

Recommended time scopes:

- Last 7 days.
- Last 30 days.
- All observed.

The first implementation may default to Last 30 days if adding a segmented control would make the initial change too broad, but the aggregation API should accept a time scope from the start.

The visual shape should be compact:

- A top metric row for `Total`, `Cached`, `Hit Rate`, and `Requests`.
- A stacked horizontal bar for cached input, non-cached input, and output tokens.
- A short provider/model list ordered by token volume.

The UI must use short labels only. Do not add explanatory paragraphs or diagnostic copy.

### Session Settings

Session settings should become the place where the user can inspect and adjust the current chat session without affecting global defaults.

It should have two sections.

#### Current Session Model

Fields:

- Provider.
- Model.
- Base URL, when the selected provider supports OpenAI-compatible or custom endpoint behavior.
- API key override, stored securely.
- Optional generation parameters if they already exist in the thread/session config model.
- Use global default.

Rules:

- Saving changes updates only the current thread/session config.
- Global provider defaults remain unchanged.
- `Use global default` clears the session override and returns the thread to normal provider-default resolution.
- API key plaintext must never be stored in SQLite.
- A session API key override must use SecureStore or the existing secure settings mechanism.
- If a provider type does not support base URL override, the field should be hidden or disabled rather than shown as a dead input.
- Existing in-flight generation should not silently switch model. Changes apply to the next generation.

Resolution order:

```txt
Current session override
> Global provider default
> App fallback default
```

Personal space session settings must not read or reuse normal-space-only session overrides. If the existing provider settings are global by design, the implementation must explicitly verify that adding per-session overrides does not leak Personal space metadata into normal space or vice versa.

#### Current Session Usage

Required metrics:

- Total tokens.
- Input tokens.
- Output tokens.
- Cached input tokens.
- Cache-hit ratio.
- Observed request count.
- Recent round token distribution.

Recent round rows should be visually simple:

- Model/provider short label.
- Timestamp or relative time.
- Total tokens.
- Compact stacked bar for cached input, non-cached input, and output.

Do not display miss reasons, TTL state, stable prefix length, hash values, prompt-version details, or raw provider usage JSON in this product surface.

## Data Source

The first version should aggregate local SQLite data already attached to AI assistant messages.

Primary source:

```txt
ai_messages.promptSnapshotJson.cacheObservation
```

Expected normalized fields come from the existing cache-observation and provider-usage work:

- Provider.
- Model ID.
- Prompt/input token count.
- Completion/output token count.
- Cached input token count.
- Cache creation input token count where supported.
- Cache read input token count where supported.
- Normalized `totalPromptTokens`.
- Timestamp or message creation time.
- Thread ID.
- Space.

The visualization should treat malformed, missing, or older `promptSnapshotJson` values as unobserved rows, not fatal errors.

## Aggregation Rules

### Token Totals

Use these normalized concepts:

```txt
inputTokens = totalPromptTokens
outputTokens = completionTokens
cachedInputTokens = cached input tokens reported by provider usage normalization
nonCachedInputTokens = max(totalPromptTokens - cachedInputTokens, 0)
totalTokens = totalPromptTokens + completionTokens
```

Anthropic-style usage must use:

```txt
totalPromptTokens = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
```

OpenAI-compatible usage can use provider-normalized total prompt tokens because OpenAI prompt tokens include cached prompt tokens.

Gemini usage can use provider-normalized total prompt tokens and provider-reported cached content tokens when available.

### Cache-Hit Ratio

Token cache-hit ratio:

```txt
cachedInputTokens / totalPromptTokens
```

Rules:

- If `totalPromptTokens` is zero, the ratio is zero.
- Clamp ratio to `[0, 1]` after aggregation to guard against provider anomalies or older malformed records.
- Display as a rounded percentage.

Request cache-hit ratio is optional in the first UI, but the aggregation layer may expose it:

```txt
requestsWithCachedInputTokens / observedRequestsWithUsage
```

### Scope

AI Workbench aggregation scope:

```txt
current space + selected time window
```

Session settings aggregation scope:

```txt
current space + current thread
```

Never aggregate Personal space and normal space together.

### Provider And Model Distribution

Group by:

```txt
provider + modelId
```

Sort by descending `totalTokens`.

Rows with missing provider/model should be grouped under a short fallback label such as `Unknown`, not dropped.

## Privacy And Security

The visualization must not display:

- Prompt text.
- Chat message text.
- Memory text.
- Retrieved material snippets.
- Prompt hashes.
- Stable prefix hashes.
- Raw provider usage JSON.
- API key plaintext.
- SecureStore key names if they reveal private context.

Allowed display data:

- Token counts.
- Percentages.
- Provider names.
- Model IDs.
- Time buckets.
- Per-turn aggregate token numbers.

Session API key override behavior:

- Entered key is written through the secure settings path.
- SQLite stores only an opaque reference or an override flag.
- Clearing the session override removes the secure override reference when possible.
- The UI should show only whether a session key override exists, not the key value.

## Visual Direction

The UI should feel like a quiet mobile product surface, not a developer dashboard.

Use existing Pixory design tokens for:

- Spacing.
- Radius.
- Colors.
- Typography.
- Touch targets.
- Rhythm.

Avoid:

- Large explanatory cards.
- Long text descriptions.
- Hash/log style rows.
- Neon/gradient visual treatment.
- Dense debug tables.

Preferred components:

- Compact metric cells.
- Thin stacked token bars.
- Short provider/model rows.
- Small segmented control only if the host screen already has a matching pattern.

Labels should be terse:

- `Total`
- `Input`
- `Output`
- `Cached`
- `Hit Rate`
- `Requests`
- `Models`

Chinese UI copy can use:

- `总量`
- `输入`
- `输出`
- `缓存`
- `命中率`
- `请求`
- `模型`

Do not add explanatory paragraphs under these metrics.

## Error And Empty States

Empty or no-observation state:

- Show zeroed metrics.
- Show a short empty label such as `暂无数据`.
- Do not suggest that caching is broken.

Malformed observation rows:

- Skip them.
- Count them only if an internal aggregation result needs an `unobservedCount`; do not show this count in the first product UI.

Provider usage missing:

- The row can count as a request only if the existing data model clearly identifies it as an observed generation request.
- Do not invent token counts.

Older threads:

- Older assistant messages without cache observations should not break the page.
- The UI should still render and show available data.

## Implementation Boundaries For Later Plan

Likely implementation units:

- A local analytics module that parses cache observations and produces normalized aggregate objects.
- Repository query helpers for recent assistant messages by space/time window and by thread.
- AI Workbench UI section for total usage.
- Session settings UI section for current session usage.
- Session settings model override section.
- Secure handling for session-level API key override if the existing settings model does not already support it.

The implementation should prefer adding small, focused modules over expanding chat service files with UI analytics responsibilities.

## Testing Requirements

Required aggregation tests:

- OpenAI-compatible cached tokens use normalized total prompt tokens.
- Anthropic cached-token ratio uses `input + cache_creation + cache_read` as denominator.
- Missing or malformed `promptSnapshotJson` is skipped without throwing.
- Ratio is clamped to `[0, 1]`.
- Current-thread aggregation excludes other threads.
- Current-space aggregation excludes other spaces.
- Provider/model grouping keeps unknown provider/model rows under fallback labels.

Required session settings tests:

- Saving a session model override does not change global defaults.
- Clearing a session override returns resolution to global default.
- Base URL override is only available for provider types that support it.
- Session API key override is not stored in plaintext SQLite fields.
- Model changes apply to the next request, not an already streaming request.

Required UI checks:

- AI Workbench renders with no observation data.
- Session settings renders with no observation data.
- Long model IDs do not overflow metric rows.
- Token bars do not shift layout when values are zero, tiny, or very large.
- Android viewport remains readable with real observed data.

## Rollout

Recommended rollout order:

1. Add aggregation/parser tests and the analytics module.
2. Add repository query helpers.
3. Add AI Workbench total usage section.
4. Add session settings current-thread usage section.
5. Add session model override editing.
6. Add SecureStore-backed session API key override only after confirming the existing provider settings path.
7. Run typecheck, tests, and Android UI smoke verification.

The usage visualization can ship before per-session API key override if secure override storage requires more plumbing. Session provider/model/base URL override should not ship if it can accidentally mutate global defaults.

## Open Decisions For Implementation

- Exact existing route/component names for AI Workbench and session settings must be confirmed before coding.
- Whether generation parameters beyond provider/model/base URL/API key are already part of the thread config must be confirmed before exposing them.
- Whether API key override should be supported in the first implementation depends on the current SecureStore abstraction and should not be rushed into SQLite.

