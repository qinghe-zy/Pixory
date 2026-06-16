const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('asset list display mode and sort order are persisted through settings', () => {
  const settingsSource = readProjectFile('src/database/repositories/settingsRepository.ts');
  const preferencesSource = readProjectFile('src/services/assetListPreferences.ts');
  const allImagesSource = readProjectFile('src/screens/AllImagesScreen.tsx');
  const detailRowSource = readProjectFile('src/components/AssetDetailRow.tsx');

  assert.match(settingsSource, /ASSET_LIST_VIEW_MODE_KEY/);
  assert.match(settingsSource, /ASSET_LIST_SORT_ORDER_KEY/);
  assert.match(settingsSource, /getAssetListViewMode/);
  assert.match(settingsSource, /setAssetListViewMode/);
  assert.match(settingsSource, /getAssetListSortOrder/);
  assert.match(settingsSource, /setAssetListSortOrder/);
  assert.match(preferencesSource, /useAssetListPreferences/);
  assert.match(allImagesSource, /viewMode === 'detail'/);
  assert.match(allImagesSource, /AssetDetailRow/);
  assert.match(detailRowSource, /formatFileSize/);
  assert.match(detailRowSource, /formatDuration/);
});

test('personal background lock uses one minute elapsed-time fallback', () => {
  const appSource = readProjectFile('App.tsx');

  assert.match(appSource, /PERSONAL_BACKGROUND_LOCK_GRACE_MS\s*=\s*60\s*\*\s*1000/);
  assert.match(appSource, /personalBackgroundedAtRef/);
  assert.match(appSource, /Date\.now\(\)\s*-\s*personalBackgroundedAtRef\.current/);
  assert.match(appSource, /elapsedMs\s*>=\s*PERSONAL_BACKGROUND_LOCK_GRACE_MS/);
  assert.match(appSource, /lockPersonalSpace\('background'\)/);
});

test('video queue panel scrolls within the panel instead of rendering a fixed slice', () => {
  const source = readProjectFile('src/screens/VideoPlayerScreen.tsx');

  assert.match(source, /queueScroll/);
  assert.match(source, /nestedScrollEnabled/);
  assert.doesNotMatch(source, /queue\.slice\(/);
});

test('duplicate detection schema and native bridge expose content and visual hashes', () => {
  const schemaSource = readProjectFile('src/database/schema.ts');
  const typesSource = readProjectFile('src/database/types.ts');
  const nativeBridgeSource = readProjectFile('src/native/pixoryMediaModule.ts');
  const androidSource = readProjectFile('plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt');

  assert.match(schemaSource, /DATABASE_VERSION\s*=\s*40/);
  assert.match(schemaSource, /ALTER TABLE image_assets ADD COLUMN contentHash TEXT/);
  assert.match(schemaSource, /ALTER TABLE image_assets ADD COLUMN visualHash TEXT/);
  assert.match(schemaSource, /idx_image_assets_content_hash/);
  assert.match(schemaSource, /idx_image_assets_visual_hash/);
  assert.match(typesSource, /contentHash: string \| null/);
  assert.match(typesSource, /visualHash: string \| null/);
  assert.match(nativeBridgeSource, /computeFileSha256/);
  assert.match(nativeBridgeSource, /computeImageDHash/);
  assert.match(androidSource, /MessageDigest\.getInstance\("SHA-256"\)/);
  assert.match(androidSource, /computeImageDHash/);
});

test('import flow supports duplicate review skip modes and source move preferences', () => {
  const imageImportSource = readProjectFile('src/services/imageImportService.ts');
  const videoImportSource = readProjectFile('src/services/videoImportService.ts');
  const importScreenSource = readProjectFile('src/screens/ImportImagesScreen.tsx');

  assert.match(imageImportSource, /DuplicateImportDecision/);
  assert.match(imageImportSource, /skipExact/);
  assert.match(imageImportSource, /skipSimilar/);
  assert.match(imageImportSource, /deleteImportedSourceAsset/);
  assert.match(videoImportSource, /videoImportNamingMode/);
  assert.match(videoImportSource, /deleteImportedSourceVideoAsset/);
  assert.match(videoImportSource, /MediaLibrary\.deleteAssetsAsync/);
  assert.match(videoImportSource, /imageImportSourceMode === 'move'/);
  assert.match(videoImportSource, /contentHash/);
  assert.match(importScreenSource, /重复素材/);
  assert.match(importScreenSource, /跳过重复和相似图片/);
  assert.doesNotMatch(importScreenSource, /contentHash|visualHash/);
  assert.match(importScreenSource, /imageImportSourceMode/);
  assert.match(importScreenSource, /videoImportNamingMode/);
});

test('move import rejects assets that cannot be mapped back to a deletable media library source', () => {
  const imageImportSource = readProjectFile('src/services/imageImportService.ts');
  const videoImportSource = readProjectFile('src/services/videoImportService.ts');

  assert.match(imageImportSource, /移动导入无法删除原文件/);
  assert.match(videoImportSource, /移动导入无法删除原视频/);
  assert.doesNotMatch(imageImportSource, /!pendingImageAsset\.sourceAssetId[\s\S]{0,220}return;/);
  assert.doesNotMatch(videoImportSource, /!pickedAsset\.assetId[\s\S]{0,220}return;/);
});

test('duplicate skip import reports skipped counts and applies exact skip to videos', () => {
  const imageImportSource = readProjectFile('src/services/imageImportService.ts');
  const videoImportSource = readProjectFile('src/services/videoImportService.ts');
  const importScreenSource = readProjectFile('src/screens/ImportImagesScreen.tsx');

  assert.match(imageImportSource, /skippedItems/);
  assert.match(imageImportSource, /status:\s*'skipped'/);
  assert.match(videoImportSource, /duplicateDecision\?:\s*DuplicateImportDecision/);
  assert.match(videoImportSource, /shouldSkipVideoDuplicateImport/);
  assert.match(videoImportSource, /findByContentHash\(db,\s*contentHash,\s*\{\s*mediaType:\s*'all'\s*\}/);
  assert.match(videoImportSource, /skippedCount/);
  assert.match(videoImportSource, /status:\s*importError\.skipped\s*\?\s*'skipped'\s*:\s*'failed'/);
  assert.match(importScreenSource, /imageSkippedCount/);
  assert.match(importScreenSource, /videoSkippedCount/);
  assert.match(importScreenSource, /跳过 \$\{skippedCount\}/);
  assert.match(importScreenSource, /duplicateDecision,\s*[\r\n\s]*imageImportSourceMode,\s*[\r\n\s]*videoImportNamingMode/);
  assert.match(importScreenSource, /没有导入新素材，已跳过/);
});

test('duplicate review screen supports exact and similar tabs with soft delete only', () => {
  const appSource = readProjectFile('App.tsx');
  const screenSource = readProjectFile('src/screens/DuplicateReviewScreen.tsx');
  const repoSource = readProjectFile('src/database/repositories/imageRepository.ts');

  assert.match(appSource, /duplicate-review/);
  assert.match(screenSource, /exact/);
  assert.match(screenSource, /similar/);
  assert.match(screenSource, /softDeleteMany/);
  assert.doesNotMatch(screenSource, /contentHash|visualHash|本地 hash|可信度/);
  assert.match(screenSource, /fontSize:\s*19/);
  assert.doesNotMatch(screenSource, /PrimaryButton label="软删除选中"/);
  assert.doesNotMatch(screenSource, /deleteLocalFile|FileSystem\.deleteAsync/);
  assert.match(repoSource, /findExactDuplicateGroups/);
  assert.match(repoSource, /findSimilarImageGroups/);
});

test('duplicate review cards keep breathing room between groups and rows', () => {
  const screenSource = readProjectFile('src/screens/DuplicateReviewScreen.tsx');

  assert.match(screenSource, /groupList:\s*\{[\s\S]*gap:\s*rhythm\.screenSectionGap/);
  assert.match(screenSource, /groupCard:\s*\{[\s\S]*padding:\s*spacing\[4\]/);
  assert.match(screenSource, /imageList:\s*\{[\s\S]*gap:\s*rhythm\.entryCardGap/);
  assert.match(screenSource, /imageRow:\s*\{[\s\S]*paddingVertical:\s*spacing\[2\]/);
  assert.match(screenSource, /deleteSelectedButton:\s*\{[\s\S]*minHeight:\s*34/);
});

test('duplicate roadmap uses hamming-distance visual groups and a manual library scan task', () => {
  const appSource = readProjectFile('App.tsx');
  const meSource = readProjectFile('src/screens/MeScreen.tsx');
  const screenSource = readProjectFile('src/screens/DuplicateReviewScreen.tsx');
  const repoSource = readProjectFile('src/database/repositories/imageRepository.ts');
  const typesSource = readProjectFile('src/database/types.ts');
  const serviceSource = readProjectFile('src/services/duplicateDetectionService.ts');

  assert.match(repoSource, /VISUAL_HASH_REVIEW_DISTANCE_THRESHOLD\s*=\s*6/);
  assert.match(repoSource, /getVisualHashDistance/);
  assert.match(repoSource, /belongsToVisualGroup[\s\S]*distance <= VISUAL_HASH_REVIEW_DISTANCE_THRESHOLD/);
  assert.match(repoSource, /findSimilarImageGroups[\s\S]*belongsToVisualGroup/);
  assert.match(repoSource, /findAssetsMissingDuplicateHashes/);
  assert.match(repoSource, /updateDuplicateHashes/);
  assert.match(typesSource, /'duplicate-scan'/);
  assert.match(serviceSource, /runDuplicateDetectionScan/);
  assert.match(serviceSource, /backgroundTaskRepository\.create/);
  assert.match(serviceSource, /computeFileSha256/);
  assert.match(serviceSource, /computeImageDHash/);
  assert.match(serviceSource, /findAssetsMissingDuplicateHashes/);
  assert.match(screenSource, /importBatchId\?: number \| null/);
  assert.match(screenSource, /runDuplicateDetectionScan/);
  assert.match(screenSource, /扫描重复素材/);
  assert.match(appSource, /onOpenDuplicateReview/);
  assert.match(meSource, /重复检测/);
});

test('backup import asks how to handle same-name IPs before merging', () => {
  const backupSource = readProjectFile('src/services/backupService.ts');
  const importScreenSource = readProjectFile('src/screens/ImportImagesScreen.tsx');

  assert.match(backupSource, /IpNameConflictStrategy/);
  assert.match(backupSource, /findByName/);
  assert.match(backupSource, /mergeExisting/);
  assert.match(backupSource, /createRenamed/);
  assert.match(importScreenSource, /同名 IP/);
  assert.match(importScreenSource, /合并到已有 IP/);
});

test('batch panel can move videos only to another existing IP and preserves group names', () => {
  const panelSource = readProjectFile('src/components/BatchImageOrganizePanel.tsx');
  const serviceSource = readProjectFile('src/services/videoMoveService.ts');

  assert.match(panelSource, /移动到 IP/);
  assert.match(panelSource, /targetIpId/);
  assert.match(serviceSource, /moveVideosToIp/);
  assert.match(serviceSource, /targetIpId !== sourceVideo\.ipId/);
  assert.match(serviceSource, /findByIpIdAndName/);
  assert.match(serviceSource, /softDeleteMany/);
});
