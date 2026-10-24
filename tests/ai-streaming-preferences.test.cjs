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

const { AI_STREAMING_PACING_MODE_KEY } = require(path.join(
  root,
  'src/database/repositories/settingsRepository.ts',
));
const settingsRepo = require(path.join(
  root,
  'src/database/repositories/settingsRepository.ts',
)).default;

if (oldLoader) require.extensions['.ts'] = oldLoader;
else delete require.extensions['.ts'];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('settingsRepository supports AI streaming pacing mode persistence with safe continuous fallback', async () => {
  const store = new Map();
  const mockDb = {
    getFirstAsync: async (_query, ...args) => {
      const key = Array.isArray(args[0]) ? args[0][0] : args[0];
      const val = store.get(key);
      return val !== undefined ? { value: val } : null;
    },
    runAsync: async (_query, ...args) => {
      const [key, val] = Array.isArray(args[0]) ? args[0] : args;
      store.set(key, val);
    },
  };

  // 1. Defaults to continuous
  const defaultMode = await settingsRepo.getAiStreamingPacingMode(mockDb);
  assert.equal(defaultMode, 'continuous');

  // 2. Persists typewriter mode
  await settingsRepo.setAiStreamingPacingMode(mockDb, 'typewriter');
  const savedMode = await settingsRepo.getAiStreamingPacingMode(mockDb);
  assert.equal(savedMode, 'typewriter');
  assert.equal(store.get(AI_STREAMING_PACING_MODE_KEY), 'typewriter');

  // 3. Switch back to continuous
  await settingsRepo.setAiStreamingPacingMode(mockDb, 'continuous');
  const restoredMode = await settingsRepo.getAiStreamingPacingMode(mockDb);
  assert.equal(restoredMode, 'continuous');

  // 4. Malformed / unknown value safely falls back to continuous
  store.set(AI_STREAMING_PACING_MODE_KEY, 'invalid_mode_xxx');
  const safeFallback = await settingsRepo.getAiStreamingPacingMode(mockDb);
  assert.equal(safeFallback, 'continuous');
});

test('PerformanceSettingsScreen renders full-width edge-to-edge items without card shells', () => {
  const code = read('src/screens/PerformanceSettingsScreen.tsx');

  // Must not have card container wrappers
  assert.doesNotMatch(code, /styles\.card\b/);
  assert.doesNotMatch(code, /styles\.tipCard\b/);
  assert.doesNotMatch(code, /borderRadius:\s*radius\.md/);

  // Must use full-width row and list group layout
  assert.match(code, /styles\.fullWidthListGroup/);
  assert.match(code, /styles\.fullWidthRow/);
  assert.match(code, /width:\s*'100%'/);

  // Must include continuous streaming switch and long message folding switch
  assert.match(code, /accessibilityLabel="连续平滑推流模式"/);
  assert.match(code, /accessibilityLabel="历史长消息智能折叠"/);
  assert.match(code, /useAiStreamingPacingPreference/);
  assert.match(code, /useAiHistoryLongMessageFoldingPreference/);
});

test('useSmoothStreamingText and useContinuousStreamPacingB are completely decoupled', () => {
  const typewriterHook = read('src/hooks/useSmoothStreamingText.ts');
  const continuousHook = read('src/hooks/useContinuousStreamPacingB.ts');
  const streamingComponent = read('src/components/ai/AiStreamingMessageText.tsx');
  const bubbleComponent = read('src/components/ai/AiMessageBubble.tsx');

  // Option A (useSmoothStreamingText) is 100% original, zero hook pollution
  assert.match(typewriterHook, /computeSmoothedVisibleLength/);
  assert.doesNotMatch(typewriterHook, /useAiStreamingPacingPreference/);
  assert.doesNotMatch(typewriterHook, /calculateContinuousStreamVelocity/);

  // Option B (useContinuousStreamPacingB) is decoupled and kinetic
  assert.match(continuousHook, /calculateAdaptiveElasticVelocity|calculateContinuousStreamVelocity/);

  // Option B smoothly absorbs active height expansion via AiStreamingHeightAbsorberB
  assert.match(streamingComponent, /AiStreamingHeightAbsorberB/);

  // Option B suppresses footer actions during generation
  assert.match(bubbleComponent, /isContinuousPacing/);
  assert.match(bubbleComponent, /!isContinuousPacing \|\| !isMessageGenerating/);
});
