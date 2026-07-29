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

let affect;
let relationship;
let repair;
let stance;
let reset;
try {
  affect = require(path.join(root, 'src/ai/companion/companionAffectPolicy.ts'));
  relationship = require(path.join(root, 'src/ai/companion/companionRelationshipPolicy.ts'));
  repair = require(path.join(root, 'src/ai/companion/companionRepairService.ts'));
  stance = require(path.join(root, 'src/ai/companion/companionStancePlanner.ts'));
  reset = require(path.join(root, 'src/ai/companion/companionResetPolicy.ts'));
} finally {
  if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
  else delete require.extensions['.ts'];
}

function event(category, subtype, overrides = {}) {
  return { category, subtype, intensity: 1, sincerity: 1, speechMode: 'asserted', confidence: 0.9, ...overrides };
}

test('affect policy applies all stimuli deterministically with decay damping and per-turn clamps', () => {
  const initial = affect.initialCompanionAffectState();
  const praise = affect.applyAffectEvent(initial, event('interaction', 'praise'), { stage: 'familiar', trust: 50, unresolvedRupture: false });
  assert.deepEqual(praise, affect.applyAffectEvent(initial, event('interaction', 'praise'), { stage: 'familiar', trust: 50, unresolvedRupture: false }));
  assert.ok(praise.affection > 0 && praise.security > 0 && praise.arousal > 0 && praise.agency < 0);

  const extreme = affect.applyAffectEvent({ affection: 99, security: -99, arousal: 99, agency: -99 }, event('relationship', 'repair_confirmed', { intensity: 4 }), { stage: 'close', trust: 100, unresolvedRupture: false });
  for (const value of Object.values(extreme)) assert.ok(value >= -100 && value <= 100);
  assert.ok(Math.abs(extreme.affection - 99 * 0.99) <= 8.001);

  const ruptured = affect.applyAffectEvent(initial, event('relationship', 'apology'), { stage: 'trusted', trust: 70, unresolvedRupture: true });
  const safe = affect.applyAffectEvent(initial, event('relationship', 'apology'), { stage: 'trusted', trust: 70, unresolvedRupture: false });
  assert.ok(ruptured.security < safe.security);
  assert.ok(ruptured.affection < safe.affection);
});

test('non-effective speech and memory echoes cannot destabilize affect projection', () => {
  const initial = affect.initialCompanionAffectState();
  for (const speechMode of ['quoted', 'hypothetical', 'joke', 'roleplay', 'negated']) {
    assert.deepEqual(affect.applyAffectEvent(initial, event('relationship', 'conflict', { speechMode }), { stage: 'new', trust: 35, unresolvedRupture: false }), affect.decayAffectState(initial));
  }
  const echoed = affect.applyMemoryEcho(initial, { affection: 9, security: -9, arousal: 9, agency: -9 });
  assert.ok(Object.values(echoed).every((value) => Math.abs(value) <= 1.5));
  assert.ok(Object.values(echoed).reduce((sum, value) => sum + Math.abs(value), 0) <= 4.001);
});

test('relationship policy gates stage progress and downgrades only from evidence', () => {
  let state = relationship.initialRelationshipProjection();
  for (let index = 0; index < 7; index += 1) state = relationship.applyRelationshipEvent(state, event('relationship', 'vulnerable_disclosure'));
  assert.equal(state.stage, 'new');
  state = relationship.applyRelationshipEvent(state, event('interaction', 'praise'));
  assert.equal(state.meaningfulTurns, 8);
  assert.ok(state.trust >= 42);
  assert.ok(state.sharedEventCount >= 3);
  assert.equal(state.stage, 'familiar');

  const untouched = relationship.applyRelationshipEvent(state, event('boundary', 'naming'));
  assert.equal(untouched.trust, state.trust);
  assert.equal(relationship.applyOfflineElapsed(untouched, 365).trust, untouched.trust);

  let trusted = { ...state, stage: 'trusted', trust: 40, ruptureCount: 1, unresolvedRepairIds: [] };
  trusted = relationship.recalculateRelationshipStage(trusted);
  assert.equal(trusted.stage, 'trusted');
  trusted = relationship.recalculateRelationshipStage({ ...trusted, trust: 34 });
  assert.equal(trusted.stage, 'familiar');
});

test('repair state requires three compliant relevant assistant turns and reopens on violation', () => {
  const draft = repair.createRepairDraft({
    category: 'boundary',
    evidenceText: '别再叫我小朋友。',
    sourceEventId: 'event-a',
    sourceMessageId: 'message-a',
    subtype: 'naming',
  });
  assert.equal(draft.state, 'constrained');
  assert.deepEqual(draft.forbiddenTerms, ['小朋友']);
  let current = repair.applyRepairAssistantTurn(draft, '好，我会改用你希望的称呼。');
  assert.equal(current.state, 'observing');
  assert.equal(current.passedRelevantTurns, 1);
  current = repair.applyRepairAssistantTurn(current, '我们继续刚才的内容。');
  current = repair.applyRepairAssistantTurn(current, '我明白你的意思。');
  assert.equal(current.state, 'verified');

  const violated = repair.applyRepairAssistantTurn({ ...draft, state: 'observing', passedRelevantTurns: 2 }, '小朋友，别生气。');
  assert.equal(violated.state, 'constrained');
  assert.equal(violated.violationCount, 1);
});

test('stance planner prioritizes repair and current affect without exposing projection numbers', () => {
  const repairing = stance.planCompanionStance({
    affect: { affection: 20, security: -20, arousal: 10, agency: -10 },
    currentEvents: [event('user_affect', 'sadness')],
    relationship: { ...relationship.initialRelationshipProjection(), stage: 'familiar' },
    unresolvedRepair: true,
  });
  assert.equal(repairing.primaryIntent, 'repair');
  assert.equal(repairing.playfulness, 'off');
  assert.equal(repairing.responseLength, 'short');
  assert.equal(JSON.stringify(repairing).includes('security'), false);

  const celebration = stance.planCompanionStance({
    affect: { affection: 35, security: 30, arousal: 40, agency: 20 },
    currentEvents: [event('user_affect', 'excitement')],
    relationship: { ...relationship.initialRelationshipProjection(), stage: 'trusted' },
    unresolvedRepair: false,
  });
  assert.equal(celebration.primaryIntent, 'celebrate');
  assert.equal(celebration.energy, 'lively');
});

test('audited role reset makes all earlier projection events ineligible for replay', () => {
  const events = [
    { id: 'a', subtype: 'praise' },
    { id: 'reset', subtype: reset.COMPANION_RUNTIME_RESET_SUBTYPE },
    { id: 'b', subtype: 'vulnerable_disclosure' },
  ];
  assert.deepEqual(reset.eventsAfterLatestCompanionReset(events).map((item) => item.id), ['b']);
  assert.deepEqual(reset.eventsAfterLatestCompanionReset(events.slice(0, 1)).map((item) => item.id), ['a']);
});
