const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalTsLoader = require.extensions['.ts'];
require.extensions['.ts'] = function compileTypeScript(module, sourcePath) {
  const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText;
  module._compile(output, sourcePath);
};

let compiler;
let promptBuilder;
let enrichment;
try {
  compiler = require(path.join(root, 'src/ai/companion/companionContextCompiler.ts'));
  promptBuilder = require(path.join(root, 'src/ai/promptBuilder.ts'));
  enrichment = require(path.join(root, 'src/ai/companion/companionEnrichmentValidation.ts'));
} finally {
  if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
  else delete require.extensions['.ts'];
}

function event(overrides = {}) {
  return {
    id: 'event-a', space: 'normal', subjectType: 'role', subjectId: 'role-a', roleCardId: 'role-a', threadId: 'thread-a',
    branchRootMessageId: 'root-a', branchVersionIndex: 1, branchRouteHash: 'route-a', lineageVersion: 4,
    sourceMessageId: 'message-current', sourceMessageVersionHash: 'hash-a', category: 'boundary', subtype: 'naming',
    speechMode: 'asserted', confidence: 0.94, intensity: 0.6, sincerity: 1,
    payloadJson: JSON.stringify({ constraint: '别再叫我小朋友' }), evidenceSpanJson: '{}', extractorVersion: 'companion-observer-v1',
    provenanceJson: '[]', idempotencyKey: 'idem-a', status: 'active', eventSequence: 3, createdAt: '2026-07-29T08:00:00.000Z',
    ...overrides,
  };
}

function loop(overrides = {}) {
  return {
    id: 'loop-a', space: 'normal', roleCardId: 'role-a', threadId: 'thread-a', branchRouteHash: 'route-a', lineageVersion: 4,
    sourceEventId: 'event-old', sourceMessageId: 'message-old', temporalAnchorId: null, kind: 'result_wait', topicText: '面试结果',
    status: 'open', priority: 65, earliestMentionAt: '2026-07-28T08:00:00.000Z', expiresAt: '2026-08-28T08:00:00.000Z',
    mentionCount: 0, lastMentionedAt: null, lastMentionedRound: null, recurrenceRule: null,
    resolutionEvidenceMessageId: null, idempotencyKey: 'loop-idem', createdAt: '2026-07-28T08:00:00.000Z', updatedAt: '2026-07-28T08:00:00.000Z',
    ...overrides,
  };
}

test('context compiler emits current constraints and at most one prior optional loop in dynamic layers', () => {
  const plan = compiler.buildCompanionContextPlan({
    branchRouteHash: 'route-a', currentMessageId: 'message-current', currentRound: 20,
    events: [event(), event({ id: 'event-correction', category: 'correction', payloadJson: JSON.stringify({ correction: '我叫阿澄' }) })],
    lineageVersion: 4, now: '2026-07-29T08:00:00.000Z', openLoops: [loop(), loop({ id: 'loop-b', sourceEventId: 'event-old-b', topicText: '体检结果', priority: 40 })],
    space: 'normal', threadId: 'thread-a',
  });
  assert.equal(plan.dynamicSegments.filter((segment) => segment.type === 'companion_runtime').length, 1);
  assert.equal(plan.dynamicSegments.filter((segment) => segment.type === 'temporal_open_loops').length, 1);
  assert.equal(plan.selectedOpenLoopId, 'loop-a');
  assert.equal(plan.currentConstraintCount, 2);
  const text = plan.dynamicSegments.map((segment) => segment.text).join('\n');
  assert.match(text, /不得再使用冲突称呼或表达/);
  assert.match(text, /面试结果/);
  assert.doesNotMatch(text, /event-a|loop-a|idempotency|job/i);
});

test('current-turn commitments are not immediately echoed as an optional reminder', () => {
  const plan = compiler.buildCompanionContextPlan({
    branchRouteHash: 'route-a', currentMessageId: 'message-current', currentRound: 20,
    events: [event({ category: 'commitment', payloadJson: '{}' })], lineageVersion: 4,
    now: '2026-07-29T08:00:00.000Z', openLoops: [loop({ sourceMessageId: 'message-current' })],
    space: 'normal', threadId: 'thread-a',
  });
  assert.equal(plan.selectedOpenLoopId, null);
  assert.equal(plan.dynamicSegments.some((segment) => segment.type === 'temporal_open_loops'), false);
});

test('an unresolved prior repair suppresses optional old topics and emits only behavioral stance', () => {
  const projection = {
    id: 'projection-a', space: 'normal', scopeType: 'branch_overlay', roleCardId: 'role-a', threadId: 'thread-a',
    branchRouteHash: 'route-a', lineageVersion: 4, basedOnEventSequence: 9,
    affect: { affection: 12, security: -5, arousal: 3, agency: -8 }, relationship: {},
    stance: { warmth: 'medium', reassurance: 'light', energy: 'steady', assertiveness: 'low', playfulness: 'off', intimacy: 'familiar', proximity: 'neutral', responseLength: 'short', primaryIntent: 'repair', optionalTopicId: null, label: 'repairing' },
    policyVersion: 'affect-policy-v1+relationship-policy-v1', status: 'active', createdAt: '2026-07-29T08:00:00Z', updatedAt: '2026-07-29T08:00:00Z',
  };
  const repair = {
    id: 'repair-a', sourceMessageId: 'message-old', sourceEventId: 'event-old', constraintText: '别再叫我小朋友',
    state: 'observing', updatedAt: '2026-07-29T08:00:00Z',
  };
  const plan = compiler.buildCompanionContextPlan({
    branchRouteHash: 'route-a', currentMessageId: 'message-current', currentRound: 22,
    events: [], lineageVersion: 4, now: '2026-07-29T09:00:00.000Z', openLoops: [loop()],
    projection, repairs: [repair], space: 'normal', threadId: 'thread-a',
  });
  assert.equal(plan.selectedRepairId, 'repair-a');
  assert.equal(plan.selectedOpenLoopId, null);
  assert.equal(plan.stanceLabel, 'repairing');
  assert.equal(plan.dynamicSegments.filter((segment) => segment.type === 'temporal_open_loops').length, 0);
  const runtime = plan.dynamicSegments.find((segment) => segment.type === 'companion_runtime').text;
  assert.match(runtime, /未完成修复/);
  assert.doesNotMatch(runtime, /affection|security|arousal|agency|12|-5/);
});

test('companion event and loop changes do not alter stable prefix hash or memory epoch', () => {
  const base = {
    memoryEpoch: 'memory-epoch-1', systemPrompt: '你是稳定角色。', userMessage: '今天怎么样？', stableMemoryPrefix: '用户确认偏好：简洁。',
  };
  const firstPlan = compiler.buildCompanionContextPlan({
    branchRouteHash: 'route-a', currentMessageId: 'message-current', currentRound: 20, events: [event()], lineageVersion: 4,
    now: '2026-07-29T08:00:00.000Z', openLoops: [loop()], space: 'normal', threadId: 'thread-a',
  });
  const secondPlan = compiler.buildCompanionContextPlan({
    branchRouteHash: 'route-a', currentMessageId: 'message-next', currentRound: 21,
    events: [event({ id: 'event-next', sourceMessageId: 'message-next', category: 'user_affect', payloadJson: JSON.stringify({ observation: 'joy' }) })],
    lineageVersion: 4, now: '2026-07-29T09:00:00.000Z', openLoops: [loop({ mentionCount: 1 })], space: 'normal', threadId: 'thread-a',
  });
  const first = promptBuilder.buildNormalChatPrompt({ ...base, dynamicSegments: firstPlan.dynamicSegments });
  const second = promptBuilder.buildNormalChatPrompt({ ...base, dynamicSegments: secondPlan.dynamicSegments });
  assert.equal(first.cacheMetadata.stablePrefixHash, second.cacheMetadata.stablePrefixHash);
  assert.equal(first.cacheMetadata.memoryEpoch, second.cacheMetadata.memoryEpoch);
});

test('runtime integration keeps observation local before dispatch and enrichment asynchronous', () => {
  const runtime = fs.readFileSync(path.join(root, 'src/ai/companion/companionRuntimeService.ts'), 'utf8');
  const enrichment = fs.readFileSync(path.join(root, 'src/ai/companion/companionEventEnrichmentService.ts'), 'utf8');
  const enrichmentValidation = fs.readFileSync(path.join(root, 'src/ai/companion/companionEnrichmentValidation.ts'), 'utf8');
  const maintenance = fs.readFileSync(path.join(root, 'src/ai/companion/companionMaintenanceQueue.ts'), 'utf8');
  const chat = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  assert.match(runtime, /observeCompanionEvents/);
  assert.doesNotMatch(runtime, /callMemoryMaintenanceModel|getAdapterForProvider|streamChat/);
  assert.match(enrichment, /callMemoryMaintenanceModel/);
  assert.match(enrichmentValidation, /confidence\s*<\s*0\.75/);
  assert.match(maintenance, /void\s+runCompanionMaintenancePass|setTimeout/);
  assert.match(chat, /observeCompanionCurrentTurn/);
  assert.ok(chat.indexOf('observeCompanionCurrentTurn') < chat.indexOf('adapter.streamChat'));
});

test('enrichment validator rejects unknown evidence, invalid enums, low confidence and malformed JSON', () => {
  const valid = enrichment.parseAndValidateEnrichmentOutput(JSON.stringify({ events: [{
    category: 'relationship', subtype: 'closeness', confidence: 0.8, speechMode: 'asserted',
    evidenceIds: ['message-current'], payload: { note: 'shared disclosure' },
  }] }), { evidenceIds: ['message-current'] });
  assert.equal(valid.length, 1);
  assert.deepEqual(enrichment.parseAndValidateEnrichmentOutput('{bad', { evidenceIds: ['message-current'] }), []);
  assert.deepEqual(enrichment.parseAndValidateEnrichmentOutput(JSON.stringify({ events: [{ category: 'unknown', subtype: 'x', confidence: 0.9, speechMode: 'asserted', evidenceIds: ['message-current'], payload: {} }] }), { evidenceIds: ['message-current'] }), []);
  assert.deepEqual(enrichment.parseAndValidateEnrichmentOutput(JSON.stringify({ events: [{ category: 'relationship', subtype: 'x', confidence: 0.7, speechMode: 'asserted', evidenceIds: ['message-current'], payload: {} }] }), { evidenceIds: ['message-current'] }), []);
  assert.deepEqual(enrichment.parseAndValidateEnrichmentOutput(JSON.stringify({ events: [{ category: 'relationship', subtype: 'x', confidence: 0.9, speechMode: 'asserted', evidenceIds: ['other'], payload: {} }] }), { evidenceIds: ['message-current'] }), []);
});

test('enrichment commit guard rejects expired or taken leases and edited sources', () => {
  const base = {
    commitAt: '2026-07-29T08:04:00.000Z',
    expectedMessageVersionHash: 'hash-a',
    expectedThreadId: 'thread-a',
    job: { leaseOwner: 'worker-a', leaseUntil: '2026-07-29T08:05:00.000Z', status: 'running', threadId: 'thread-a' },
    message: { role: 'user', status: 'completed', threadId: 'thread-a', versionHash: 'hash-a' },
    workerId: 'worker-a',
  };
  assert.equal(enrichment.validateEnrichmentCommitGuard(base), 'ok');
  assert.equal(enrichment.validateEnrichmentCommitGuard({ ...base, workerId: 'worker-b' }), 'lease_lost');
  assert.equal(enrichment.validateEnrichmentCommitGuard({ ...base, commitAt: '2026-07-29T08:05:00.000Z' }), 'lease_lost');
  assert.equal(enrichment.validateEnrichmentCommitGuard({ ...base, message: { ...base.message, versionHash: 'edited' } }), 'source_invalid');
});

test('semantic repair verifier accepts only the exact boolean envelope', () => {
  const repair = require(path.join(root, 'src/ai/companion/companionRepairVerification.ts'));
  assert.deepEqual(repair.parseCompanionRepairVerification('{"violated":false}'), { violated: false });
  assert.deepEqual(repair.parseCompanionRepairVerification('{"violated":true}'), { violated: true });
  assert.equal(repair.parseCompanionRepairVerification('{"violated":"false"}'), null);
  assert.equal(repair.parseCompanionRepairVerification('{"violated":false,"reason":"x"}'), null);
  assert.equal(repair.parseCompanionRepairVerification('not-json'), null);
});

test('awareness off excludes historical projections while preserving explicit current boundary', () => {
  const plan = compiler.buildCompanionContextPlan({
    awarenessEnabled: false,
    branchRouteHash: 'route-a', currentMessageId: 'message-current', currentRound: 20,
    events: [event()], lineageVersion: 4, now: '2026-07-29T08:00:00.000Z', openLoops: [loop()],
    projection: { stance: { label: 'repairing' }, policyVersion: 'v' },
    repairs: [{ id: 'repair-old', sourceMessageId: 'old', state: 'observing', constraintText: 'old constraint' }],
    space: 'normal', threadId: 'thread-a',
  });
  const text = plan.dynamicSegments.map((segment) => segment.text).join('\n');
  assert.match(text, /不得再使用冲突称呼或表达/);
  assert.doesNotMatch(text, /old constraint|当前回应姿态|待跟进话题/);
  assert.equal(plan.projectionVersion, null);
  assert.equal(plan.stanceLabel, null);
});
