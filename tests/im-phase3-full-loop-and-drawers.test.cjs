const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('IM Phase 3 Full Loop and Drawers Verification', async (t) => {
  const stagePath = path.resolve(__dirname, '../src/im/components/drawer/ImPushScaleDrawerStage.tsx');
  const contactDrawerPath = path.resolve(__dirname, '../src/im/components/drawer/ImContactDrawer.tsx');
  const settingsDrawerPath = path.resolve(__dirname, '../src/im/components/drawer/ImChatSettingsDrawer.tsx');
  const chatScreenPath = path.resolve(__dirname, '../src/im/screens/ImChatScreen.tsx');
  const companionSettingsPath = path.resolve(__dirname, '../src/im/screens/ImCompanionSettingsScreen.tsx');
  const pacingConfigPath = path.resolve(__dirname, '../src/im/config/pacingProfile.ts');

  const stageContent = fs.readFileSync(stagePath, 'utf8');
  const contactDrawerContent = fs.readFileSync(contactDrawerPath, 'utf8');
  const settingsDrawerContent = fs.readFileSync(settingsDrawerPath, 'utf8');
  const chatScreenContent = fs.readFileSync(chatScreenPath, 'utf8');
  const companionSettingsContent = fs.readFileSync(companionSettingsPath, 'utf8');
  const pacingConfigContent = fs.readFileSync(pacingConfigPath, 'utf8');

  await t.test('ImPushScaleDrawerStage reproduces 1:1 Push & Scale long chat texture and dual-mode switch', () => {
    assert.match(stageContent, /#E7EAF0/);
    assert.match(stageContent, /SCALE_TARGET = 0\.9/);
    assert.match(stageContent, /TARGET_BORDER_RADIUS = 28/);
    assert.match(stageContent, /sidebarMode\?: 'push_scale' \| 'classic'/);
    assert.match(stageContent, /mainCardShadow/);
  });

  await t.test('ImContactDrawer renders contacts list with avatar, last chat preview, and new/import buttons', () => {
    assert.match(contactDrawerContent, /伴侣通讯录/);
    assert.match(contactDrawerContent, /onNewRole/);
    assert.match(contactDrawerContent, /onImportRole/);
    assert.match(contactDrawerContent, /onSelectCompanion/);
    assert.match(contactDrawerContent, /lastMessagePreview/);
  });

  await t.test('ImChatSettingsDrawer provides full-bleed grouped settings without modal actionsheets', () => {
    assert.match(settingsDrawerContent, /onPickAvatarFromAlbum/);
    assert.match(settingsDrawerContent, /onPickAvatarFromIp/);
    assert.match(settingsDrawerContent, /onClearAvatar/);
    assert.match(settingsDrawerContent, /onPickBackgroundFromAlbum/);
    assert.match(settingsDrawerContent, /onPickBackgroundFromIp/);
    assert.match(settingsDrawerContent, /onClearBackground/);
    assert.match(settingsDrawerContent, /onOpenModelPicker/);
    assert.match(settingsDrawerContent, /contextWindowN/);
    assert.match(settingsDrawerContent, /heartbeatEnabled/);
    assert.match(settingsDrawerContent, /proactiveEnabled/);
    assert.match(settingsDrawerContent, /onEditNudgeText/);
    assert.match(settingsDrawerContent, /onNudge/);
    assert.match(settingsDrawerContent, /onOpenSearch/);
    assert.match(settingsDrawerContent, /onExportHistory/);
    assert.match(settingsDrawerContent, /onImportHistory/);
    assert.match(settingsDrawerContent, /onClearHistory/);
  });

  await t.test('ImChatScreen line count is strictly constrained under 150 lines', () => {
    const lines = chatScreenContent.split('\n').length;
    assert.ok(lines < 150, `ImChatScreen has ${lines} lines, expected < 150`);
  });

  await t.test('ImCompanionSettingsScreen provides global pacing, heartbeat, and send debounce controls', () => {
    assert.match(companionSettingsContent, /伴聊设置/);
    assert.match(companionSettingsContent, /主动关怀/);
    assert.match(companionSettingsContent, /间隔延时/);
    assert.match(companionSettingsContent, /发送请求等待时间/);
    assert.match(pacingConfigContent, /intervalMode/);
    assert.match(pacingConfigContent, /debounceWaitSec/);
  });

  await t.test('VisibilityTicker and imSettingsRepository enforce idle lifecycle and export visible filtering', () => {
    const repoPath = path.resolve(__dirname, '../src/im/repository/imSettingsRepository.ts');
    const dispatcherPath = path.resolve(__dirname, '../src/im/engine/burstDispatcher.ts');
    const repoContent = fs.readFileSync(repoPath, 'utf8');
    const dispatcherContent = fs.readFileSync(dispatcherPath, 'utf8');

    assert.match(repoContent, /visible_at IS NULL OR visible_at <= \?/);
    assert.match(dispatcherContent, /subscribeIdle/);
    assert.match(dispatcherContent, /isRevealing/);
  });
});
