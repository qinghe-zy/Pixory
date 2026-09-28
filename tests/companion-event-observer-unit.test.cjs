const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'src/ai/companion/companionEventObserver.ts');
const originalTsLoader = require.extensions['.ts'];

require.extensions['.ts'] = function compileTypeScript(module, sourcePath) {
  const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText;
  module._compile(output, sourcePath);
};

let observer;
try {
  observer = require(filename);
} finally {
  if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
  else delete require.extensions['.ts'];
}

function observe(content, overrides = {}) {
  return observer.observeCompanionEvents({
    message: {
      id: 'm-current',
      content,
      role: 'user',
      status: 'completed',
      updatedAt: '2026-07-29T08:00:00.000Z',
      completedAt: '2026-07-29T08:00:00.000Z',
      branchRootMessageId: 'root-1',
      branchVersionIndex: 2,
    },
    branchRouteHash: 'route-a',
    lineageVersion: 7,
    ...overrides,
  });
}

test('explicit first-person boundary and correction are current-turn effective', () => {
  const boundary = observe('别再这样叫我，我不喜欢这个称呼。');
  assert.equal(boundary.speechMode, 'asserted');
  assert.equal(boundary.accepted[0].category, 'boundary');
  assert.equal(boundary.accepted[0].subtype, 'naming');
  assert.ok(boundary.accepted[0].confidence >= 0.85);
  assert.equal(boundary.accepted[0].effectiveNow, true);
  assert.equal(boundary.accepted[0].evidence.messageId, 'm-current');
  assert.ok(boundary.accepted[0].evidence.messageVersionHash.length >= 32);
  assert.ok(boundary.accepted[0].evidence.end > boundary.accepted[0].evidence.start);
  assert.equal(boundary.accepted[0].extractorVersion, 'companion-observer-v1');

  const correction = observe('你记错了，我不是小林，我叫阿澄。');
  assert.equal(correction.speechMode, 'corrected');
  assert.ok(correction.accepted.some((event) => event.category === 'correction' && event.effectiveNow));
});

test('quoted third-party, hypothetical, joke, roleplay and negated phrases cannot create effective high-impact events', () => {
  const fixtures = [
    ['quoted', '他说“别再这样叫我”，但那不是我说的。'],
    ['hypothetical', '如果我说别再这样叫我，你会怎么办？'],
    ['joke', '别再这样叫我——开玩笑的啦。'],
    ['roleplay', '设定里我会说“明天告诉你结果”，这只是角色扮演。'],
    ['negated', '我没有答应明天告诉你结果。'],
  ];
  for (const [mode, content] of fixtures) {
    const result = observe(content);
    assert.equal(result.speechMode, mode, content);
    assert.equal(
      result.accepted.some((event) => ['boundary', 'correction', 'commitment'].includes(event.category)),
      false,
      content,
    );
    assert.ok(result.diagnostic.length >= 1, content);
  }
});

test('conservative affect and interaction signals meet category thresholds without becoming memory claims', () => {
  const affect = observe('我今天真的很累，也有点焦虑。');
  assert.ok(affect.accepted.some((event) => event.category === 'user_affect' && event.subtype === 'fatigue' && event.confidence >= 0.65));
  assert.ok(affect.accepted.some((event) => event.category === 'user_affect' && event.subtype === 'anxiety'));

  const interaction = observe('谢谢你一直听我说。');
  assert.ok(interaction.accepted.some((event) => event.category === 'interaction' && event.subtype === 'gratitude' && event.confidence >= 0.7));
  assert.equal(JSON.stringify(interaction).includes('MemoryClaim'), false);
});

test('relationship disclosure conflict rejection and reconciliation require direct asserted language', () => {
  assert.ok(observe('我其实一直很害怕被丢下，这件事只敢告诉你。').accepted.some((event) => event.category === 'relationship' && event.subtype === 'vulnerable_disclosure'));
  assert.ok(observe('你刚才那句话真的让我很受伤。').accepted.some((event) => event.category === 'relationship' && event.subtype === 'conflict'));
  assert.ok(observe('我们就到这里吧，别再靠近我。').accepted.some((event) => event.category === 'relationship' && event.subtype === 'rejection'));
  assert.ok(observe('没关系了，我原谅你，我们和好吧。').accepted.some((event) => event.category === 'relationship' && event.subtype === 'reconciliation'));
  assert.equal(observe('小说里她说“你让我很受伤”。').accepted.some((event) => event.category === 'relationship'), false);
});

test('explicit future commitments expose temporal phrases and deterministic semantic keys', () => {
  const first = observe('等面试结果出来，我明天下午告诉你。');
  const second = observe('等面试结果出来，我明天下午告诉你。');
  const commitment = first.accepted.find((event) => event.category === 'commitment');
  assert.ok(commitment);
  assert.equal(commitment.subtype, 'created');
  assert.ok(commitment.confidence >= 0.85);
  assert.deepEqual(commitment.payload.temporalPhrases, ['明天下午']);
  assert.equal(commitment.semanticKey, second.accepted.find((event) => event.category === 'commitment').semanticKey);
});

test('completed, cancelled, and stop-asking language produce explicit lifecycle actions', () => {
  const completed = observe('面试结果出来了，我已经收到通知。');
  assert.ok(completed.accepted.some((event) => event.category === 'commitment' && event.subtype === 'completed'));
  const cancelled = observe('这事算了，我不等了。');
  assert.ok(cancelled.accepted.some((event) => event.category === 'commitment' && event.subtype === 'cancelled'));
  const dismissed = observe('别再问这个了。');
  const boundary = dismissed.accepted.find((event) => event.category === 'boundary');
  assert.equal(boundary.payload.dismissOpenLoops, true);
});

test('standalone date and recurrence statements become temporal events without creating commitments', () => {
  const date = observe('明天下午有牙医预约。');
  assert.ok(date.accepted.some((event) => event.category === 'temporal' && event.subtype === 'relative_date'));
  assert.equal(date.accepted.some((event) => event.category === 'commitment' && event.subtype === 'created'), false);

  const recurring = observe('每周五都要复盘。');
  const temporal = recurring.accepted.find((event) => event.category === 'temporal');
  assert.equal(temporal?.subtype, 'recurrence');
  assert.deepEqual(temporal?.payload.temporalPhrases, ['每周五']);
});

test('observer remains locally bounded and fast on representative input', () => {
  const samples = Array.from({ length: 500 }, (_, index) => (
    index % 2 === 0 ? '我今天有点累，明天下午等结果出来再告诉你。' : '谢谢你，不过别再叫我那个昵称。'
  ));
  const durations = [];
  for (const content of samples) {
    const started = process.hrtime.bigint();
    observe(content);
    durations.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  durations.sort((left, right) => left - right);
  const p95 = durations[Math.floor(durations.length * 0.95)];
  assert.ok(p95 < 5, `observer P95 ${p95}ms`);
});
