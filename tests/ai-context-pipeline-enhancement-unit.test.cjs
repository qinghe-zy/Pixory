const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const oldTs = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename
  );
};

const budget = require(path.join(root, 'src/ai/aiContextBudget.ts'));
const coverage = require(path.join(root, 'src/ai/context/conversationCoverage.ts'));
const citation = require(path.join(root, 'src/ai/aiCitationProtocol.ts'));
const promptBuilder = require(path.join(root, 'src/ai/promptBuilder.ts'));
const providerBudget = require(path.join(root, 'src/ai/context/providerRequestBudget.ts'));

if (oldTs) require.extensions['.ts'] = oldTs;
else delete require.extensions['.ts'];

test('extractSemanticHead extracts natural sentence boundaries and adds continuation ellipsis', () => {
  const sentence = '今天下班后我特意去买了草莓蛋糕。' + '路上突然下起大雨，我全身都湿透了，好不容易才跑进便利店躲雨。';
  const head = coverage.extractSemanticHead(sentence);
  assert.equal(head, '今天下班后我特意去买了草莓蛋糕。...');
});

test('extractSemanticTail extracts complete final sentence with leading ellipsis', () => {
  const dialogue = '我也记得那次大暴雨！虽然你的衣服都湿透了，但蛋糕完好无损。' + '那个场景我现在都历历在目。放心吧，这次我一定会带伞来接你的！' + '因为我答应过你，绝不再让你淋雨。';
  const tail = coverage.extractSemanticTail(dialogue);
  assert.ok(tail.startsWith('...'));
  assert.ok(tail.includes('这次我一定会带伞来接你的！'));
});

test('skeleton bridge handles extreme unpunctuated text with multi-level fallback (emoji, code, digits)', () => {
  const extremeRounds = [
    {
      id: 'm1',
      role: 'user',
      status: 'completed',
      content: '😀'.repeat(80),
      createdAt: '2026-10-20T00:00:00.000Z',
    },
    {
      id: 'm2',
      role: 'assistant',
      status: 'completed',
      content: 'function computeHash(x){return x*31+1234567890;}'.repeat(3),
      createdAt: '2026-10-20T00:00:01.000Z',
    },
    {
      id: 'm3',
      role: 'user',
      status: 'completed',
      content: '1234567890'.repeat(12),
      createdAt: '2026-10-20T00:00:02.000Z',
    },
    {
      id: 'm4',
      role: 'assistant',
      status: 'completed',
      content: 'abcdefghijklmnopqrstuvwxyz'.repeat(5),
      createdAt: '2026-10-20T00:00:03.000Z',
    },
  ];

  const bridge = coverage.buildSkeletonBridge(extremeRounds, 1800);
  assert.ok(bridge.text.startsWith('[skeleton_degraded:'));
  assert.equal(bridge.representedMessageIds.length, 4);
  assert.equal(bridge.uncoveredMessageIds.length, 0);
  // Ensure surrogate pairs are intact for emoji
  assert.ok(bridge.text.includes('😀'));
  assert.ok(bridge.text.includes('computeHash'));
});

test('token calibration distinguishes DeepSeek native from general providers without over-pruning', () => {
  const chineseText = '你好，今天天气真不错，我们一起去森林公园散步吧！' + '这是一个测试长句。'.repeat(10);
  const baseEstimate = budget.estimatePromptTokens(chineseText);
  const deepSeekEstimate = budget.estimateCalibratedPromptTokens(chineseText, { providerProtocol: 'deepseek' });
  const openAiEstimate = budget.estimateCalibratedPromptTokens(chineseText, { providerProtocol: 'openai_compatible' });

  assert.ok(baseEstimate > 0);
  // DeepSeek is close to base estimate (0.85 vs 0.8)
  assert.ok(deepSeekEstimate >= baseEstimate);
  // OpenAI / Claude estimate is higher (~1.25 factor) to prevent 400 context overflow
  assert.ok(openAiEstimate > deepSeekEstimate);
  // Ratio should be bounded around 1.3 - 1.5, never excessive (e.g. not > 2.0)
  const ratio = openAiEstimate / deepSeekEstimate;
  assert.ok(ratio >= 1.2 && ratio <= 1.7, `Expected ratio between 1.2 and 1.7, got ${ratio}`);
});

test('citation registry provides deterministic sorting regardless of asynchronous retrieval order', () => {
  const snippetA = { chunkId: 'chk_101', label: '片段A', text: '设定A内容', locator: {}, score: 0.95 };
  const snippetB = { chunkId: 'chk_202', label: '片段B', text: '设定B内容', locator: {}, score: 0.88 };
  const snippetC = { chunkId: 'chk_050', label: '片段C', text: '设定C内容', locator: {}, score: 0.88 };

  const order1 = citation.buildCitationRegistry([snippetA, snippetB, snippetC]);
  const order2 = citation.buildCitationRegistry([snippetC, snippetB, snippetA]);

  assert.deepEqual(
    order1.map((item) => ({ refId: item.refId, chunkId: item.chunkId })),
    order2.map((item) => ({ refId: item.refId, chunkId: item.chunkId }))
  );
  assert.equal(order1[0].chunkId, 'chk_101'); // Highest score
  assert.equal(order1[1].chunkId, 'chk_050'); // Tied score, sorted by chunkId
  assert.equal(order1[2].chunkId, 'chk_202');
});

test('compileUserObservation deduplicates companionMemoryPrefix if present in dynamicSegments', () => {
  const prefix = '用户喜欢安静与喝咖啡';
  const prompt = promptBuilder.buildNormalChatPrompt({
    chatMode: 'companion',
    companionMemoryPrefix: prefix,
    dynamicSegments: [
      {
        branchRouteHash: 'hash',
        expiresAt: null,
        id: 'user-observation:1',
        privacy: 'normal',
        priority: 60,
        scope: 'thread:t1',
        source: 'automatic-profile',
        text: prefix,
        tokenEstimate: 10,
        traceOnly: false,
        trust: 'derived',
        type: 'user_observation',
        version: 1,
      },
    ],
    memoryEpoch: 'epoch:test',
    systemPrompt: 'You are an assistant',
    userMessage: '今天吃什么？',
  });

  const occurrences = prompt.user.split(prefix).length - 1;
  assert.equal(occurrences, 1, 'companionMemoryPrefix should appear exactly once in user context');
});

test('providerRequestBudget validates compiled request with calibration awareness', () => {
  const body = {
    system: '角色设定：你是一个亲切的生活管家。',
    messages: [
      { role: 'user', content: '今天有哪些重要日程需要提醒我？' },
    ],
  };

  const receipt = providerBudget.validateCompiledRequestBudget(body, {
    modelContextWindowTokens: 16000,
    providerProtocol: 'openai_compatible',
    isDeepSeek: false,
  });

  assert.ok(receipt);
  assert.equal(receipt.fits, true);
  assert.ok(receipt.estimatedInputTokens > 256);
});

test('skeleton bridge flattens internal newlines to keep strict single-line bridge records', () => {
  const multilineRound = [
    {
      id: 'm_multi_1',
      role: 'user',
      status: 'completed',
      content: '第一行用户提问。\n第二行详细描述。\n第三行补充要求。',
      createdAt: '2026-10-20T00:00:00.000Z',
    },
    {
      id: 'm_multi_2',
      role: 'assistant',
      status: 'completed',
      content: '收到你的问题。\n我正在思考方案。\n结论是我们可以这么做。',
      createdAt: '2026-10-20T00:00:01.000Z',
    },
  ];

  const bridge = coverage.buildSkeletonBridge(multilineRound, 1800);
  const bridgeLines = bridge.text.split('\n');
  // First line is header, second line is the record. Must be exactly 2 lines total!
  assert.equal(bridgeLines.length, 2, 'Multiline messages must not break bridge into extra lines');
  assert.ok(bridgeLines[1].startsWith('m_multi_1/m_multi_2 U: '));
  assert.ok(!bridgeLines[1].includes('\n'));
});

test('citation registry places scored snippets ahead of unscored snippets', () => {
  const scored = { chunkId: 'c_scored', label: '有分片段', text: '知识库相关', locator: {}, score: 0.75 };
  const unscored = { chunkId: 'a_unscored', label: '无分片段', text: '固定规则片段', locator: {} };

  // Even if unscored has chunkId 'a' which is lexicographically first, scored should win
  const rows = citation.buildCitationRegistry([unscored, scored]);
  assert.equal(rows[0].chunkId, 'c_scored');
  assert.equal(rows[1].chunkId, 'a_unscored');
});

test('token calibration detects deepseek via providerType option', () => {
  const text = '这是测试 DeepSeek providerType 识别。'.repeat(5);
  const estimateViaProtocol = budget.estimateCalibratedPromptTokens(text, { providerProtocol: 'deepseek' });
  const estimateViaType = budget.estimateCalibratedPromptTokens(text, { providerProtocol: 'openai_compatible', providerType: 'deepseek' });
  assert.equal(estimateViaProtocol, estimateViaType, 'providerType: deepseek must yield identical calibration to protocol');
});
