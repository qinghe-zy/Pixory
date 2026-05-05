const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('App owns Personal System unlock state and guards personal-space routes after relock', () => {
  const appSource = readProjectFile('App.tsx');

  assert.match(appSource, /type PersonalUnlockState\s*=\s*'locked'\s*\|\s*'unlocked'/);
  assert.match(appSource, /useState<PersonalUnlockState>\('locked'\)/);
  assert.match(appSource, /function lockPersonalSystem/);
  assert.match(appSource, /function isPersonalRoute/);
  assert.match(appSource, /AppState\.addEventListener\('change'[\s\S]{0,500}lockPersonalSystem/);
  assert.match(appSource, /isPersonalRoute\(currentRoute\)[\s\S]{0,500}personalUnlockState === 'locked'/);
  assert.match(appSource, /onUnlocked=\{unlockPersonalSystem\}/);
  assert.match(appSource, /function exitPersonalSystem\(\)\s*\{[\s\S]{0,120}lockPersonalSystem\(\)/);
  assert.match(appSource, /onExit=\{exitPersonalSystem\}/);
});

test('Personal System dashboard exposes normal/private sections, full private detail, and password lifecycle actions', () => {
  const screenSource = readProjectFile('src/screens/PersonalSystemScreen.tsx');
  const appSource = readProjectFile('App.tsx');

  assert.match(screenSource, /isUnlocked:\s*boolean/);
  assert.match(screenSource, /onUnlocked:\s*\(\)\s*=>\s*void/);
  assert.match(screenSource, /onOpenIp:\s*\(ipId:\s*number,\s*space:\s*PixorySpace\)\s*=>\s*void/);
  assert.match(screenSource, /onImportImages:\s*\(ipId:\s*number,\s*space:\s*PixorySpace\)\s*=>\s*void/);
  assert.match(screenSource, /onCreateIp:\s*\(space:\s*PixorySpace\)\s*=>\s*void/);
  assert.match(screenSource, /runWithDatabaseSpace\('normal'[\s\S]{0,180}ipRepository\.findLibraryItems/);
  assert.match(screenSource, /runWithDatabaseSpace\('personal'[\s\S]{0,180}ipRepository\.findLibraryItems/);
  assert.match(screenSource, /普通 IP/);
  assert.match(screenSource, /隐私 IP/);
  assert.match(screenSource, /\(ps\)/);
  assert.match(screenSource, /changePersonalPassword/);
  assert.match(screenSource, /onOpenIp\(item\.id,\s*'personal'\)/);
  assert.match(screenSource, /onImportImages\(item\.id,\s*isPersonal \? 'personal' : 'normal'\)/);
  assert.match(screenSource, /导入历史/);
  assert.match(screenSource, /疑似重复/);
  assert.match(appSource, /onImportImages=\{\(ipId,\s*space\)\s*=>\s*pushRoute\(\{\s*name:\s*'import-images',\s*ipId,\s*space\s*\}\)\}/);
});

test('normal entry surfaces are explicitly scoped to normal space and deletion service accepts space', () => {
  const homeSource = readProjectFile('src/screens/HomeLibraryScreen.tsx');
  const meSource = readProjectFile('src/screens/MeScreen.tsx');
  const deletionSource = readProjectFile('src/services/ipDeletionService.ts');
  const appSource = readProjectFile('App.tsx');

  assert.match(homeSource, /runWithDatabaseSpace\('normal'/);
  assert.match(meSource, /runWithDatabaseSpace\('normal'/);
  assert.match(deletionSource, /softDeleteIpToTrash\(ipId:\s*number,\s*space:\s*PixorySpace = 'normal'\)/);
  assert.match(deletionSource, /permanentlyDeleteIp\(ipId:\s*number,\s*space:\s*PixorySpace = 'normal'\)/);
  assert.match(appSource, /<GlobalGroupsScreen[\s\S]{0,900}space=\{'normal'\}/);
  assert.match(appSource, /<TagsOverviewScreen[\s\S]{0,900}space=\{'normal'\}/);
});

test('package import has durable per-file item schema, repository methods, and records package outcomes', () => {
  const schemaSource = readProjectFile('src/database/schema.ts');
  const typesSource = readProjectFile('src/database/types.ts');
  const repositorySource = readProjectFile('src/database/repositories/importBatchRepository.ts');
  const serviceSource = readProjectFile('src/services/packageImportService.ts');

  assert.match(schemaSource, /DATABASE_VERSION = 10/);
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS import_batch_items/);
  assert.match(schemaSource, /status TEXT NOT NULL CHECK \(status IN \('success', 'failed', 'skipped'\)\)/);
  assert.match(typesSource, /export type ImportBatchItemStatus = 'success' \| 'failed' \| 'skipped'/);
  assert.match(repositorySource, /createItem/);
  assert.match(repositorySource, /findItemsByBatchId/);
  assert.match(repositorySource, /countItemsByStatus/);
  assert.match(serviceSource, /importBatchRepository\.create\(/);
  assert.match(serviceSource, /importBatchRepository\.createItem\([\s\S]{0,400}status:\s*'success'/);
  assert.match(serviceSource, /importBatchRepository\.createItem\([\s\S]{0,400}status:\s*'failed'/);
  assert.match(serviceSource, /importBatchRepository\.createItem\([\s\S]{0,400}status:\s*'skipped'/);
  assert.match(serviceSource, /mergePackageGroupIds/);
});

test('backup service supports normal plain, personal plain/encrypted, all encrypted, and merge encrypted import', () => {
  const backupSource = readProjectFile('src/services/backupService.ts');

  assert.match(backupSource, /zipWithPassword/);
  assert.match(backupSource, /unzipWithPassword/);
  assert.match(backupSource, /EncryptionMethods\.AES_256/);
  assert.match(backupSource, /createPersonalPlainBackup/);
  assert.match(backupSource, /createEncryptedPersonalPack/);
  assert.match(backupSource, /createEncryptedAllPack/);
  assert.match(backupSource, /importEncryptedPersonalPack/);
  assert.match(backupSource, /mode:\s*'merge'/);
  assert.match(backupSource, /requirePersonalVerification\(secret\)/);
  assert.match(backupSource, /importBatchIdMap/);
  assert.match(backupSource, /importBatchRepository\.create/);
  assert.match(backupSource, /importBatchRepository\.createItem/);
  assert.match(backupSource, /imageIdMap/);
  assert.doesNotMatch(backupSource, /createFullBackup\('personal'\)/);
});

test('import history surfaces package item success, failed, and skipped details', () => {
  const historySource = readProjectFile('src/screens/ImportBatchHistoryScreen.tsx');
  const reviewSource = readProjectFile('src/screens/ImportBatchReviewScreen.tsx');

  assert.match(historySource, /findItemsByBatchId/);
  assert.match(historySource, /itemCountsByBatchId/);
  assert.match(historySource, /成功 \{itemCounts\.success\}/);
  assert.match(historySource, /失败 \{itemCounts\.failed\}/);
  assert.match(historySource, /跳过 \{itemCounts\.skipped\}/);
  assert.match(reviewSource, /资源包明细/);
  assert.match(reviewSource, /item\.status === 'skipped'/);
});

test('package import validates storage headroom and keeps package work in the selected space temp', () => {
  const packageSource = readProjectFile('src/services/packageImportService.ts');

  assert.match(packageSource, /FileSystem\.getFreeDiskStorageAsync\(\)/);
  assert.match(packageSource, /assertEnoughStorageForPackage/);
  assert.match(packageSource, /MAX_UNCOMPRESSED_BYTES/);
  assert.match(packageSource, /getTempDir\(space\)/);
  assert.match(packageSource, /copyPackageToPrivateTemp\(params\.packageUri,\s*params\.packageName,\s*space\)/);
  assert.match(packageSource, /unzipPackageToPrivateTemp\(copiedPackageUri,\s*space\)/);
});

test('private import/export and storage logs avoid dumping private paths', () => {
  const storageSource = readProjectFile('src/services/fileStorageService.ts');
  const packageSource = readProjectFile('src/services/packageImportService.ts');

  assert.doesNotMatch(storageSource, /console\.warn\('Pixory original copyAsync failed[\s\S]{0,140}sourceUri,/);
  assert.doesNotMatch(storageSource, /console\.warn\('Pixory avatar copyAsync failed[\s\S]{0,140}destinationUri,/);
  assert.doesNotMatch(packageSource, /MediaLibrary|createAssetAsync|saveToLibraryAsync|CameraRoll/);
});

test('normal-mode development logs redact private file values instead of dumping records', () => {
  const devSource = readProjectFile('src/utils/dev.ts');
  const importSource = readProjectFile('src/services/imageImportService.ts');
  const batchSource = readProjectFile('src/screens/BatchManageImagesScreen.tsx');

  assert.match(devSource, /redactDevLogString/);
  assert.match(devSource, /redactDevLogValue/);
  assert.match(devSource, /originalFileUri|thumbnailFileUri|sourceUri/);
  assert.match(devSource, /file:\/\/|content:\/\/|pixory_personal/);
  assert.match(importSource, /devLog\('Pixory import persisted image asset:'[\s\S]{0,600}imageAssetId/);
  assert.doesNotMatch(importSource, /devLog\('Pixory import persisted image asset:'[\s\S]{0,600}originalFileUri:\s*createdImage\.originalFileUri/);
  assert.doesNotMatch(importSource, /devLog\('Pixory import development check summary:'[\s\S]{0,900}imageAssetsWriteResult:\s*item\.image/);
  assert.match(batchSource, /devLog\('Pixory batch delete verification JSON:'[\s\S]{0,120}JSON\.stringify/);
});
