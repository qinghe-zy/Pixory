const test = require('node:test');
const assert = require('node:assert/strict');

// 1. 验证 extractJsonObject 鲁棒性
test('extractJsonObject: extracts clean json from markdown fences and surrounding thoughts', async (t) => {
  const ts = require('typescript');
  const fs = require('fs');
  const path = require('path');

  const parserPath = path.resolve(__dirname, '../src/core/utils/jsonParser.ts');
  const code = fs.readFileSync(parserPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const m = { exports: {} };
  new Function('module', 'exports', transpiled)(m, m.exports);
  const { extractJsonObject } = m.exports;

  // 测试用例 A: 带有 ```json 围栏与前后思考
  const rawWithFence = `
思考中... 这里需要提炼记忆。
\`\`\`json
{
  "episodic_continuity": {
    "narrative_summary": "今天一起带猫体检"
  },
  "l1_slot_mutations": [],
  "l2_memory_mutations": [
    { "content": "猫咪叫煤球，脾气很大", "importance": 8 }
  ]
}
\`\`\`
已完成提炼。
`;
  const parsedA = extractJsonObject(rawWithFence);
  assert.ok(parsedA, 'Parsed result should not be null');
  assert.equal(parsedA.episodic_continuity.narrative_summary, '今天一起带猫体检');
  assert.equal(parsedA.l2_memory_mutations[0].content, '猫咪叫煤球，脾气很大');

  // 测试用例 B: 纯 JSON
  const rawPure = '{"status":"ok","alter":0.5}';
  const parsedB = extractJsonObject(rawPure);
  assert.equal(parsedB.status, 'ok');
  assert.equal(parsedB.alter, 0.5);

  // 测试用例 C: 畸形文本容错
  assert.equal(extractJsonObject('普通文本无大括号'), null);
  assert.equal(extractJsonObject(null), null);
  assert.equal(extractJsonObject('{不合法的json}'), null);
});

// 2. 验证 GlobalHeartbeatEngine 生命周期与单例接口
test('GlobalHeartbeatEngine: singleton exports and subscriber pattern verification', async () => {
  const ts = require('typescript');
  const fs = require('fs');
  const path = require('path');

  const enginePath = path.resolve(__dirname, '../src/im/heartbeat/globalHeartbeatEngine.ts');
  const code = fs.readFileSync(enginePath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  // Mock react-native AppState
  const mockAppState = {
    addEventListener: () => ({ remove: () => {} }),
  };

  const m = { exports: {} };
  const mockRequire = (id) => {
    if (id === 'react-native') return { AppState: mockAppState };
    if (id.includes('imThreadRepository')) {
      return {
        getActiveStagedThreadIds: async () => ['thread_test_1'],
        revealPendingMessages: async () => 1,
        getThreadLivingState: async () => null,
        getDuePendingPings: async () => [],
      };
    }
    return {};
  };

  new Function('module', 'exports', 'require', transpiled)(m, m.exports, mockRequire);
  const { GlobalHeartbeatEngine } = m.exports;

  assert.ok(GlobalHeartbeatEngine.shared, 'Shared singleton must exist');

  let revealedThread = null;
  const unsubscribe = GlobalHeartbeatEngine.shared.subscribe((threadId) => {
    revealedThread = threadId;
  });

  await GlobalHeartbeatEngine.shared.scanAndReveal();
  assert.equal(revealedThread, 'thread_test_1', 'Subscriber must receive revealed threadId');

  unsubscribe();
  GlobalHeartbeatEngine.shared.stop();
});
