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

