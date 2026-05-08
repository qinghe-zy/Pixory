const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('package import restores Pixory manifests and imports mixed image video archives', () => {
  const packageSource = readProjectFile('src/services/packageImportService.ts');
  const backupSource = readProjectFile('src/services/backupService.ts');
  const importScreenSource = readProjectFile('src/screens/ImportImagesScreen.tsx');

  assert.match(backupSource, /importPlainBackupPackage/);
  assert.match(backupSource, /copyPlainBackupAssetFiles/);
  assert.match(backupSource, /mode:\s*'merge'/);
  assert.match(packageSource, /detectVideoTypeFromMagicBytes/);
  assert.match(packageSource, /importSingleVideoFromPackage/);
  assert.match(packageSource, /plainBackupImport/);
  assert.match(packageSource, /imageSuccessCount/);
  assert.match(packageSource, /videoSuccessCount/);
  assert.match(importScreenSource, /图片\s*\{packageImportResult\.imageSuccessCount\}/);
  assert.match(importScreenSource, /视频\s*\{packageImportResult\.videoSuccessCount\}/);
});

test('video player uses auto play looped playback and scrub-safe animated controls', () => {
  const source = readProjectFile('src/screens/VideoPlayerScreen.tsx');

  assert.match(source, /CONTROL_HIDE_DELAY_MS\s*=\s*5000/);
  assert.match(source, /player\.loop\s*=\s*true/);
  assert.match(source, /safePlayPlayer\(\)/);
  assert.match(source, /isScrubbing/);
  assert.match(source, /scrubDisplayTime/);
  assert.match(source, /schedulePreviewSeek/);
  assert.match(source, /SCRUB_PREVIEW_SEEK_INTERVAL_MS\s*=\s*90/);
  assert.match(source, /SURFACE_SCRUB_ACTIVATION_PX\s*=\s*3/);
  assert.match(source, /scrubDisplayTimeRef/);
  assert.match(source, /flushPreviewSeek/);
  assert.match(source, /commitScrub/);
  assert.match(source, /styles\.scrubBubble/);
  assert.match(source, /controlsOpacity/);
  assert.match(source, /Animated\.View/);
  assert.match(source, /toggleControls/);
  assert.match(source, /styles\.progressHitArea/);
  assert.match(source, /styles\.holdSpeedFloatingBadge/);
  assert.match(source, /queueCover/);
  assert.doesNotMatch(source, /const CONTROL_HIDE_DELAY_MS = 3000/);
});

test('image lists expose shared sorting and swipe selection beyond batch manage', () => {
  const typesSource = readProjectFile('src/database/types.ts');
  const repoSource = readProjectFile('src/database/repositories/imageRepository.ts');
  const allImagesSource = readProjectFile('src/screens/AllImagesScreen.tsx');
  const favoritesSource = readProjectFile('src/screens/FavoritesScreen.tsx');
  const recentSource = readProjectFile('src/screens/RecentViewedScreen.tsx');
  const groupSource = readProjectFile('src/screens/GroupImagesScreen.tsx');
  const tagSource = readProjectFile('src/screens/TagResultScreen.tsx');

  for (const order of ['createdAtAsc', 'updatedAtDesc', 'updatedAtAsc', 'filenameAsc', 'filenameDesc', 'fileSizeDesc', 'fileSizeAsc']) {
    assert.match(typesSource, new RegExp(order));
    assert.match(repoSource, new RegExp(order));
  }

  for (const source of [allImagesSource, favoritesSource, recentSource, groupSource, tagSource]) {
    assert.match(source, /SortMenuButton/);
    assert.match(source, /SORT_OPTIONS/);
    assert.match(source, /useSwipeGridSelection/);
    assert.match(source, /swipeSelection\.panHandlers/);
    assert.match(source, /<ThumbnailTile[\s\S]*onLayout=\{\(event\) => swipeSelection\.registerItemLayout\(image\.id, event\.nativeEvent\.layout\)\}/);
    assert.doesNotMatch(source, /<View key=\{image\.id\} onLayout=\{\(event\) => swipeSelection\.registerItemLayout/);
    assert.match(source, /beginSwipeSelection/);
  }
});

test('media rename, IP storage stats, personal password visibility, and profile storage are complete', () => {
  const appSource = readProjectFile('App.tsx');
  const editSource = readProjectFile('src/screens/EditImageScreen.tsx');
  const videoDetailSource = readProjectFile('src/screens/VideoDetailScreen.tsx');
  const ipCardSource = readProjectFile('src/components/IPCard.tsx');
  const typesSource = readProjectFile('src/database/types.ts');
  const ipRepoSource = readProjectFile('src/database/repositories/ipRepository.ts');
  const unlockSource = readProjectFile('src/components/PersonalUnlockModal.tsx');
  const meSource = readProjectFile('src/screens/MeScreen.tsx');

  assert.match(appSource, /name: 'edit-media'/);
  assert.match(videoDetailSource, /onEdit/);
  assert.match(editSource, /mediaLabel/);
  assert.match(editSource, /Pixory 展示文件名/);
  assert.match(typesSource, /videoCount:\s*number/);
  assert.match(typesSource, /totalBytes:\s*number/);
  assert.match(ipRepoSource, /videoCount/);
  assert.match(ipRepoSource, /totalBytes/);
  assert.match(ipCardSource, /formatFileSize\(ip\.totalBytes\)/);
  assert.match(ipCardSource, /videoCount/);
  assert.match(appSource, /top:\s*spacing\[3\]/);
  assert.match(unlockSource, /PasswordInput/);
  assert.match(unlockSource, /showPassword/);
  assert.match(meSource, /imageOriginalBytes/);
  assert.match(meSource, /videoOriginalBytes/);
  assert.match(meSource, /视频存储/);
});

test('share collect and global groups support quick target creation previews and group imports', () => {
  const shareSource = readProjectFile('src/screens/ShareCollectScreen.tsx');
  const groupsSource = readProjectFile('src/screens/GlobalGroupsScreen.tsx');
  const appSource = readProjectFile('App.tsx');
  const videoImportSource = readProjectFile('src/services/videoImportService.ts');
  const importScreenSource = readProjectFile('src/screens/ImportImagesScreen.tsx');

  assert.match(videoImportSource, /ImagePicker\.launchImageLibraryAsync/);
  assert.match(videoImportSource, /mediaTypes:\s*\['videos'\]/);
  assert.match(importScreenSource, /initialMediaPicker/);
  assert.match(shareSource, /createIpAndSave/);
  assert.match(shareSource, /horizontal/);
  assert.match(shareSource, /previewModalItem/);
  assert.doesNotMatch(shareSource, /<Text style=\{styles\.sectionTitle\}>Group<\/Text>/);
  assert.doesNotMatch(shareSource, /<Text style=\{styles\.sectionTitle\}>标签<\/Text>/);
  assert.match(groupsSource, /selectedIpId/);
  assert.match(groupsSource, /scopeMenuVisible/);
  assert.match(groupsSource, /添加图片/);
  assert.match(groupsSource, /添加视频/);
  assert.match(appSource, /initialMediaPicker: 'videos'/);
});

test('global search and image viewer expose confirmable suggestions and immersive reader controls', () => {
  const searchSource = readProjectFile('src/screens/GlobalSearchScreen.tsx');
  const viewerSource = readProjectFile('src/screens/ImageViewerScreen.tsx');

  assert.match(searchSource, /clearConfirmVisible/);
  assert.match(searchSource, /deleteConfirmItem/);
  assert.match(searchSource, /SearchSuggestionList/);
  assert.match(searchSource, /suggestions/);
  assert.match(viewerSource, /controlsVisible/);
  assert.match(viewerSource, /controlsOpacity/);
  assert.match(viewerSource, /Animated\.View/);
  assert.match(viewerSource, /viewerProgressPanResponder/);
  assert.match(viewerSource, /jumpToImageIndex/);
  assert.match(viewerSource, /toggleFavorite/);
  assert.match(viewerSource, /animateScaleTo/);
  assert.match(viewerSource, /const nextIndex = activeIndex/);
});
