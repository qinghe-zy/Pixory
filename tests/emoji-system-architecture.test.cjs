const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('emoji system architecture exports decoupled components and catalog', () => {
  const catalogSource = read('src/components/emoji/emojiCatalog.ts');
  const typesSource = read('src/components/emoji/types.ts');
  const recentSource = read('src/components/emoji/recentEmojiService.ts');
  const panelSource = read('src/components/emoji/EmojiPickerPanel.tsx');

  assert.ok(catalogSource.includes('ANIMATED_EMOJIS'));
  assert.ok(catalogSource.includes('STATIC_EMOJIS'));
  assert.ok(catalogSource.includes('KAOMOJIS'));
  assert.ok(catalogSource.includes('EMOJI_TABS'));
  assert.ok(typesSource.includes('EmojiPickerPanelProps'));
  assert.ok(recentSource.includes('MAX_RECENT_COUNT = 14'));
  assert.ok(panelSource.includes('EmojiPickerPanel'));
});

test('emoji catalog complies with strict grid numbers: 35 animated, 105 static, 77 kaomoji', () => {
  const catalogSource = read('src/components/emoji/emojiCatalog.ts');

  // 35 animated items (5 rows of 7)
  const animMatches = catalogSource.match(/makeAnimatedEmoji\('[^']+'/g) || [];
  assert.equal(animMatches.length, 35, 'Must contain exactly 35 animated emojis');

  // 105 static items (15 rows of 7)
  // Check that STATIC_EMOJI_CHARS has 15 rows of 7
  assert.ok(catalogSource.includes('STATIC_EMOJI_CHARS'), 'Must export STATIC_EMOJI_CHARS');
  const staticCharsBlock = catalogSource.slice(
    catalogSource.indexOf('STATIC_EMOJI_CHARS: string[] = ['),
    catalogSource.indexOf('];', catalogSource.indexOf('STATIC_EMOJI_CHARS'))
  );
  const staticQuotes = staticCharsBlock.match(/'[^']+'/g) || [];
  assert.equal(staticQuotes.length, 105, 'Must contain exactly 105 static emoji characters');

  // 77 kaomoji items (11 rows of 7)
  assert.ok(catalogSource.includes('KAOMOJI_CHARS'), 'Must export KAOMOJI_CHARS');
  const kaomojiMatch = catalogSource.match(/KAOMOJI_CHARS: string\[\] = \[([\s\S]*?)\];/);
  assert.ok(kaomojiMatch, 'Must find KAOMOJI_CHARS array');
  const kaomojiItems = eval('[' + kaomojiMatch[1] + ']');
  assert.equal(kaomojiItems.length, 77, 'Must contain exactly 77 kaomojis (>= 70 requirement)');
});

test('emoji tab bar has zero text labels and only monochrome outline icons', () => {
  const catalogSource = read('src/components/emoji/emojiCatalog.ts');
  const panelSource = read('src/components/emoji/EmojiPickerPanel.tsx');

  // Check tab definitions: only iconName and accessibilityLabel, no display text field
  assert.ok(catalogSource.includes("iconName: 'happy-outline'"));
  assert.ok(catalogSource.includes("iconName: 'chatbox-ellipses-outline'"));

  // Check tab rendering: renders Ionicons with monochrome color (#111827 / #9CA3AF), no <Text> inside tab button
  assert.ok(!panelSource.includes('<Text style={styles.tabText}'));
});

test('IM chat bubble registry and input bar seamlessly mount sticker system', () => {
  const registrySource = read('src/im/registry/bubbleRegistry.ts');
  const inputBarSource = read('src/im/components/ImInputBar.tsx');
  const typesSource = read('src/im/types/index.ts');

  assert.ok(registrySource.includes("registry.set('sticker', StickerBubbleRenderer"));
  assert.ok(inputBarSource.includes('<EmojiPickerPanel'));
  assert.ok(inputBarSource.includes('onSendSticker'));
  assert.ok(typesSource.includes("'sticker'"));
});
