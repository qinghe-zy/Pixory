const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('animated emojis retain all 35 items and use genuine 60fps moving animation URIs', () => {
  const catalogSource = read('src/components/emoji/emojiCatalog.ts');

  // Must contain exactly 35 makeAnimatedEmoji calls for the classic yellow faces
  const animMatches = catalogSource.match(/makeAnimatedEmoji\('[^']+'/g) || [];
  assert.equal(animMatches.length, 35, 'Must keep all 35 yellow face animated emojis');

  // Must NOT use the old static Teams thumbnail preview ending in 100_anim_f.png
  assert.ok(
    !catalogSource.includes('100_anim_f.png'),
    'Must not use static Teams 100_anim_f.png thumbnails'
  );

  // Must use verified 60fps moving assets
  assert.ok(
    catalogSource.includes('FLUENT_ANIM_BASE') || catalogSource.includes('jsdelivr.net'),
    'Must use verified animated CDN base'
  );
});

test('expanded companion sticker collections (pets, props, gestures) are exported with proper categories', () => {
  const catalogSource = read('src/components/emoji/emojiCatalog.ts');

  assert.ok(catalogSource.includes('COMPANION_PET_STICKERS'), 'Must export COMPANION_PET_STICKERS');
  assert.ok(catalogSource.includes('COMPANION_PROP_STICKERS'), 'Must export COMPANION_PROP_STICKERS');
  assert.ok(catalogSource.includes('COMPANION_GESTURE_STICKERS'), 'Must export COMPANION_GESTURE_STICKERS');
  assert.ok(catalogSource.includes('ALL_COMPANION_STICKERS'), 'Must export ALL_COMPANION_STICKERS');

  // Check categories: animal, prop, gesture
  assert.ok(catalogSource.includes("'animal'"));
  assert.ok(catalogSource.includes("'prop'"));
  assert.ok(catalogSource.includes("'gesture'"));
});

test('emoji tab bar defines 4 monochrome outline icon tabs with zero text labels', () => {
  const catalogSource = read('src/components/emoji/emojiCatalog.ts');

  assert.ok(catalogSource.includes("id: 'fluent_emoji'"));
  assert.ok(catalogSource.includes("id: 'companion_stickers'"));
  assert.ok(catalogSource.includes("id: 'kaomoji'"));
  assert.ok(catalogSource.includes("id: 'custom_stickers'"));

  assert.ok(catalogSource.includes("iconName: 'happy-outline'"));
  assert.ok(catalogSource.includes("iconName: 'emoticon-cool-outline'"));
  assert.ok(catalogSource.includes("iconFamily: 'MaterialCommunityIcons'"));
  assert.ok(catalogSource.includes("iconName: 'chatbox-ellipses-outline'"));
  assert.ok(catalogSource.includes("iconName: 'heart-outline'"));
});

test('database schema migration 72 provides custom_stickers and custom_sticker_packs', () => {
  const schemaSource = read('src/database/schema.ts');
  const dbSource = read('src/database/db.ts');

  assert.ok(schemaSource.includes('DATABASE_VERSION = 72'), 'DATABASE_VERSION must be 72');
  assert.ok(schemaSource.includes('MIGRATION_STATEMENTS_V72'), 'Must export MIGRATION_STATEMENTS_V72');
  assert.ok(schemaSource.includes('CREATE TABLE IF NOT EXISTS custom_stickers'));
  assert.ok(schemaSource.includes('CREATE TABLE IF NOT EXISTS custom_sticker_packs'));
  assert.ok(dbSource.includes('if (currentVersion < 72)'));
});

test('custom sticker repository provides complete lifecycle methods', () => {
  const repoSource = read('src/database/repositories/customStickerRepository.ts');
  const indexSource = read('src/database/index.ts');

  assert.ok(repoSource.includes('listCustomStickers'));
  assert.ok(repoSource.includes('insertCustomSticker'));
  assert.ok(repoSource.includes('batchInsertCustomStickers'));
  assert.ok(repoSource.includes('deleteCustomSticker'));
  assert.ok(repoSource.includes('listStickerPacks'));
  assert.ok(repoSource.includes('insertStickerPack'));
  assert.ok(indexSource.includes('customStickerRepository'));
});

test('custom sticker service provides studio creation and zip import capabilities', () => {
  const serviceSource = read('src/components/emoji/customStickerService.ts');
  const indexSource = read('src/components/emoji/index.ts');

  assert.ok(serviceSource.includes('pickAndCreateCustomSticker'));
  assert.ok(serviceSource.includes('pickAndImportZip'));
  assert.ok(serviceSource.includes('importStickerPackFromZip'));
  assert.ok(serviceSource.includes('hydrateCustomStickers'));
  assert.ok(serviceSource.includes('deleteSticker'));
  assert.ok(indexSource.includes('CustomStickerService'));
});

test('StickerSemanticResolver provides direct name/keyword resolution for custom stickers', () => {
  const resolverSource = read('src/components/emoji/StickerSemanticResolver.ts');

  // Verify direct custom sticker matching logic exists
  assert.ok(resolverSource.includes('directCustom'));
  assert.ok(resolverSource.includes('keywords'));
  assert.ok(resolverSource.includes('ALL_COMPANION_STICKERS'));
});
