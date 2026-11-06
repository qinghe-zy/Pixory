const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Voice system: fetch voices, card horn audition, rename persistence & drawer dedup', async () => {
  // 1. Verify openAiCompatEngine exports fetchVoicesFromEndpoint and handles provider mappings
  const enginePath = path.resolve(__dirname, '../src/voice/engines/openAiCompatEngine.ts');
  const engineCode = fs.readFileSync(enginePath, 'utf8');

  assert.ok(engineCode.includes('fetchVoicesFromEndpoint'), 'Must export fetchVoicesFromEndpoint');
  assert.ok(engineCode.includes('KNOWN_PROVIDER_VOICES'), 'Must define known provider voices catalog');
  assert.ok(engineCode.includes('冰糖') && engineCode.includes('茉莉') && engineCode.includes('苏打') && engineCode.includes('白桦'), 'MiMo voices mapped');
  assert.ok(engineCode.includes('alloy') && engineCode.includes('echo') && engineCode.includes('nova'), 'OpenAI voices mapped');
  assert.ok(engineCode.includes('alex') && engineCode.includes('benjamin'), 'SiliconFlow voices mapped');
  assert.ok(engineCode.includes('female-tianmei'), 'MiniMax voices mapped');

  // 2. Verify fallbackChain completely removes dead builtin_free Edge-TTS proxy
  const fallbackPath = path.resolve(__dirname, '../src/voice/fallbackChain.ts');
  const fallbackCode = fs.readFileSync(fallbackPath, 'utf8');
  assert.strictEqual(fallbackCode.includes('builtinFreeEngine'), false, 'Dead builtinFreeEngine must be removed from fallback chain');
  assert.strictEqual(fallbackCode.includes('tts.shunzi.tech'), false, 'Dead proxy must not exist');

  // 3. Verify VoicePresetPicker card horn audition & rename/edit capabilities
  const pickerPath = path.resolve(__dirname, '../src/voice/ui/VoicePresetPicker.tsx');
  const pickerCode = fs.readFileSync(pickerPath, 'utf8');
  assert.ok(pickerCode.includes('hornBtn'), 'Must have horn button on preset cards for direct preview');
  assert.ok(pickerCode.includes('volume-medium-outline'), 'Must have speaker horn icon');
  assert.ok(pickerCode.includes('create-outline'), 'Must have edit/rename icon for custom presets');

  // 4. Verify VoiceSettingsScreen card horn audition, fetch voices button, and save-as-new rename dialog
  const settingsPath = path.resolve(__dirname, '../src/voice/ui/VoiceSettingsScreen.tsx');
  const settingsCode = fs.readFileSync(settingsPath, 'utf8');
  assert.ok(settingsCode.includes('handleTogglePlayCard'), 'Must support card-level speaker horn playback');
  assert.ok(settingsCode.includes('拉取音色'), 'Must have 拉取音色 button for custom API');
  assert.ok(settingsCode.includes('另存为新预设'), 'Must have 另存为新预设 action');
  assert.ok(settingsCode.includes('saveAsNewModalVisible'), 'Must support save-as-new rename modal');
  assert.ok(settingsCode.includes('支持自定义重命名'), 'Must allow user custom renaming');

  // 5. Verify ImChatSettingsDrawer removes duplicated "声音与专属音色" row
  const drawerPath = path.resolve(__dirname, '../src/im/components/drawer/ImChatSettingsDrawer.tsx');
  const drawerCode = fs.readFileSync(drawerPath, 'utf8');
  assert.strictEqual(drawerCode.includes('title="声音与专属音色"'), false, 'Duplicated voice row must be removed from drawer');
  assert.ok(drawerCode.includes('专属相处定制'), 'Persona modal entry card must remain intact');

  // 6. Architecture Gate: ImChatScreen.tsx <= 150 lines
  const chatScreenPath = path.resolve(__dirname, '../src/im/screens/ImChatScreen.tsx');
  const chatScreenLines = fs.readFileSync(chatScreenPath, 'utf8').split('\n').length;
  assert.ok(chatScreenLines <= 150, `ImChatScreen.tsx line count (${chatScreenLines}) must be <= 150 lines`);

  // 7. Full CRUD: Verify VoicePresetEditorSheet and VoicePresetPicker support onDelete
  const sheetPath = path.resolve(__dirname, '../src/voice/ui/VoicePresetEditorSheet.tsx');
  const sheetCode = fs.readFileSync(sheetPath, 'utf8');
  assert.ok(sheetCode.includes('onDelete'), 'Must support onDelete callback');
  assert.ok(sheetCode.includes('trash-outline'), 'Must have delete trash icon button for editing presets');
  assert.ok(pickerCode.includes('handleDeletePreset'), 'Picker must provide handleDeletePreset');
  assert.ok(pickerCode.includes('onDelete={handleDeletePreset}'), 'Picker must pass onDelete to EditorSheet');
});
