const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('speech bridge exposes cancellable direct recognition with truthful on-device fallback', () => {
  const bridge = read('src/native/pixoryMediaModule.ts');
  const native = read('plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt');
  assert.match(bridge, /getSpeechRecognitionCapabilities/);
  assert.match(bridge, /startSpeechRecognition/);
  assert.match(bridge, /stopSpeechRecognition/);
  assert.match(bridge, /cancelSpeechRecognition/);
  assert.match(bridge, /PixorySpeechRecognition/);
  assert.match(native, /createOnDeviceSpeechRecognizer/);
  assert.match(native, /EXTRA_PREFER_OFFLINE/);
  assert.match(native, /RecognitionListener/);
  assert.match(native, /ERROR_RECOGNIZER_BUSY/);
  assert.match(native, /ERROR_SPEECH_TIMEOUT/);
  assert.match(native, /ERROR_NO_MATCH/);
  assert.match(native, /onHostPause\(\) = cancelDirectSpeechRecognizer/);
});

test('composer supports hold/release, slide cancel, and final-result-only draft insertion', () => {
  const composer = read('src/components/ai/AiChatComposer.tsx');
  const screen = read('src/screens/AiChatScreen.tsx');
  assert.match(composer, /onLongPress/);
  assert.match(composer, /onPressOut/);
  assert.match(composer, /onTouchMove/);
  assert.match(composer, /onVoiceStart/);
  assert.match(composer, /onVoiceStop/);
  assert.match(screen, /event\.type === 'result'/);
  assert.doesNotMatch(screen, /event\.type === 'partial'[\s\S]{0,300}setComposerText/);
  assert.match(screen, /PermissionsAndroid\.PERMISSIONS\.RECORD_AUDIO/);
  assert.match(screen, /NEVER_ASK_AGAIN/);
  assert.match(screen, /voiceMode/);
});

test('speech initiation has no chat provider or model prerequisite', () => {
  const screen = read('src/screens/AiChatScreen.tsx');
  const start = screen.indexOf('async function handleVoiceStart');
  const end = screen.indexOf('async function handleVoiceStop', start);
  const body = screen.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(body, /provider|modelId|resolveThreadChatModel|getCurrentChatModel/);
  assert.match(body, /getSpeechRecognitionCapabilities/);
  assert.match(body, /startSpeechRecognition/);
});

test('share Activity is versioned and copied by the Expo config plugin', () => {
  const plugin = read('plugins/withPixoryAndroidIntents.js');
  const activity = read('plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/PixoryShareActivity.kt');
  assert.match(plugin, /PixoryShareActivity\.kt/);
  assert.match(activity, /class PixoryShareActivity : MainActivity/);
});
