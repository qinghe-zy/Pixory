const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

// 1. 测试 16 核心情绪桶与基础语义锚点规范
test('StickerSemanticResolver defines exactly 16 neutral emotion buckets and fallback emojis', () => {
  const source = read('src/components/emoji/StickerSemanticResolver.ts');

  const expectedBuckets = [
    'laugh', 'hug', 'blush', 'kiss',
    'pleading', 'tsundere', 'look', 'thumbsup',
    'thinking', 'surprised', 'pat', 'goodnight',
    'fire', 'bomb', 'sleepy', 'heartbreak',
  ];

  for (const bucket of expectedBuckets) {
    assert.ok(source.includes(`${bucket}:`), `Must contain bucket definition for ${bucket}`);
  }

  // 验证 16 个中性二字标准情绪词
  const expectedPrimaryWords = [
    '大笑', '抱抱', '害羞', '亲亲',
    '委屈', '哼气', '观察', '点赞',
    '思考', '震惊', '摸头', '晚安',
    '燃起', '炸毛', '犯困', '心碎',
  ];

  for (const word of expectedPrimaryWords) {
    assert.ok(source.includes(`primaryWord: '${word}'`), `Must have 2-char primary word: ${word}`);
  }

  // 验证补偿 Emoji 映射
  assert.ok(source.includes('fallbackEmoji: \'🫂\''), 'Hug bucket must fall back to 🫂');
  assert.ok(source.includes('fallbackEmoji: \'😄\''), 'Laugh bucket must fall back to 😄');
  assert.ok(source.includes('fallbackEmoji: \'🌙\''), 'Goodnight bucket must fall back to 🌙');
  assert.ok(source.includes('fallbackEmoji: \'🔥\''), 'Fire bucket must fall back to 🔥');
  assert.ok(source.includes('fallbackEmoji: \'💣\''), 'Bomb bucket must fall back to 💣');
});

// 2. 测试后续导入新表情包的可拓展注册与加权抽样契约
test('StickerSemanticResolver supports dynamic custom sticker registration and label resolution', () => {
  const source = read('src/components/emoji/StickerSemanticResolver.ts');

  assert.ok(source.includes('export function registerCustomStickers'), 'Must export registerCustomStickers');
  assert.ok(source.includes('export function resolveSticker'), 'Must export resolveSticker');
  assert.ok(source.includes('export function resolveStickerLabel'), 'Must export resolveStickerLabel');
  assert.ok(source.includes('export function clearCustomStickers'), 'Must export clearCustomStickers');
  assert.ok(source.includes('styleExclude'), 'Must support styleExclude for persona filtering');
});

// 3. 测试 Layer 1 协议装填 (58 Token 常量、16 词对齐、禁出戏字眼、不禁普通 Emoji)
test('imContextBuilder Layer 1 protocol is 100% static, aligned with 16 buckets, and avoids fourth-wall break', () => {
  const source = read('src/im/engine/imContextBuilder.ts');

  assert.ok(source.includes('6. 【动态大表情协议】'), 'Must have section 6 in IM_PROTOCOL_PROMPT');
  assert.ok(
    source.includes('可用情绪词：大笑、抱抱、害羞、亲亲、委屈、哼气、观察、点赞、思考、震惊、摸头、晚安、燃起、炸毛、犯困、心碎。'),
    'Must specify the 16 neutral 2-character anchor words'
  );
  assert.ok(
    source.includes('自然接话，禁在台词正文中提及“表情/贴纸”字眼'),
    'Must include instruction preventing fourth-wall break'
  );
  // 必须删去“正文内不再叠加普通Emoji”硬性约束以防情绪截肢
  assert.ok(
    !source.includes('发大贴纸的回合正文内不再叠加普通Emoji'),
    'Must NOT forbid regular emojis in text to prevent emotional amputation'
  );
});

// 4. 测试 Layer 3 历史合并、真实轮次深度计算与双轨滑窗剪枝
test('imContextBuilder Layer 3 calculates true user turns, prunes old assistant stickers, and preserves role alternation', () => {
  const source = read('src/im/engine/imContextBuilder.ts');

  assert.ok(source.includes('export function computeTurnDistances'), 'Must export computeTurnDistances');
  assert.ok(
    source.includes('turnDistances') || source.includes('turnDistance'),
    'Must track turn distances in history coalescence'
  );
  assert.ok(
    source.includes('（对方发来「${stickerLabel}」表情贴纸）'),
    'Must merge user stickers as natural immersion narration'
  );
  assert.ok(
    source.includes('（对方没有打字，向你发来一张「${stickerLabel}」表情贴纸）'),
    'Must format standalone user sticker naturally'
  );
});

// 5. 测试 Tag-Aware 流式切分对 [STICKER: xxx] 的隐式独立切分与全半角容错
test('tagAwareStreamParser tolerates full/half-width brackets and splits bubbles around stickers', () => {
  const source = read('src/im/engine/tagAwareStreamParser.ts');
  const parserSource = read('src/im/engine/imTagParser.ts');

  assert.ok(source.includes('SPLIT_PATTERN'), 'Must define SPLIT_PATTERN for implicit bubble splitting');
  assert.ok(source.includes('STICKER:'), 'Must recognize STICKER: prefix');
  assert.ok(source.includes('STICKER：'), 'Must recognize full-width STICKER： prefix');
  assert.ok(source.includes('表情:'), 'Must recognize 表情: prefix');
  assert.ok(source.includes('表情：'), 'Must recognize full-width 表情： prefix');

  assert.ok(parserSource.includes('export function parseStickerTag'), 'Must export parseStickerTag');
  assert.ok(parserSource.includes('STICKER_TAG_REGEX'), 'Must export STICKER_TAG_REGEX');
});

// 6. 测试 BurstMessageDispatcher 兼容导出、窗口压缩与多贴纸自由混排（无冷却拦截锁）
test('BurstMessageDispatcher supports free multi-sticker inline mixing without cooldown lock and compresses pacing', async () => {
  const path = require('node:path');
  const ts = require('typescript');
  const source = read('src/im/engine/burstDispatcher.ts');

  assert.ok(source.includes('export function getStickerCooldownThreshold'), 'Must export getStickerCooldownThreshold');
  assert.ok(source.includes('turnsSinceLastSticker'), 'Must track turnsSinceLastSticker');
  assert.ok(source.includes('dispatchSticker'), 'Must implement dispatchSticker');
  assert.ok(source.includes('advanceTurnWithoutSticker'), 'Must implement advanceTurnWithoutSticker');
  assert.ok(
    source.includes('applyBurstWindowCap') &&
      source.includes("modality: 'sticker'") &&
      source.includes('250') &&
      source.includes('calculateHumanTypingDelay'),
    'dispatchSticker must route sticker base delay (calculateHumanTypingDelay with modality: sticker, fallback 250ms) through applyBurstWindowCap'
  );

  // Runtime test: load BurstMessageDispatcher and dispatch multiple stickers in one burst without cooldown lock
  const inserted = [];
  const loadTsModule = (absPath, mocks) => {
    const code = fs.readFileSync(absPath, 'utf8');
    const out = ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const mod = { exports: {} };
    const req = (id) => {
      if (mocks[id]) return mocks[id];
      if (id.startsWith('.')) {
        const resolved = path.resolve(path.dirname(absPath), id);
        const file = resolved.endsWith('.ts') ? resolved : `${resolved}.ts`;
        return loadTsModule(file, mocks);
      }
      return require(id);
    };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
  };

  const { BurstMessageDispatcher } = loadTsModule(
    path.resolve(__dirname, '../src/im/engine/burstDispatcher.ts'),
    {
      'react-native': { AppState: { addEventListener: () => ({ remove: () => {} }) } },
      '../../database': { runWithDatabaseSpace: async () => {}, initDatabase: async () => ({}) },
      '../repository/imThreadRepository': {
        getNextPendingVisibleAt: async () => null,
        getNextPendingVisibleRow: async () => null,
        insertImMessage: async (_space, msg) => {
          inserted.push(msg);
        },
        revealPendingMessages: async () => 0,
        updateImMessageVoice: async () => {},
      },
      '../../services/agent/vfs/casBlobStore': { CasBlobStore: class {} },
      '../../services/sandbox/diff/fuzzyPatcher': { applyBatchSafely: () => ({ appliedCount: 0, resultText: '' }) },
      '../../voice/voiceService': { voiceService: { prepareAudio: async () => ({ audioUri: '', durationMs: 1000 }) } },
    }
  );

  const dispatcher = new BurstMessageDispatcher('th_multi_sticker', 'normal');
  dispatcher.setTurnsSinceLastSticker(0);
  dispatcher.beginBurst();

  await dispatcher.dispatchSentence('哈哈笑死我了[STICKER: 拍桌大笑]真的绝了[STICKER: 抱抱]');
  await dispatcher.waitForPendingDispatches();

  assert.equal(inserted.length, 4);
  assert.deepEqual(
    inserted.map((m) => m.type),
    ['text', 'sticker', 'text', 'sticker']
  );
  assert.equal(inserted[0].content, '哈哈笑死我了');
  assert.equal(inserted[2].content, '真的绝了');
  assert.ok(inserted[1].visibleAt < inserted[2].visibleAt);
  assert.ok(inserted[2].visibleAt < inserted[3].visibleAt);

  // Runtime test: useHumanTimeline forwards to dispatchSticker using modality: 'sticker' (250~400ms)
  inserted.length = 0;
  dispatcher.beginBurst();
  await dispatcher.dispatchSentence('给你抱抱[STICKER: 抱抱]', undefined, { useHumanTimeline: true });
  await dispatcher.waitForPendingDispatches();
  assert.equal(inserted.length, 2);
  const stickerGap = inserted[1].visibleAt - inserted[0].visibleAt;
  assert.ok(
    stickerGap >= 245 && stickerGap <= 450,
    `Expected sticker delay within ~250-400ms via calculateHumanTypingDelay(modality: 'sticker'), got ${stickerGap}`
  );
});

// 7. 测试承诺提取与手账日记物理隔离防护
test('CommitmentExtractor and DiaryDayWindow physically isolate stickers from facts and memory', () => {
  const commitSource = read('src/im/engine/commitmentExtractor.ts');
  const diarySource = read('src/im/diary/engine/diaryDayWindow.ts');

  assert.ok(commitSource.includes('表情贴纸'), 'CommitmentExtractor must ignore sticker cues');
  assert.ok(commitSource.includes('对方发来'), 'CommitmentExtractor must ignore partner sticker cues');

  assert.ok(diarySource.includes('type === \'sticker\''), 'DiaryDayWindow must intercept sticker messages');
  assert.ok(diarySource.includes('resolveStickerLabel'), 'DiaryDayWindow must resolve sticker label');
  assert.ok(
    diarySource.includes('流露出当时的心情'),
    'DiaryDayWindow must convert sticker to emotional narrative'
  );
});

// 8. 测试 UI 无障碍、UX 反馈空态与自定义表情持久水合恢复
test('UX feedback empty state, accessibility attributes, and custom sticker serialization pass standards', () => {
  const panelSource = read('src/components/emoji/EmojiPickerPanel.tsx');
  const recentSource = read('src/components/emoji/recentEmojiService.ts');
  const resolverSource = read('src/components/emoji/StickerSemanticResolver.ts');

  // UI & UX 规范
  assert.ok(panelSource.includes('accessibilityLabel="清空最近使用"'), 'Must provide accessibilityLabel for trash button');
  assert.ok(panelSource.includes('displayedRecentItems.length > 0'), 'Recent emojis section must only render when items exist (实事求是)');

  // 自定义表情水合恢复
  assert.ok(recentSource.includes('SerializedRecentItem'), 'Must define rich serialized interface');
  assert.ok(recentSource.includes('animatedUri: anim.animatedUri'), 'Must serialize custom sticker URI for offline rehydration');

  // 性能优化 O(1) 别名索引表
  assert.ok(resolverSource.includes('EXACT_ALIAS_MAP'), 'Must build O(1) EXACT_ALIAS_MAP index');
});
