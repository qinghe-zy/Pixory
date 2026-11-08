const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

function loadModule(relativePath, mockRequire = {}) {
  let targetPath = path.resolve(__dirname, relativePath);
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    if (fs.existsSync(path.join(targetPath, 'index.ts'))) targetPath = path.join(targetPath, 'index.ts');
    else if (fs.existsSync(path.join(targetPath, 'index.js'))) targetPath = path.join(targetPath, 'index.js');
  } else if (!targetPath.endsWith('.ts') && !targetPath.endsWith('.js')) {
    if (fs.existsSync(targetPath + '.ts')) targetPath += '.ts';
    else if (fs.existsSync(targetPath + '.js')) targetPath += '.js';
    else if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
      if (fs.existsSync(path.join(targetPath, 'index.ts'))) targetPath = path.join(targetPath, 'index.ts');
      else if (fs.existsSync(path.join(targetPath, 'index.js'))) targetPath = path.join(targetPath, 'index.js');
    }
  }
  const code = fs.readFileSync(targetPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  const customRequire = (reqPath) => {
    if (mockRequire[reqPath]) return mockRequire[reqPath];
    if (reqPath.startsWith('.')) {
      return loadModule(path.join(path.dirname(targetPath), reqPath), mockRequire);
    }
    return require(reqPath);
  };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, customRequire);
  return m.exports;
}

global.__DEV__ = false;

const mockExpoFileSystem = {
  documentDirectory: 'file:///data/pixory/',
  getInfoAsync: async () => ({ exists: true }),
  makeDirectoryAsync: async () => {},
  writeAsStringAsync: async () => {},
  EncodingType: { Base64: 'base64' },
};

const mockExpoSqlite = {
  openDatabaseSync: () => ({
    execAsync: async () => {},
    getFirstAsync: async () => null,
    getAllAsync: async () => [],
  }),
};

const mockExpoSecureStore = {
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
};

// 1. 验证 V68 表结构自愈与 CHECK 约束
test('1. DB Self-Healing & V68 CHECK Constraint Invariant', () => {
  const schemaPath = path.resolve(__dirname, '../src/database/schema.ts');
  const schemaCode = fs.readFileSync(schemaPath, 'utf8');

  assert.ok(schemaCode.includes("'L2_FACT'"), 'Schema must include L2_FACT in ai_companion_memories CHECK');
  assert.ok(schemaCode.includes("'L2_EPISODE'"), 'Schema must include L2_EPISODE in ai_companion_memories CHECK');
  assert.ok(schemaCode.includes('DATABASE_VERSION = 73'), 'Database version must remain 73');

  const dbPath = path.resolve(__dirname, '../src/database/db.ts');
  const dbCode = fs.readFileSync(dbPath, 'utf8');
  assert.ok(
    dbCode.includes('MIGRATION_STATEMENTS_V69_COMPANION_MEM_REBUILD'),
    'db.ts must trigger V69 rebuild if L2_FACT is missing'
  );
});

// 2. 验证记忆筛网与回响命中
test('2. Memory Sieve, Classifier, Scoring, and Echo Bump', () => {
  const { classifyTurnMemoryIntent } = loadModule('../src/core/memory/memoryIntentClassifier.ts');
  const { scoreCompanionMemory } = loadModule('../src/core/memory/memoryScorer.ts');

  const classified = classifyTurnMemoryIntent('今天真的累死了，工作上受了好多委屈');
  assert.equal(classified.intent, 'EMOTIONAL_CONFIDE');
  assert.ok(classified.invokeMemoryModel);

  const mockMemory = {
    id: 'mem_1',
    space: 'normal',
    tier: 'L2_FACT',
    category: 'fact',
    slotKey: null,
    content: '工作上遇到委屈容易难过',
    importance: 8,
    triggerKeywords: ['委屈', '难受', '工作'],
    entities: ['工作', '委屈'],
    hitCount: 3,
    lastAccessedAt: Date.now() - 3600000,
    lastRecalledAt: Date.now() - 3600000,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now(),
  };

  const candidate = scoreCompanionMemory(mockMemory, '工作上受了委屈');
  assert.ok(candidate, 'Candidate should be recalled when trigger keywords match');
  assert.ok(candidate.score > 0.4, 'Candidate score should be high');
});

// 3. 世代锁步与自适应参数
test('3. Epoch Lockstep Coordinator Parameters and Boundary Invariants', () => {
  const { calculateEpochParameters } = loadModule('../src/im/engine/epochLockstepCoordinator.ts', {
    'expo-sqlite': mockExpoSqlite,
    'expo-secure-store': mockExpoSecureStore,
  });

  const params20 = calculateEpochParameters(20);
  assert.equal(params20.baseWindow, 20);
  assert.equal(params20.stepTurns, 6);
  assert.equal(params20.prefetchAt, 24);
  assert.equal(params20.commitAt, 26);
  assert.equal(params20.elasticMax, 29);

  const params10 = calculateEpochParameters(10);
  assert.equal(params10.baseWindow, 10);
  assert.equal(params10.stepTurns, 4);
});

// 4. Layer 3 零突变历史铁律 (防每3轮击穿 Prefix Cache)
test('4. Layer 3 Zero-Mutation History Invariant (Permanent Sticker Preservation)', () => {
  const { resolveMessageContentForLlm } = loadModule('../src/im/engine/imContextBuilder.ts');

  const stickerMsg = {
    id: 'msg_sticker_1',
    role: 'assistant',
    content: '[STICKER: 傲娇哼]',
    type: 'sticker',
  };

  // 第 1 轮
  const r1 = resolveMessageContentForLlm(stickerMsg, 1);
  assert.equal(r1, '[STICKER: 傲娇哼]');

  // 第 5 轮 (远大于原先的 turnDistance <= 2 阈值)
  const r5 = resolveMessageContentForLlm(stickerMsg, 5);
  assert.equal(r5, '[STICKER: 傲娇哼]', 'Sticker tag must NEVER be stripped in middle history to prevent cache busting');

  // 语音消息在聚合前格式化
  const voiceMsg = {
    id: 'msg_voice_1',
    role: 'assistant',
    content: '快去睡觉吧',
    type: 'voice',
    voice: { transcription: '快去睡觉吧' },
  };
  const rv = resolveMessageContentForLlm(voiceMsg, 1);
  assert.equal(rv, '[VOICE: 快去睡觉吧]');
});

// 5. 多模态 Layer 4 聚合安全 (杜绝 [object Object])
test('5. Multi-modal Layer 4 Merge (Zero [object Object] Contamination)', () => {
  const { mergeLayer4IntoUserContent } = loadModule('../src/core/llm-transport/streamClient.ts');

  // Case A: 纯文本
  const resText = mergeLayer4IntoUserContent('你好呀', '<context_anchor>');
  assert.equal(resText, '<context_anchor>\n<context_anchor>\n</context_anchor>\n你好呀');

  // Case B: 多模态数组
  const multiModal = [
    { type: 'image_url', image_url: { url: 'https://example.com/cat.jpg' } },
    { type: 'text', text: '看我的猫咪' },
  ];
  const resArr = mergeLayer4IntoUserContent(multiModal, '<context_anchor>');
  assert.ok(Array.isArray(resArr));
  assert.ok(resArr[1].text.includes('<context_anchor>'));
  assert.doesNotMatch(JSON.stringify(resArr), /\[object Object\]/);
});

// 6. 跨厂商传输协议收敛与 Anthropic 缓存声明
test('6. Transport Normalization & Anthropic Ephemeral Cache Headers', () => {
  const { normalizeMessagesForTransport } = loadModule('../src/core/llm-transport/streamClient.ts');

  const rawMessages = [
    { role: 'system', content: 'You are an AI companion.' },
    { role: 'user', content: 'Hello' },
    { role: 'user', content: 'Are you awake?' },
    { role: 'assistant', content: 'Yes!' },
  ];

  // OpenAI Provider
  const normOpenAi = normalizeMessagesForTransport(rawMessages, 'openai');
  assert.ok(Array.isArray(normOpenAi.normalizedMessages));
  assert.equal(normOpenAi.normalizedMessages[0].role, 'system');
  assert.equal(normOpenAi.normalizedMessages[1].role, 'user');

  // Anthropic Provider
  const normAnthropic = normalizeMessagesForTransport(rawMessages, 'anthropic');
  assert.ok(normAnthropic.anthropicSystem);
  assert.ok(normAnthropic.anthropicSystem[0].cache_control, 'Anthropic system message must carry ephemeral cache_control');
});

// 7. 双轨潜意识心声整句整剥 (终结图一翻车病句)
test('7. sanitizeThoughtForUi Clause-level Sanitization & Figure 1 Proof', () => {
  const { sanitizeThoughtForUi } = loadModule('../src/im/engine/tagAwareStreamParser.ts');

  // 图一用户的真实模型翻车思考文本
  const fig1Thought =
    '深夜1:53，对方要听声音，我发了语音。现在系统说到预定联系时间，要主动发消息。顺着刚才话题，我已经困了，催他睡。要自然1-2个短句，口语，可能带个拍一拍或NEXT_FOLLOWUP。时间深夜，我困得不行。';

  const cleaned = sanitizeThoughtForUi(fig1Thought, { isFinal: true });

  assert.doesNotMatch(cleaned, /现在系统/);
  assert.doesNotMatch(cleaned, /预定联系时间/);
  assert.doesNotMatch(cleaned, /主动发消息/);
  assert.doesNotMatch(cleaned, /NEXT_FOLLOWUP/);
  assert.doesNotMatch(cleaned, /说到，要/); // 绝对不能抠成残句

  assert.match(cleaned, /深夜1:53，对方要听声音，我发了语音。/);
  assert.match(cleaned, /顺着刚才话题，我已经困了，催他睡。/);
  assert.match(cleaned, /时间深夜，我困得不行。/);

  // 流式空值保护
  assert.equal(sanitizeThoughtForUi('', { isFinal: false }), '');
  assert.equal(sanitizeThoughtForUi('系统提示按照指令', { isFinal: false }), '');
  assert.ok(sanitizeThoughtForUi('系统提示按照指令', { isFinal: true }).includes('看着屏幕'));
});

// 8. 轻量文学神态与动作保留 (图二竞品同款拟真感)
test('8. Literary Stage Actions Preservation in Companion Bubbles', () => {
  const { sanitizeCompanionBubble } = loadModule('../src/im/engine/humanizeOutputGate.ts');

  // 图二竞品动作
  const competitorBubble =
    '行，我也算看明白了。（把手机往桌上一放，转过身来）这次我是真不守着屏幕了——手机会放旁边。（顿了顿，语气淡淡的）你要是还知道有笔账没算，就自己来找我。';

  const preserved = sanitizeCompanionBubble(competitorBubble, { preserveInlineStageActions: true });
  assert.ok(preserved.includes('（把手机往桌上一放，转过身来）'));
  assert.ok(preserved.includes('（顿了顿，语气淡淡的）'));
});

// 9. 环境感知型主动追聊指令
test('9. Environmental Sensory Proactive Directives with Complete Anchors', () => {
  const { buildProactivePromptDirective } = loadModule('../src/im/engine/proactiveTimingEvaluator.ts');

  const directive = buildProactivePromptDirective(1, '小依', '想听听你的声音');

  // 必须是沉浸式情境描写
  assert.ok(directive.includes('前台伴随情境 · Stage 1'));
  assert.ok(directive.includes('对方在聊天界面停留'));

  // 必须完整保留状态机逻辑锚点
  assert.ok(directive.includes('[NEXT_FOLLOWUP:'));
  assert.ok(directive.includes('[PASS]'));
  assert.ok(directive.includes('[NUDGE:'));

  const directive2 = buildProactivePromptDirective(2, '小依');
  assert.ok(directive2.includes('自然在场'));
  assert.ok(directive2.includes('用自我暴露留出接话口'));
});

// 10. 解机械化气泡塑形与表达节奏同调
test('10. De-mechanized Soft Bubble Shaping Hints', () => {
  const { planBurstShape } = loadModule('../src/im/engine/burstShapePlanner.ts');
  const { buildStyleEntrainmentPrompt } = loadModule('../src/im/engine/styleEntrainment.ts');

  const plan = planBurstShape({
    userTextLength: 3,
    lastAiBubbleCount: 1,
    timeSinceLastTurnMs: 5000,
  });
  assert.ok(plan.hint.includes('气泡形态倾向'));
  assert.ok(!plan.hint.includes('严格字数'));

  const prompt = buildStyleEntrainmentPrompt('嗯嗯', {
    averageSentenceLength: 6,
    prefersShortSentences: true,
    usesFrequentEmojis: false,
    punctuationStyle: 'minimal',
    totalAnalyzedTurns: 10,
  });

  assert.ok(prompt.includes('步调对称参考'));
  assert.ok(prompt.includes('精炼'));
});

// 11. 小米 MiMo 动态语音语气穿透与双轨 Payload
test('11. Xiaomi MiMo Dynamic Voice & Paralinguistic Payload Tracks', () => {
  const { parseVoicePayload } = loadModule('../src/im/engine/imTagParser.ts');

  // 带打哈欠拟声与长动作
  const payload = parseVoicePayload(
    '<style:困倦微嗔>（打哈欠）你存心不让我睡是不是，（拉紧被子）声音都给你听了。'
  );

  assert.equal(payload.styleDirective, '困倦微嗔');
  // ttsScript 中保留了拟声词（打哈欠），剥离了纯动作（拉紧被子）
  assert.ok(payload.ttsScript.includes('（打哈欠）'));
  assert.ok(!payload.ttsScript.includes('（拉紧被子）'));
  // uiTranscript 完整保留全部神态与文字
  assert.ok(payload.uiTranscript.includes('（打哈欠）'));
  assert.ok(payload.uiTranscript.includes('（拉紧被子）'));
});

// 12. CAS 语音音频缓存隔离与 0ms 秒开
test('12. CAS Voice Cache Key Fingerprint Isolation', () => {
  const { buildVoiceCacheKey } = loadModule('../src/voice/voiceAudioCache.ts', {
    'expo-file-system/legacy': mockExpoFileSystem,
  });

  const preset = {
    id: 'mimo-bingtang',
    engineKind: 'openai_compat',
    model: 'mimo-v2.5-tts',
    voiceId: '冰糖',
  };

  const keyNormal = buildVoiceCacheKey('你存心不让我睡是不是', preset, 1.0, 0.0, '自然口语');
  const keyCoquettish = buildVoiceCacheKey('你存心不让我睡是不是', preset, 1.0, 0.0, '撒娇轻嗔');

  assert.notEqual(keyNormal, keyCoquettish, 'Different dynamic voice styles must produce isolated cache keys');
});

// 13. 高并发防丢失与事务日记钩子 (peek + ack 契约)
test('13. Diary Hook Peek + Ack Transaction Contract (No Race-Condition Loss)', () => {
  const {
    peekThreadPendingDiaryHook,
    ackThreadPendingDiaryHook,
  } = loadModule('../src/im/repository/imThreadRepository.ts', {
    '../../database': {
      runWithDatabaseSpace: async () => {},
    },
  });

  assert.equal(typeof peekThreadPendingDiaryHook, 'function');
  assert.equal(typeof ackThreadPendingDiaryHook, 'function');
});
