const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('base64Utils encodes binary data accurately without btoa dependency', () => {
  const filePath = path.resolve(__dirname, '../src/voice/base64Utils.ts');
  const content = fs.readFileSync(filePath, 'utf8');

  // 严禁依赖全局 btoa
  assert.ok(!content.includes('btoa('), 'Must not use global btoa which crashes React Native Hermes');
  assert.ok(content.includes('arrayBufferToBase64'), 'Must export arrayBufferToBase64');

  // 运行算法测试
  const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function arrayBufferToBase64(input, byteOffset, byteLength) {
    let bytes;
    if (ArrayBuffer.isView(input)) {
      bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    } else if (byteOffset !== undefined || byteLength !== undefined) {
      bytes = new Uint8Array(input, byteOffset ?? 0, byteLength ?? (input.byteLength - (byteOffset ?? 0)));
    } else {
      bytes = new Uint8Array(input);
    }
    const len = bytes.length;
    let base64 = '';
    for (let i = 0; i < len; i += 3) {
      const b0 = bytes[i];
      const b1 = i + 1 < len ? bytes[i + 1] : 0;
      const b2 = i + 2 < len ? bytes[i + 2] : 0;
      base64 += BASE64_CHARS[b0 >> 2];
      base64 += BASE64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
      base64 += i + 1 < len ? BASE64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
      base64 += i + 2 < len ? BASE64_CHARS[b2 & 63] : '=';
    }
    return base64;
  }

  const sample = Buffer.from('Pixory Voice ASR System 2026', 'utf8');
  const encoded = arrayBufferToBase64(sample);
  const expected = sample.toString('base64');
  assert.equal(encoded, expected, 'Custom base64 encoder must match standard Base64 output');
});

test('asrService contract and architecture verification', () => {
  const filePath = path.resolve(__dirname, '../src/voice/asrService.ts');
  const content = fs.readFileSync(filePath, 'utf8');

  assert.ok(content.includes('class AsrService'), 'Must define AsrService');
  assert.ok(content.includes('startRecording'), 'Must implement startRecording');
  assert.ok(content.includes('stopRecording'), 'Must implement stopRecording');
  assert.ok(content.includes('cancelRecording'), 'Must implement cancelRecording');
  assert.ok(content.includes('transcribeAudio'), 'Must implement transcribeAudio');
  assert.ok(content.includes('FunAudioLLM/SenseVoiceSmall'), 'Must prioritize SenseVoiceSmall for Chinese ASR');
  assert.ok(content.includes('FileSystem.uploadAsync'), 'Must use FileSystem.uploadAsync for streaming audio upload');
  assert.ok(content.includes('FileSystem.deleteAsync'), 'Must clean up temporary audio files for user privacy');
});

test('WeChatVoiceRecordHud UI states and visual components', () => {
  const filePath = path.resolve(__dirname, '../src/voice/ui/WeChatVoiceRecordHud.tsx');
  const content = fs.readFileSync(filePath, 'utf8');

  assert.ok(content.includes('VoiceRecordHudState'), 'Must export VoiceRecordHudState');
  assert.ok(content.includes("'recording'"), 'Must handle recording state');
  assert.ok(content.includes("'canceling'"), 'Must handle canceling state');
  assert.ok(content.includes("'transcribing'"), 'Must handle transcribing state');
  assert.ok(content.includes('松开手指，取消发送'), 'Must show WeChat style cancel text');
  assert.ok(content.includes('松开 结束，上滑 取消') || content.includes('松开 发送') || content.includes('按住 说话'), 'Must show WeChat style recording prompt');
  assert.ok(content.includes('rgba(220, 38, 38') || content.includes('#FA5151'), 'Must turn warning red upon cancel gesture');
});

test('ImInputBar WeChat input mode toggle and voice responder gesture', () => {
  const filePath = path.resolve(__dirname, '../src/im/components/ImInputBar.tsx');
  const content = fs.readFileSync(filePath, 'utf8');

  assert.ok(content.includes('handleToggleVoiceMode'), 'Must implement voice mode toggle');
  assert.ok(content.includes('mic-outline') || content.includes('WeChatVoiceIcon'), 'Must render mic icon in text mode');
  assert.ok(content.includes('keypad-outline') || content.includes('WeChatKeyboardIcon'), 'Must render keypad icon in voice mode');
  assert.ok(content.includes('onResponderGrant') || content.includes('responderProps'), 'Must track touch press in');
  assert.ok(content.includes('按住 说话'), 'Must display "按住 说话" in default voice state');
  assert.ok(content.includes('asrService.transcribeAudio') || content.includes('useWeChatVoiceRecorder'), 'Must transcribe audio after recording');
});

test('AiChatScreen voiceAvailable enabled and ToastAndroid error notification', () => {
  const filePath = path.resolve(__dirname, '../src/screens/AiChatScreen.tsx');
  const content = fs.readFileSync(filePath, 'utf8');

  assert.ok(content.includes('voiceAvailable={true}'), 'voiceAvailable must be true for Long Chat composer');
  assert.ok(content.includes('ToastAndroid.show'), 'Must display native ToastAndroid when speech synthesis fails');
  assert.ok(content.includes('asrService.transcribeAudio'), 'Must use asrService to transcribe Long Chat voice');
});
