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
