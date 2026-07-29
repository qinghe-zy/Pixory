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

let temporal;
let loops;
let arbitration;
try {
  temporal = require(path.join(root, 'src/ai/companion/companionTemporalService.ts'));
  loops = require(path.join(root, 'src/ai/companion/companionOpenLoopService.ts'));
  arbitration = require(path.join(root, 'src/ai/companion/companionTopicArbitrator.ts'));
} finally {
  if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
  else delete require.extensions['.ts'];
}

test('relative dates preserve local semantics across month, year and leap boundaries', () => {
  const feb = temporal.parseTemporalPhrases('明天下午告诉你，后天再确认。', {
    now: '2028-02-28T15:30:00.000Z',
    timeZone: 'Asia/Shanghai',
  });
  assert.equal(feb[0].localDateKey, '2028-02-29');
  assert.equal(feb[0].precision, 'hour');
  assert.equal(feb[1].localDateKey, '2028-03-01');

  const year = temporal.parseTemporalPhrases('明天告诉你。', {
    now: '2026-12-31T14:00:00.000Z',
    timeZone: 'Asia/Shanghai',
  });
  assert.equal(year[0].localDateKey, '2027-01-01');
  assert.equal(year[0].parseTimeZone, 'Asia/Shanghai');
});

test('explicit dates, weekdays, recurrence, deadlines and anniversaries are typed deterministically', () => {
  const anchors = temporal.parseTemporalPhrases('截止7月31日。每周五复盘，8月2日是我们一周年。', {
    now: '2026-07-29T08:00:00.000Z',
    timeZone: 'Asia/Shanghai',
  });
  assert.ok(anchors.some((item) => item.type === 'deadline' && item.localDateKey === '2026-07-31'));
  assert.ok(anchors.some((item) => item.type === 'recurrence' && item.recurrenceRule === 'FREQ=WEEKLY;BYDAY=FR'));
  assert.ok(anchors.some((item) => item.type === 'anniversary' && item.localDateKey === '2026-08-02'));

  const weekday = temporal.parseTemporalPhrases('下周一再聊。', {
    now: '2026-07-29T08:00:00.000Z',
    timeZone: 'Asia/Shanghai',
  });
  assert.equal(weekday[0].localDateKey, '2026-08-03');
});

test('unknown temporal language stays unmaterialized and invalid timezone falls back safely', () => {
  assert.deepEqual(temporal.parseTemporalPhrases('以后有空再说吧。', {
    now: '2026-07-29T08:00:00.000Z',
    timeZone: 'Not/AZone',
  }), []);
  assert.equal(temporal.resolveCompanionTimeZone('Not/AZone'), 'Asia/Shanghai');
  assert.deepEqual(temporal.parseTemporalPhrases('2月30日再说。', {
    now: '2026-07-29T08:00:00.000Z',
    timeZone: 'Asia/Shanghai',
  }), []);
});

test('past anniversaries and recurring anchors advance by local calendar semantics', () => {
  const anniversary = temporal.parseTemporalPhrases('3月8日是纪念日。', {
    now: '2026-07-29T08:00:00.000Z',
    timeZone: 'Asia/Shanghai',
  })[0];
  assert.equal(anniversary.localDateKey, '2027-03-08');

  const next = temporal.advanceRecurringTemporalAnchor({
    mentionedAt: '2026-10-30T16:00:00.000Z',
    parseTimeZone: 'America/New_York',
    rawText: '每周日',
    type: 'recurrence',
  });
  assert.equal(next.localDateKey, '2026-11-01');
  assert.equal(next.startAtUtc, '2026-11-01T04:00:00.000Z');
});

test('OpenLoop expiration and mention policy matches deadline, result and weak defaults', () => {
  const now = '2026-07-29T08:00:00.000Z';
  const deadline = loops.buildOpenLoopDraft({ kind: 'deadline', now, deadlineAt: '2026-07-31T15:59:59.999Z' });
  const result = loops.buildOpenLoopDraft({ kind: 'result_wait', now });
  const weak = loops.buildOpenLoopDraft({ kind: 'weak', now });
  assert.equal(deadline.expiresAt, '2026-08-07T15:59:59.999Z');
  assert.equal(result.expiresAt, '2026-08-28T08:00:00.000Z');
  assert.equal(weak.expiresAt, '2026-08-12T08:00:00.000Z');

  assert.equal(loops.isOpenLoopEligible({ ...result, mentionCount: 0, status: 'open' }, now, 10), true);
  assert.equal(loops.isOpenLoopEligible({ ...result, mentionCount: 2, status: 'open' }, now, 10), false);
  assert.equal(loops.isOpenLoopEligible({ ...result, mentionCount: 1, lastMentionedAt: '2026-07-28T08:00:00.000Z', status: 'open' }, now, 10), false);
  assert.equal(loops.isOpenLoopEligible({ ...result, mentionCount: 1, lastMentionedAt: '2026-07-21T08:00:00.000Z', status: 'open' }, now, 10), true);
});

test('resolve, dismiss, expire and recurring occurrence settlement are explicit', () => {
  assert.equal(loops.transitionOpenLoop('open', 'resolve'), 'resolved');
  assert.equal(loops.transitionOpenLoop('open', 'dismiss'), 'dismissed');
  assert.equal(loops.transitionOpenLoop('open', 'expire'), 'expired');
  assert.equal(loops.transitionOpenLoop('open', 'settle_occurrence', true), 'open');
  assert.throws(() => loops.transitionOpenLoop('resolved', 'resolve'));
});

test('topic arbitration selects one deterministic optional topic without displacing current request', () => {
  const selected = arbitration.selectOptionalCompanionTopic([
    { id: 'loop-b', type: 'open_loop', basePriority: 55, relevance: 0.3, urgency: 0.3, confidence: 0.9, cooldownPenalty: 0, mentionPenalty: 0, evidenceAt: '2026-07-28T00:00:00Z' },
    { id: 'repair-a', type: 'repair', basePriority: 100, relevance: 0, urgency: 0, confidence: 0.9, cooldownPenalty: 0, mentionPenalty: 0, evidenceAt: '2026-07-27T00:00:00Z' },
    { id: 'boundary-a', type: 'boundary', basePriority: 95, relevance: 0, urgency: 0, confidence: 0.9, cooldownPenalty: 0, mentionPenalty: 0, evidenceAt: '2026-07-29T00:00:00Z' },
  ]);
  assert.equal(selected.id, 'repair-a');

  const underThreshold = arbitration.selectOptionalCompanionTopic([
    { id: 'time-a', type: 'temporal_anchor', basePriority: 50, relevance: 0, urgency: 0, confidence: 0.9, cooldownPenalty: 0, mentionPenalty: 0, evidenceAt: '2026-07-29T00:00:00Z' },
  ]);
  assert.equal(underThreshold, null);

  const tie = arbitration.selectOptionalCompanionTopic([
    { id: 'b', type: 'open_loop', basePriority: 55, relevance: 0.2, urgency: 0, confidence: 0.9, cooldownPenalty: 0, mentionPenalty: 0, evidenceAt: '2026-07-29T00:00:00Z' },
    { id: 'a', type: 'open_loop', basePriority: 55, relevance: 0.2, urgency: 0, confidence: 0.9, cooldownPenalty: 0, mentionPenalty: 0, evidenceAt: '2026-07-29T00:00:00Z' },
  ]);
  assert.equal(tie.id, 'a');
});
