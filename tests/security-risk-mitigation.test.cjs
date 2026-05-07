const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('backup export streams files to SAF through the native media module', () => {
  const backupSource = readProjectFile('src/services/backupService.ts');
  const nativeSource = readProjectFile('src/native/pixoryMediaModule.ts');

  assert.match(backupSource, /copyFileToSafWithProgress/);
  assert.doesNotMatch(backupSource, /StorageAccessFramework\.writeAsStringAsync/);
  assert.match(nativeSource, /copyFileToSafWithProgress/);
});

test('native media module performs large IO off the React Native bridge and cleans failed outputs', () => {
  const source = readProjectFile('android/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt');

  assert.match(source, /Executors\.newFixedThreadPool/);
  assert.match(source, /runOnIo\(promise/);
  assert.match(source, /copyStream\(/);
  assert.match(source, /ensureEnoughSpace/);
  assert.match(source, /resolver\.delete\(destinationUri/);
  assert.match(source, /addListener\(eventName: String\)/);
  assert.match(source, /removeListeners\(count: Int\)/);
});

test('video and archive safety paths avoid known OOM and stale-temp regressions', () => {
  const nativeSource = readProjectFile('android/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt');
  const playerSource = readProjectFile('src/screens/VideoPlayerScreen.tsx');
  const archiveSource = readProjectFile('src/screens/ArchiveReaderScreen.tsx');
  const appSource = readProjectFile('App.tsx');

  assert.match(nativeSource, /getScaledFrameAtTime/);
  assert.match(nativeSource, /METADATA_KEY_VIDEO_ROTATION/);
  assert.match(nativeSource, /MAX_ZIP_ENTRY_BYTES/);
  assert.match(nativeSource, /MAX_ZIP_IMAGE_ENTRIES/);
  assert.match(playerSource, /sourceLoadVersionRef/);
  assert.match(playerSource, /AppState\.addEventListener/);
  assert.match(archiveSource, /cleanupSessionDir/);
  assert.match(appSource, /cleanupOldTempFiles\('personal', 0\)/);
});

test('video player cannot auto-start or keep playing after lifecycle transitions', () => {
  const playerSource = readProjectFile('src/screens/VideoPlayerScreen.tsx');

  const sourceLoadBlock = playerSource.slice(
    playerSource.indexOf('void player.replaceAsync'),
    playerSource.indexOf('}).catch((error)', playerSource.indexOf('void player.replaceAsync'))
  );

  assert.doesNotMatch(sourceLoadBlock, /player\.play\(\)|safePlayPlayer\(\)/);
  assert.match(sourceLoadBlock, /safePausePlayer\(\)/);
  assert.match(playerSource, /const \[isPlaying, setIsPlaying\] = useState\(false\)/);
  assert.match(playerSource, /AppState\.addEventListener\('change'[\s\S]*safePausePlayer\(\)/);
  assert.match(playerSource, /function handleBack\(\)[\s\S]*safePausePlayer\(\)[\s\S]*onBack\(\)/);
  assert.match(playerSource, /isHoldingFastForwardRef\.current && !holdWasPlayingRef\.current[\s\S]*safePausePlayer\(\)/);
});

test('external file entries leave Pixory instead of interrupting the source app reading flow', () => {
  const appSource = readProjectFile('App.tsx');
  const playerSource = readProjectFile('src/screens/VideoPlayerScreen.tsx');

  assert.match(appSource, /function isExternalEntryRoute\(route: AppRoute\)/);
  assert.match(appSource, /rootRoute && isExternalEntryRoute\(rootRoute\)[\s\S]*BackHandler\.exitApp\(\)/);
  assert.match(appSource, /function exitExternalEntry\(\)[\s\S]*BackHandler\.exitApp\(\)/);
  assert.match(appSource, /currentRoute\.name === 'external-video-player'[\s\S]*onBack=\{exitExternalEntry\}/);
  assert.match(appSource, /currentRoute\.name === 'archive-reader'[\s\S]*onBack=\{exitExternalEntry\}/);
  assert.doesNotMatch(playerSource, /title="视频操作" visible=\{moreVisible\}/);
  assert.match(playerSource, /styles\.moreMenu/);
});

test('video player scrubbing works from both the progress bar and video surface', () => {
  const playerSource = readProjectFile('src/screens/VideoPlayerScreen.tsx');

  assert.match(playerSource, /const \[surfaceWidth, setSurfaceWidth\] = useState\(1\)/);
  assert.match(playerSource, /surfacePanResponder = useMemo/);
  assert.match(playerSource, /onMoveShouldSetPanResponder:[\s\S]*gestureState\.dx/);
  assert.match(playerSource, /seekFromTrackLocation\(event\.nativeEvent\.locationX\)/);
  assert.match(playerSource, /function seekFromSurfaceDelta\(deltaX: number\)/);
  assert.match(playerSource, /scrubStartTimeRef\.current \+ \(deltaX \/ surfaceWidth\) \* effectiveDuration/);
  assert.match(playerSource, /getEffectiveDuration\(\)[\s\S]*player\.duration/);
});

test('video surface exposes compact hold-speed feedback and double-tap play pause', () => {
  const playerSource = readProjectFile('src/screens/VideoPlayerScreen.tsx');

  assert.match(playerSource, /const \[holdSpeedVisible, setHoldSpeedVisible\] = useState\(false\)/);
  assert.match(playerSource, /setHoldSpeedVisible\(true\)/);
  assert.match(playerSource, /styles\.holdSpeedBadge/);
  assert.match(playerSource, /DOUBLE_TAP_PAUSE_WINDOW_MS/);
  assert.match(playerSource, /function handleSurfacePress\(\)[\s\S]*togglePlay\(\)/);
  assert.match(playerSource, /onPress=\{handleSurfacePress\}/);
});
