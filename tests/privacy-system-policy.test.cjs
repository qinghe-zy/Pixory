const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('database layer exposes normal and personal SQLite spaces without scoped compatibility context', () => {
  const schemaSource = readProjectFile('src/database/schema.ts');
  const dbSource = readProjectFile('src/database/db.ts');
  const indexSource = readProjectFile('src/database/index.ts');
  const repositoryDir = path.join(rootDir, 'src/database/repositories');
  const repositorySources = fs
    .readdirSync(repositoryDir)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => [file, fs.readFileSync(path.join(repositoryDir, file), 'utf8')]);

  assert.match(schemaSource, /PERSONAL_DATABASE_NAME\s*=\s*'pixory_personal\.sqlite'/);
  assert.match(dbSource, /export type PixorySpace\s*=\s*'normal'\s*\|\s*'personal'/);
  assert.doesNotMatch(dbSource, /currentDatabaseSpace/);
  assert.doesNotMatch(dbSource, /scopedDatabaseSpace/);
  assert.doesNotMatch(dbSource, /scopedDatabaseQueue/);
  assert.match(dbSource, /getDatabase\(space: PixorySpace\)/);
  assert.match(dbSource, /runWithDatabaseSpace[\s\S]{0,260}task\(db\)/);
  assert.doesNotMatch(dbSource, /previousSpace[\s\S]{0,200}currentDatabaseSpace/);
  assert.match(dbSource, /openDatabaseAsync\(getDatabaseNameForSpace\(space\)\)/);
  assert.match(dbSource, /checkpointDatabase\(space: PixorySpace\)/);
  assert.match(dbSource, /resetDatabaseSpaceCache\(space: PixorySpace\)[\s\S]{0,500}checkpointDatabase\(space\)/);
  assert.match(indexSource, /PixorySpace/);
  for (const [file, source] of repositorySources) {
    assert.doesNotMatch(source, /getDatabase\(\)/, `${file} must not implicitly open the active/default database`);
    assert.match(source, /SQLiteDatabase/, `${file} must receive an explicit SQLite db handle`);
  }
});

test('file storage keeps personal originals and thumbnails outside the normal pixory tree', () => {
  const storageSource = readProjectFile('src/services/fileStorageService.ts');
  const thumbnailSource = readProjectFile('src/services/thumbnailService.ts');
  const importSource = readProjectFile('src/services/imageImportService.ts');

  assert.match(storageSource, /PERSONAL_STORAGE_ROOT_DIR_NAME\s*=\s*'pixory_personal'/);
  assert.match(storageSource, /getOriginalsDir\(space: PixorySpace = 'normal'\)/);
  assert.match(storageSource, /copyOriginalToAppStorage\([\s\S]*space: PixorySpace = 'normal'/);
  assert.match(thumbnailSource, /generateThumbnail\([\s\S]*space: PixorySpace = 'normal'/);
  assert.match(importSource, /space\?: PixorySpace/);
  assert.match(importSource, /copyOriginalToAppStorage\([\s\S]*pendingImageAsset\.space/);
  assert.match(importSource, /generateThumbnail\([\s\S]*pendingImageAsset\.space/);
});

test('Personal System stores password credentials securely and supports lock/reset flow', () => {
  const serviceSource = readProjectFile('src/services/personalSystemService.ts');

  assert.match(serviceSource, /expo-secure-store/);
  assert.match(serviceSource, /expo-crypto/);
  assert.match(serviceSource, /PERSONAL_CREDENTIAL_KEY/);
  assert.match(serviceSource, /MAX_PERSONAL_UNLOCK_FAILURES\s*=\s*15/);
  assert.match(serviceSource, /PERSONAL_LOCK_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
  assert.match(serviceSource, /PERSONAL_BACKGROUND_LOCK_TIMEOUT_KEY/);
  assert.match(serviceSource, /PERSONAL_BACKGROUND_LOCK_OPTIONS/);
  assert.match(serviceSource, /formatPersonalLockCountdown/);
  assert.match(serviceSource, /setPersonalPassword/);
  assert.match(serviceSource, /verifyPersonalPassword/);
  assert.match(serviceSource, /changePersonalPassword/);
  assert.match(serviceSource, /resetPersonalSystemData/);
  assert.match(serviceSource, /enrollPersonalBiometric/);
  assert.match(serviceSource, /authenticatePersonalBiometric/);
  assert.doesNotMatch(serviceSource, /(?<!has)password\s*:/i);
});

test('Password and Security screen enforces whole-page gate, 7-tier lock, and native biometric binding', () => {
  const screenSource = readProjectFile('src/screens/PasswordAndSecurityScreen.tsx');
  assert.match(screenSource, /getPersonalCredentialConfig/);
  assert.match(screenSource, /cfg\.hasCredential && !isPersonalUnlocked && !gateVerified/);
  assert.match(screenSource, /gateVerified \? \(/);
  assert.match(screenSource, /enrollPersonalBiometric/);
  assert.match(screenSource, /PERSONAL_BACKGROUND_LOCK_OPTIONS/);
  assert.match(screenSource, /setPersonalBackgroundLockTimeoutMs/);
});

test('Native Android security hardening declares MANAGE_MEDIA, disables backup, and enforces recents blur without FLAG_SECURE', () => {
  const manifestApp = readProjectFile('android/app/src/main/AndroidManifest.xml');
  const manifestTpl = readProjectFile('plugins/pixory-android-intents/templates/app/src/main/AndroidManifest.xml');
  const mainActivity = readProjectFile('android/app/src/main/java/com/pixory/app/MainActivity.kt');
  const mediaModule = readProjectFile('android/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt');

  assert.match(manifestApp, /android\.permission\.MANAGE_MEDIA/);
  assert.match(manifestTpl, /android\.permission\.MANAGE_MEDIA/);
  assert.match(manifestApp, /android:allowBackup="false"/);
  assert.match(manifestTpl, /android:allowBackup="false"/);

  assert.doesNotMatch(mainActivity, /FLAG_SECURE/);
  assert.match(mainActivity, /setPersonalRecentsBlurEnabled/);
  assert.match(mainActivity, /RenderEffect\.createBlurEffect/);

  assert.match(mediaModule, /setInvalidatedByBiometricEnrollment\(true\)/);
  assert.match(mediaModule, /Authenticators\.BIOMETRIC_STRONG/);
  assert.match(mediaModule, /deleteMediaStoreAssetsSmart/);
  assert.match(mediaModule, /Images\.Media\.EXTERNAL_CONTENT_URI/);
  assert.match(mediaModule, /Video\.Media\.EXTERNAL_CONTENT_URI/);
});

test('Import screen replaces preserve filename card with album deletion switch while keeping filename preserved', () => {
  const importScreenSource = readProjectFile('src/screens/ImportImagesScreen.tsx');
  const videoImportSource = readProjectFile('src/services/videoImportService.ts');

  assert.match(importScreenSource, /删除相册文件/);
  assert.match(importScreenSource, /handleToggleDeleteSourceMode/);
  assert.match(importScreenSource, /deleteImportedMediaSources/);
  assert.doesNotMatch(importScreenSource, /保留原文件名/);
  assert.match(videoImportSource, /preserveOriginal/);
});

test('Biometric and deletion modules provide graceful fallback for OTA runtime without crashing or hiding dialogs', () => {
  const mediaModuleTs = readProjectFile('src/native/pixoryMediaModule.ts');
  const deletionService = readProjectFile('src/services/mediaSourceDeletionService.ts');
  const imageImport = readProjectFile('src/services/imageImportService.ts');
  const videoImport = readProjectFile('src/services/videoImportService.ts');

  // Biometric fallback without native module errors
  assert.match(mediaModuleTs, /hasNativeBiometricKeySupport/);
  assert.match(mediaModuleTs, /LocalAuthentication\.authenticateAsync/);
  assert.doesNotMatch(mediaModuleTs, /当前客户端版本尚未包含硬件生物识别绑定模块/);

  // Deletion service resolves missing assetIds via URI and MediaLibrary
  assert.match(deletionService, /resolveAssetIdsForTargets/);
  assert.match(deletionService, /MediaLibrary\.getAssetsAsync/);
  assert.match(deletionService, /MediaLibrary\.MediaType\.photo/);
  assert.match(deletionService, /MediaLibrary\.MediaType\.video/);

  // Import services pass URI to resolvePickedAssetId for MediaStore ID extraction
  assert.match(imageImport, /resolvePickedAssetId\(pickedAsset\.assetId,\s*pickedAsset\.uri\)/);
  assert.match(videoImport, /resolvePickedVideoAssetId\(pickedAsset\.assetId,\s*pickedAsset\.uri\)/);
});

test('normal backup is explicitly scoped to normal space and never serializes personal database', () => {
  const backupSource = readProjectFile('src/services/backupService.ts');

  assert.match(backupSource, /BackupScope/);
  assert.match(backupSource, /space:\s*'normal'/);
  assert.match(backupSource, /PERSONAL_DATABASE_NAME/);
  assert.match(backupSource, /createPersonalBackup/);
  assert.match(backupSource, /requirePersonalVerification/);
  assert.doesNotMatch(backupSource, /pixory_personal\.sqlite[\s\S]{0,400}createFullBackup/);
});
