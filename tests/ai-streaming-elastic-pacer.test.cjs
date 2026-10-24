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
  calculateAdaptiveElasticVelocity,
  calculateContinuousStreamVelocity,
  updateThroughputEstimate,
} = require(path.join(root, 'src/ai/aiStreamingSmoother.ts'));

if (oldLoader) require.extensions['.ts'] = oldLoader;
else delete require.extensions['.ts'];

test('Adaptive Elastic Engine: O(1) time complexity benchmark under 100,000 iterations', () => {
  const iterations = 100000;

  // 1. Benchmark calculateAdaptiveElasticVelocity
  const start1 = performance.now();
  for (let i = 0; i < iterations; i++) {
    const backlog = (i % 120);
    const throughput = (i % 30) * 0.2;
    calculateAdaptiveElasticVelocity(backlog, throughput);
  }
  const duration1 = performance.now() - start1;
  // 100k scalar iterations should complete well under 50ms (typically ~5-15ms)
  assert.ok(
    duration1 < 50,
    `calculateAdaptiveElasticVelocity 100k iterations took ${duration1.toFixed(2)}ms, exceeding O(1) expectation`,
  );

  // 2. Benchmark updateThroughputEstimate
  const start2 = performance.now();
  let estimate = 0;
  for (let i = 0; i < iterations; i++) {
    estimate = updateThroughputEstimate(estimate, (i % 40) + 1, 16.67);
  }
  const duration2 = performance.now() - start2;
  assert.ok(
    duration2 < 50,
    `updateThroughputEstimate 100k iterations took ${duration2.toFixed(2)}ms, exceeding O(1) expectation`,
  );
});

test('Adaptive Elastic Engine: Phase 1 provides serene anti-jitter cruise floor for network gaps', () => {
  // Empty backlog -> 0
  assert.equal(calculateAdaptiveElasticVelocity(0), 0);
  assert.equal(calculateAdaptiveElasticVelocity(-3), 0);

  // Backlog <= 12: upgraded anti-jitter cruise floor with lossless model rate following
  const vel1 = calculateAdaptiveElasticVelocity(1);
  const vel6 = calculateAdaptiveElasticVelocity(6);
  const vel12 = calculateAdaptiveElasticVelocity(12);

  assert.ok(vel1 >= 0.85 && vel1 <= 0.95, `Backlog=1 velocity should be ~0.89, got ${vel1}`);
  assert.ok(vel6 >= 1.05 && vel6 <= 1.15, `Backlog=6 velocity should be ~1.09, got ${vel6}`);
  assert.ok(vel12 >= 1.30 && vel12 <= 1.40, `Backlog=12 velocity should be ~1.33, got ${vel12}`);

  // When model generates fast, Phase 1 must never throttle below throughput
  const fastThroughput = 3.0;
  const velWithThroughput = calculateAdaptiveElasticVelocity(6, fastThroughput);
  assert.ok(
    velWithThroughput >= fastThroughput,
    `Phase 1 must follow model throughput (${fastThroughput}), got: ${velWithThroughput}`
  );
});

test('Adaptive Elastic Engine: Phase 2 dynamically matches model production rate without lag', () => {
  // Model generating at ~120 chars/sec (~2.0 chars/frame)
  const modelThroughput = 2.0;

  // For a medium backlog of 20 chars, velocity should match or exceed model throughput
  const vel = calculateAdaptiveElasticVelocity(20, modelThroughput);
  assert.ok(vel >= modelThroughput, `Expected velocity >= ${modelThroughput}, got ${vel}`);

  // Without throughput, base curve accelerates gently
  const baseVel20 = calculateAdaptiveElasticVelocity(20, 0);
  assert.ok(baseVel20 > 1.0 && baseVel20 < 3.0, `Base velocity at 20 chars should be ~1.96, got ${baseVel20}`);
});

test('Adaptive Elastic Engine: Phase 3 rapidly converges massive bursts (<200ms lag budget)', () => {
  // Massive sudden chunk (e.g. 100 chars code block)
  const vel100 = calculateAdaptiveElasticVelocity(100, 0);
  assert.ok(vel100 > 8.0, `Burst velocity at 100 chars should be aggressive (~10+), got ${vel100}`);

  // Capped at 60 chars/frame (~3600 chars/sec) to avoid unbounded GPU/Layout choking
  const vel1000 = calculateAdaptiveElasticVelocity(1000, 0);
  assert.equal(vel1000, 60, `Extreme burst should cap at 60 chars/frame, got ${vel1000}`);
});

test('useContinuousStreamPacingB maintains strict physical decoupling and instant 0ms settlement', () => {
  const hookContent = fs.readFileSync(
    path.join(__dirname, '../src/hooks/useContinuousStreamPacingB.ts'),
    'utf-8',
  );

  // Verifies imports and O(1) adaptive elastic functions
  assert.match(hookContent, /calculateAdaptiveElasticVelocity/, 'Must use calculateAdaptiveElasticVelocity');
  assert.match(hookContent, /updateThroughputEstimate/, 'Must track model throughput');

  // Verifies 0ms instant settlement when !isStreaming
  assert.match(hookContent, /if \(!isStreaming\) \{[\s\S]*?setDisplayedText\(rawText\);[\s\S]*?return;/, 'Must settle instantly on stream completion');

  // Verifies extended 30-frame jitter buffer (~500ms)
  assert.match(hookContent, /idleFramesRef\.current > 30/, 'Must maintain 30-frame jitter buffer window');
});
