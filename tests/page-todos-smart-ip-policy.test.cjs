const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('batch selection rules are shared and stay selection-only', () => {
  const rulesSource = readProjectFile('src/utils/batchSelectionRules.ts');
  const batchManageSource = readProjectFile('src/screens/BatchManageImagesScreen.tsx');
  const organizePanelSource = readProjectFile('src/components/BatchImageOrganizePanel.tsx');
  const multiSelectSource = readProjectFile('src/hooks/useImageMultiSelect.ts');

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
    "'import-batch'",
    "'suspected-duplicate'",
  ]) {
    assert.match(rulesSource, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(rulesSource, /requiresSelectionBase/);
  assert.match(rulesSource, /先选一张/);
  assert.doesNotMatch(rulesSource, /Repository|runAsync|deleteLocalFile|softDelete|updateMany/);
  assert.match(batchManageSource, /applySelectionRule/);
  assert.doesNotMatch(organizePanelSource, /SmartSelectionRuleBar/);
  assert.doesNotMatch(organizePanelSource, /ruleFilterPanel/);
  assert.doesNotMatch(organizePanelSource, /hideSmartSelectionRules/);
  assert.doesNotMatch(organizePanelSource, /AppActionSheet/);
  assert.match(multiSelectSource, /applyRuleSelection/);
  assert.doesNotMatch(organizePanelSource, /智能分堆/);
});

test('IP deletion supports recycle bin and permanent local cleanup paths', () => {
  const schemaSource = readProjectFile('src/database/schema.ts');
  const typesSource = readProjectFile('src/database/types.ts');
  const ipRepositorySource = readProjectFile('src/database/repositories/ipRepository.ts');
  const serviceSource = readProjectFile('src/services/ipDeletionService.ts');
  const homeSource = readProjectFile('src/screens/HomeLibraryScreen.tsx');
  const imageRepositorySource = readProjectFile('src/database/repositories/imageRepository.ts');

  assert.match(schemaSource, /DATABASE_VERSION\s*=\s*27/);
  assert.match(schemaSource, /ALTER TABLE ips ADD COLUMN deletedAt TEXT/);
  assert.match(typesSource, /deletedAt:\s*string \| null/);
  assert.match(ipRepositorySource, /softDeleteById/);
  assert.match(ipRepositorySource, /restoreById/);
  assert.match(ipRepositorySource, /deletePermanentlyById/);
  assert.match(ipRepositorySource, /ips\.deletedAt IS NULL/);
  assert.match(serviceSource, /softDeleteIpToTrash/);
  assert.match(serviceSource, /permanentlyDeleteIp/);
  assert.match(serviceSource, /deleteLocalFile/);
  assert.match(homeSource, /移入回收站/);
  assert.match(homeSource, /永久删除/);
  assert.match(homeSource, /setPermanentDeleteIp/);
  assert.match(imageRepositorySource, /restoreMany[\s\S]*ipRepository\.restoreById/);
});

test('recent image preview stays six but viewer loads import batch context', () => {
  const contextSource = readProjectFile('src/navigation/imageViewerContext.ts');
  const ipDetailSource = readProjectFile('src/screens/IpDetailScreen.tsx');
  const viewerSource = readProjectFile('src/screens/ImageViewerScreen.tsx');
  const detailSource = readProjectFile('src/screens/ImageDetailScreen.tsx');

  assert.match(contextSource, /type:\s*'import-batch'/);
  assert.match(ipDetailSource, /findRecentByIpId\(db,\s*ipId,\s*6,\s*\{\s*mediaType:\s*'all'\s*\}\)/);
  assert.match(ipDetailSource, /importBatchId/);
  assert.match(ipDetailSource, /type:\s*'import-batch'/);
  assert.match(viewerSource, /context\.type === 'import-batch'/);
  assert.match(viewerSource, /findByImportBatchId\(db,\s*context\.importBatchId/);
  assert.match(detailSource, /context\.type === 'import-batch'/);
  assert.match(detailSource, /findByImportBatchId\(db,\s*context\.importBatchId/);
});

test('page TODOs are reflected in concrete UI behavior', () => {
  const organizePanelSource = readProjectFile('src/components/BatchImageOrganizePanel.tsx');
  const ipDetailSource = readProjectFile('src/screens/IpDetailScreen.tsx');
  const tagsSource = readProjectFile('src/screens/TagsOverviewScreen.tsx');
  const meSource = readProjectFile('src/screens/MeScreen.tsx');

  assert.match(organizePanelSource, /currentGroupId != null && mode === 'remove-group'/);
  assert.match(organizePanelSource, /直接从当前分组移出/);
  assert.match(ipDetailSource, /managementSummary/);
  assert.match(ipDetailSource, /管理摘要/);
  assert.doesNotMatch(ipDetailSource, /ip\.description/);
  assert.match(ipDetailSource, /marginTop:\s*rhythm\.entryCardGap/);
  assert.match(tagsSource, /createTagValue/);
  assert.match(tagsSource, /tagRepository\.create/);
  assert.match(tagsSource, /新增标签/);
  assert.doesNotMatch(meSource, /storageFillWidth/);
  assert.doesNotMatch(meSource, /storageTrack/);
  assert.match(meSource, /libraryStatsRow/);
});

test('gallery exposes aspect filters and select all entry', () => {
  const contextSource = readProjectFile('src/navigation/imageViewerContext.ts');
  const imageRepositoryTypes = readProjectFile('src/database/types.ts');
  const imageRepositorySource = readProjectFile('src/database/repositories/imageRepository.ts');
  const allImagesSource = readProjectFile('src/screens/AllImagesScreen.tsx');
  const viewerSource = readProjectFile('src/screens/ImageViewerScreen.tsx');
  const detailSource = readProjectFile('src/screens/ImageDetailScreen.tsx');

  assert.match(contextSource, /type:\s*'aspect'/);
  assert.match(imageRepositoryTypes, /aspectRatio\?:/);
  for (const label of ['横图', '竖图', '方图', '长图']) {
    assert.match(allImagesSource, new RegExp(label));
  }
  assert.match(allImagesSource, /toggleSelectAll/);
  assert.match(imageRepositorySource, /image_assets\.width/);
  assert.match(viewerSource, /filter\.type === 'aspect'/);
  assert.match(detailSource, /filter\.type === 'aspect'/);
});

test('tag creation uses a header plus dialog instead of an inline long row', () => {
  const tagsSource = readProjectFile('src/screens/TagsOverviewScreen.tsx');

  assert.match(tagsSource, /rightAction=\{rightAction\}/);
  assert.match(tagsSource, /isCreateDialogVisible/);
  assert.match(tagsSource, /name="add"/);
  assert.match(tagsSource, /新增标签/);
  assert.doesNotMatch(tagsSource, /<View style=\{styles\.createPanel\}>/);
});

test('tag overview supports select all and batch deletion', () => {
  const tagsSource = readProjectFile('src/screens/TagsOverviewScreen.tsx');
  const tagRepositorySource = readProjectFile('src/database/repositories/tagRepository.ts');

  assert.match(tagsSource, /isSelectionMode/);
  assert.match(tagsSource, /selectedTagIds/);
  assert.match(tagsSource, /toggleSelectAll/);
  assert.match(tagsSource, /全选/);
  assert.match(tagsSource, /批量删除/);
  assert.match(tagsSource, /confirmBatchDeleteTags/);
  assert.match(tagsSource, /tagRepository\.deleteMany/);
  assert.match(tagRepositorySource, /async deleteMany/);
});

test('empty guide cards can sit lower on home groups and tags pages', () => {
  const homeSource = readProjectFile('src/screens/HomeLibraryScreen.tsx');
  const groupsSource = readProjectFile('src/screens/GlobalGroupsScreen.tsx');
  const tagsSource = readProjectFile('src/screens/TagsOverviewScreen.tsx');

  assert.match(homeSource, /emptyGuideOffset/);
  assert.match(groupsSource, /emptyGuideOffset/);
  assert.match(tagsSource, /emptyGuideOffset/);
});

test('global groups empty state gives a concrete next action', () => {
  const appSource = readProjectFile('App.tsx');
  const groupsSource = readProjectFile('src/screens/GlobalGroupsScreen.tsx');

  assert.match(groupsSource, /onCreateFirstIp/);
  assert.match(groupsSource, /emptyActionLabel=\{onCreateFirstIp \? '去首页创建 IP' : undefined\}/);
  assert.match(groupsSource, /先创建或打开 IP/);
  assert.match(appSource, /<GlobalGroupsScreen[\s\S]{0,500}onCreateFirstIp=\{\(\) => pushRoute\(\{ name: 'create-ip'/);
});

test('settings entry is visibly marked unavailable instead of looking broken', () => {
  const meSource = readProjectFile('src/screens/MeScreen.tsx');

  assert.match(meSource, /设置，未开放/);
  assert.match(meSource, /unavailableBadge/);
  assert.match(meSource, /<Text style=\{styles\.unavailableBadge\}>未开放<\/Text>/);
});
