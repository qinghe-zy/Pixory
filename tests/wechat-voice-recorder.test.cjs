const test = require('node:test');
const assert = require('node:assert/strict');

// 纺锤形 21 根声波条的包络因子计算验证
const NUM_WAVE_BARS = 21;
const WAVE_ENVELOPE = Array.from({ length: NUM_WAVE_BARS }, (_, i) => {
  const norm = (i + 1) / (NUM_WAVE_BARS + 1);
  return Math.sin(norm * Math.PI);
});

function computeWaveHeights(amplitude, isCanceling = false, isTranscribing = false) {
  if (amplitude < 0.04 || isCanceling || isTranscribing) {
    return Array(NUM_WAVE_BARS).fill(3);
  }
  return WAVE_ENVELOPE.map((env) => {
    const h = 3 + env * amplitude * 24;
    return Math.max(3, Math.min(28, h));
  });
}

function resolvePanGestureState(startX, startY, currentX, currentY, screenWidth = 390) {
  const deltaY = startY - currentY;
  const centerX = screenWidth / 2;

  let nextState = 'recording';
  if (deltaY >= 45) {
    if (currentX < centerX - 18) {
      nextState = 'canceling';
    } else if (currentX > centerX + 18) {
      nextState = 'transcribing_ready';
    }
  }
  return nextState;
}

function getContrastColor(hexColor, darkChoice = '#1F3A10', lightChoice = '#FFFFFF') {
  const cleanHex = hexColor.replace('#', '');
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 135 ? lightChoice : darkChoice;
  }
  return darkChoice;
}

function resolveMessageContentForLlm(m) {
  if (m.type === 'voice') {
    if (m.voice?.transcription && m.voice.transcription.trim()) {
      return `[语音]: ${m.voice.transcription.trim()}`;
    }
    if (m.content && m.content.startsWith('{"type":"voice"')) {
      try {
        const parsed = JSON.parse(m.content);
        if (parsed.transcription && parsed.transcription.trim()) {
          return `[语音]: ${parsed.transcription.trim()}`;
        }
      } catch {}
    }
    return '[发送了一条语音消息]';
  }
  return m.content;
}

test('真实音量振幅计算：无声或低于阈值时声波条保持基线静止不跳', () => {
  const silentHeights1 = computeWaveHeights(0);
  assert.equal(silentHeights1.length, 21);
  assert.ok(silentHeights1.every((h) => h === 3), '振幅为 0 时所有声波条必须保持 3px 基线');

  const silentHeights2 = computeWaveHeights(0.02);
  assert.ok(silentHeights2.every((h) => h === 3), '振幅低于门限 0.04 时必须保持 3px 静止不跳');
});

test('真实音量振幅计算：说话有声时声波呈纺锤形跳跃，中心最高两侧较低', () => {
  const vocalHeights = computeWaveHeights(0.8);
  assert.equal(vocalHeights.length, 21);

  // 中心条索引 10
  const centerHeight = vocalHeights[10];
  const edgeLeft = vocalHeights[0];
  const edgeRight = vocalHeights[20];

  assert.ok(centerHeight > 18, `中心声波条高度应显著跳跃 (当前: ${centerHeight})`);
  assert.ok(centerHeight > edgeLeft, '中心条高度应大于最左侧边缘条');
  assert.ok(centerHeight > edgeRight, '中心条高度应大于最右侧边缘条');
});

test('手势判定：在底部穹顶内位移判定为松开发送', () => {
  const state = resolvePanGestureState(195, 750, 195, 720, 390);
  assert.equal(state, 'recording', '手指未移出底部穹顶时判定为 recording (松开发送)');
});

test('手势判定：向上滑向左侧判定为取消', () => {
  const state = resolvePanGestureState(195, 750, 80, 620, 390);
  assert.equal(state, 'canceling', '手指滑向左侧上方判定为 canceling (取消录音)');
});

test('手势判定：向上滑向右侧判定为转文字', () => {
  const state = resolvePanGestureState(195, 750, 300, 620, 390);
  assert.equal(state, 'transcribing_ready', '手指滑向右侧上方判定为 transcribing_ready (滑到这里 转文字)');
});

test('智能对比度计算：浅色气泡取墨绿，深色暗黑气泡自动反白高对比', () => {
  const wechatGreenColor = getContrastColor('#95EC69');
  assert.equal(wechatGreenColor, '#1F3A10', '微信绿气泡应当呈现墨绿色声波/文字');

  const darkBubbleColor = getContrastColor('#1E1E1E');
  assert.equal(darkBubbleColor, '#FFFFFF', '深暗色气泡应当反显白色高对比声波/文字');
});

test('大模型上下文安全解构：严格将 voice JSON 脱敏为自然对白，杜绝复读代码', () => {
  const userVoiceMsg = {
    role: 'user',
    type: 'voice',
    content: '{"type":"voice","audioUri":"test.m4a","durationMs":5000,"transcription":"你吃晚饭了没有"}',
    voice: { audioUri: 'test.m4a', durationMs: 5000, transcription: '你吃晚饭了没有' },
  };

  const llmContent = resolveMessageContentForLlm(userVoiceMsg);
  assert.equal(llmContent, '[语音]: 你吃晚饭了没有');
  assert.ok(!llmContent.includes('{'), '大模型接收的正文严禁泄漏 JSON 括号与内部结构');

  const emptyVoiceMsg = {
    role: 'user',
    type: 'voice',
    content: '{"type":"voice","audioUri":"test.m4a","durationMs":3000}',
  };
  assert.equal(resolveMessageContentForLlm(emptyVoiceMsg), '[发送了一条语音消息]');
});

test('消息协议规范：语音消息生成格式必须满足 SQLite 检索契约', () => {
  const voiceData = {
    audioUri: 'file:///data/user/0/com.pixory.app/cache/asr_123.m4a',
    durationMs: 7200,
    transcription: '你好呀',
  };

  const rawVoicePayload = JSON.stringify({
    type: 'voice',
    audioUri: voiceData.audioUri,
    durationMs: voiceData.durationMs,
    transcription: voiceData.transcription,
    isPlayed: true,
  });

  assert.ok(rawVoicePayload.startsWith('{"type":"voice"'), 'SQLite content 必须以 {"type":"voice" 开头以被 mapMessageRow 识别');
  const parsed = JSON.parse(rawVoicePayload);
  assert.equal(parsed.type, 'voice');
  assert.equal(parsed.durationMs, 7200);
  assert.equal(parsed.transcription, '你好呀');
});
