const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('AppScreen enforces zero paddingBottom on non-scrollable or naked footer layouts', () => {
  const appScreenSource = readProjectFile('src/components/AppScreen.tsx');

  // Verify footerEstimateHeight calculation accounts for footerNaked
  assert.match(
    appScreenSource,
    /footerEstimateHeight\s*=\s*\(footer\s*&&\s*!footerNaked\)\s*\?\s*100\s*:\s*0/,
    'AppScreen must set footerEstimateHeight to 0 when footerNaked is true'
  );

  // Verify bodyBottomPadding is 0 when scrollable is false
  assert.match(
    appScreenSource,
    /bodyBottomPadding\s*=\s*scrollable\s*\?/,
    'AppScreen must only apply bodyBottomPadding when scrollable is true'
  );

  // Verify non-scrollable container does not append extra paddingBottom
  assert.match(
    appScreenSource,
    /<View style=\{\[styles\.content,\s*contentStyle\]\}>\{children\}<\/View>/,
    'AppScreen must not inject bodyBottomPadding into non-scrollable View content'
  );
});

test('useCompactHeaderAnimation provides display and pointerEvents guards against invisible touch triggers', () => {
  const hookSource = readProjectFile('src/hooks/useCompactHeaderAnimation.ts');

  // Verify display guard in compactHeaderStyle
  assert.match(
    hookSource,
    /display:\s*isVisible\s*\?\s*'flex'\s*:\s*'none'/,
    'compactHeaderStyle must set display to none when isVisible is false'
  );

  // Verify pointerEvents guard in compactAnimatedProps
  assert.match(
    hookSource,
    /pointerEvents:\s*scrollY\.value\s*>\s*start\s*\?\s*\('box-none' as const\)\s*:\s*\('none' as const\)/,
    'compactAnimatedProps must set pointerEvents to none when scrollY is below threshold'
  );
});

test('GalleryHeaders re-exports useCompactHeaderAnimation and binds animatedProps', () => {
  const galleryHeadersSource = readProjectFile('src/components/GalleryHeaders.tsx');

  // Verify re-export
  assert.match(
    galleryHeadersSource,
    /export\s*\{\s*useCompactHeaderAnimation\s*\}\s*from\s*'\.\.\/hooks\/useCompactHeaderAnimation'/,
    'GalleryHeaders must export useCompactHeaderAnimation'
  );

  // Verify animatedProps binding
  assert.match(
    galleryHeadersSource,
    /animatedProps=\{animatedProps\}/,
    'GalleryCompactHeader must bind animatedProps to Animated.View'
  );
});

test('All list gallery screens bind animatedProps and pass paddingBottom: 0 on ScreenScaffold', () => {
  const allImagesSource = readProjectFile('src/screens/AllImagesScreen.tsx');
  const batchManageSource = readProjectFile('src/screens/BatchManageImagesScreen.tsx');
  const groupImagesSource = readProjectFile('src/screens/GroupImagesScreen.tsx');
  const favoritesSource = readProjectFile('src/screens/FavoritesScreen.tsx');
  const tagResultSource = readProjectFile('src/screens/TagResultScreen.tsx');
  const trashSource = readProjectFile('src/screens/TrashScreen.tsx');

  // Verify AllImagesScreen
  assert.match(
    allImagesSource,
    /animatedProps=\{compactAnimatedProps\}/,
    'AllImagesScreen must pass compactAnimatedProps to sticky header'
  );
  assert.match(
    allImagesSource,
    /paddingBottom:\s*0/,
    'AllImagesScreen ScreenScaffold must specify paddingBottom: 0'
  );
  assert.match(
    allImagesSource,
    /contentContainerStyle=\{selectionListContentContainerStyle\}/,
    'AllImagesScreen VirtualizedAssetCollection must use selectionListContentContainerStyle'
  );

  // Verify BatchManageImagesScreen
  assert.match(
    batchManageSource,
    /animatedProps=\{compactAnimatedProps\}/,
    'BatchManageImagesScreen must pass compactAnimatedProps to GalleryCompactHeader'
  );

  // Verify GroupImagesScreen
  assert.match(
    groupImagesSource,
    /animatedProps=\{compactAnimatedProps\}/,
    'GroupImagesScreen must pass compactAnimatedProps to GalleryCompactHeader'
  );
  assert.match(
    groupImagesSource,
    /contentContainerStyle=\{selectionListContentContainerStyle\}/,
    'GroupImagesScreen VirtualizedAssetCollection must use selectionListContentContainerStyle'
  );

  // Verify FavoritesScreen
  assert.match(
    favoritesSource,
    /animatedProps=\{compactAnimatedProps\}/,
    'FavoritesScreen must pass compactAnimatedProps to GalleryCompactHeader'
  );
  assert.match(
    favoritesSource,
    /contentContainerStyle=\{selectionListContentContainerStyle\}/,
    'FavoritesScreen VirtualizedAssetCollection must use selectionListContentContainerStyle'
  );

  // Verify TagResultScreen
  assert.match(
    tagResultSource,
    /animatedProps=\{compactAnimatedProps\}/,
    'TagResultScreen must pass compactAnimatedProps to GalleryCompactHeader'
  );
  assert.match(
    tagResultSource,
    /contentContainerStyle=\{selectionListContentContainerStyle\}/,
    'TagResultScreen VirtualizedAssetCollection must use selectionListContentContainerStyle'
  );

  // Verify TrashScreen
  assert.match(
    trashSource,
    /animatedProps=\{compactAnimatedProps\}/,
    'TrashScreen must pass compactAnimatedProps to GalleryCompactHeader'
  );

  // Verify GlobalGroupsScreen
  const globalGroupsSource = readProjectFile('src/screens/GlobalGroupsScreen.tsx');
  assert.match(
    globalGroupsSource,
    /animatedProps=\{compactAnimatedProps\}/,
    'GlobalGroupsScreen must bind compactAnimatedProps to Animated.View'
  );
});
