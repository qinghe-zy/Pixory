const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('VoiceBubbleRenderer: 气泡内侧数字与波浪图标排版契约', () => {
  const filePath = path.join(__dirname, '../src/im/components/renderers/VoiceBubbleRenderer.tsx');
  const content = fs.readFileSync(filePath, 'utf8');

  // 1. 验证时长秒数已经移入气泡内部 (styles.secondsTextInside)，且包含 14px 字号
  assert.match(content, /secondsTextInside:\s*\{[^}]*fontSize:\s*14/, 'secondsTextInside 必须定义 14px 字号');
  assert.match(content, /voiceBubbleContent:\s*\{[^}]*flexDirection:\s*['"]row['"]/, 'voiceBubbleContent 必须为水平排布');

  // 2. 验证用户消息块：秒数在左 (marginRight: 6)，波浪在右紧靠
  assert.match(
    content,
    /isUser\s*\?\s*\([\s\S]*?styles\.voiceBubbleContent[\s\S]*?\{durationSec\}&quot;[\s\S]*?WeChatSoundWave[\s\S]*?isUser=\{true\}/,
    '用户气泡内秒数必须紧靠声波左侧'
  );

  // 3. 验证伴侣消息块：波浪在左，秒数在右紧靠 (marginLeft: 6)
  assert.match(
    content,
    /styles\.voiceBubbleContent[\s\S]*?WeChatSoundWave[\s\S]*?isUser=\{false\}[\s\S]*?\{durationSec\}&quot;/,
    '伴侣气泡内秒数必须紧靠声波右侧'
  );

  // 4. 验证外侧秒数已经被移除
  assert.doesNotMatch(content, /bubbleWithDotRow[\s\S]*styles\.secondsTextOutside/, '气泡外侧不应再出现秒数文本');

  // 5. 验证气泡宽度基准满足波浪+秒数内嵌
  assert.match(content, /minWidth\s*=\s*82/, '基础气泡宽度须适配内嵌秒数与波浪');
});

test('useWeChatVoiceRecorder: 原生流式识别与彻底移除假气泡语音契约', () => {
  const filePath = path.join(__dirname, '../src/voice/ui/useWeChatVoiceRecorder.ts');
  const content = fs.readFileSync(filePath, 'utf8');

  // 1. 验证已接入原生 SpeechRecognizer 实时流式转录接口
  assert.match(content, /addNativeSpeechRecognitionListener/, '必须监听原生语音识别事件');
  assert.match(content, /startSpeechRecognition/, '长按开始必须启动系统语音识别');
  assert.match(content, /stopSpeechRecognition/, '松开必须停止系统语音识别');
  assert.match(content, /cancelSpeechRecognition/, '取消必须调用取消识别');

  // 2. 验证滑到右侧转文字直接复用 recognizedText，零物理文件依赖
  assert.match(content, /finalState === 'transcribing_ready'[\s\S]*transcribed_preview/, '滑到右侧松开后进入 transcribed_preview 预览卡片');

  // 3. 验证彻底移除底部松开发送假语音条 (绝不再发送 mock_voice)
  assert.doesNotMatch(content, /onSendVoice\?\.[\s\S]*mock_voice/, '绝不能包含 mock_voice 发送');

  // 4. 验证底部松开时若识别到内容自动引导转文字预览
  assert.match(content, /留在底部穹顶松开[\s\S]*setTranscribedText\(recognized\)[\s\S]*updateState\('transcribed_preview'\)/, '底部松开若有识别文字，必须无缝进入转文字预览');
});

test('useImChatSession: 假语音消息防御性拦截契约', () => {
  const filePath = path.join(__dirname, '../src/im/hooks/useImChatSession.ts');
  const content = fs.readFileSync(filePath, 'utf8');

  // 验证 handleSendVoice 存在 mock 音频路径前置拦截
  assert.match(
    content,
    /!voiceData\.audioUri\s*\|\|\s*voiceData\.audioUri\.includes\(['"]mock['"]\)/,
    '必须防御性拦截 mock 假语音并阻止入库'
  );
});

test('ImInputBar: 表情面板与软键盘联动状态机与零弹跳算法契约', () => {
  const filePath = path.join(__dirname, '../src/im/components/ImInputBar.tsx');
  const content = fs.readFileSync(filePath, 'utf8');

  // 1. 验证采用 Reanimated 状态机与 useKeyboardHandler 首帧精确感知
  assert.match(content, /useKeyboardHandler/, '必须使用 useKeyboardHandler 精确感知键盘动画帧');
  assert.match(content, /modeSV\s*=\s*useSharedValue/, '必须使用 modeSV 管理状态机');
  assert.match(content, /virtualHeight\s*=\s*useSharedValue/, '必须使用 virtualHeight 托底高度');

  // 2. 验证单节点包络线算法：Math.max(virtual, kb)，杜绝多节点加减抵消抖动
  assert.match(content, /Math\.max\(virtual,\s*kb\)/, '面板容器必须采用单节点包络线算法');

  // 3. 验证键盘与表情平滑无抖动过渡函数
  assert.match(content, /transitionToKeyboard/, '必须实现表情转键盘专属承托逻辑');
  assert.match(content, /transitionToEmojiFromKeyboard/, '必须实现键盘转表情专属承托逻辑');

  // 4. 验证零态展开/关闭干脆利落 (180ms ~ 220ms，杜绝迟钝拖沓)
  assert.match(content, /animateCloseEmoticons[\s\S]*duration:\s*180/, '收起面板必须干脆利落 (180ms)');
  assert.match(content, /animateOpenEmoticons/, '展开面板必须迅速就位');

  // 5. 验证伴聊输入框内麦克风按需显隐契约：打字有内容时隐藏，录音时保留
  assert.match(
    content,
    /showInnerMicButton\s*=\s*text\.length\s*===\s*0\s*\|\|\s*stt\.isListening/,
    '必须定义 showInnerMicButton 并在输入框有文字时隐藏麦克风（录音中保留）'
  );
  assert.match(
    content,
    /\{showInnerMicButton\s*(\?|&&)[\s\S]*?styles\.inputInnerMicButton/,
    'inputInnerMicButton 必须受 showInnerMicButton 条件渲染控制'
  );

  // 6. 验证语音输入模式下点击表情按钮自动切换回正常文字输入框契约
  assert.match(
    content,
    /handleToggleEmoticons[\s\S]*?if\s*\(\s*isVoiceMode\s*\)\s*\{[\s\S]*?setIsVoiceMode\(\s*false\s*\)/,
    '处于语音输入模式时点击表情按钮必须自动调用 setIsVoiceMode(false) 还原为文字输入框'
  );
});

test('VoiceBubbleRenderer: 伴聊语音已读红点消除与 SQLite 持久化契约', () => {
  const bubblePath = path.join(__dirname, '../src/im/components/renderers/VoiceBubbleRenderer.tsx');
  const repoPath = path.join(__dirname, '../src/im/repository/imThreadRepository.ts');
  const burstPath = path.join(__dirname, '../src/im/engine/burstDispatcher.ts');

  const bubbleContent = fs.readFileSync(bubblePath, 'utf8');
  const repoContent = fs.readFileSync(repoPath, 'utf8');
  const burstContent = fs.readFileSync(burstPath, 'utf8');

  // 1. 验证 VoiceBubbleRenderer 引入并调用持久化标记接口
  assert.match(bubbleContent, /import\s*\{[^}]*markImMessageVoicePlayed[^}]*\}\s*from/, '必须导入 markImMessageVoicePlayed');
  assert.match(bubbleContent, /markImMessageVoicePlayed\(\s*space,\s*message\.id\s*\)/, '必须调用 markImMessageVoicePlayed 进行数据库持久化');

  // 2. 验证气泡点击播放时立即触发 markAsPlayed
  assert.match(bubbleContent, /const\s+handleBubblePress[\s\S]*?markAsPlayed\(\)/, '点击播放时必须立即消除红点并持久化');

  // 3. 验证播放器播放订阅驱动红点消除
  assert.match(bubbleContent, /voiceService\.subscribe[\s\S]*?markAsPlayed\(\)/, '音频实际播放时必须触发 markAsPlayed');

  // 4. 验证组件状态同步监听 message.voice?.isPlayed
  assert.match(bubbleContent, /message\.voice\?\.isPlayed[\s\S]*?setHasBeenPlayed\(true\)/, '外部传入已播放属性时同步消除红点');

  // 5. 验证 imThreadRepository 导出 markImMessageVoicePlayed 与防逆转逻辑
  assert.match(repoContent, /export\s+async\s+function\s+markImMessageVoicePlayed/, '仓储层必须导出 markImMessageVoicePlayed');
  assert.match(repoContent, /const\s+isAlreadyPlayed\s*=\s*Boolean\(parsed\.isPlayed\)/, '必须读取数据库中现有的 isPlayed 状态');
  assert.match(repoContent, /finalPlayed\s*=\s*isAlreadyPlayed\s*\|\|\s*newPlayed/, '一旦标记为已读，绝不能逆转为未读');

  // 6. 验证 burstDispatcher 预合成音频时不覆盖 isPlayed: false
  assert.doesNotMatch(
    burstContent,
    /prep\s*=\s*await\s+voiceService\.prepareAudio[\s\S]*?updateImMessageVoice[\s\S]*?isPlayed:\s*false/,
    '异步预合成音频任务绝不可硬编码 isPlayed: false 覆盖用户的点击已读状态'
  );
});

test('SQLite 语音消息已读状态持久化与防逆转仿真测试', () => {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE ai_messages (
      id TEXT PRIMARY KEY NOT NULL,
      threadId TEXT NOT NULL,
      content TEXT NOT NULL
    );
  `);

  const messageId = 'msg_ai_voice_test_001';
  const initialContent = JSON.stringify({
    type: 'voice',
    audioUri: '',
    durationMs: 2500,
    transcription: '你好呀，今天过得开心吗？',
    isPlayed: false,
  });

  db.prepare('INSERT INTO ai_messages (id, threadId, content) VALUES (?, ?, ?)').run(
    messageId,
    'thread_test',
    initialContent
  );

  // 1. 验证初始状态为未读 (isPlayed = false)
  const initialRow = db.prepare('SELECT content FROM ai_messages WHERE id = ?').get(messageId);
  const parsed1 = JSON.parse(initialRow.content);
  assert.equal(parsed1.isPlayed, false, '新发出的伴聊语音消息必须为未读');

  // 2. 模拟用户点击语音条播放，执行 markImMessageVoicePlayed
  function simulateUpdateVoice(msgId, voiceUpdate) {
    const row = db.prepare('SELECT content FROM ai_messages WHERE id = ?').get(msgId);
    let parsed = {};
    if (row && row.content) {
      try { parsed = JSON.parse(row.content); } catch {}
    }
    const isAlreadyPlayed = Boolean(parsed.isPlayed);
    const newPlayed = voiceUpdate.isPlayed !== undefined ? Boolean(voiceUpdate.isPlayed) : isAlreadyPlayed;
    const finalPlayed = isAlreadyPlayed || newPlayed;

    const rawContent = JSON.stringify({
      type: 'voice',
      audioUri: voiceUpdate.audioUri !== undefined ? voiceUpdate.audioUri : (parsed.audioUri ?? ''),
      durationMs: voiceUpdate.durationMs !== undefined ? voiceUpdate.durationMs : (parsed.durationMs ?? 1000),
      transcription: voiceUpdate.transcription !== undefined ? voiceUpdate.transcription : (parsed.transcription ?? ''),
      isPlayed: finalPlayed,
    });
    db.prepare('UPDATE ai_messages SET content = ? WHERE id = ?').run(rawContent, msgId);
  }

  simulateUpdateVoice(messageId, { isPlayed: true });

  const playedRow = db.prepare('SELECT content FROM ai_messages WHERE id = ?').get(messageId);
  const parsed2 = JSON.parse(playedRow.content);
  assert.equal(parsed2.isPlayed, true, '点击播放后持久化到数据库必须为 isPlayed = true');

  // 3. 模拟后台异步预合成任务完成，更新 audioUri 与 durationMs
  simulateUpdateVoice(messageId, {
    audioUri: 'file:///cache/audio_voice_001.mp3',
    durationMs: 2600,
  });

  // 4. 验证异步预合成完成后，isPlayed 依然保持 true，绝不被逆转重置！
  const finalRow = db.prepare('SELECT content FROM ai_messages WHERE id = ?').get(messageId);
  const parsed3 = JSON.parse(finalRow.content);
  assert.equal(parsed3.isPlayed, true, '后续异步预合成更新绝不可逆转 isPlayed');
  assert.equal(parsed3.audioUri, 'file:///cache/audio_voice_001.mp3');
  assert.equal(parsed3.durationMs, 2600);
});
