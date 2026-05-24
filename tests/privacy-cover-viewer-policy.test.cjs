const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('personal mode uses a 60 second background grace period without resetting normal routes', () => {
  const appSource = readProjectFile('App.tsx');

  assert.match(appSource, /PERSONAL_BACKGROUND_LOCK_GRACE_MS\s*=\s*60\s*\*\s*1000/);
  assert.match(appSource, /backgroundLockTimerRef/);
  assert.match(appSource, /setTimeout\([\s\S]{0,500}lockPersonalSpace\('background'\)[\s\S]{0,120}PERSONAL_BACKGROUND_LOCK_GRACE_MS/);
  assert.match(appSource, /clearPendingPersonalBackgroundLock/);
  assert.match(appSource, /nextState === 'active'[\s\S]{0,500}clearPendingPersonalBackgroundLock/);
  assert.doesNotMatch(appSource, /if \(nextState !== 'active'\) \{\s*setPrivacyShieldVisible\(true\);\s*void lockPersonalSpace\('background'\);/);
  assert.doesNotMatch(appSource, /function lockPersonalSpace\(reason:\s*PersonalLockReason\)[\s\S]{0,700}setRouteStack\(\[INITIAL_ROUTE\]\)/);
});

test('personal password is a lightweight v2 single digest gate', () => {
  const serviceSource = readProjectFile('src/services/personalSystemService.ts');

  assert.match(serviceSource, /PERSONAL_CREDENTIAL_VERSION\s*=\s*2/);
  assert.match(serviceSource, /hashPersonalSecret/);
  assert.match(serviceSource, /Crypto\.digestStringAsync\(Crypto\.CryptoDigestAlgorithm\.SHA256/);
  assert.doesNotMatch(serviceSource, /PERSONAL_KDF_ITERATIONS\s*=\s*120000/);
  assert.doesNotMatch(serviceSource, /for \(let index = 0; index < iterations; index \+= 1\)/);
  assert.doesNotMatch(serviceSource, /verifyPersonalPassword[\s\S]{0,1800}initDatabase\('personal'\)/);
  assert.match(serviceSource, /隐私密码格式已更新，请重置隐私空间/);
});

test('IP cover metadata supports custom cover and personal blur fallback', () => {
  const schemaSource = readProjectFile('src/database/schema.ts');
  const typesSource = readProjectFile('src/database/types.ts');
  const ipRepositorySource = readProjectFile('src/database/repositories/ipRepository.ts');
  const secureImageSource = readProjectFile('src/components/SecureImage.tsx');

  assert.match(schemaSource, /DATABASE_VERSION = 27/);
  assert.match(schemaSource, /ALTER TABLE ips ADD COLUMN coverImageAssetId INTEGER/);
  assert.match(schemaSource, /ALTER TABLE ips ADD COLUMN coverBlurEnabled INTEGER/);
  assert.match(schemaSource, /ALTER TABLE ips ADD COLUMN coverBlurRadius INTEGER/);
  assert.match(typesSource, /coverImageAssetId: number \| null/);
  assert.match(typesSource, /coverBlurEnabled: boolean \| null/);
  assert.match(typesSource, /coverBlurRadius: number \| null/);
  assert.match(typesSource, /coverSource: 'custom' \| 'default'/);
  assert.match(ipRepositorySource, /customCover/);
  assert.match(ipRepositorySource, /defaultCover/);
  assert.match(ipRepositorySource, /setCoverImage/);
  assert.match(ipRepositorySource, /setCoverBlurEnabled/);
  assert.match(ipRepositorySource, /setCoverBlurRadius/);
  assert.match(ipRepositorySource, /clearCoverImage/);
  assert.match(secureImageSource, /blurRadius\?: number/);
});

test('personal cover blur is lighter and group covers support manual selection', () => {
  const schemaSource = readProjectFile('src/database/schema.ts');
  const typesSource = readProjectFile('src/database/types.ts');
  const groupRepositorySource = readProjectFile('src/database/repositories/groupRepository.ts');
  const ipCardSource = readProjectFile('src/components/IPCard.tsx');
  const privacyConstantsSource = readProjectFile('src/constants/privacy.ts');
  const ipDetailSource = readProjectFile('src/screens/IpDetailScreen.tsx');
  const groupOverviewSource = readProjectFile('src/screens/GroupOverviewScreen.tsx');
  const globalGroupsSource = readProjectFile('src/screens/GlobalGroupsScreen.tsx');
  const groupCoverPickerSource = readProjectFile('src/screens/GroupCoverPickerScreen.tsx');
  const appSource = readProjectFile('App.tsx');

  assert.match(schemaSource, /ALTER TABLE groups ADD COLUMN coverImageAssetId INTEGER/);
  assert.match(typesSource, /coverImageAssetId: number \| null/);
  assert.match(groupRepositorySource, /setCoverImage/);
  assert.match(groupRepositorySource, /clearCoverImage/);
  assert.match(groupRepositorySource, /customCover/);
  assert.match(privacyConstantsSource, /PERSONAL_COVER_BLUR_RADIUS\s*=\s*6/);
  assert.match(ipCardSource, /resolvePersonalCoverBlurRadius/);
  assert.match(ipDetailSource, /PERSONAL_COVER_BLUR_OPTIONS/);
  assert.match(ipDetailSource, /handleCoverBlurRadiusChange/);
  assert.match(ipDetailSource, /resolvePersonalCoverBlurRadius/);
  assert.match(groupOverviewSource, /blurRadius=\{groupCoverBlurRadius\}/);
  assert.match(globalGroupsSource, /blurRadius=\{getGroupCoverBlurRadius\(group\)\}/);
  assert.match(groupCoverPickerSource, /选择分组封面/);
  assert.match(groupCoverPickerSource, /使用系统默认封面/);
  assert.match(appSource, /group-cover-picker/);
});

test('recent viewed count uses lastViewedAt rather than active image count', () => {
  const imageRepositorySource = readProjectFile('src/database/repositories/imageRepository.ts');
  const meSource = readProjectFile('src/screens/MeScreen.tsx');

  assert.match(imageRepositorySource, /countRecentViewed/);
  assert.match(imageRepositorySource, /lastViewedAt IS NOT NULL/);
  assert.match(meSource, /recentViewedCount/);
  assert.match(meSource, /imageRepository\.countRecentViewed/);
  assert.doesNotMatch(meSource, /item\.key === 'recent'\s*\?\s*data\?\.activeImageCount/);
});

test('batch rule mode replaces mutually exclusive rule groups', () => {
  const rulesSource = readProjectFile('src/utils/batchSelectionRules.ts');
  const batchSource = readProjectFile('src/screens/BatchManageImagesScreen.tsx');

  assert.match(rulesSource, /BATCH_SELECTION_RULE_MUTEX_GROUPS/);
  assert.match(rulesSource, /normalizeSelectionRuleKeys/);
  assert.match(rulesSource, /'landscape'[\s\S]{0,120}'portrait'[\s\S]{0,120}'square'[\s\S]{0,120}'panorama'/);
  assert.match(rulesSource, /'large'[\s\S]{0,80}'small'/);
  assert.match(batchSource, /normalizeSelectionRuleKeys/);
});

test('image viewer supports zoom gestures and reverse order', () => {
  const viewerSource = readProjectFile('src/screens/ImageViewerScreen.tsx');

  assert.match(viewerSource, /function ZoomableImage/);
  assert.match(viewerSource, /onTouchStart/);
  assert.match(viewerSource, /lastTapAtRef/);
  assert.match(viewerSource, /DOUBLE_TAP_ZOOM_SCALE/);
  assert.match(viewerSource, /scrollEnabled=\{isPagingEnabled\}/);
  assert.match(viewerSource, /handleReverseOrder/);
  assert.match(viewerSource, /swap-horizontal-outline/);
});
