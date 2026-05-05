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
  assert.match(serviceSource, /MAX_PERSONAL_UNLOCK_FAILURES\s*=\s*5/);
  assert.match(serviceSource, /setPersonalPassword/);
  assert.match(serviceSource, /verifyPersonalPassword/);
  assert.match(serviceSource, /changePersonalPassword/);
  assert.match(serviceSource, /resetPersonalSystemData/);
  assert.doesNotMatch(serviceSource, /password\s*:/i);
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
