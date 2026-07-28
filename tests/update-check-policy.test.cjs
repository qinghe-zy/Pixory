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
  assert.equal(updateConfig.url, 'https://mist01.com/update-version.json');
  assert.equal(updateConfig.githubLatestUrl, 'https://api.github.com/repos/qinghe-zy/Pixory/releases/latest');
  assert.equal(updateConfig.fallbackDownloadUrl, 'https://mist01.com/#download');
  assert.equal(updateConfig.timeoutMs, 5000);
});

test('EAS Update is configured for production OTA bundles', () => {
  const appConfig = JSON.parse(readProjectFile('app.json'));
  const packageJson = JSON.parse(readProjectFile('package.json'));
  const easConfig = JSON.parse(readProjectFile('eas.json'));
  const androidStrings = readProjectFile('android/app/src/main/res/values/strings.xml');
  const nativeRuntimeVersion = androidStrings.match(/<string name="expo_runtime_version"(?: translatable="false")?>([^<]+)<\/string>/)?.[1];

  assert.equal(packageJson.dependencies['expo-updates'], '~29.0.18');
  assert.equal(appConfig.expo.runtimeVersion, packageJson.version);
  assert.equal(appConfig.expo.runtimeVersion, nativeRuntimeVersion);
  assert.equal(appConfig.expo.updates.enabled, true);
  assert.equal(appConfig.expo.updates.url, 'https://u.expo.dev/f9528887-4f8b-451d-a851-aa1a45e9abae');
  assert.equal(appConfig.expo.updates.checkAutomatically, 'NEVER');
  assert.equal(appConfig.expo.updates.fallbackToCacheTimeout, 0);
  assert.equal(appConfig.expo.updates.requestHeaders['expo-channel-name'], 'production');
  assert.equal(easConfig.build['release-apk'].channel, 'production');
});

test('announcement check is configured as a passive remote notice lookup', () => {
  const appConfig = JSON.parse(readProjectFile('app.json'));
  const announcementConfig = appConfig.expo.extra.announcement;
  const announcementJson = JSON.parse(readProjectFile('docs/announcement.json'));

  assert.equal(announcementConfig.enabled, true);
  assert.equal(announcementConfig.url, 'https://mist01.com/announcement.json');
  assert.equal(announcementConfig.timeoutMs, 5000);
  assert.equal(announcementJson.enabled, true);
  assert.equal(typeof announcementJson.id, 'string');
  assert.ok(announcementJson.id.length > 0);
});

test('update prompt defaults to the official website download section', () => {
  const updateJson = JSON.parse(readProjectFile('docs/update-version.json'));
  const appConfig = JSON.parse(readProjectFile('app.json'));

  assert.equal(appConfig.expo.extra.updateCheck.url, 'https://mist01.com/update-version.json');
  assert.equal(appConfig.expo.extra.updateCheck.githubLatestUrl, 'https://api.github.com/repos/qinghe-zy/Pixory/releases/latest');
  assert.equal(appConfig.expo.extra.updateCheck.fallbackDownloadUrl, 'https://mist01.com/#download');
  assert.equal(appConfig.expo.extra.announcement.url, 'https://mist01.com/announcement.json');
  assert.equal(updateJson.downloadUrl, 'https://mist01.com/#download');
  assert.match(updateJson.message, /官网下载区/);
});

test('update check service stays read-only and offline tolerant', () => {
  const serviceSource = readProjectFile('src/services/updateCheckService.ts');

  assert.match(serviceSource, /Constants\.expoConfig\?\.extra/);
  assert.match(serviceSource, /fetchWithTimeout/);
  assert.match(serviceSource, /cache:\s*'no-store'/);
  assert.match(serviceSource, /catch\s*\{\s*return null;\s*\}/);
  assert.match(serviceSource, /compareAppVersions/);
  assert.match(serviceSource, /githubLatestUrl/);
  assert.match(serviceSource, /normalizeGitHubRelease/);
  assert.match(serviceSource, /tag_name/);
  assert.match(serviceSource, /fallbackDownloadUrl/);
  assert.doesNotMatch(serviceSource, /releaseNotes[\s\S]{0,260}\.slice\(/);
  assert.doesNotMatch(serviceSource, /POST|PUT|PATCH|DELETE|SecureStore|SQLite|FileSystem/);
});

test('update check fallback version code matches the Android app version code', () => {
  const appConfig = JSON.parse(readProjectFile('app.json'));
  const serviceSource = readProjectFile('src/services/updateCheckService.ts');
  const fallbackMatch = serviceSource.match(/FALLBACK_CURRENT_VERSION_CODE\s*=\s*(\d+)/);

  assert.ok(fallbackMatch, 'update check service must declare a numeric fallback version code');
  assert.equal(Number(fallbackMatch[1]), appConfig.expo.android.versionCode);
});

test('update prompt does not use versionCode to promote the same visible version', () => {
  const serviceSource = readProjectFile('src/services/updateCheckService.ts');

  assert.match(serviceSource, /const versionComparison = compareAppVersions\(remote\.version, current\.version\);/);
  assert.match(serviceSource, /if \(versionComparison !== 0\) \{\s*return versionComparison > 0;\s*\}/);
  assert.doesNotMatch(serviceSource, /remote\.versionCode > current\.versionCode/);
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

test('App shows a small one-time toast after an OTA update has been applied', () => {
  const appSource = readProjectFile('App.tsx');
  const settingsRepositorySource = readProjectFile('src/database/repositories/settingsRepository.ts');

  assert.match(appSource, /import \* as Updates from 'expo-updates'/);
  assert.match(appSource, /function AppUpdateAppliedNotice/);
  assert.match(appSource, /Updates\.isEnabled/);
  assert.match(appSource, /Updates\.isEmbeddedLaunch/);
  assert.match(appSource, /Updates\.updateId/);
  assert.match(appSource, /getLastAppliedUpdateNoticeId/);
  assert.match(appSource, /setLastAppliedUpdateNoticeId/);
  assert.match(appSource, /message:\s*'已在后台热更新'/);
  assert.match(appSource, /<AppUpdateAppliedNotice isReady=\{isReady\} \/>/);
  assert.match(settingsRepositorySource, /LAST_APPLIED_UPDATE_NOTICE_ID_KEY/);
  assert.match(settingsRepositorySource, /getLastAppliedUpdateNoticeId/);
  assert.match(settingsRepositorySource, /setLastAppliedUpdateNoticeId/);
});

test('App shows a tiny toast when a production OTA update starts downloading', () => {
  const appSource = readProjectFile('App.tsx');

  assert.match(appSource, /function AppOtaUpdateFetchNotice/);
  assert.match(appSource, /Updates\.checkForUpdateAsync\(\)/);
  assert.match(appSource, /Updates\.fetchUpdateAsync\(\)/);
  assert.match(appSource, /message:\s*'发现热更新，正在后台更新'/);
  assert.match(appSource, /message:\s*'热更新已准备好，下次打开生效'/);
  assert.match(appSource, /<AppOtaUpdateFetchNotice isReady=\{isReady\} \/>/);
  assert.doesNotMatch(appSource, /Updates\.reloadAsync\(/);
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
