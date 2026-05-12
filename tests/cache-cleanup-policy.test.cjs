const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('cache cleanup service keeps automatic cleanup conservative and scoped to temp/cache only', () => {
  const serviceSource = readProjectFile('src/services/cacheCleanupService.ts');

  assert.match(serviceSource, /BACKGROUND_MEMORY_CACHE_CLEAR_DELAY_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
  assert.match(serviceSource, /TEMP_CLEANUP_INTERVAL_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  assert.match(serviceSource, /TEMP_FILE_MAX_AGE_MS\s*=\s*48\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  assert.match(serviceSource, /clearImageMemoryCache[\s\S]{0,250}Image\.clearMemoryCache\(\)/);
  assert.match(serviceSource, /clearImageDiskCache[\s\S]{0,250}Image\.clearDiskCache\(\)/);
  assert.match(serviceSource, /cleanupOldTempFiles[\s\S]{0,700}getTempDir\(space\)/);
  assert.match(serviceSource, /cleanupDailyAppTempCache[\s\S]{0,900}lastTempCleanupAt/);
  assert.match(serviceSource, /cleanupAppCache[\s\S]{0,500}includeDiskImageCache/);
  assert.match(serviceSource, /cleanupAppCache[\s\S]{0,900}clearImageDiskCache\(\)/);
  assert.match(serviceSource, /cleanupExpoCacheDirectory/);
  assert.match(serviceSource, /FileSystem\.cacheDirectory/);
  assert.match(serviceSource, /startsWith\(cacheDirectory\)/);
  assert.match(serviceSource, /includeExpoCacheDirectory\?\s*:\s*boolean/);
  assert.doesNotMatch(serviceSource, /delete.*getOriginalsDir|delete.*getThumbnailsDir|delete.*getExportsDir|deleteDatabase|SecureStore\.deleteItemAsync/);
});

test('App clears memory cache only after a delayed background timer and runs daily temp cleanup on startup', () => {
  const appSource = readProjectFile('App.tsx');

  assert.match(appSource, /BACKGROUND_MEMORY_CACHE_CLEAR_DELAY_MS/);
  assert.match(appSource, /backgroundMemoryCacheTimerRef/);
  assert.match(appSource, /setTimeout\([\s\S]{0,500}clearImageMemoryCache\(\)[\s\S]{0,160}BACKGROUND_MEMORY_CACHE_CLEAR_DELAY_MS/);
  assert.match(appSource, /nextState === 'active'[\s\S]{0,450}clearPendingBackgroundMemoryCacheCleanup\(\)/);
  assert.match(appSource, /cleanupDailyAppTempCache\(\)/);
  assert.doesNotMatch(appSource, /AppState\.addEventListener\('change'[\s\S]{0,500}clearImageDiskCache\(\)/);
});

test('manual cache cleanup moved behind the storage usage dashboard', () => {
  const meSource = readProjectFile('src/screens/MeScreen.tsx');
  const storageSource = readProjectFile('src/screens/StorageUsageScreen.tsx');

  assert.match(meSource, /存储占用/);
  assert.doesNotMatch(meSource, /清理缓存|cleanupAppCache|cacheCleanupConfirmVisible/);
  assert.match(storageSource, /临时缓存/);
  assert.match(storageSource, /资源包选择缓存/);
  assert.match(storageSource, /cleanupAppCache\(\{[\s\S]{0,250}includeDiskImageCache:\s*true/);
  assert.match(storageSource, /includeExpoCacheDirectory:\s*true/);
  assert.match(storageSource, /已释放/);
  assert.doesNotMatch(meSource, /deleteLocalFile|deleteDatabase|resetPersonalSystemData/);
});
