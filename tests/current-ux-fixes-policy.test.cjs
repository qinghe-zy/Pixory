const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('profile storage summary avoids duplicate total original storage and uses roomier stacked rows', () => {
  const meSource = readProjectFile('src/screens/MeScreen.tsx');

  assert.doesNotMatch(meSource, /本地原图存储/);
  assert.doesNotMatch(meSource, /totalOriginalBytes/);
  assert.doesNotMatch(meSource, /sumFileSize\(db, \{ includeDeleted: true \}\)/);
  assert.match(meSource, /storageHeader:\s*\{[\s\S]{0,220}flexDirection:\s*'column'/);
  assert.match(meSource, /图片原图/);
  assert.match(meSource, /视频存储/);
});

test('profile storage rows keep the metric close to its label with matching text scale', () => {
  const meSource = readProjectFile('src/screens/MeScreen.tsx');

  assert.doesNotMatch(meSource, /storageInlineRow:\s*\{[\s\S]{0,220}justifyContent:\s*'space-between'/);
  assert.match(meSource, /storageInlineRow:\s*\{[\s\S]{0,220}justifyContent:\s*'flex-start'/);
  assert.match(meSource, /storageValue:\s*\{[\s\S]{0,120}\.\.\.typography\.textStyles\.caption/);
});

test('profile total count uses all local assets instead of images only', () => {
  const meSource = readProjectFile('src/screens/MeScreen.tsx');

  assert.match(meSource, /activeAssetCount/);
  assert.match(meSource, /imageRepository\.count\(db,\s*\{\s*mediaType:\s*'all'\s*\}\)/);
  assert.match(meSource, /StatBlock label="素材总数"/);
  assert.doesNotMatch(meSource, /StatBlock label="图片总数"/);
  assert.doesNotMatch(meSource, /activeImageCount/);
});

test('recent viewed page can clear local viewing history without deleting assets', () => {
  const recentSource = readProjectFile('src/screens/RecentViewedScreen.tsx');
  const repositorySource = readProjectFile('src/database/repositories/imageRepository.ts');

  assert.match(recentSource, /清除记录/);
  assert.match(recentSource, /summaryRow:\s*\{[\s\S]{0,180}flexWrap:\s*'wrap'[\s\S]{0,180}marginBottom:\s*spacing\[4\]/);
  assert.match(recentSource, /clearRecentViewed/);
  assert.match(repositorySource, /async clearRecentViewed/);
  assert.match(repositorySource, /SET lastViewedAt = NULL/);
  assert.doesNotMatch(repositorySource, /DELETE FROM image_assets[\s\S]{0,120}clearRecentViewed/);
});

test('personal mode badge sits below the status bar inset instead of hardcoding top spacing', () => {
  const appSource = readProjectFile('App.tsx');

  assert.match(appSource, /useSafeAreaInsets/);
  assert.match(appSource, /top:\s*insets\.top/);
});

test('video player keeps portrait progress information above the scrub bar and does not reset saved progress to zero while loading', () => {
  const playerSource = readProjectFile('src/screens/VideoPlayerScreen.tsx');

  assert.match(playerSource, /progressInfoRow/);
  assert.match(playerSource, /progressInfoText/);
  assert.match(playerSource, /\{!isLandscape \? \(\s*<View style=\{styles\.progressInfoRow\}>/);
  assert.match(playerSource, /const initialDisplayTime/);
  assert.doesNotMatch(playerSource, /currentTimeRef\.current = 0;\s*\n\s*setCurrentTime\(0\);\s*\n\s*setDuration\(0\);/);
  assert.match(playerSource, /committedSeekTargetRef\.current = initialDisplayTime > 0 \? initialDisplayTime : null/);
});

test('video player landscape controls group previous next with play pause and move time below progress', () => {
  const playerSource = readProjectFile('src/screens/VideoPlayerScreen.tsx');

  assert.match(playerSource, /<View style=\{styles\.controlLeft\}>[\s\S]{0,1200}accessibilityLabel="上一个视频"[\s\S]{0,360}accessibilityLabel="下一个视频"[\s\S]{0,360}styles\.landscapeTimeText/);
  assert.match(playerSource, /<View style=\{styles\.controlActions\}>[\s\S]{0,900}setSpeedMenuVisible/);
  assert.match(playerSource, /controlRow:\s*\{[\s\S]{0,180}justifyContent:\s*'space-between'/);
  assert.match(playerSource, /controlLeft:\s*\{[\s\S]{0,180}flexDirection:\s*'row'/);
  assert.match(playerSource, /controlActions:\s*\{[\s\S]{0,220}justifyContent:\s*'flex-end'/);
  assert.match(playerSource, /landscapeBottomBar:\s*\{[\s\S]{0,120}paddingTop:\s*spacing\[1\]/);
  assert.match(playerSource, /landscapeTopBar:\s*\{[\s\S]{0,120}backgroundColor:\s*'transparent'/);
});

test('video player syncs landscape UI with actual screen orientation changes', () => {
  const playerSource = readProjectFile('src/screens/VideoPlayerScreen.tsx');

  assert.match(playerSource, /getLandscapeStateFromOrientation/);
  assert.match(playerSource, /ScreenOrientation\.getOrientationAsync\(\)\.then\(syncLandscapeState\)/);
  assert.match(playerSource, /ScreenOrientation\.addOrientationChangeListener/);
  assert.match(playerSource, /syncLandscapeState\(event\.orientationInfo\.orientation\)/);
  assert.match(playerSource, /ScreenOrientation\.removeOrientationChangeListener\(orientationSubscription\)/);
});

test('sort control opens a selectable menu instead of cycling on every tap', () => {
  const sortSource = readProjectFile('src/components/SortMenuButton.tsx');

  assert.doesNotMatch(sortSource, /getNextImageSortOrder/);
  assert.doesNotMatch(sortSource, /onPress=\{\(\) => onChange/);
  assert.match(sortSource, /sortMenuVisible/);
  assert.match(sortSource, /IMAGE_SORT_OPTIONS\.map/);
  assert.match(sortSource, /checkmark-circle/);
});

test('IP cards omit empty cover metadata instead of rendering zero counts', () => {
  const cardSource = readProjectFile('src/components/IPCard.tsx');

  assert.doesNotMatch(cardSource, /const mediaParts = \[`\$\{ip\.imageCount\} 张图片`\]/);
  assert.match(cardSource, /if \(ip\.imageCount > 0\)[\s\S]{0,120}mediaParts\.push\(`\$\{ip\.imageCount\} 张图片`\)/);
  assert.match(cardSource, /if \(ip\.videoCount > 0\)[\s\S]{0,120}mediaParts\.push\(`\$\{ip\.videoCount\} 个视频`\)/);
  assert.match(cardSource, /if \(ip\.totalBytes > 0\)[\s\S]{0,120}mediaParts\.push\(formatFileSize\(ip\.totalBytes\)\)/);
});

test('global search suggestions stay compact and avoid noisy filename prefix bubbles', () => {
  const searchSource = readProjectFile('src/screens/GlobalSearchScreen.tsx');

  assert.match(searchSource, /keyword,\s*\n\s*history: searchHistory/);
  assert.match(searchSource, /history\.filter\(\(item\) => item\.toLowerCase\(\)\.includes\(lowerKeyword\)\)\.slice\(0,\s*2\)/);
  assert.doesNotMatch(searchSource, /文件名前缀/);
  assert.doesNotMatch(searchSource, /images\.slice\(0,\s*8\)/);
  assert.match(searchSource, /return \[\.\.\.suggestions\.values\(\)\]\.slice\(0,\s*6\)/);
  assert.match(searchSource, /suggestionPill:\s*\{[\s\S]{0,260}minHeight:\s*32/);
  assert.match(searchSource, /suggestionMeta:\s*\{[\s\S]{0,160}fontWeight:\s*'700'/);
});

test('import picker keeps existing selections and supports removing down to zero items', () => {
  const source = readProjectFile('src/screens/ImportImagesScreen.tsx');

  assert.match(source, /MediaLibrary\.getAssetsAsync/);
  assert.match(source, /setMediaPickerSelectedIds\(kind === 'images' \? getPickedImageAssetIds\(\) : getPickedVideoAssetIds\(\)\)/);
  assert.match(source, /mediaPickerSelectedIds\.includes\(asset\.id\)/);
  assert.match(source, /setMediaPickerSelectedIds\(\[\]\)/);
  assert.match(source, /confirmMediaLibraryPicker/);
  assert.doesNotMatch(source, /setPickedAssets\(result\.pickedAssets\)/);
  assert.match(source, /previewRemoveButton/);
  assert.match(source, /setPickedAssets\(\(current\) => current\.filter\(\(_, itemIndex\) => itemIndex !== index\)\)/);

  assert.doesNotMatch(source, /setPickedVideos\(result\.pickedAssets\)/);
  assert.match(source, /videoRemoveButton/);
  assert.match(source, /setPickedVideos\(\(current\) => current\.filter\(\(_, itemIndex\) => itemIndex !== index\)\)/);
});
