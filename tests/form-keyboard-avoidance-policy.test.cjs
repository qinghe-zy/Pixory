const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const KEYBOARD_AWARE_FORM_SCREENS = [
  'src/screens/CreateGroupScreen.tsx',
  'src/screens/EditGroupScreen.tsx',
  'src/screens/AiRoleCardEditorScreen.tsx',
  'src/voice/ui/VoiceSettingsScreen.tsx',
];

const KEYBOARD_CONTROLLER_MODALS_AND_SCREENS = [
  'src/components/AppDialog.tsx',
  'src/components/PersonalUnlockModal.tsx',
  'src/components/RecoveryKeyModal.tsx',
  'src/components/common/DocumentExportModal.tsx',
  'src/screens/PasswordAndSecurityScreen.tsx',
  'src/screens/AiChatSearchScreen.tsx',
  'src/voice/ui/VoicePresetEditorSheet.tsx',
  'src/voice/ui/WeChatVoiceRecordHud.tsx',
  'src/im/components/modals/ImPromptModal.tsx',
  'src/im/components/modals/ImCustomBubbleColorModal.tsx',
  'src/im/components/modals/ImCompanionMemoryModal.tsx',
];

test('AppScreen scrollable uses KeyboardAwareScrollView without double-wrapping non-scrollable Android screens', () => {
  const appScreen = read('src/components/AppScreen.tsx');
  assert.match(appScreen, /from 'react-native-keyboard-controller'/);
  assert.match(appScreen, /KeyboardAwareScrollView/);
  assert.match(appScreen, /keyboardAware\?: boolean/);
  assert.match(appScreen, /Platform\.OS === 'ios' && \(!scrollable \|\| !keyboardAware\)/);
  assert.doesNotMatch(appScreen, /Platform\.OS === 'ios' \? 'padding' : undefined/);
});

test('Standalone form screens use KeyboardAwareScrollView for Android adjustNothing compatibility', () => {
  for (const relPath of KEYBOARD_AWARE_FORM_SCREENS) {
    const content = read(relPath);
    assert.match(content, /from 'react-native-keyboard-controller'/, `${relPath} must import from react-native-keyboard-controller`);
    assert.match(content, /<KeyboardAwareScrollView\b/, `${relPath} must use KeyboardAwareScrollView`);
    assert.doesNotMatch(content, /Platform\.OS === 'ios' \? 'padding' : undefined/, `${relPath} must not disable KeyboardAvoidingView on Android`);
  }
});

test('AiProviderSettingsScreen avoids double keyboard padding around scrollable AiLightScaffold', () => {
  const providerSettings = read('src/screens/AiProviderSettingsScreen.tsx');
  assert.doesNotMatch(providerSettings, /<KeyboardAvoidingView\b/);
  assert.match(providerSettings, /<AiLightScaffold[\s\S]{0,200}scrollable/);
});

test('Dialogs and input modals use react-native-keyboard-controller KeyboardAvoidingView with padding on Android', () => {
  for (const relPath of KEYBOARD_CONTROLLER_MODALS_AND_SCREENS) {
    const content = read(relPath);
    assert.match(
      content,
      /import\s*\{[^}]*KeyboardAvoidingView[^}]*\}\s*from\s*['"]react-native-keyboard-controller['"]/,
      `${relPath} must import KeyboardAvoidingView from react-native-keyboard-controller`
    );
    assert.match(content, /<KeyboardAvoidingView[\s\S]{0,160}behavior="padding"/, `${relPath} must use behavior="padding" across platforms`);
    assert.doesNotMatch(
      content,
      /behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/,
      `${relPath} must not set behavior to undefined on Android`
    );
  }
});

test('CreateGroupScreen and EditGroupScreen provide input placeholder, keyboard dismiss, and loading/error feedback', () => {
  const createGroup = read('src/screens/CreateGroupScreen.tsx');
  const editGroup = read('src/screens/EditGroupScreen.tsx');
  const searchScreen = read('src/screens/AiChatSearchScreen.tsx');
  const voiceSheet = read('src/voice/ui/VoicePresetEditorSheet.tsx');
  const bubbleColorModal = read('src/im/components/modals/ImCustomBubbleColorModal.tsx');

  for (const [name, source] of [
    ['CreateGroupScreen', createGroup],
    ['EditGroupScreen', editGroup],
  ]) {
    assert.match(source, /Keyboard\.dismiss\(\)/, `${name} should dismiss keyboard on submit`);
    assert.doesNotMatch(source, /placeholder=""/, `${name} custom type input should have a helpful placeholder`);
    assert.match(source, /keyboardDismissMode=/, `${name} should allow dismissing keyboard on drag`);
    assert.match(source, /handleSelectType/, `${name} should clear submit error on type selection`);
  }

  assert.match(editGroup, /isLoading && !group/, 'EditGroupScreen should render loading feedback');
  assert.match(editGroup, /onPress=\{reload\}/, 'EditGroupScreen should provide retry recovery on load error');
  assert.match(editGroup, /\{group \? \(/, 'EditGroupScreen should gate form rendering on loaded group');
  assert.match(searchScreen, /enabled=\{Platform\.OS === 'android'\}/, 'AiChatSearchScreen should avoid double KeyboardAvoidingView on iOS');
  assert.match(voiceSheet, /content:\s*\{[\s\S]*flexShrink:\s*1/, 'VoicePresetEditorSheet scroll content must shrink when keyboard opens');
  assert.match(bubbleColorModal, /<ScrollView[\s\S]*style=\{styles\.bodyScroll\}/, 'ImCustomBubbleColorModal should scroll on small viewports');
});
