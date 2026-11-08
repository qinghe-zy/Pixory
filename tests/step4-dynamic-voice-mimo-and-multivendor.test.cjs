const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

function loadModule(relativePath, mockRequire = {}) {
  let targetPath = path.resolve(__dirname, relativePath);
  if (!targetPath.endsWith('.ts') && !targetPath.endsWith('.js')) {
    if (fs.existsSync(targetPath + '.ts')) targetPath += '.ts';
    else if (fs.existsSync(targetPath + '.js')) targetPath += '.js';
  }
  const code = fs.readFileSync(targetPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  const customRequire = (reqPath) => {
    if (mockRequire[reqPath]) return mockRequire[reqPath];
    if (reqPath.startsWith('.')) {
      return loadModule(path.join(path.dirname(targetPath), reqPath), mockRequire);
    }
    return require(reqPath);
  };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, customRequire);
  return m.exports;
}

const mockExpoFileSystem = {
  documentDirectory: 'file:///data/pixory/',
  getInfoAsync: async () => ({ exists: true }),
  makeDirectoryAsync: async () => {},
  writeAsStringAsync: async () => {},
  EncodingType: { Base64: 'base64' },
};

const mockExpoSqlite = {};
const mockMediaModule = {
  synthesizeNativeTtsToFile: async (text, rate, pitch, outputPath) => ({
    filePath: outputPath,
    byteSize: 1024,
  }),
};

const {
  parseVoicePayload,
  parseVoiceTag,
  PARALINGUISTIC_SOUND_WHITELIST_REGEX,
} = loadModule('../src/im/engine/imTagParser.ts');

const { isMimoTts, OpenAiCompatEngine } = loadModule('../src/voice/engines/openAiCompatEngine.ts', {
  'expo-file-system/legacy': mockExpoFileSystem,
});

test('imTagParser - parseVoicePayload extracts style, preserves paralinguistic sounds in ttsScript, and keeps full actions in uiTranscript', () => {
  // 1. Whitelist verification
  assert.ok(PARALINGUISTIC_SOUND_WHITELIST_REGEX.test('（打哈欠）'));
  assert.ok(PARALINGUISTIC_SOUND_WHITELIST_REGEX.test('（叹了口气）'));
  assert.ok(PARALINGUISTIC_SOUND_WHITELIST_REGEX.test('（轻咳）'));
  assert.ok(!PARALINGUISTIC_SOUND_WHITELIST_REGEX.test('（拉了拉被子，翻了个身）'));

  // 2. Plain voice
  const p1 = parseVoicePayload('晚安啦，早点休息');
  assert.equal(p1.ttsScript, '晚安啦，早点休息');
  assert.equal(p1.uiTranscript, '晚安啦，早点休息');
  assert.equal(p1.styleDirective, undefined);

  // 3. Pipe style format: [VOICE: 撒娇轻嗔 | 快睡啦，别熬夜]
  const p2 = parseVoicePayload('撒娇轻嗔 | 快睡啦，别熬夜');
  assert.equal(p2.styleDirective, '撒娇轻嗔');
  assert.equal(p2.ttsScript, '快睡啦，别熬夜');
  assert.equal(p2.uiTranscript, '快睡啦，别熬夜');

  // 4. Paralinguistic sound (kept in TTS script for MiMo speech model)
  const p3 = parseVoicePayload('（打哈欠）好困啊，你存心不让我睡是不是');
  assert.ok(p3.ttsScript.includes('（打哈欠）'));
  assert.equal(p3.uiTranscript, '（打哈欠）好困啊，你存心不让我睡是不是');

  // 5. Stage action stripped from TTS but preserved in UI transcript
  const p4 = parseVoicePayload('（把手机往桌上一放，拉紧被子）这次我是真不守着屏幕了');
  assert.equal(p4.ttsScript, '这次我是真不守着屏幕了');
  assert.equal(p4.uiTranscript, '（把手机往桌上一放，拉紧被子）这次我是真不守着屏幕了');

  // 6. parseVoiceTag full tag integration
  const tag = parseVoiceTag('[VOICE: <style:困倦>（打哈欠）声音都给你听了，再赖着不回我就睡了]');
  assert.ok(tag);
  assert.equal(tag.styleDirective, '困倦');
  assert.ok(tag.ttsScript.includes('（打哈欠）'));
  assert.equal(tag.uiTranscript, '（打哈欠）声音都给你听了，再赖着不回我就睡了');
});

test('OpenAiCompatEngine - routes styleOverride and paralinguistic script correctly for MiMo vs standard OpenAI', async () => {
  assert.ok(isMimoTts('mimo-v2.5-tts', 'https://api.xiaomimimo.com/v1'));
  assert.ok(isMimoTts(null, 'https://api.xiaomimimo.com'));
  assert.ok(!isMimoTts('tts-1', 'https://api.openai.com/v1'));

  const engine = new OpenAiCompatEngine();
  let capturedPayload = null;
  const originalFetch = global.fetch;

  global.fetch = async (url, opts) => {
    capturedPayload = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              audio: {
                data: Buffer.from('mock_audio').toString('base64'),
              },
            },
          },
        ],
      }),
    };
  };

  try {
    // 1. MiMo with styleOverride and paralinguistic sound
    await engine.synthesizeToFile({
      text: '（打哈欠）你存心不让我睡是不是',
      ttsScript: '（打哈欠）你存心不让我睡是不是',
      styleOverride: '撒娇微嗔',
      model: 'mimo-v2.5-tts',
      baseUrl: 'https://api.xiaomimimo.com/v1',
      apiKey: 'test-key',
      outputPath: 'test.mp3',
    });

    assert.ok(capturedPayload);
    assert.equal(capturedPayload.model, 'mimo-v2.5-tts');
    assert.equal(capturedPayload.messages[0].role, 'user');
    assert.equal(capturedPayload.messages[0].content, '撒娇微嗔');
    assert.ok(capturedPayload.messages[1].content.includes('<style>撒娇微嗔</style>'));
    assert.ok(capturedPayload.messages[1].content.includes('（打哈欠）'));

    // 2. Standard OpenAI (should NOT have <style> tag)
    global.fetch = async (url, opts) => {
      capturedPayload = JSON.parse(opts.body);
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from('mock_audio_openai'),
      };
    };

    await engine.synthesizeToFile({
      text: '我先睡了，晚安',
      ttsScript: '我先睡了，晚安',
      model: 'tts-1',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      outputPath: 'test.mp3',
    });

    assert.ok(capturedPayload);
    assert.equal(capturedPayload.model, 'tts-1');
    assert.equal(capturedPayload.input, '我先睡了，晚安');
    assert.strictEqual(capturedPayload.messages, undefined);
  } finally {
    global.fetch = originalFetch;
  }
});

test('BurstMessageDispatcher - parses voice tag and attaches style/ttsScript cleanly', () => {
  const voiceRaw = '[VOICE: <style:撒娇>（打哈欠）你存心不让我睡是不是]';
  const parsed = parseVoiceTag(voiceRaw);
  assert.ok(parsed);
  assert.equal(parsed.styleDirective, '撒娇');
  assert.equal(parsed.uiTranscript, '（打哈欠）你存心不让我睡是不是');
  assert.ok(parsed.ttsScript.includes('（打哈欠）'));
});
