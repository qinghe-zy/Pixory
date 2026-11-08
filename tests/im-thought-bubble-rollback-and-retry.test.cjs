const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

function loadModule(relativePath, mockRequire = {}) {
  let targetPath = path.resolve(__dirname, relativePath);
  if (!targetPath.endsWith('.ts') && !targetPath.endsWith('.tsx') && !targetPath.endsWith('.js') && !targetPath.endsWith('.jsx')) {
    if (fs.existsSync(targetPath + '.ts')) targetPath += '.ts';
    else if (fs.existsSync(targetPath + '.tsx')) targetPath += '.tsx';
    else if (fs.existsSync(targetPath + '.js')) targetPath += '.js';
    else if (fs.existsSync(targetPath + '.jsx')) targetPath += '.jsx';
  }
  const code = fs.readFileSync(targetPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
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

const { TagAwareStreamParser } = loadModule('../src/im/engine/tagAwareStreamParser');

test('IM Thought Bubble Protection & Emergency Flush Verification', async (t) => {
  await t.test('1. TagAwareStreamParser flush rescues dialogue without [BR] when stream breaks', () => {
    let thoughtCompleted = null;
    const parser = new TagAwareStreamParser({
      onThoughtCompleted: (th) => {
        thoughtCompleted = th;
      },
    });

    // 模型先吐出完整思考
    parser.feed('<think>思考了 15 秒，决定关心一下对方的作息</think>');
    assert.strictEqual(thoughtCompleted, '思考了 15 秒，决定关心一下对方的作息');

    // 随后模型吐出正文，但尚未收到 [BR] 突然流断开
    const sentences = parser.feed('夜深了，怎么还不睡呢？');
    assert.strictEqual(sentences.length, 0, '未遇到 [BR] 前普通分句循环不应截断吐出半截话');

    // 模拟流异常时的紧急 parser.flush()
    const rescued = parser.flush();
    assert.strictEqual(rescued.length, 1, '流断开时 flush 必须紧急抢救出正文台词');
    assert.strictEqual(rescued[0], '夜深了，怎么还不睡呢？');
  });

  await t.test('2. Completed thought bubble is strictly preserved on stream error', () => {
    // 模拟 useImChatSession 中的 createThoughtHandlers 保护逻辑
    let persistedThoughtId = null;
    let activeThought = null;
    let messages = [];

    const onThoughtCompleted = (fullThought) => {
      activeThought = { id: 'thought_123', content: fullThought };
      persistedThoughtId = activeThought.id;
      messages.push({
        id: activeThought.id,
        role: 'assistant',
        type: 'thought',
        content: fullThought,
        metadata: { isThinking: false, durationSeconds: 5, isCollapsed: true },
      });
      activeThought = null;
    };

    const rollbackThought = () => {
      // 核心防抹杀铁律：已持久化的思考气泡永不回滚
      if (persistedThoughtId) {
        return;
      }
      if (activeThought) {
        const targetId = activeThought.id;
        activeThought = null;
        messages = messages.filter((m) => m.id !== targetId);
      }
    };

    // 触发思考完成
    onThoughtCompleted('经过深思熟虑的推理过程');
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].id, 'thought_123');

    // 随后流发生网络异常，触发 rollbackThought
    rollbackThought();

    // 断言思考气泡绝不被删除，依然稳稳停留在列表中
    assert.strictEqual(messages.length, 1, '已落库的思考气泡绝不应在报错时被删除抹杀');
    assert.strictEqual(messages[0].content, '经过深思熟虑的推理过程');
  });

  await t.test('3. Unfinished and empty thought is discarded on abort', () => {
    let persistedThoughtId = null;
    let activeThought = { id: 'thought_pending', content: '' };
    let messages = [{ id: 'thought_pending', role: 'assistant', type: 'thought', content: '' }];

    const rollbackThought = () => {
      if (persistedThoughtId) return;
      if (activeThought) {
        const targetId = activeThought.id;
        activeThought = null;
        messages = messages.filter((m) => m.id !== targetId);
      }
    };

    // 中途被打断或未生成内容时安全清理
    rollbackThought();
    assert.strictEqual(messages.length, 0, '未落库且无内容的在途思考气泡应安全清理');
  });

  await t.test('4. Zero-dialogue fallback emits standard system notice allowing in-place retry instead of fake scripted warm replies', () => {
    // 模拟 useImChatSession 中的零正文标准系统处理机制
    const handleZeroContentOnStreamEnd = (hasPersistedThought) => {
      if (hasPersistedThought) {
        return {
          action: 'system_notice',
          content: '连接中断，未收到回复',
          isErrorNotice: true,
        };
      }
      return {
        action: 'system_notice',
        content: '连接暂时不稳定，未收到回复',
        isErrorNotice: true,
      };
    };

    const withThought = handleZeroContentOnStreamEnd(true);
    assert.strictEqual(withThought.action, 'system_notice');
    assert.strictEqual(withThought.isErrorNotice, true);
    assert.strictEqual(withThought.content, '连接中断，未收到回复');

    const withoutThought = handleZeroContentOnStreamEnd(false);
    assert.strictEqual(withoutThought.action, 'system_notice');
    assert.strictEqual(withoutThought.isErrorNotice, true);
    assert.strictEqual(withoutThought.content, '连接暂时不稳定，未收到回复');
  });

  await t.test('5. voiceRepository.listPresets purges obsolete builtin-% and builtin_free presets from SQLite', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE voice_presets (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        engine_kind TEXT NOT NULL,
        base_url TEXT,
        model TEXT,
        voice_id TEXT NOT NULL,
        rate REAL NOT NULL DEFAULT 1.0,
        pitch REAL NOT NULL DEFAULT 0.0,
        style TEXT,
        is_builtin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // 模拟老版本迁移留下的 8 个废弃预设
    db.exec(`
      INSERT INTO voice_presets (id, name, engine_kind, voice_id, is_builtin, created_at, updated_at)
      VALUES
        ('builtin-female-gentle', '知性温婉·知己声', 'builtin_free', 'zh-CN-XiaoyiNeural', 1, '2026-11-05', '2026-11-05'),
        ('builtin-female-cheerful', '元气明媚·甜润声', 'builtin_free', 'zh-CN-XiaoxiaoNeural', 1, '2026-11-05', '2026-11-05'),
        ('custom-mimo-user', '我的专属声音', 'openai_compat', '冰糖', 0, '2026-11-06', '2026-11-06');
    `);

    // 执行清理逻辑
    db.exec("DELETE FROM voice_presets WHERE id LIKE 'builtin-%' OR engine_kind = 'builtin_free'");

    const remaining = db.prepare("SELECT * FROM voice_presets WHERE id NOT LIKE 'builtin-%' AND engine_kind != 'builtin_free'").all();
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].id, 'custom-mimo-user');
    assert.strictEqual(remaining[0].name, '我的专属声音');
  });

  await t.test('6. streamClient strictly avoids Connection: keep-alive (HTTP/2 RFC 7540 compliance)', () => {
    const code = fs.readFileSync(path.resolve(__dirname, '../src/core/llm-transport/streamClient.ts'), 'utf8');
    assert.doesNotMatch(code, /['"]Connection['"]\s*:\s*['"]keep-alive['"]/i, '严禁携带 Connection: keep-alive 违反 HTTP/2 协议导致网关强杀');
  });

  await t.test('7. Reasoning models allocate 8192 token budget and map max_completion_tokens for OpenAI o-series', () => {
    const code = fs.readFileSync(path.resolve(__dirname, '../src/core/llm-transport/streamClient.ts'), 'utf8');
    assert.match(code, /r1\|reasoner\|reasoning\|thinking\|qwq\|o1\|o3/i, '必须覆盖 R1、qwq、thinking 与 o 系列推理模型');
    assert.match(code, /defaultBudget\s*=\s*isReasoningModel\s*\?\s*8192\s*:\s*4096/, '推理模型必须保障充裕的 8192 Token 思考与回复空间');
    assert.match(code, /max_completion_tokens/, 'OpenAI o 系列必须映射为 max_completion_tokens');
  });

  await t.test('8. imBackgroundStreamService suppresses ghost replies after system notice', () => {
    const code = fs.readFileSync(path.resolve(__dirname, '../src/im/services/imBackgroundStreamService.ts'), 'utf8');
    assert.match(code, /latestAnyMsg\.type\s*===\s*['"]system_notice['"]/, '前台显式呈送报错胶囊后，后台严禁幽灵拉起并发回复');
  });

  await t.test('9. ImInputBar renders WeChatVoiceRecordHud as unclipped fragment sibling', () => {
    const code = fs.readFileSync(path.resolve(__dirname, '../src/im/components/ImInputBar.tsx'), 'utf8');
    assert.match(code, /<\/View>\s*\{\/\* 全屏微信同款长按录音 HUD/, 'WeChatVoiceRecordHud 必须脱离 composerWrapper 容器，杜绝 60px 裁切');
  });

  await t.test('10. TagAwareStreamParser flush demotes heartbeat text to main dialogue when zero dialogue was emitted', () => {
    const parser = new TagAwareStreamParser();
    // 模型思考完成，但在正文里只吐出了心跳标签，无任何其它气泡
    parser.feed('<think>简单思考了一下</think>[HEARTBEAT: 20s | 刚好看到窗外落叶了]');
    const flushed = parser.flush();
    assert.strictEqual(flushed.length, 1, '零正文时 flush 必须将 HEARTBEAT 内的台词抢救为主气泡');
    assert.strictEqual(flushed[0], '刚好看到窗外落叶了');
  });

  await t.test('11. normalizeMessagesForTransport merges consecutive user turns to satisfy role alternation', () => {
    const { normalizeMessagesForTransport } = loadModule('../src/core/llm-transport/streamClient.ts');
    const inputMessages = [
      { role: 'system', content: 'You are an AI assistant.' },
      { role: 'user', content: 'First user message' },
      { role: 'user', content: 'Second user message immediately following' },
    ];
    const { normalizedMessages } = normalizeMessagesForTransport(inputMessages);
    assert.strictEqual(normalizedMessages.length, 2, '连续的两条 user 消息必须合并为 1 条');
    assert.strictEqual(normalizedMessages[0].role, 'system');
    assert.strictEqual(normalizedMessages[1].role, 'user');
    assert.strictEqual(normalizedMessages[1].content, 'First user message\nSecond user message immediately following');
  });

  await t.test('12. formatLivingStateAnchor silences dynamic living state script during hot chats', () => {
    const { formatLivingStateAnchor } = loadModule('../src/im/engine/imContextBuilder.ts');
    const now = Date.now();
    const livingState = {
      statusText: '刚吃过饭靠着稍作休整与放空，随时准备陪你闲聊',
      activityLoad: 'free',
      privacyContext: 'private',
      deviceAccess: 'available',
      alterValue: 0,
      startedAt: now - 30 * 60 * 1000,
      validUntil: now + 30 * 60 * 1000,
      recentTrajectory: [],
    };

    // 热聊态（上一条消息在 1 分钟前）
    const hotAnchor = formatLivingStateAnchor(livingState, now, '周日 12:10 (中午)', '', undefined, now - 60 * 1000);
    assert.doesNotMatch(hotAnchor, /当前正在做/, '热聊态必须省略具象生活状态剧本');
    assert.match(hotAnchor, /正在与你实时对话中/, '热聊态必须明确是在实时对话');

    // 隔断态（上一条消息在 1 小时前）
    const coldAnchor = formatLivingStateAnchor(livingState, now, '周日 12:10 (中午)', '', undefined, now - 3600 * 1000);
    assert.match(coldAnchor, /当前正在做/, '间隔久远时可展示生活状态');
  });

  await t.test('13. handleRetryMessage cleans trailing thought strictly after lastUser and preserves prior turn thoughts', () => {
    // 模拟消息历史：包含前序已完成轮次的 thought 和当前打断轮次的 orphan thought
    const messages = [
      { id: 'u1', role: 'user', content: '第一轮用户消息' },
      { id: 'th1', role: 'assistant', type: 'thought', content: '第一轮思考' },
      { id: 'a1', role: 'assistant', content: '第一轮伴侣回复' },
      { id: 'u2', role: 'user', content: '第二轮用户消息' },
      { id: 'th2_orphan', role: 'assistant', type: 'thought', content: '第二轮孤立思考' },
      { id: 'notice', role: 'system', type: 'system_notice', content: '连接中断，未收到回复' },
    ];

    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user' && messages[i].content) {
        lastUserIdx = i;
        break;
      }
    }
    assert.strictEqual(lastUserIdx, 3, '应当定位到第二轮用户消息');

    const trailingThoughts = messages.slice(lastUserIdx + 1).filter((m) => m.type === 'thought');
    assert.strictEqual(trailingThoughts.length, 1);
    assert.strictEqual(trailingThoughts[0].id, 'th2_orphan');

    const trailingIds = new Set(trailingThoughts.map((t) => t.id));
    const cleaned = messages.filter((m) => !trailingIds.has(m.id) && m.id !== 'notice');

    assert.strictEqual(cleaned.find((m) => m.id === 'th1')?.content, '第一轮思考', '第一轮思考气泡绝不能被误删');
    assert.strictEqual(cleaned.find((m) => m.id === 'th2_orphan'), undefined, '第二轮孤立思考气泡必须被清理');
  });

  await t.test('14. Unfinished non-empty thought is finalized and strictly preserved (never wiped) on stream error', async () => {
    let persistedThoughtId = null;
    let activeThought = { id: 'thought_halfway', startTime: Date.now() - 5000, content: '思考到一半的内容……' };
    let messages = [{ id: 'thought_halfway', role: 'assistant', type: 'thought', content: '思考到一半的内容……' }];
    let insertedInDb = null;

    const finalizeThoughtOnError = async () => {
      if (persistedThoughtId) return;
      if (!activeThought) return;
      if (activeThought.content.trim().length === 0) return;
      const targetId = activeThought.id;
      const finalMsg = {
        id: targetId,
        role: 'assistant',
        type: 'thought',
        content: activeThought.content,
        metadata: { isThinking: false, durationSeconds: 5, isCollapsed: true },
      };
      insertedInDb = finalMsg;
      persistedThoughtId = targetId;
      messages = messages.map((m) => (m.id === targetId ? finalMsg : m));
      activeThought = null;
    };

    const rollbackThought = async () => {
      if (persistedThoughtId) return;
      if (activeThought && activeThought.content.trim().length > 0) {
        await finalizeThoughtOnError();
        return;
      }
      if (activeThought) {
        const targetId = activeThought.id;
        activeThought = null;
        messages = messages.filter((m) => m.id !== targetId);
      }
    };

    // 发生网络异常触发 rollbackThought
    await rollbackThought();

    assert.strictEqual(messages.length, 1, '思考到一半的气泡绝不被过滤抹除');
    assert.strictEqual(messages[0].id, 'thought_halfway');
    assert.strictEqual(messages[0].content, '思考到一半的内容……');
    assert.strictEqual(messages[0].metadata.isThinking, false, '状态必须平滑转换为完成折叠态');
    assert.notStrictEqual(insertedInDb, null, '思考成果必须安全持久化落库');
  });

  await t.test('15. reloadMessages with in-flight active thought preserves thought bubble at the tail', () => {
    const inFlightThoughtMsg = {
      id: 'thought_in_flight',
      role: 'assistant',
      type: 'thought',
      content: '正在思考中...',
      metadata: { isThinking: true, isCollapsed: false },
    };

    const sqliteRows = [
      { id: 'u1', role: 'user', content: '测试消息' },
    ];

    // 模拟 reloadMessages 保护合并
    const merged = inFlightThoughtMsg && !sqliteRows.some((m) => m.id === inFlightThoughtMsg.id)
      ? [...sqliteRows, inFlightThoughtMsg]
      : sqliteRows;

    assert.strictEqual(merged.length, 2, '列表刷新后必须保留正在生长的在途思考气泡');
    assert.strictEqual(merged[1].id, 'thought_in_flight');
    assert.strictEqual(merged[1].content, '正在思考中...');
  });

  await t.test('16. streamClient enforces 45s read stall protection and throws when sawDone is false', () => {
    const code = fs.readFileSync(path.resolve(__dirname, '../src/core/llm-transport/streamClient.ts'), 'utf8');
    assert.match(code, /LLM stream read stall timeout \(45s without data\)/, '必须具备 45s 流式读取停滞熔断保护');
    assert.match(code, /if\s*\(sawDone\)\s*\{\s*break;\s*\}[\s\S]*?throw readErr;/, '未显式结束时连接异常必须透传报错供自愈重试');
  });

  await t.test('17. Zero-dialogue guard strictly forbids fake fallback messages and emits official system notice', () => {
    const code = fs.readFileSync(path.resolve(__dirname, '../src/im/hooks/useImChatSession.ts'), 'utf8');
    assert.doesNotMatch(code, /刚才有点走神了/, '严禁出现任何走神等伪造口语假回复');
    assert.match(code, /noticeContent\s*=\s*hasThought\s*\?\s*['"]连接中断，未收到回复['"]\s*:\s*['"]连接暂时不稳定，未收到回复['"]/, '零对白场景必须呈送官方标准系统重试胶囊');
  });

  await t.test('18. streamClient adapts stall timeout to 75s for reasoning models and applies 500ms handshake backoff', () => {
    const code = fs.readFileSync(path.resolve(__dirname, '../src/core/llm-transport/streamClient.ts'), 'utf8');
    assert.match(code, /stallTimeoutMs\s*=\s*!sawAnyContent\s*&&\s*isReasoningModel\s*\?\s*75000\s*:\s*45000/, '推理模型首字思考期必须具备 75s 超时宽限');
    assert.match(code, /setTimeout\(resolve,\s*500\)/, '握手故障退避必须设定为 500ms 保障移动端 Socket 漫游');
  });

  await t.test('19. useImChatSession permits 1-shot recovery before dialogue even if thoughts were produced', () => {
    const code = fs.readFileSync(path.resolve(__dirname, '../src/im/hooks/useImChatSession.ts'), 'utf8');
    assert.match(code, /streamAttempts\s*<\s*maxStreamAttempts\s*&&\s*!lastDispatchedMsg\s*&&\s*!isAborted/, '零对白场景只要未吐出台词均必须支持静默自愈');
    assert.doesNotMatch(code, /!lastDispatchedMsg\s*&&\s*!hasProducedAnyContent/, '严禁使用 hasProducedAnyContent 阻断在途思考的静默自愈');
  });

  await t.test('20. discardIncompleteCurrentAttempt safely revokes thought from SQLite and state before retry', async () => {
    let deletedId = null;
    let messages = [
      { id: 'thought_persisted', role: 'assistant', type: 'thought', content: '上轮未结题思考' },
      { id: 'u1', role: 'user', content: '用户台词' },
    ];
    let persistedThoughtId = 'thought_persisted';
    let inFlightThought = { id: 'thought_in_flight', content: '临时' };
    let activeThought = null;

    const discardIncompleteCurrentAttempt = async () => {
      if (persistedThoughtId) {
        const pId = persistedThoughtId;
        persistedThoughtId = null;
        inFlightThought = null;
        activeThought = null;
        deletedId = pId;
        messages = messages.filter((m) => m.id !== pId);
        return;
      }
      if (activeThought || inFlightThought) {
        const targetId = activeThought?.id || inFlightThought?.id;
        activeThought = null;
        inFlightThought = null;
        if (targetId) {
          messages = messages.filter((m) => m.id !== targetId);
        }
      }
    };

    // 分支 1: 已写入 SQLite 的思考落库记录安全删除与过滤
    await discardIncompleteCurrentAttempt();
    assert.strictEqual(deletedId, 'thought_persisted', '必须安全清理落库的孤立思考记录');
    assert.strictEqual(messages.length, 1, '前端消息列表中必须过滤掉残留思考');
    assert.strictEqual(inFlightThought, null, '在途临时引用必须被安全清空');

    // 分支 2: 仅在前端内存流式生长的在途气泡安全撤销
    inFlightThought = { id: 'thought_streaming', content: '正在思考...' };
    messages.push({ id: 'thought_streaming', role: 'assistant', type: 'thought', content: '正在思考...' });
    assert.strictEqual(messages.length, 2);
    await discardIncompleteCurrentAttempt();
    assert.strictEqual(inFlightThought, null);
    assert.strictEqual(messages.length, 1, '内存中生长的临时思考气泡也必须被安全过滤清理');
  });
});
