const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Voice switch unification and removal of 伴侣 text', () => {
  // 1. VoicePresetPicker checks
  const pickerPath = path.resolve(__dirname, '../src/voice/ui/VoicePresetPicker.tsx');
  const pickerCode = fs.readFileSync(pickerPath, 'utf8');

  assert.ok(
    pickerCode.includes('允许发送拟真语音条'),
    'VoicePresetPicker must use "允许发送拟真语音条"'
  );
  assert.strictEqual(
    pickerCode.includes('允许伴侣发送拟真语音条'),
    false,
    'VoicePresetPicker must NOT contain "允许伴侣发送拟真语音条"'
  );
  assert.strictEqual(
    pickerCode.includes('开启后伴侣在道晚安'),
    false,
    'VoicePresetPicker description must NOT contain "开启后伴侣在道晚安"'
  );
  assert.ok(
    pickerCode.includes('voiceBubbleEnabled: controlledVoiceBubbleEnabled'),
    'VoicePresetPicker must support controlled voiceBubbleEnabled prop'
  );
  assert.ok(
    pickerCode.includes('onToggleVoiceBubble: controlledOnToggleVoiceBubble'),
    'VoicePresetPicker must support controlled onToggleVoiceBubble prop'
  );

  // 2. ImCompanionPersonaModal checks
  const personaPath = path.resolve(__dirname, '../src/im/components/modals/ImCompanionPersonaModal.tsx');
  const personaCode = fs.readFileSync(personaPath, 'utf8');

  assert.ok(
    personaCode.includes('专属音色与语音条'),
    'ImCompanionPersonaModal must contain section title "专属音色与语音条"'
  );
  assert.strictEqual(
    personaCode.includes('伴侣专属音色与语音条'),
    false,
    'ImCompanionPersonaModal must NOT contain "伴侣专属音色与语音条"'
  );
  assert.ok(
    personaCode.includes('voiceBubbleEnabled={settings.voiceReplyEnabled !== false}'),
    'ImCompanionPersonaModal must pass unified voiceReplyEnabled to VoicePresetPicker'
  );
  assert.ok(
    personaCode.includes('onUpdateSettings({ voiceReplyEnabled: val })'),
    'ImCompanionPersonaModal must trigger unified onUpdateSettings on toggle'
  );

  // 3. ImChatSettingsDrawer checks
  const drawerPath = path.resolve(__dirname, '../src/im/components/drawer/ImChatSettingsDrawer.tsx');
  const drawerCode = fs.readFileSync(drawerPath, 'utf8');

  assert.ok(
    drawerCode.includes('title="允许模型回复语音"'),
    'ImChatSettingsDrawer must have voiceReply switch'
  );
  assert.ok(
    drawerCode.includes('voiceReplyEnabled: val'),
    'ImChatSettingsDrawer must update voiceReplyEnabled'
  );

  // 4. Persistence synchronization checks in imSettingsRepository
  const repoPath = path.resolve(__dirname, '../src/im/repository/imSettingsRepository.ts');
  const repoCode = fs.readFileSync(repoPath, 'utf8');

  assert.ok(
    repoCode.includes('voiceRepository.setBinding') && repoCode.includes('voiceBubbleEnabled: settings.voiceReplyEnabled'),
    'updateImThreadSettings must sync voice_bindings table with voiceReplyEnabled'
  );
  assert.ok(
    repoCode.includes('UPDATE voice_bindings') && repoCode.includes('SET voice_bubble_enabled'),
    'setVoiceReplyEnabledForAll must sync voice_bindings table for all thread_im scopes'
  );

  // 5. Persistence synchronization in voiceRepository
  const voiceRepoPath = path.resolve(__dirname, '../src/database/repositories/voiceRepository.ts');
  const voiceRepoCode = fs.readFileSync(voiceRepoPath, 'utf8');

  assert.ok(
    voiceRepoCode.includes("binding.scopeType === 'thread_im'") &&
    voiceRepoCode.includes('parsed.voiceReplyEnabled = targetBool'),
    'voiceRepository.setBinding must sync ai_threads.im_settings_json.voiceReplyEnabled'
  );

  // 6. Check UI texts in related screens
  const voiceSettingsPath = path.resolve(__dirname, '../src/voice/ui/VoiceSettingsScreen.tsx');
  const voiceSettingsCode = fs.readFileSync(voiceSettingsPath, 'utf8');
  assert.strictEqual(
    voiceSettingsCode.includes('伴侣在关键情境可发送微信同款长短语音条'),
    false,
    'VoiceSettingsScreen must NOT contain "伴侣在关键情境可发送微信同款长短语音条"'
  );

  const companionSettingsPath = path.resolve(__dirname, '../src/im/screens/ImCompanionSettingsScreen.tsx');
  const companionSettingsCode = fs.readFileSync(companionSettingsPath, 'utf8');
  assert.strictEqual(
    companionSettingsCode.includes('伴侣将在日常交流中按需发送微信拟真语音条'),
    false,
    'ImCompanionSettingsScreen must NOT contain "伴侣将在日常交流中按需发送微信拟真语音条"'
  );
  assert.strictEqual(
    companionSettingsCode.includes('默认允许伴侣在聊天中发送微信拟真语音条'),
    false,
    'ImCompanionSettingsScreen must NOT contain "默认允许伴侣在聊天中发送微信拟真语音条"'
  );

  const homeScreenPath = path.resolve(__dirname, '../src/im/screens/ImHomeScreen.tsx');
  const homeScreenCode = fs.readFileSync(homeScreenPath, 'utf8');
  assert.strictEqual(
    homeScreenCode.includes('accessibilityLabel="添加伴侣角色"'),
    false,
    'ImHomeScreen must NOT contain "添加伴侣角色"'
  );
  assert.strictEqual(
    homeScreenCode.includes('emptyHintText="有头像的伴侣角色会显示在这里"'),
    false,
    'ImHomeScreen must NOT contain "有头像的伴侣角色会显示在这里"'
  );
});
