# AI Chat Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the source-verified P0/P1 AI chat performance improvements while proving false positives, preserving Android chat stability, and turning high-risk streaming/gesture suggestions into evidence-gated follow-up work.

**Architecture:** Execute four waves. Wave 0 adds repeatable characterization and query-plan evidence. Wave 1 makes output-equivalent CPU/SQL/render fixes. Wave 2 adds bounded embedding concurrency. Wave 3 records Android evidence and either closes unproven findings or produces a new focused implementation plan; it does not mix streaming parser, layout measurement, navigation, and gesture rewrites into this change.

**Tech Stack:** Expo 54, React Native 0.81, React 19, TypeScript 5.9, Expo SQLite, Node `node:test`, `node:sqlite`, React Native Reanimated 4, React Native Gesture Handler 2, PowerShell, Android tooling.

---

## Scope and execution rules

- Start from documentation commit `06dd861` or a descendant containing the reviewed report, triage, and design.
- Use a dedicated `codex/` branch and isolated worktree. Do not alter the user's unrelated commits on `main`.
- Run JavaScript/unit work in the normal worktree. Before any Gradle task, preflight the physical path length; if native verification is needed, use a real short physical worktree such as `D:\pxperf`, not `subst`.
- Never change the Composer back to `onContentSizeChange`; the mirror-text measurement is an Android correctness workaround guarded by tests.
- Never remove the rAF `measure()` fallback from `AiMeasuredStreamBlock` without the Wave 3 Android gate.
- Do not implement automatic generation abort on zero subscribers. Background/recoverable generation is a product decision outside this plan.
- Do not implement P2/P3 items, embedding retries, navigation migration, Zustand migration, FlashList, FTS5, or broad animation rewrites.
- Keep commits task-scoped. Every commit body must state what changed, why, verification performed, and remaining Android limitations.

## File map

**Create:**

- `scripts/benchmark-ai-chat-performance.cjs` — non-gating local microbenchmark for token estimation and full streaming-tail reparsing.
- `tests/ai-context-budget-unit.test.cjs` — exact token-estimation and trimming equivalence tests.
- `tests/ai-knowledge-repository-performance-integration.test.cjs` — statement-count and data-integrity tests for document deletion and embedding replacement.
- `src/ai/aiBoundedConcurrency.ts` — small deterministic worker-pool helper used by embedding generation.
- `tests/ai-bounded-concurrency-unit.test.cjs` — worker-limit, ordering, and partial-failure tests.
- `docs/ai-chat-research/chat-performance-wave3-gate.md` — populated Android measurement record and go/no-go decisions.

**Modify:**

- `package.json` — expose the non-gating benchmark command.
- `tests/ai-generation-repository-integration.test.cjs` — lock in the existing `generationId` unique-index query plan.
- `src/ai/aiContextBudget.ts` — remove regex match-array allocation and repeated binary-prefix rescans.
- `tests/ai-chat-performance-hardening-policy.test.cjs` — guard KaTeX memoization and any measured message-render change.
- `src/components/ai/AiMathBlock.tsx` — memoize KaTeX compilation/HTML construction by `math`.
- `src/database/repositories/aiKnowledgeRepository.ts` — replace per-chunk/per-embedding SQL loops with set/batch operations.
- `src/ai/aiEmbeddingService.ts` — use bounded concurrency while preserving the existing result contract.
- `src/components/ai/AiMessageContent.tsx` — only apply the benchmark-confirmed rich-HTML predicate cache; component-level memo is conditional on the profiler gate.
- `src/screens/AiChatScreen.tsx` — only the independently safe `resizeHandleOpacity` native-driver change in this plan.
- `docs/feature-matrix.md` — record new performance regression coverage and the bounded manual embedding path.
- `docs/ai-chat-research/chat_performance_report_v2_triage.md` — record implemented/no-change decisions, commits, commands, and measurements.

## Reviewed finding coverage

| Finding | Plan disposition |
|---|---|
| P0-1 detached streaming rerenders | Task 11 Android gate; a reproduced issue becomes a separate focused plan |
| P0-2 dual stream measurement | Task 11 Android gate; current fallback remains by default |
| P0-3 message render work | Task 7 predicate memo; component comparator requires separate measured approval |
| P0-4 Composer sizing | Task 11 regression scenario; original `onContentSizeChange` recommendation is rejected |
| P0-5 generation lookup | Task 2 proves the existing UNIQUE auto-index and makes no production change |
| P0-6 token estimation | Task 4 exact-equivalence implementation and benchmark |
| P1-7 embedding concurrency | Tasks 8–9 bounded worker implementation; retry/backoff excluded |
| P1-8 KaTeX render work | Task 5 math-keyed compilation/document memo |
| P1-9 knowledge N+1 SQL | Task 6 set-based deletion and bounded tuple batches |
| P1-10 incremental splitter | Task 11 benchmark/Android gate; GO requires a separate parser plan |
| P1-11 drawer PanResponder | Task 11 interaction gate; GO requires a separate gesture plan |
| P1-12 JS animation ownership | Task 10 safe opacity change; pet ownership remains under Task 11 gate |

## Wave 0 — Characterization and false-positive protection

### Task 1: Establish the execution baseline

**Files:**

- No source changes.

- [ ] **Step 1: Inspect branch and preserve unrelated work**

Run:

```powershell
git status --short --branch
git log -5 --oneline --decorate
```

Expected: the branch contains `06dd861`; any unrelated changes are listed and left untouched.

- [ ] **Step 2: Run the current static and focused regression baseline**

Run:

```powershell
pnpm typecheck
node --test tests/ai-generation-repository-integration.test.cjs tests/ai-chat-streaming-tail-contract.test.cjs tests/ai-chat-streaming-tail-render-contract.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-rag-policy.test.cjs
```

Expected: typecheck exits 0 and the focused suite reports 48 passing tests. If the count changes because newer tests were added, require zero failures and record the new count.

- [ ] **Step 3: Stop on a dirty baseline failure**

If either command fails before implementation, do not edit production code. Record the failing test and determine whether it predates this plan. Continue only after the baseline cause is understood.

### Task 2: Lock in the generation-query false positive

**Files:**

- Modify: `tests/ai-generation-repository-integration.test.cjs`
- Do not modify: `src/ai/generation/aiGenerationRepository.ts`

- [ ] **Step 1: Add the query-plan characterization test**

Append this test after the space-isolation test:

```js
test('generationId lookup stays on the UNIQUE auto-index instead of scanning jobs', async () => {
  const db = new DB('normal');
  try {
    const [plan] = await db.getAllAsync(
      'EXPLAIN QUERY PLAN SELECT * FROM ai_generation_jobs WHERE generationId = ?',
      'g-normal',
    );
    assert.match(
      String(plan.detail),
      /SEARCH ai_generation_jobs USING INDEX sqlite_autoindex_ai_generation_jobs_\d+ \(generationId=\?\)/,
    );
    assert.doesNotMatch(String(plan.detail), /SCAN ai_generation_jobs/);
  } finally {
    db.close();
  }
});
```

- [ ] **Step 2: Run the characterization test**

Run:

```powershell
node --test tests/ai-generation-repository-integration.test.cjs
```

Expected: PASS without a production SQL change. This proves P0-5 is `不成立` under the current V55 schema.

- [ ] **Step 3: Commit the guard**

```powershell
git add tests/ai-generation-repository-integration.test.cjs
git commit -m "test(chat): guard indexed generation lookup" -m "What: assert the generationId query uses SQLite's UNIQUE auto-index. Why: the performance report incorrectly classified the lookup as a table scan. Verification: node --test tests/ai-generation-repository-integration.test.cjs. Limitation: query-plan naming is SQLite-specific and remains an integration guard."
```

### Task 3: Add a non-gating performance benchmark

**Files:**

- Create: `scripts/benchmark-ai-chat-performance.cjs`
- Modify: `package.json`

- [ ] **Step 1: Add the benchmark script**

Create `scripts/benchmark-ai-chat-performance.cjs` with this complete structure:

```js
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { PixelRatio: { getFontScale: () => 1 } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { estimatePromptTokens } = require(path.join(root, 'src/ai/aiContextBudget.ts'));
const { splitStreamingTextIntoBlocks } = require(path.join(root, 'src/ai/aiStreamingBlockSplitter.ts'));

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(iterations, operation) {
  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    operation();
    samples.push(performance.now() - startedAt);
  }
  return Number(median(samples).toFixed(3));
}

const mixedUnit = '中文 English 日本語 한국어 12345 🙂\n';
const prompt = mixedUnit.repeat(Math.ceil(1_048_576 / mixedUnit.length)).slice(0, 1_048_576);
const paragraphs = Array.from(
  { length: 240 },
  (_, index) => `第 ${index + 1} 段。${'streaming text '.repeat(16)}`,
);
const stream = paragraphs.join('\n\n');
const patchSizes = Array.from({ length: 200 }, (_, index) =>
  Math.ceil(((index + 1) / 200) * stream.length),
);

const result = {
  environment: {
    node: process.version,
    platform: process.platform,
  },
  splitterFullReplayMedianMs: measure(7, () => {
    for (const size of patchSizes) {
      splitStreamingTextIntoBlocks({
        bubbleWidth: 320,
        content: stream.slice(0, size),
        generationId: 'benchmark-generation',
        lane: 'content',
        messageId: 'benchmark-message',
      });
    }
  }),
  tokenEstimateMedianMs: measure(21, () => estimatePromptTokens(prompt)),
  workload: {
    patchCount: patchSizes.length,
    promptChars: prompt.length,
    streamChars: stream.length,
  },
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
```

- [ ] **Step 2: Add the package script**

Insert in `package.json` scripts:

```json
"bench:ai-chat": "node scripts/benchmark-ai-chat-performance.cjs",
```

- [ ] **Step 3: Run and preserve the baseline output**

Run:

```powershell
pnpm bench:ai-chat | Tee-Object -FilePath scratch/ai-chat-performance-before.json
```

Expected: valid JSON containing `tokenEstimateMedianMs` and `splitterFullReplayMedianMs`. The scratch result is local evidence and must not be committed.

- [ ] **Step 4: Commit the repeatable benchmark**

```powershell
git add package.json scripts/benchmark-ai-chat-performance.cjs
git commit -m "test(chat): add repeatable performance benchmark" -m "What: add non-gating token and streaming full-reparse microbenchmarks. Why: replace unsupported audit percentages with reproducible local evidence. Verification: pnpm bench:ai-chat. Limitation: Node timings are directional and do not replace Android frame measurements."
```

## Wave 1 — Safe, output-equivalent improvements

### Task 4: Remove allocation-heavy token estimation and prefix rescans

**Files:**

- Create: `tests/ai-context-budget-unit.test.cjs`
- Modify: `src/ai/aiContextBudget.ts`

- [ ] **Step 1: Write exact-equivalence tests**

Create a Node test that transpiles `aiContextBudget.ts`, defines the previous estimator as the oracle, and checks representative inputs:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const oldTs = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const budget = require(path.join(root, 'src/ai/aiContextBudget.ts'));
if (oldTs) require.extensions['.ts'] = oldTs; else delete require.extensions['.ts'];

const cjkPattern = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g;
function previousEstimate(value) {
  const cjkChars = value.match(cjkPattern)?.length ?? 0;
  const nonCjkChars = Math.max(0, value.length - cjkChars);
  return Math.max(1, Math.ceil(cjkChars * 0.8) + Math.ceil(nonCjkChars / 4));
}

test('token estimator preserves the previous multilingual contract', () => {
  const corpus = [
    '', 'plain ASCII 123', '中文上下文', '日本語テスト', '한국어 테스트',
    '中A🙂日B한C', '\ud83d\ude42\ud83d\ude42', 'a'.repeat(8193), '中文Ab'.repeat(4097),
  ];
  for (const value of corpus) {
    assert.equal(budget.estimatePromptTokens(value), previousEstimate(value), value.slice(0, 24));
  }
});

test('context fitting remains deterministic at mixed-language boundaries', () => {
  const result = budget.fitPromptBlocksToContextBudget({
    modelContextWindowTokens: 128,
    blocks: [
      { id: 'required', priority: 'required', text: '角色约束', minChars: 4 },
      { id: 'dynamic', priority: 'dynamic', text: '中A🙂日B한C'.repeat(200), minChars: 12 },
    ],
  });
  assert.equal(result.blocks[0].text, '角色约束');
  assert.equal(result.trimmed, true);
  assert.ok(result.blocks[1].text.endsWith('[已因模型上下文窗口裁剪]'));
  assert.ok(result.estimatedTokens <= 128);
});
```

- [ ] **Step 2: Run the tests and confirm they pass against the old behavior**

Run:

```powershell
node --test tests/ai-context-budget-unit.test.cjs
```

Expected: PASS. These are characterization tests; the next step changes implementation while preserving their output.

- [ ] **Step 3: Replace regex allocation with count-based helpers**

In `src/ai/aiContextBudget.ts`, replace `CJK_CHAR_PATTERN` and `estimatePromptTokens` with:

```ts
function isCjkCodeUnit(code: number): boolean {
  return (
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0xac00 && code <= 0xd7af)
  );
}

function estimatePromptTokensFromCounts(cjkChars: number, totalChars: number): number {
  const nonCjkChars = Math.max(0, totalChars - cjkChars);
  return Math.max(1, Math.ceil(cjkChars * 0.8) + Math.ceil(nonCjkChars / 4));
}

export function estimatePromptTokens(value: string): number {
  let cjkChars = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (isCjkCodeUnit(value.charCodeAt(index))) {
      cjkChars += 1;
    }
  }
  return estimatePromptTokensFromCounts(cjkChars, value.length);
}

function findMaxPrefixForTokenBudget(value: string, maxTokens: number): number {
  let cjkChars = 0;
  let acceptedLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (isCjkCodeUnit(value.charCodeAt(index))) {
      cjkChars += 1;
    }
    const length = index + 1;
    if (estimatePromptTokensFromCounts(cjkChars, length) > maxTokens) {
      break;
    }
    acceptedLength = length;
  }
  return acceptedLength;
}
```

In `trimTextToTokenBudget`, replace the `low/high/while` binary search with the following. The one-time minimum check preserves the existing `minChars` contract without repeated prefix scans:

```ts
const minimumLength = Math.min(minChars, value.length);
const minimumFits =
  minimumLength > 0 &&
  estimatePromptTokens(value.slice(0, minimumLength)) <= contentMaxTokens;
const acceptedLength = findMaxPrefixForTokenBudget(value, contentMaxTokens);
const finalLength = minimumFits
  ? Math.max(minimumLength, acceptedLength)
  : acceptedLength;
const trimmed = value.slice(0, finalLength).trimEnd();
```

Keep the empty-input branch, trim notice, and final token check. Add a regression case where `minChars` exceeds the available budget before deleting the old `minCandidate` logic.

- [ ] **Step 4: Verify correctness and benchmark direction**

Run:

```powershell
node --test tests/ai-context-budget-unit.test.cjs tests/ai-rag-policy.test.cjs tests/ai-prompt-cache-unit.test.cjs
pnpm bench:ai-chat | Tee-Object -FilePath scratch/ai-chat-performance-after-token.json
pnpm typecheck
```

Expected: all tests pass; `tokenEstimateMedianMs` is lower than the before file. Do not fail CI on wall-clock timing.

- [ ] **Step 5: Commit**

```powershell
git add src/ai/aiContextBudget.ts tests/ai-context-budget-unit.test.cjs
git commit -m "perf(ai): reduce context budget scanning" -m "What: replace match-array token counting and binary prefix rescans with exact single-pass code-unit counting. Why: reduce JS allocation and long-context blocking without changing estimates. Verification: focused context/RAG/cache tests, pnpm typecheck, local benchmark. Limitation: estimator remains heuristic rather than provider tokenization."
```

### Task 5: Memoize KaTeX compilation by math input

**Files:**

- Modify: `tests/ai-chat-performance-hardening-policy.test.cjs`
- Modify: `src/components/ai/AiMathBlock.tsx`

- [ ] **Step 1: Add the failing policy test**

Append:

```js
test('math blocks compile KaTeX and build HTML inside a math-keyed memo', () => {
  const math = read('src/components/ai/AiMathBlock.tsx');
  assert.match(math, /import \{ useMemo, useState \} from 'react'/);
  assert.match(math, /const compiled = useMemo\(\(\) => \{/);
  assert.match(math, /katex\.renderToString\(math/);
  assert.match(math, /\}, \[math\]\);/);
  assert.match(math, /if \(compiled\.error\)/);
  assert.match(math, /source=\{\{ html: compiled\.html, baseUrl: 'about:blank' \}\}/);
});
```

- [ ] **Step 2: Run and confirm failure**

```powershell
node --test tests/ai-chat-performance-hardening-policy.test.cjs
```

Expected: FAIL because `AiMathBlock` currently calls KaTeX in the render body.

- [ ] **Step 3: Move compilation and document construction into `useMemo`**

Change the import and component body to this shape:

```ts
import { useMemo, useState } from 'react';

const compiled = useMemo(() => {
  try {
    const mathHtml = katex.renderToString(math, {
      displayMode: true,
      output: 'htmlAndMathml',
      throwOnError: true,
      trust: false,
    });
    return { error: false as const, html: buildMathHtmlDocument(mathHtml) };
  } catch {
    return { error: true as const, html: '' };
  }
}, [math]);

if (compiled.error) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorLabel}>公式无法渲染</Text>
      <Text numberOfLines={2} style={styles.errorText}>{math}</Text>
    </View>
  );
}
```

Move the existing HTML template unchanged into this helper:

```ts
function buildMathHtmlDocument(mathHtml: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
      <style>
        * { box-sizing: border-box; }
        ${KATEX_CORE_CSS}
        html, body {
          margin: 0;
          padding: 0;
          background: transparent;
          color: ${escapeHtml(aiLightColors.ink)};
          font-family: serif;
          overflow: hidden;
          -webkit-text-size-adjust: 100%;
        }
        body {
          padding: ${spacing[3]}px;
        }
        #math-container {
          max-width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          text-align: center;
          -webkit-overflow-scrolling: touch;
        }
        .katex-display {
          margin: 0;
          max-width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
        }
        .katex {
          display: inline-block;
          max-width: 100%;
          font-size: 1.08em;
          line-height: 1.35;
          text-rendering: optimizeLegibility;
        }
        .katex-html {
          white-space: nowrap;
        }
        .katex-mathml {
          position: absolute;
          clip: rect(1px, 1px, 1px, 1px);
          padding: 0;
          border: 0;
          height: 1px;
          width: 1px;
          overflow: hidden;
        }
      </style>
    </head>
    <body>
      <div id="math-container">${mathHtml}</div>
      <script>
        const container = document.getElementById('math-container');
        window.ReactNativeWebView.postMessage(Math.ceil(container.getBoundingClientRect().height));
      </script>
    </body>
    </html>
  `;
}
```

Use `compiled.html` in the WebView source. Do not alter WebView security props, height clamping, CSS, or error copy.

- [ ] **Step 4: Verify**

```powershell
node --test tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
pnpm typecheck
```

Expected: PASS. Manual Android check later must trigger multiple WebView `onMessage` height updates without visual formula reset.

- [ ] **Step 5: Commit**

```powershell
git add src/components/ai/AiMathBlock.tsx tests/ai-chat-performance-hardening-policy.test.cjs
git commit -m "perf(chat): memoize math document compilation" -m "What: compile KaTeX and assemble its WebView document once per math input. Why: WebView height updates should not rebuild the KaTeX AST. Verification: focused chat policy tests and pnpm typecheck. Limitation: final WebView behavior still requires Android smoke verification."
```

### Task 6: Replace knowledge-document N+1 operations

**Files:**

- Create: `tests/ai-knowledge-repository-performance-integration.test.cjs`
- Modify: `src/database/repositories/aiKnowledgeRepository.ts`

- [ ] **Step 1: Write the failing integration fixtures**

Create the integration test with this loader and counted DB fixture:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');

function loadRepository() {
  const filename = path.join(root, 'src/database/repositories/aiKnowledgeRepository.ts');
  const oldTs = require.extensions['.ts'];
  require.extensions['.ts'] = (module, sourcePath) => {
    module._compile(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    }).outputText, sourcePath);
  };
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename).aiKnowledgeRepository;
  } finally {
    if (oldTs) require.extensions['.ts'] = oldTs;
    else delete require.extensions['.ts'];
  }
}

class CountedDB {
  constructor(space) {
    this.space = space;
    this.runStatements = 0;
    this.db = new DatabaseSync(':memory:');
    this.db.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE ai_documents(id TEXT PRIMARY KEY, space TEXT NOT NULL);
      CREATE TABLE ai_chunks(
        id TEXT PRIMARY KEY,
        documentId TEXT NOT NULL,
        FOREIGN KEY(documentId) REFERENCES ai_documents(id) ON DELETE CASCADE
      );
      CREATE TABLE ai_embeddings(
        id TEXT PRIMARY KEY,
        chunkId TEXT NOT NULL,
        providerId TEXT NOT NULL,
        modelId TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        vectorJson TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY(chunkId) REFERENCES ai_chunks(id) ON DELETE CASCADE
      );
      CREATE TABLE ai_messages(id TEXT PRIMARY KEY);
      CREATE TABLE ai_message_citations(
        id TEXT PRIMARY KEY,
        messageId TEXT NOT NULL,
        sourceType TEXT NOT NULL,
        sourceId TEXT NOT NULL,
        FOREIGN KEY(messageId) REFERENCES ai_messages(id) ON DELETE CASCADE
      );
      INSERT INTO ai_messages(id) VALUES('message-1');
    `);
  }
  async runAsync(sql, ...params) {
    this.runStatements += 1;
    return this.db.prepare(sql).run(...params);
  }
  async getAllAsync(sql, ...params) {
    return this.db.prepare(sql).all(...params);
  }
  async getFirstAsync(sql, ...params) {
    return this.db.prepare(sql).get(...params) ?? null;
  }
  async withTransactionAsync(task) {
    this.db.exec('BEGIN');
    try {
      const result = await task();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  scalar(sql) {
    return Number(this.db.prepare(sql).get().value);
  }
  close() {
    this.db.close();
  }
}

function seedDocument(db, chunkCount) {
  db.db.prepare('INSERT INTO ai_documents(id, space) VALUES(?, ?)')
    .run('document-1', db.space);
  db.db.prepare(
    `INSERT INTO ai_message_citations(id, messageId, sourceType, sourceId)
     VALUES('citation-document', 'message-1', 'document_chunk', 'document-1')`,
  ).run();
  const insertChunk = db.db.prepare('INSERT INTO ai_chunks(id, documentId) VALUES(?, ?)');
  const insertEmbedding = db.db.prepare(
    `INSERT INTO ai_embeddings(
       id, chunkId, providerId, modelId, dimensions, vectorJson, createdAt
     ) VALUES(?, ?, 'provider-1', 'model-1', 2, '[1,2]', '2026-08-11T00:00:00.000Z')`,
  );
  const insertCitation = db.db.prepare(
    `INSERT INTO ai_message_citations(id, messageId, sourceType, sourceId)
     VALUES(?, 'message-1', 'document_chunk', ?)`,
  );
  for (let index = 0; index < chunkCount; index += 1) {
    const chunkId = `chunk-${index}`;
    insertChunk.run(chunkId, 'document-1');
    insertEmbedding.run(`old-embedding-${index}`, chunkId);
    insertCitation.run(`citation-${index}`, chunkId);
  }
}

function replacementRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `new-embedding-${index}`,
    chunkId: `chunk-${index}`,
    providerId: 'provider-1',
    modelId: 'model-1',
    dimensions: 2,
    vectorJson: '[9,9]',
  }));
}
```

Append the complete test bodies below. They run against both isolated spaces and use aliased scalar counts:

```js
const repository = loadRepository();
for (const space of ['normal', 'personal']) {
  test(`${space} document deletion uses a bounded statement count`, async () => {
    const db = new CountedDB(space);
    try {
      seedDocument(db, 1000);
      const beforeDeleteStatements = db.runStatements;
      const deleted = await repository.deleteDocument(db, 'document-1');
      const deleteStatements = db.runStatements - beforeDeleteStatements;
      assert.equal(deleted, 1);
      assert.ok(
        deleteStatements <= 4,
        `expected <= 4 runAsync statements, got ${deleteStatements}`,
      );
      assert.equal(db.scalar('SELECT COUNT(*) AS value FROM ai_documents'), 0);
      assert.equal(db.scalar('SELECT COUNT(*) AS value FROM ai_chunks'), 0);
      assert.equal(db.scalar('SELECT COUNT(*) AS value FROM ai_embeddings'), 0);
      assert.equal(db.scalar('SELECT COUNT(*) AS value FROM ai_message_citations'), 0);
    } finally {
      db.close();
    }
  });

  test(`${space} embedding replacement uses bounded batches`, async () => {
    const db = new CountedDB(space);
    try {
      seedDocument(db, 250);
      const replacements = replacementRows(250);
      const beforeReplaceStatements = db.runStatements;
      await db.withTransactionAsync(() => repository.replaceEmbeddings(db, replacements));
      const replaceStatements = db.runStatements - beforeReplaceStatements;
      assert.ok(
        replaceStatements <= 6,
        `expected bounded batched statements, got ${replaceStatements}`,
      );
      assert.equal(db.scalar('SELECT COUNT(*) AS value FROM ai_embeddings'), 250);
      assert.equal(
        db.scalar("SELECT COUNT(*) AS value FROM ai_embeddings WHERE vectorJson = '[9,9]'"),
        250,
      );
    } finally {
      db.close();
    }
  });
}
```

- [ ] **Step 2: Run and confirm the statement-count failures**

```powershell
node --test tests/ai-knowledge-repository-performance-integration.test.cjs
```

Expected: FAIL because current deletion runs about 2003 statements and replacement runs 500 statements.

- [ ] **Step 3: Implement set-based deletion**

Replace `deleteDocument` with the same ordered operations:

```ts
async deleteDocument(db: SQLiteDatabase, documentId: string): Promise<number> {
  await db.runAsync(
    `DELETE FROM ai_message_citations
     WHERE sourceType = 'document_chunk'
       AND (
         sourceId = ?
         OR sourceId IN (SELECT id FROM ai_chunks WHERE documentId = ?)
       )`,
    documentId,
    documentId,
  );
  await db.runAsync('DELETE FROM ai_chunks WHERE documentId = ?', documentId);
  const result = await db.runAsync('DELETE FROM ai_documents WHERE id = ?', documentId);
  return result.changes;
}
```

Rely on the existing `FOREIGN KEY (chunkId) REFERENCES ai_chunks(id) ON DELETE CASCADE`; keep `PRAGMA foreign_keys=ON` in the integration fixture.

- [ ] **Step 4: Implement bounded tuple batches for replacement**

Add:

```ts
const EMBEDDING_WRITE_BATCH_SIZE = 100;

function chunkItems<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
```

Replace the row loop with two statements per batch:

```ts
for (const batch of chunkItems(chunkEmbeddings, EMBEDDING_WRITE_BATCH_SIZE)) {
  const deleteTuples = batch.map(() => '(?, ?, ?)').join(', ');
  await db.runAsync(
    `DELETE FROM ai_embeddings
     WHERE (chunkId, providerId, modelId) IN (${deleteTuples})`,
    ...batch.flatMap((item) => [item.chunkId, item.providerId, item.modelId]),
  );

  const insertRows = batch.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
  await db.runAsync(
    `INSERT INTO ai_embeddings (
       id, chunkId, providerId, modelId, dimensions, vectorJson, createdAt
     ) VALUES ${insertRows}`,
    ...batch.flatMap((item) => [
      item.id,
      item.chunkId,
      item.providerId,
      item.modelId,
      item.dimensions,
      item.vectorJson,
      now,
    ]),
  );
}
```

The batch size keeps both 300-parameter deletes and 700-parameter inserts under the conservative 999-parameter SQLite limit.

- [ ] **Step 5: Verify data integrity and dependent RAG policy**

```powershell
node --test tests/ai-knowledge-repository-performance-integration.test.cjs tests/ai-rag-policy.test.cjs tests/managed-backup-v2.test.cjs
pnpm typecheck
```

Expected: PASS; statement counts are bounded and both spaces remain isolated.

- [ ] **Step 6: Commit**

```powershell
git add src/database/repositories/aiKnowledgeRepository.ts tests/ai-knowledge-repository-performance-integration.test.cjs
git commit -m "perf(rag): batch knowledge repository writes" -m "What: use set-based document cleanup and bounded embedding replacement batches. Why: remove per-chunk SQLite round trips while preserving cascade and space isolation. Verification: knowledge performance integration, RAG, backup tests, pnpm typecheck. Limitation: provider-side embedding calls are optimized separately."
```

### Task 7: Apply only the measured message-render micro-optimization

**Files:**

- Modify: `tests/ai-chat-performance-hardening-policy.test.cjs`
- Modify: `src/components/ai/AiMessageContent.tsx`

- [ ] **Step 1: Profile before changing component memoization**

On Android with 200 messages and a 15K-character rich message, record React commit counts for: opening the thread, toggling a non-message UI control, and detached streaming for 10 seconds.

Decision:

- If completed historical `AiMessageContent` instances do not re-render in those actions, do not add `React.memo`; update the triage row to state `component memo not reproduced`.
- If they do re-render, record the count and proceed with the comparator below.

- [ ] **Step 2: Always memoize the rich-HTML predicate by content**

Add the failing policy assertion:

```js
assert.match(
  content,
  /const renderWholeRichHtml = useMemo\(\(\) => shouldRenderWholeRichHtml\(content\), \[content\]\)/,
);
```

Then replace the render-body call with:

```ts
const renderWholeRichHtml = useMemo(
  () => shouldRenderWholeRichHtml(content),
  [content],
);
```

- [ ] **Step 3: Record component memoization as a separate decision**

Do not add a custom `React.memo` comparator in this commit. `AiMessageContent` owns copy/feedback state, and its `trailingInline` prop is a React element whose identity is intentionally refreshed by the streaming cursor call site. If Step 1 reproduced completed-message rerenders, record `GO — 单独立项` in the triage row with the measured count and create a focused comparator plan. If Step 1 did not reproduce them, record `NO-GO — 未复现`. The only production change retained by this task is the content-keyed rich-HTML predicate memo.

- [ ] **Step 4: Verify behavior**

```powershell
node --test tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs tests/ai-chat-streaming-tail-policy.test.cjs
pnpm typecheck
```

Expected: PASS. Repeat the Android profiler scenario and record the predicate-memo result without claiming that component commits were eliminated.

- [ ] **Step 5: Commit the retained change only**

```powershell
git add src/components/ai/AiMessageContent.tsx tests/ai-chat-performance-hardening-policy.test.cjs docs/ai-chat-research/chat_performance_report_v2_triage.md
git commit -m "perf(chat): cache verified message render work" -m "What: memoize the rich-HTML predicate and retain component memoization only when Android profiling proves historical rerenders. Why: avoid speculative comparator complexity. Verification: focused render/streaming tests, pnpm typecheck, populated Android profiler scenario. Limitation: Node policy tests cannot measure native text layout."
```

## Wave 2 — Bounded embedding concurrency and safe animation

### Task 8: Add a deterministic bounded worker pool

**Files:**

- Create: `src/ai/aiBoundedConcurrency.ts`
- Create: `tests/ai-bounded-concurrency-unit.test.cjs`

- [ ] **Step 1: Write failing worker-pool tests**

Create the complete test file below. It covers three contracts: active mapper calls never exceed 3, results retain input indexes despite different completion order, and one rejection does not prevent remaining items from settling.

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadModule() {
  const filename = path.join(root, 'src/ai/aiBoundedConcurrency.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', output)(module.exports, module, require);
  return module.exports;
}

test('bounded map preserves order and never exceeds the limit', async () => {
  const { settleWithConcurrency } = loadModule();
  let active = 0;
  let maxActive = 0;
  const results = await settleWithConcurrency([0, 1, 2, 3, 4, 5], 3, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, (5 - value) * 2));
    active -= 1;
    if (value === 2) throw new Error('expected failure');
    return value * 10;
  });
  assert.equal(maxActive, 3);
  assert.deepEqual(results.map((result) => result.status), [
    'fulfilled', 'fulfilled', 'rejected', 'fulfilled', 'fulfilled', 'fulfilled',
  ]);
  assert.deepEqual(
    results.map((result) => result.status === 'fulfilled' ? result.value : null),
    [0, 10, null, 30, 40, 50],
  );
});

test('bounded map rejects invalid limits before invoking the mapper', async () => {
  const { settleWithConcurrency } = loadModule();
  let calls = 0;
  await assert.rejects(
    () => settleWithConcurrency([1], 0, async () => {
      calls += 1;
      return 1;
    }),
    /positive integer/,
  );
  assert.equal(calls, 0);
});
```

- [ ] **Step 2: Run and confirm module-not-found failure**

```powershell
node --test tests/ai-bounded-concurrency-unit.test.cjs
```

Expected: FAIL because `src/ai/aiBoundedConcurrency.ts` does not exist.

- [ ] **Step 3: Implement the minimal worker pool**

```ts
export async function settleWithConcurrency<T, TResult>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<TResult>,
): Promise<PromiseSettledResult<TResult>[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('Concurrency limit must be a positive integer.');
  }
  const results = new Array<PromiseSettledResult<TResult>>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = {
          status: 'fulfilled',
          value: await mapper(items[index], index),
        };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
```

- [ ] **Step 4: Verify and commit**

```powershell
node --test tests/ai-bounded-concurrency-unit.test.cjs
pnpm typecheck
git add src/ai/aiBoundedConcurrency.ts tests/ai-bounded-concurrency-unit.test.cjs
git commit -m "test(ai): add bounded async worker pool" -m "What: add a deterministic concurrency-limited settle helper with ordering and failure tests. Why: embedding generation needs bounded parallelism without unbounded Promise.all. Verification: bounded concurrency unit test and pnpm typecheck. Limitation: retry and cancellation are intentionally out of scope."
```

### Task 9: Use bounded concurrency for missing embeddings

**Files:**

- Modify: `src/ai/aiEmbeddingService.ts`
- Modify: `tests/ai-bounded-concurrency-unit.test.cjs`
- Modify: `docs/feature-matrix.md`

- [ ] **Step 1: Extract result assembly without changing the public return type**

Add:

```ts
import { settleWithConcurrency } from './aiBoundedConcurrency';

const EMBEDDING_REQUEST_CONCURRENCY = 3;
```

Replace the serial loop with:

```ts
const settled = await settleWithConcurrency(
  chunks,
  EMBEDDING_REQUEST_CONCURRENCY,
  async (chunk) => ({
    chunk,
    vector: await adapter.embedText({
      apiKey,
      baseUrl: provider.embeddingBaseUrl ?? provider.baseUrl ?? '',
      modelId,
      text: chunk.text,
    }),
  }),
);

const embeddings: ReplaceEmbeddingInput[] = [];
let failed = 0;
for (const result of settled) {
  if (result.status === 'rejected' || result.value.vector.length === 0) {
    failed += 1;
    continue;
  }
  const { chunk, vector } = result.value;
  embeddings.push({
    id: createAiId('aiembed'),
    chunkId: chunk.id,
    providerId,
    modelId,
    dimensions: vector.length,
    vectorJson: JSON.stringify(vector),
  });
}
```

Do not add retries, AbortSignal plumbing, provider batch endpoints, new UI, or a changed return shape.

- [ ] **Step 2: Add a service policy assertion**

Extend `hybrid retrieval generates query vectors and document embeddings when configured` in `tests/ai-rag-policy.test.cjs` with:

```js
assert.match(embeddingContent, /import \{ settleWithConcurrency \} from '.\/aiBoundedConcurrency'/);
assert.match(embeddingContent, /const EMBEDDING_REQUEST_CONCURRENCY = 3/);
assert.match(
  embeddingContent,
  /settleWithConcurrency\(\s*chunks,\s*EMBEDDING_REQUEST_CONCURRENCY,/,
);
assert.doesNotMatch(
  embeddingContent,
  /for \(const chunk of chunks\)[\s\S]{0,500}await adapter\.embedText/,
);
assert.doesNotMatch(embeddingContent, /retry|backoff|AbortSignal/);
```

- [ ] **Step 3: Update feature matrix**

In the Provider or document-lifecycle row, state that manual embedding generation uses bounded concurrency of three while retries/backoff remain unimplemented P2 work. Do not claim the companion runtime automatically enables embeddings.

- [ ] **Step 4: Verify**

```powershell
node --test tests/ai-bounded-concurrency-unit.test.cjs tests/ai-rag-policy.test.cjs tests/ai-knowledge-repository-performance-integration.test.cjs
pnpm typecheck
```

Expected: PASS. A fake adapter test records `maxActive === 3`, correct chunk ids, and `failed` equal to rejected plus empty-vector results.

- [ ] **Step 5: Commit**

```powershell
git add src/ai/aiEmbeddingService.ts tests/ai-bounded-concurrency-unit.test.cjs tests/ai-rag-policy.test.cjs docs/feature-matrix.md
git commit -m "perf(rag): bound embedding request concurrency" -m "What: generate missing embeddings with three deterministic workers while preserving generated/failed semantics. Why: remove fully serial provider latency without unbounded request fan-out. Verification: bounded worker, RAG, knowledge integration tests and pnpm typecheck. Limitation: retries, cancellation, and provider batch APIs remain P2."
```

### Task 10: Make only the independently safe native-driver change

**Files:**

- Modify: `tests/ai-chat-performance-hardening-policy.test.cjs`
- Modify: `src/screens/AiChatScreen.tsx`

- [ ] **Step 1: Add a focused policy test**

Append this exact test:

```js
test('resize handle opacity is native-driven without changing pet pan ownership', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const resizeBody = /const showResizeHandle = useCallback\([\s\S]*?\n  \}, \[resizeHandleOpacity\]\);/
    .exec(chat)?.[0] ?? '';
  const nativeDriverMatches = resizeBody.match(/useNativeDriver: true/g) ?? [];
  assert.equal(nativeDriverMatches.length, 2);
  assert.doesNotMatch(resizeBody, /useNativeDriver: false/);

  const petWalkBody = /Animated\.timing\(petPan\.x, \{[\s\S]{0,180}\}\)/
    .exec(chat)?.[0] ?? '';
  assert.match(petWalkBody, /useNativeDriver: false/);
  assert.match(chat, /petPan\.x\.setValue\(gestureState\.dx\)/);
  assert.match(chat, /petPan\.addListener/);
});
```

- [ ] **Step 2: Run and confirm failure**

```powershell
node --test tests/ai-chat-performance-hardening-policy.test.cjs
```

Expected: FAIL because the two resize-handle opacity timings use `false`.

- [ ] **Step 3: Change only the two opacity timings**

```ts
Animated.timing(resizeHandleOpacity, {
  toValue: 1,
  duration: 150,
  useNativeDriver: true,
});

Animated.timing(resizeHandleOpacity, {
  toValue: 0.1,
  duration: 300,
  useNativeDriver: true,
});
```

Do not change `petPan`, `petScale`, PanResponder, listeners, or the idle walk animation in this task.

- [ ] **Step 4: Verify and commit**

```powershell
node --test tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
pnpm typecheck
git add src/screens/AiChatScreen.tsx tests/ai-chat-performance-hardening-policy.test.cjs
git commit -m "perf(chat): native-drive resize handle opacity" -m "What: move the isolated resize-handle opacity timings to the native driver. Why: remove avoidable JS animation work without mixing ownership of pet pan values. Verification: focused chat tests and pnpm typecheck. Limitation: pet gesture migration remains benchmark-gated."
```

## Wave 3 — Android go/no-go gates for high-risk work

### Task 11: Measure detached streaming, dual measurement, splitter, and drawer

**Files:**

- Create: `docs/ai-chat-research/chat-performance-wave3-gate.md`
- Modify: `docs/ai-chat-research/chat_performance_report_v2_triage.md`

- [ ] **Step 1: Prepare populated Android scenarios**

Use real local data and record device/API/RAM/build type. Exercise:

1. A 200-message thread while bottom locked during a 60-second response.
2. The same response after scrolling at least two screens into history, including reasoning expansion and return-to-latest.
3. Font scale 1.0 and 1.3 with detached promoted blocks.
4. A long response containing paragraphs, lists, code fences, tables, math, and incomplete fences.
5. Drawer open, slow drag cancel, fast swipe close, scrim close, explicit close button, recent-thread action, and Android back.
6. Composer short typing, long CJK paste, AI-help long text, send/clear, keyboard reopen.

- [ ] **Step 2: Capture existing diagnostics and benchmark output**

Run:

```powershell
pnpm bench:ai-chat | Tee-Object -FilePath scratch/ai-chat-performance-final.json
D:\Develop\Android\Sdk\platform-tools\adb.exe logcat -c
```

During the scenarios, capture logcat/performance diagnostics and a screen recording. Store disposable files under `scratch/`; do not commit recordings or logs.

- [ ] **Step 3: Write actual go/no-go decisions**

Create `chat-performance-wave3-gate.md` with the exact measured device profile, before/after Node benchmark JSON, Android observations, and one decision per finding:

- P0-1 detached top-level rendering;
- P0-2 dual measurement;
- P0-4 Composer mirror measurement;
- P1-10 incremental splitter;
- P1-11 drawer gesture;
- P1-12 pet gesture/native ownership.

Use only these terminal decisions:

- `NO-GO — 未复现`: no visible jump or repeated task over 16ms.
- `NO-GO — 收益不足`: candidate or prototype improves the primary metric by less than 20%.
- `GO — 单独立项`: reproducible issue and expected improvement at least 20%, with named correctness tests that must remain.
- `BLOCKED — 无可用 Android 设备`: no implementation is authorized; list the unverified scenario.

Do not leave unresolved markers or an empty result.

- [ ] **Step 4: Apply the decision rule**

For every `NO-GO`, update the triage row with date, device, evidence, and “no production change.”

For every `GO`, stop this plan before changing production streaming/gesture code. Create one new design/plan per independent subsystem:

- detached tail store/render identity;
- streaming splitter state machine;
- measured block single-source experiment;
- comprehensive drawer gesture migration;
- Live2D pet gesture migration.

Each new plan must preserve the contracts listed in the approved design and must not share a commit with another subsystem.

- [ ] **Step 5: Commit the gate record**

```powershell
git add docs/ai-chat-research/chat-performance-wave3-gate.md docs/ai-chat-research/chat_performance_report_v2_triage.md
git commit -m "docs(chat): record performance gate decisions" -m "What: record populated Android evidence and go/no-go outcomes for high-risk streaming and gesture findings. Why: prevent static audit suggestions from authorizing regressions. Verification: device scenarios, logcat/performance diagnostics, and pnpm bench:ai-chat. Limitation: GO items require separate focused plans before production edits."
```

## Final verification and handoff

### Task 12: Run full verification and close documentation

**Files:**

- Modify: `docs/feature-matrix.md`
- Modify: `docs/ai-chat-research/chat_performance_report_v2_triage.md`

- [ ] **Step 1: Update implemented statuses**

For each retained production change, add the actual commit hash, exact tests, Android device/profile, before/after metric, and remaining limitation to the triage document. Mark P0-5 `不成立` with the query-plan test commit. Never mark a Wave 3 GO item `已实施`; link its new plan instead.

- [ ] **Step 2: Reconcile feature matrix**

Confirm these rows match source and tests:

- 上下文预算;
- 消息渲染;
- RAG/材料 and 文档生命周期;
- 流式性能;
- 主要测试覆盖.

Do not advertise Node microbenchmark timing as Android performance. Keep embedding described as reserved/manual rather than automatically enabled.

- [ ] **Step 3: Run focused suites**

```powershell
node --test tests/ai-context-budget-unit.test.cjs tests/ai-generation-repository-integration.test.cjs tests/ai-knowledge-repository-performance-integration.test.cjs tests/ai-bounded-concurrency-unit.test.cjs tests/ai-rag-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs tests/ai-chat-streaming-tail-contract.test.cjs tests/ai-chat-streaming-tail-render-contract.test.cjs tests/ai-chat-fixes-policy.test.cjs
```

Expected: zero failures.

- [ ] **Step 4: Run the complete project gates**

```powershell
pnpm typecheck
pnpm test
git diff --check
git status --short --branch
```

Expected: typecheck and full tests pass; diff check has no output; status contains only intentional task files before the final documentation commit.

- [ ] **Step 5: Perform Android smoke verification when a compatible device is available**

Run:

```powershell
D:\Develop\Android\Sdk\platform-tools\adb.exe devices
```

If a device is present, use the existing debug build/install path and verify Composer sizing, math rendering, detached scrolling, drawer controls, and manual embedding generation. Do not uninstall an existing app or destroy user data to resolve a signature mismatch.

- [ ] **Step 6: Commit final evidence**

```powershell
git add docs/feature-matrix.md docs/ai-chat-research/chat_performance_report_v2_triage.md
git commit -m "docs(chat): close performance optimization evidence" -m "What: reconcile the feature matrix and attach actual verification/benchmark evidence to every retained P0/P1 decision. Why: leave a reusable source of truth instead of unsupported audit claims. Verification: focused tests, pnpm typecheck, pnpm test, git diff --check, and available Android smoke scenarios. Limitation: any unavailable device checks or separate Wave 3 follow-up plans are explicitly listed."
```

## Completion criteria

The plan is complete only when:

- P0-5 is protected as a proven false positive with no production SQL rewrite.
- Token estimation, KaTeX compilation, and knowledge repository changes pass equivalence/integrity tests.
- Embedding generation never exceeds three concurrent requests and retains the existing generated/failed contract.
- Composer mirror measurement and dual stream measurement remain unless their Android gates explicitly authorize separate work.
- High-risk streaming and gesture findings end in a populated `NO-GO`, `BLOCKED`, or linked separate `GO` plan; none remain ambiguous.
- `pnpm typecheck`, `pnpm test`, and `git diff --check` pass.
- `docs/feature-matrix.md` and the triage table match the actual retained code and verification evidence.
