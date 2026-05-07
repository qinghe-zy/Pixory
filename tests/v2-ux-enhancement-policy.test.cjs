const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('Android share collection registers single and multiple image video file shares', () => {
  const manifest = readProjectFile('android/app/src/main/AndroidManifest.xml');
  const shareActivity = readProjectFile('android/app/src/main/java/com/pixory/app/PixoryShareActivity.kt');
  const nativeModule = readProjectFile('android/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt');
  const nativeBridge = readProjectFile('src/native/pixoryMediaModule.ts');

  assert.match(manifest, /PixoryShareActivity/);
  assert.match(manifest, /android:theme="@style\/Theme\.Pixory\.Share"/);
  assert.match(manifest, /android\.intent\.action\.SEND/);
  assert.match(manifest, /android\.intent\.action\.SEND_MULTIPLE/);
  assert.match(manifest, /android:mimeType="image\/\*"/);
  assert.match(manifest, /android:mimeType="video\/\*"/);
  assert.match(manifest, /android:mimeType="\*\/\*"/);
  assert.match(shareActivity, /class PixoryShareActivity : MainActivity/);
  assert.match(nativeModule, /Intent\.ACTION_SEND_MULTIPLE/);
  assert.match(nativeModule, /getInitialShareIntent/);
  assert.match(nativeModule, /finishShareActivity/);
  assert.match(nativeBridge, /getInitialShareIntent/);
  assert.match(nativeBridge, /finishNativeShareActivity/);
});

test('share collection imports external URI copies into Pixory storage before database records', () => {
  const appSource = readProjectFile('App.tsx');
  const shareScreen = readProjectFile('src/screens/ShareCollectScreen.tsx');

  assert.match(appSource, /share-collect/);
  assert.match(appSource, /getInitialShareIntent/);
  assert.match(shareScreen, /importSingleImage/);
  assert.match(shareScreen, /importVideosToIp/);
  assert.match(shareScreen, /finishNativeShareActivity/);
  assert.match(shareScreen, /sourceUri:\s*item\.uri/);
  assert.doesNotMatch(shareScreen, /originalFileUri:\s*item\.uri/);
  assert.doesNotMatch(shareScreen, /coverThumbnailFileUri:\s*item\.uri/);
});

test('swipe grid selection only selects images and supports edge autoscroll', () => {
  const hookSource = readProjectFile('src/hooks/useSwipeGridSelection.ts');
  const batchSource = readProjectFile('src/screens/BatchManageImagesScreen.tsx');

  assert.match(hookSource, /mediaType === 'image'/);
  assert.match(hookSource, /AUTO_SCROLL_EDGE_SIZE/);
  assert.match(hookSource, /scrollTo/);
  assert.match(hookSource, /onMoveShouldSetPanResponder/);
  assert.match(batchSource, /useSwipeGridSelection/);
  assert.match(batchSource, /swipeSelection\.panHandlers/);
  assert.match(batchSource, /registerItemLayout/);
});

test('undo snackbar is a global four second feedback path distinct from short toast', () => {
  const toastSource = readProjectFile('src/components/AppToast.tsx');
  const batchSource = readProjectFile('src/screens/BatchManageImagesScreen.tsx');
  const imageDetailSource = readProjectFile('src/screens/ImageDetailScreen.tsx');

  assert.match(toastSource, /showUndoSnackbar/);
  assert.match(toastSource, /4000/);
  assert.match(toastSource, /kind:\s*'undo'/);
  assert.match(batchSource, /showUndoSnackbar/);
  assert.match(imageDetailSource, /showUndoSnackbar/);
});

test('trash cleanup keeps a 30 day DB driven policy with persisted failure records', () => {
  const schemaSource = readProjectFile('src/database/schema.ts');
  const trashSource = readProjectFile('src/services/trashService.ts');
  const appSource = readProjectFile('App.tsx');
  const trashScreenSource = readProjectFile('src/screens/TrashScreen.tsx');

  assert.match(schemaSource, /DATABASE_VERSION\s*=\s*14/);
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS trash_cleanup_failures/);
  assert.match(trashSource, /TRASH_RETENTION_DAYS\s*=\s*30/);
  assert.match(trashSource, /findExpiredTrashItems/);
  assert.match(trashSource, /clearExpiredTrashOnIdle/);
  assert.match(trashSource, /recordTrashCleanupFailure/);
  assert.match(trashSource, /findDeleted\(db/);
  assert.doesNotMatch(trashSource, /readDirectoryAsync\(getOriginalsDir/);
  assert.match(appSource, /clearExpiredTrashOnIdle\('normal'\)/);
  assert.match(trashScreenSource, /mediaType/);
  assert.match(trashScreenSource, /距永久删除/);
});
