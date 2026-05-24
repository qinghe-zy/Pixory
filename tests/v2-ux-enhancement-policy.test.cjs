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

test('Android open-with filters cover videos, zip cbz packs, and content file URI matching', () => {
  const manifest = readProjectFile('android/app/src/main/AndroidManifest.xml');

  assert.match(manifest, /android\.intent\.action\.VIEW/);
  assert.match(manifest, /android:mimeType="video\/\*"/);
  assert.match(manifest, /android:mimeType="application\/zip"/);
  assert.match(manifest, /android:mimeType="application\/x-cbz"/);
  assert.match(manifest, /android:mimeType="application\/vnd\.comicbook\+zip"/);
  assert.match(manifest, /android:pathSuffix="\.zip"/);
  assert.match(manifest, /android:pathSuffix="\.cbz"/);
  assert.match(manifest, /android:pathSuffix="\.pixorypack"/);
  assert.match(manifest, /android:scheme="content"/);
  assert.match(manifest, /android:scheme="file"/);
});

test('native intent parsing exposes action names plus URI metadata for both open and share flows', () => {
  const nativeModule = readProjectFile('android/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt');
  const nativeBridge = readProjectFile('src/native/pixoryMediaModule.ts');

  assert.match(nativeModule, /putString\("action", intent\.action\)/);
  assert.match(nativeModule, /putDouble\("fileSize", resolveSize\(uri\)\.toDouble\(\)\)/);
  assert.match(nativeModule, /putString\("name", resolveDisplayName\(uri\)/);
  assert.match(nativeModule, /Intent\.ACTION_SEND_MULTIPLE/);
  assert.match(nativeModule, /Intent\.ACTION_VIEW/);
  assert.match(nativeBridge, /action\?: string \| null/);
  assert.match(nativeBridge, /fileSize\?: number \| null/);
});

test('expo config persists Android intent entry patches through a local config plugin template', () => {
  const appConfig = readProjectFile('app.json');
  const manifest = readProjectFile('android/app/src/main/AndroidManifest.xml');
  const pluginSource = readProjectFile('plugins/withPixoryAndroidIntents.js');
  const manifestTemplate = readProjectFile('plugins/pixory-android-intents/templates/app/src/main/AndroidManifest.xml');
  const activityTemplate = readProjectFile('plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/MainActivity.kt');
  const moduleTemplate = readProjectFile('plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt');

  assert.match(appConfig, /\.\/plugins\/withPixoryAndroidIntents/);
  assert.match(appConfig, /"softwareKeyboardLayoutMode": "resize"/);
  assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);
  assert.match(pluginSource, /AndroidManifest\.xml/);
  assert.match(pluginSource, /MainActivity\.kt/);
  assert.match(pluginSource, /PixoryMediaModule\.kt/);
  assert.match(manifestTemplate, /android:windowSoftInputMode="adjustResize"/);
  assert.match(manifestTemplate, /android:pathSuffix="\.pixorypack"/);
  assert.match(activityTemplate, /PixoryMediaModule\.dispatchIntent/);
  assert.match(moduleTemplate, /PixoryMediaIntentReceived/);
});

test('share collection imports external URI copies into Pixory storage before database records', () => {
  const appSource = readProjectFile('App.tsx');
  const shareScreen = readProjectFile('src/screens/ShareCollectScreen.tsx');

  assert.match(appSource, /share-collect/);
  assert.match(appSource, /getInitialShareIntent/);
  assert.match(shareScreen, /importSingleImage/);
  assert.match(shareScreen, /importVideosToIp/);
  assert.match(shareScreen, /finishNativeShareActivity/);
  assert.match(shareScreen, /require\('\.\.\/\.\.\/docs\/black\.png'\)/);
  assert.match(shareScreen, /styles\.sheetPatternImage/);
  assert.match(shareScreen, /styles\.previewModalPatternImage/);
  assert.match(shareScreen, /resizeMode="stretch"/);
  assert.match(shareScreen, /sourceUri:\s*item\.uri/);
  assert.doesNotMatch(shareScreen, /originalFileUri:\s*item\.uri/);
  assert.doesNotMatch(shareScreen, /coverThumbnailFileUri:\s*item\.uri/);
});

test('app startup routes share, external video, archive, and unsupported package opens without dropping to home silently', () => {
  const appSource = readProjectFile('App.tsx');

  assert.match(appSource, /function resolveShareRoute\(shareIntent: NativeShareIntent \| null \| undefined\)/);
  assert.match(appSource, /if \(!shareIntent\?\.hasShare \|\| shareIntent\.items\.length === 0\)/);
  assert.match(appSource, /const candidateName = \(externalOpen\.name \?\? externalOpen\.uri\)\.toLowerCase\(\)/);
  assert.match(appSource, /externalOpen\.action === 'android\.intent\.action\.VIEW'/);
  assert.match(appSource, /name: 'external-video-player'/);
  assert.match(appSource, /name: 'archive-reader'/);
  assert.match(appSource, /name: 'external-package-placeholder'/);
  assert.match(appSource, /Pixory 资源包暂时需要在应用内导入/);
});

test('swipe grid selection supports media tiles while batch image management can stay image-only', () => {
  const hookSource = readProjectFile('src/hooks/useSwipeGridSelection.ts');
  const batchSource = readProjectFile('src/screens/BatchManageImagesScreen.tsx');
  const allImagesSource = readProjectFile('src/screens/AllImagesScreen.tsx');
  const favoritesSource = readProjectFile('src/screens/FavoritesScreen.tsx');
  const recentSource = readProjectFile('src/screens/RecentViewedScreen.tsx');
  const groupSource = readProjectFile('src/screens/GroupImagesScreen.tsx');
  const tagSource = readProjectFile('src/screens/TagResultScreen.tsx');

  assert.match(hookSource, /selectableMediaTypes/);
  assert.match(hookSource, /AUTO_SCROLL_EDGE_SIZE/);
  assert.match(hookSource, /scrollTo/);
  assert.match(hookSource, /onMoveShouldSetPanResponder/);
  for (const source of [allImagesSource, favoritesSource, recentSource, groupSource, tagSource]) {
    assert.match(source, /selectableMediaTypes:\s*\['image', 'video'\]/);
    assert.match(source, /selectedAssets/);
    assert.match(source, /if \(multiSelect\.isSelectionMode\) \{[\s\S]{0,120}multiSelect\.toggleSelection\(imageId\);[\s\S]{0,120}return;[\s\S]{0,160}if \(asset\?\.mediaType === 'video'\)/);
    const longPressBlock = source.slice(
      source.indexOf('function handleImageLongPress'),
      source.indexOf('const footer = multiSelect.isSelectionMode', source.indexOf('function handleImageLongPress'))
    );
    assert.doesNotMatch(longPressBlock, /mediaType === 'video'/);
    assert.match(longPressBlock, /beginSwipeSelection/);
  }
  assert.match(batchSource, /useSwipeGridSelection/);
  assert.match(batchSource, /selectableMediaTypes:\s*\['image'\]/);
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

test('global toast feedback uses semantic tone, icon, and tokenized sizing', () => {
  const toastSource = readProjectFile('src/components/AppToast.tsx');
  const feedbackBannerSource = readProjectFile('src/components/FeedbackBanner.tsx');
  const metricsSource = readProjectFile('src/design/tokens/metrics.ts');

  assert.match(toastSource, /inferToastTone/);
  assert.match(toastSource, /successToast/);
  assert.match(toastSource, /warningToast/);
  assert.match(toastSource, /errorToast/);
  assert.match(toastSource, /Ionicons/);
  assert.match(toastSource, /metrics\.iconSizeSm/);
  assert.match(feedbackBannerSource, /titleForTone/);
  assert.match(feedbackBannerSource, /metrics\.iconSizeMd/);
  assert.match(feedbackBannerSource, /colors\.semantic\.successBackground/);
  assert.match(feedbackBannerSource, /colors\.semantic\.dangerBackground/);
  assert.match(metricsSource, /iconSizeSm:\s*18/);
  assert.match(metricsSource, /iconSizeMd:\s*20/);
});

test('trash cleanup keeps a 30 day DB driven policy with persisted failure records', () => {
  const schemaSource = readProjectFile('src/database/schema.ts');
  const trashSource = readProjectFile('src/services/trashService.ts');
  const appSource = readProjectFile('App.tsx');
  const trashScreenSource = readProjectFile('src/screens/TrashScreen.tsx');

  assert.match(schemaSource, /DATABASE_VERSION\s*=\s*24/);
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
