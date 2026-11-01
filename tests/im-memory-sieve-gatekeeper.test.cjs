const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const ts = require('typescript');

function loadModule(relativePath) {
  const fullPath = path.resolve(__dirname, relativePath);
  const code = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const fn = new Function('require', 'module', 'exports', transpiled);
  fn(require, mod, mod.exports);
  return mod.exports;
}

const {
  shouldAdmitToLongTermMemory,
  calculateMemorySimilarity,
} = loadModule('../src/core/memory/memorySieveGatekeeper.ts');

test('MemorySieveGatekeeper: 记忆防污染与价值过滤大筛网测试', async (t) => {
  await t.test('1. 必须拦截瞬态生理动作与即刻报备', () => {
    const transientCases = [
      '我去洗个澡先',
      '上个厕所，等我一下',
      '刚从洗手间出来',
      '我喝口水',
      '吃饱了，好撑',
      '打了个喷嚏',
      '在刷牙呢',
      '准备躺下睡觉了',
      '刚坐下准备歇会儿',
    ];

    for (const text of transientCases) {
      const res = shouldAdmitToLongTermMemory({ content: text });
      assert.equal(
        res.admit,
        false,
        `预期拒绝瞬态生理记忆: "${text}", 实际: ${JSON.stringify(res)}`
      );
      assert.equal(res.rejectReason, 'transient_physiological_state');
    }
  });

  await t.test('2. 必须拦截闲聊垫话与纯语气附和', () => {
    const fillerCases = [
      '哈哈哈哈',
      '好的',
      '收到！',
      '确实',
      '是的呢',
      '嗯嗯',
      '恩恩~',
      '没事的',
      '这样啊',
      '好吧。',
      '收到啦',
    ];

    for (const text of fillerCases) {
      const res = shouldAdmitToLongTermMemory({ content: text });
      assert.equal(
        res.admit,
        false,
        `预期拒绝闲聊垫话: "${text}", 实际: ${JSON.stringify(res)}`
      );
      assert.equal(res.rejectReason, 'conversational_filler');
    }
  });

  await t.test('3. 必须拦截临时物流与即刻交通状态', () => {
    const logisticsCases = [
      '我去拿个外卖',
      '外卖到了，先吃一口',
      '快递到了我去取快递',
      '电梯来了先不说了',
      '在等红绿灯呢',
      '赶公交中',
      '进地铁了信号不好',
      '先挂了等会聊',
      '我下车了',
    ];

    for (const text of logisticsCases) {
      const res = shouldAdmitToLongTermMemory({ content: text });
      assert.equal(
        res.admit,
        false,
        `预期拒绝临时物流: "${text}", 实际: ${JSON.stringify(res)}`
      );
      assert.equal(res.rejectReason, 'temporary_logistics');
    }
  });

  await t.test('4. 必须拦截过短或空内容', () => {
    assert.equal(shouldAdmitToLongTermMemory({ content: '' }).admit, false);
    assert.equal(shouldAdmitToLongTermMemory({ content: '嗯' }).admit, false);
    assert.equal(shouldAdmitToLongTermMemory({ content: '好呀' }).admit, false);
  });

  await t.test('5. 必须放行具备高价值的长期画像、偏好与约定', () => {
    const valuableCases = [
      '用户对芒果和花生严重过敏',
      '家里养了一只英短蓝猫叫煤球',
      '平时喜欢喝无糖乌龙茶，讨厌香菜',
      '目前在准备今年下半年的研究生入学考试',
      '约定好周末一起去海边看日出',
      '用户是一名独立摄影师，常驻成都',
    ];

    for (const text of valuableCases) {
      const res = shouldAdmitToLongTermMemory({ content: text });
      assert.equal(
        res.admit,
        true,
        `预期放行高价值记忆: "${text}", 实际: ${JSON.stringify(res)}`
      );
      assert.equal(res.sanitizedContent, text);
    }
  });

  await t.test('6. calculateMemorySimilarity: 字集 Jaccard 相似度排重', () => {
    const simExact = calculateMemorySimilarity('用户喜欢喝乌龙茶', '用户喜欢喝乌龙茶');
    assert.equal(simExact, 1.0);

    const simHigh = calculateMemorySimilarity(
      '用户平时喜欢喝无糖乌龙茶',
      '用户很喜欢喝乌龙茶（无糖）'
    );
    assert.ok(simHigh >= 0.7, `预期高度相似 >= 0.7，实际: ${simHigh}`);

    const simDiff = calculateMemorySimilarity(
      '用户喜欢喝乌龙茶',
      '用户打算下周去上海出差'
    );
    assert.ok(simDiff < 0.3, `预期低相似度 < 0.3，实际: ${simDiff}`);
  });
});
