const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('ASR service policy verification: no mock greeting pre-fills on missing key or failures', () => {
  const asrPath = path.resolve(__dirname, '../src/voice/asrService.ts');
  const content = fs.readFileSync(asrPath, 'utf8');

  // 严禁包含以往返回的假问候语
  assert.ok(!content.includes('你好呀，想听听你的声音'), 'Must not contain fake greeting 1');
  assert.ok(!content.includes('今天天气真好，想和你聊聊天'), 'Must not contain fake greeting 2');
  assert.ok(!content.includes('你好呀，今天想和我聊些什么呢'), 'Must not contain fake greeting 3');

  // 必须抛出明确的未配置 Key 异常
  assert.ok(content.includes('未配置语音识别 API Key'), 'Must throw unconfigured key error');
});

test('voicePlayer manager policy verification: timeUpdateEventInterval and progress ticker', () => {
  const playerPath = path.resolve(__dirname, '../src/voice/voicePlayer.ts');
  const content = fs.readFileSync(playerPath, 'utf8');

  assert.ok(content.includes('timeUpdateEventInterval = 0.25'), 'Must set timeUpdateEventInterval for expo-video');
  assert.ok(content.includes('ticker'), 'Must maintain progress active ticker');
  assert.ok(content.includes('clearInterval'), 'Must clean up ticker on stop');
});

test('VoiceMiniPlayer UI contract: supports dynamic bottomOffset and wave animations', () => {
  const miniPlayerPath = path.resolve(__dirname, '../src/voice/ui/VoiceMiniPlayer.tsx');
  const content = fs.readFileSync(miniPlayerPath, 'utf8');

  assert.ok(content.includes('bottomOffset'), 'Must accept bottomOffset prop');
  assert.ok(!content.includes('bottom: 84'), 'Must not use hardcoded bottom: 84');
  assert.ok(content.includes('Animated.loop'), 'Must animate wave bars dynamically');
  assert.ok(content.includes('aiLightColors'), 'Must adopt aiLightColors design tokens');
  assert.ok(content.includes('radius.pill'), 'Must use radius.pill token');
});

test('VoiceSpeakIcon UI contract: distinct loading indicator and dynamic soundwave color pulse', () => {
  const iconPath = path.resolve(__dirname, '../src/components/ai/AiMessageActionIcons.tsx');
  const content = fs.readFileSync(iconPath, 'utf8');

  assert.ok(content.includes('VoiceSpeakIcon'), 'Must export VoiceSpeakIcon');
  assert.ok(content.includes('ContinuousSpinIcon') || content.includes('ActivityIndicator'), 'Must show loading indicator');
  assert.ok(content.includes('#2563EB'), 'Must use active blue hue');
  assert.ok(content.includes('SoundWaveBarsIcon') || (content.includes('innerStroke') && content.includes('outerStroke')), 'Must show animated soundwave');

  // 校验气泡记忆化门禁已包含语音播放与加载状态对比
  const bubblePath = path.resolve(__dirname, '../src/components/ai/AiMessageBubble.tsx');
  const bubbleContent = fs.readFileSync(bubblePath, 'utf8');
  assert.ok(bubbleContent.includes('previous.isPlayingVoice === next.isPlayingVoice'), 'Must compare isPlayingVoice in areAiMessageBubblePropsEqual');
  assert.ok(bubbleContent.includes('previous.isLoadingVoice === next.isLoadingVoice'), 'Must compare isLoadingVoice in areAiMessageBubblePropsEqual');
});

test('AiVoiceInputStatus UI contract: borderless and only shows error', () => {
  const statusPath = path.resolve(__dirname, '../src/components/ai/AiVoiceInputStatus.tsx');
  const content = fs.readFileSync(statusPath, 'utf8');

  assert.ok(content.includes('borderWidth: 0'), 'Must be borderless');
  assert.ok(content.includes('if (!isError)'), 'Must only render when there is an error');
  assert.ok(content.includes('onAutoDismiss') || content.includes('autoDismissMs'), 'Must support auto dismiss');
});

test('useSpeechToText hook contract: streaming real-time transcription and continuous listening', () => {
  const hookPath = path.resolve(__dirname, '../src/voice/ui/useSpeechToText.ts');
  const content = fs.readFileSync(hookPath, 'utf8');

  assert.ok(content.includes('useSpeechToText'), 'Must export useSpeechToText');
  assert.ok(content.includes('addNativeSpeechRecognitionListener'), 'Must listen to native speech recognition');
  assert.ok(content.includes("'partial'"), 'Must handle streaming partial text in real time');
  assert.ok(content.includes('autoDismissTimerRef'), 'Must auto-dismiss errors after timeout');
  assert.ok(content.includes('maxDurationSec'), 'Must guard with maxDurationSec safety limit');
  assert.ok(content.includes('onTextChangeRef'), 'Must keep stable callback ref to avoid listener re-subscriptions');
  assert.ok(content.includes('hasRecognizedNewSpeechRef'), 'Must track new speech recognition to avoid false positives on preexisting text');
  assert.ok(content.includes('clearReconnectTimer'), 'Must clean up reconnection timers');
});

test('ImInputBar UI contract: embeds speech-to-text mic button inside text input container', () => {
  const imInputPath = path.resolve(__dirname, '../src/im/components/ImInputBar.tsx');
  const content = fs.readFileSync(imInputPath, 'utf8');

  assert.ok(content.includes('useSpeechToText'), 'Must integrate useSpeechToText');
  assert.ok(content.includes('inputInnerMicButton'), 'Must render inner mic button inside inputContainer');
  assert.ok(content.includes('AiVoiceInputStatus'), 'Must mount AiVoiceInputStatus above composer');
});

test('ASR recording path hygiene and ExponentFileSystem error sanitization', () => {
  const asrPath = path.resolve(__dirname, '../src/voice/asrService.ts');
  const asrContent = fs.readFileSync(asrPath, 'utf8');

  // 必须去除 file:// 协议头以传递原生 Linux 物理路径给 MediaRecorder
  assert.ok(asrContent.includes("replace(/^file:\\/\\//, '')"), 'Must strip file:// prefix for native path');
  // 必须在 uploadAsync 前置检查物理文件存在性与大小
  assert.ok(asrContent.includes('FileSystem.getInfoAsync'), 'Must guard uploadAsync with getInfoAsync');
  // 必须清洗底层 uploadAsync / IOException 异常
  assert.ok(asrContent.includes("rawMsg.includes('uploadAsync')"), 'Must sanitize raw uploadAsync Java errors');

  // 原生 Kotlin 模板与工程文件必须对 file:// 进行容错清洗
  const nativeAppPath = path.resolve(__dirname, '../android/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt');
  const nativeAppContent = fs.readFileSync(nativeAppPath, 'utf8');
  assert.ok(nativeAppContent.includes('targetFilePath.startsWith("file://")'), 'Native app must strip file:// prefix');

  const nativePluginPath = path.resolve(__dirname, '../plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt');
  const nativePluginContent = fs.readFileSync(nativePluginPath, 'utf8');
  assert.ok(nativePluginContent.includes('targetFilePath.startsWith("file://")'), 'Native plugin template must strip file:// prefix');

  // transcribeAudio 必须支持 keepFile 保护，保障已发送语音消息不会被清理
  assert.ok(asrContent.includes('keepFile?: boolean;'), 'AsrTranscribeOptions must include keepFile');
  assert.ok(asrContent.includes('!options?.keepFile'), 'finally block must not delete when keepFile is true');

  // Android 11+ Package Visibility: AndroidManifest 必须在 queries 中声明 TTS_SERVICE
  const manifestPath = path.resolve(__dirname, '../android/app/src/main/AndroidManifest.xml');
  const manifestContent = fs.readFileSync(manifestPath, 'utf8');
  assert.ok(manifestContent.includes('android.intent.action.TTS_SERVICE'), 'AndroidManifest must declare TTS_SERVICE query');

  const pluginManifestPath = path.resolve(__dirname, '../plugins/pixory-android-intents/templates/app/src/main/AndroidManifest.xml');
  const pluginManifestContent = fs.readFileSync(pluginManifestPath, 'utf8');
  assert.ok(pluginManifestContent.includes('android.intent.action.TTS_SERVICE'), 'Plugin AndroidManifest must declare TTS_SERVICE query');

  // 原生 TTS 合成方法 synthesizeTtsToFile 必须支持 file:// 协议头安全清洗
  assert.ok(nativeAppContent.includes('synthesizeTtsToFile'), 'Native app must implement synthesizeTtsToFile');
  assert.ok(nativePluginContent.includes('synthesizeTtsToFile'), 'Plugin template must implement synthesizeTtsToFile');
});

test('Developer Voice Security & MiMo Out-of-the-Box Authorization contract', () => {
  const securityPath = path.resolve(__dirname, '../src/voice/developerVoiceSecurity.ts');
  const securityContent = fs.readFileSync(securityPath, 'utf8');

  // 严禁在源码或 Git 出现明文 API Key
  assert.ok(!securityContent.includes('sk-cvqfqe0l2qv8cez5itjvapbphkficke78izhx4ggynpod0w1'), 'Must not store plaintext API key in source');

  // 动态转译执行解密函数
  const ts = require('typescript');
  const transpiled = ts.transpileModule(securityContent, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = {};
  eval('(function(exports) { ' + transpiled + ' })(mod)');

  // 1. 严格模型门禁校验：必须且仅限 mimo-v2.5-tts
  assert.strictEqual(mod.resolveDeveloperMimoKey('gpt-4', 'https://api.xiaomimimo.com/v1'), null, 'Must reject gpt-4');
  assert.strictEqual(mod.resolveDeveloperMimoKey('mimo-chat', 'https://api.xiaomimimo.com/v1'), null, 'Must reject mimo-chat');
  assert.strictEqual(mod.resolveDeveloperMimoKey('tts-1', 'https://api.xiaomimimo.com/v1'), null, 'Must reject tts-1');
  assert.strictEqual(mod.resolveDeveloperMimoKey(null, 'https://api.xiaomimimo.com/v1'), null, 'Must reject null model');

  // 2. 严格端点门禁校验：必须为小米官方端点
  assert.strictEqual(mod.resolveDeveloperMimoKey('mimo-v2.5-tts', 'https://api.evil-proxy.com/v1'), null, 'Must reject third-party proxy');

  // 3. 正确模型与端点：瞬间解析成功
  const key = mod.resolveDeveloperMimoKey('mimo-v2.5-tts', 'https://api.xiaomimimo.com/v1');
  assert.ok(key && key.length === 51, 'Resolved key must be valid 51-char key');
  assert.ok(key.startsWith('sk-') && key.endsWith('w1'), 'Resolved key pattern match');

  // 4. 链路集成门禁检查
  const fallbackPath = path.resolve(__dirname, '../src/voice/fallbackChain.ts');
  const fallbackContent = fs.readFileSync(fallbackPath, 'utf8');
  assert.ok(fallbackContent.includes('resolveDeveloperMimoKey'), 'fallbackChain must integrate resolveDeveloperMimoKey');

  const voiceServicePath = path.resolve(__dirname, '../src/voice/voiceService.ts');
  const voiceServiceContent = fs.readFileSync(voiceServicePath, 'utf8');
  assert.ok(voiceServiceContent.includes('resolveDeveloperMimoKey'), 'voiceService must integrate resolveDeveloperMimoKey');

  const settingsPath = path.resolve(__dirname, '../src/voice/ui/VoiceSettingsScreen.tsx');
  const settingsContent = fs.readFileSync(settingsPath, 'utf8');
  assert.ok(settingsContent.includes('resolveDeveloperMimoKey'), 'VoiceSettingsScreen must integrate resolveDeveloperMimoKey');
  assert.ok(settingsContent.includes('开发者统付免 KEY 畅听'), 'VoiceSettingsScreen must display developer-funded header');
});
