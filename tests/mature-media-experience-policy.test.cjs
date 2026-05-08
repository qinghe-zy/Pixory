const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('media experience dependencies and permissions are declared', () => {
  const packageJson = JSON.parse(readProjectFile('package.json'));
  const appJson = readProjectFile('app.json');

  assert.ok(packageJson.dependencies['expo-brightness'], 'expo-brightness dependency is required for brightness gestures');
  assert.ok(packageJson.dependencies['react-native-volume-manager'], 'react-native-volume-manager dependency is required for volume gestures');
  assert.match(appJson, /android\.permission\.WRITE_SETTINGS/);
});

test('video player exposes mature gesture controls and preference persistence', () => {
  const playerSource = readProjectFile('src/screens/VideoPlayerScreen.tsx');
  const preferenceSource = readProjectFile('src/services/mediaExperiencePreferences.ts');

  assert.match(playerSource, /import \* as Brightness from 'expo-brightness'/);
  assert.match(playerSource, /VolumeManager/);
  assert.match(playerSource, /GESTURE_DOUBLE_TAP_SEEK_SECONDS\s*=\s*10/);
  assert.match(playerSource, /isPlayerLocked/);
  assert.match(playerSource, /togglePlayerLock/);
  assert.match(playerSource, /gestureFeedback/);
  assert.match(playerSource, /brightnessOverlayOpacity/);
  assert.match(playerSource, /handlePartitionDoubleTap/);
  assert.match(playerSource, /adjustBrightnessFromGesture/);
  assert.match(playerSource, /adjustVolumeFromGesture/);
  assert.match(playerSource, /loadVideoPlayerPreferences/);
  assert.match(playerSource, /saveVideoPlayerPreferences/);
  assert.match(playerSource, /switchVideoByOffset/);
  assert.match(playerSource, /isLandscape \? \([\s\S]*上一个视频/);
  assert.match(playerSource, /isLandscape \? \([\s\S]*下一个视频/);
  assert.match(playerSource, /当前视频/);
  assert.match(preferenceSource, /videoPlayerPreferences/);
  assert.match(preferenceSource, /lockedByDefault/);
});

test('image viewer supports reader modes settings filmstrip and zoom-safe paging', () => {
  const viewerSource = readProjectFile('src/screens/ImageViewerScreen.tsx');
  const preferenceSource = readProjectFile('src/services/mediaExperiencePreferences.ts');

  for (const token of ['horizontal-ltr', 'horizontal-rtl', 'vertical-continuous']) {
    assert.match(viewerSource, new RegExp(token));
    assert.match(preferenceSource, new RegExp(token));
  }

  assert.match(viewerSource, /readerMode/);
  assert.match(viewerSource, /fitMode/);
  assert.match(viewerSource, /showFilmstrip/);
  assert.match(viewerSource, /readerSettingsVisible/);
  assert.match(viewerSource, /loadImageViewerPreferences/);
  assert.match(viewerSource, /saveImageViewerPreferences/);
  assert.match(viewerSource, /handleReaderZonePress/);
  assert.match(viewerSource, /goToRelativeImage/);
  assert.match(viewerSource, /verticalListRef/);
  assert.match(viewerSource, /renderVerticalItem/);
  assert.match(viewerSource, /Filmstrip/);
  assert.match(viewerSource, /handleViewerViewableItemsChanged/);
  assert.match(viewerSource, /viewabilityConfig=\{viewerViewabilityConfig\}/);
  assert.match(viewerSource, /filmstripRef/);
  assert.match(viewerSource, /viewPosition:\s*0\.5/);
  assert.match(viewerSource, /onPanAttemptBlockedByZoom/);
});
