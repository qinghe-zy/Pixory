const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
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

const { calculateContinuousStreamVelocity, computeSmoothedVisibleLength } = require(
  path.join(root, 'src/ai/aiStreamingSmoother.ts'),
);
if (oldLoader) require.extensions['.ts'] = oldLoader;
else delete require.extensions['.ts'];

test('calculateContinuousStreamVelocity provides continuous kinetic pacing curve for Option B', () => {
  // Zero / negative backlog produces 0 velocity
  assert.equal(calculateContinuousStreamVelocity(0), 0);
  assert.equal(calculateContinuousStreamVelocity(-5), 0);

  // Low backlog (1~6 chars): gentle readable cruising (1.0 ~ 1.8 chars/frame)
  const v1 = calculateContinuousStreamVelocity(1);
  const v4 = calculateContinuousStreamVelocity(4);
  const v6 = calculateContinuousStreamVelocity(6);
  assert.ok(v1 >= 1.0 && v1 < 1.3, `v1 should be around 1.13, got ${v1}`);
  assert.ok(v4 > v1 && v4 < 1.7, `v4 should be around 1.53, got ${v4}`);
  assert.ok(Math.abs(v6 - 1.8) < 0.05, `v6 should be around 1.8, got ${v6}`);

  // Medium backlog (6~24 chars): smooth acceleration
  const v12 = calculateContinuousStreamVelocity(12);
  const v24 = calculateContinuousStreamVelocity(24);
  assert.ok(v12 > v6 && v12 < 3.5, `v12 should accelerate, got ${v12}`);
  assert.ok(Math.abs(v24 - 5.4) < 0.05, `v24 should reach around 5.4, got ${v24}`);

  // High burst backlog (> 24 chars): rapid adaptive catchup, guaranteeing no speed loss
  const v50 = calculateContinuousStreamVelocity(50);
  const v100 = calculateContinuousStreamVelocity(100);
  const v200 = calculateContinuousStreamVelocity(200);

  assert.ok(v50 > 15, `v50 should burst rapidly, got ${v50}`);
  assert.ok(v100 > 35, `v100 should be high speed, got ${v100}`);
  assert.equal(v200, 50, `v200 should cap at max limit 50, got ${v200}`);

  // Strictly monotonic non-decreasing
  for (let b = 1; b <= 120; b++) {
    assert.ok(
      calculateContinuousStreamVelocity(b) >= calculateContinuousStreamVelocity(b - 1),
      `Velocity must be monotonic at backlog ${b}`,
    );
  }
});

test('existing computeSmoothedVisibleLength contract is strictly maintained', () => {
  assert.equal(computeSmoothedVisibleLength(10, 50, false), 50);
  assert.equal(computeSmoothedVisibleLength(0, 5, true), 1);
  assert.equal(computeSmoothedVisibleLength(0, 48, true), 8);
});
