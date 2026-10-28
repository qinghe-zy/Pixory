const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TagAwareStreamParser,
  stripMetaTags,
} = require('../src/im/engine/tagAwareStreamParser.ts');

test('TagAwareStreamParser Streaming Slicing and Sanitization', async (t) => {
  await t.test('stripMetaTags removes status and mood protocol tags', () => {
    const raw = '[STATUS: online] 刚忙完回家呢 [MOOD: happy] [BR] 今天降温了记得多穿点';
    const cleaned = stripMetaTags(raw);
    assert.equal(cleaned, '刚忙完回家呢 [BR] 今天降温了记得多穿点');
  });

  await t.test('Chunk-by-chunk stream slicing on [BR]', () => {
    const parser = new TagAwareStreamParser();

    // Chunk 1: 首句就绪
    const s1 = parser.feed('我刚才去楼下买咖啡了[BR]');
    assert.deepEqual(s1, ['我刚才去楼下买咖啡了']);

    // Chunk 2: 第二句未结束
    const s2 = parser.feed('顺便给你带了一杯');
    assert.deepEqual(s2, []);

    // Chunk 3: 补全第二句切分符
    const s3 = parser.feed('热拿铁[BR]放你桌上了快喝吧');
    assert.deepEqual(s3, ['顺便给你带了一杯热拿铁']);

    // 结束冲刷尾部
    const s4 = parser.flush();
    assert.deepEqual(s4, ['放你桌上了快喝吧']);

    assert.equal(parser.getEmittedCount(), 3);
  });

  await t.test('Buffers incomplete tag across chunks without leaking', () => {
    const parser = new TagAwareStreamParser();

    // 句子末尾出现半截 [B
    const s1 = parser.feed('今天辛苦啦[B');
    assert.deepEqual(s1, []);

    // 下一块补全 R]
    const s2 = parser.feed('R]晚安做个好梦');
    assert.deepEqual(s2, ['今天辛苦啦']);

    const s3 = parser.flush();
    assert.deepEqual(s3, ['晚安做个好梦']);
  });

  await t.test('Normal brackets and unclosed brackets are preserved without swallowing', () => {
    const parser = new TagAwareStreamParser();
    const c1 = parser.feed('今晚看 [星');
    const c2 = parser.feed('际穿越] 好不好[B');
    const c3 = parser.feed('R]我买爆米花[未闭合括号');
    const c4 = parser.flush();

    const allEmitted = [...c1, ...c2, ...c3, ...c4];
    assert.deepEqual(allEmitted, [
      '今晚看 [星际穿越] 好不好',
      '我买爆米花[未闭合括号',
    ]);
  });

  await t.test('Suppresses <think> tags completely and emits only clean companion bubbles', () => {
    const parser = new TagAwareStreamParser();

    // 模拟 DeepSeek-R1 思考流
    const chunk1 = parser.feed('<think>用户发了消息，我需要分析他的语气。\n他好像有点累。</think>今天工作很累吗？[BR]');
    assert.deepEqual(chunk1, ['今天工作很累吗？']);

    // 跨 chunk 的思考标签
    const chunk2 = parser.feed('<think>思考下一句该怎么回复');
    assert.deepEqual(chunk2, []);
    assert.equal(parser.isThinking(), true);

    const chunk3 = parser.feed('，要温柔一点</think>给你泡杯热牛奶吧[BR]');
    assert.deepEqual(chunk3, ['给你泡杯热牛奶吧']);
    assert.equal(parser.isThinking(), false);

    const chunk4 = parser.flush();
    assert.deepEqual(chunk4, []);
  });

  await t.test('Preserves pre-think text without swallowing and supports case-insensitive <Think> tags', () => {
    const parser = new TagAwareStreamParser();

    // 思考块前有正常文本，且大小写混写 <Think>...</Think>
    const s1 = parser.feed('收到啦！[BR]<Think>分析用户的意图...\n给予积极正面的回应</Think>我们去看电影好不好？[BR]');
    assert.deepEqual(s1, ['收到啦！', '我们去看电影好不好？']);

    // 跨 chunk 的大写 <THOUGHT>
    const s2 = parser.feed('好消息！<THOUGHT>正在构思情节');
    assert.deepEqual(s2, []);
    assert.equal(parser.isThinking(), true);

    const s3 = parser.feed('，给点惊喜</THOUGHT>我已经订好票啦[BR]');
    assert.deepEqual(s3, ['好消息！我已经订好票啦']);
    assert.equal(parser.isThinking(), false);
  });

  await t.test('Supports lowercase [br] and mixed-case [Br] slicing', () => {
    const parser = new TagAwareStreamParser();
    const s1 = parser.feed('第一句[br]第二句[Br]第三句[BR]');
    assert.deepEqual(s1, ['第一句', '第二句', '第三句']);
  });

  await t.test('Gracefully falls back to newline splitting when model completely omits [BR]', () => {
    const parser = new TagAwareStreamParser();
    parser.feed('在干嘛呢？\n我刚才去超市买了草莓\n分你一半呀！');
    const flushed = parser.flush();
    assert.deepEqual(flushed, ['在干嘛呢？', '我刚才去超市买了草莓', '分你一半呀！']);
    assert.equal(parser.getEmittedCount(), 3);
  });
});
