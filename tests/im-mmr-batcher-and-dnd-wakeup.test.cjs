const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const ts = require('typescript');

function loadTsModule(relativePath, mockRequire = {}) {
  const fullPath = path.resolve(__dirname, relativePath);
  const code = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  const customRequire = (id) => {
    if (mockRequire[id]) return mockRequire[id];
    try {
      return require(id);
    } catch {
      return {};
    }
  };
  new Function('module', 'exports', 'require', '__dirname', '__filename', transpiled)(
    m,
    m.exports,
    customRequire,
    path.dirname(fullPath),
    fullPath
  );
  return m.exports;
}

const {
  compute2GramJaccardSimilarity,
  selectDiverseMemoriesMMR,
} = loadTsModule('../src/core/memory/zeroVectorRetriever.ts', {
  '../../database': {},
  '../../database/index': {},
  './memoryRepository': {},
  './memoryScorer': { scoreCompanionMemory: () => null, sanitizeAndExtractFtsTerms: () => [] },
});

const {
  MemoryExtractionBatcher,
} = loadTsModule('../src/core/memory/memoryExtractionBatcher.ts', {
  '../../database': {},
  '../../database/index': {},
  './memoryModelExtractor': {},
});

const {
  resolveEffectiveDnd,
  isTimestampInDnd,
  shiftTimestampPastDnd,
} = loadTsModule('../src/im/heartbeat/imDndGuard.ts');

const {
  planFallbackProactivePing,
} = loadTsModule('../src/im/engine/imProactiveFallbackPlanner.ts', {
  '../types': {},
  '../heartbeat/proactivePacingGuard': {
    evaluateProactivePacing: (consecutive, lastInteraction, now) => ({
      allowHeartbeat: true,
      tier: 1,
      suggestedDelayMs: 45 * 60 * 1000,
    }),
  },
  './proactiveTimingEvaluator': { detectSituationalDelay: () => null },
  './naturalTimeParser': {
    isTimeInSleepPeriod: () => false,
    getNextMorning730: (t) => t + 8 * 3600 * 1000,
  },
});

test('im-mmr-batcher-and-dnd-wakeup: MMR多样性、批处理防抖与双层DND唤醒测试', async (t) => {
  await t.test('1. compute2GramJaccardSimilarity & selectDiverseMemoriesMMR: 多样性重排防记忆重叠', () => {
    // 1.1 相同文本相似度为 1
    const s1 = compute2GramJaccardSimilarity('喜欢喝美式咖啡', '喜欢喝美式咖啡');
    assert.equal(s1, 1);

    // 1.2 高重叠文本相似度较高
    const s2 = compute2GramJaccardSimilarity('喜欢喝冰美式咖啡', '经常喝冰美式咖啡');
    assert.equal(s2 > 0.4, true);

    // 1.3 完全不同文本相似度极低
    const s3 = compute2GramJaccardSimilarity('喜欢喝美式咖啡', '明天准备去上海出差');
    assert.equal(s3 < 0.2, true);

    // 1.4 MMR 多样性筛选：避免候选集全被几乎重复的同类记忆填满
    const candidates = [
      { id: 'm1', content: '用户每天早起喜欢喝一杯无糖冰美式', score: 0.95 },
      { id: 'm2', content: '用户每天早晨喜欢喝一杯冰美式咖啡', score: 0.94 }, // 与 m1 高度重复
      { id: 'm3', content: '用户正在备考法律硕士研究生', score: 0.88 },       // 独立重要记忆
      { id: 'm4', content: '用户养了一只名叫布丁的金毛犬', score: 0.85 },     // 独立重要记忆
    ];

    const selected = selectDiverseMemoriesMMR(candidates, 3, 0.7);
    assert.equal(selected.length, 3);
    assert.equal(selected[0].id, 'm1');
    // m2 由于与已选的 m1 相似度过高，其在 MMR 惩罚下让位于独立维度的 m3 和 m4
    const selectedIds = selected.map((m) => m.id);
    assert.equal(selectedIds.includes('m3'), true, 'Should include diverse topic m3');
    assert.equal(selectedIds.includes('m4'), true, 'Should include diverse topic m4');
  });

  await t.test('2. MemoryExtractionBatcher: 批处理合并与防抖', async () => {
    const batcher = new MemoryExtractionBatcher();
    let executedCalls = 0;
    let extractedPayload = null;

    batcher.setExtractorForTest(async (params) => {
      executedCalls++;
      extractedPayload = params;
    });

    const mockItem = {
      space: 'normal',
      roleCardId: 'role_test',
      chatProviderId: 'deepseek',
      chatModelId: 'deepseek-chat',
      userMessage: '今天买了新耳机',
      assistantMessage: '恭喜呀，音质怎么样？',
      existingFacts: [],
    };

    // 单次入队
    batcher.enqueue(mockItem);
    assert.equal(batcher.getPendingCount('normal:role_test'), 1);

    // 立即手动 flushKey
    await batcher.flushKey('normal:role_test');
    assert.equal(executedCalls, 1);
    assert.equal(extractedPayload.userMessage.includes('今天买了新耳机'), true);
    assert.equal(batcher.getPendingCount('normal:role_test'), 0);
  });

  await t.test('3. resolveEffectiveDnd: 伴侣独立设置 > 全局设置 > 默认值', () => {
    // 3.1 伴侣显式覆盖
    const customDnd = resolveEffectiveDnd(
      { dndOverrideEnabled: true, dndStartTime: '01:00', dndEndTime: '09:00' },
      { enabled: true, startTime: '23:00', endTime: '07:30' }
    );
    assert.equal(customDnd.source, 'custom_override');
    assert.equal(customDnd.startTime, '01:00');
    assert.equal(customDnd.endTime, '09:00');

    // 3.2 伴侣显式关闭 DND
    const offDnd = resolveEffectiveDnd(
      { dndOverrideEnabled: false },
      { enabled: true, startTime: '23:00', endTime: '07:30' }
    );
    assert.equal(offDnd.enabled, false);

    // 3.3 跟随全局设置
    const globalDnd = resolveEffectiveDnd(
      { dndOverrideEnabled: null },
      { enabled: true, startTime: '22:30', endTime: '08:00' }
    );
    assert.equal(globalDnd.source, 'global');
    assert.equal(globalDnd.startTime, '22:30');
  });

  await t.test('4. planFallbackProactivePing: 频次档位 (frequent / calm / silent) 调谐', () => {
    const fixedNow = new Date('2026-05-20T14:00:00Z').getTime();

    // 4.1 静默档位：彻底关闭主动消息
    const silentPlan = planFallbackProactivePing({
      consecutiveUnreplied: 0,
      lastUserInteractionAt: fixedNow,
      proactiveFrequencyGear: 'silent',
      now: fixedNow,
    });
    assert.equal(silentPlan, null);

    // 4.2 粘人档位 (frequent)：间隔较短
    const frequentPlan = planFallbackProactivePing({
      consecutiveUnreplied: 0,
      lastUserInteractionAt: fixedNow,
      proactiveFrequencyGear: 'frequent',
      now: fixedNow,
    });
    assert.equal(frequentPlan !== null, true);

    // 4.3 克制档位 (calm)：间隔较长
    const calmPlan = planFallbackProactivePing({
      consecutiveUnreplied: 0,
      lastUserInteractionAt: fixedNow,
      proactiveFrequencyGear: 'calm',
      now: fixedNow,
    });
    assert.equal(calmPlan !== null, true);

    const freqDelay = frequentPlan.targetTimestamp - fixedNow;
    const calmDelay = calmPlan.targetTimestamp - fixedNow;
    assert.equal(freqDelay < calmDelay, true, 'Frequent gear must schedule earlier than calm gear');
  });
});
