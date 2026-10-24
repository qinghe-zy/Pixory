const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const oldLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );

const {
  calculateBurstAwareElasticVelocity,
  calculateGuidedGlideStep,
  calculateAdaptiveElasticVelocity,
} = require(path.join(root, 'src/ai/aiStreamingSmoother.ts'));

if (oldLoader) require.extensions['.ts'] = oldLoader;
else delete require.extensions['.ts'];

test('calculateBurstAwareElasticVelocity: First-Burst impulse achieves 0ms unfreezing', () => {
  // Even with a tiny initial backlog (e.g. 4 chars), burst impulse should guarantee >= 3.5 chars/frame
  const burstVelTiny = calculateBurstAwareElasticVelocity(4, 0, 0);
  assert.ok(
    burstVelTiny >= 3.5,
    `Initial burst velocity must be >= 3.5 chars/frame for instant unfreezing, got: ${burstVelTiny}`
  );

  // Moderate backlog at count=0
  const burstVelMid = calculateBurstAwareElasticVelocity(20, 0, 0);
  assert.ok(
    burstVelMid >= 3.6,
    `Burst velocity at count=0 must be >= 3.6 chars/frame, got: ${burstVelMid}`
  );
});

test('calculateBurstAwareElasticVelocity: smoothly decays into steady cruise baseline', () => {
  const steadyVel = calculateAdaptiveElasticVelocity(10, 0);
  const postBurstVel = calculateBurstAwareElasticVelocity(10, 0, 180);

  assert.equal(
    postBurstVel,
    steadyVel,
    `At visibleCount=180, velocity must smoothly equal steady cruise velocity (${steadyVel}), got: ${postBurstVel}`
  );

  // Mid-burst transition check
  const midBurstVel = calculateBurstAwareElasticVelocity(10, 0, 90);
  assert.ok(
    midBurstVel > steadyVel,
    `Mid burst (count=90) should provide higher throughput than steady cruise, got: ${midBurstVel}`
  );
  assert.ok(
    midBurstVel < calculateBurstAwareElasticVelocity(10, 0, 0),
    `Mid burst (count=90) should be lower than initial burst impulse, got: ${midBurstVel}`
  );
});

test('calculateBurstAwareElasticVelocity: strictly follows high model throughput without capping', () => {
  // When model generates at high speed (e.g. 15 chars/frame ~ 900 chars/s)
  const highThroughput = 15;
  const vel = calculateBurstAwareElasticVelocity(30, highThroughput, 20);
  assert.ok(
    vel >= highThroughput,
    `Velocity must dynamically match high model throughput (${highThroughput}), got: ${vel}`
  );
});

test('calculateGuidedGlideStep: dynamic adaptive distance scaling ("prefer fast over slow")', () => {
  // Large distance jump (1200px): fast energetic glide (~20..26px/frame)
  const largeStep = calculateGuidedGlideStep(1200, 0);
  assert.ok(
    largeStep >= 20 && largeStep <= 28,
    `Large distance glide step should be energetic (20~28px/frame), got: ${largeStep}`
  );

  // Moderate distance jump (300px): serene pace (~13..18px/frame)
  const midStep = calculateGuidedGlideStep(300, 0);
  assert.ok(
    midStep >= 12 && midStep <= 18,
    `Mid distance glide step should be balanced (12~18px/frame), got: ${midStep}`
  );

  // Soft landing near bottom (<= 16px)
  const landingStep = calculateGuidedGlideStep(10, 0);
  assert.ok(
    landingStep <= 5,
    `Near-bottom landing step must be gentle (<= 5px), got: ${landingStep}`
  );

  // Throughput bonus
  const stepWithBonus = calculateGuidedGlideStep(300, 10);
  assert.ok(
    stepWithBonus > midStep,
    `Model generation throughput must boost glide step to keep up, got ${stepWithBonus} > ${midStep}`
  );
});

test('calculateBurstAwareElasticVelocity & calculateGuidedGlideStep: O(1) performance benchmark', () => {
  const iterations = 100000;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    const backlog = (i % 60) + 1;
    const count = i % 150;
    const offset = (i % 1200) + 1;
    calculateBurstAwareElasticVelocity(backlog, 4.5, count);
    calculateGuidedGlideStep(offset, 3.0);
  }

  const duration = performance.now() - start;
  assert.ok(
    duration < 50,
    `100,000 iterations must finish under 50ms (strictly O(1) scalar math), took: ${duration.toFixed(2)}ms`
  );
});

test('useContinuousStreamPacingB and AiChatScreen integration contracts', () => {
  const hookContent = fs.readFileSync(
    path.join(__dirname, '../src/hooks/useContinuousStreamPacingB.ts'),
    'utf-8'
  );
  assert.match(hookContent, /calculateBurstAwareElasticVelocity/, 'Hook must invoke calculateBurstAwareElasticVelocity');
  assert.match(hookContent, /velocityRef\.current = 4\.5/, 'Hook must inject First-Burst initial impulse');

  const screenContent = fs.readFileSync(
    path.join(__dirname, '../src/screens/AiChatScreen.tsx'),
    'utf-8'
  );
  assert.match(screenContent, /MESSAGE_LIST_ANCHOR_CONFIG = \{ minIndexForVisible: 0 \}/, 'FlatList anchor must use stable minIndexForVisible: 0');
  assert.match(screenContent, /followLatestMessage\(false\)/, 'AiChatScreen return to latest must follow latest message');
  assert.match(screenContent, /markScrollGestureSettled\(\)/, 'AiChatScreen return to latest must settle scroll gesture');
  assert.doesNotMatch(screenContent, /handleStreamingBubbleHeightChange/, 'Auto-pause reading anchor must be reverted');
  assert.doesNotMatch(screenContent, /stopGuidedGlide/, 'Guided glide must be cleanly reverted');

  // Verify SQLite concurrency protection in aiChatService
  const chatServiceContent = fs.readFileSync(
    path.join(__dirname, '../src/ai/aiChatService.ts'),
    'utf-8'
  );
  assert.match(chatServiceContent, /runWithTransactionRetry/, 'aiChatService must include runWithTransactionRetry helper');
  assert.match(chatServiceContent, /database is locked/, 'runWithTransactionRetry must catch database is locked');
  assert.match(chatServiceContent, /cannot rollback/, 'runWithTransactionRetry must catch cannot rollback');
});
