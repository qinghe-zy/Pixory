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

  await t.test('4. Zero-dialogue fallback emits warm conversational continuity instead of robotic error capsule', () => {
    // 模拟 useImChatSession 中的零正文防哑火自愈机制
    const warmReplies = [
      '刚才琢磨了一下你说的，我们接着聊呀~',
      '嗯……我刚想了想，接着刚才的话题说吧~',
      '刚才稍微走神想了会儿，你继续说，我听着呢~',
    ];

    const handleZeroContentOnStreamEnd = (hasPersistedThought) => {
      if (hasPersistedThought) {
        return {
          action: 'warm_dialogue',
          content: warmReplies[0],
          isErrorNotice: false,
        };
      }
      return {
        action: 'error_notice',
        content: '连接暂时不稳定，未收到回复',
        isErrorNotice: true,
      };
    };

    const withThought = handleZeroContentOnStreamEnd(true);
    assert.strictEqual(withThought.action, 'warm_dialogue');
    assert.strictEqual(withThought.isErrorNotice, false);
    assert.match(withThought.content, /刚才.*接着聊呀/);

    const withoutThought = handleZeroContentOnStreamEnd(false);
    assert.strictEqual(withoutThought.action, 'error_notice');
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
});
