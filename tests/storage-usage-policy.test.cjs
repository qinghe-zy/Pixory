const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('Me screen routes to storage usage instead of opening cache cleanup directly', () => {
  const appSource = readProjectFile('App.tsx');
  const meSource = readProjectFile('src/screens/MeScreen.tsx');

  assert.match(meSource, /存储占用/);
  assert.match(meSource, /onOpenStorageUsage/);
  assert.doesNotMatch(meSource, /cleanupAppCache|cacheCleanupConfirmVisible|清理缓存/);
  assert.match(appSource, /storage-usage/);
  assert.match(appSource, /StorageUsageScreen/);
});

test('storage usage service exposes the five dashboard categories and avoids double-counting trash', () => {
  const source = readProjectFile('src/services/storageUsageService.ts');

  for (const key of ['original-assets', 'preview-cache', 'temporary-cache', 'backup-export', 'trash']) {
    assert.match(source, new RegExp(key));
  }

  assert.match(source, /getStorageUsageSummary/);
  assert.match(source, /originalBytes\s*\+\s*previewBytes\s*\+\s*temporaryBytes\s*\+\s*backupExportBytes/);
  assert.doesNotMatch(source, /originalBytes\s*\+\s*previewBytes\s*\+\s*temporaryBytes\s*\+\s*backupExportBytes\s*\+\s*trashBytes/);
  assert.match(source, /previousScannedAt/);
  assert.match(source, /previousTotalBytes/);
});

test('storage actions keep deletion scoped to allowed roots', () => {
  const storageSource = readProjectFile('src/services/storageUsageService.ts');
  const previewSource = readProjectFile('src/services/previewMaintenanceService.ts');
  const storageScreenSource = readProjectFile('src/screens/StorageUsageScreen.tsx');

  assert.match(storageScreenSource, /cleanupAppCache\(\{[\s\S]{0,240}includeDiskImageCache:\s*true/);
  assert.match(storageScreenSource, /includeExpoCacheDirectory:\s*true/);
  assert.match(storageScreenSource, /tempMaxAgeMs:\s*0/);
  assert.match(storageScreenSource, /已释放/);

  assert.match(previewSource, /rebuildAllPreviews/);
  assert.match(previewSource, /regenerateMissingPreviews/);
  assert.match(previewSource, /uri\.startsWith\(baseUri\)/);
  assert.doesNotMatch(previewSource, /getOriginalsDir[\s\S]{0,120}deleteAsync/);

  assert.match(storageSource, /deleteBackupExportEntry/);
  assert.match(storageSource, /entryUri\.startsWith\(exportsDir\)/);
  assert.doesNotMatch(storageSource, /delete.*getOriginalsDir|delete.*getTempDir|delete.*getThumbnailsDir/);
});

test('preview cache sheet uses non-growing stacked buttons', () => {
  const source = readProjectFile('src/screens/StorageUsageScreen.tsx');

  assert.match(source, /function PanelButton\(\{ disabled, fill = false/);
  assert.match(source, /fill && styles\.panelButtonFill/);
  assert.match(source, /panelButtonFill:\s*\{\s*flex:\s*1/);
  assert.match(source, /<View style=\{styles\.previewActions\}>[\s\S]{0,240}<PanelButton disabled=\{disabled\} label="重新生成缺失预览"/);
  assert.match(source, /<View style=\{styles\.sheetActions\}>[\s\S]{0,180}<PanelButton fill label="取消"/);
  assert.doesNotMatch(source, /panelButton:\s*\{[^}]*flex:\s*1/);
});

test('storage screens keep the dashboard compact and expose the required navigation targets', () => {
  const dashboard = readProjectFile('src/screens/StorageUsageScreen.tsx');
  const originals = readProjectFile('src/screens/OriginalStorageScreen.tsx');
  const detail = readProjectFile('src/screens/IpStorageDetailScreen.tsx');
  const backups = readProjectFile('src/screens/BackupExportManagerScreen.tsx');
  const trash = readProjectFile('src/screens/TrashScreen.tsx');
  const storageSource = readProjectFile('src/services/storageUsageService.ts');

  assert.match(dashboard, /较上次统计/);
  assert.match(dashboard, /SegmentBar/);
  assert.match(dashboard, /原始素材/);
  assert.match(dashboard, /预览缓存/);
  assert.match(dashboard, /临时缓存/);
  assert.match(dashboard, /备份导出/);
  assert.match(dashboard, /回收站/);
  assert.match(dashboard, /TemporaryCachePanel/);
  assert.match(dashboard, /PreviewCachePanel/);
  assert.match(dashboard, /PreviewRebuildConfirmPanel/);
  assert.match(dashboard, /function PreviewRebuildConfirmPanel[\s\S]{0,1400}styles\.sheetActions/);
  assert.match(dashboard, /function TemporaryCachePanel[\s\S]{0,1400}styles\.sheetActions/);

  assert.match(originals, /素材占用/);
  assert.match(originals, /onOpenIp/);
  assert.doesNotMatch(originals, /未归档素材/);
  assert.match(detail, /fileSizeDesc/);
  assert.match(detail, /label:\s*'大小'[\s\S]{0,80}direction:\s*'降序'/);
  assert.match(detail, /label:\s*'时间'[\s\S]{0,80}direction:\s*'降序'/);
  assert.match(detail, /label:\s*'分组'[\s\S]{0,80}direction:\s*'升序'/);
  assert.match(detail, /accessibilityState=\{\{\s*selected:\s*sortMode === option\.key\s*\}\}/);
  assert.match(detail, /checkmark-circle/);
  assert.match(backups, /备份与导出/);
  assert.match(backups, /删除这个备份/);
  assert.match(backups, /filesSection/);
  assert.match(backups, /selectedUris/);
  assert.match(backups, /删除所选备份/);
  assert.match(storageSource, /readBackupManifestCounts/);
  assert.match(storageSource, /assetCount:\s*manifestCounts\.assetCount/);
  assert.match(storageSource, /ipCount:\s*manifestCounts\.ipCount/);
  assert.match(trash, /storageMode/);
  assert.match(trash, /fileSizeDesc/);
});

test('page section spacing keeps state cards and lists separated from summaries', () => {
  const metrics = readProjectFile('src/design/tokens/metrics.ts');
  const backups = readProjectFile('src/screens/BackupExportManagerScreen.tsx');

  assert.match(metrics, /sectionGap:\s*28/);
  assert.match(backups, /marginTop:\s*rhythm\.screenSectionGap/);
  assert.match(backups, /emptyContainerStyle=\{styles\.emptyStateWrap\}/);
});
