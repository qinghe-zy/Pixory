const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTsModule } = require('./helpers/loadTsModule.cjs');

const ftsEngine = loadTsModule(
  path.resolve(__dirname, '../src/services/agent/tools/cjkFts5Engine.ts')
);

test('TC-FTS-01: 数量词与金额原子粘合，防止金额与周期被切散', () => {
  const text1 = '本合同违约金为500万元整，应在30天内全额付清。';
  const encoded1 = ftsEngine.encodeForIndex(text1);

  // 断言原子粘合词元存在
  assert.ok(encoded1.includes('500万元'), '必须包含原子粘合词元 500万元');
  assert.ok(encoded1.includes('30天'), '必须包含原子粘合词元 30天');
  assert.ok(encoded1.includes('违约'), '必须包含 CJK 双字 违约');
  assert.ok(encoded1.includes('约金'), '必须包含 CJK 双字 约金');

  const text2 = '工程竣工日期为2026年10月15日，违约金比率为15.5%。';
  const encoded2 = ftsEngine.encodeForIndex(text2);
  assert.ok(encoded2.includes('2026年'), '必须包含 2026年');
  assert.ok(encoded2.includes('10月'), '必须包含 10月');
  assert.ok(encoded2.includes('15.5%'), '必须包含百分比 15.5%');
});

test('TC-FTS-02: CJK Overlapping Bigram 支持基本汉字与扩展 A 区汉字', () => {
  // 包含扩展 A 区汉字 (如 㐀 \u3400, 㐂 \u3402)
  const cjkText = '合同双方严格履行各项义务㐀㐂责任。';
  const encoded = ftsEngine.encodeForIndex(cjkText);

  assert.ok(encoded.includes('合同'), '应生成 合同');
  assert.ok(encoded.includes('同双'), '应生成 同双');
  assert.ok(encoded.includes('双方'), '应生成 双方');
  assert.ok(encoded.includes('义务'), '应生成 义务');
  assert.ok(encoded.includes('务㐀'), '应跨扩展 A 区汉字切分 务㐀');
  assert.ok(encoded.includes('㐀㐂'), '应切分扩展 A 区双字 㐀㐂');
});

test('TC-FTS-03: 英文、版本号与代码下划线词元保持独立完整', () => {
  const mixedText = 'Pixory v2.9.0 引入了 doc_batch_patch 引擎，支持 react-native 渲染。';
  const encoded = ftsEngine.encodeForIndex(mixedText);

  assert.ok(encoded.includes('pixory'), '英文小写化');
  assert.ok(encoded.includes('doc_batch_patch'), '下划线标识符完整保留');
  assert.ok(encoded.includes('react-native'), '连字符单词完整保留');
});

test('TC-FTS-04 [审查发现 #5]: 单字 CJK 汉字查询安全降级与前缀通配', () => {
  const singleQuery = '违';
  const result = ftsEngine.buildFtsMatchQuery(singleQuery);

  assert.strictEqual(result.isSingleCjk, true, '必须标记为单字 CJK');
  assert.strictEqual(result.matchQuery, '"违*"', '应生成前缀通配符 "违*"');
  assert.strictEqual(result.fallbackLikePattern, '%违%', '应提供安全的 LIKE 兜底模式');
  assert.deepStrictEqual(result.tokens, ['违']);
});

test('TC-FTS-05: FTS5 MATCH 防注入消毒与保留关键字清洗', () => {
  // 注入各种 FTS5 保留字符与危险逻辑运算符
  const maliciousQuery = ' "违约金" * (甲方 OR 乙方) ^ : - NOT 恶意注入 ';
  const result = ftsEngine.buildFtsMatchQuery(maliciousQuery);

  assert.strictEqual(result.isSingleCjk, false);
  assert.ok(!result.matchQuery.includes('*'), '必须剔除裸露通配符 *');
  assert.ok(!result.matchQuery.includes('OR'), '必须剔除保留运算符 OR');
  assert.ok(!result.matchQuery.includes('NOT'), '必须剔除保留运算符 NOT');
  assert.ok(!result.matchQuery.includes('^'), '必须剔除保留符号 ^');

  // 输出的表达式必须格式良好：每一个 token 都被双引号包裹并以 AND 连接
  assert.ok(result.matchQuery.includes('"违约"'), '应生成 "违约" token');
  assert.ok(result.matchQuery.includes('"约金"'), '应生成 "约金" token');
  assert.ok(result.matchQuery.includes(' AND '), 'token 之间必须由 AND 显式连接');
});
