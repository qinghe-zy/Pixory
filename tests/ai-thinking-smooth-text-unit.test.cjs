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

const { calculateTargetVelocity, fastSafeSlice } = require(path.join(root, 'src/hooks/useThinkingSmoothText.ts'));
if (oldLoader) require.extensions['.ts'] = oldLoader; else delete require.extensions['.ts'];

test('calculateTargetVelocity provides smooth continuous velocity across all tiers', () => {
  // Backlog <= 0
  assert.equal(calculateTargetVelocity(0), 0);
  assert.equal(calculateTargetVelocity(-5), 0);

  // Tier 1: Low backlog (<= 8 chars) - energetic cruising
  const v1 = calculateTargetVelocity(1);
  const v4 = calculateTargetVelocity(4);
  const v8 = calculateTargetVelocity(8);
  assert.ok(v1 >= 1.2 && v1 < 1.5, 'low backlog cruises energetically');
  assert.ok(v4 > v1, 'velocity increases monotonically');
  assert.ok(Math.abs(v8 - 2.16) < 0.01, 'tier 1 endpoint is ~2.16 chars/frame');

  // Tier 2: Medium backlog (8 ~ 30 chars) - smooth linear acceleration
  const v9 = calculateTargetVelocity(9);
  assert.ok(Math.abs(v9 - 2.40) < 0.05, 'boundary transition between tier 1 and tier 2 is smooth');
  const v20 = calculateTargetVelocity(20);
  assert.ok(v20 > v8, 'smooth acceleration');
  const v30 = calculateTargetVelocity(30);
  assert.ok(Math.abs(v30 - 7.44) < 0.01, 'tier 2 endpoint is ~7.44 chars/frame');

  // Tier 3: High backlog (> 30 chars) - dynamic burst catch-up
  const v60 = calculateTargetVelocity(60);
  assert.ok(v60 > 15, 'high backlog triggers rapid burst catch-up');
  const v120 = calculateTargetVelocity(120);
  assert.ok(v120 > 30, 'very high backlog scales high');

  // Cap at 60 chars/frame (~3600 chars/s)
  const v1000 = calculateTargetVelocity(1000);
  assert.equal(v1000, 60, 'burst velocity cleanly caps at 60 to protect frame budget');
});

test('fastSafeSlice slices regular Chinese and ASCII text with O(1) performance', () => {
  assert.equal(fastSafeSlice('', 10), '');
  assert.equal(fastSafeSlice('Hello Pixory', 0), '');
  assert.equal(fastSafeSlice('Hello Pixory', 5), 'Hello');
  assert.equal(fastSafeSlice('Hello Pixory', 50), 'Hello Pixory');

  const chinese = '考虑使用后缀自动机匹配算法';
  assert.equal(fastSafeSlice(chinese, 4), '考虑使用');
  assert.equal(fastSafeSlice(chinese, chinese.length), chinese);
  assert.equal(fastSafeSlice(chinese, chinese.length + 10), chinese);
});

test('fastSafeSlice prevents cutting surrogate pairs in half', () => {
  const emojiText = 'AI💡深度思考';
  // 'A' (index 0, len 1)
  // 'I' (index 1, len 1)
  // '💡' (index 2: \uD83D, index 3: \uDCA1)
  // '深' (index 4, len 1)

  // Cut right at count = 3: index 2 is \uD83D (high surrogate)
  // If not protected, text.slice(0, 3) gives "AI\uD83D" which is corrupted
  const safeSliceAt3 = fastSafeSlice(emojiText, 3);
  assert.equal(safeSliceAt3, 'AI', 'safely backs off by 1 unit to avoid orphaned high surrogate');

  // Cut at count = 4: includes full emoji
  const safeSliceAt4 = fastSafeSlice(emojiText, 4);
  assert.equal(safeSliceAt4, 'AI💡', 'includes full surrogate pair when both units present');

  // Cut at count = 5: includes next Chinese char
  const safeSliceAt5 = fastSafeSlice(emojiText, 5);
  assert.equal(safeSliceAt5, 'AI💡深');
});
