const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('image reader uses cursor windows, initial index positioning, adaptive prefetch, and coalesced writes', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/ImageViewerScreen.tsx'), 'utf8');
  assert.match(source, /buildMediaReaderCursorRequest/);
  assert.match(source, /findCursorPageAroundId/);
  assert.match(source, /findFilteredCursorPage/);
  assert.match(source, /initialScrollIndex=\{initialListIndex\}/);
  assert.match(source, /MediaImagePrefetchCoordinator/);
  assert.match(source, /MediaLastViewedQueue/);
  assert.match(source, /getMediaReaderSession/);
  assert.match(source, /cached\?\.entryId === imageId/);
  assert.doesNotMatch(source, /await imageRepository\.touchLastViewedAt\(db, activeImage\.id\)/);
  assert.doesNotMatch(source, /loadImagesForContext/);
});

test('Personal lock clears reader metadata sessions with image caches', () => {
  const source = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  assert.match(source, /clearPersonalMediaReaderSessions/);
  assert.match(source, /clearPersonalMediaReaderSessions\(\),\s*clearPersonalImageCache\(\)/);
});

test('repository exposes one-statement bulk last-view update', () => {
  const source = fs.readFileSync(path.join(root, 'src/database/repositories/imageRepository.ts'), 'utf8');
  assert.match(source, /async touchLastViewedAtMany/);
  assert.match(source, /UPDATE image_assets SET lastViewedAt = \? WHERE id IN \(\$\{inClause\.placeholders\}\)/);
});

test('detail screens do not feed last-view writes back into their refresh-token load effects', () => {
  for (const relativePath of ['src/screens/ImageDetailScreen.tsx', 'src/screens/VideoDetailScreen.tsx']) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    const lastViewedWrite = source.slice(
      source.indexOf('touchLastViewedAt'),
      source.indexOf('touchLastViewedAt') + 260
    );
    assert.doesNotMatch(lastViewedWrite, /onRefreshed\(\)/);
    assert.match(source, /useEffect\(\(\) => \(\) => onRefreshedRef\.current\(\), \[\]\)/);
  }
});

test('Android memory trim drives encoded-only reader prefetch with viewport pixel bounds', () => {
  const viewer = fs.readFileSync(path.join(root, 'src/screens/ImageViewerScreen.tsx'), 'utf8');
  const wrapper = fs.readFileSync(path.join(root, 'src/native/pixoryMediaModule.ts'), 'utf8');
  const nativePaths = [
    'android/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt',
    'plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt',
  ];

  assert.match(wrapper, /export interface NativeMemoryPressureEvent/);
  assert.match(wrapper, /addNativeMemoryPressureListener/);
  assert.match(wrapper, /PixoryMediaMemoryPressure/);
  assert.match(viewer, /addNativeMemoryPressureListener/);
  assert.match(viewer, /memoryPressure/);
  assert.match(viewer, /maxWidth: decodeMaxWidth, maxHeight: decodeMaxHeight/);
  assert.match(viewer, /memoryPressure,/);

  for (const relativePath of nativePaths) {
    const native = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert.match(native, /ComponentCallbacks2/);
    assert.match(native, /registerComponentCallbacks\(this\)/);
    assert.match(native, /unregisterComponentCallbacks\(this\)/);
    assert.match(native, /override fun onTrimMemory/);
    assert.match(native, /override fun onLowMemory/);
    assert.match(native, /PixoryMediaMemoryPressure/);
  }
});
