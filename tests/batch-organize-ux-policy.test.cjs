const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function readFunctionSlice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing marker: ${endMarker}`);
  return source.slice(start, end);
}

test('batch review keeps the full safe pile set and filters weak filename prefixes', () => {
  const source = readProjectFile('src/screens/ImportBatchReviewScreen.tsx');

  for (const key of [
    "'ungrouped'",
    "'untagged'",
    "'no-note'",
    "'landscape'",
    "'portrait'",
    "'square'",
    "'panorama'",
    "'large'",
    "'small'",
    "'large-file'",
    "'same-size'",
    "'filename-prefix'",
    "'suspected-duplicate'",
  ]) {
    assert.match(source, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(source, /WEAK_FILENAME_PREFIXES/);
  assert.match(source, /IMG/i);
  assert.match(source, /Screenshot/i);
  assert.match(source, /\/\^\\d\+\$\/\.test/);
});

test('quick organize still surfaces missing organization fields and supports import batch scope', () => {
  const imageRepositorySource = readProjectFile('src/database/repositories/imageRepository.ts');
  const importBatchReviewSource = readProjectFile('src/screens/ImportBatchReviewScreen.tsx');
  const quickOrganizeSource = readProjectFile('src/screens/QuickOrganizeScreen.tsx');
  const needsOrganizingSource = readFunctionSlice(
    imageRepositorySource,
    'async findNeedsOrganizing(db: SQLiteDatabase, scope?: NeedsOrganizingScope | number)',
    'async findSuspectedDuplicateGroupsByImportBatchId'
  );

  assert.match(imageRepositorySource, /findNeedsOrganizing\(db:\s*SQLiteDatabase,\s*scope\?:\s*NeedsOrganizingScope/);
  assert.match(needsOrganizingSource, /NOT EXISTS \(SELECT 1 FROM image_groups/);
  assert.doesNotMatch(needsOrganizingSource, /OR NOT EXISTS \(SELECT 1 FROM image_tags/);
  assert.doesNotMatch(needsOrganizingSource, /OR image_assets\.note IS NULL/);
  assert.match(importBatchReviewSource, /image\.groupCount > 0\)\.length/);
  assert.match(quickOrganizeSource, /importBatchId\?: number \| null/);
  assert.match(quickOrganizeSource, /findNeedsOrganizing\(db,\s*\{\s*ipId,\s*importBatchId/);
});

test('batch manage same-prefix selection ignores weak filename prefixes', () => {
  const source = readProjectFile('src/screens/BatchManageImagesScreen.tsx');

  assert.match(source, /WEAK_FILENAME_PREFIXES/);
  assert.match(source, /screenshot/i);
  assert.match(source, /\/\^\\d\+\$\/\.test/);
  assert.doesNotMatch(source, /baseName\.slice\(0,\s*6\)/);
});

test('batch operations capture undo snapshots for composite metadata changes', () => {
  const undoSource = readProjectFile('src/services/batchUndoService.ts');
  const batchSource = readProjectFile('src/screens/BatchManageImagesScreen.tsx');

  for (const field of ['groupIds', 'tagNames', 'isFavorite', 'note', 'deletedAt']) {
    assert.match(undoSource, new RegExp(field));
  }

  assert.match(undoSource, /restoreBatchUndoSnapshot/);
  assert.match(batchSource, /captureBatchUndoSnapshot/);
  assert.match(batchSource, /restoreBatchUndoSnapshot/);
  assert.match(batchSource, /套用模板/);
});

test('batch manage opens images on tap and enters selection from long press', () => {
  const appSource = readProjectFile('App.tsx');
  const batchSource = readProjectFile('src/screens/BatchManageImagesScreen.tsx');

  assert.match(appSource, /onOpenImage=\{openImageViewer\}/);
  assert.match(batchSource, /onOpenImage:\s*\(imageId: number, context: ImageViewerContext\) => void/);
  assert.match(batchSource, /function handleOpenImage\(imageId: number\)/);
  assert.match(batchSource, /selectedCount > 0/);
  assert.match(batchSource, /enterImageSelection\(image\.id\)/);
  assert.match(batchSource, /beginSwipeSelection\(image\.id\)/);
});

test('batch rule selection supports multi-rule intersection with selected chips', () => {
  const rulesSource = readProjectFile('src/utils/batchSelectionRules.ts');
  const batchSource = readProjectFile('src/screens/BatchManageImagesScreen.tsx');
  const panelSource = readProjectFile('src/components/BatchImageOrganizePanel.tsx');
  const allImagesSource = readProjectFile('src/screens/AllImagesScreen.tsx');
  const favoritesSource = readProjectFile('src/screens/FavoritesScreen.tsx');

  assert.match(rulesSource, /applySelectionRules/);
  assert.match(rulesSource, /intersection/i);
  assert.match(batchSource, /activeRuleKeys/);
  assert.match(batchSource, /selected=\{activeRuleKeys\.includes/);
  assert.match(batchSource, /规则模式/);
  assert.match(batchSource, /label=\{option\.label\}/);
  assert.doesNotMatch(batchSource, /option\.key === 'filename-prefix'/);
  assert.doesNotMatch(batchSource, /更多选择/);
  assert.doesNotMatch(panelSource, /智能分堆/);
  assert.doesNotMatch(panelSource, /activeRuleKeys/);
  assert.doesNotMatch(panelSource, /ruleFilterPanel/);
  assert.doesNotMatch(panelSource, /hideSmartSelectionRules/);
  assert.doesNotMatch(panelSource, /AppActionSheet/);
  assert.match(allImagesSource, /activeFilters/);
  assert.match(allImagesSource, /activeFilterDropdown/);
  assert.match(allImagesSource, /FilterMenuButton/);
  assert.match(allImagesSource, /FilterDrawer/);
  assert.match(allImagesSource, /label="相似图片"/);
  assert.match(allImagesSource, /filterSimilarImages/);
  assert.doesNotMatch(allImagesSource, /相似 · 多选/);
  assert.doesNotMatch(allImagesSource, /label="同尺寸"/);
  assert.doesNotMatch(allImagesSource, /label="文件名前缀"/);
  assert.match(allImagesSource, /maxHeight: 250/);
  assert.match(allImagesSource, /多选/);
  assert.match(allImagesSource, /单选/);
  assert.doesNotMatch(allImagesSource, /互斥/);
  assert.match(allImagesSource, /groupIds: activeFilters\.groupIds/);
  assert.match(allImagesSource, /tagIds: activeFilters\.tagIds/);
  assert.match(allImagesSource, /filter\(\(item\) => item !== groupId\)/);
  assert.match(favoritesSource, /activeFilters/);
  assert.match(favoritesSource, /activeFilterDropdown/);
  assert.match(favoritesSource, /FilterMenuButton/);
  assert.match(favoritesSource, /FilterDrawer/);
  assert.match(favoritesSource, /justifyContent: 'center'/);
  assert.match(favoritesSource, /多选/);
  assert.match(favoritesSource, /单选/);
  assert.match(favoritesSource, /maxHeight: 250/);
  assert.doesNotMatch(favoritesSource, /互斥/);
  assert.match(favoritesSource, /minFileSize: activeFilters\.size\?\.minFileSize/);
  assert.match(favoritesSource, /ipIds: activeFilters\.ipIds/);
});

test('quick organize uses a stable cursor and does not auto-advance after metadata edits', () => {
  const source = readProjectFile('src/screens/QuickOrganizeScreen.tsx');

  assert.match(source, /currentIndex/);
  assert.match(source, /setCurrentIndex/);
  assert.doesNotMatch(source, /const current = images\[0\]/);
  assert.match(source, /function handleNextImage/);
  assert.match(source, /function handlePreviousImage/);
  assert.match(source, /horizontal/);
  assert.match(source, /selectedQueueTile/);
  assert.match(source, /onOpenImage/);
  assert.match(source, /handleAutoSaveTags/);
  assert.match(source, /tagRepository\.setImageTags\(db,\s*current\.id,\s*tags\)/);
  assert.match(source, /areSameTagNames/);
  assert.match(source, /bulkTagTargetCount/);
  assert.match(source, /numberOfLines=\{2\}/);
  assert.doesNotMatch(source, /确认添加标签/);
  assert.doesNotMatch(source, /同标签给当前起20张/);
  assert.doesNotMatch(source, /已自动保存标签/);
  assert.doesNotMatch(source, /handleSetGroup[\s\S]{0,500}advanceCurrent\(\)/);
  assert.doesNotMatch(source, /handleAddTags[\s\S]{0,500}advanceCurrent\(\)/);
  assert.doesNotMatch(source, /refreshToken:\s*number/);
  assert.match(source, /\[importBatchId,\s*ipId(?:,\s*space)?\]/);
  assert.doesNotMatch(source, /currentCommittedTagNames/);
  assert.doesNotMatch(source, /<TagChip/);
  assert.doesNotMatch(source, /removable=\{false\}/);
});

test('import batch pile management scopes batch screen to the selected pile', () => {
  const appSource = readProjectFile('App.tsx');
  const reviewSource = readProjectFile('src/screens/ImportBatchReviewScreen.tsx');
  const batchSource = readProjectFile('src/screens/BatchManageImagesScreen.tsx');
  const viewerContextSource = readProjectFile('src/navigation/imageViewerContext.ts');
  const viewerSource = readProjectFile('src/screens/ImageViewerScreen.tsx');
  const detailSource = readProjectFile('src/screens/ImageDetailScreen.tsx');

  assert.match(appSource, /scopeImageIds\?: number\[\]/);
  assert.match(appSource, /scopeImageIds: imageIds/);
  assert.match(batchSource, /scopeImageIds/);
  assert.match(batchSource, /imageRepository\.findByIds\(db,\s*scopeImageIds/);
  assert.match(batchSource, /type: 'image-scope'/);
  assert.match(batchSource, /当前堆/);
  assert.match(reviewSource, /管理这堆/);
  assert.match(viewerContextSource, /type: 'image-scope'/);
  assert.match(viewerSource, /context\.type === 'image-scope'/);
  assert.match(detailSource, /context\.type === 'image-scope'/);
});

test('organization progress treats grouped images as organized while preserving untagged reminders', () => {
  const imageRepositorySource = readProjectFile('src/database/repositories/imageRepository.ts');
  const importBatchRepositorySource = readProjectFile('src/database/repositories/importBatchRepository.ts');
  const batchReviewSource = readProjectFile('src/screens/ImportBatchReviewScreen.tsx');

  assert.match(imageRepositorySource, /EXISTS \(SELECT 1 FROM image_groups[\s\S]{0,180}AS organizedCount/);
  assert.doesNotMatch(imageRepositorySource, /EXISTS \(SELECT 1 FROM image_groups[\s\S]{0,180}image_tags[\s\S]{0,80}AS organizedCount/);
  assert.doesNotMatch(imageRepositorySource, /image_assets\.note IS NOT NULL[\s\S]{0,80}AS organizedCount/);
  assert.match(importBatchRepositorySource, /EXISTS \(SELECT 1 FROM image_groups[\s\S]{0,180}AS organizedCount/);
  assert.doesNotMatch(importBatchRepositorySource, /EXISTS \(SELECT 1 FROM image_groups[\s\S]{0,180}image_tags[\s\S]{0,80}AS organizedCount/);
  assert.match(batchReviewSource, /image\.groupCount > 0\)\.length/);
});

test('image detail exposes a stable recognizable asset code', () => {
  const detailSource = readProjectFile('src/screens/ImageDetailScreen.tsx');
  const codeSource = readProjectFile('src/utils/imageAssetCode.ts');
  const imageRepositorySource = readProjectFile('src/database/repositories/imageRepository.ts');
  const backupSource = readProjectFile('src/services/backupService.ts');

  assert.match(codeSource, /formatImageAssetCode/);
  assert.match(codeSource, /PX-/);
  assert.match(detailSource, /素材编号/);
  assert.match(detailSource, /formatImageAssetCode\(image\)/);
  assert.match(imageRepositorySource, /buildImageAssetSearchCodeExpression/);
  assert.match(imageRepositorySource, /searchText\.toUpperCase\(\)/);
  assert.match(backupSource, /assetCode/);
  assert.match(backupSource, /formatImageAssetCode\(image\)/);
});

test('tag and group result pages expose dedicated secondary filters', () => {
  const tagResultSource = readProjectFile('src/screens/TagResultScreen.tsx');
  const groupSource = readProjectFile('src/screens/GroupImagesScreen.tsx');

  assert.match(tagResultSource, /activeFilters/);
  assert.match(tagResultSource, /activeFilterDropdown/);
  assert.match(tagResultSource, /findByTagId\(db,\s*tagId,\s*\{/);
  assert.match(tagResultSource, /ipIds: activeFilters\.ipIds/);
  assert.match(tagResultSource, /groupIds: activeFilters\.groupIds/);
  assert.match(tagResultSource, /favoritesOnly: activeFilters\.favorite/);
  assert.match(tagResultSource, /ungroupedOnly: activeFilters\.ungrouped/);
  assert.match(tagResultSource, /recentlyViewedOnly: activeFilters\.recentViewed/);
  assert.match(tagResultSource, /FilterMenuButton/);
  assert.match(tagResultSource, /IP 筛选/);
  assert.match(tagResultSource, /分组筛选/);
  assert.match(tagResultSource, /尺寸筛选/);
  assert.match(tagResultSource, /收藏/);
  assert.match(tagResultSource, /未分组/);
  assert.match(tagResultSource, /最近查看/);
  assert.match(tagResultSource, /同尺寸/);
  assert.match(tagResultSource, /文件名前缀/);
  assert.match(tagResultSource, /疑似重复/);

  assert.match(groupSource, /activeFilters/);
  assert.match(groupSource, /activeFilterDropdown/);
  assert.match(groupSource, /findByGroupId\(db,\s*groupId,\s*\{/);
  assert.match(groupSource, /tagIds: activeFilters\.tagIds/);
  assert.match(groupSource, /favoritesOnly: activeFilters\.favorite/);
  assert.match(groupSource, /untaggedOnly: activeFilters\.untagged/);
  assert.match(groupSource, /recentlyViewedOnly: activeFilters\.recentViewed/);
  assert.match(groupSource, /tagRepository\.findUsageOverviewByIpId\(db,\s*ipId\)/);
  assert.match(groupSource, /标签筛选/);
  assert.match(groupSource, /尺寸筛选/);
  assert.match(groupSource, /收藏/);
  assert.match(groupSource, /无标签/);
  assert.match(groupSource, /最近查看/);
  assert.match(groupSource, /label="相似图片"/);
  assert.match(groupSource, /filterSimilarImages/);
  assert.doesNotMatch(groupSource, /相似 · 多选/);
  assert.doesNotMatch(groupSource, /label="同尺寸"/);
  assert.doesNotMatch(groupSource, /label="文件名前缀"/);
});

test('tag multi select keeps long existing tag lists compact with an internal scroll strategy', () => {
  const source = readProjectFile('src/components/TagMultiSelectPanel.tsx');

  assert.match(source, /tagSearchText/);
  assert.match(source, /visibleTags/);
  assert.match(source, /常用标签/);
  assert.match(source, /搜索标签/);
  assert.match(source, /<ScrollView/);
  assert.match(source, /maxHeight:\s*132/);
});

test('image list items include real tag names for existing loaded images', () => {
  const typesSource = readProjectFile('src/database/types.ts');
  const utilsSource = readProjectFile('src/database/utils.ts');
  const imageRepositorySource = readProjectFile('src/database/repositories/imageRepository.ts');
  const quickOrganizeSource = readProjectFile('src/screens/QuickOrganizeScreen.tsx');

  assert.match(typesSource, /tagNames:\s*string\[\]/);
  assert.match(imageRepositorySource, /GROUP_CONCAT\(tags\.name/);
  assert.match(utilsSource, /parseListTagNames/);
  assert.match(quickOrganizeSource, /current\.tagNames/);
});

test('batch panel exposes original-file save to album and grid pages expose select all', () => {
  const panelSource = readProjectFile('src/components/BatchImageOrganizePanel.tsx');
  const batchSource = readProjectFile('src/screens/BatchManageImagesScreen.tsx');
  const albumDialogSource = readProjectFile('src/components/AlbumSaveDialog.tsx');
  const mediaLibrarySource = readProjectFile('src/services/mediaLibraryService.ts');
  const nativeBridgeSource = readProjectFile('src/native/pixoryMediaModule.ts');
  const androidSource = readProjectFile('plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt');

  assert.match(mediaLibrarySource, /getSystemAlbums/);
  assert.match(mediaLibrarySource, /saveImagesToSystemAlbum/);
  assert.match(mediaLibrarySource, /saveNativeImageToMediaStore/);
  assert.match(nativeBridgeSource, /saveImageToMediaStore/);
  assert.match(androidSource, /MediaStore\.Images\.Media/);
  assert.match(mediaLibrarySource, /requestMediaLibrarySavePermission/);
  assert.match(albumDialogSource, /saveImagesToSystemAlbum/);
  assert.match(albumDialogSource, /albumTitle/);
  assert.match(albumDialogSource, /正在保存/);
  assert.match(panelSource, /isAlbumDialogVisible/);
  assert.match(panelSource, /AlbumSaveDialog/);
  assert.match(panelSource, /isSavingToAlbum/);
  assert.match(panelSource, /保存相册/);
  assert.match(batchSource, /isAlbumDialogVisible/);
  assert.match(batchSource, /AlbumSaveDialog/);
  assert.match(batchSource, /isSavingToAlbum/);

  for (const relativePath of [
    'src/screens/GroupImagesScreen.tsx',
    'src/screens/TagResultScreen.tsx',
    'src/screens/FavoritesScreen.tsx',
  ]) {
    const source = readProjectFile(relativePath);
    assert.match(source, /toggleSelectAll/);
    assert.match(source, /全选/);
  }
});

test('import batches expose history and current-batch duplicate review without full-library scanning', () => {
  const appSource = readProjectFile('App.tsx');
  const importBatchRepositorySource = readProjectFile('src/database/repositories/importBatchRepository.ts');
  const imageRepositorySource = readProjectFile('src/database/repositories/imageRepository.ts');

  assert.match(appSource, /import-batch-history/);
  assert.match(appSource, /duplicate-review/);
  assert.match(importBatchRepositorySource, /findByIpId\(db:\s*SQLiteDatabase,\s*ipId: number/);
  assert.match(imageRepositorySource, /findSuspectedDuplicateGroupsByImportBatchId\(db:\s*SQLiteDatabase,\s*importBatchId: number/);
  assert.doesNotMatch(imageRepositorySource, /findSuspectedDuplicateGroups\(\)/);
});

test('import templates are local user-managed records used by import and batch flows', () => {
  const schemaSource = readProjectFile('src/database/schema.ts');
  const dbSource = readProjectFile('src/database/db.ts');
  const indexSource = readProjectFile('src/database/index.ts');
  const typesSource = readProjectFile('src/database/types.ts');
  const repositorySource = readProjectFile('src/database/repositories/importTemplateRepository.ts');
  const importScreenSource = readProjectFile('src/screens/ImportImagesScreen.tsx');
  const batchSource = readProjectFile('src/screens/BatchManageImagesScreen.tsx');

  assert.match(schemaSource, /DATABASE_VERSION\s*=\s*45/);
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS import_templates/);
  assert.match(schemaSource, /seedDefaultImportTemplates/);
  assert.match(dbSource, /ensureImportTemplatesSchema/);
  assert.match(dbSource, /sqlite_master/);
  assert.match(dbSource, /MIGRATION_STATEMENTS_V9/);
  assert.match(indexSource, /importTemplateRepository/);
  assert.match(typesSource, /ImportTemplateRecord/);
  assert.match(repositorySource, /async findAll/);
  assert.match(repositorySource, /async create/);
  assert.match(repositorySource, /async update/);
  assert.match(repositorySource, /async deleteByKey/);
  assert.match(importScreenSource, /importTemplateRepository\.findAll/);
  assert.match(importScreenSource, /submitTemplateForm/);
  assert.match(importScreenSource, /startEditTemplate/);
  assert.match(importScreenSource, /confirmDeleteTemplate/);
  assert.match(importScreenSource, /新建模板/);
  assert.match(importScreenSource, /编辑模板/);
  assert.match(importScreenSource, /删除模板/);
  assert.match(batchSource, /importTemplateRepository\.findAll/);
  assert.doesNotMatch(importScreenSource, /IMPORT_TEMPLATES\.map/);
  assert.doesNotMatch(batchSource, /IMPORT_TEMPLATES\.map/);
});
