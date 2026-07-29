const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('package import service uses document picker and native unzip into private temp', () => {
  const source = readProjectFile('src/services/packageImportService.ts');

  assert.match(source, /expo-document-picker/);
  assert.match(source, /react-native-zip-archive/);
  assert.match(source, /copyPackageToPrivateTemp/);
  assert.match(source, /unzipPackageToPrivateTemp/);
  assert.match(source, /getTempDir\(space\)/);
  assert.match(source, /space:\s*PixorySpace/);
  assert.match(source, /deleteDocumentPickerCachePackage/);
  assert.match(source, /packageUri\.startsWith\(FileSystem\.cacheDirectory\)/);
  assert.match(source, /deleteDocumentPickerCachePackage\(params\.packageUri\)/);
});

test('package import rejects zip slip and conservative package limits before importing assets', () => {
  const source = readProjectFile('src/services/packageImportService.ts');

  assert.match(source, /MAX_PACKAGE_BYTES/);
  assert.match(source, /MAX_UNCOMPRESSED_BYTES/);
  assert.match(source, /MAX_PACKAGE_FILE_COUNT/);
  assert.match(source, /MAX_PACKAGE_DIRECTORY_DEPTH/);
  assert.match(source, /assertSafeExtractedPath/);
  assert.match(source, /\.\.\//);
  assert.match(source, /getUncompressedSize/);
});

test('package import identifies images by magic bytes and maps folders to groups', () => {
  const source = readProjectFile('src/services/packageImportService.ts');

  for (const mimeType of ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']) {
    assert.match(source, new RegExp(mimeType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(source, /detectImageTypeFromMagicBytes/);
  assert.match(source, /MAGIC_BYTE_READ_LENGTH/);
  assert.match(source, /readAsStringAsync\(fileUri,\s*\{[\s\S]{0,160}position:\s*0/);
  assert.match(source, /readAsStringAsync\(fileUri,\s*\{[\s\S]{0,180}length:\s*MAGIC_BYTE_READ_LENGTH/);
  assert.match(source, /resolvePackageGroupName/);
  assert.match(source, /groupRepository\.findByIpIdAndName/);
  assert.match(source, /groupRepository\.create/);
  assert.match(source, /importPackageToIp/);
});

test('import screen exposes resource package import alongside gallery import', () => {
  const source = readProjectFile('src/screens/ImportImagesScreen.tsx');

  assert.match(source, /pickPackageForImport/);
  assert.match(source, /importPackageToIp/);
  assert.match(source, /资源包导入/);
  assert.match(source, /\.zip \/ \.pixorypack/);
  assert.match(source, /packageImportResult/);
});

test('personal resource package imports are tracked and propagate the lock token through backup and media paths', () => {
  const screen = readProjectFile('src/screens/ImportImagesScreen.tsx');
  const service = readProjectFile('src/services/packageImportService.ts');

  assert.match(screen, /trackPersonalTask\(taskToken,\s*importPackageToIp\(\{/);
  assert.match(screen, /ipNameConflictStrategy:\s*'ask',[\s\S]{0,100}taskToken/);
  assert.match(service, /taskToken\?:\s*PersonalTaskToken \| null/);
  assert.match(service, /importPlainBackupPackage\(\{[\s\S]{0,220}taskToken:\s*params\.taskToken/);
  assert.match(service, /importVideosToIp\(\{[\s\S]{0,300}taskToken:\s*params\.taskToken/);
  assert.match(service, /importSingleImage\(\{[\s\S]{0,500}taskToken:\s*params\.taskToken/);
  assert.match(service, /catch \(error\) \{\s*assertPersonalTaskActive\(params\.taskToken\)/);
});

