const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTsModule } = require('./helpers/loadTsModule.cjs');

const fuzzyPatcher = loadTsModule(
  path.resolve(__dirname, '../src/services/sandbox/diff/fuzzyPatcher.ts')
);

test('FP-01 [Tier 1 精确匹配与二义性拦截]: 唯一出现精确定位，重复出现拒绝盲目猜测', () => {
  const text = '甲方保证在2026年10月前支付违约金500万元整。';
  const res = fuzzyPatcher.findMatchRange(text, '违约金500万元整');
  assert.ok(res.match, '应精确定位');
  assert.strictEqual(res.match.tierUsed, 1);
  assert.strictEqual(text.slice(res.match.rawStart, res.match.rawEnd), '违约金500万元整');

  // 二义性重复子串
  const ambiguousText = '甲方支付违约金，若乙方违约，乙方亦支付违约金。';
  const ambRes = fuzzyPatcher.findMatchRange(ambiguousText, '违约金');
  assert.strictEqual(ambRes.error, 'ambiguous', '全文多处相同时必须拒绝盲修并抛出 ambiguous');
});

test('FP-02 [Tier 2 规范化逆向映射]: 零宽字符、空白折叠与标点映射的坐标完全还原', () => {
  // 构造含零宽空格 \u200B 与多空白混排的 Raw 文本
  const rawText = '第十五条：\u200B本协议生效后，  未经双方书面同意，不得擅自修改。';
  // 模型生成的搜索词：去掉了零宽空格，统一为单个空格与半角标点
  const search = '第十五条: 本协议生效后, 未经双方书面同意, 不得擅自修改.';

  const res = fuzzyPatcher.findMatchRange(rawText, search);
  assert.ok(res.match, 'Tier 2 规范化应成功命中');
  assert.strictEqual(res.match.tierUsed, 2);

  // 切割出来的 Raw 文本必须逐字等于原文，包含原始的 \u200B 和双空格
  const sliced = rawText.slice(res.match.rawStart, res.match.rawEnd);
  assert.strictEqual(sliced, rawText);
});

test('FP-03 [UTF-16 代理对边界防护]: 文本包含 Emoji 与生僻字时，截取坐标不得切裂代理对', () => {
  const emoji = '🎉🚀'; // 每个 emoji 占 2 个 UTF-16 code units
  const rawText = `重要通知${emoji}：请按时签署。`;
  const search = `重要通知${emoji}: 请按时签署。`;

  const res = fuzzyPatcher.findMatchRange(rawText, search);
  assert.ok(res.match, '应成功匹配');
  const sliced = rawText.slice(res.match.rawStart, res.match.rawEnd);
  assert.ok(sliced.includes(emoji), '应完整保留 emoji');

  // 验证切点在字符编码边界上
  const startChar = rawText.charCodeAt(res.match.rawStart);
  assert.ok(!(startChar >= 0xdc00 && startChar <= 0xdfff), 'rawStart 不应落在 low surrogate 上');
});

test('FP-04 [Tier 3 锚点容错与审查#4 二义性断言]: 近似文本能识别，但多个近似文本触发二义性拦截', () => {
  const rawText = '如果乙方在期限内未能完成交付，需按日承担合同总价款千分之一的逾期违约金。';
  // 模型给出的搜索词中间漏了几个字，但首尾锚点都在
  const search = '如果乙方在期限内未能交付，按日承担合同总价款千分之一的违约金';

  const res = fuzzyPatcher.findMatchRange(rawText, search);
  assert.ok(res.match, 'Tier 3 锚点滑动窗口应命中');
  assert.strictEqual(res.match.tierUsed, 3);
  assert.ok(res.match.similarity >= 0.75, '相似度应大于 0.75');

  // 构造两个极其相似的候选条款 (差一个字)，验证审查发现 #4 的最优与次优分差保护
  const twinText = '条款A：违约金按日千分之一收取。条款B：违约金按日千分之二收取。';
  const ambiguousSearch = '违约金按日千分之三收取';
  const twinRes = fuzzyPatcher.findMatchRange(twinText, ambiguousSearch);
  assert.strictEqual(twinRes.error, 'ambiguous', '两个候选相似度差距极小时必须二义性拦截');
});

test('FP-05 [批量逆序修补 applyBatchSafely]: 多处修改逆向应用，彻底杜绝坐标位移与交叠冲突', () => {
  const original = '甲方向乙方采购设备100台，单价人民币500元，预计交付日期为2026年12月31日。';

  const hunks = [
    { id: 'h1', search: '100台', replace: '200台' },
    { id: 'h2', search: '500元', replace: '450元' },
    { id: 'h3', search: '2026年12月31日', replace: '2027年01月15日' },
  ];

  const result = fuzzyPatcher.applyBatchSafely(original, hunks);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.appliedCount, 3);
  assert.strictEqual(
    result.resultText,
    '甲方向乙方采购设备200台，单价人民币450元，预计交付日期为2027年01月15日。'
  );

  // 验证区间交叠拦截
  const overlappingHunks = [
    { id: 'h4', search: '采购设备100台', replace: '订购产品100台' },
    { id: 'h5', search: '设备100台，单价', replace: '装置100台，价格' },
  ];
  const overlapResult = fuzzyPatcher.applyBatchSafely(original, overlappingHunks);
  assert.strictEqual(overlapResult.appliedCount, 0, '交叠冲突的修改必须全部安全跳过');
  const overlapDiag = overlapResult.diagnostics.find((d) => d.status === 'overlapping');
  assert.ok(overlapDiag, '应产出 overlapping 结构化诊断');
});

test('FP-06 [性能基线与抗压]: 200KB 文本匹配在 50ms 内完成，1000次随机调用无异常抛出', () => {
  // 生成 200KB 长度的长篇文本
  const paragraph = '根据合同法相关规定，甲乙双方本着平等自愿原则，就本次数字化智能项目达成以下补充协议。';
  const bigText = paragraph.repeat(2500); // 约 225,000 字符
  const targetSnippet = '就本次数字化智能项目达成以下补充协议';

  const startTime = Date.now();
  const res = fuzzyPatcher.findMatchRange(bigText, targetSnippet);
  const elapsed = Date.now() - startTime;

  assert.ok(elapsed < 50, `200KB 文本匹配耗时为 ${elapsed}ms，必须小于 50ms`);

  // 模糊随机抗压测试 (1000 次随机输入验证 0 崩溃)
  for (let i = 0; i < 1000; i++) {
    const randomSearch = Math.random().toString(36).substring(2, 8);
    assert.doesNotThrow(() => {
      fuzzyPatcher.findMatchRange(bigText.slice(0, 5000), randomSearch);
    });
  }
});
