const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadSnapshotCacheModule() {
  const epochFilename = path.join(root, 'src/services/dataEpochService.ts');
  const cacheFilename = path.join(root, 'src/services/storageUsageSnapshotCache.ts');

  const transpile = (filename) =>
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    }).outputText;

  const epochModule = { exports: {} };
  new Function('exports', 'module', 'require', transpile(epochFilename))(
    epochModule.exports,
    epochModule,
    require,
  );

  const customRequire = (specifier) => {
    if (specifier === './dataEpochService') {
      return epochModule.exports;
    }
    return require(specifier);
  };

  const cacheModule = { exports: {} };
  new Function('exports', 'module', 'require', transpile(cacheFilename))(
    cacheModule.exports,
    cacheModule,
    customRequire,
  );

  return { cache: cacheModule.exports, epoch: epochModule.exports };
}

test('HomeLibraryScreen exclusively uses fast media bytes and keeps minimalist subtitle', () => {
  const home = read('src/screens/HomeLibraryScreen.tsx');

  assert.match(home, /getFastStorageUsageBytes/);
  assert.doesNotMatch(home, /getCachedStorageUsageSummary/);
  assert.doesNotMatch(home, /getStorageUsageSummary/);
  assert.match(home, /<Text numberOfLines=\{1\} style=\{styles\.brandSubtitleText\}>\{appUsedText\} \/ \{totalDiskText\}<\/Text>/);
});

test('MeScreen syncs storage row with StorageUsageScreen totals without running full disk scans', () => {
  const me = read('src/screens/MeScreen.tsx');
  const storageService = read('src/services/storageUsageService.ts');

  assert.doesNotMatch(me, /getStorageUsageSummary/);
  assert.match(me, /getLastKnownStorageTotalBytes/);
  assert.match(me, /subscribeLatestStorageTotalBytes/);
  assert.doesNotMatch(me, /getLastKnownStorageTotalBytes\(space\)[\s\S]{0,180}\[space,\s*refreshToken\]/);
  assert.match(me, /title="存储占用"[\s\S]{0,120}storageTotalBytes !== null \? formatFileSize\(storageTotalBytes\) : "点击统计"/);
  assert.match(me, /<Text numberOfLines=\{1\} style=\{styles\.minimalistRowValue\}>\{valueText\}<\/Text>/);
  assert.match(storageService, /export async function getLastKnownStorageTotalBytes/);
});

test('App clears Personal cached storage numbers when locking Personal space', () => {
  const app = read('App.tsx');

  assert.match(app, /lockPersonalSpace[\s\S]{0,2200}clearSpaceStorageSnapshotCache\('personal'\)/);
  assert.match(app, /lockPersonalSpace[\s\S]{0,2200}clearFastMediaBytesCache\('personal'\)/);
});

test('BackupExportManagerScreen notifies parent changes to keep StorageUsageScreen and MeScreen synced', () => {
  const backups = read('src/screens/BackupExportManagerScreen.tsx');
  const app = read('App.tsx');

  assert.match(backups, /onChanged\?: \(\) => void/);
  assert.match(backups, /confirmDeleteBackup[\s\S]{0,300}onChanged\?\.\(\)/);
  assert.match(backups, /confirmBatchDeleteBackups[\s\S]{0,300}onChanged\?\.\(\)/);
  assert.match(app, /<BackupExportManagerScreen[\s\S]{0,160}onChanged=\{refreshLibrary\}/);
});

test('storageUsageSnapshotCache pushes latest scanned totals per space and survives snapshot invalidation', () => {
  const { cache, epoch } = loadSnapshotCacheModule();
  const receivedNormal = [];
  const receivedPersonal = [];

  const unsubNormal = cache.subscribeLatestStorageTotalBytes('normal', (bytes) => {
    receivedNormal.push(bytes);
  });
  const unsubPersonal = cache.subscribeLatestStorageTotalBytes('personal', (bytes) => {
    receivedPersonal.push(bytes);
  });

  cache.setCachedStorageUsageSummary('normal', { totalBytes: 512000 });
  cache.setCachedStorageUsageSummary('personal', { totalBytes: 102400 });

  assert.deepEqual(receivedNormal, [512000]);
  assert.deepEqual(receivedPersonal, [102400]);
  assert.equal(cache.getLatestStorageTotalBytes('normal'), 512000);
  assert.equal(cache.getLatestStorageTotalBytes('personal'), 102400);

  // Invalidating the TTL/epoch summary cache must keep the last known total for MeScreen.
  cache.invalidateStorageUsageSnapshot('normal');
  epoch.bumpDataEpoch('media', 'normal');
  assert.equal(cache.getCachedStorageUsageSummary('normal'), undefined);
  assert.equal(cache.getLatestStorageTotalBytes('normal'), 512000);

  // Clearing a space cache on Personal lock wipes personal data while keeping normal intact.
  cache.clearSpaceStorageSnapshotCache('personal');
  assert.equal(cache.getCachedStorageUsageSummary('personal'), undefined);
  assert.equal(cache.getLatestStorageTotalBytes('personal'), undefined);
  assert.equal(cache.getLatestStorageTotalBytes('normal'), 512000);

  unsubNormal();
  unsubPersonal();

  cache.setLatestStorageTotalBytes('normal', 256000);
  assert.deepEqual(receivedNormal, [512000]);
  assert.equal(cache.getLatestStorageTotalBytes('normal'), 256000);
});
