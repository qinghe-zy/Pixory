const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { PixelRatio: { getFontScale: () => 1 } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { estimatePromptTokens } = require(path.join(root, 'src/ai/aiContextBudget.ts'));
const { splitStreamingTextIntoBlocks } = require(path.join(root, 'src/ai/aiStreamingBlockSplitter.ts'));

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(iterations, operation) {
  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    operation();
    samples.push(performance.now() - startedAt);
  }
  return Number(median(samples).toFixed(3));
}

const mixedUnit = '中文 English 日本語 한국어 12345 🙂\n';
const prompt = mixedUnit.repeat(Math.ceil(1_048_576 / mixedUnit.length)).slice(0, 1_048_576);
const paragraphs = Array.from(
  { length: 240 },
  (_, index) => `第 ${index + 1} 段。${'streaming text '.repeat(16)}`,
);
const stream = paragraphs.join('\n\n');
const patchSizes = Array.from({ length: 200 }, (_, index) =>
  Math.ceil(((index + 1) / 200) * stream.length),
);

const result = {
  environment: {
    node: process.version,
    platform: process.platform,
  },
  splitterFullReplayMedianMs: measure(7, () => {
    for (const size of patchSizes) {
      splitStreamingTextIntoBlocks({
        bubbleWidth: 320,
        content: stream.slice(0, size),
        generationId: 'benchmark-generation',
        lane: 'content',
        messageId: 'benchmark-message',
      });
    }
  }),
  tokenEstimateMedianMs: measure(21, () => estimatePromptTokens(prompt)),
  workload: {
    patchCount: patchSizes.length,
    promptChars: prompt.length,
    streamChars: stream.length,
  },
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
