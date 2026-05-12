const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('update check is configured as a passive version file lookup', () => {
  const appConfig = JSON.parse(readProjectFile('app.json'));
  const updateConfig = appConfig.expo.extra.updateCheck;

  assert.equal(updateConfig.enabled, true);
  assert.equal(updateConfig.url, 'https://raw.githubusercontent.com/qinghe-zy/Pixory/main/docs/update-version.json');
  assert.equal(updateConfig.timeoutMs, 5000);
});

test('update check service stays read-only and offline tolerant', () => {
  const serviceSource = readProjectFile('src/services/updateCheckService.ts');

  assert.match(serviceSource, /Constants\.expoConfig\?\.extra/);
  assert.match(serviceSource, /fetchWithTimeout/);
  assert.match(serviceSource, /cache:\s*'no-store'/);
  assert.match(serviceSource, /catch\s*\{\s*return null;\s*\}/);
  assert.match(serviceSource, /compareAppVersions/);
  assert.doesNotMatch(serviceSource, /releaseNotes[\s\S]{0,260}\.slice\(/);
  assert.doesNotMatch(serviceSource, /POST|PUT|PATCH|DELETE|SecureStore|SQLite|FileSystem/);
});

test('App shows update prompt without adding push notification behavior', () => {
  const appSource = readProjectFile('App.tsx');
  const packageJson = JSON.parse(readProjectFile('package.json'));

  assert.equal(packageJson.dependencies['expo-constants'], '~18.0.13');
  assert.match(appSource, /checkForAppUpdate\(\)/);
  assert.match(appSource, /setAvailableUpdate\(updateInfo\)/);
  assert.match(appSource, /<AppDialog[\s\S]{0,500}primaryLabel="去更新"/);
  assert.match(appSource, /Linking\.openURL\(downloadUrl\)/);
  assert.doesNotMatch(appSource, /Notifications|expo-notifications|getExpoPushToken|FCM|pushToken/);
});
