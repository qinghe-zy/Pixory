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

const {
  TagAwareStreamParser,
  stripMetaTags,
} = require('../src/im/engine/tagAwareStreamParser.ts');
const {
  parseNudgeTag,
  parseHeartbeatTag,
} = loadTs('../src/im/engine/imTagParser.ts');

test('TagAwareStreamParser Streaming Slicing and Sanitization', async (t) => {
  await t.test('stripMetaTags removes status and mood protocol tags', () => {
    const raw = '[STATUS: online] 刚忙完回家呢 [MOOD: happy] [BR] 今天降温了记得多穿点';
    const cleaned = stripMetaTags(raw);
    assert.equal(cleaned, '刚忙完回家呢 [BR] 今天降温了记得多穿点');
  });

  await t.test('stripMetaTags removes [NUDGE] and [NUDGE: action] tags cleanly', () => {
    const raw1 = '[NUDGE] 醒醒啦别发呆了！';
    assert.equal(stripMetaTags(raw1), '醒醒啦别发呆了！');

    const raw2 = '[NUDGE: 脑门] 困了就去眯会儿[BR]别硬撑着';
    assert.equal(stripMetaTags(raw2), '困了就去眯会儿[BR]别硬撑着');
  });

  await t.test('parseNudgeTag parses action descriptions correctly', () => {
    assert.deepEqual(parseNudgeTag('你好呀 [NUDGE: 小脑瓜]'), { action: '小脑瓜' });
    assert.deepEqual(parseNudgeTag('快看！[NUDGE]'), { action: '小脑瓜' });
    assert.deepEqual(parseNudgeTag('无动作文本'), null);
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

  await t.test('Protects Markdown code blocks from newline splitting in fallback', () => {
    const parser = new TagAwareStreamParser();
    const raw = '这是为你生成的页面：\n```html\n<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<title>小依</title>\n</head>\n<body>\n<h1>你好</h1>\n</body>\n</html>\n```\n快去试试吧！';
    parser.feed(raw);
    const flushed = parser.flush();
    assert.equal(flushed.length, 3);
    assert.equal(flushed[0], '这是为你生成的页面：');
    assert.equal(flushed[1].startsWith('```html'), true);
    assert.equal(flushed[1].includes('<title>小依</title>'), true);
    assert.equal(flushed[1].endsWith('```'), true);
    assert.equal(flushed[2], '快去试试吧！');
  });

  await t.test('Prevents [BR] splitting inside streaming code blocks', () => {
    const parser = new TagAwareStreamParser();
    const s1 = parser.feed('前缀文本[BR]```html\n<h1>标题</h1>[BR]<p>内容</p>\n```[BR]后缀文本');
    assert.deepEqual(s1, [
      '前缀文本',
      '```html\n<h1>标题</h1>[BR]<p>内容</p>\n```',
    ]);
    const s2 = parser.flush();
    assert.deepEqual(s2, ['后缀文本']);
  });

  await t.test('Protects unclosed Markdown code blocks from line shredding on cutoff', () => {
    const parser = new TagAwareStreamParser();
    const brokenStream = '这是根据你描述的场景生成的页面\n```html\n<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<title>小依</title>';
    parser.feed(brokenStream);
    const flushed = parser.flush();
    // 严禁将 unclosed 代码块逐行切成 10 个碎气泡，必须整体作为一个代码气泡并自愈闭合
    assert.equal(flushed.length, 2);
    assert.equal(flushed[0], '这是根据你描述的场景生成的页面');
    assert.equal(flushed[1].startsWith('```html'), true);
    assert.equal(flushed[1].includes('<title>小依</title>'), true);
    assert.equal(flushed[1].endsWith('```'), true);
  });

  await t.test('Protects embedded raw HTML without code fence from line shredding', () => {
    const parser = new TagAwareStreamParser();
    const rawHtml = '给你写了一段测试网页：\n<!DOCTYPE html>\n<html lang="zh-CN">\n<head><meta charset="utf-8"></head>\n<body><h1>欢迎</h1></body>\n</html>\n点击右侧可直接运行';
    parser.feed(rawHtml);
    const flushed = parser.flush();
    assert.equal(flushed.length, 3);
    assert.equal(flushed[0], '给你写了一段测试网页：');
    assert.equal(flushed[1].includes('<!DOCTYPE html>'), true);
    assert.equal(flushed[1].includes('<h1>欢迎</h1>'), true);
    assert.equal(flushed[2], '点击右侧可直接运行');
  });

  await t.test('Multi-line code snippet with CSS and JS is preserved as one atomic bubble', () => {
    const parser = new TagAwareStreamParser();
    const snippet = '为你准备了样式：\n```css\nbody {\n  margin: 0;\n  padding: 0;\n  background: #fff;\n}\n```\n快去看看效果！';
    parser.feed(snippet);
    const flushed = parser.flush();
    assert.equal(flushed.length, 3);
    assert.equal(flushed[0], '为你准备了样式：');
    assert.equal(flushed[1].startsWith('```css'), true);
    assert.equal(flushed[1].includes('background: #fff;'), true);
    assert.equal(flushed[2], '快去看看效果！');
  });
});
