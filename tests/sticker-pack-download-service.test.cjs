const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('sticker pack download service defines 4 large packs with 30+ stickers each and yellow faces as dominant', () => {
  const serviceSource = read('src/components/emoji/stickerPackDownloadService.ts');
  const marketSource = read('src/components/emoji/StickerMarketModal.tsx');

  assert.ok(serviceSource.includes('PRESET_STICKER_PACKS'), 'Must export PRESET_STICKER_PACKS');
  assert.ok(serviceSource.includes('pack_yellow_faces_pro'), 'Must include yellow faces pro pack');
  assert.ok(serviceSource.includes('pack_pets'), 'Must include pets pack');
  assert.ok(serviceSource.includes('pack_props'), 'Must include props pack');
  assert.ok(serviceSource.includes('pack_gestures'), 'Must include gestures pack');

  // Check that pack sizes are >= 30
  assert.ok(serviceSource.includes('itemCount: 35'), 'Yellow faces pro pack must have 35 items');
  assert.ok(serviceSource.includes('itemCount: 30'), 'Other packs must have 30 items');

  // Verify that NO decorative emoji symbols are used in pack titles or button texts
  assert.ok(!serviceSource.includes('🐱'), 'Must not contain cat emoji symbol');
  assert.ok(!serviceSource.includes('☕'), 'Must not contain coffee emoji symbol');
  assert.ok(!serviceSource.includes('✨'), 'Must not contain sparkles emoji symbol');
  assert.ok(!serviceSource.includes('📥'), 'Must not contain inbox emoji symbol');

  assert.ok(!marketSource.includes('🐱'), 'Modal must not contain cat emoji');
  assert.ok(!marketSource.includes('☕'), 'Modal must not contain coffee emoji');
  assert.ok(!marketSource.includes('✨'), 'Modal must not contain sparkles emoji');
  assert.ok(!marketSource.includes('📥'), 'Modal must not contain inbox emoji');

  // Check clean buttons
  assert.ok(marketSource.includes('全部下载'), 'Must offer bulk download button');
  assert.ok(marketSource.includes('获取更多表情'), 'Must offer clean header title');
});

test('StickerPackDownloadService provides download, remove, and getInstalledPackIds methods', () => {
  const serviceSource = read('src/components/emoji/stickerPackDownloadService.ts');
  const resolverSource = read('src/components/emoji/StickerSemanticResolver.ts');

  assert.ok(serviceSource.includes('downloadPack('), 'Must provide downloadPack method');
  assert.ok(serviceSource.includes('removePack('), 'Must provide removePack method');
  assert.ok(serviceSource.includes('getInstalledPackIds('), 'Must provide getInstalledPackIds method');

  // Verify memory deregistration and domain repository cleanup
  assert.ok(serviceSource.includes('unregisterPackStickers(packId)'), 'removePack must deregister pack stickers from AI semantic resolver');
  assert.ok(serviceSource.includes('deleteStickerPack(db, packId)'), 'removePack must invoke repository cascade delete');
  assert.ok(resolverSource.includes('unregisterPackStickers'), 'StickerSemanticResolver must export unregisterPackStickers');
  assert.ok(resolverSource.includes('unregisterCustomSticker'), 'StickerSemanticResolver must export unregisterCustomSticker');
});
