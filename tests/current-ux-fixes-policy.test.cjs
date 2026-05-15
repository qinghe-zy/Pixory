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

test('video player keeps portrait progress time on the play row below the scrub bar and does not reset saved progress to zero while loading', () => {
  const playerSource = readProjectFile('src/screens/VideoPlayerScreen.tsx');

  assert.match(playerSource, /progressInfoText/);
  assert.doesNotMatch(playerSource, /progressInfoRow/);
  assert.match(playerSource, /style=\{\[styles\.progressHitArea,\s*isLandscape \? styles\.landscapeProgressHitArea : null\]\}[\s\S]{0,760}<View style=\{\[styles\.controlLeft,\s*!isLandscape \? styles\.portraitControlLeft : null\]\}>/);
  const controlLeftBlock = /<View style=\{\[styles\.controlLeft,\s*!isLandscape \? styles\.portraitControlLeft : null\]\}>([\s\S]*?)<\/View>\s*<View style=\{styles\.controlActions\}>/.exec(playerSource)?.[1] ?? '';
  assert.ok(controlLeftBlock.indexOf("accessibilityLabel={isPlaying ? '暂停' : '播放'}") >= 0);
  assert.ok(controlLeftBlock.indexOf("accessibilityLabel={isPlaying ? '暂停' : '播放'}") < controlLeftBlock.indexOf('styles.progressInfoText'));
  assert.match(playerSource, /const initialDisplayTime/);
  assert.doesNotMatch(playerSource, /currentTimeRef\.current = 0;\s*\n\s*setCurrentTime\(0\);\s*\n\s*setDuration\(0\);/);
  assert.match(playerSource, /committedSeekTargetRef\.current = initialDisplayTime > 0 \? initialDisplayTime : null/);
});

test('video player landscape controls group previous next with play pause and move time below progress', () => {
  const playerSource = readProjectFile('src/screens/VideoPlayerScreen.tsx');

  assert.match(playerSource, /<View style=\{\[styles\.controlLeft,[\s\S]{0,120}!isLandscape \? styles\.portraitControlLeft : null\]\}>[\s\S]{0,520}accessibilityLabel="上一个视频"[\s\S]{0,520}accessibilityLabel=\{isPlaying \? '暂停' : '播放'\}[\s\S]{0,520}accessibilityLabel="下一个视频"[\s\S]{0,360}styles\.landscapeTimeText/);
  assert.match(playerSource, /<View style=\{styles\.controlActions\}>[\s\S]{0,900}setSpeedMenuVisible/);
  assert.match(playerSource, /controlRow:\s*\{[\s\S]{0,180}justifyContent:\s*'space-between'/);
  assert.match(playerSource, /controlLeft:\s*\{[\s\S]{0,180}flexDirection:\s*'row'/);
  assert.match(playerSource, /controlActions:\s*\{[\s\S]{0,220}justifyContent:\s*'flex-end'/);
  assert.match(playerSource, /landscapeBottomBar:\s*\{[\s\S]{0,120}paddingTop:\s*spacing\[1\]/);
  assert.match(playerSource, /landscapeTopBar:\s*\{[\s\S]{0,120}backgroundColor:\s*'transparent'/);
});

test('video player queue panel prevents automatic immersive hiding while open', () => {
  const playerSource = readProjectFile('src/screens/VideoPlayerScreen.tsx');

  assert.match(playerSource, /queueVisibleRef/);
  assert.match(playerSource, /queueVisibleRef\.current = queueVisible/);
  assert.match(playerSource, /if \(queueVisible\) \{\s*setControlsVisible\(true\);\s*clearHideTimer\(\);/);
  assert.match(playerSource, /function resetHideTimer\(\)[\s\S]{0,180}if \(queueVisibleRef\.current\) \{\s*return;\s*\}/);
  assert.match(playerSource, /hideTimerRef\.current = setTimeout\(\(\) => \{\s*if \(queueVisibleRef\.current\) \{/);
});

test('video player portrait center vertical zone switches videos without stealing side gestures', () => {
  const playerSource = readProjectFile('src/screens/VideoPlayerScreen.tsx');

  assert.match(playerSource, /CENTER_VIDEO_SWITCH_LEFT_RATIO\s*=\s*0\.28/);
  assert.match(playerSource, /CENTER_VIDEO_SWITCH_RIGHT_RATIO\s*=\s*0\.72/);
  assert.match(playerSource, /CENTER_VIDEO_SWITCH_MIN_DISTANCE_PX\s*=\s*72/);
  assert.match(playerSource, /surfaceGestureModeRef = useRef<'pending' \| 'scrub' \| 'vertical' \| 'video-switch' \| 'hold' \| null>/);
  assert.match(playerSource, /function shouldSwitchVideoFromCenterVerticalGesture/);
  assert.match(playerSource, /if \(isLandscape \|\| externalSource \|\| queue\.length <= 1\) \{/);
  assert.match(playerSource, /locationX >= centerLeft && locationX <= centerRight && absDy > absDx \* CENTER_VIDEO_SWITCH_DOMINANCE_RATIO/);
  assert.match(playerSource, /surfaceGestureModeRef\.current = 'video-switch'/);
  assert.match(playerSource, /function finishCenterVideoSwitchGesture\(deltaY: number\)/);
  assert.match(playerSource, /function switchVideoWithTransition\(nextVideo: ImageListItem, direction: 1 \| -1\)/);
  assert.match(playerSource, /videoSwitchTranslateY/);
  assert.match(playerSource, /Animated\.timing\(videoSwitchTranslateY/);
  assert.match(playerSource, /switchVideo\(nextVideo\.id, nextVideo, \{ showControls: false \}\)/);
  assert.doesNotMatch(playerSource, /上滑切换下一个|下滑切换上一个/);
  assert.match(playerSource, /void beginVerticalGesture\(event\)/);
});

test('video player syncs landscape UI with actual screen orientation changes', () => {
  const playerSource = readProjectFile('src/screens/VideoPlayerScreen.tsx');

  assert.match(playerSource, /getLandscapeStateFromOrientation/);
  assert.match(playerSource, /ScreenOrientation\.addOrientationChangeListener/);
  assert.match(playerSource, /syncLandscapeState\(event\.orientationInfo\.orientation\)/);
  assert.match(playerSource, /ScreenOrientation\.removeOrientationChangeListener\(orientationSubscription\)/);
});

test('video detail supports horizontal swipe navigation within the IP video queue', () => {
  const detailSource = readProjectFile('src/screens/VideoDetailScreen.tsx');

  assert.match(detailSource, /DETAIL_SWIPE_MIN_DISTANCE_PX\s*=\s*64/);
  assert.match(detailSource, /const \[activeVideoId, setActiveVideoId\] = useState\(videoId\)/);
  assert.match(detailSource, /assetRepository\.findQueueVideosByIpId\(db,\s*detail\.ipId\)/);
  assert.match(detailSource, /const detailPanResponder = useMemo/);
  assert.match(detailSource, /onMoveShouldSetPanResponder:[\s\S]{0,420}absDx > DETAIL_SWIPE_MIN_DISTANCE_PX && absDx > absDy \* DETAIL_SWIPE_DOMINANCE_RATIO/);
  assert.match(detailSource, /gestureState\.dx <= -DETAIL_SWIPE_MIN_DISTANCE_PX[\s\S]{0,160}navigateVideoBySwipe\(nextVideo/);
  assert.match(detailSource, /gestureState\.dx >= DETAIL_SWIPE_MIN_DISTANCE_PX[\s\S]{0,160}navigateVideoBySwipe\(previousVideo/);
  assert.match(detailSource, /<View \{\.\.\.detailPanResponder\.panHandlers\} style=\{styles\.content\}>/);
});

test('sort control opens a selectable menu instead of cycling on every tap', () => {
  const sortSource = readProjectFile('src/components/SortMenuButton.tsx');

  assert.doesNotMatch(sortSource, /getNextImageSortOrder/);
  assert.doesNotMatch(sortSource, /onPress=\{\(\) => onChange/);
  assert.match(sortSource, /sortMenuVisible/);
  assert.match(sortSource, /IMAGE_SORT_OPTIONS\.map/);
  assert.match(sortSource, /checkmark-circle/);
});

test('group action menus expose direct rename without forcing full edit flow', () => {
  const renameDialogSource = readProjectFile('src/components/GroupRenameDialog.tsx');
  const ipDetailSource = readProjectFile('src/screens/IpDetailScreen.tsx');
  const groupOverviewSource = readProjectFile('src/screens/GroupOverviewScreen.tsx');
  const globalGroupsSource = readProjectFile('src/screens/GlobalGroupsScreen.tsx');

  assert.match(renameDialogSource, /title="重命名分组"/);
  assert.match(renameDialogSource, /GROUP_NAME_MAX_LENGTH/);
  assert.match(renameDialogSource, /groupRepository\.update\(db,\s*group\.id,\s*\{\s*name:\s*trimmedName\s*\}\)/);
  assert.doesNotMatch(renameDialogSource, /type:\s*trimmedName/);
  for (const source of [ipDetailSource, groupOverviewSource, globalGroupsSource]) {
    assert.match(source, /GroupRenameDialog/);
    assert.match(source, /const \[renameGroup, setRenameGroup\]/);
    assert.match(source, /key: 'rename', label: '重命名'/);
  }
});

test('global card spacing rhythm is centralized and used by core surfaces', () => {
  const rhythmSource = readProjectFile('src/design/tokens/rhythm.ts');
  const tokenIndexSource = readProjectFile('src/design/tokens/index.ts');
  const appScreenSource = readProjectFile('src/components/AppScreen.tsx');
  const contentCardSource = readProjectFile('src/components/ContentCard.tsx');
  const meSource = readProjectFile('src/screens/MeScreen.tsx');
  const groupOverviewSource = readProjectFile('src/screens/GroupOverviewScreen.tsx');
  const globalGroupsSource = readProjectFile('src/screens/GlobalGroupsScreen.tsx');
  const ipDetailSource = readProjectFile('src/screens/IpDetailScreen.tsx');
  const allImagesSource = readProjectFile('src/screens/AllImagesScreen.tsx');
  const tagsOverviewSource = readProjectFile('src/screens/TagsOverviewScreen.tsx');
  const storageUsageSource = readProjectFile('src/screens/StorageUsageScreen.tsx');
  const importImagesSource = readProjectFile('src/screens/ImportImagesScreen.tsx');
  const quickOrganizeSource = readProjectFile('src/screens/QuickOrganizeScreen.tsx');
  const duplicateReviewSource = readProjectFile('src/screens/DuplicateReviewScreen.tsx');
  const videoDetailSource = readProjectFile('src/screens/VideoDetailScreen.tsx');
  const originalStorageSource = readProjectFile('src/screens/OriginalStorageScreen.tsx');
  const moveImageGroupSource = readProjectFile('src/screens/MoveImageGroupScreen.tsx');
  const docsSource = readProjectFile('.impeccable.md');
  const agentsSource = readProjectFile('AGENTS.md');

  for (const [name, spacingIndex] of [
    ['screenSectionGap', 7],
    ['heroToListGap', 7],
    ['entryCardGap', 4],
    ['listCardGap', 3],
    ['compactGridGap', 2],
    ['cardContentGap', 2],
    ['fieldContentGap', 2],
    ['inlineGap', 2],
    ['microGap', 1],
  ]) {
    assert.match(rhythmSource, new RegExp(`${name}:\\s*spacing\\[${spacingIndex}\\]`));
  }

  assert.match(tokenIndexSource, /export \{ rhythm \} from '\.\/rhythm'/);
  assert.match(appScreenSource, /gap:\s*rhythm\.screenSectionGap/);
  assert.match(contentCardSource, /gap:\s*rhythm\.cardContentGap/);
  assert.match(meSource, /marginBottom:\s*rhythm\.heroToListGap/);
  assert.match(meSource, /entryList:\s*\{[\s\S]{0,80}gap:\s*rhythm\.entryCardGap/);
  assert.match(groupOverviewSource, /list:\s*\{[\s\S]{0,80}gap:\s*rhythm\.entryCardGap/);
  assert.match(groupOverviewSource, /sectionBlock:\s*\{[\s\S]{0,80}gap:\s*rhythm\.listCardGap/);
  assert.match(globalGroupsSource, /list:\s*\{[\s\S]{0,80}gap:\s*rhythm\.entryCardGap/);
  assert.match(globalGroupsSource, /sectionBlock:\s*\{[\s\S]{0,80}gap:\s*rhythm\.listCardGap/);
  assert.match(ipDetailSource, /groupEntryList:\s*\{[\s\S]{0,80}gap:\s*rhythm\.listCardGap/);
  assert.match(ipDetailSource, /recentGrid:\s*\{[\s\S]{0,120}gap:\s*rhythm\.compactGridGap/);
  assert.match(allImagesSource, /detailList:\s*\{[\s\S]{0,80}gap:\s*rhythm\.listCardGap/);
  assert.match(allImagesSource, /rowGap:\s*rhythm\.compactGridGap/);
  assert.match(tagsOverviewSource, /popularGrid:\s*\{[\s\S]{0,180}rowGap:\s*rhythm\.compactGridGap/);
  assert.match(tagsOverviewSource, /allTags:\s*\{[\s\S]{0,180}rowGap:\s*rhythm\.compactGridGap/);
  assert.match(storageUsageSource, /pageBody:\s*\{[\s\S]{0,80}gap:\s*rhythm\.screenSectionGap/);
  assert.match(importImagesSource, /formWrap:\s*\{[\s\S]{0,80}gap:\s*rhythm\.listCardGap/);
  assert.match(importImagesSource, /previewRow:\s*\{[\s\S]{0,120}gap:\s*rhythm\.compactGridGap/);
  assert.match(quickOrganizeSource, /groupGrid:\s*\{[\s\S]{0,120}gap:\s*rhythm\.compactGridGap/);
  assert.match(duplicateReviewSource, /contentStack:\s*\{[\s\S]{0,80}gap:\s*rhythm\.screenSectionGap/);
  assert.match(videoDetailSource, /content:\s*\{[\s\S]{0,80}gap:\s*rhythm\.screenSectionGap/);
  assert.match(originalStorageSource, /ipRow:\s*\{[\s\S]{0,180}gap:\s*rhythm\.listCardGap/);
  assert.match(moveImageGroupSource, /formWrap:\s*\{[\s\S]{0,80}gap:\s*rhythm\.listCardGap/);
  assert.doesNotMatch(
    [
      meSource,
      groupOverviewSource,
      globalGroupsSource,
      ipDetailSource,
      allImagesSource,
      tagsOverviewSource,
      storageUsageSource,
      importImagesSource,
      quickOrganizeSource,
      duplicateReviewSource,
      originalStorageSource,
      moveImageGroupSource,
    ].join('\n'),
    /margin(?:Top|Bottom):\s*-spacing\[/
  );
  assert.match(docsSource, /### Spacing Rhythm/);
  assert.match(docsSource, /### Component Token Policy/);
  assert.match(docsSource, /src\/design\/tokens\/rhythm\.ts/);
  assert.match(docsSource, /src\/design\/tokens\//);
  assert.match(docsSource, /spacing[\s\S]{0,40}rhythm/);
  assert.match(docsSource, /metrics/);
  assert.match(docsSource, /radius/);
  assert.match(docsSource, /colors/);
  assert.match(docsSource, /typography\.textStyles/);
  assert.match(agentsSource, /src\/design\/tokens\/rhythm\.ts/);
  assert.match(agentsSource, /all new UI components must use the shared design tokens/);
  assert.match(agentsSource, /spacing`, `rhythm`, `metrics`, `radius`, `colors`, and `typography`/);
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

  assert.match(source, /pickImagesForImport/);
  assert.match(source, /pickVideosForImport/);
  assert.match(source, /mergePickedImages\(current,\s*result\.pickedAssets\)/);
  assert.match(source, /mergePickedVideos\(current,\s*result\.pickedAssets\)/);
  assert.doesNotMatch(source, /MediaLibrary\.getAssetsAsync/);
  assert.doesNotMatch(source, /setPickedAssets\(result\.pickedAssets\)/);
  assert.match(source, /previewRemoveButton/);
  assert.match(source, /setPickedAssets\(\(current\) => current\.filter\(\(_, itemIndex\) => itemIndex !== index\)\)/);

  assert.doesNotMatch(source, /setPickedVideos\(result\.pickedAssets\)/);
  assert.match(source, /videoRemoveButton/);
  assert.match(source, /setPickedVideos\(\(current\) => current\.filter\(\(_, itemIndex\) => itemIndex !== index\)\)/);
});
