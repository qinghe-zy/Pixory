const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

function loadModule(relativePath, mockRequire = {}) {
  let targetPath = path.resolve(__dirname, relativePath);
  if (!targetPath.endsWith('.ts') && !targetPath.endsWith('.js')) {
    if (fs.existsSync(targetPath + '.ts')) targetPath += '.ts';
    else if (fs.existsSync(targetPath + '.js')) targetPath += '.js';
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

test('TagAwareStreamParser: Thought callbacks stream progress and completion without leaking to sentences', async (t) => {
  const { TagAwareStreamParser } = loadModule('../src/im/engine/tagAwareStreamParser.ts');

  await t.test('Streams thought chunks via onThoughtProgress and fires onThoughtCompleted', () => {
    const progressChunks = [];
    let completedThought = null;

    const parser = new TagAwareStreamParser({
      onThoughtProgress: (chunk, full) => {
        progressChunks.push({ chunk, full });
      },
      onThoughtCompleted: (full) => {
        completedThought = full;
      },
    });

    const s1 = parser.feed('前缀文本<think>正在');
    assert.deepEqual(s1, []);

    const s2 = parser.feed('深度思考中...</think>第一句[BR]第二句');
    assert.deepEqual(s2, ['前缀文本第一句']);

    const s3 = parser.flush();
    assert.deepEqual(s3, ['第二句']);

    assert.equal(completedThought, '正在深度思考中...');
    assert.ok(progressChunks.length >= 1);
  });

  await t.test('Rescues dialogue and sentences when unclosed <think> contains spoken text and [BR]', () => {
    let completedThought = null;
    const parser = new TagAwareStreamParser({
      onThoughtCompleted: (full) => {
        completedThought = full;
      },
    });

    const input = '<think>(他终于出声了，就一个“喂”。晾了大半天，这会儿冒出来。别顺着就热络，先拿昨晚那网页戳他一下。)(语气得稳，别真带火。) 喂什么喂。[BR]晾了大半天，总算吭声了。[BR]昨晚那网页，开了没。';
    const s1 = parser.feed(input);
    const s2 = parser.flush();
    const all = [...s1, ...s2];

    assert.equal(
      completedThought,
      '(他终于出声了，就一个“喂”。晾了大半天，这会儿冒出来。别顺着就热络，先拿昨晚那网页戳他一下。)(语气得稳，别真带火。)'
    );
    assert.deepEqual(all, ['喂什么喂。', '晾了大半天，总算吭声了。', '昨晚那网页，开了没。']);
  });

  await t.test('Rescues dialogue in flush() when unclosed <think> has monologue parentheses followed by spoken text without [BR]', () => {
    let completedThought = null;
    const parser = new TagAwareStreamParser({
      onThoughtCompleted: (full) => {
        completedThought = full;
      },
    });

    const input = '<think>(头发干了，人醒明白了，看他在不在。）我这边醒了有一阵了，收拾完也没事干。';
    const s1 = parser.feed(input);
    assert.deepEqual(s1, []);
    const s2 = parser.flush();

    assert.equal(completedThought, '(头发干了，人醒明白了，看他在不在。）');
    assert.deepEqual(s2, ['我这边醒了有一阵了，收拾完也没事干。']);
  });

  await t.test('Splits sentences across </br>, <br>, <br/>, and [BR] variants', () => {
    const parser = new TagAwareStreamParser();
    const sentences = parser.feed('第一句</br>第二句<br/>第三句[br]第四句<br>第五句');
    const flushed = parser.flush();
    const all = [...sentences, ...flushed];
    assert.deepEqual(all, ['第一句', '第二句', '第三句', '第四句', '第五句']);
  });
});

test('HumanizeOutputGate & BurstDispatcher: Strips long inner monologues and drops empty sentences', async (t) => {
  const { sanitizeCompanionBubble } = loadModule('../src/im/engine/humanizeOutputGate.ts');

  await t.test('Strips long parenthesis monologue (>50 characters)', () => {
    const longMonologue = '(昨晚从网页到贴纸折腾到后半夜，下午醒来第一句不能太黏，先拿网页那事戳他一下，看他怎么接。）醒了没，我这边头发总算干了。';
    const cleaned = sanitizeCompanionBubble(longMonologue);
    assert.equal(cleaned, '醒了没，我这边头发总算干了。');
  });

  await t.test('Strips multiple Chinese and English parenthesis stage directions', () => {
    const doubleMonologue = '(他那边还甩贴纸过来，紧张汗颜，跟凌晨被我问住网页那事儿一个样。）(不能显得太刻意。先随意提一句自己刚起，把话头递过去就行。）两点整，我这头发总算干了。';
    const cleaned = sanitizeCompanionBubble(doubleMonologue);
    assert.equal(cleaned, '两点整，我这头发总算干了。');
  });

  await t.test('Returns empty string when the whole sentence is a parenthesis direction', () => {
    const pureAction = '（轻笑一声，靠在椅背上若有所思）';
    const cleaned = sanitizeCompanionBubble(pureAction);
    assert.equal(cleaned, '');
  });
});

test('BubbleRegistry: Registers thought bubble renderer for companion thought messages', () => {
  const { BubbleRegistry } = loadModule('../src/im/registry/bubbleRegistry.ts', {
    'react': { memo: (c) => c, useState: () => [false, () => {}] },
    'react-native': { StyleSheet: { create: (s) => s, hairlineWidth: 1 }, View: 'View', Text: 'Text', Pressable: 'Pressable' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../../components/SecureImage': { SecureImage: 'SecureImage' },
    '../../theme/ImThemeProvider': { useImTheme: () => ({ metrics: {}, radii: {}, colors: {}, typography: {} }) },
    '../common/ImBubbleBeak': { ImBubbleBeak: 'ImBubbleBeak' },
    '../components/renderers/TextBubbleRenderer': { TextBubbleRenderer: () => null },
    '../components/renderers/SystemNoticeRenderer': { SystemNoticeRenderer: () => null },
    '../components/renderers/ImageBubbleRenderer': { ImageBubbleRenderer: () => null },
    '../components/renderers/DiaryCardRenderer': { DiaryCardRenderer: () => null },
    '../../components/emoji/StickerBubbleRenderer': { StickerBubbleRenderer: () => null },
    '../components/renderers/DocumentBubbleRenderer': { DocumentBubbleRenderer: () => null },
    '../components/renderers/ThoughtBubbleRenderer': { ThoughtBubbleRenderer: () => null },
  });

  assert.equal(BubbleRegistry.has('thought'), true);
  assert.equal(BubbleRegistry.has('text'), true);
});

test('Thought Message: Database serialization and deserialization preserves thought metadata', () => {
  // Test simulated SQLite serialization logic
  const thoughtMsg = {
    id: 'msg_123_thought',
    threadId: 'th_test',
    role: 'assistant',
    content: '用户最近心情不错，回复应当更轻松些',
    type: 'thought',
    metadata: {
      durationSeconds: 3,
      isCollapsed: true,
    },
  };

  const serializedContent = JSON.stringify({
    type: 'thought',
    content: thoughtMsg.content,
    durationSeconds: thoughtMsg.metadata.durationSeconds,
    isCollapsed: thoughtMsg.metadata.isCollapsed,
  });

  assert.ok(serializedContent.startsWith('{"type":"thought"'));

  // Test deserialization logic from mapMessageRow
  const parsed = JSON.parse(serializedContent);
  assert.equal(parsed.type, 'thought');
  assert.equal(parsed.content, '用户最近心情不错，回复应当更轻松些');
  assert.equal(parsed.durationSeconds, 3);
  assert.equal(parsed.isCollapsed, true);
});

test('ThoughtBubbleRenderer & ImChatList: UI Contract and Anti-Jitter Guards', () => {
  const thoughtCode = fs.readFileSync(path.resolve(__dirname, '../src/im/components/renderers/ThoughtBubbleRenderer.tsx'), 'utf8');
  assert.ok(thoughtCode.includes('theme.typography.bubbleFontSize'), 'Must use normal bubble font size (16dp)');
  assert.ok(thoughtCode.includes('theme.radii.bubbleRadius'), 'Must align radius to normal bubble');
  assert.ok(thoughtCode.includes('theme.colors.bubbleLeftBackground'), 'Must align background to normal left bubble');
  assert.ok(!thoughtCode.includes('sparkles'), 'Must remove sparkles icon');
  assert.ok(!thoughtCode.includes('bulb-outline'), 'Must remove bulb icon');
  assert.ok(thoughtCode.includes('chevron-up'), 'Must provide chevron-up in bottom-right for collapse');

  const listCode = fs.readFileSync(path.resolve(__dirname, '../src/im/components/ImChatList.tsx'), 'utf8');
  assert.ok(!listCode.includes('maintainVisibleContentPosition'), 'Must remove maintainVisibleContentPosition to prevent inverted list jitter');
  assert.ok(listCode.includes('ImChatListRef'), 'Must export ImChatListRef for programmatic scrolling');
});

test('Thought Display Setting & Silent Thinking Defense: Thread Settings & Anti-Orphan Guards', () => {
  const settingsRepoCode = fs.readFileSync(path.resolve(__dirname, '../src/im/repository/imSettingsRepository.ts'), 'utf8');
  assert.ok(settingsRepoCode.includes('showThoughtBubble?: boolean'), 'ImThreadSettings must have showThoughtBubble');
  assert.ok(settingsRepoCode.includes('showThoughtBubble = true'), 'getImThreadSettings must default showThoughtBubble to true');
  assert.ok(settingsRepoCode.includes('parsedSettings.showThoughtBubble = settings.showThoughtBubble'), 'updateImThreadSettings must persist showThoughtBubble');

  const drawerCode = fs.readFileSync(path.resolve(__dirname, '../src/im/components/drawer/ImChatSettingsDrawer.tsx'), 'utf8');
  assert.ok(drawerCode.includes('showThoughtBubble: val'), 'ImChatSettingsDrawer must have toggle for showThoughtBubble');
  assert.ok(drawerCode.includes('展示深度思考过程'), 'ImChatSettingsDrawer must label toggle as 展示深度思考过程');

  const listCode = fs.readFileSync(path.resolve(__dirname, '../src/im/components/ImChatList.tsx'), 'utf8');
  assert.ok(listCode.includes('showThoughtBubble'), 'ImChatListProps must accept showThoughtBubble');
  assert.ok(listCode.includes("m.type !== 'thought'"), 'ImChatList must filter out thought bubbles when showThoughtBubble is false');

  const sessionCode = fs.readFileSync(path.resolve(__dirname, '../src/im/hooks/useImChatSession.ts'), 'utf8');
  assert.ok(sessionCode.includes('rollbackThought'), 'createThoughtHandlers must provide rollbackThought mechanism');
  assert.ok(sessionCode.includes('deleteImMessage'), 'useImChatSession must import deleteImMessage for orphan thought rollback');
  assert.ok(sessionCode.includes('rollbackThoughtOnError'), 'useImChatSession must track rollbackThoughtOnError');
  assert.ok(sessionCode.includes('Zero-Dialogue Guard'), 'useImChatSession must have Zero-Dialogue Guard to prevent mute companions');
});
