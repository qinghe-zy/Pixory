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

test('announcement check is configured as a passive remote notice lookup', () => {
  const appConfig = JSON.parse(readProjectFile('app.json'));
  const announcementConfig = appConfig.expo.extra.announcement;
  const announcementJson = JSON.parse(readProjectFile('docs/announcement.json'));

  assert.equal(announcementConfig.enabled, true);
  assert.equal(announcementConfig.url, 'https://raw.githubusercontent.com/qinghe-zy/Pixory/main/docs/announcement.json');
  assert.equal(announcementConfig.timeoutMs, 5000);
  assert.equal(announcementJson.enabled, true);
  assert.equal(typeof announcementJson.id, 'string');
  assert.ok(announcementJson.id.length > 0);
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

test('announcement check service stays read-only and offline tolerant', () => {
  const serviceSource = readProjectFile('src/services/announcementService.ts');

  assert.match(serviceSource, /Constants\.expoConfig\?\.extra/);
  assert.match(serviceSource, /fetchWithTimeout/);
  assert.match(serviceSource, /cache:\s*'no-store'/);
  assert.match(serviceSource, /catch\s*\{\s*return null;\s*\}/);
  assert.match(serviceSource, /normalizeRemoteAnnouncement/);
  assert.doesNotMatch(serviceSource, /POST|PUT|PATCH|DELETE|SecureStore|SQLite|FileSystem/);
});

test('App shows update and announcement prompts without adding push notification behavior', () => {
  const appSource = readProjectFile('App.tsx');
  const packageJson = JSON.parse(readProjectFile('package.json'));
  const settingsRepositorySource = readProjectFile('src/database/repositories/settingsRepository.ts');

  assert.equal(packageJson.dependencies['expo-constants'], '~18.0.13');
  assert.match(appSource, /checkForAppUpdate\(\)/);
  assert.match(appSource, /setAvailableUpdate\(updateInfo\)/);
  assert.match(appSource, /function checkRemoteNotices/);
  assert.match(appSource, /void checkRemoteNotices\(\(\) => isMounted\)/);
  assert.match(appSource, /nextState === 'active'[\s\S]{0,700}void checkRemoteNotices\(\)/);
  assert.match(appSource, /<AppDialog[\s\S]{0,500}primaryLabel="去更新"/);
  assert.match(appSource, /<AppDialog[\s\S]{0,500}actionLayout="primaryThenSplit"/);
  assert.match(appSource, /<AppDialog[\s\S]{0,500}backgroundVariant="home"/);
  assert.match(appSource, /<AppDialog[\s\S]{0,500}compactActions/);
  assert.match(appSource, /tertiaryLabel="跳过此版本"/);
  assert.match(appSource, /setSkippedUpdateVersionKey/);
  assert.match(appSource, /checkForRemoteAnnouncement\(\)/);
  assert.match(appSource, /setAvailableAnnouncement\(announcement\)/);
  assert.match(appSource, /setDismissedAnnouncementId/);
  assert.match(appSource, /visible=\{Boolean\(availableAnnouncement\) && !availableUpdate\}/);
  assert.match(appSource, /Linking\.openURL\(downloadUrl\)/);
  assert.match(settingsRepositorySource, /SKIPPED_UPDATE_VERSION_KEY/);
  assert.match(settingsRepositorySource, /DISMISSED_ANNOUNCEMENT_ID_KEY/);
  assert.doesNotMatch(appSource, /Notifications|expo-notifications|getExpoPushToken|FCM|pushToken/);
});

test('update prompt uses compact themed split action layout', () => {
  const dialogSource = readProjectFile('src/components/AppDialog.tsx');
  const primaryButtonSource = readProjectFile('src/components/PrimaryButton.tsx');

  assert.match(dialogSource, /actionLayout\?: 'stack' \| 'primaryThenSplit'/);
  assert.match(dialogSource, /splitSecondaryActions/);
  assert.match(dialogSource, /secondaryActionRow/);
  assert.match(dialogSource, /backgroundVariant\?: PageBackgroundVariant/);
  assert.match(dialogSource, /pageBackgroundImages\[backgroundVariant\]/);
  assert.match(primaryButtonSource, /compact\?: boolean/);
  assert.match(primaryButtonSource, /Math\.round\(componentTokens\.primaryButton\.height \* 0\.7\)/);
});
