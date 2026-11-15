const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTsModule } = require('./helpers/loadTsModule.cjs');

const {
  clearImageDimensionsCache,
  computeBoundedImageDimensions,
  copyCachedImageDimensions,
  getCachedImageDimensions,
  rememberImageDimensions,
} = loadTsModule('src/utils/chatImageSizing.ts');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

test('computeBoundedImageDimensions preserves natural landscape and portrait aspect ratios within bounds', () => {
  const landscape = computeBoundedImageDimensions(1600, 900);
  assert.equal(landscape.width, 220);
  assert.equal(landscape.height, 124);
  assert.notEqual(landscape.width, landscape.height);

  const portrait = computeBoundedImageDimensions(900, 1600);
  assert.equal(portrait.height, 280);
  assert.equal(portrait.width, 158);
  assert.notEqual(portrait.width, portrait.height);

  const square = computeBoundedImageDimensions(1000, 1000);
  assert.deepEqual(square, { width: 220, height: 220 });

  // Extreme panorama and screenshot are clamped cleanly to avoid illegible strips
  const panorama = computeBoundedImageDimensions(4000, 400);
  assert.equal(panorama.width, 220);
  assert.equal(panorama.height, 100);

  const tallStrip = computeBoundedImageDimensions(300, 4000);
  assert.equal(tallStrip.height, 280);
  assert.equal(tallStrip.width, 126);

  // Invalid dimensions fall back cleanly
  assert.deepEqual(computeBoundedImageDimensions(null, undefined), { width: 180, height: 135 });
  assert.deepEqual(computeBoundedImageDimensions(0, -10), { width: 180, height: 135 });
  assert.deepEqual(computeBoundedImageDimensions(Number.NaN, 100), { width: 180, height: 135 });
});

test('chatImageSizing LRU cache remembers, copies, and bounds stored dimensions', () => {
  clearImageDimensionsCache();

  rememberImageDimensions('file:///temp/photo-1.jpg', 1200.4, 800.6);
  assert.deepEqual(getCachedImageDimensions('file:///temp/photo-1.jpg'), {
    width: 1200,
    height: 801,
  });

  copyCachedImageDimensions('file:///temp/photo-1.jpg', 'file:///app/thread_1/photo-1.jpg');
  assert.deepEqual(getCachedImageDimensions('file:///app/thread_1/photo-1.jpg'), {
    width: 1200,
    height: 801,
  });

  // Verify LRU cap of 500 entries by overflowing and keeping recent entries
  for (let i = 0; i < 520; i += 1) {
    rememberImageDimensions(`file:///lru/${i}.jpg`, 100 + i, 200);
  }
  assert.equal(getCachedImageDimensions('file:///lru/0.jpg'), null);
  assert.deepEqual(getCachedImageDimensions('file:///lru/519.jpg'), { width: 619, height: 200 });

  clearImageDimensionsCache();
});

test('chat components preserve image proportions and render load-failure placeholders cleanly', () => {
  const secureImage = read('src/components/SecureImage.tsx');
  const proportional = read('src/components/ProportionalSecureImage.tsx');
  const aiBubble = read('src/components/ai/AiMessageBubble.tsx');
  const imRenderer = read('src/im/components/renderers/ImageBubbleRenderer.tsx');
  const composerBar = read('src/components/ai/AiComposerAttachmentBar.tsx');

  assert.match(secureImage, /onError\?:/);
  assert.match(secureImage, /onLoad\?:/);
  assert.match(secureImage, /failedUri/);
  assert.match(proportional, /useProportionalImageDimensions/);
  assert.match(aiBubble, /<ProportionalSecureImage/);
  assert.doesNotMatch(aiBubble, /attachmentImageOuter:\s*\{[^}]*width:\s*120/s);
  assert.doesNotMatch(imRenderer, /width:\s*175,\s*height:\s*175/);
  assert.match(imRenderer, /useProportionalImageDimensions/);
  assert.match(composerBar, /tileWrap:[\s\S]*?overflow:\s*'hidden'/);
});

test('AiChatScreen eliminates Fabric inverted-list white-screen hazards on image send', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const service = read('src/ai/aiChatService.ts');
  const manager = read('src/ai/aiGenerationManager.ts');

  assert.match(chat, /tailListRemoveClippedSubviews = Platform\.OS === "android" \? false : undefined/);
  assert.doesNotMatch(chat, /maintainVisibleContentPosition/);
  assert.doesNotMatch(chat, /messageScrollContent:\s*\{[^}]*\bgap:/s);
  assert.match(chat, /messageItemRowSpacing:/);
  assert.match(chat, /const userMessageId = createAiMessageId\(\)/);
  assert.match(chat, /onAttachmentsPersisted:/);
  assert.doesNotMatch(chat, /if \(!pendingUserMessage \|\| pendingUserMessage\?\.hasAttachments\)/);
  assert.match(chat, /locallyCreatedThreadIdRef\.current === targetThreadId/);
  assert.match(chat, /suppressNextAppStateReloadRef\.current/);
  assert.match(chat, /clearSignal=\{composerClearSignal\}/);
  assert.match(chat, /<AiChatComposer[\s\S]*?space=\{space\}/);

  assert.match(service, /export function createAiMessageId\(/);
  assert.match(service, /input\.onAttachmentsPersisted\?\.\(/);
  assert.match(service, /copyCachedImageDimensions\(/);
  assert.match(manager, /onAttachmentsPersisted:\s*\(payload\)\s*=>\s*emitAttachmentsPersisted\(task, payload\)/);
});
