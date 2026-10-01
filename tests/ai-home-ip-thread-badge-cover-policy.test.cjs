const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('AiHomeScreen renders delicate IP badge next to thread title for IP-originated chats', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/AiHomeScreen.tsx'), 'utf8');

  // Verify IP badge rendering condition in threadTitleRow
  assert.match(source, /threadTitleWrap/);
  assert.match(source, /thread\.contextType === 'ip' \|\| thread\.boundIpId != null/);
  assert.match(source, /styles\.ipBadge/);
  assert.match(source, /styles\.ipBadgeText/);
  assert.match(source, />IP<\/Text>/);

  // Verify ipBadge styling exists
  assert.match(source, /ipBadge:\s*\{/);
  assert.match(source, /ipBadgeText:\s*\{/);

  // Verify ThreadAvatar uses SecureImage with recyclingKey and fallback
  assert.match(source, /function ThreadAvatar/);
  assert.match(source, /thread\.avatar\.avatarEnabled && thread\.avatar\.avatarUri/);
  assert.match(source, /recyclingKey=\{`\$\{space\}:thread-avatar:\$\{thread\.id\}:\$\{thread\.avatar\.avatarUri\}`\}/);
});

test('aiChatService resolves IP covers dynamically for AI home threads and global thread search', () => {
  const source = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');

  // Verify listAiHomeThreads batches IP covers
  assert.match(source, /ipRepository\.findCoversByIds\(db, ipIds\)/);
  assert.match(source, /isIpThread && ipCover\?\.coverThumbnailFileUri/);

  // Verify searchGlobalThreads also resolves IP covers
  const searchBlock = source.slice(source.indexOf('async function searchGlobalThreads'));
  assert.match(searchBlock, /ipRepository\.findCoversByIds/);
  assert.match(searchBlock, /isIpThread && ipCover\?\.coverThumbnailFileUri/);

  // Verify loadThreadMessageAppearanceConfig supports IP cover fallback
  const appearanceBlock = source.slice(
    source.indexOf('async function loadThreadMessageAppearanceConfig'),
    source.indexOf('async function listAiHistoryThreads')
  );
  assert.match(appearanceBlock, /isIpThread && thread\.boundIpId != null/);
});

test('ipRepository provides findCoversByIds to batch retrieve IP covers', () => {
  const source = fs.readFileSync(path.join(root, 'src/database/repositories/ipRepository.ts'), 'utf8');

  assert.match(source, /findCoversByIds\(/);
  assert.match(source, /SELECT\s+ips\.id,\s+ips\.name,/);
  assert.match(source, /customCover\.id = ips\.coverImageAssetId/);
  assert.match(source, /defaultCover\.ipId = ips\.id/);
});

test('App.tsx synchronizes AI home data when library / IP covers are updated', () => {
  const source = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');

  const refreshBlock = source.slice(
    source.indexOf('function refreshLibrary()'),
    source.indexOf('function resetHome(')
  );
  assert.match(refreshBlock, /setLibraryRefreshToken/);
  assert.match(refreshBlock, /setAiHomeRefreshToken/);
});

test('user custom avatar takes precedence over IP cover updates in aiChatService and AiSessionConfigScreen', () => {
  const serviceSource = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  const screenSource = fs.readFileSync(path.join(root, 'src/screens/AiSessionConfigScreen.tsx'), 'utf8');

  // Verify customAvatar definition and parsing
  assert.match(serviceSource, /customAvatar\?:\s*boolean;/);
  assert.match(serviceSource, /const userHasCustomAvatar = Boolean\(parsedAvatar\.customAvatar && parsedAvatar\.avatarUri\);/);

  // Verify that if user has custom avatar, it does not fallback to IP cover
  assert.match(serviceSource, /if \(!userHasCustomAvatar\) \{\s*if \(isIpThread && ipCover\?\.coverThumbnailFileUri\)/);

  // Verify updateAiThreadSessionConfig handles customAvatar reset
  assert.match(serviceSource, /if \(input\.customAvatar === false\) \{/);
  assert.match(serviceSource, /roleSnapshotPatch\.avatarUri = null;/);

  // Verify AiSessionConfigScreen tracks and persists customAvatar
  assert.match(screenSource, /const \[customAvatar, setCustomAvatar\] = useState\(false\);/);
  assert.match(screenSource, /setCustomAvatar\(Boolean\(config\.avatar\.customAvatar\)\);/);
  assert.match(screenSource, /setCustomAvatar\(Boolean\(uri\)\);/);
  assert.match(screenSource, /customAvatar,/);
});

