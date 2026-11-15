const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

function loadTsModule(relativePath, mockRequire = {}) {
  let targetPath = path.resolve(__dirname, relativePath);
  if (!targetPath.endsWith('.ts') && !targetPath.endsWith('.js')) {
    if (fs.existsSync(targetPath + '.ts')) targetPath += '.ts';
    else if (fs.existsSync(targetPath + '.js')) targetPath += '.js';
  }
  const code = fs.readFileSync(targetPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const customRequire = (reqPath) => {
    if (mockRequire[reqPath]) return mockRequire[reqPath];
    if (reqPath.startsWith('.')) {
      return loadTsModule(path.relative(__dirname, path.join(path.dirname(targetPath), reqPath)), mockRequire);
    }
    return require(reqPath);
  };
  new Function('module', 'exports', 'require', transpiled)(mod, mod.exports, customRequire);
  return mod.exports;
}

function createMemorySqliteAdapter() {
  const rawDb = new DatabaseSync(':memory:');
  const executedSqls = [];

  rawDb.exec(`
    CREATE TABLE ai_threads (
      id TEXT PRIMARY KEY NOT NULL,
      space TEXT NOT NULL DEFAULT 'normal',
      roleCardId TEXT,
      title TEXT NOT NULL,
      chat_mode TEXT NOT NULL DEFAULT 'im',
      lastMessagePreview TEXT,
      isPinned INTEGER NOT NULL DEFAULT 0,
      im_is_folded INTEGER DEFAULT 0,
      im_hidden_from_list INTEGER DEFAULT 0,
      living_state_json TEXT,
      consecutive_unreplied_count INTEGER DEFAULT 0,
      last_user_interaction_at INTEGER,
      pending_diary_hook TEXT,
      im_unread_count INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE ai_messages (
      id TEXT PRIMARY KEY NOT NULL,
      threadId TEXT NOT NULL,
      burst_group_id TEXT,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      delivery_status TEXT DEFAULT 'delivered',
      content TEXT NOT NULL,
      visible_at INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

  const normalizeParams = (params) => {
    if (params.length === 1 && Array.isArray(params[0])) {
      return params[0];
    }
    return params;
  };

  const dbAdapter = {
    getAllAsync: async (sql, ...params) => {
      executedSqls.push(sql);
      return rawDb.prepare(sql).all(...normalizeParams(params));
    },
    getFirstAsync: async (sql, ...params) => {
      executedSqls.push(sql);
      return rawDb.prepare(sql).get(...normalizeParams(params)) ?? null;
    },
    runAsync: async (sql, ...params) => {
      executedSqls.push(sql);
      const res = rawDb.prepare(sql).run(...normalizeParams(params));
      return { changes: res.changes, lastInsertRowId: Number(res.lastInsertRowid ?? 0) };
    },
    withTransactionAsync: async (fn) => {
      rawDb.exec('BEGIN IMMEDIATE');
      try {
        await fn();
        rawDb.exec('COMMIT');
      } catch (err) {
        rawDb.exec('ROLLBACK');
        throw err;
      }
    },
  };

  return { rawDb, dbAdapter, executedSqls };
}

test('tokenizeMultimodalSegment: emits exact ordered atoms without [BR] and supports long/outside-colon tags', () => {
  const { tokenizeMultimodalSegment, parseVoiceTag } = loadTsModule('../src/im/engine/imTagParser.ts');

  const input = '哈哈笑死我了[STICKER: 拍桌大笑]你这也太逗了吧[VOICE: 我跟你说个更绝的]';
  const atoms = tokenizeMultimodalSegment(input);
  assert.deepEqual(atoms, [
    { kind: 'text', payload: '哈哈笑死我了' },
    { kind: 'sticker', payload: '拍桌大笑' },
    { kind: 'text', payload: '你这也太逗了吧' },
    { kind: 'voice', payload: '[VOICE: 我跟你说个更绝的]' },
  ]);

  // Supports sticker descriptions > 10 chars (up to 40 chars) and outside-colon tags
  const longSticker = tokenizeMultimodalSegment('[STICKER: 开心得在原地转圈圈差点飞起来了]好耶');
  assert.deepEqual(longSticker, [
    { kind: 'sticker', payload: '开心得在原地转圈圈差点飞起来了' },
    { kind: 'text', payload: '好耶' },
  ]);

  const outsideColon = tokenizeMultimodalSegment('[STICKER]: 抱抱[VOICE]: 晚安好梦');
  assert.deepEqual(outsideColon, [
    { kind: 'sticker', payload: '抱抱' },
    { kind: 'voice', payload: '[VOICE]: 晚安好梦' },
  ]);

  // Plain text and blank handling
  assert.deepEqual(tokenizeMultimodalSegment('  普通文本消息  '), [{ kind: 'text', payload: '普通文本消息' }]);
  assert.deepEqual(tokenizeMultimodalSegment('   \n\t  '), []);

  // Outside-colon sticker captures single token instead of eating trailing prose
  assert.deepEqual(tokenizeMultimodalSegment('[STICKER]: 抱抱 今天忙什么呢'), [
    { kind: 'sticker', payload: '抱抱' },
    { kind: 'text', payload: '今天忙什么呢' },
  ]);

  // Nested bracket inside [VOICE: ...] stays intact
  assert.deepEqual(tokenizeMultimodalSegment('[VOICE: [语气: 撒娇] 晚安好梦]'), [
    { kind: 'voice', payload: '[VOICE: [语气: 撒娇] 晚安好梦]' },
  ]);
  const parsedNestedVoice = parseVoiceTag('[VOICE: [语气: 撒娇] 晚安好梦]');
  assert.ok(parsedNestedVoice);
  assert.equal(parsedNestedVoice.styleDirective, '撒娇');
  assert.equal(parsedNestedVoice.uiTranscript, '晚安好梦');
});

test('TagAwareStreamParser: splitRemainingFallback still splits trailing stickers after emittedCount > 0 and handles 40-char stickers', () => {
  const { TagAwareStreamParser } = loadTsModule('../src/im/engine/tagAwareStreamParser.ts');

  const parser = new TagAwareStreamParser();
  const s1 = parser.feed('第一句先发出去[BR]');
  assert.deepEqual(s1, ['第一句先发出去']);
  assert.equal(parser.getEmittedCount(), 1);

  // Directly invoke splitRemainingFallback on trailing multimodal segment with emittedCount > 0
  const fallbackParts = parser.splitRemainingFallback('哈哈[STICKER: 开心得在原地转圈圈差点飞起来了]后面还有');
  assert.deepEqual(fallbackParts, [
    '哈哈',
    '[STICKER: 开心得在原地转圈圈差点飞起来了]',
    '后面还有',
  ]);
  assert.equal(parser.getEmittedCount(), 4);

  // Streaming feed handles long sticker names > 10 chars cleanly
  const parser2 = new TagAwareStreamParser();
  const streamed = [
    ...parser2.feed('太棒了[STICKER: 开心得在原地转圈圈差点飞起来了]明天继续'),
    ...parser2.flush(),
  ];
  assert.deepEqual(streamed, ['太棒了', '[STICKER: 开心得在原地转圈圈差点飞起来了]', '明天继续']);
});

test('BurstMessageDispatcher: inline multimodal mix, silent drop vs sole compensation, voice downgrade, window cap, and waitForPendingDispatches', async () => {
  const inserted = [];
  let releaseDelayMs = 0;

  const { BurstMessageDispatcher } = loadTsModule('../src/im/engine/burstDispatcher.ts', {
    'react-native': { AppState: { addEventListener: () => ({ remove: () => {} }) } },
    '../../database': { runWithDatabaseSpace: async () => {}, initDatabase: async () => ({}) },
    '../repository/imThreadRepository': {
      getNextPendingVisibleAt: async () => null,
      getNextPendingVisibleRow: async () => null,
      insertImMessage: async (_space, msg) => {
        if (releaseDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, releaseDelayMs));
        }
        inserted.push(msg);
      },
      revealPendingMessages: async () => 0,
      updateImMessageVoice: async () => {},
    },
    '../../services/agent/vfs/casBlobStore': { CasBlobStore: class {} },
    '../../services/sandbox/diff/fuzzyPatcher': { applyBatchSafely: () => ({ appliedCount: 0, resultText: '' }) },
    '../../voice/voiceService': { voiceService: { prepareAudio: async () => ({ audioUri: '', durationMs: 1000 }) } },
  });

  // 1. Mixed text + unknown sticker + text + voice -> silently drops unknown sticker (no "不存在的贴纸]" or "✨")
  const dispatcher = new BurstMessageDispatcher('th_mix', 'normal');
  dispatcher.beginBurst();
  await dispatcher.dispatchSentence('哈哈笑死我了[STICKER: 不存在的贴纸]你这也太逗了吧[VOICE: 我跟你说个更绝的]');
  await dispatcher.flushPendingStickerCompensationIfEmpty();
  await dispatcher.waitForPendingDispatches();

  assert.deepEqual(
    inserted.map((m) => ({ type: m.type, content: m.content })),
    [
      { type: 'text', content: '哈哈笑死我了' },
      { type: 'text', content: '你这也太逗了吧' },
      { type: 'voice', content: '我跟你说个更绝的' },
    ]
  );
  assert.equal(dispatcher.getDispatchedCountInBurst(), 3);

  // 2. Pure sole unknown sticker -> flushPendingStickerCompensationIfEmpty emits fallback emoji once
  inserted.length = 0;
  dispatcher.beginBurst();
  const soleRes = await dispatcher.dispatchSentence('[STICKER: 不存在的贴纸]');
  assert.equal(soleRes, null);
  assert.equal(dispatcher.getDispatchedCountInBurst(), 0);
  const compMsg = await dispatcher.flushPendingStickerCompensationIfEmpty();
  assert.ok(compMsg);
  assert.equal(compMsg.type, 'text');
  assert.equal(compMsg.content, '✨');
  assert.equal(dispatcher.getDispatchedCountInBurst(), 1);

  // 3. Unknown sticker after empty-sanitized control tag alone also compensates if burst remains empty
  inserted.length = 0;
  dispatcher.beginBurst();
  await dispatcher.dispatchSentence('[PASS][STICKER: 不存在的贴纸]');
  const compAfterPass = await dispatcher.flushPendingStickerCompensationIfEmpty();
  assert.ok(compAfterPass);
  assert.equal(compAfterPass.content, '✨');

  // 3b. Unknown sticker followed only by an empty-transcript [VOICE: | ] tag still compensates
  inserted.length = 0;
  dispatcher.beginBurst();
  await dispatcher.dispatchSentence('[STICKER: 不存在的贴纸][VOICE: 轻声 |   ]');
  const compWithEmptyVoice = await dispatcher.flushPendingStickerCompensationIfEmpty();
  assert.ok(compWithEmptyVoice);
  assert.equal(compWithEmptyVoice.content, '✨');

  // 4. Unknown sticker followed by text in later sentence suppresses compensation
  inserted.length = 0;
  dispatcher.beginBurst();
  await dispatcher.dispatchSentence('[STICKER: 不存在的贴纸]');
  await dispatcher.dispatchSentence('算了不发图了');
  const compLater = await dispatcher.flushPendingStickerCompensationIfEmpty();
  assert.equal(compLater, null);
  assert.deepEqual(inserted.map((m) => m.content), ['算了不发图了']);

  // 5. voiceReplyEnabled=false degrades voice atom to plain text without infinite recursion
  inserted.length = 0;
  dispatcher.beginBurst();
  await dispatcher.dispatchSentence('[VOICE: 懒洋洋 | 早上好呀]', undefined, { voiceReplyEnabled: false });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].type, 'text');
  assert.equal(inserted[0].content, '早上好呀');

  // 6. waitForPendingDispatches drains unawaited async dispatches
  inserted.length = 0;
  releaseDelayMs = 25;
  dispatcher.beginBurst();
  void dispatcher.dispatchSentence('第一条[STICKER: 抱抱]第二条');
  await dispatcher.waitForPendingDispatches();
  assert.equal(inserted.length, 3);
  assert.deepEqual(inserted.map((m) => m.type), ['text', 'sticker', 'text']);

  // 7. Window compression: beyond 6000ms accumulated delay, incremental non-first delta compresses to 180~300ms
  releaseDelayMs = 0;
  inserted.length = 0;
  dispatcher.beginBurst();
  for (let i = 0; i < 8; i += 1) {
    await dispatcher.dispatchSentence(
      `第${i + 1}条这是一句用来撑满六秒窗口的长句子内容呀哈哈哈哈哈哈哈哈`,
      undefined,
      { useHumanTimeline: true, userTextLength: 50 }
    );
  }
  const deltas = [];
  for (let i = 1; i < inserted.length; i += 1) {
    deltas.push(inserted[i].visibleAt - inserted[i - 1].visibleAt);
  }
  assert.ok(deltas[deltas.length - 1] >= 180 && deltas[deltas.length - 1] <= 300, `Expected compressed tail delta in 180~300ms, got ${deltas[deltas.length - 1]}`);

  // 8. Empty/whitespace voice tags when voiceReplyEnabled=false emit 0 bubbles (never leak "]")
  inserted.length = 0;
  dispatcher.beginBurst();
  await dispatcher.dispatchSentence('[VOICE:   ]', undefined, { voiceReplyEnabled: false });
  await dispatcher.dispatchSentence('[VOICE: 轻声 |   ]', undefined, { voiceReplyEnabled: false });
  assert.equal(inserted.length, 0);

  // 9. Concurrent dispatchSentence calls are serialized without inverting timestamps or order
  inserted.length = 0;
  releaseDelayMs = 15;
  dispatcher.beginBurst();
  await Promise.all([
    dispatcher.dispatchSentence('第一句'),
    dispatcher.dispatchSentence('第二句'),
  ]);
  await dispatcher.waitForPendingDispatches();
  assert.equal(inserted.length, 2);
  assert.deepEqual(inserted.map((m) => m.content), ['第一句', '第二句']);
  assert.ok(
    inserted[0].visibleAt < inserted[1].visibleAt,
    `Expected concurrent visibleAt monotonic: ${inserted[0].visibleAt} < ${inserted[1].visibleAt}`
  );

  // 10. Fenced code block passes through dispatchSentence as a single text bubble without stripping inner [STICKER:]
  inserted.length = 0;
  releaseDelayMs = 0;
  dispatcher.beginBurst();
  const codeBlock = '```ts\nconst s = "[STICKER: 抱抱]";\n```';
  await dispatcher.dispatchSentence(codeBlock);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].type, 'text');
  assert.equal(inserted[0].content, codeBlock);

  // 11. Burst epoch interrupt cancels remaining atoms mid-dispatchSentence cleanly
  inserted.length = 0;
  releaseDelayMs = 20;
  dispatcher.beginBurst();
  const inflight = dispatcher.dispatchSentence('第一句[STICKER: 抱抱]第二句');
  // Yield briefly so first atom starts insertImMessage, then cancel burst epoch
  await new Promise((r) => setTimeout(r, 5));
  dispatcher.cancelPendingBurst();
  await inflight;
  await dispatcher.waitForPendingDispatches();
  assert.equal(inserted.length, 1, 'Cancelled burst must abort subsequent sticker and text atoms');
  assert.equal(inserted[0].content, '第一句');
});

test('getContextMessagesFromAnchor & flushRevealingAndCancelStagedBubbles: SQLite contract, thought exclusion, and timestamp clamping', async () => {
  const { rawDb, dbAdapter, executedSqls } = createMemorySqliteAdapter();

  const repo = loadTsModule('../src/im/repository/imThreadRepository.ts', {
    '../../database': {
      initDatabase: async () => dbAdapter,
      withScopedTransaction: async (db, fn) => db.withTransactionAsync(() => fn(db)),
    },
    '../heartbeat/imDndGuard': {
      isGoodnightMessage: () => false,
      shouldExpireGoodnightEnvelope: () => false,
    },
  });

  const { imMessageRollback } = loadTsModule('../src/im/engine/imMessageRollback.ts', {
    '../../database': { initDatabase: async () => dbAdapter },
    '../repository/imThreadRepository': repo,
  });

  const baseMs = 1760000000000;
  rawDb.prepare(`INSERT INTO ai_threads (id, space, title, chat_mode, createdAt, updatedAt) VALUES (?, ?, ?, 'im', ?, ?);`)
    .run('th_1', 'normal', '小依', new Date(baseMs).toISOString(), new Date(baseMs).toISOString());

  const insertStmt = rawDb.prepare(
    `INSERT INTO ai_messages (id, threadId, role, status, delivery_status, content, visible_at, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`
  );

  // Delivered messages including a thought message
  insertStmt.run('m_user_1', 'th_1', 'user', 'completed', 'delivered', '早安', null, new Date(baseMs + 1000).toISOString(), new Date(baseMs + 1000).toISOString());
  insertStmt.run('m_thought_1', 'th_1', 'assistant', 'completed', 'delivered', JSON.stringify({ type: 'thought', content: '思考过程不应该进上下文', durationSeconds: 2, isCollapsed: true }), null, new Date(baseMs + 2000).toISOString(), new Date(baseMs + 2000).toISOString());
  insertStmt.run('m_ai_1', 'th_1', 'assistant', 'completed', 'delivered', '早安呀', null, new Date(baseMs + 3000).toISOString(), new Date(baseMs + 3000).toISOString());

  // 1. getVisibleImMessages keeps thought for UI, while getContextMessagesFromAnchor excludes thought on both branches
  const visibleAll = await repo.getVisibleImMessages('normal', 'th_1', 50);
  assert.equal(visibleAll.some((m) => m.type === 'thought'), true, 'UI visible messages must retain thought');

  const ctxAnchored = await repo.getContextMessagesFromAnchor('normal', 'th_1', 'm_user_1', 50);
  assert.deepEqual(ctxAnchored.map((m) => m.id), ['m_user_1', 'm_ai_1']);

  const ctxFallback = await repo.getContextMessagesFromAnchor('normal', 'th_1', null, 50);
  assert.deepEqual(ctxFallback.map((m) => m.id), ['m_user_1', 'm_ai_1']);

  for (const sql of executedSqls) {
    assert.doesNotMatch(sql, /\btype\b/i, `SQL on ai_messages must NEVER reference non-existent column "type": ${sql}`);
  }

  // 2. flushRevealingAndCancelStagedBubbles promotes revealing bubbles strictly < beforeTimestampMs in chronological order and deletes staged
  const interruptMs = baseMs + 5000;
  // Insert 3 revealing bubbles: one past/due (baseMs+4000), two future (baseMs+6000, baseMs+8000), plus 2 staged bubbles
  insertStmt.run('m_rev_1', 'th_1', 'assistant', 'sent', 'revealing', '第一句', baseMs + 4000, new Date(baseMs + 4000).toISOString(), new Date(baseMs + 4000).toISOString());
  insertStmt.run('m_rev_2', 'th_1', 'assistant', 'sent', 'revealing', '第二句', baseMs + 6000, new Date(baseMs + 6000).toISOString(), new Date(baseMs + 6000).toISOString());
  insertStmt.run('m_rev_3', 'th_1', 'assistant', 'sent', 'revealing', '第三句[BR]收尾', baseMs + 8000, new Date(baseMs + 8000).toISOString(), new Date(baseMs + 8000).toISOString());
  insertStmt.run('m_stg_1', 'th_1', 'assistant', 'sent', 'staged', '预埋心跳1', baseMs + 30000, new Date(baseMs + 30000).toISOString(), new Date(baseMs + 30000).toISOString());
  insertStmt.run('m_stg_2', 'th_1', 'assistant', 'sent', 'staged', '预埋心跳2', baseMs + 60000, new Date(baseMs + 60000).toISOString(), new Date(baseMs + 60000).toISOString());

  const flushResult = await imMessageRollback.flushRevealingAndCancelStagedBubbles('th_1', 'normal', interruptMs);
  assert.deepEqual(flushResult, { flushedCount: 3, cancelledStagedCount: 2 });

  const flushedRows = rawDb
    .prepare(`SELECT id, status, delivery_status, visible_at, createdAt FROM ai_messages WHERE id IN ('m_rev_1', 'm_rev_2', 'm_rev_3') ORDER BY visible_at ASC;`)
    .all();

  assert.equal(flushedRows.length, 3);
  for (const row of flushedRows) {
    assert.equal(row.delivery_status, 'delivered');
    assert.equal(row.status, 'completed');
    assert.ok(row.visible_at < interruptMs, `visible_at must be < ${interruptMs}, got ${row.visible_at}`);
    assert.equal(row.createdAt, new Date(row.visible_at).toISOString());
  }
  assert.deepEqual(flushedRows.map((r) => r.id), ['m_rev_1', 'm_rev_2', 'm_rev_3']);
  assert.equal(flushedRows[0].visible_at, baseMs + 4000);
  assert.equal(flushedRows[1].visible_at, interruptMs - 2);
  assert.equal(flushedRows[2].visible_at, interruptMs - 1);
  assert.ok(flushedRows[0].visible_at < flushedRows[1].visible_at);
  assert.ok(flushedRows[1].visible_at < flushedRows[2].visible_at);

  // Staged messages deleted
  const stagedRemaining = rawDb.prepare(`SELECT COUNT(*) AS cnt FROM ai_messages WHERE delivery_status = 'staged';`).get();
  assert.equal(stagedRemaining.cnt, 0);

  // Thread preview updated
  const threadRow = rawDb.prepare(`SELECT lastMessagePreview FROM ai_threads WHERE id = 'th_1';`).get();
  assert.equal(threadRow.lastMessagePreview, '第三句 收尾');

  // Verify tied future timestamps also preserve strict monotonic order < beforeTimestampMs
  const tieInterruptMs = baseMs + 20000;
  insertStmt.run('m_tie_1', 'th_1', 'assistant', 'sent', 'revealing', '同刻A', baseMs + 25000, new Date(baseMs + 25000).toISOString(), new Date(baseMs + 25000).toISOString());
  insertStmt.run('m_tie_2', 'th_1', 'assistant', 'sent', 'revealing', '同刻B', baseMs + 25000, new Date(baseMs + 25000).toISOString(), new Date(baseMs + 25000).toISOString());
  const tieRes = await repo.flushRevealingAndCancelStagedBubbles('normal', 'th_1', tieInterruptMs);
  assert.deepEqual(tieRes, { flushedCount: 2, cancelledStagedCount: 0 });
  const tieRows = rawDb.prepare(`SELECT id, visible_at FROM ai_messages WHERE id IN ('m_tie_1', 'm_tie_2') ORDER BY visible_at ASC;`).all();
  assert.deepEqual(tieRows.map((r) => r.id), ['m_tie_1', 'm_tie_2']);
  assert.equal(tieRows[0].visible_at, tieInterruptMs - 2);
  assert.equal(tieRows[1].visible_at, tieInterruptMs - 1);

  // Skips thought preview override and preserves newer ai_threads.updatedAt
  const newerIso = new Date(baseMs + 90000).toISOString();
  rawDb.prepare(`UPDATE ai_threads SET lastMessagePreview = ?, updatedAt = ? WHERE id = 'th_1';`).run('保留旧预览', newerIso);
  insertStmt.run(
    'm_rev_thought_only',
    'th_1',
    'assistant',
    'sent',
    'revealing',
    JSON.stringify({ type: 'thought', content: '纯内心思考', durationSeconds: 1, isCollapsed: true }),
    baseMs + 30000,
    new Date(baseMs + 30000).toISOString(),
    new Date(baseMs + 30000).toISOString()
  );
  const thoughtFlushRes = await repo.flushRevealingAndCancelStagedBubbles('normal', 'th_1', baseMs + 40000);
  assert.equal(thoughtFlushRes.flushedCount, 1);
  const afterThoughtThread = rawDb.prepare(`SELECT lastMessagePreview, updatedAt FROM ai_threads WHERE id = 'th_1';`).get();
  assert.equal(afterThoughtThread.lastMessagePreview, '保留旧预览');
  assert.equal(afterThoughtThread.updatedAt, newerIso);

  // Mixed revealing (text followed by trailing thought) selects the last non-thought preview when thread updatedAt advances
  const olderIso = new Date(baseMs + 40000).toISOString();
  rawDb.prepare(`UPDATE ai_threads SET lastMessagePreview = ?, updatedAt = ? WHERE id = 'th_1';`).run('更早预览', olderIso);
  insertStmt.run('m_rev_real', 'th_1', 'assistant', 'sent', 'revealing', '真正文气泡', baseMs + 41000, new Date(baseMs + 41000).toISOString(), new Date(baseMs + 41000).toISOString());
  insertStmt.run(
    'm_rev_trail_thought',
    'th_1',
    'assistant',
    'sent',
    'revealing',
    JSON.stringify({ type: 'thought', content: '尾随思考', durationSeconds: 1, isCollapsed: true }),
    baseMs + 42000,
    new Date(baseMs + 42000).toISOString(),
    new Date(baseMs + 42000).toISOString()
  );
  await repo.flushRevealingAndCancelStagedBubbles('normal', 'th_1', baseMs + 50000);
  const afterMixedThread = rawDb.prepare(`SELECT lastMessagePreview, updatedAt FROM ai_threads WHERE id = 'th_1';`).get();
  assert.equal(afterMixedThread.lastMessagePreview, '真正文气泡');
  assert.equal(afterMixedThread.updatedAt, new Date(baseMs + 42000).toISOString());

  // Pre-existing newer updatedAt preserves BOTH updatedAt and lastMessagePreview (e.g. interrupting user message)
  const userLatestIso = new Date(baseMs + 120000).toISOString();
  rawDb.prepare(`UPDATE ai_threads SET lastMessagePreview = ?, updatedAt = ? WHERE id = 'th_1';`).run('用户最新打断消息', userLatestIso);
  insertStmt.run('m_old_rev', 'th_1', 'assistant', 'sent', 'revealing', '较早残留气泡', baseMs + 100000, new Date(baseMs + 100000).toISOString(), new Date(baseMs + 100000).toISOString());
  await repo.flushRevealingAndCancelStagedBubbles('normal', 'th_1', baseMs + 110000);
  const preservedThread = rawDb.prepare(`SELECT lastMessagePreview, updatedAt FROM ai_threads WHERE id = 'th_1';`).get();
  assert.equal(preservedThread.lastMessagePreview, '用户最新打断消息');
  assert.equal(preservedThread.updatedAt, userLatestIso);

  // NULL visible_at row sorts AFTER timed rows rather than before them
  insertStmt.run('m_null_vis', 'th_1', 'assistant', 'sent', 'revealing', '空visibleAt尾行', null, new Date(baseMs + 125000).toISOString(), new Date(baseMs + 125000).toISOString());
  insertStmt.run('m_timed_vis', 'th_1', 'assistant', 'sent', 'revealing', '定时首行', baseMs + 130000, new Date(baseMs + 130000).toISOString(), new Date(baseMs + 130000).toISOString());
  await repo.flushRevealingAndCancelStagedBubbles('normal', 'th_1', baseMs + 140000);
  const orderedNullTest = rawDb
    .prepare(`SELECT id, visible_at FROM ai_messages WHERE id IN ('m_timed_vis', 'm_null_vis') ORDER BY visible_at ASC;`)
    .all();
  assert.deepEqual(orderedNullTest.map((r) => r.id), ['m_timed_vis', 'm_null_vis']);
  assert.ok(orderedNullTest[0].visible_at < orderedNullTest[1].visible_at);

  // Works cleanly via sequential fallback when DB mock omits withTransactionAsync
  const noTxAdapter = {
    getAllAsync: dbAdapter.getAllAsync,
    getFirstAsync: dbAdapter.getFirstAsync,
    runAsync: dbAdapter.runAsync,
  };
  const noTxRepo = loadTsModule('../src/im/repository/imThreadRepository.ts', {
    '../../database': { initDatabase: async () => noTxAdapter },
    '../heartbeat/imDndGuard': {
      isGoodnightMessage: () => false,
      shouldExpireGoodnightEnvelope: () => false,
    },
  });
  insertStmt.run('m_notx_1', 'th_1', 'assistant', 'sent', 'revealing', '无事务降级测试', baseMs + 150000, new Date(baseMs + 150000).toISOString(), new Date(baseMs + 150000).toISOString());
  const noTxRes = await noTxRepo.flushRevealingAndCancelStagedBubbles('normal', 'th_1', baseMs + 160000);
  assert.equal(noTxRes.flushedCount, 1);
  const afterNoTxThread = rawDb.prepare(`SELECT lastMessagePreview FROM ai_threads WHERE id = 'th_1';`).get();
  assert.equal(afterNoTxThread.lastMessagePreview, '无事务降级测试');
});

test('Flush-on-User-Interrupt: applyFlushedInterruptToMessages clamps timestamps & all send paths await interrupt(true)', () => {
  const sessionPath = path.resolve(__dirname, '../src/im/hooks/useImChatSession.ts');
  const sessionCode = fs.readFileSync(sessionPath, 'utf8');

  const createStubProxy = () =>
    new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === '__esModule') return true;
        return createStubProxy();
      },
      apply() {
        return {};
      },
    });
  const transpiled = ts.transpileModule(sessionCode, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', transpiled)(mod, mod.exports, () => createStubProxy());

  const { applyFlushedInterruptToMessages } = mod.exports;
  assert.equal(typeof applyFlushedInterruptToMessages, 'function');

  const baseMs = Date.UTC(2026, 4, 15, 10, 0, 0);
  const inputMsgs = [
    { id: 'u1', role: 'user', content: '在吗', deliveryStatus: 'delivered', visibleAt: null, createdAt: new Date(baseMs - 5000).toISOString() },
    { id: 'a1', role: 'assistant', content: '第一句', deliveryStatus: 'revealing', status: 'sent', visibleAt: baseMs + 5000, createdAt: new Date(baseMs + 5000).toISOString() },
    { id: 'a2', role: 'assistant', content: '第二句', deliveryStatus: 'revealing', status: 'sent', visibleAt: baseMs + 9000, createdAt: new Date(baseMs + 9000).toISOString() },
    { id: 's1', role: 'assistant', content: '预埋追问', deliveryStatus: 'staged', visibleAt: baseMs + 60000, createdAt: new Date(baseMs + 60000).toISOString() },
  ];

  const flushed = applyFlushedInterruptToMessages(inputMsgs, baseMs);
  assert.deepEqual(flushed.map((m) => m.id), ['u1', 'a1', 'a2'], 'staged messages must be removed from UI state');
  assert.equal(flushed[1].deliveryStatus, 'delivered');
  assert.equal(flushed[2].deliveryStatus, 'delivered');
  assert.ok(flushed[1].visibleAt < flushed[2].visibleAt && flushed[2].visibleAt < baseMs, 'clamped timestamps must preserve order strictly before interruptBeforeMs');
  assert.equal(flushed[1].createdAt, new Date(flushed[1].visibleAt).toISOString());
  assert.equal(flushed[2].createdAt, new Date(flushed[2].visibleAt).toISOString());

  // Verify interruptCompanionActivity + all 7 user send paths + triggerAiResponse flush guard
  const interruptMatches = sessionCode.match(/await interruptCompanionActivity\(true\)/g) || [];
  assert.equal(interruptMatches.length, 7, 'All 7 user send paths (text/voice/sticker/camera/photo/file/ip) must await interruptCompanionActivity(true)');
  assert.ok(sessionCode.includes('flushRevealingAndCancelStagedBubbles('), 'useImChatSession must invoke flushRevealingAndCancelStagedBubbles');
  assert.ok(sessionCode.includes('Math.min(Date.now(), latestUserCreatedAtMs)'), 'triggerAiResponse must compute interruptBeforeMs bounded by latestUserCreatedAtMs');
});
