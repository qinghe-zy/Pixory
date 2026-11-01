const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTs(relPath) {
  const full = path.resolve(__dirname, relPath.endsWith('.ts') ? relPath : `${relPath}.ts`);
  const out = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out)(mod, mod.exports, (id) =>
    id.startsWith('.') ? loadTs(path.resolve(path.dirname(full), id)) : require(id)
  );
  return mod.exports;
}

const { planBurstShape } = loadTs('../src/im/engine/burstShapePlanner.ts');
const {
  calculateHumanTypingDelay,
  scheduleHumanBurstTimeline,
} = loadTs('../src/im/config/humanTypingTimeline.ts');
const {
  formatLivingStateAnchor,
  buildChatPayload,
} = loadTs('../src/im/engine/imContextBuilder.ts');

test('planBurstShape: 极短输入偏向 one_liner', () => {
  let oneLinerCount = 0;
  for (let i = 0; i < 50; i++) {
    const res = planBurstShape({
      userTextLength: 2,
      hourOfDay: 14,
      rng: () => (i % 10) / 10,
    });
    if (res.shape === 'one_liner') oneLinerCount++;
  }
  assert.ok(oneLinerCount > 15, `极短输入应显著增加单句占比，当前为 ${oneLinerCount}`);
});

test('planBurstShape: 长段倾诉偏向 long_para 或 rapid_3_5', () => {
  let longCount = 0;
  for (let i = 0; i < 50; i++) {
    const res = planBurstShape({
      userTextLength: 120,
      hourOfDay: 15,
      rng: () => (i % 10) / 10,
    });
    if (res.shape === 'long_para' || res.shape === 'rapid_3_5') longCount++;
  }
  assert.ok(longCount > 20, `长段倾诉应提高长话与连珠炮占比，当前为 ${longCount}`);
});

test('planBurstShape: 防连续三次同形态 (严格抑制)', () => {
  const res = planBurstShape({
    userTextLength: 10,
    hourOfDay: 15,
    recentShapes: ['two', 'two'],
    rng: () => 0.01,
  });
  assert.notEqual(res.shape, 'two', '已连续两轮使用 two 形态时，第三轮必须被抑制');
});

test('calculateHumanTypingDelay: 首句具备拟人阅读与思考耗时', () => {
  const shortRead = calculateHumanTypingDelay('好呀', undefined, true, {
    userTextLength: 2,
    rng: () => 0.5,
  });
  const longRead = calculateHumanTypingDelay('好呀', undefined, true, {
    userTextLength: 60,
    rng: () => 0.5,
  });
  assert.ok(shortRead >= 200, '首句至少有200ms阅读底线');
  assert.ok(longRead > shortRead, '阅读长消息的思考延迟应大于短消息');
});

test('calculateHumanTypingDelay: 忙碌 occupied 时延迟显著放大', () => {
  const delay = calculateHumanTypingDelay('在做卷子', undefined, true, {
    isOccupied: true,
    rng: () => 0.4,
  });
  assert.ok(delay >= 5000, `忙碌状态首句延迟应 >= 5000ms，当前为 ${delay}ms`);
});

test('scheduleHumanBurstTimeline: 总时长软上限保护', () => {
  const sentences = [
    '这是第一句很长很长的段落，需要仔细阅读和回复。',
    '这是第二句很长很长的段落，需要仔细打字。',
    '这是第三句很长很长的段落，需要仔细斟酌。',
    '这是第四句很长很长的段落，需要继续打字。',
  ];
  const timeline = scheduleHumanBurstTimeline(sentences, 10000, undefined, {
    rng: () => 0.5,
  });
  assert.equal(timeline.length, 4);
  const totalDuration = timeline[timeline.length - 1].visibleAt - 10000;
  assert.ok(totalDuration <= 15000, `整轮连发总时长应在软上限15秒内，当前为 ${totalDuration}ms`);
});

test('imContextBuilder: 提示词包含 burstShapeHint 且记忆包裹 memory_data 标签', () => {
  const payload = buildChatPayload(
    {
      rolePrompt: '你是一个活泼的朋友',
      roleName: '小依',
      recalledMemories: [{ id: 'm1', content: '用户喜欢吃抹茶蛋糕', score: 0.9 }],
      burstShapeHint: '【气泡形态倾向】本轮请只发 1 个精炼极简短气泡',
    },
    '在干嘛呢'
  );

  const layer4 = payload.find((p) => p.role === 'system' && p.content.includes('【气泡形态倾向】'));
  assert.ok(layer4, 'Layer 4 应当注入 burstShapeHint');
  assert.ok(layer4.content.includes('<memory_data>'), '记忆数据应被 <memory_data> 标签包裹');
  assert.ok(layer4.content.includes('用户喜欢吃抹茶蛋糕'), '记忆正文应在 memory_data 中展示');
});
