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

test('scheduleHumanBurstTimeline: 总时长软上限保护 (<= 6000ms)', () => {
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
  assert.ok(totalDuration <= 6000, `整轮连发总时长应在软上限6秒内，当前为 ${totalDuration}ms`);
});

test('scheduleHumanBurstTimeline: 支持 8~10+ 条连发不截断且总时长严格 <= 6000ms', () => {
  const sentences = Array.from({ length: 10 }, (_, idx) => `第${idx + 1}条连发气泡消息内容`);
  const timeline = scheduleHumanBurstTimeline(sentences, 20000, undefined, {
    rng: () => 0.5,
  });
  assert.equal(timeline.length, 10, '绝不能再被 .slice(0, 5) 截断丢弃第6~10条气泡');
  const totalDuration = timeline[timeline.length - 1].visibleAt - 20000;
  assert.ok(totalDuration <= 6000, `10条连发总窗口必须压缩在 6000ms 内，当前为 ${totalDuration}ms`);

  // occupied 忙碌状态仍应保留 >= 5000ms 的首句忙碌延迟
  const occupiedTimeline = scheduleHumanBurstTimeline(sentences, 20000, undefined, {
    isOccupied: true,
    rng: () => 0.4,
  });
  assert.equal(occupiedTimeline.length, 10);
  assert.ok(occupiedTimeline[0].delayMs >= 5000, '忙碌态首句延迟必须保持 >= 5000ms');
});

test('calculateHumanTypingDelay: 贴纸模态固定 250~400ms 且第3条起指数衰减并带 300ms 地板', () => {
  const stickerMin = calculateHumanTypingDelay('大笑', undefined, false, {
    modality: 'sticker',
    burstIndex: 5,
    rng: () => 0,
  });
  const stickerMax = calculateHumanTypingDelay('大笑', undefined, false, {
    modality: 'sticker',
    burstIndex: 5,
    rng: () => 1,
  });
  assert.equal(stickerMin, 250);
  assert.equal(stickerMax, 400);

  const sampleText = '这是一句长度适中的普通测试消息内容用来检验衰减';
  const idx2 = calculateHumanTypingDelay(sampleText, undefined, false, {
    burstIndex: 2,
    modality: 'text',
    rng: () => 0.5,
  });
  const idx3 = calculateHumanTypingDelay(sampleText, undefined, false, {
    burstIndex: 3,
    modality: 'text',
    rng: () => 0.5,
  });
  const idx4 = calculateHumanTypingDelay(sampleText, undefined, false, {
    burstIndex: 4,
    modality: 'text',
    rng: () => 0.5,
  });
  const idx12 = calculateHumanTypingDelay(sampleText, undefined, false, {
    burstIndex: 12,
    modality: 'text',
    rng: () => 0.5,
  });

  assert.equal(idx3, Math.max(300, Math.round(idx2 * 0.7)));
  assert.equal(idx4, Math.max(300, Math.round(idx2 * Math.pow(0.7, 2))));
  assert.equal(idx12, 300, '高连发下标指数衰减后必须兜底在 300ms 地板');
});

test('imContextBuilder: 废弃 burstShapeHint 不注入 Layer 4 且记忆包裹 memory_data 标签', () => {
  const payload = buildChatPayload(
    {
      rolePrompt: '你是一个活泼的朋友',
      roleName: '小依',
      recalledMemories: [{ id: 'm1', content: '用户喜欢吃抹茶蛋糕', score: 0.9 }],
      burstShapeHint: '【气泡形态倾向】本轮请只发 1 个精炼极简短气泡',
    },
    '在干嘛呢'
  );

  const layer4 = payload[payload.length - 2];
  assert.equal(layer4.role, 'system');
  assert.equal(layer4.content.includes('【气泡形态倾向】'), false, 'Layer 4 不应注入已废弃的 burstShapeHint');
  assert.ok(layer4.content.includes('<memory_data>'), '记忆数据应被 <memory_data> 标签包裹');
  assert.ok(layer4.content.includes('用户喜欢吃抹茶蛋糕'), '记忆正文应在 memory_data 中展示');
});
