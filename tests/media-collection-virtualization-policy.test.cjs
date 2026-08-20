const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('shared media collection uses FlatList with bounded render and cursor loading', () => {
  const component = read('src/components/VirtualizedAssetCollection.tsx');
  const hook = read('src/hooks/useMediaCursorCollection.ts');
  const pagedHook = read('src/hooks/usePagedScreenLoad.ts');

  assert.match(component, /<FlatList/);
  assert.match(component, /maxToRenderPerBatch=\{12\}/);
  assert.match(component, /windowSize=\{7\}/);
  assert.match(component, /onEndReachedThreshold=\{0\.6\}/);
  assert.match(hook, /findFilteredCursorPage/);
  assert.match(hook, /olderCursor/);
  assert.match(pagedHook, /loaderRef\.current\(currentData\.items\.length, currentData\.meta\)/);
});

test('high-volume asset screens no longer fully mount their media arrays', () => {
  const screens = [
    'src/screens/AllImagesScreen.tsx',
    'src/screens/GroupImagesScreen.tsx',
    'src/screens/TagResultScreen.tsx',
    'src/screens/FavoritesScreen.tsx',
    'src/screens/TrashScreen.tsx',
    'src/screens/BatchManageImagesScreen.tsx',
  ];

  for (const file of screens) {
    const source = read(file);
    assert.match(source, /VirtualizedAssetCollection/, file);
    assert.match(source, /useMediaCursorCollection/, file);
    assert.doesNotMatch(source, /\{(?:images|visibleImages)\.map\(/, file);
  }
});

test('cursor-backed screens do not call unbounded media repository list methods', () => {
  const expectations = new Map([
    ['src/screens/AllImagesScreen.tsx', /imageRepository\.findByIpId\(/],
    ['src/screens/GroupImagesScreen.tsx', /imageRepository\.findByGroupId\(/],
    ['src/screens/TagResultScreen.tsx', /imageRepository\.findByTagId\(/],
    ['src/screens/FavoritesScreen.tsx', /imageRepository\.findFavorites\(/],
    ['src/screens/TrashScreen.tsx', /imageRepository\.findDeleted(?:ByIpId)?\(/],
  ]);
  for (const [file, forbidden] of expectations) {
    assert.doesNotMatch(read(file), forbidden, file);
  }
});
