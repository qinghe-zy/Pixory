const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const oldLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { buildConversationCoveragePlan } = require(path.join(root, 'src/ai/context/conversationCoverage.ts'));
const { finalizeContextRequest } = require(path.join(root, 'src/ai/context/contextPlanner.ts'));
const { contextWindowPolicy, shouldPrewarmContext } = require(path.join(root, 'src/ai/context/contextWindowPolicy.ts'));
const { requestInputBudget, validateCompiledRequestBudget, estimateCompiledRequestTokens } = require(path.join(root, 'src/ai/context/providerRequestBudget.ts'));
if (oldLoader) require.extensions['.ts'] = oldLoader; else delete require.extensions['.ts'];

function source(rounds = 30, length = 500) {
  return Array.from({ length: rounds * 2 }, (_, index) => ({
    id: `m${index}`, role: index % 2 ? 'assistant' : 'user', status: 'completed',
    content: `${index}:` + '信息🙂'.repeat(length), updatedAt: 'v1', completedAt: 't',
  }));
}
function compile(messages, overrides = {}) {
  const coverage = buildConversationCoveragePlan({ threadId: 'thread', branchRouteHash: 'route', lineageVersion: 2,
    historyRoundLimit: 30, messages, summarySegments: [] }).plan;
  return finalizeContextRequest({ space: 'normal', coverage, sourceMessages: messages,
    systemPrompt: '角色设定', userPrompt: '本轮问题', history: messages.map(({ role, content }) => ({ role, content })),
    attachmentCount: 0, budgetPolicy: { modelContextWindowTokens: 16_000 }, ...overrides });
}

test('window policies adapt independently to the configured target', () => {
  assert.deepEqual([4, 30, 40, 100, 2500].map(n => contextWindowPolicy(n)), [
    { windowTarget: 4, maxBuffer: 2, chunkSize: 2 }, { windowTarget: 30, maxBuffer: 8, chunkSize: 8 },
    { windowTarget: 40, maxBuffer: 10, chunkSize: 10 }, { windowTarget: 100, maxBuffer: 25, chunkSize: 25 },
    { windowTarget: 2500, maxBuffer: 32, chunkSize: 25 },
  ]);
});

test('prewarm uses growth and observed queue time, with a two-round cold start reserve', () => {
  assert.equal(shouldPrewarmContext({ target: 30, uncompressedRounds: 30 }), true);
  const cold = { target: 30, uncompressedRounds: 4, availableTokens: 250, recentRoundTokens: [100] };
  assert.equal(shouldPrewarmContext(cold), false);
  assert.equal(shouldPrewarmContext({ ...cold, availableTokens: 150 }), true);
  assert.equal(shouldPrewarmContext({ ...cold, recentMaintenanceMs: [90_000], recentRoundIntervalMs: [30_000] }), true);
});

test('unknown model capacity uses a conservative 16k estimate and reserves output', () => {
  assert.equal(requestInputBudget({}).inputBudgetTokens, 11200);
  assert.equal(requestInputBudget({}).capacityEstimated, true);
  assert.equal(requestInputBudget({ modelContextWindowTokens: 4096, outputReserveTokens: 3000 }).inputBudgetTokens, 1096);
});

test('budget degradation is explicit, source-accounted, immutable, and keeps the current message intact', () => {
  const messages = source(100);
  const compiled = compile(messages);
  assert.equal(compiled.plan.degradationReason, 'input_budget');
  assert.equal(compiled.plan.budget.fits, true);
  assert.equal(compiled.userPrompt.endsWith('本轮问题'), true);
  const segments = compiled.plan.coverage.segments;
  assert.ok(segments.some(s => s.representation === 'skeleton_degraded'));
  const represented = segments.flatMap(s => s.sourceMessageIds);
  assert.equal(new Set(represented).size, represented.length);
  assert.equal(represented.length + compiled.plan.coverage.uncoveredMessageIds.length, messages.length);
  assert.equal(compiled.plan.coverage.coverageComplete, false);
  assert.equal(Object.isFrozen(compiled.plan.coverage.segments[0].sourceMessageIds), true);
  assert.equal(messages.length, 200);
});

test('DeepSeek replay expansion is budgeted after transformation without stripping saved context', () => {
  const messages = source(15, 1);
  const normal = compile(messages);
  const expanded = messages.map(({ role, content }) => ({ role, content: role === 'user' ? content + '历史附件与资料'.repeat(1500) : content }));
  const replay = compile(messages, { history: expanded });
  assert.equal(normal.plan.degradationReason, null);
  assert.equal(replay.plan.degradationReason, 'input_budget');
  assert.ok(replay.history.length < expanded.length);
  for (const entry of replay.history.filter(m => m.role === 'user')) assert.match(entry.content, /历史附件与资料/);
});

test('continuation partials are protected and cannot be silently removed to fit', () => {
  const messages = source(4, 1);
  const tail = [{ role: 'user', content: '本轮问题' }, { role: 'assistant', content: '续答起点' }];
  const result = compile(messages, { history: [...messages.map(({ role, content }) => ({ role, content })), ...tail] });
  assert.deepEqual(result.history.slice(-2), tail);
  assert.throws(() => compile(messages, { history: [...tail, ...messages, { role: 'assistant', content: '长'.repeat(100_000) }] }), /预算/);
});

test('images reserve vision tokens without counting encoded bytes as text', () => {
  const body = { messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,' + 'x'.repeat(1_000_000) } }] }] };
  assert.equal(estimateCompiledRequestTokens(body), 256 + 16 + 4096);
  assert.throws(() => compile(source(4, 1), { attachmentCount: 10 }), /预算/);
});

test('all compiled provider shapes are validated including schema and cache-block text', () => {
  const oversized = '信息'.repeat(20_000);
  for (const body of [
    { messages: [{ role: 'user', content: oversized }] },
    { system: [{ type: 'text', text: oversized, cache_control: { type: 'ephemeral' } }], messages: [] },
    { systemInstruction: { parts: [{ text: oversized }] }, contents: [] },
    { messages: [], output_config: { schema: oversized } },
  ]) assert.throws(() => validateCompiledRequestBudget(body, {}), /最终请求超出/);
});
