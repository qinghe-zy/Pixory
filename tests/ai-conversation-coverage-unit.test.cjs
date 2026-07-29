const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const coveragePath = path.join(root, 'src/ai/context/conversationCoverage.ts');
const originalTsLoader = require.extensions['.ts'];

require.extensions['.ts'] = function compileTypeScript(module, filename) {
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

const {
  buildConversationCoveragePlan,
  hashBranchRoute,
  hashCoverageMessageVersions,
  summaryPrewarmRoundThreshold,
} = require(coveragePath);

if (originalTsLoader) {
  require.extensions['.ts'] = originalTsLoader;
} else {
  delete require.extensions['.ts'];
}

function message(id, role, content = id, overrides = {}) {
  const sequence = Number(id.replace(/\D/g, '')) || 0;
  const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, sequence)).toISOString();
  return {
    id,
    threadId: 'thread-1',
    branchRootMessageId: null,
    branchVersionIndex: null,
    role,
    status: 'completed',
    content,
    reasoningText: null,
    errorMessage: null,
    providerId: null,
    modelId: null,
    modelSnapshotJson: '{}',
    promptSnapshotJson: '{}',
    continuityImportSessionId: null,
    continuitySyntheticKind: null,
    createdAt,
    updatedAt: createdAt,
    completedAt: createdAt,
    ...overrides,
  };
}

function rounds(count) {
  return Array.from({ length: count }, (_, index) => {
    const round = index + 1;
    return [
      message(`m${round * 2 - 1}`, 'user', `用户第 ${round} 轮`),
      message(`m${round * 2}`, 'assistant', `角色第 ${round} 轮`),
    ];
  }).flat();
}

function buildInput(messages, historyRoundLimit, summarySegments = [], overrides = {}) {
  return {
    threadId: 'thread-1',
    branchRouteHash: hashBranchRoute([]),
    lineageVersion: 3,
    historyRoundLimit,
    messages,
    summarySegments,
    rawBridgeMessageLimit: 16,
    ...overrides,
  };
}

function representedIds(compiled) {
  return new Set([
    ...compiled.plan.recentMessageIds,
    ...compiled.plan.bridgeMessageIds,
    ...compiled.plan.provisionalSourceMessageIds,
  ]);
}

test('coverage is complete for every 1-120 round length and supported representative window', () => {
  for (const historyRoundLimit of [5, 20, 30, 50, 100]) {
    for (let roundCount = 1; roundCount <= 120; roundCount += 1) {
      const source = rounds(roundCount);
      const compiled = buildConversationCoveragePlan(buildInput(source, historyRoundLimit));
      assert.equal(compiled.plan.coverageComplete, true);
      assert.deepEqual(compiled.plan.uncoveredMessageIds, []);
      assert.deepEqual(
        compiled.plan.recentMessageIds,
        source.slice(-Math.min(roundCount, historyRoundLimit) * 2).map((item) => item.id),
      );
      const represented = representedIds(compiled);
      assert.deepEqual(source.map((item) => item.id).filter((id) => !represented.has(id)), []);
      assert.equal(compiled.plan.provisionalSummaryId == null, compiled.plan.provisionalSourceMessageIds.length === 0);
    }
  }
});

test('shrinking history from 100 rounds to 5 repairs the whole new gap locally', () => {
  const source = rounds(100);
  const compiled = buildConversationCoveragePlan(buildInput(source, 5));
  assert.equal(compiled.plan.recentMessageIds.length, 10);
  assert.equal(compiled.plan.bridgeMessageIds.length, 0);
  assert.equal(compiled.plan.provisionalSourceMessageIds.length, 190);
  assert.ok(compiled.plan.provisionalSummaryId?.startsWith('provisional_'));
  assert.match(compiled.summaryBridgeText, /本地临时连续性摘要/);
  assert.equal(compiled.plan.coverageComplete, true);
});

test('small gaps use a raw dynamic history bridge without a provisional summary', () => {
  const source = rounds(12);
  const compiled = buildConversationCoveragePlan(buildInput(source, 5));
  assert.deepEqual(compiled.plan.bridgeMessageIds, source.slice(0, 14).map((item) => item.id));
  assert.deepEqual(compiled.plan.provisionalSourceMessageIds, []);
  assert.equal(compiled.plan.provisionalSummaryId, null);
  assert.match(compiled.summaryBridgeText, /用户：用户第 1 轮/);
  assert.match(compiled.summaryBridgeText, /角色：角色第 7 轮/);
});

test('valid exact-provenance summaries cover old rounds and enter only stable summary text', () => {
  const source = rounds(15);
  const summarized = source.slice(0, 20);
  const routeHash = hashBranchRoute([]);
  const segment = {
    id: 'summary-1',
    threadId: 'thread-1',
    space: 'normal',
    kind: 'compressed',
    summaryText: '前十轮的稳定摘要。',
    startMessageId: summarized[0].id,
    endMessageId: summarized.at(-1).id,
    startAt: summarized[0].createdAt,
    endAt: summarized.at(-1).createdAt,
    roundCount: 10,
    sourceSegmentIdsJson: '[]',
    sourceMessageIdsJson: JSON.stringify(summarized.map((item) => item.id)),
    branchRouteHash: routeHash,
    lineageVersion: 3,
    sourceMessageVersionHash: hashCoverageMessageVersions(summarized),
    quality: 'model',
    status: 'active',
    continuityImportSessionId: null,
    createdAt: summarized.at(-1).createdAt,
    updatedAt: summarized.at(-1).createdAt,
  };
  const compiled = buildConversationCoveragePlan(buildInput(source, 5, [segment]));
  assert.deepEqual(compiled.plan.summarySegmentIds, ['summary-1']);
  assert.deepEqual(compiled.plan.bridgeMessageIds, []);
  assert.deepEqual(compiled.plan.provisionalSourceMessageIds, []);
  assert.match(compiled.stableSummaryText, /前十轮的稳定摘要/);
  assert.equal(compiled.summaryBridgeText, '');
});

test('edited content, sibling routes, malformed provenance, and legacy rows are invalidated and repaired', () => {
  const source = rounds(15);
  const summarized = source.slice(0, 20);
  const baseSegment = {
    id: 'summary-stale',
    threadId: 'thread-1',
    space: 'normal',
    kind: 'compressed',
    summaryText: '不应再注入。',
    startMessageId: summarized[0].id,
    endMessageId: summarized.at(-1).id,
    startAt: summarized[0].createdAt,
    endAt: summarized.at(-1).createdAt,
    roundCount: 10,
    sourceSegmentIdsJson: '[]',
    sourceMessageIdsJson: JSON.stringify(summarized.map((item) => item.id)),
    branchRouteHash: hashBranchRoute([]),
    lineageVersion: 3,
    sourceMessageVersionHash: hashCoverageMessageVersions(summarized),
    quality: 'model',
    status: 'active',
    continuityImportSessionId: null,
    createdAt: summarized.at(-1).createdAt,
    updatedAt: summarized.at(-1).createdAt,
  };
  const edited = source.map((item) => item.id === 'm4' ? { ...item, content: '编辑后的角色回复' } : item);
  const cases = [
    { ...baseSegment },
    { ...baseSegment, id: 'sibling', branchRouteHash: hashBranchRoute([{ branchRootMessageId: 'root-a', branchVersionIndex: 2 }]) },
    { ...baseSegment, id: 'malformed', sourceMessageIdsJson: '{bad json' },
    { ...baseSegment, id: 'legacy', sourceMessageIdsJson: '[]', sourceMessageVersionHash: '', status: 'stale' },
  ];
  const compiled = buildConversationCoveragePlan(buildInput(edited, 5, cases));
  assert.deepEqual(compiled.plan.summarySegmentIds, []);
  assert.equal(compiled.plan.coverageComplete, true);
  assert.doesNotMatch(compiled.stableSummaryText, /不应再注入/);
  assert.equal(compiled.plan.provisionalSourceMessageIds.length, 20);
});

test('incomplete and failed tails are not miscounted as completed conversation rounds', () => {
  const source = [
    ...rounds(3),
    message('m7', 'user', '没有回答的用户消息'),
    message('m8', 'assistant', '失败内容', { status: 'failed' }),
  ];
  const compiled = buildConversationCoveragePlan(buildInput(source, 5));
  assert.deepEqual(compiled.plan.recentMessageIds, rounds(3).map((item) => item.id));
  assert.equal(compiled.plan.coverageComplete, true);
});

test('branch route hashes are deterministic, order-normalized, and version-sensitive', () => {
  const first = hashBranchRoute([
    { branchRootMessageId: 'b', branchVersionIndex: 2 },
    { branchRootMessageId: 'a', branchVersionIndex: 1 },
  ]);
  const reordered = hashBranchRoute([
    { branchRootMessageId: 'a', branchVersionIndex: 1 },
    { branchRootMessageId: 'b', branchVersionIndex: 2 },
  ]);
  const changed = hashBranchRoute([
    { branchRootMessageId: 'a', branchVersionIndex: 1 },
    { branchRootMessageId: 'b', branchVersionIndex: 3 },
  ]);
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
});

test('summary maintenance prewarms before the configured recent-history frontier', () => {
  assert.equal(summaryPrewarmRoundThreshold(5), 8);
  assert.equal(summaryPrewarmRoundThreshold(30), 25);
  assert.equal(summaryPrewarmRoundThreshold(100), 95);
  assert.equal(summaryPrewarmRoundThreshold(Number.NaN), 25);
});
