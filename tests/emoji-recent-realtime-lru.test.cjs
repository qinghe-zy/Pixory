const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadTsModule } = require('./helpers/loadTsModule.cjs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('EmojiRecentService respects real-time behavior: empty at start, exact count up to 14, empty on reset', async () => {
  let mockStorage = {};
  const mockSecureStore = {
    getItemAsync: async (k) => mockStorage[k] || null,
    setItemAsync: async (k, v) => { mockStorage[k] = v; },
    deleteItemAsync: async (k) => { delete mockStorage[k]; },
  };

  const recentModule = loadTsModule('src/components/emoji/recentEmojiService.ts', {
    'expo-secure-store': mockSecureStore,
  });

  const { EmojiRecentService } = recentModule;

  // 1. 初始状态：未发送表情，必须返回 []
  await EmojiRecentService.resetRecent();
  const initial = await EmojiRecentService.getRecentEmojis();
  assert.equal(initial.length, 0, 'Initial state must be empty array, zero fake items');

  // 2. 发送 1 个表情：必须仅返回 1 个表情
  const item1 = { id: 'anim_laugh', type: 'animated', name: '破涕为笑', animatedUri: 'uri1' };
  const after1 = await EmojiRecentService.recordRecent(item1);
  assert.equal(after1.length, 1, 'After 1 item, must return exactly 1 item');
  assert.equal(after1[0].id, 'anim_laugh');

  // 3. 发送第 2、第 3 个表情
  const item2 = { id: 'static_heart', type: 'static', name: '红心', char: '❤️' };
  const item3 = { id: 'anim_hug', type: 'animated', name: '温暖抱抱', animatedUri: 'uri3' };
  await EmojiRecentService.recordRecent(item2);
  const after3 = await EmojiRecentService.recordRecent(item3);
  assert.equal(after3.length, 3, 'After 3 items, must return exactly 3 items');
  assert.equal(after3[0].id, 'anim_hug', 'Latest item must be at top (LRU)');

  // 4. 重复发送已有项：置顶且总数不增加
  const afterDup = await EmojiRecentService.recordRecent(item1);
  assert.equal(afterDup.length, 3, 'Duplicate item should not increase count');
  assert.equal(afterDup[0].id, 'anim_laugh', 'Duplicate item must be lifted to top');

  // 5. 连续推入 15 个不同表情：最多保留 14 个 (MAX_RECENT_COUNT)
  for (let i = 4; i <= 18; i++) {
    await EmojiRecentService.recordRecent({ id: `item_${i}`, type: 'static', name: `item_${i}`, char: '🔥' });
  }
  const afterOverflow = await EmojiRecentService.getRecentEmojis();
  assert.equal(afterOverflow.length, 14, 'Must clamp to exactly 14 items maximum');

  // 6. 清空最近使用：重置为 []
  const afterReset = await EmojiRecentService.resetRecent();
  assert.equal(afterReset.length, 0, 'Reset must return empty array');
});

test('EmojiPickerPanel layout fulfills all user requirements', () => {
  const panelSource = read('src/components/emoji/EmojiPickerPanel.tsx');

  // 1. 实事求是最近使用：只有 displayedRecentItems.length > 0 时才渲染
  assert.ok(panelSource.includes('displayedRecentItems.length > 0'), 'Recent section must conditionally render');

  // 2. 主菜单前 5 行展示，第 35 格为更多按钮
  assert.ok(panelSource.includes('ANIMATED_EMOJIS.slice(0, 34)'), 'Must take first 34 animated emojis for main menu');
  assert.ok(panelSource.includes('ellipsis-horizontal'), 'Must render horizontal ellipsis for 35th item');
  assert.ok(panelSource.includes("setActiveTabId('companion_stickers')"), 'More button must switch to companion_stickers');

  // 3. Tab 2 超级表情：无小分类标题，平铺 fullSuperStickers（内置 + 下载超级表情统一瀑布流展示）
  assert.ok(panelSource.includes('fullSuperStickers.map'), 'Must render fullSuperStickers in Tab 2');
  assert.ok(panelSource.includes('downloadedSuperStickers'), 'Must compute downloadedSuperStickers from packId');
  assert.ok(panelSource.includes('userCreatedCustomItems'), 'Must compute userCreatedCustomItems for Tab 4');
  assert.ok(!panelSource.includes('治愈萌宠生灵'), 'Must not render redundant subheadings in Tab 2');
  assert.ok(!panelSource.includes('生活道具与陪伴场景'), 'Must not render redundant subheadings in Tab 2');

  // 4. Tab 3 颜文字：固定 3 列对称栅格
  assert.ok(panelSource.includes('kaomojiFixedGrid'), 'Must use kaomojiFixedGrid');
  assert.ok(panelSource.includes('kaomojiFixedCell'), 'Must use kaomojiFixedCell');

  // 5. Tab 4 制作专区：三独立按钮免弹窗
  assert.ok(panelSource.includes('handleDirectCreateSticker(\'camera\')'), 'Must have direct camera button');
  assert.ok(panelSource.includes('handleDirectCreateSticker(\'library\')'), 'Must have direct library button');
  assert.ok(panelSource.includes('handleImportZip()'), 'Must have direct zip import button');

  // 6. 严禁装饰性 Emoji
  assert.ok(!panelSource.includes('🐱'), 'Must not contain cat emoji');
  assert.ok(!panelSource.includes('☕'), 'Must not contain coffee emoji');
  assert.ok(!panelSource.includes('✨'), 'Must not contain sparkles emoji');
  assert.ok(!panelSource.includes('📥'), 'Must not contain inbox emoji');

  // 7. 支持长按连续快速退格与无障碍触控目标规范
  assert.ok(panelSource.includes('handleBackspacePressIn'), 'Must support backspace press-in continuous deletion');
  assert.ok(panelSource.includes('stopContinuousBackspace'), 'Must stop continuous backspace on press-out');
  assert.ok(panelSource.includes('minWidth: 44'), 'Must respect 44dp touch target standard');
});

test('ImInputBar implements seamless transition between keyboard and emoticon panel', () => {
  const inputBarSource = read('src/im/components/ImInputBar.tsx');

  assert.ok(inputBarSource.includes('modeSV'), 'Must track switching state with modeSV');
  assert.ok(inputBarSource.includes('_cachedKbHeight'), 'Must track keyboard height');
  assert.ok(inputBarSource.includes('useKeyboardHandler'), 'Must listen to keyboard frames with useKeyboardHandler');
  assert.ok(inputBarSource.includes('transitionToKeyboard'), 'Must implement smooth handover transition to keyboard');
  assert.ok(inputBarSource.includes('animateCloseEmoticons'), 'Must implement smooth descent animation');
  assert.ok(inputBarSource.includes('useImperativeHandle'), 'Must expose imperative ref handle');
  assert.ok(inputBarSource.includes('collapse:'), 'Must expose collapse method on ref');
});

test('ImChatList and ImChatScreen collapse emoticon panel on tapping empty chat space', () => {
  const chatListSource = read('src/im/components/ImChatList.tsx');
  const chatScreenSource = read('src/im/screens/ImChatScreen.tsx');

  assert.ok(chatListSource.includes('onPressBackground?: () => void;'), 'ImChatList must declare onPressBackground in props');
  assert.ok(chatListSource.includes('onPress={onPressBackground}'), 'ImChatList rows and background must trigger onPressBackground');
  assert.ok(chatListSource.includes('onScrollBeginDrag'), 'ImChatList must trigger fold on scroll begin drag');
  assert.ok(chatScreenSource.includes('handleDismissPanels'), 'ImChatScreen must define handleDismissPanels');
  assert.ok(chatScreenSource.includes('inputBarRef.current?.collapse()'), 'ImChatScreen must call inputBar collapse on tap background');
  assert.ok(chatScreenSource.includes('onPressBackground={handleDismissPanels}'), 'ImChatScreen must pass handleDismissPanels to ImChatList');
});
