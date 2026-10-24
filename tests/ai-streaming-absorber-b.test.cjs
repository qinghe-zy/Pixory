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

const { calculateAbsorberStep } = require(path.join(root, 'src/ai/aiStreamingSmoother.ts'));
if (oldLoader) require.extensions['.ts'] = oldLoader;
else delete require.extensions['.ts'];

test('calculateAbsorberStep provides serene linear pacing for line wraps and adaptive catch-up for bursts', () => {
  // Delta <= 0 means no lag
  assert.equal(calculateAbsorberStep(0), 0);
  assert.equal(calculateAbsorberStep(-5), 0);

  // Single line wrap (typically 20~28px): constant serene step of 1.5px/frame (~90px/s)
  assert.equal(calculateAbsorberStep(10), 1.5);
  assert.equal(calculateAbsorberStep(24), 1.5);
  assert.equal(calculateAbsorberStep(32), 1.5);

  // Paragraph break (33~80px): 2.5px/frame
  assert.equal(calculateAbsorberStep(33), 2.5);
  assert.equal(calculateAbsorberStep(50), 2.5);
  assert.equal(calculateAbsorberStep(80), 2.5);

  // Massive bursts / code blocks (> 80px): smooth catch-up bounded to ~15 frames
  assert.equal(calculateAbsorberStep(150), 10);
  assert.equal(calculateAbsorberStep(300), 20);
});

test('AiStreamingMessageText integrates AiStreamingHeightAbsorberB with strict Option A/B decoupling', () => {
  const fileContent = fs.readFileSync(
    path.join(__dirname, '../src/components/ai/AiStreamingMessageText.tsx'),
    'utf-8',
  );

  // Verifies import
  assert.match(
    fileContent,
    /import\s+\{\s*AiStreamingHeightAbsorberB\s*\}\s+from\s+'\.\/AiStreamingHeightAbsorberB';/,
    'Must import AiStreamingHeightAbsorberB',
  );

  // Verifies wrapped in component with enabled flag
  assert.match(
    fileContent,
    /<AiStreamingHeightAbsorberB\s+enabled=\{isContinuous\}\s+isStreaming=\{isStreaming\}>/,
    'Must wrap AiMessageContent with enabled={isContinuous} and isStreaming={isStreaming}',
  );

  // Verifies dirty static negative margin has been completely removed
  assert.doesNotMatch(
    fileContent,
    /continuousSubmergedContainer/,
    'Must not contain deprecated continuousSubmergedContainer',
  );
  assert.doesNotMatch(
    fileContent,
    /marginBottom:\s*-22/,
    'Must not contain deprecated -22 static margin',
  );
});

test('AiStreamingHeightAbsorberB source code enforces Option A zero-overhead passthrough and 0ms settlement', () => {
  const fileContent = fs.readFileSync(
    path.join(__dirname, '../src/components/ai/AiStreamingHeightAbsorberB.tsx'),
    'utf-8',
  );

  // Option A passthrough
  assert.match(
    fileContent,
    /if\s*\(!enabled\)\s*\{\s*return\s*<>\s*\{children\}\s*<\/>;\s*\}/,
    'Option A must short-circuit as React fragment with zero wrappers',
  );

  // 0ms instant settlement on completion
  assert.match(
    fileContent,
    /if\s*\(!isStreaming\)\s*\{[\s\S]*stopAnimation\(\);[\s\S]*setRenderedHeight\(null\);[\s\S]*smoothHeightRef\.current\s*=\s*null;/,
    'Must cleanly settle and clear renderedHeight on streaming finish',
  );
});
