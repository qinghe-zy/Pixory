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
  assert.match(organizePanelSource, /SmartSelectionRuleBar/);
  assert.match(multiSelectSource, /applyRuleSelection/);
  assert.match(organizePanelSource, /取消该规则/);
});

test('IP deletion supports recycle bin and permanent local cleanup paths', () => {
  const schemaSource = readProjectFile('src/database/schema.ts');
  const typesSource = readProjectFile('src/database/types.ts');
  const ipRepositorySource = readProjectFile('src/database/repositories/ipRepository.ts');
  const serviceSource = readProjectFile('src/services/ipDeletionService.ts');
  const homeSource = readProjectFile('src/screens/HomeLibraryScreen.tsx');
  const imageRepositorySource = readProjectFile('src/database/repositories/imageRepository.ts');

  assert.match(schemaSource, /DATABASE_VERSION\s*=\s*8/);
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
  assert.match(ipDetailSource, /findRecentByIpId\(ipId,\s*6\)/);
  assert.match(ipDetailSource, /importBatchId/);
  assert.match(ipDetailSource, /type:\s*'import-batch'/);
  assert.match(viewerSource, /context\.type === 'import-batch'/);
  assert.match(viewerSource, /findByImportBatchId\(context\.importBatchId/);
  assert.match(detailSource, /context\.type === 'import-batch'/);
  assert.match(detailSource, /findByImportBatchId\(context\.importBatchId/);
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
  assert.match(tagsSource, /createTagValue/);
  assert.match(tagsSource, /tagRepository\.create/);
  assert.match(tagsSource, /新增标签/);
  assert.doesNotMatch(meSource, /storageFillWidth/);
  assert.doesNotMatch(meSource, /storageTrack/);
  assert.match(meSource, /libraryStatsRow/);
});
