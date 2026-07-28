const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const intentPath = path.join(root, 'src/ai/memory/memoryIntentDetector.ts');
const observationPath = path.join(root, 'src/ai/memory/memoryCurrentTurnRepository.ts');
const extractorPath = path.join(root, 'src/ai/memory/localFastExtractor.ts');
const queuePath = path.join(root, 'src/ai/aiMemoryMaintenanceQueue.ts');
const deferredPath = path.join(root, 'src/ai/aiMemoryMaintenanceService.ts');
const chatServicePath = path.join(root, 'src/ai/aiChatService.ts');

function loadTypeScriptModule(filePath) {
  const output = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filePath,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    exports: module.exports,
    module,
    require(request) {
      if (request.startsWith('.')) return {};
      return require(request);
    },
  }, { filename: filePath });
  return module.exports;
}

test('intent detection is local, bounded, and structured', () => {
  assert.ok(fs.existsSync(intentPath));
  const source = fs.readFileSync(intentPath, 'utf8');
  assert.match(source, /MemoryIntentDetector/);
  assert.match(source, /intent/);
  assert.match(source, /forget|correction|safety/);
  assert.doesNotMatch(source, /callMemoryMaintenanceModel|fetch\(/);
});

test('destructive memory intent ignores ordinary delete requests and broad present-tense chat', () => {
  const detector = loadTypeScriptModule(intentPath);
  assert.equal(detector.detectMemoryIntent('帮我删除这个文件').intent, 'none');
  assert.equal(detector.detectMemoryIntent('我现在去吃饭').intent, 'none');
  assert.equal(detector.detectMemoryIntent('忘掉这件事').intent, 'forget');
  assert.equal(detector.detectMemoryIntent('纠正一下，我其实不吃辣').intent, 'correction');
});

test('current-turn observations persist idempotently with retention and drain APIs', () => {
  assert.ok(fs.existsSync(observationPath));
  const source = fs.readFileSync(observationPath, 'utf8');
  assert.match(source, /memory_current_turn_observations/);
  assert.match(source, /idempotencyKey/);
  assert.match(source, /expiresAt/);
  assert.match(source, /drain|consume|pending/);
});

test('local extractor excludes reasoning and uses MemoryFacade for Working writes', () => {
  assert.ok(fs.existsSync(extractorPath));
  const source = fs.readFileSync(extractorPath, 'utf8');
  assert.match(source, /LocalFastExtractor/);
  assert.match(source, /MemoryFacade/);
  assert.match(source, /reasoningText|thinking/);
  assert.match(source, /working/);
  assert.doesNotMatch(source, /callMemoryMaintenanceModel/);
});

test('local extraction covers short Chinese preferences and prefix-form safety facts', () => {
  const extractor = loadTypeScriptModule(extractorPath);
  const preference = extractor.extractLocalClaimCandidates('我喜欢猫');
  const safety = extractor.extractLocalClaimCandidates('我对花生过敏');
  assert.equal(preference[0]?.predicate, 'preference.general');
  assert.equal(preference[0]?.valueNormalized, '猫');
  assert.equal(safety[0]?.predicate, 'boundary.safety');
  assert.equal(safety[0]?.safetyState, 'safety_pending');
});

test('reply completion schedules current-turn extraction before remote maintenance', () => {
  const queue = fs.readFileSync(queuePath, 'utf8');
  const deferred = fs.readFileSync(deferredPath, 'utf8');
  assert.match(queue, /runLocalCurrentTurnExtraction|current.turn|currentTurn/);
  assert.match(deferred, /runLocalCurrentTurnExtraction|current.turn|currentTurn/);
});

test('local extraction stores branch-scoped claims when the current turn is on a branch', () => {
  const source = fs.readFileSync(extractorPath, 'utf8');
  assert.match(source, /branchRootMessageId/);
  assert.match(source, /scopeType:\s*branchScopeId\s*\?\s*['"]branch['"]\s*:\s*['"]thread['"]/);
  assert.match(source, /scopeId:\s*branchScopeId/);
  assert.match(source, /branchVersionIndex/);
});

test('explicit forget and correction observations are staged before provider resolution', () => {
  const source = fs.readFileSync(chatServicePath, 'utf8');
  assert.match(source, /stageExplicitMemoryIntentObservation/);
  const streamStart = source.indexOf('async function streamAssistantReply');
  const streamBody = source.slice(streamStart, source.indexOf('\nasync function ', streamStart + 30));
  const stageIndex = streamBody.indexOf('stageExplicitMemoryIntentObservation');
  const providerIndex = streamBody.indexOf('resolveThreadChatModel');
  assert.ok(stageIndex >= 0 && providerIndex >= 0 && stageIndex < providerIndex);
});
