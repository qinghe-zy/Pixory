const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('App owns unified personal mode session state and removes the standalone console route', () => {
  const appSource = readProjectFile('App.tsx');

  assert.doesNotMatch(appSource, /PersonalSystemScreen/);
  assert.doesNotMatch(appSource, /name:\s*'personal-system'/);
  assert.match(appSource, /type PersonalSessionState\s*=\s*'locked'\s*\|\s*'unlocking'\s*\|\s*'unlocked'\s*\|\s*'locking'/);
  assert.match(appSource, /type SpaceSession\s*=\s*\{/);
  assert.match(appSource, /sessionId:\s*string/);
  assert.match(appSource, /generation:\s*number/);
  assert.match(appSource, /taskToken:\s*PersonalTaskToken/);
  assert.match(appSource, /useState<PersonalSessionState>\('locked'\)/);
  assert.match(appSource, /function lockPersonalSpace\(reason:\s*PersonalLockReason/);
  assert.match(appSource, /setPrivacyShieldVisible\(true\)[\s\S]{0,700}invalidatePersonalTaskToken/);
  assert.match(appSource, /function isPersonalRoute/);
  assert.match(appSource, /PERSONAL_BACKGROUND_LOCK_GRACE_MS\s*=\s*60\s*\*\s*1000/);
  assert.match(appSource, /AppState\.addEventListener\('change'[\s\S]{0,900}schedulePersonalBackgroundLock\(\)/);
  assert.match(appSource, /setTimeout\([\s\S]{0,500}lockPersonalSpace\('background'\)[\s\S]{0,120}PERSONAL_BACKGROUND_LOCK_GRACE_MS/);
  assert.match(appSource, /nextState === 'active'[\s\S]{0,300}clearPendingPersonalBackgroundLock\(\)/);
  assert.match(appSource, /isPersonalRoute\(currentRoute\)[\s\S]{0,700}personalSessionState !== 'unlocked'/);
  assert.match(appSource, /const activeSpace = personalSessionState === 'unlocked' \? 'personal' : 'normal'/);
  assert.doesNotMatch(appSource, /function lockPersonalSpace\(reason:\s*PersonalLockReason\)[\s\S]{0,700}setRouteStack\(\[INITIAL_ROUTE\]\)/);
});

test('Settings area owns personal setup unlock reset and mode toggle without a dashboard', () => {
  const meSource = readProjectFile('src/screens/MeScreen.tsx');
  const appSource = readProjectFile('App.tsx');

  assert.match(meSource, /space\?:\s*PixorySpace/);
  assert.match(meSource, /personalSessionState:\s*PersonalSessionState/);
  assert.match(meSource, /onRequestPersonalUnlock:\s*\(\)\s*=>\s*void/);
  assert.match(meSource, /onLockPersonalSpace:\s*\(\)\s*=>\s*void/);
  assert.match(meSource, /进入隐私模式/);
  assert.match(meSource, /返回普通模式|退出隐私模式/);
  assert.match(meSource, /space === 'personal'[\s\S]{0,500}onLockPersonalSpace/);
  assert.match(meSource, /space === 'personal'[\s\S]{0,500}onLockPersonalSpace[\s\S]{0,500}onRequestPersonalUnlock/);
  assert.match(appSource, /PersonalUnlockModal/);
  assert.match(appSource, /setPersonalPassword/);
  assert.match(appSource, /verifyPersonalPassword/);
  assert.match(appSource, /changePersonalPassword/);
  assert.match(appSource, /resetPersonalSystemData/);
  assert.match(appSource, /resetPersonalDataFromSettings[\s\S]{0,700}resetPersonalSystemData\(\)[\s\S]{0,700}lockPersonalSpace\('manual'\)/);
});

test('personal unlock failures keep the unlock modal open for retry', () => {
  const appSource = readProjectFile('App.tsx');
  const unlockBlock = appSource.slice(
    appSource.indexOf('async function unlockPersonalSpace'),
    appSource.indexOf('async function setupPersonalSpace')
  );
  const catchBlock = unlockBlock.slice(unlockBlock.indexOf('} catch (error)'));

  assert.match(catchBlock, /setPersonalSessionState\('locked'\)/);
  assert.match(catchBlock, /personalSessionStateRef\.current = 'locked'/);
  assert.doesNotMatch(catchBlock, /lockPersonalSpace\('error'\)/);
  assert.doesNotMatch(catchBlock, /setPersonalUnlockVisible\(false\)/);
});

test('root entry surfaces use the active authenticated space and deletion service accepts space', () => {
  const homeSource = readProjectFile('src/screens/HomeLibraryScreen.tsx');
  const meSource = readProjectFile('src/screens/MeScreen.tsx');
  const deletionSource = readProjectFile('src/services/ipDeletionService.ts');
  const appSource = readProjectFile('App.tsx');

  assert.match(homeSource, /space\?:\s*PixorySpace/);
  assert.match(homeSource, /runWithDatabaseSpace\(space/);
  assert.match(meSource, /runWithDatabaseSpace\(space/);
  assert.match(deletionSource, /softDeleteIpToTrash\(ipId:\s*number,\s*space:\s*PixorySpace = 'normal'\)/);
  assert.match(deletionSource, /permanentlyDeleteIp\(ipId:\s*number,\s*space:\s*PixorySpace = 'normal'\)/);
  assert.match(appSource, /const activeSpace = personalSessionState === 'unlocked' \? 'personal' : 'normal'/);
  assert.match(appSource, /<HomeLibraryScreen[\s\S]{0,900}space=\{activeSpace\}/);
  assert.match(appSource, /<MeScreen[\s\S]{0,900}space=\{activeSpace\}/);
  assert.match(appSource, /<GlobalGroupsScreen[\s\S]{0,900}space=\{activeSpace\}/);
  assert.match(appSource, /<TagsOverviewScreen[\s\S]{0,900}space=\{activeSpace\}/);
});

test('package import has durable per-file item schema, repository methods, and records package outcomes', () => {
  const schemaSource = readProjectFile('src/database/schema.ts');
  const typesSource = readProjectFile('src/database/types.ts');
  const repositorySource = readProjectFile('src/database/repositories/importBatchRepository.ts');
  const serviceSource = readProjectFile('src/services/packageImportService.ts');

  assert.match(schemaSource, /DATABASE_VERSION = 16/);
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
