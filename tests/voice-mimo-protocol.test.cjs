const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('Xiaomi MiMo v2.5-TTS engine and protocol policy verification', async () => {
  const enginePath = path.resolve(__dirname, '../src/voice/engines/openAiCompatEngine.ts');
  const engineCode = fs.readFileSync(enginePath, 'utf8');

  // 1. Verify Xiaomi MiMo endpoint and chat/completions payload handling
  assert.ok(engineCode.includes('mimo.xiaomi.com') || engineCode.includes('api.xiaomimimo.com'), 'Must reference official Xiaomi MiMo domain');
  assert.ok(engineCode.includes('mimo-v2.5-tts'), 'Must support mimo-v2.5-tts model');
  assert.ok(engineCode.includes('/chat/completions'), 'Must handle /chat/completions endpoint for MiMo');
  assert.ok(engineCode.includes('audio.data'), 'Must extract Base64 audio from choices[0].message.audio.data');

  // 2. Security Redline Check: NO user API key hardcoded in engine or anywhere in git-tracked code
  assert.strictEqual(engineCode.includes('sk-cvqfqe0l'), false, 'CRITICAL: No user API keys may exist in openAiCompatEngine.ts');

  // 3. Builtin Presets check
  const presetsPath = path.resolve(__dirname, '../src/voice/builtinPresets.ts');
  const presetsCode = fs.readFileSync(presetsPath, 'utf8');
  assert.ok(presetsCode.includes('mimo-bingtang'), 'Must include mimo-bingtang preset');
  assert.ok(presetsCode.includes('mimo-moli'), 'Must include mimo-moli preset');
  assert.ok(presetsCode.includes('mimo-suda'), 'Must include mimo-suda preset');
  assert.ok(presetsCode.includes('mimo-baihua'), 'Must include mimo-baihua preset');
  assert.strictEqual(presetsCode.includes('sk-cvqfqe0l'), false, 'CRITICAL: No user API keys in builtinPresets.ts');

  // 4. VoiceSettingsScreen check: template accordion & zero forced prefilled values
  const settingsPath = path.resolve(__dirname, '../src/voice/ui/VoiceSettingsScreen.tsx');
  const settingsCode = fs.readFileSync(settingsPath, 'utf8');
  assert.ok(settingsCode.includes('高级自定义 API 服务'), 'Must include custom api accordion');
  assert.ok(settingsCode.includes('小米 MiMo'), 'Must include Xiaomi MiMo template');
  assert.ok(settingsCode.includes('AppDialog'), 'Must use AppDialog for all alert/confirm modals');
  assert.strictEqual(settingsCode.includes('Alert.alert'), false, 'Zero Alert.alert in VoiceSettingsScreen');
  assert.strictEqual(settingsCode.includes('sk-cvqfqe0l'), false, 'CRITICAL: No user API keys in VoiceSettingsScreen.tsx');
});
