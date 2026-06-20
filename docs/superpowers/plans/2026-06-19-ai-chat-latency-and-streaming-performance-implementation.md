# AI Chat Latency And Streaming Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the reviewed AI chat latency and streaming performance spec in bounded phases so long Pixory companion chats stream smoothly, start faster, remain recoverable, and keep Personal space diagnostics content-safe.

**Architecture:** Add content-free generation metrics first, then split live streaming text from message-list state, then add first-token fast-path classification and prompt-pipeline bounds, then formalize internal prompt/cache performance profiles. Each phase has a gate; do not start the next phase until the gate is met or explicitly marked unverified with evidence.

**Tech Stack:** Expo React Native, TypeScript, Expo SQLite, existing Pixory AI chat services, existing provider adapters, Node policy tests, `pnpm typecheck`, `pnpm test`, Android manual validation where available.

---

## Source Spec

- `docs/superpowers/specs/2026-06-19-ai-chat-latency-and-streaming-performance-design.md`

Implementation must preserve the spec's non-goals:

- No server AI gateway.
- No semantic final-answer cache for private companion, role-play, or Personal space replies.
- No new user-facing performance settings in the first implementation pass.
- No FlashList migration before Phase 2 metrics prove list virtualization is still the bottleneck.
- No markdown parser rewrite unless final markdown rendering is measured as the remaining bottleneck after streaming fixes.
- No new runtime dependency unless existing Expo/React Native primitives cannot satisfy a measured requirement.

---

## File Map

### Tests

- Create: `tests/ai-chat-latency-metrics-policy.test.cjs`
- Create: `tests/ai-chat-streaming-runtime-policy.test.cjs`
- Create: `tests/ai-chat-first-token-pipeline-policy.test.cjs`
- Create: `tests/ai-chat-latency-final-acceptance-policy.test.cjs`
- Modify when cache invariants change: `tests/ai-prompt-cache-unit.test.cjs`
- Modify when prompt-cache source assertions change: `tests/ai-prompt-cache-policy.test.cjs`
- Modify when usage snapshot shape changes: `tests/ai-usage-analytics-unit.test.cjs`

### Metrics And Diagnostics

- Create: `src/ai/aiGenerationMetrics.ts`
- Modify: `src/ai/aiChatService.ts`
- Modify: `src/ai/aiGenerationManager.ts`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `src/ai/aiUsageAnalytics.ts`
- Modify when usage UI reads the new metrics shape: `src/components/ai/AiUsageSummary.tsx`

### Streaming Runtime

- Create: `src/ai/aiStreamingRuntime.ts`
- Create: `src/ai/aiStreamingMessageStore.ts`
- Create: `src/components/ai/AiStreamingMessageText.tsx`
- Modify: `src/ai/aiChatService.ts`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `src/components/ai/AiMessageBubble.tsx`
- Modify: `src/components/ai/AiMessageContent.tsx`

### First-Token Pipeline

- Create: `src/ai/aiChatFastPath.ts`
- Modify: `src/ai/aiChatService.ts`
- Modify: `src/ai/aiRetrievalService.ts`
- Modify: `src/ai/aiContextBudget.ts`
- Modify when stable/dynamic memory caps require service support: `src/ai/aiMemoryService.ts`
- Modify when deferred maintenance remains on the foreground path: `src/ai/aiMemoryMaintenanceService.ts`

### Prompt And Cache Modes

- Create: `src/ai/aiChatPerformanceMode.ts`
- Modify: `src/ai/promptBuilder.ts`
- Modify: `src/ai/aiPromptCache.ts`
- Modify: `src/ai/aiProviderUsage.ts`
- Modify: `src/ai/providers/base.ts`
- Modify when provider usage/cache observations need adapter fields: `src/ai/providers/openAiCompatibleProvider.ts`
- Modify when Anthropic cache block behavior needs preservation: `src/ai/providers/claudeProvider.ts`
- Modify when Gemini usage metadata needs preservation: `src/ai/providers/geminiProvider.ts`

### Documentation

- Modify: `docs/superpowers/specs/2026-06-19-ai-chat-latency-and-streaming-performance-design.md` only when implementation reveals a spec correction; every correction must be named in the implementation report.
- Create or update at implementation end: `docs/superpowers/plans/2026-06-19-ai-chat-latency-and-streaming-performance-implementation-report.md`

---

## Global Execution Rules

- [ ] Use this plan together with the source spec. If they conflict, stop and update the plan or spec before coding further.
- [ ] Keep changes scoped to one task at a time.
- [ ] Run the listed verification after each task.
- [ ] Do not mark a task complete if its verification was skipped; write `Unverified: <reason>` in the implementation report.
- [ ] Do not proceed past a phase gate until the gate checklist passes or the user explicitly accepts the unverified items.
- [ ] Preserve existing behavior for role cards, memory, branch routes, citations, regenerate/edit, stop, favorites, search, and final markdown rendering.
- [ ] Keep Personal space diagnostics content-free. Never expose raw prompt, memory, retrieval, material, user-message, or assistant text through metrics.
- [ ] Use `generationId` on all new streaming-runtime paths that can outlive a route change, stop, edit, or regeneration.
- [ ] Use the real UI send timestamp for `sendPressedAt`. Do not substitute generation start time except in tests that explicitly document the fallback.
- [ ] Keep per-frame streaming text updates out of `AiChatScreen` state. Use a small external subscription store so only the active streaming text component updates every display tick.
- [ ] Do not add user-facing low-latency settings; performance modes are internal execution profiles in this implementation.

---

## Phase 0: Baseline And Guardrail Coverage

### Task 0.1: Add Whole-Spec Policy Guardrails

**Files:**
- Create: `tests/ai-chat-latency-final-acceptance-policy.test.cjs`

- [ ] **Step 1: Create policy test skeleton**

Create `tests/ai-chat-latency-final-acceptance-policy.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('latency spec has closed decisions and phase gates for long-running implementation', () => {
  const spec = read('docs/superpowers/specs/2026-06-19-ai-chat-latency-and-streaming-performance-design.md');

  assert.match(spec, /Reviewed implementation spec, ready for detailed implementation planning/);
  assert.match(spec, /## Execution Guardrails/);
  assert.match(spec, /## Default Decisions/);
  assert.match(spec, /## Phase Gates/);
  assert.match(spec, /## Resolved Decisions/);
  assert.doesNotMatch(spec, /## Open Questions/);
  assert.doesNotMatch(spec, /TBD|TODO|where test infrastructure allows/);
});

test('implementation keeps forbidden scope out of the codebase', () => {
  const files = [
    'src/ai/aiChatService.ts',
    'src/ai/aiPromptCache.ts',
    'src/ai/promptBuilder.ts',
  ].map(read).join('\n');

  assert.doesNotMatch(files, /semanticAnswerCache|semanticReplyCache|answerCache/i);
  assert.doesNotMatch(files, /redis|qdrant|milvus|serverGateway/i);
});
```

- [ ] **Step 2: Run the policy test**

Run:

```powershell
node --test tests/ai-chat-latency-final-acceptance-policy.test.cjs
```

Expected: PASS after the spec review work already completed. If it fails, fix the spec before continuing.

- [ ] **Step 3: Run existing related policy tests**

Run:

```powershell
node --test tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-prompt-cache-policy.test.cjs tests/ai-prompt-cache-unit.test.cjs tests/ai-usage-analytics-unit.test.cjs
```

Expected: PASS. If any fail, stop and inspect whether the failure is pre-existing or caused by the new spec/test.

- [ ] **Step 4: Commit guardrail test**

Run:

```powershell
git add tests/ai-chat-latency-final-acceptance-policy.test.cjs
git commit -m "test: guard AI chat latency performance scope"
```

Expected: commit succeeds if the user wants incremental commits. If not committing during planning/execution, record the changed file in the implementation report.

---

## Phase 1: Observability And Measurement

Phase goal: every generation produces content-free metrics that can classify delay as prompt preflight, provider wait, UI display, persistence, or finalization.

### Task 1.1: Add Generation Metrics Types And Redaction Helpers

**Files:**
- Create: `src/ai/aiGenerationMetrics.ts`
- Create: `tests/ai-chat-latency-metrics-policy.test.cjs`

- [ ] **Step 1: Write policy coverage first**

Create `tests/ai-chat-latency-metrics-policy.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('generation metrics module defines content-free phase timestamps and derived durations', () => {
  const source = read('src/ai/aiGenerationMetrics.ts');

  for (const field of [
    'sendPressedAt',
    'userMessagePersistStartAt',
    'userMessagePersistEndAt',
    'assistantPlaceholderPersistStartAt',
    'assistantPlaceholderPersistEndAt',
    'generationStartAt',
    'providerResolveStartAt',
    'providerResolveEndAt',
    'branchResolveStartAt',
    'branchResolveEndAt',
    'memoryResolveStartAt',
    'memoryResolveEndAt',
    'retrievalStartAt',
    'retrievalEndAt',
    'historyLoadStartAt',
    'historyLoadEndAt',
    'promptBuildStartAt',
    'promptBuildEndAt',
    'providerRequestSentAt',
    'firstProviderDeltaAt',
    'firstUiPatchAt',
    'lastProviderDeltaAt',
    'finalPersistStartAt',
    'finalPersistEndAt',
    'generationSettledAt',
  ]) {
    assert.match(source, new RegExp(field));
  }

  for (const duration of [
    'sendToProviderRequestMs',
    'providerRequestToFirstDeltaMs',
    'sendToFirstDeltaMs',
    'firstDeltaToFirstUiPatchMs',
    'sendToFirstVisibleTextMs',
    'promptPipelineMs',
    'retrievalMs',
    'memoryMs',
    'historyLoadMs',
    'finalizationMs',
    'totalGenerationMs',
  ]) {
    assert.match(source, new RegExp(duration));
  }

  assert.match(source, /export function createGenerationMetricsDraft/);
  assert.match(source, /export function markGenerationMetric/);
  assert.match(source, /export function finalizeGenerationMetrics/);
  assert.match(source, /export function redactGenerationMetricsForDiagnostics/);
});

test('generation metrics stay content-free and block prompt-like fields', () => {
  const source = read('src/ai/aiGenerationMetrics.ts');

  assert.match(source, /FORBIDDEN_GENERATION_METRIC_KEYS/);
  assert.match(source, /system/i);
  assert.match(source, /prompt/i);
  assert.match(source, /memory/i);
  assert.match(source, /retrieved/i);
  assert.match(source, /assistant/i);
  assert.match(source, /userMessage/i);
  assert.match(source, /assertContentFreeGenerationMetrics/);
  assert.doesNotMatch(source, /promptText:/);
  assert.doesNotMatch(source, /systemPrompt:/);
  assert.doesNotMatch(source, /retrievedText:/);
});

test('chat service stores metrics under promptSnapshotJson.generationMetrics', () => {
  const chat = read('src/ai/aiChatService.ts');
  const manager = read('src/ai/aiGenerationManager.ts');
  const screen = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /generationMetrics/);
  assert.match(chat, /createGenerationMetricsDraft/);
  assert.match(chat, /finalizeGenerationMetrics/);
  assert.match(chat, /redactGenerationMetricsForDiagnostics/);
  assert.match(chat, /promptSnapshotJson/);
  assert.match(chat, /sendPressedAt/);
  assert.match(manager, /sendPressedAt/);
  assert.match(screen, /sendPressedAt/);
});

test('prompt build records memory and retrieval subphase timings separately', () => {
  const chat = read('src/ai/aiChatService.ts');

  assert.match(chat, /memoryResolveStartAt/);
  assert.match(chat, /memoryResolveEndAt/);
  assert.match(chat, /retrievalStartAt/);
  assert.match(chat, /retrievalEndAt/);
  assert.match(chat, /generationMetrics/);
});
```

- [ ] **Step 2: Run the policy test and verify RED**

Run:

```powershell
node --test tests/ai-chat-latency-metrics-policy.test.cjs
```

Expected: FAIL because `src/ai/aiGenerationMetrics.ts` does not exist yet.

- [ ] **Step 3: Implement `aiGenerationMetrics.ts`**

Create `src/ai/aiGenerationMetrics.ts` with:

```ts
import type { PixorySpace } from '../database';

export type AiGenerationTimestampKey =
  | 'sendPressedAt'
  | 'userMessagePersistStartAt'
  | 'userMessagePersistEndAt'
  | 'assistantPlaceholderPersistStartAt'
  | 'assistantPlaceholderPersistEndAt'
  | 'generationStartAt'
  | 'providerResolveStartAt'
  | 'providerResolveEndAt'
  | 'branchResolveStartAt'
  | 'branchResolveEndAt'
  | 'memoryResolveStartAt'
  | 'memoryResolveEndAt'
  | 'retrievalStartAt'
  | 'retrievalEndAt'
  | 'historyLoadStartAt'
  | 'historyLoadEndAt'
  | 'promptBuildStartAt'
  | 'promptBuildEndAt'
  | 'providerRequestSentAt'
  | 'firstProviderDeltaAt'
  | 'firstUiPatchAt'
  | 'lastProviderDeltaAt'
  | 'finalPersistStartAt'
  | 'finalPersistEndAt'
  | 'generationSettledAt';

export interface AiGenerationMetricsDraft {
  version: 1;
  timestamps: Partial<Record<AiGenerationTimestampKey, string>>;
  counters: {
    providerDeltaCount: number;
    answerDeltaCount: number;
    reasoningDeltaCount: number;
    streamUiPatchCount: number;
    streamPersistCount: number;
    streamMergedDeltaCount: number;
    streamSkippedUiPatchCount: number;
    streamSkippedPersistCount: number;
    maxBufferedChars: number;
    finalAnswerChars: number;
    finalReasoningChars: number;
  };
  context: {
    space: PixorySpace;
    threadId: string;
    messageId: string;
    generationId: string;
    providerId: string | null;
    modelId: string | null;
    chatMode: string | null;
    contextType: string | null;
    branchScopeCount: number;
    historyMessageCount: number;
    loadedMessageCountAtSend: number;
    retrievalSnippetCount: number;
    memoryEpoch: string | null;
    stablePrefixEstimatedTokens: number | null;
    totalPromptTokens: number | null;
    cachedInputTokens: number | null;
    cachedTokenRatio: number | null;
    retrievalMode: string | null;
    retrievalSkippedReason: string | null;
    stopReason: string | null;
    failureReason: string | null;
    devicePressureThrottled: boolean;
  };
}

export interface AiGenerationMetrics extends AiGenerationMetricsDraft {
  durations: {
    sendToProviderRequestMs: number | null;
    providerRequestToFirstDeltaMs: number | null;
    sendToFirstDeltaMs: number | null;
    firstDeltaToFirstUiPatchMs: number | null;
    sendToFirstVisibleTextMs: number | null;
    promptPipelineMs: number | null;
    retrievalMs: number | null;
    memoryMs: number | null;
    historyLoadMs: number | null;
    finalizationMs: number | null;
    totalGenerationMs: number | null;
  };
}

export const FORBIDDEN_GENERATION_METRIC_KEYS = [
  'prompt',
  'promptText',
  'system',
  'systemPrompt',
  'user',
  'userMessage',
  'assistant',
  'assistantReply',
  'memory',
  'memoryText',
  'retrieved',
  'retrievedText',
  'materialText',
  'snippetText',
  'content',
] as const;

export function nowIso(): string {
  return new Date().toISOString();
}

export function createGenerationMetricsDraft(input: {
  space: PixorySpace;
  threadId: string;
  messageId: string;
  generationId: string;
  contextType?: string | null;
  loadedMessageCountAtSend?: number;
}): AiGenerationMetricsDraft {
  return {
    version: 1,
    timestamps: {},
    counters: {
      providerDeltaCount: 0,
      answerDeltaCount: 0,
      reasoningDeltaCount: 0,
      streamUiPatchCount: 0,
      streamPersistCount: 0,
      streamMergedDeltaCount: 0,
      streamSkippedUiPatchCount: 0,
      streamSkippedPersistCount: 0,
      maxBufferedChars: 0,
      finalAnswerChars: 0,
      finalReasoningChars: 0,
    },
    context: {
      space: input.space,
      threadId: input.threadId,
      messageId: input.messageId,
      generationId: input.generationId,
      providerId: null,
      modelId: null,
      chatMode: null,
      contextType: input.contextType ?? null,
      branchScopeCount: 0,
      historyMessageCount: 0,
      loadedMessageCountAtSend: input.loadedMessageCountAtSend ?? 0,
      retrievalSnippetCount: 0,
      memoryEpoch: null,
      stablePrefixEstimatedTokens: null,
      totalPromptTokens: null,
      cachedInputTokens: null,
      cachedTokenRatio: null,
      retrievalMode: null,
      retrievalSkippedReason: null,
      stopReason: null,
      failureReason: null,
      devicePressureThrottled: false,
    },
  };
}

export function markGenerationMetric(
  draft: AiGenerationMetricsDraft,
  key: AiGenerationTimestampKey,
  value: string = nowIso()
): void {
  draft.timestamps[key] = value;
}

function msBetween(start?: string, end?: string): number | null {
  if (!start || !end) {
    return null;
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  return endMs - startMs;
}

export function finalizeGenerationMetrics(draft: AiGenerationMetricsDraft): AiGenerationMetrics {
  const timestamps = draft.timestamps;
  return {
    ...draft,
    durations: {
      sendToProviderRequestMs: msBetween(timestamps.sendPressedAt, timestamps.providerRequestSentAt),
      providerRequestToFirstDeltaMs: msBetween(timestamps.providerRequestSentAt, timestamps.firstProviderDeltaAt),
      sendToFirstDeltaMs: msBetween(timestamps.sendPressedAt, timestamps.firstProviderDeltaAt),
      firstDeltaToFirstUiPatchMs: msBetween(timestamps.firstProviderDeltaAt, timestamps.firstUiPatchAt),
      sendToFirstVisibleTextMs: msBetween(timestamps.sendPressedAt, timestamps.firstUiPatchAt),
      promptPipelineMs: msBetween(timestamps.promptBuildStartAt, timestamps.promptBuildEndAt),
      retrievalMs: msBetween(timestamps.retrievalStartAt, timestamps.retrievalEndAt),
      memoryMs: msBetween(timestamps.memoryResolveStartAt, timestamps.memoryResolveEndAt),
      historyLoadMs: msBetween(timestamps.historyLoadStartAt, timestamps.historyLoadEndAt),
      finalizationMs: msBetween(timestamps.finalPersistStartAt, timestamps.finalPersistEndAt),
      totalGenerationMs: msBetween(timestamps.generationStartAt, timestamps.generationSettledAt),
    },
  };
}

export function assertContentFreeGenerationMetrics(metrics: unknown): void {
  const serialized = JSON.stringify(metrics);
  for (const key of FORBIDDEN_GENERATION_METRIC_KEYS) {
    if (new RegExp(`"${key}"\\s*:`, 'i').test(serialized)) {
      throw new Error(`generationMetrics contains forbidden content-like key: ${key}`);
    }
  }
}

export function redactGenerationMetricsForDiagnostics(metrics: AiGenerationMetrics): AiGenerationMetrics {
  assertContentFreeGenerationMetrics(metrics);
  return metrics;
}
```

- [ ] **Step 4: Run metric policy test**

Run:

```powershell
node --test tests/ai-chat-latency-metrics-policy.test.cjs
```

Expected: still FAIL until `aiChatService.ts` stores metrics.

---

### Task 1.2: Attach Metrics To Chat Generation Snapshots

**Files:**
- Modify: `src/ai/aiChatService.ts`
- Modify: `src/ai/aiGenerationManager.ts`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `tests/ai-chat-latency-metrics-policy.test.cjs`

- [ ] **Step 1: Thread real send timestamp from UI to service**

In `AiChatScreen`, capture the send timestamp at the start of the send action before any user-message persistence work:

```ts
const sendPressedAt = new Date().toISOString();
```

Pass `sendPressedAt` through the existing generation start call into `aiGenerationManager`, then into the service input. Extend the relevant input types with:

```ts
sendPressedAt?: string;
```

Do not use generation start as the normal `sendPressedAt` value. It is acceptable only as a defensive fallback when an older caller omits the field.

- [ ] **Step 2: Mark user and assistant placeholder persistence**

Around user message creation and assistant placeholder creation, mark:

```ts
markGenerationMetric(generationMetrics, 'userMessagePersistStartAt');
markGenerationMetric(generationMetrics, 'userMessagePersistEndAt');
markGenerationMetric(generationMetrics, 'assistantPlaceholderPersistStartAt');
markGenerationMetric(generationMetrics, 'assistantPlaceholderPersistEndAt');
```

If those records are created before the service has a metrics draft, either create the draft earlier or pass a prefilled timestamp object into the service. The resulting snapshot must include these four timestamps.

- [ ] **Step 3: Import metric helpers in `src/ai/aiChatService.ts`**

Add imports:

```ts
import {
  createGenerationMetricsDraft,
  finalizeGenerationMetrics,
  markGenerationMetric,
  redactGenerationMetricsForDiagnostics,
  type AiGenerationMetricsDraft,
} from './aiGenerationMetrics';
```

- [ ] **Step 4: Extend `buildPromptSnapshotJson` input**

Add a `generationMetrics?: AiGenerationMetricsDraft | null` field to the function input and include finalized redacted metrics in the JSON object:

```ts
generationMetrics: input.generationMetrics
  ? redactGenerationMetricsForDiagnostics(finalizeGenerationMetrics(input.generationMetrics))
  : null,
```

Keep existing `cacheObservation`, `system`, and `materialRules` behavior unchanged. The diagnostics UI must consume only `generationMetrics`; it must not render raw prompt fields in Personal space.

- [ ] **Step 5: Create or receive a draft before persistence work**

Create a `generationId` using the existing ID helper pattern before user/assistant message persistence if possible:

```ts
const generationId = createAiId('aigen');
const generationMetrics = createGenerationMetricsDraft({
  contextType: input.thread.contextType,
  generationId,
  loadedMessageCountAtSend: input.loadedMessageCountAtSend ?? 0,
  messageId: input.assistantMessageId,
  sendPressedAt: input.sendPressedAt,
  space: input.space,
  threadId: input.thread.id,
});
markGenerationMetric(generationMetrics, 'sendPressedAt', input.sendPressedAt ?? new Date().toISOString());
markGenerationMetric(generationMetrics, 'generationStartAt');
```

The normal path must use the UI-captured timestamp. The fallback timestamp exists only for compatibility with older/internal callers.

- [ ] **Step 6: Mark phase timestamps around existing work**

Wrap existing generation steps:

```ts
markGenerationMetric(generationMetrics, 'providerResolveStartAt');
// existing provider/model/key resolution
markGenerationMetric(generationMetrics, 'providerResolveEndAt');

markGenerationMetric(generationMetrics, 'branchResolveStartAt');
// existing branch scope resolution
markGenerationMetric(generationMetrics, 'branchResolveEndAt');

markGenerationMetric(generationMetrics, 'promptBuildStartAt');
// existing buildPromptForThread
markGenerationMetric(generationMetrics, 'promptBuildEndAt');

markGenerationMetric(generationMetrics, 'historyLoadStartAt');
// existing history load
markGenerationMetric(generationMetrics, 'historyLoadEndAt');

markGenerationMetric(generationMetrics, 'providerRequestSentAt');
```

Set `firstProviderDeltaAt` on the first answer or reasoning delta. Set `lastProviderDeltaAt` on every answer/reasoning delta.

- [ ] **Step 7: Mark memory and retrieval subphases inside prompt build**

Change `buildPromptForThread` to accept the metrics draft or a small marker callback. Mark memory-specific work with:

```ts
markGenerationMetric(generationMetrics, 'memoryResolveStartAt');
// stable memory, dynamic memory, profile, summary, companion memory prefix work
markGenerationMetric(generationMetrics, 'memoryResolveEndAt');
```

Mark retrieval-specific work with:

```ts
markGenerationMetric(generationMetrics, 'retrievalStartAt');
// retrieveForThread / skipped retrieval / bounded material retrieval
markGenerationMetric(generationMetrics, 'retrievalEndAt');
```

If memory or retrieval is skipped, still set start and end timestamps and record the skip reason in `generationMetrics.context`.

- [ ] **Step 8: Increment counters**

Inside stream event handling:

```ts
generationMetrics.counters.providerDeltaCount += 1;
generationMetrics.counters.answerDeltaCount += event.type === 'answer_delta' ? 1 : 0;
generationMetrics.counters.reasoningDeltaCount += event.type === 'reasoning_delta' ? 1 : 0;
generationMetrics.counters.finalAnswerChars = answerText.length;
generationMetrics.counters.finalReasoningChars = reasoningText.length;
generationMetrics.counters.maxBufferedChars = Math.max(
  generationMetrics.counters.maxBufferedChars,
  answerText.length + reasoningText.length
);
```

In UI patch and persist helpers, increment `streamUiPatchCount`, `streamSkippedUiPatchCount`, `streamPersistCount`, and `streamSkippedPersistCount`.

- [ ] **Step 9: Populate context fields**

Set context fields after data is available:

```ts
generationMetrics.context.providerId = provider.id;
generationMetrics.context.modelId = modelId;
generationMetrics.context.chatMode = prompt.cacheMetadata.chatMode;
generationMetrics.context.branchScopeCount = branchScopes.length;
generationMetrics.context.historyMessageCount = history.length;
generationMetrics.context.retrievalSnippetCount = snippets.length;
generationMetrics.context.memoryEpoch = prompt.cacheMetadata.memoryEpoch;
generationMetrics.context.stablePrefixEstimatedTokens = prompt.cacheMetadata.stablePrefixEstimatedTokens;
```

After provider usage normalization, set:

```ts
generationMetrics.context.totalPromptTokens = normalizedUsage?.totalPromptTokens ?? null;
generationMetrics.context.cachedInputTokens = normalizedUsage?.cachedInputTokens ?? null;
generationMetrics.context.cachedTokenRatio = normalizedUsage?.cachedTokenRatio ?? null;
```

- [ ] **Step 10: Include metrics in all snapshots**

Update `createPromptSnapshotJson` calls so completed, stopped, aborted, and failed paths include `generationMetrics`.

- [ ] **Step 11: Run focused tests**

Run:

```powershell
node --test tests/ai-chat-latency-metrics-policy.test.cjs tests/ai-usage-analytics-unit.test.cjs
```

Expected: PASS.

- [ ] **Step 12: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: PASS.

### Task 1.3: Phase 1 Gate

**Files:**
- Update: `docs/superpowers/plans/2026-06-19-ai-chat-latency-and-streaming-performance-implementation-report.md`

- [ ] **Step 1: Record metrics scope**

Create or update the implementation report with:

```md
# AI Chat Latency Implementation Report

## Phase 1 Gate

- Scope completed:
- Metrics captured:
- Acceptance passed:
- Acceptance unverified:
- Regressions checked:
- Deliberate deferrals:
```

- [ ] **Step 2: Verify Phase 1 gate**

Required before Phase 2:

- `generationMetrics` exists in completed/stopped/failed/aborted prompt snapshots.
- Metrics are content-free.
- Personal space metrics use the same redacted `generationMetrics` shape.
- At least one normal chat run, one long-thread run, and one Personal space run are validated manually, or explicitly marked unverified with reason.

- [ ] **Step 3: Run phase verification**

Run:

```powershell
pnpm test
pnpm typecheck
git diff --check
```

Expected: PASS. If Android validation is unavailable, record it as unverified and do not claim Android acceptance.

---

## Phase 2: Streaming UI Runtime And Rendering

Phase goal: provider deltas, display updates, and SQLite partial persists are decoupled, generation-scoped, and recoverable without mutating the full message list on every display tick.

### Task 2.1: Add Streaming Scheduler Policy Tests

**Files:**
- Create: `tests/ai-chat-streaming-runtime-policy.test.cjs`

- [ ] **Step 1: Create policy tests**

Create `tests/ai-chat-streaming-runtime-policy.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('streaming runtime defines adaptive display tiers, persist tiers, and generation guards', () => {
  const source = read('src/ai/aiStreamingRuntime.ts');

  assert.match(source, /generationId/);
  assert.match(source, /first 1000|FIRST_VISIBLE_CHAR_LIMIT|1000/);
  assert.match(source, /4000/);
  assert.match(source, /20/);
  assert.match(source, /15/);
  assert.match(source, /10|8/);
  assert.match(source, /500/);
  assert.match(source, /1000/);
  assert.match(source, /1500/);
  assert.match(source, /isStaleGeneration/);
  assert.match(source, /recordJsFrameDelay/);
  assert.match(source, /devicePressureThrottled/);
});

test('chat service no longer uses old fixed streaming constants as the only scheduler', () => {
  const chat = read('src/ai/aiChatService.ts');

  assert.match(chat, /aiStreamingRuntime|createStreamingRuntime|StreamingRuntime/);
  assert.doesNotMatch(chat, /const STREAMING_PERSIST_INTERVAL_MS = 120/);
  assert.doesNotMatch(chat, /const STREAMING_UI_PATCH_INTERVAL_MS = 80/);
});

test('screen renders active streaming text outside full message-list mutation path', () => {
  const screen = read('src/screens/AiChatScreen.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const streamingText = read('src/components/ai/AiStreamingMessageText.tsx');
  const store = read('src/ai/aiStreamingMessageStore.ts');

  assert.match(screen, /generationId/);
  assert.match(screen, /setActiveStreamingIdentity|clearActiveStreamingIdentity/);
  assert.doesNotMatch(screen, /setStreamingTextByMessageId/);
  assert.match(bubble, /AiStreamingMessageText/);
  assert.match(store, /useSyncExternalStore/);
  assert.match(store, /subscribeStreamingMessage/);
  assert.match(store, /publishStreamingMessage/);
  assert.match(store, /clearStreamingMessage/);
  assert.match(streamingText, /selectable=\{false\}/);
  assert.match(streamingText, /generationId/);
});
```

- [ ] **Step 2: Run policy test and verify RED**

Run:

```powershell
node --test tests/ai-chat-streaming-runtime-policy.test.cjs
```

Expected: FAIL until runtime files exist and old fixed constants are replaced.

### Task 2.2: Implement Streaming Runtime Core

**Files:**
- Create: `src/ai/aiStreamingRuntime.ts`
- Create: `src/ai/aiStreamingMessageStore.ts`

- [ ] **Step 1: Create runtime types and scheduler**

Create `src/ai/aiStreamingRuntime.ts`:

```ts
export interface AiStreamingRuntimeIdentity {
  space: string;
  threadId: string;
  messageId: string;
  generationId: string;
}

export interface AiStreamingRuntimeSnapshot extends AiStreamingRuntimeIdentity {
  answerText: string;
  reasoningText: string | null;
  visibleAnswerText: string;
  visibleReasoningText: string | null;
  devicePressureThrottled: boolean;
}

const FIRST_VISIBLE_CHAR_LIMIT = 1000;
const SECOND_VISIBLE_CHAR_LIMIT = 4000;
const DEVICE_PRESSURE_FRAME_DELAY_MS = 250;
const DEVICE_PRESSURE_HARD_DELAY_MS = 500;

export function targetStreamingFps(visibleChars: number, input?: { scrolledAway?: boolean; backgrounded?: boolean; devicePressure?: boolean }): number {
  if (input?.scrolledAway || input?.backgrounded) {
    return 0;
  }
  const pressurePenalty = input?.devicePressure ? 1 : 0;
  if (visibleChars <= FIRST_VISIBLE_CHAR_LIMIT) {
    return Math.max(8, 20 - pressurePenalty * 5);
  }
  if (visibleChars <= SECOND_VISIBLE_CHAR_LIMIT) {
    return Math.max(8, 15 - pressurePenalty * 5);
  }
  return input?.devicePressure ? 8 : 10;
}

export function targetPersistIntervalMs(visibleChars: number): number {
  return visibleChars > SECOND_VISIBLE_CHAR_LIMIT ? 1000 : 500;
}

export function maxPersistIntervalMs(visibleChars: number): number {
  return visibleChars > SECOND_VISIBLE_CHAR_LIMIT ? 1500 : 1000;
}

export function isStaleGeneration(
  current: AiStreamingRuntimeIdentity | null,
  incoming: AiStreamingRuntimeIdentity
): boolean {
  return !current
    || current.space !== incoming.space
    || current.threadId !== incoming.threadId
    || current.messageId !== incoming.messageId
    || current.generationId !== incoming.generationId;
}

export function recordJsFrameDelay(input: {
  delayMs: number;
  consecutivePressureWindows: number;
}): { consecutivePressureWindows: number; devicePressureThrottled: boolean } {
  if (input.delayMs > DEVICE_PRESSURE_HARD_DELAY_MS) {
    return { consecutivePressureWindows: input.consecutivePressureWindows + 1, devicePressureThrottled: true };
  }
  const nextCount = input.delayMs > DEVICE_PRESSURE_FRAME_DELAY_MS
    ? input.consecutivePressureWindows + 1
    : 0;
  return {
    consecutivePressureWindows: nextCount,
    devicePressureThrottled: nextCount >= 2,
  };
}
```

- [ ] **Step 2: Keep tests in the existing source-policy style**

Keep this implementation on the existing Node source-policy test style. Do not add a TypeScript test runtime as part of this performance work.

- [ ] **Step 3: Create external streaming message store**

Create `src/ai/aiStreamingMessageStore.ts` with a tiny `useSyncExternalStore`-based subscription store. Required exported API:

```ts
export interface AiStreamingMessageStoreValue {
  generationId: string;
  content: string;
  reasoningText: string | null;
}

export function publishStreamingMessage(messageId: string, value: AiStreamingMessageStoreValue): void;
export function clearStreamingMessage(messageId: string, generationId?: string): void;
export function subscribeStreamingMessage(messageId: string, listener: () => void): () => void;
export function getStreamingMessageSnapshot(messageId: string): AiStreamingMessageStoreValue | null;
export function useStreamingMessage(messageId: string): AiStreamingMessageStoreValue | null;
```

The store must notify only subscribers of the changed message ID. `AiChatScreen` must not subscribe to every text update.

- [ ] **Step 4: Run focused test**

Run:

```powershell
node --test tests/ai-chat-streaming-runtime-policy.test.cjs
```

Expected: still FAIL until service/screen integration is done.

### Task 2.3: Integrate Adaptive Scheduler And Coalesced Persistence

**Files:**
- Modify: `src/ai/aiChatService.ts`
- Modify: `src/ai/aiGenerationMetrics.ts`

- [ ] **Step 1: Replace fixed constants**

Remove fixed-only constants:

```ts
const STREAMING_PERSIST_INTERVAL_MS = 120;
const STREAMING_UI_PATCH_INTERVAL_MS = 80;
```

Import:

```ts
import {
  isStaleGeneration,
  maxPersistIntervalMs,
  targetPersistIntervalMs,
  targetStreamingFps,
} from './aiStreamingRuntime';
```

- [ ] **Step 2: Add generation identity to streaming patches**

Extend `AiStreamingMessagePatch`:

```ts
generationId?: string;
threadId?: string;
space?: PixorySpace;
```

Every patch emitted during generation must include `generationId`, `threadId`, and `space`.

- [ ] **Step 3: Replace UI patch throttle**

Implement display interval from fps:

```ts
const targetFps = targetStreamingFps(answerText.length, {
  backgrounded: false,
  devicePressure: generationMetrics.context.devicePressureThrottled,
  scrolledAway: false,
});
const minUiInterval = targetFps > 0 ? 1000 / targetFps : Number.POSITIVE_INFINITY;
```

If the elapsed time is below `minUiInterval`, increment `streamSkippedUiPatchCount` and return. When emitting, increment `streamUiPatchCount` and set `firstUiPatchAt` if missing.

- [ ] **Step 4: Replace persist throttle**

Use:

```ts
const minPersistInterval = targetPersistIntervalMs(answerText.length);
const maxPersistInterval = maxPersistIntervalMs(answerText.length);
```

If a persist is in flight, set a pending flag and write the latest snapshot when it completes. Never await partial persist before emitting UI.

- [ ] **Step 5: Force persist on terminal paths**

Ensure these paths call forced persist:

- abort
- stop
- provider error
- completion
- route/background hook if already exposed to service

- [ ] **Step 6: Run focused tests**

Run:

```powershell
node --test tests/ai-chat-streaming-runtime-policy.test.cjs tests/ai-chat-latency-metrics-policy.test.cjs
pnpm typecheck
```

Expected: PASS for metrics tests; streaming policy may still fail until UI integration.

### Task 2.4: Split Active Streaming Text From Message List Rendering

**Files:**
- Create: `src/components/ai/AiStreamingMessageText.tsx`
- Modify: `src/components/ai/AiMessageBubble.tsx`
- Modify: `src/components/ai/AiMessageContent.tsx`
- Modify: `src/screens/AiChatScreen.tsx`

- [ ] **Step 1: Create streaming text component**

Create `src/components/ai/AiStreamingMessageText.tsx`:

```tsx
import React from 'react';
import { Text } from 'react-native';

import { aiMessageContentStyles } from './AiMessageContent';
import { useStreamingMessage } from '../../ai/aiStreamingMessageStore';

export interface AiStreamingMessageTextProps {
  generationId: string;
  messageId: string;
  trailingInline?: React.ReactNode;
}

export function AiStreamingMessageText({ generationId, messageId, trailingInline }: AiStreamingMessageTextProps) {
  const live = useStreamingMessage(messageId);
  const content = live?.generationId === generationId ? live.content : '';
  return (
    <Text selectable={false} style={[aiMessageContentStyles.body, aiMessageContentStyles.assistantText]}>
      {content}
      {trailingInline ?? null}
    </Text>
  );
}
```

Export `aiMessageContentStyles` from `AiMessageContent.tsx` by changing the existing local style declaration to:

```ts
export const aiMessageContentStyles = StyleSheet.create({
  // existing style object
});
```

Then update internal references in `AiMessageContent.tsx` from `styles` to `aiMessageContentStyles`, or add `const styles = aiMessageContentStyles` immediately after the export to keep the rest of the file stable.

- [ ] **Step 2: Update message bubble**

When an assistant message is generating and has an active `generationId`, render `AiStreamingMessageText` for the active tail. Completed messages continue to render `AiMessageContent` with markdown.

- [ ] **Step 3: Guard stale patches in `AiChatScreen`**

Track current active streaming identity:

```ts
const activeStreamingIdentityRef = useRef<{
  space: PixorySpace;
  threadId: string;
  messageId: string;
  generationId: string;
} | null>(null);
```

Before applying any streaming patch, reject stale patches whose `generationId` does not match current identity.

- [ ] **Step 4: Avoid full message-list mutation per display tick**

Keep live visible content in `aiStreamingMessageStore` keyed by message ID and generation ID. The message list receives only placeholder, terminal updates, and explicit buffered flushes.

Minimum store value:

```ts
{
  generationId: string;
  content: string;
  reasoningText: string | null;
}
```

Historical message array updates and `AiChatScreen` state updates must not run on every streaming tick. Streaming text publication uses `publishStreamingMessage`, and only `AiStreamingMessageText` subscribes.

- [ ] **Step 5: Keep read-buffer behavior**

Preserve existing behavior when user scrolls away:

- buffer updates
- show scroll-to-latest affordance
- flush latest content when returning to bottom
- never jump scroll unexpectedly

- [ ] **Step 6: Run focused tests**

Run:

```powershell
node --test tests/ai-chat-streaming-runtime-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

### Task 2.5: Phase 2 Gate

**Files:**
- Update: `docs/superpowers/plans/2026-06-19-ai-chat-latency-and-streaming-performance-implementation-report.md`

- [ ] **Step 1: Record streaming metrics**

Report:

- UI patch count before/after if baseline exists.
- SQLite partial persist count.
- Whether stale `generationId` patches are rejected.
- 200+ message validation result.
- 10,000-character validation result.
- Whether segmentation was required or deferred with evidence.

- [ ] **Step 2: Run phase verification**

Run:

```powershell
pnpm test
pnpm typecheck
git diff --check
```

Expected: PASS.

- [ ] **Step 3: Manual Android validation**

Run when device/emulator is available:

```powershell
pnpm acceptance:android
```

Validate:

- 200+ message thread remains scrollable while streaming.
- 10,000-character reply streams without more than one sustained JS delay above 250 ms per 30 seconds.
- stop/error/completion leave recoverable content.

If unavailable, record unverified Android acceptance.

---

## Phase 3: First-Token Latency And Prompt Pipeline

Phase goal: normal no-material chat skips retrieval, ambiguous material references fail closed, actual model context windows drive trimming, and deferred jobs stay off the provider-request path.

### Task 3.1: Add Fast-Path Classifier

**Files:**
- Create: `src/ai/aiChatFastPath.ts`
- Create: `tests/ai-chat-first-token-pipeline-policy.test.cjs`

- [ ] **Step 1: Create policy tests**

Create `tests/ai-chat-first-token-pipeline-policy.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('fast path classifier fails closed for ambiguous material references', () => {
  const source = read('src/ai/aiChatFastPath.ts');

  assert.match(source, /normal_no_material_fast_path/);
  assert.match(source, /material_keyword_only/);
  assert.match(source, /material_full_retrieval/);
  assert.match(source, /ip_context_retrieval/);
  assert.match(source, /knowledge_base_retrieval/);
  assert.match(source, /long_companion_context/);
  assert.match(source, /MATERIAL_REFERENCE_PATTERN/);
  assert.match(source, /recentCitationDependency/);
  assert.match(source, /roleRequiresMaterial/);
  assert.match(source, /return 'material_keyword_only'/);
});

test('chat service records retrieval skip reason and uses classifier before retrieval', () => {
  const chat = read('src/ai/aiChatService.ts');

  assert.match(chat, /classifyAiChatFastPath/);
  assert.match(chat, /retrievalSkippedReason/);
  assert.match(chat, /normal_fast_path/);
  assert.match(chat, /retrievalStartAt/);
  assert.match(chat, /retrievalEndAt/);
});

test('context trimming receives actual model context window', () => {
  const chat = read('src/ai/aiChatService.ts');

  assert.match(chat, /modelContextWindowTokens/);
  assert.match(chat, /trimMessagesToContextBudget\(\{[\s\S]*modelContextWindowTokens/);
});
```

- [ ] **Step 2: Implement classifier**

Create `src/ai/aiChatFastPath.ts`:

```ts
export type AiChatPipelineMode =
  | 'normal_no_material_fast_path'
  | 'normal_memory_only'
  | 'material_keyword_only'
  | 'material_full_retrieval'
  | 'ip_context_retrieval'
  | 'knowledge_base_retrieval'
  | 'long_companion_context';

const MATERIAL_REFERENCE_PATTERN = /(资料|文档|图片|图|素材|设定|知识库|引用|上面|刚才|这个角色|这张|那个|according to|document|image|material|reference|citation)/i;

export function classifyAiChatFastPath(input: {
  contextType: 'normal' | 'ip' | 'knowledge' | string;
  userMessage: string;
  hasAttachment?: boolean;
  roleRequiresMaterial?: boolean;
  deepMemoryEnabled?: boolean;
  recentCitationDependency?: boolean;
  lowLatencyMode?: boolean;
  longCompanionMode?: boolean;
}): AiChatPipelineMode {
  if (input.contextType === 'ip') {
    return 'ip_context_retrieval';
  }
  if (input.contextType === 'knowledge') {
    return 'knowledge_base_retrieval';
  }
  if (input.hasAttachment || input.roleRequiresMaterial || input.recentCitationDependency) {
    return 'material_keyword_only';
  }
  if (MATERIAL_REFERENCE_PATTERN.test(input.userMessage)) {
    return 'material_keyword_only';
  }
  if (input.longCompanionMode) {
    return 'long_companion_context';
  }
  if (input.deepMemoryEnabled) {
    return 'normal_memory_only';
  }
  return 'normal_no_material_fast_path';
}
```

- [ ] **Step 3: Run focused test**

Run:

```powershell
node --test tests/ai-chat-first-token-pipeline-policy.test.cjs
```

Expected: FAIL until service integration and context-window handling are implemented.

### Task 3.2: Integrate Fast Path And Retrieval Tiering

**Files:**
- Modify: `src/ai/aiChatService.ts`
- Modify: `src/ai/aiRetrievalService.ts`

- [ ] **Step 1: Classify before prompt retrieval**

In `buildPromptForThread`, call `classifyAiChatFastPath` before `retrieveForThread`.

For `normal_no_material_fast_path`:

- skip `retrieveForThread`
- set `retrievalSkippedReason = 'normal_fast_path'`
- set snippets to `[]`

For ambiguous or material modes:

- use bounded keyword retrieval first
- escalate to embedding/full retrieval only when mode requires it

- [ ] **Step 2: Add retrieval result metadata**

Make retrieval return metadata:

```ts
{
  mode: 'skipped' | 'keyword' | 'embedding' | 'partial' | 'full';
  skippedReason?: 'normal_fast_path' | null;
  timedOut?: boolean;
  snippets: RetrievedSnippet[];
}
```

Preserve existing callers by adapting at the service boundary if changing return type broadly is too risky.

- [ ] **Step 3: Time retrieval**

Mark `retrievalStartAt` and `retrievalEndAt` around retrieval work. For skipped retrieval, record both timestamps and `retrievalSkippedReason`.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
node --test tests/ai-chat-first-token-pipeline-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

### Task 3.3: Pass Actual Model Context Window To History Trimming

**Files:**
- Modify: `src/ai/aiChatService.ts`
- Modify when protected prompt or budget return shape changes: `src/ai/aiContextBudget.ts`

- [ ] **Step 1: Update `buildChatHistory` signature**

Change from:

```ts
function buildChatHistory(messages: AiMessageRecord[], userMessageId: string)
```

to:

```ts
function buildChatHistory(
  messages: AiMessageRecord[],
  userMessageId: string,
  input: {
    modelContextWindowTokens?: number | null;
    protectedPrompt: string;
  }
)
```

- [ ] **Step 2: Pass actual model context**

When calling `trimMessagesToContextBudget`, pass:

```ts
modelContextWindowTokens: input.modelContextWindowTokens,
protectedPrompt: input.protectedPrompt,
```

The protected prompt must include estimates for stable system, role, memory snapshot, retrieval context, and current user message.

- [ ] **Step 3: Record trimming fields**

Ensure prompt snapshot/cache observation still records:

- count-based trimming
- budget-based trimming
- history message count

- [ ] **Step 4: Run focused tests**

Run:

```powershell
node --test tests/ai-chat-first-token-pipeline-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

### Task 3.4: Ensure Deferred Jobs Stay Off Critical Path

**Files:**
- Modify: `src/ai/aiChatService.ts`
- Modify when an existing maintenance call still blocks the foreground generation path: `src/ai/aiMemoryMaintenanceService.ts`

- [ ] **Step 1: Audit post-reply work**

Confirm these do not happen before `providerRequestSentAt`:

- model-generated title
- memory maintenance
- usage summary aggregation
- diagnostics formatting beyond metrics draft updates
- non-critical material metadata refresh

- [ ] **Step 2: Defer reply-completed jobs**

Use existing deferred maintenance helpers where available. If a call is still awaited on the foreground path and not needed for final message durability, schedule it with `void`.

- [ ] **Step 3: Add source-policy assertions**

Extend `tests/ai-chat-first-token-pipeline-policy.test.cjs` to assert:

```js
assert.match(chat, /providerRequestSentAt/);
assert.match(chat, /void scheduleDeferred|void maybeGenerate|void finalize/);
```

Use exact assertions based on final implementation names.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
node --test tests/ai-chat-first-token-pipeline-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

### Task 3.5: Phase 3 Gate

**Files:**
- Update: `docs/superpowers/plans/2026-06-19-ai-chat-latency-and-streaming-performance-implementation-report.md`

- [ ] **Step 1: Record first-token evidence**

Report:

- `sendToProviderRequestMs` before/after if available.
- Retrieval skip count for normal fast path.
- Retrieval mode for ambiguous material references.
- Actual model context window used.
- Deferred jobs verified off critical path.

- [ ] **Step 2: Run phase verification**

Run:

```powershell
pnpm test
pnpm typecheck
git diff --check
```

Expected: PASS.

---

## Phase 4: Prompt Profiles, Cache Invariants, And Final Acceptance

Phase goal: internal performance modes are explicit, stable prompt prefix behavior remains cache-friendly, and private final-answer semantic caching remains forbidden.

### Task 4.1: Add Internal Performance Mode Profiles

**Files:**
- Create: `src/ai/aiChatPerformanceMode.ts`
- Modify: `src/ai/aiChatService.ts`
- Modify: `src/ai/promptBuilder.ts`
- Modify: `tests/ai-chat-first-token-pipeline-policy.test.cjs`

- [ ] **Step 1: Create mode profile module**

Create `src/ai/aiChatPerformanceMode.ts`:

```ts
export type AiChatPerformanceMode = 'balanced_companion' | 'low_latency' | 'long_companion' | 'material_grounding';

export interface AiChatPerformanceProfile {
  mode: AiChatPerformanceMode;
  thinkingDisabledPreferred: boolean;
  dynamicMemoryTokenCap: number;
  retrievalTokenCap: number;
  maxOutputTokenHint: number | null;
}

export function resolveAiChatPerformanceProfile(input: {
  contextType: string;
  internalOverride?: AiChatPerformanceMode | null;
  longCompanionHeuristic?: boolean;
}): AiChatPerformanceProfile {
  if (input.internalOverride === 'low_latency') {
    return {
      mode: 'low_latency',
      thinkingDisabledPreferred: true,
      dynamicMemoryTokenCap: 300,
      retrievalTokenCap: 800,
      maxOutputTokenHint: 800,
    };
  }
  if (input.internalOverride === 'long_companion') {
    return {
      mode: 'long_companion',
      thinkingDisabledPreferred: false,
      dynamicMemoryTokenCap: 800,
      retrievalTokenCap: 2000,
      maxOutputTokenHint: null,
    };
  }
  if (input.contextType !== 'normal') {
    return {
      mode: 'material_grounding',
      thinkingDisabledPreferred: false,
      dynamicMemoryTokenCap: 800,
      retrievalTokenCap: 2000,
      maxOutputTokenHint: null,
    };
  }
  if (input.longCompanionHeuristic) {
    return {
      mode: 'long_companion',
      thinkingDisabledPreferred: false,
      dynamicMemoryTokenCap: 800,
      retrievalTokenCap: 2000,
      maxOutputTokenHint: null,
    };
  }
  return {
    mode: 'balanced_companion',
    thinkingDisabledPreferred: false,
    dynamicMemoryTokenCap: 600,
    retrievalTokenCap: 1200,
    maxOutputTokenHint: null,
  };
}
```

- [ ] **Step 2: Record mode in prompt snapshot**

Add `chatPerformanceMode` to `generationMetrics.context` or prompt snapshot metadata. Keep it content-free.

Mode trigger rules for the first implementation:

- Default normal chat uses `balanced_companion`.
- Non-normal context uses `material_grounding`.
- `long_companion` may be selected only by an internal heuristic such as thread age/message count/memory mode, and the heuristic must be documented in the implementation report.
- `low_latency` may be selected only through an internal override used by tests or future non-UI callers. It must not be connected to a visible setting in this task.

- [ ] **Step 3: Keep mode internal**

Do not add a settings screen, button, toggle, or user-facing label.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
node --test tests/ai-chat-first-token-pipeline-policy.test.cjs tests/ai-prompt-cache-policy.test.cjs tests/ai-prompt-cache-unit.test.cjs
pnpm typecheck
```

Expected: PASS.

### Task 4.2: Verify Prompt Layer And Cache Invariants

**Files:**
- Modify when prompt layer order or metadata changes: `src/ai/promptBuilder.ts`
- Modify when stable-prefix hashing or cache metadata changes: `src/ai/aiPromptCache.ts`
- Modify when cache invariants need executable coverage: `tests/ai-prompt-cache-unit.test.cjs`

- [ ] **Step 1: Confirm stable-before-dynamic order**

Prompt layers must remain:

1. `stable_app_policy`
2. `stable_role`
3. `stable_material_rules`
4. `stable_tool_definitions`
5. `memory_snapshot`
6. `history_window`
7. `dynamic_memory`
8. `retrieval_context`
9. `current_user_message`

- [ ] **Step 2: Confirm dynamic retrieval does not change stable prefix hash**

Add or update a unit test in `tests/ai-prompt-cache-unit.test.cjs` so two prompts with same stable inputs and different retrieval snippets have identical `stablePrefixHash` and different `retrievalHash`.

- [ ] **Step 3: Confirm no private final-answer semantic cache**

Keep existing policy tests that reject `semanticCache` and `answerCache` in chat/prompt cache files.

- [ ] **Step 4: Run cache tests**

Run:

```powershell
node --test tests/ai-prompt-cache-policy.test.cjs tests/ai-prompt-cache-unit.test.cjs tests/ai-usage-analytics-unit.test.cjs
pnpm typecheck
```

Expected: PASS.

### Task 4.3: Final Acceptance Policy Coverage

**Files:**
- Modify: `tests/ai-chat-latency-final-acceptance-policy.test.cjs`

- [ ] **Step 1: Expand final policy test**

Add assertions that the final implementation contains:

```js
test('final latency implementation keeps required phase features wired', () => {
  const chat = read('src/ai/aiChatService.ts');
  const metrics = read('src/ai/aiGenerationMetrics.ts');
  const streaming = read('src/ai/aiStreamingRuntime.ts');
  const fastPath = read('src/ai/aiChatFastPath.ts');
  const mode = read('src/ai/aiChatPerformanceMode.ts');

  assert.match(metrics, /generationMetrics/);
  assert.match(streaming, /targetStreamingFps/);
  assert.match(streaming, /targetPersistIntervalMs/);
  assert.match(fastPath, /normal_no_material_fast_path/);
  assert.match(fastPath, /material_keyword_only/);
  assert.match(mode, /balanced_companion/);
  assert.match(mode, /low_latency/);
  assert.match(mode, /long_companion/);
  assert.match(mode, /material_grounding/);
  assert.match(chat, /modelContextWindowTokens/);
  assert.match(chat, /generationId/);
});
```

- [ ] **Step 2: Run final policy tests**

Run:

```powershell
node --test tests/ai-chat-latency-final-acceptance-policy.test.cjs tests/ai-chat-latency-metrics-policy.test.cjs tests/ai-chat-streaming-runtime-policy.test.cjs tests/ai-chat-first-token-pipeline-policy.test.cjs
```

Expected: PASS.

### Task 4.4: Final Phase Gate

**Files:**
- Update: `docs/superpowers/plans/2026-06-19-ai-chat-latency-and-streaming-performance-implementation-report.md`

- [ ] **Step 1: Run full automated verification**

Run:

```powershell
pnpm test
pnpm typecheck
git diff --check
```

Expected: PASS.

- [ ] **Step 2: Run Android validation if available**

Run:

```powershell
pnpm acceptance:android
```

Manual cases:

- short normal thread
- 200+ message thread
- 10,000-character reply
- material-bound thread with citations
- Personal space thread
- stop while streaming
- provider error or simulated error while streaming
- regenerate/edit after streamed reply

Record:

- device model
- Android version
- physical or emulator
- build type
- `firstDeltaToFirstVisibleTextMs`
- `sendToProviderRequestMs`
- `streamUiPatchCount`
- `streamPersistCount`
- `averageUiPatchIntervalMs`
- unverified items

- [ ] **Step 3: Complete report**

The implementation report must include:

```md
## Final Acceptance

- Scope completed:
- Metrics captured:
- Automated verification:
- Android validation:
- Acceptance passed:
- Acceptance unverified:
- Regression checks:
- Deliberate deferrals:
- Files changed:
- Follow-up recommendations:
```

- [ ] **Step 4: Stop for review**

Do not merge or release automatically. Present the implementation report and wait for review.

---

## Cross-Phase Acceptance Matrix

| Spec requirement | Plan task |
| --- | --- |
| Content-free generation metrics | Tasks 1.1, 1.2 |
| Personal space redacted diagnostics | Tasks 1.1, 1.2, 1.3 |
| Phase 1 gate before performance claims | Task 1.3 |
| Streaming display decoupled from provider delta rate | Tasks 2.2, 2.3 |
| Streaming display decoupled from message-list state | Task 2.4 |
| Coalesced partial SQLite persistence | Task 2.3 |
| Stale generation patches ignored | Tasks 2.2, 2.4 |
| 200+ message and 10,000-character validation | Tasks 2.5, 4.4 |
| Normal no-material fast path skips retrieval | Tasks 3.1, 3.2 |
| Ambiguous material references fail closed | Tasks 3.1, 3.2 |
| Actual model context window used | Task 3.3 |
| Deferred jobs off provider critical path | Task 3.4 |
| Internal low-latency/balanced/long/material profiles | Task 4.1 |
| Stable prompt prefix invariants | Task 4.2 |
| No private final-answer semantic cache | Tasks 0.1, 4.2 |
| Full automated verification | Task 4.4 |
| Android manual verification or explicit unverified report | Tasks 1.3, 2.5, 4.4 |

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-19-ai-chat-latency-and-streaming-performance-implementation.md`.

Two execution options:

1. **Subagent-Driven (recommended)**: dispatch a fresh subagent per task, review between tasks, fastest for this multi-phase work.
2. **Inline Execution**: execute tasks in this session using `superpowers:executing-plans`, with checkpoint reviews at each phase gate.

Do not begin implementation until the user chooses an execution mode.
