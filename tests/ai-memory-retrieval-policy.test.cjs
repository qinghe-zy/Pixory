const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const retrievalPath = path.join(root, 'src/ai/memory/memoryRetrievalService.ts');
const compilerPath = path.join(root, 'src/ai/memory/contextCompiler.ts');
const memoryServicePath = path.join(root, 'src/ai/aiMemoryService.ts');

function loadTypeScriptModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filePath,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(transpiled, {
    exports: module.exports,
    module,
    require,
    TextEncoder,
  }, { filename: filePath });
  return module.exports;
}

test('retrieval score uses calibrated fallback and no-Embedding lexical fallback', () => {
  const retrieval = loadTypeScriptModule(retrievalPath);
  const score = retrieval.scoreMemoryClaim({
    lexical: 0.8,
    semantic: 0,
    temporalFit: 0.7,
    continuityFit: 0.9,
    importance: 0.8,
    confidenceCalibrated: null,
    confidenceBand: 'high',
    stalePenalty: 0,
    conflictPenalty: 0,
    redundancyPenalty: 0,
  }, { embeddingAvailable: false });
  assert.equal(score.embeddingAvailable, false);
  assert.ok(score.value > 0);
  assert.equal(retrieval.RETRIEVAL_SCORER_VERSION, 'retrieval-v1');
});

test('retrieval admission rejects unrelated high-importance memories without lexical or semantic evidence', () => {
  const retrieval = loadTypeScriptModule(retrievalPath);
  assert.equal(retrieval.shouldAdmitMemoryCandidate({ lexical: 0, semantic: 0 }, { embeddingAvailable: false }), false);
  assert.equal(retrieval.shouldAdmitMemoryCandidate({ lexical: 0.25, semantic: 0 }, { embeddingAvailable: false }), true);
  assert.equal(retrieval.shouldAdmitMemoryCandidate({ lexical: 0, semantic: 0.6 }, { embeddingAvailable: true }), true);
});

test('context compiler never allocates negative slots for small contexts', () => {
  const compiler = loadTypeScriptModule(compilerPath);
  for (const maxContextTokens of [1024, 2048, 4096, 8192, 32768]) {
    const budget = compiler.allocateContextBudget(maxContextTokens);
    for (const value of Object.values(budget)) {
      assert.ok(value >= 0, `${maxContextTokens} produced ${value}`);
    }
    assert.ok(budget.C0 + budget.C1 + budget.C2 + budget.C3 + budget.C4 + budget.C5 + budget.C6 <= maxContextTokens);
  }
});

test('chat memory path uses the new retrieval and usage-contract modules', () => {
  const retrieval = fs.readFileSync(retrievalPath, 'utf8');
  const compiler = fs.readFileSync(compilerPath, 'utf8');
  const memoryService = fs.readFileSync(memoryServicePath, 'utf8');
  assert.match(retrieval, /retrieval-v1/);
  assert.match(compiler, /Memory Usage Prompt Contract|usage=|certainty/);
  assert.match(memoryService, /memoryRetrievalService|retrieveMemoryClaims/);
});
