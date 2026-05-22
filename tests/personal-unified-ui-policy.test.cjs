const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('personal image rendering goes through the secure image wrapper and required Expo modules', () => {
  const packageSource = readProjectFile('package.json');
  const secureImageSource = readProjectFile('src/components/SecureImage.tsx');
  const appSource = readProjectFile('App.tsx');

  assert.match(packageSource, /"expo-image"/);
  assert.doesNotMatch(packageSource, /"expo-screen-capture"/);
  assert.match(secureImageSource, /from 'expo-image'/);
  assert.match(secureImageSource, /space:\s*PixorySpace/);
  assert.match(secureImageSource, /cachePolicy=\{space === 'personal' \? 'none' : 'disk'\}/);
  assert.match(secureImageSource, /clearPersonalImageCache/);
  assert.match(appSource, /clearPersonalImageCache/);
  assert.match(appSource, /lockPersonalSpace[\s\S]{0,1600}clearPersonalImageCache/);
});

test('personal mode allows screenshots while keeping background lock behavior', () => {
  const appSource = readProjectFile('App.tsx');

  assert.doesNotMatch(appSource, /expo-screen-capture/);
  assert.doesNotMatch(appSource, /preventScreenCaptureAsync/);
  assert.doesNotMatch(appSource, /allowScreenCaptureAsync/);
  assert.doesNotMatch(appSource, /screen capture protection failed/);
  assert.match(appSource, /setPrivacyShieldVisible\(true\)[\s\S]{0,900}lockPersonalSpace\('background'\)/);
});

test('personal backup is only user-visible as encrypted pack and normal backup excludes personal sidecars', () => {
  const backupScreenSource = readProjectFile('src/screens/BackupScreen.tsx');
  const backupServiceSource = readProjectFile('src/services/backupService.ts');

  assert.doesNotMatch(backupScreenSource, /普通导出隐私数据/);
  assert.doesNotMatch(backupScreenSource, /createPersonalPlainBackup\(personalSecret\)/);
  assert.match(backupScreenSource, /加密导出隐私 \.pixorypack/);
  assert.match(backupScreenSource, /普通备份不包含隐私系统数据/);
  assert.match(backupServiceSource, /checkpointDatabase\('personal'\)/);
  assert.match(backupServiceSource, /checkpointDatabase\(space\)/);
  assert.doesNotMatch(backupServiceSource, /copyDirectoryIfExists\([\s\S]{0,80}getOriginalsDir\('personal'\)[\s\S]{0,500}createFullBackup/);
});

test('personal write tasks bind a task token and check validity at critical write points', () => {
  const importSource = readProjectFile('src/services/imageImportService.ts');
  const backupSource = readProjectFile('src/services/backupService.ts');

  assert.match(importSource, /PersonalTaskToken/);
  assert.match(importSource, /assertPersonalTaskActive\(params\.taskToken\)/);
  assert.match(importSource, /performSingleImageImport[\s\S]{0,700}assertPersonalTaskActive\(pendingImageAsset\.taskToken\)/);
  assert.match(backupSource, /PersonalTaskToken/);
  assert.match(backupSource, /assertPersonalTaskActive\(taskToken\)/);
});
