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

test('video player keeps progress information above the scrub bar and does not reset saved progress to zero while loading', () => {
  const playerSource = readProjectFile('src/screens/VideoPlayerScreen.tsx');

  assert.match(playerSource, /progressInfoRow/);
  assert.match(playerSource, /progressInfoText/);
  assert.match(playerSource, /const initialDisplayTime/);
  assert.doesNotMatch(playerSource, /currentTimeRef\.current = 0;\s*\n\s*setCurrentTime\(0\);\s*\n\s*setDuration\(0\);/);
  assert.match(playerSource, /committedSeekTargetRef\.current = initialDisplayTime > 0 \? initialDisplayTime : null/);
});

test('sort control opens a selectable menu instead of cycling on every tap', () => {
  const sortSource = readProjectFile('src/components/SortMenuButton.tsx');

  assert.doesNotMatch(sortSource, /getNextImageSortOrder/);
  assert.doesNotMatch(sortSource, /onPress=\{\(\) => onChange/);
  assert.match(sortSource, /sortMenuVisible/);
  assert.match(sortSource, /IMAGE_SORT_OPTIONS\.map/);
  assert.match(sortSource, /checkmark-circle/);
});
