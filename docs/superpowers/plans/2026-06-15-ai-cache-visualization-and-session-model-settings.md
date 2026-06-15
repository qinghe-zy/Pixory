# AI Cache Visualization And Session Model Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build AI token/cache-hit visualization in AI Workbench and session settings, and extend session settings so provider/model/base URL/API key overrides affect only the current chat thread.

**Architecture:** Add a small local analytics module that parses existing `promptSnapshotJson.cacheObservation` records into safe aggregate usage data, then expose it through repository/service helpers to the two React Native screens. Extend thread-level model configuration with optional session-only endpoint/key override metadata, storing API key plaintext only in SecureStore and keeping global provider defaults unchanged.

**Tech Stack:** Expo, React Native, TypeScript, SQLite via `expo-sqlite`, SecureStore via `expo-secure-store`, Node test runner policy/unit tests.

---

## Files And Responsibilities

- Create `src/ai/aiUsageAnalytics.ts`
  - Parse prompt snapshot JSON safely.
  - Normalize token numbers into aggregate usage summaries.
  - Produce provider/model distribution and recent-round rows.
  - Never return prompt text, chat text, raw usage JSON, or hashes.

- Modify `src/database/repositories/aiThreadRepository.ts`
  - Add narrow query helpers for usage observations:
    - recent assistant usage messages for a space/time window.
    - recent assistant usage messages for one thread.
  - Add thread fields for session-only endpoint/key override metadata after schema migration.

- Modify `src/database/schema.ts` and `src/database/db.ts`
  - Add database version `38`.
  - Add nullable `sessionBaseUrl` and `sessionApiKeyRef` columns to `ai_threads`.
  - Wire `MIGRATION_STATEMENTS_V38` into migration flow.

- Modify `src/ai/types.ts`
  - Add `sessionBaseUrl` and `sessionApiKeyRef` to `AiThreadRecord`.

- Modify `src/ai/secureAiSettingsService.ts`
  - Add SecureStore helpers for per-thread session API key overrides:
    - set, get, delete, has.
  - Key must be derived from `space`, `threadId`, and `providerId`, not from display text.

- Modify `src/ai/aiChatService.ts`
  - Expose `loadAiUsageOverview`, `loadThreadAiUsageOverview`, and session model override helpers.
  - Resolve thread model with session base URL/key override without mutating the provider record in SQLite.
  - Preserve current in-flight behavior: new settings apply to the next generation only.

- Modify `src/screens/AiProviderSettingsScreen.tsx`
  - Add AI Workbench/global settings usage overview section.
  - Use compact metric cells and token bars.
  - Keep labels short; no diagnostic explanations.

- Modify `src/screens/AiSessionConfigScreen.tsx`
  - Add current-thread usage section.
  - Extend current session model UI to support base URL and session key override where allowed.
  - Keep global default navigation, but do not require global settings for current-thread override.

- Create `tests/ai-usage-analytics-unit.test.cjs`
  - Unit-test analytics functions by importing compiled-safe CommonJS-compatible patterns if current test setup supports it, or by policy-testing source literals plus isolated JS fixture functions if direct TS import is not available.

- Modify `tests/ai-final-acceptance-policy.test.cjs`
  - Add policy coverage that session overrides do not mutate global defaults and SecureStore is used for session keys.

- Modify or create `tests/ai-cache-visualization-policy.test.cjs`
  - Add policy coverage for UI placement, no diagnostic text, token bars, and no raw prompt/hash display.

---

## Task 1: Analytics Core Tests And Parser

**Files:**
- Create: `src/ai/aiUsageAnalytics.ts`
- Create: `tests/ai-usage-analytics-unit.test.cjs`

- [ ] **Step 1: Write failing unit tests for usage aggregation**

Create `tests/ai-usage-analytics-unit.test.cjs` with source-based tests that execute a local copy of the intended cases if direct TS import is unavailable. Keep the assertions exact enough to catch the known Anthropic denominator trap.

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/ai/aiUsageAnalytics.ts'), 'utf8');

test('AI usage analytics source defines safe aggregate contracts', () => {
  assert.match(source, /export interface AiUsageAggregate/);
  assert.match(source, /export function aggregateAiUsageObservations/);
  assert.match(source, /totalPromptTokens/);
  assert.match(source, /cachedInputTokens/);
  assert.doesNotMatch(source, /content:/);
  assert.doesNotMatch(source, /promptText|memoryText|retrievedContext|stablePrefixHash|stableCoreHash/);
});

test('AI usage analytics clamps cached ratio and uses total prompt tokens', () => {
  assert.match(source, /Math\.min\(1,\s*Math\.max\(0,/);
  assert.match(source, /cachedInputTokens \/ totalPromptTokens/);
  assert.doesNotMatch(source, /cachedInputTokens \/ promptTokens/);
});

test('AI usage analytics skips malformed prompt snapshots safely', () => {
  assert.match(source, /try\s*{/);
  assert.match(source, /catch/);
  assert.match(source, /return null/);
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```powershell
node --test tests/ai-usage-analytics-unit.test.cjs
```

Expected: FAIL because `src/ai/aiUsageAnalytics.ts` does not exist yet.

- [ ] **Step 3: Implement analytics types and pure aggregation**

Create `src/ai/aiUsageAnalytics.ts`:

```ts
export interface AiUsageObservationSource {
  id: string;
  threadId: string;
  providerId: string | null;
  modelId: string | null;
  promptSnapshotJson: string;
  createdAt: string;
  completedAt: string | null;
}

export interface AiUsageRound {
  id: string;
  providerId: string;
  modelId: string;
  createdAt: string;
  totalPromptTokens: number;
  completionTokens: number;
  cachedInputTokens: number;
  nonCachedInputTokens: number;
  totalTokens: number;
  cachedTokenRatio: number;
}

export interface AiUsageModelBreakdown {
  key: string;
  providerId: string;
  modelId: string;
  totalPromptTokens: number;
  completionTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  requestCount: number;
}

export interface AiUsageAggregate {
  requestCount: number;
  observedRequestCount: number;
  totalPromptTokens: number;
  completionTokens: number;
  cachedInputTokens: number;
  nonCachedInputTokens: number;
  totalTokens: number;
  cachedTokenRatio: number;
  modelBreakdown: AiUsageModelBreakdown[];
  recentRounds: AiUsageRound[];
}

interface CacheObservationUsage {
  totalPromptTokens?: unknown;
  promptTokens?: unknown;
  completionTokens?: unknown;
  cachedInputTokens?: unknown;
  cacheCreationInputTokens?: unknown;
  cacheReadInputTokens?: unknown;
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function readUsageFromPromptSnapshot(promptSnapshotJson: string): CacheObservationUsage | null {
  try {
    const parsed = JSON.parse(promptSnapshotJson || '{}') as { cacheObservation?: { usage?: CacheObservationUsage } };
    return parsed.cacheObservation?.usage && typeof parsed.cacheObservation.usage === 'object'
      ? parsed.cacheObservation.usage
      : null;
  } catch {
    return null;
  }
}

export function aggregateAiUsageObservations(input: {
  observations: AiUsageObservationSource[];
  recentLimit?: number;
}): AiUsageAggregate {
  const recentLimit = input.recentLimit ?? 12;
  const rounds: AiUsageRound[] = [];
  const breakdown = new Map<string, AiUsageModelBreakdown>();

  for (const observation of input.observations) {
    const usage = readUsageFromPromptSnapshot(observation.promptSnapshotJson);
    if (!usage) {
      continue;
    }

    const totalPromptTokens = finiteNumber(usage.totalPromptTokens);
    const completionTokens = finiteNumber(usage.completionTokens);
    const cachedInputTokens = Math.min(finiteNumber(usage.cachedInputTokens), totalPromptTokens);
    const nonCachedInputTokens = Math.max(totalPromptTokens - cachedInputTokens, 0);
    const totalTokens = totalPromptTokens + completionTokens;
    const providerId = observation.providerId || 'Unknown';
    const modelId = observation.modelId || 'Unknown';
    const round: AiUsageRound = {
      cachedInputTokens,
      cachedTokenRatio: totalPromptTokens > 0 ? clampRatio(cachedInputTokens / totalPromptTokens) : 0,
      completionTokens,
      createdAt: observation.completedAt ?? observation.createdAt,
      id: observation.id,
      modelId,
      nonCachedInputTokens,
      providerId,
      totalPromptTokens,
      totalTokens,
    };
    rounds.push(round);

    const key = `${providerId}:${modelId}`;
    const current = breakdown.get(key) ?? {
      cachedInputTokens: 0,
      completionTokens: 0,
      key,
      modelId,
      providerId,
      requestCount: 0,
      totalPromptTokens: 0,
      totalTokens: 0,
    };
    current.cachedInputTokens += cachedInputTokens;
    current.completionTokens += completionTokens;
    current.requestCount += 1;
    current.totalPromptTokens += totalPromptTokens;
    current.totalTokens += totalTokens;
    breakdown.set(key, current);
  }

  const totalPromptTokens = rounds.reduce((sum, round) => sum + round.totalPromptTokens, 0);
  const completionTokens = rounds.reduce((sum, round) => sum + round.completionTokens, 0);
  const cachedInputTokens = rounds.reduce((sum, round) => sum + round.cachedInputTokens, 0);
  const totalTokens = totalPromptTokens + completionTokens;

  return {
    cachedInputTokens,
    cachedTokenRatio: totalPromptTokens > 0 ? clampRatio(cachedInputTokens / totalPromptTokens) : 0,
    completionTokens,
    modelBreakdown: Array.from(breakdown.values()).sort((left, right) => right.totalTokens - left.totalTokens),
    nonCachedInputTokens: Math.max(totalPromptTokens - cachedInputTokens, 0),
    observedRequestCount: rounds.length,
    recentRounds: rounds.slice(-recentLimit).reverse(),
    requestCount: input.observations.length,
    totalPromptTokens,
    totalTokens,
  };
}
```

- [ ] **Step 4: Run analytics test**

Run:

```powershell
node --test tests/ai-usage-analytics-unit.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit analytics core**

```powershell
git add src/ai/aiUsageAnalytics.ts tests/ai-usage-analytics-unit.test.cjs
git commit -m "feat: add ai usage analytics aggregation"
```

---

## Task 2: Repository Queries And Service Loaders

**Files:**
- Modify: `src/database/repositories/aiThreadRepository.ts`
- Modify: `src/ai/aiChatService.ts`
- Modify: `tests/ai-cache-visualization-policy.test.cjs`

- [ ] **Step 1: Write failing policy tests for scoped usage loading**

Create or update `tests/ai-cache-visualization-policy.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('AI usage overview loads only scoped assistant observations', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const service = read('src/ai/aiChatService.ts');

  assert.match(repository, /listAssistantUsageObservationMessages/);
  assert.match(repository, /ai_threads\.space = \?/);
  assert.match(repository, /ai_messages\.role = 'assistant'/);
  assert.match(repository, /ai_messages\.promptSnapshotJson <> '\{\}'/);
  assert.match(service, /loadAiUsageOverview/);
  assert.match(service, /aggregateAiUsageObservations/);
});

test('thread AI usage overview checks thread belongs to current space', () => {
  const service = read('src/ai/aiChatService.ts');
  assert.match(service, /loadThreadAiUsageOverview/);
  assert.match(service, /thread\.space !== space/);
  assert.match(service, /return emptyAiUsageAggregate/);
});
```

- [ ] **Step 2: Run policy test and verify it fails**

Run:

```powershell
node --test tests/ai-cache-visualization-policy.test.cjs
```

Expected: FAIL because repository/service helpers do not exist yet.

- [ ] **Step 3: Add repository helper for usage observation rows**

In `src/database/repositories/aiThreadRepository.ts`, add this interface near `AiMessageRecord`:

```ts
export interface AiUsageObservationMessageRecord {
  id: string;
  threadId: string;
  providerId: string | null;
  modelId: string | null;
  promptSnapshotJson: string;
  createdAt: string;
  completedAt: string | null;
}
```

Add methods inside `aiThreadRepository`:

```ts
  async listAssistantUsageObservationMessages(
    db: SQLiteDatabase,
    input: { space: PixorySpace; since?: string | null; limit?: number }
  ): Promise<AiUsageObservationMessageRecord[]> {
    const limit = input.limit ?? 500;
    const sinceClause = input.since ? 'AND ai_messages.createdAt >= ?' : '';
    const values: Array<string | number> = input.since ? [input.space, input.since, limit] : [input.space, limit];
    return db.getAllAsync<AiUsageObservationMessageRecord>(
      `SELECT
         ai_messages.id,
         ai_messages.threadId,
         ai_messages.providerId,
         ai_messages.modelId,
         ai_messages.promptSnapshotJson,
         ai_messages.createdAt,
         ai_messages.completedAt
       FROM ai_messages
       JOIN ai_threads ON ai_threads.id = ai_messages.threadId
       WHERE ai_threads.space = ?
         AND ai_messages.role = 'assistant'
         AND ai_messages.promptSnapshotJson <> '{}'
         ${sinceClause}
       ORDER BY ai_messages.createdAt DESC, ai_messages.rowid DESC
       LIMIT ?`,
      ...values
    );
  },

  async listThreadAssistantUsageObservationMessages(
    db: SQLiteDatabase,
    input: { space: PixorySpace; threadId: string; limit?: number }
  ): Promise<AiUsageObservationMessageRecord[]> {
    const limit = input.limit ?? 80;
    return db.getAllAsync<AiUsageObservationMessageRecord>(
      `SELECT
         ai_messages.id,
         ai_messages.threadId,
         ai_messages.providerId,
         ai_messages.modelId,
         ai_messages.promptSnapshotJson,
         ai_messages.createdAt,
         ai_messages.completedAt
       FROM ai_messages
       JOIN ai_threads ON ai_threads.id = ai_messages.threadId
       WHERE ai_threads.space = ?
         AND ai_messages.threadId = ?
         AND ai_messages.role = 'assistant'
         AND ai_messages.promptSnapshotJson <> '{}'
       ORDER BY ai_messages.createdAt DESC, ai_messages.rowid DESC
       LIMIT ?`,
      input.space,
      input.threadId,
      limit
    );
  },
```

- [ ] **Step 4: Add service loaders**

In `src/ai/aiChatService.ts`, import analytics:

```ts
import {
  aggregateAiUsageObservations,
  type AiUsageAggregate,
} from './aiUsageAnalytics';
```

Add helper functions near session config loaders:

```ts
function emptyAiUsageAggregate(): AiUsageAggregate {
  return aggregateAiUsageObservations({ observations: [] });
}

function usageSinceForWindow(window: '7d' | '30d' | 'all'): string | null {
  if (window === 'all') {
    return null;
  }
  const days = window === '7d' ? 7 : 30;
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

export async function loadAiUsageOverview(
  space: PixorySpace,
  window: '7d' | '30d' | 'all' = '30d'
): Promise<AiUsageAggregate> {
  return runWithDatabaseSpace(space, async (db) => {
    const rows = await aiThreadRepository.listAssistantUsageObservationMessages(db, {
      limit: 600,
      since: usageSinceForWindow(window),
      space,
    });
    return aggregateAiUsageObservations({ observations: rows, recentLimit: 10 });
  });
}

export async function loadThreadAiUsageOverview(space: PixorySpace, threadId: string): Promise<AiUsageAggregate> {
  return runWithDatabaseSpace(space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, threadId);
    if (!thread || thread.space !== space) {
      return emptyAiUsageAggregate();
    }
    const rows = await aiThreadRepository.listThreadAssistantUsageObservationMessages(db, {
      limit: 80,
      space,
      threadId,
    });
    return aggregateAiUsageObservations({ observations: rows, recentLimit: 12 });
  });
}
```

- [ ] **Step 5: Run focused policy and typecheck**

Run:

```powershell
node --test tests/ai-cache-visualization-policy.test.cjs
pnpm.cmd typecheck
```

Expected: both PASS.

- [ ] **Step 6: Commit repository/service loaders**

```powershell
git add src/database/repositories/aiThreadRepository.ts src/ai/aiChatService.ts tests/ai-cache-visualization-policy.test.cjs
git commit -m "feat: load scoped ai usage overview"
```

---

## Task 3: Shared Usage UI Components

**Files:**
- Create: `src/components/ai/AiUsageSummary.tsx`
- Modify: `tests/ai-cache-visualization-policy.test.cjs`

- [ ] **Step 1: Add failing UI policy tests**

Append to `tests/ai-cache-visualization-policy.test.cjs`:

```js
test('AI usage visualization uses compact token bars without diagnostic fields', () => {
  const component = read('src/components/ai/AiUsageSummary.tsx');

  assert.match(component, /AiUsageSummary/);
  assert.match(component, /AiTokenStackBar/);
  assert.match(component, /总量|Total/);
  assert.match(component, /命中率|Hit Rate/);
  assert.doesNotMatch(component, /TTL|miss|stablePrefix|stableCore|hash|diagnostic|诊断|解释/);
  assert.doesNotMatch(component, /promptSnapshotJson|cacheObservation|rawUsage/);
});
```

- [ ] **Step 2: Run policy test and verify it fails**

Run:

```powershell
node --test tests/ai-cache-visualization-policy.test.cjs
```

Expected: FAIL because `AiUsageSummary.tsx` does not exist yet.

- [ ] **Step 3: Create compact usage visualization component**

Create `src/components/ai/AiUsageSummary.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';

import type { AiUsageAggregate, AiUsageRound } from '../../ai/aiUsageAnalytics';
import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiUsageSummaryProps {
  usage: AiUsageAggregate;
  recentTitle?: string;
  showRecent?: boolean;
}

function formatTokenCount(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return String(Math.round(value));
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function AiTokenStackBar({
  cached,
  input,
  output,
}: {
  cached: number;
  input: number;
  output: number;
}) {
  const total = Math.max(cached + input + output, 1);
  return (
    <View style={styles.tokenBarTrack}>
      <View style={[styles.tokenBarSegment, styles.cachedSegment, { flex: Math.max(cached / total, 0.02) }]} />
      <View style={[styles.tokenBarSegment, styles.inputSegment, { flex: Math.max(input / total, 0.02) }]} />
      <View style={[styles.tokenBarSegment, styles.outputSegment, { flex: Math.max(output / total, 0.02) }]} />
    </View>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCell}>
      <Text numberOfLines={1} style={styles.metricValue}>{value}</Text>
      <Text numberOfLines={1} style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function RecentRoundRow({ round }: { round: AiUsageRound }) {
  return (
    <View style={styles.roundRow}>
      <View style={styles.roundCopy}>
        <Text numberOfLines={1} style={styles.roundTitle}>{round.providerId} · {round.modelId}</Text>
        <Text numberOfLines={1} style={styles.roundMeta}>{formatTokenCount(round.totalTokens)}</Text>
      </View>
      <AiTokenStackBar
        cached={round.cachedInputTokens}
        input={round.nonCachedInputTokens}
        output={round.completionTokens}
      />
    </View>
  );
}

export function AiUsageSummary({ recentTitle = '最近', showRecent = true, usage }: AiUsageSummaryProps) {
  return (
    <View style={styles.container}>
      <View style={styles.metricGrid}>
        <MetricCell label="总量" value={formatTokenCount(usage.totalTokens)} />
        <MetricCell label="缓存" value={formatTokenCount(usage.cachedInputTokens)} />
        <MetricCell label="命中率" value={formatPercent(usage.cachedTokenRatio)} />
        <MetricCell label="请求" value={String(usage.observedRequestCount)} />
      </View>

      <AiTokenStackBar
        cached={usage.cachedInputTokens}
        input={usage.nonCachedInputTokens}
        output={usage.completionTokens}
      />

      <View style={styles.legend}>
        <Text style={styles.legendText}>缓存</Text>
        <Text style={styles.legendText}>输入</Text>
        <Text style={styles.legendText}>输出</Text>
      </View>

      {showRecent ? (
        <View style={styles.recentList}>
          <Text style={styles.sectionLabel}>{recentTitle}</Text>
          {usage.recentRounds.length > 0 ? (
            usage.recentRounds.map((round) => <RecentRoundRow key={round.id} round={round} />)
          ) : (
            <Text style={styles.emptyText}>暂无数据</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cachedSegment: {
    backgroundColor: aiLightColors.coral,
  },
  container: {
    gap: rhythm.compactGridGap,
  },
  emptyText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  inputSegment: {
    backgroundColor: aiLightColors.mist,
  },
  legend: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  legendText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  metricCell: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minWidth: 68,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  metricLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  metricValue: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  outputSegment: {
    backgroundColor: aiLightColors.inkSoft,
  },
  recentList: {
    gap: rhythm.compactGridGap,
  },
  roundCopy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  roundMeta: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  roundRow: {
    gap: rhythm.microGap,
  },
  roundTitle: {
    ...typography.textStyles.captionStrong,
    color: aiLightColors.ink,
  },
  sectionLabel: {
    ...typography.textStyles.captionStrong,
    color: aiLightColors.muted,
  },
  tokenBarSegment: {
    minWidth: 2,
  },
  tokenBarTrack: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 8,
    overflow: 'hidden',
  },
});
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```powershell
node --test tests/ai-cache-visualization-policy.test.cjs
pnpm.cmd typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit usage UI component**

```powershell
git add src/components/ai/AiUsageSummary.tsx tests/ai-cache-visualization-policy.test.cjs
git commit -m "feat: add ai usage summary component"
```

---

## Task 4: AI Workbench Usage Overview

**Files:**
- Modify: `src/screens/AiProviderSettingsScreen.tsx`
- Modify: `tests/ai-cache-visualization-policy.test.cjs`

- [ ] **Step 1: Add failing policy test for AI Workbench placement**

Append:

```js
test('AI workbench provider settings shows total usage overview', () => {
  const screen = read('src/screens/AiProviderSettingsScreen.tsx');
  assert.match(screen, /loadAiUsageOverview/);
  assert.match(screen, /AiUsageSummary/);
  assert.match(screen, /AI 用量|用量/);
  assert.doesNotMatch(screen, /TTL|stablePrefix|miss reason|诊断/);
});
```

- [ ] **Step 2: Run policy test and verify it fails**

Run:

```powershell
node --test tests/ai-cache-visualization-policy.test.cjs
```

Expected: FAIL because the screen does not load usage overview yet.

- [ ] **Step 3: Add usage state and load path**

In `src/screens/AiProviderSettingsScreen.tsx`, import:

```ts
import { loadAiUsageOverview } from '../ai/aiChatService';
import type { AiUsageAggregate } from '../ai/aiUsageAnalytics';
import { AiUsageSummary } from '../components/ai/AiUsageSummary';
```

Add state:

```ts
const [usageOverview, setUsageOverview] = useState<AiUsageAggregate | null>(null);
```

Inside `loadProviders`, add `loadAiUsageOverview(space, '30d')` to the Promise flow:

```ts
const [nextCards, defaultProviderId, usage] = await Promise.all([
  listProviderCards(space),
  getDefaultChatProviderId(space),
  loadAiUsageOverview(space, '30d'),
]);
setUsageOverview(usage);
```

Keep `await loadMaintenanceSettings();` after the provider state setup as it is today.

- [ ] **Step 4: Render compact usage card**

Near the top of the scaffold content, after the opening `<AiLightScaffold ...>` and before the global default model card, add:

```tsx
      <AiLightCard>
        <View style={styles.fieldGroup}>
          <Text style={styles.sectionTitle}>AI 用量</Text>
          <AiUsageSummary usage={usageOverview ?? {
            cachedInputTokens: 0,
            cachedTokenRatio: 0,
            completionTokens: 0,
            modelBreakdown: [],
            nonCachedInputTokens: 0,
            observedRequestCount: 0,
            recentRounds: [],
            requestCount: 0,
            totalPromptTokens: 0,
            totalTokens: 0,
          }} showRecent={false} />
        </View>
      </AiLightCard>
```

- [ ] **Step 5: Run policy, typecheck, and full tests**

Run:

```powershell
node --test tests/ai-cache-visualization-policy.test.cjs
pnpm.cmd typecheck
pnpm.cmd test
```

Expected: all PASS.

- [ ] **Step 6: Commit AI Workbench overview**

```powershell
git add src/screens/AiProviderSettingsScreen.tsx tests/ai-cache-visualization-policy.test.cjs
git commit -m "feat: show ai usage overview in workbench"
```

---

## Task 5: Session Usage Overview

**Files:**
- Modify: `src/screens/AiSessionConfigScreen.tsx`
- Modify: `tests/ai-cache-visualization-policy.test.cjs`

- [ ] **Step 1: Add failing policy test for session usage placement**

Append:

```js
test('AI session settings shows current thread usage overview', () => {
  const screen = read('src/screens/AiSessionConfigScreen.tsx');
  assert.match(screen, /loadThreadAiUsageOverview/);
  assert.match(screen, /AiUsageSummary/);
  assert.match(screen, /本会话用量/);
  assert.doesNotMatch(screen, /TTL|stablePrefix|miss reason|诊断/);
});
```

- [ ] **Step 2: Run policy test and verify it fails**

Run:

```powershell
node --test tests/ai-cache-visualization-policy.test.cjs
```

Expected: FAIL.

- [ ] **Step 3: Add state and load thread usage**

In `src/screens/AiSessionConfigScreen.tsx`, import:

```ts
import { AiUsageSummary } from '../components/ai/AiUsageSummary';
import type { AiUsageAggregate } from '../ai/aiUsageAnalytics';
```

Extend existing `aiChatService` import with:

```ts
  loadThreadAiUsageOverview,
```

Add state:

```ts
const [threadUsage, setThreadUsage] = useState<AiUsageAggregate | null>(null);
```

In `reloadConfig`, when `!threadId`, add:

```ts
setThreadUsage(null);
```

When a thread exists, after loading session model config, add:

```ts
setThreadUsage(await loadThreadAiUsageOverview(space, threadId));
```

- [ ] **Step 4: Render session usage card**

Insert after the current session model card:

```tsx
        <AiLightCard>
          <Text style={styles.sectionTitle}>本会话用量</Text>
          <AiUsageSummary usage={threadUsage ?? {
            cachedInputTokens: 0,
            cachedTokenRatio: 0,
            completionTokens: 0,
            modelBreakdown: [],
            nonCachedInputTokens: 0,
            observedRequestCount: 0,
            recentRounds: [],
            requestCount: 0,
            totalPromptTokens: 0,
            totalTokens: 0,
          }} recentTitle="最近" />
        </AiLightCard>
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```powershell
node --test tests/ai-cache-visualization-policy.test.cjs
pnpm.cmd typecheck
pnpm.cmd test
```

Expected: all PASS.

- [ ] **Step 6: Commit session usage overview**

```powershell
git add src/screens/AiSessionConfigScreen.tsx tests/ai-cache-visualization-policy.test.cjs
git commit -m "feat: show ai usage in session settings"
```

---

## Task 6: Schema For Session Endpoint/Key Overrides

**Files:**
- Modify: `src/database/schema.ts`
- Modify: `src/database/db.ts`
- Modify: `src/ai/types.ts`
- Modify: `src/database/repositories/aiThreadRepository.ts`
- Modify: `tests/ai-final-acceptance-policy.test.cjs`

- [ ] **Step 1: Add failing policy test for session override schema**

Append to `tests/ai-final-acceptance-policy.test.cjs`:

```js
test('AI thread session endpoint overrides are thread scoped and do not store key plaintext', () => {
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');
  const types = read('src/ai/types.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(schema, /DATABASE_VERSION = 38/);
  assert.match(schema, /MIGRATION_STATEMENTS_V38/);
  assert.match(schema, /sessionBaseUrl TEXT/);
  assert.match(schema, /sessionApiKeyRef TEXT/);
  assert.doesNotMatch(schema, /sessionApiKey TEXT/);
  assert.match(db, /MIGRATION_STATEMENTS_V38/);
  assert.match(types, /sessionBaseUrl: string \| null/);
  assert.match(types, /sessionApiKeyRef: string \| null/);
  assert.match(repository, /sessionBaseUrl: patch\.sessionBaseUrl/);
  assert.match(repository, /sessionApiKeyRef: patch\.sessionApiKeyRef/);
});
```

- [ ] **Step 2: Run policy test and verify it fails**

Run:

```powershell
node --test tests/ai-final-acceptance-policy.test.cjs
```

Expected: FAIL.

- [ ] **Step 3: Add schema migration**

In `src/database/schema.ts`:

```ts
export const DATABASE_VERSION = 38;
```

Add columns to the base `ai_threads` table:

```sql
  sessionBaseUrl TEXT,
  sessionApiKeyRef TEXT,
```

Add migration:

```ts
export const MIGRATION_STATEMENTS_V38 = `
ALTER TABLE ai_threads ADD COLUMN sessionBaseUrl TEXT;
ALTER TABLE ai_threads ADD COLUMN sessionApiKeyRef TEXT;
`;
```

In `src/database/db.ts`, import `MIGRATION_STATEMENTS_V38` and add after V37:

```ts
    if (currentVersion < 38) {
      await database.execAsync(MIGRATION_STATEMENTS_V38);
    }
```

- [ ] **Step 4: Update thread types and repository mapping**

In `src/ai/types.ts`, add to `AiThreadRecord`:

```ts
  sessionBaseUrl: string | null;
  sessionApiKeyRef: string | null;
```

In `src/database/repositories/aiThreadRepository.ts`:

Add fields to `CreateAiThreadInput`:

```ts
  sessionBaseUrl?: string | null;
  sessionApiKeyRef?: string | null;
```

Add fields to `UpdateAiThreadPatch` pick list:

```ts
    | 'sessionBaseUrl'
    | 'sessionApiKeyRef'
```

Add mapping in `mapThreadRow`:

```ts
    sessionApiKeyRef: row.sessionApiKeyRef ?? null,
    sessionBaseUrl: row.sessionBaseUrl ?? null,
```

Add insert columns/values in `createThread`:

```ts
        sessionBaseUrl,
        sessionApiKeyRef,
```

with values:

```ts
      input.sessionBaseUrl ?? null,
      input.sessionApiKeyRef ?? null,
```

Add update statement entries:

```ts
      sessionApiKeyRef: patch.sessionApiKeyRef,
      sessionBaseUrl: patch.sessionBaseUrl,
```

- [ ] **Step 5: Run policy and typecheck**

Run:

```powershell
node --test tests/ai-final-acceptance-policy.test.cjs
pnpm.cmd typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit schema override fields**

```powershell
git add src/database/schema.ts src/database/db.ts src/ai/types.ts src/database/repositories/aiThreadRepository.ts tests/ai-final-acceptance-policy.test.cjs
git commit -m "feat: add session ai endpoint override fields"
```

---

## Task 7: SecureStore Helpers For Session API Keys

**Files:**
- Modify: `src/ai/secureAiSettingsService.ts`
- Modify: `tests/ai-final-acceptance-policy.test.cjs`

- [ ] **Step 1: Add failing policy test**

Append:

```js
test('AI session API key overrides use SecureStore scoped by space thread and provider', () => {
  const secureSettings = read('src/ai/secureAiSettingsService.ts');
  assert.match(secureSettings, /setThreadProviderApiKey/);
  assert.match(secureSettings, /getThreadProviderApiKey/);
  assert.match(secureSettings, /deleteThreadProviderApiKey/);
  assert.match(secureSettings, /hasThreadProviderApiKey/);
  assert.match(secureSettings, /space/);
  assert.match(secureSettings, /threadId/);
  assert.match(secureSettings, /providerId/);
  assert.match(secureSettings, /SecureStore\.setItemAsync/);
  assert.match(secureSettings, /SecureStore\.deleteItemAsync/);
});
```

- [ ] **Step 2: Run policy test and verify it fails**

Run:

```powershell
node --test tests/ai-final-acceptance-policy.test.cjs
```

Expected: FAIL.

- [ ] **Step 3: Add SecureStore helpers**

In `src/ai/secureAiSettingsService.ts`:

```ts
import type { PixorySpace } from '../database';
```

Add:

```ts
function secureStoreKeyForThreadProvider(space: PixorySpace, threadId: string, providerId: string): string {
  return `pixory.ai.threadProviderKey.${space}.${threadId}.${providerId}`;
}

export function threadProviderApiKeyRef(space: PixorySpace, threadId: string, providerId: string): string {
  return `${space}:${threadId}:${providerId}`;
}

export async function setThreadProviderApiKey(
  space: PixorySpace,
  threadId: string,
  providerId: string,
  apiKey: string
): Promise<string | null> {
  const trimmed = apiKey.trim();
  const key = secureStoreKeyForThreadProvider(space, threadId, providerId);
  if (!trimmed) {
    await SecureStore.deleteItemAsync(key);
    return null;
  }
  await SecureStore.setItemAsync(key, trimmed);
  return threadProviderApiKeyRef(space, threadId, providerId);
}

export async function getThreadProviderApiKey(
  space: PixorySpace,
  threadId: string,
  providerId: string
): Promise<string | null> {
  return SecureStore.getItemAsync(secureStoreKeyForThreadProvider(space, threadId, providerId));
}

export async function deleteThreadProviderApiKey(
  space: PixorySpace,
  threadId: string,
  providerId: string
): Promise<void> {
  await SecureStore.deleteItemAsync(secureStoreKeyForThreadProvider(space, threadId, providerId));
}

export async function hasThreadProviderApiKey(
  space: PixorySpace,
  threadId: string,
  providerId: string
): Promise<boolean> {
  return Boolean(await getThreadProviderApiKey(space, threadId, providerId));
}
```

- [ ] **Step 4: Run policy and typecheck**

Run:

```powershell
node --test tests/ai-final-acceptance-policy.test.cjs
pnpm.cmd typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit SecureStore helpers**

```powershell
git add src/ai/secureAiSettingsService.ts tests/ai-final-acceptance-policy.test.cjs
git commit -m "feat: add secure session ai key helpers"
```

---

## Task 8: Session Model Override Service Resolution

**Files:**
- Modify: `src/ai/aiChatService.ts`
- Modify: `tests/ai-final-acceptance-policy.test.cjs`

- [ ] **Step 1: Add failing policy test for resolution order**

Append:

```js
test('AI session model override resolution uses thread endpoint and key before provider defaults', () => {
  const chat = read('src/ai/aiChatService.ts');
  assert.match(chat, /sessionBaseUrl/);
  assert.match(chat, /sessionApiKeyRef/);
  assert.match(chat, /getThreadProviderApiKey/);
  assert.match(chat, /provider: \{\s*\.\.\.provider,\s*baseUrl: thread\.sessionBaseUrl \?\? provider\.baseUrl/s);
  assert.match(chat, /apiKey: thread\.sessionApiKeyRef \? await getThreadProviderApiKey/);
  assert.match(chat, /saveThreadSessionModelOverride/);
  assert.match(chat, /clearThreadSessionModelOverride/);
});
```

- [ ] **Step 2: Run policy and verify it fails**

Run:

```powershell
node --test tests/ai-final-acceptance-policy.test.cjs
```

Expected: FAIL.

- [ ] **Step 3: Extend imports and resolved model config**

In `src/ai/aiChatService.ts`, update secure settings import:

```ts
import {
  deleteThreadProviderApiKey,
  getProviderApiKey,
  getThreadProviderApiKey,
  hasThreadProviderApiKey,
  setThreadProviderApiKey,
} from './secureAiSettingsService';
```

Change:

```ts
type ThreadModelConfig = Pick<AiThreadRecord, 'providerId' | 'modelId'>;
```

to:

```ts
type ThreadModelConfig = Pick<AiThreadRecord, 'id' | 'space' | 'providerId' | 'modelId' | 'sessionBaseUrl' | 'sessionApiKeyRef'>;
```

- [ ] **Step 4: Use session endpoint/key during resolution**

Inside `resolveProviderModel`, before return:

```ts
      const sessionApiKey = thread.sessionApiKeyRef
        ? await getThreadProviderApiKey(space, thread.id, provider.id)
        : null;
      const providerApiKey = await getProviderApiKey(provider.id);
```

Return:

```ts
      return {
        apiKey: sessionApiKey ?? providerApiKey,
        modelId: resolvedModel.modelId,
        provider: {
          ...provider,
          baseUrl: thread.sessionBaseUrl ?? provider.baseUrl,
        },
        source,
        status: 'ready',
      };
```

This intentionally creates an in-memory provider object for the request only. It must not call `aiProviderRepository.updateProviderBaseUrl`.

- [ ] **Step 5: Extend session model config return**

In `AiThreadSessionModelConfig`, add:

```ts
  sessionBaseUrl: string | null;
  sessionHasApiKeyOverride: boolean;
```

In `loadThreadSessionModelConfig`, return:

```ts
    sessionBaseUrl: thread.sessionBaseUrl,
    sessionHasApiKeyOverride: thread.providerId
      ? await hasThreadProviderApiKey(space, thread.id, thread.providerId)
      : false,
```

- [ ] **Step 6: Add service functions for saving and clearing override**

Add:

```ts
export async function saveThreadSessionModelOverride(input: {
  apiKey?: string | null;
  baseUrl?: string | null;
  modelId: string | null;
  providerId: string | null;
  space: PixorySpace;
  threadId: string;
}): Promise<AiThreadRecord | null> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, input.threadId);
    if (!thread || thread.space !== input.space) {
      return null;
    }
    let sessionApiKeyRef = thread.sessionApiKeyRef;
    if (input.providerId && input.apiKey !== undefined) {
      sessionApiKeyRef = await setThreadProviderApiKey(input.space, input.threadId, input.providerId, input.apiKey ?? '');
    }
    return aiThreadRepository.updateThread(db, input.threadId, {
      modelId: input.modelId,
      providerId: input.providerId,
      sessionApiKeyRef,
      sessionBaseUrl: input.baseUrl?.trim() || null,
    });
  });
}

export async function clearThreadSessionModelOverride(space: PixorySpace, threadId: string): Promise<AiThreadRecord | null> {
  return runWithDatabaseSpace(space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, threadId);
    if (!thread || thread.space !== space) {
      return null;
    }
    if (thread.providerId) {
      await deleteThreadProviderApiKey(space, threadId, thread.providerId);
    }
    return aiThreadRepository.updateThread(db, threadId, {
      modelId: null,
      providerId: null,
      sessionApiKeyRef: null,
      sessionBaseUrl: null,
    });
  });
}
```

- [ ] **Step 7: Run policy and typecheck**

Run:

```powershell
node --test tests/ai-final-acceptance-policy.test.cjs
pnpm.cmd typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit session override resolution**

```powershell
git add src/ai/aiChatService.ts tests/ai-final-acceptance-policy.test.cjs
git commit -m "feat: resolve session ai model overrides"
```

---

## Task 9: Session Settings Override UI

**Files:**
- Modify: `src/screens/AiSessionConfigScreen.tsx`
- Modify: `tests/ai-final-acceptance-policy.test.cjs`

- [ ] **Step 1: Add failing policy test for session-only UI**

Append:

```js
test('AI session settings edits only current session model endpoint and key', () => {
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');
  assert.match(sessionConfig, /saveThreadSessionModelOverride/);
  assert.match(sessionConfig, /clearThreadSessionModelOverride/);
  assert.match(sessionConfig, /sessionBaseUrlDraft/);
  assert.match(sessionConfig, /sessionApiKeyDraft/);
  assert.match(sessionConfig, /仅本会话/);
  assert.match(sessionConfig, /跟随全局默认/);
  assert.doesNotMatch(sessionConfig, /saveProviderBaseUrl\(space/);
  assert.doesNotMatch(sessionConfig, /saveProviderApiKey/);
});
```

- [ ] **Step 2: Run policy and verify it fails**

Run:

```powershell
node --test tests/ai-final-acceptance-policy.test.cjs
```

Expected: FAIL.

- [ ] **Step 3: Update imports and state**

In `src/screens/AiSessionConfigScreen.tsx`, extend service imports:

```ts
  clearThreadSessionModelOverride,
  saveThreadSessionModelOverride,
```

Add state:

```ts
const [sessionBaseUrlDraft, setSessionBaseUrlDraft] = useState('');
const [sessionApiKeyDraft, setSessionApiKeyDraft] = useState('');
```

When loading `sessionModelConfig`, set:

```ts
const modelConfig = await loadThreadSessionModelConfig(space, threadId);
setSessionModelConfig(modelConfig);
setSessionBaseUrlDraft(modelConfig?.sessionBaseUrl ?? '');
setSessionApiKeyDraft('');
```

- [ ] **Step 4: Replace model save calls with override functions**

Update `saveSessionModel`:

```ts
  async function saveSessionModel(providerId: string | null, modelId: string | null) {
    if (!threadId || savingModel) {
      return;
    }
    setSavingModel(true);
    try {
      const updated = providerId || modelId
        ? await saveThreadSessionModelOverride({
            apiKey: sessionApiKeyDraft || undefined,
            baseUrl: sessionBaseUrlDraft,
            modelId,
            providerId,
            space,
            threadId,
          })
        : await clearThreadSessionModelOverride(space, threadId);
      if (!updated) {
        throw new Error('没有找到当前会话，模型未保存。');
      }
      setModelPickerVisible(false);
      const modelConfig = await loadThreadSessionModelConfig(space, threadId);
      setSessionModelConfig(modelConfig);
      setSessionBaseUrlDraft(modelConfig?.sessionBaseUrl ?? '');
      setSessionApiKeyDraft('');
      setStatus({ message: '仅本会话已更新。', tone: 'success', title: '模型已更新' });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '模型保存失败', tone: 'error', title: '保存失败' });
    } finally {
      setSavingModel(false);
    }
  }
```

- [ ] **Step 5: Add base URL/key fields to model dialog**

Inside model picker dialog, before the options list, add:

```tsx
          <View style={styles.modelOverrideFields}>
            <Text style={styles.caption}>仅本会话</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!savingModel}
              onChangeText={setSessionBaseUrlDraft}
              placeholder="地址"
              placeholderTextColor={aiLightColors.mutedSoft}
              selectionColor={aiLightColors.coral}
              style={styles.dialogInput}
              value={sessionBaseUrlDraft}
            />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!savingModel}
              onChangeText={setSessionApiKeyDraft}
              placeholder={sessionModelConfig?.sessionHasApiKeyOverride ? '已保存本会话 API' : 'API'}
              placeholderTextColor={aiLightColors.mutedSoft}
              secureTextEntry
              selectionColor={aiLightColors.coral}
              style={styles.dialogInput}
              value={sessionApiKeyDraft}
            />
          </View>
```

Add style:

```ts
  modelOverrideFields: {
    gap: rhythm.compactGridGap,
  },
```

If implementation discovers provider type is needed to hide base URL for official providers, extend `AiSessionModelOption` with provider protocol/type and hide the field unless selected provider is `openai_compatible` or `custom`. Do not show a nonfunctional field.

- [ ] **Step 6: Run policy, typecheck, and full tests**

Run:

```powershell
node --test tests/ai-final-acceptance-policy.test.cjs
pnpm.cmd typecheck
pnpm.cmd test
```

Expected: all PASS.

- [ ] **Step 7: Commit session override UI**

```powershell
git add src/screens/AiSessionConfigScreen.tsx tests/ai-final-acceptance-policy.test.cjs
git commit -m "feat: edit session ai model overrides"
```

---

## Task 10: Final Review And Verification

**Files:**
- All changed files from prior tasks.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
node --test tests/ai-usage-analytics-unit.test.cjs tests/ai-cache-visualization-policy.test.cjs tests/ai-final-acceptance-policy.test.cjs
```

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run:

```powershell
pnpm.cmd typecheck
pnpm.cmd test
git diff --check
```

Expected: PASS.

- [ ] **Step 3: Manual code review checklist**

Inspect the final diff and verify:

- `sessionApiKey` plaintext does not appear in SQLite schema, repository records, or UI persisted state.
- `saveProviderApiKey`, `saveProviderBaseUrl`, and `saveProviderDefaultModels` are not called from session settings override save flow.
- `loadAiUsageOverview` uses `space` in repository SQL joins.
- `loadThreadAiUsageOverview` checks `thread.space !== space`.
- `aggregateAiUsageObservations` never reads message content.
- `cachedTokenRatio` is based on `totalPromptTokens`, not `promptTokens`.
- Token bar segments have stable dimensions for zero/tiny/large values.
- No UI text contains `TTL`, `hash`, `miss reason`, `stablePrefix`, or `诊断`.

- [ ] **Step 4: Commit review fixes if needed**

If the review produces edits:

```powershell
git add <changed-files>
git commit -m "fix: harden ai usage visualization"
```

If no edits are needed, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage:
  - AI Workbench total usage: Task 4.
  - Session settings usage: Task 5.
  - Session model override without global default mutation: Tasks 6-9.
  - Secure API key storage: Tasks 6-9.
  - Privacy/no diagnostic UI: Tasks 1, 3-5, 10.
  - Anthropic denominator via normalized `totalPromptTokens`: Tasks 1 and 10.
  - Space isolation: Tasks 2 and 10.

- Intentional sequencing:
  - Usage visualization ships before risky session key override.
  - Schema/key override tasks are isolated so they can be reviewed harder.
  - UI uses existing `AiLightCard`, `AiLightScaffold`, tokens, and session config screen structure.

- Known implementation caution:
  - The exact shape of `promptSnapshotJson.cacheObservation.usage` must be checked against the current `buildPromptSnapshotJson` implementation while coding Task 1. If the stored field is named differently, update `readUsageFromPromptSnapshot` and the tests in the same task.
  - If TypeScript import into Node tests becomes worthwhile later, convert source-policy assertions into true runtime tests. The first pass keeps consistency with existing Pixory tests.

