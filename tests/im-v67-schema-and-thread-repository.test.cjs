const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

test('IM V67 schema and repository policy verification', async (t) => {
  const schemaPath = path.resolve(__dirname, '../src/database/schema.ts');
  const dbPath = path.resolve(__dirname, '../src/database/db.ts');
  const repoPath = path.resolve(__dirname, '../src/im/repository/imThreadRepository.ts');

  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  const dbContent = fs.readFileSync(dbPath, 'utf8');
  const repoContent = fs.readFileSync(repoPath, 'utf8');

  await t.test('schema.ts defines DATABASE_VERSION >= 67 and MIGRATION_STATEMENTS_V67', () => {
    assert.match(schemaContent, /export const DATABASE_VERSION = (6[7-9]|7[0-9]);/);
    assert.match(schemaContent, /export const MIGRATION_STATEMENTS_V67/);
    assert.match(schemaContent, /ALTER TABLE ai_threads ADD COLUMN chat_mode TEXT NOT NULL DEFAULT 'standard';/);
    assert.match(schemaContent, /idx_ai_threads_unique_im_role/);
    assert.match(schemaContent, /ALTER TABLE ai_messages ADD COLUMN visible_at INTEGER;/);
    assert.match(schemaContent, /ALTER TABLE ai_messages ADD COLUMN burst_group_id TEXT;/);
    assert.match(schemaContent, /CREATE INDEX IF NOT EXISTS idx_ai_messages_visible_at/);
  });

  await t.test('db.ts registers and executes V67 migration', () => {
    assert.match(dbContent, /MIGRATION_STATEMENTS_V67/);
    assert.match(dbContent, /currentVersion < 67/);
    assert.match(dbContent, /database\.execAsync\(MIGRATION_STATEMENTS_V67\)/);
  });

  await t.test('imThreadRepository exports 1:1 binding, soft reset, and fast-lane queries', () => {
    assert.match(repoContent, /export async function getOrCreateImThread/);
    assert.match(repoContent, /export async function getImThreadById/);
    assert.match(repoContent, /export async function listImThreads/);
    assert.match(repoContent, /export async function clearImThreadHistory/);
    assert.match(repoContent, /export async function deleteImThread/);
    assert.match(repoContent, /export async function getVisibleImMessages/);
    assert.match(repoContent, /export async function getNextPendingVisibleAt/);
    assert.match(repoContent, /export async function insertImMessage/);
    assert.match(repoContent, /export async function deleteImMessage/);
    assert.match(repoContent, /export async function truncateDownstreamMessages/);
    assert.match(repoContent, /export function extractDiaryCardDate/);
  });

  await t.test('SQLite in-memory simulation: validates V67 unique index and visible_at integer logic', () => {
    const db = new DatabaseSync(':memory:');

    // 1. 创建基础表 (模仿 V66 结构)
    db.exec(`
      CREATE TABLE ai_threads (
        id TEXT PRIMARY KEY NOT NULL,
        space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
        contextType TEXT NOT NULL,
        title TEXT NOT NULL,
        roleCardId TEXT,
        isPinned INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE ai_messages (
        id TEXT PRIMARY KEY NOT NULL,
        threadId TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        content TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);

    // 2. 执行 V67 迁移
    db.exec(`
      ALTER TABLE ai_threads ADD COLUMN chat_mode TEXT NOT NULL DEFAULT 'standard';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_threads_unique_im_role 
        ON ai_threads(roleCardId, space) 
        WHERE chat_mode = 'im' AND roleCardId IS NOT NULL;

      ALTER TABLE ai_messages ADD COLUMN visible_at INTEGER;
      ALTER TABLE ai_messages ADD COLUMN burst_group_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_ai_messages_visible_at 
        ON ai_messages(threadId, visible_at);
      CREATE INDEX IF NOT EXISTS idx_ai_messages_burst_group 
        ON ai_messages(threadId, burst_group_id);
    `);

    // 3. 验证 IM 会话 1:1 强绑定
    db.exec(`
      INSERT INTO ai_threads (id, space, contextType, title, roleCardId, chat_mode, createdAt, updatedAt)
      VALUES ('im_1', 'normal', 'normal', 'Rem', 'role_rem', 'im', '2026-10-25T00:00:00Z', '2026-10-25T00:00:00Z');
    `);

    // 尝试在同一空间下插入第二个相同 roleCardId 的 IM 会话 -> 必须抛出唯一约束冲突
    assert.throws(() => {
      db.exec(`
        INSERT INTO ai_threads (id, space, contextType, title, roleCardId, chat_mode, createdAt, updatedAt)
        VALUES ('im_2', 'normal', 'normal', 'Rem Duplicate', 'role_rem', 'im', '2026-10-25T00:01:00Z', '2026-10-25T00:01:00Z');
      `);
    }, /UNIQUE constraint failed/);

    // 验证不同 space 下允许绑定同一角色卡
    db.exec(`
      INSERT INTO ai_threads (id, space, contextType, title, roleCardId, chat_mode, createdAt, updatedAt)
      VALUES ('im_personal', 'personal', 'normal', 'Rem Personal', 'role_rem', 'im', '2026-10-25T00:00:00Z', '2026-10-25T00:00:00Z');
    `);

    // 验证长聊天不受此唯一约束限制 (chat_mode = 'standard')
    db.exec(`
      INSERT INTO ai_threads (id, space, contextType, title, roleCardId, chat_mode, createdAt, updatedAt)
      VALUES ('std_1', 'normal', 'normal', 'Rem Long 1', 'role_rem', 'standard', '2026-10-25T00:00:00Z', '2026-10-25T00:00:00Z');
      INSERT INTO ai_threads (id, space, contextType, title, roleCardId, chat_mode, createdAt, updatedAt)
      VALUES ('std_2', 'normal', 'normal', 'Rem Long 2', 'role_rem', 'standard', '2026-10-25T00:00:00Z', '2026-10-25T00:00:00Z');
    `);

    // 4. 验证 visible_at INTEGER 快速数值索引查询
    const now = Date.now();
    db.exec(`
      INSERT INTO ai_messages (id, threadId, role, status, content, visible_at, createdAt, updatedAt)
      VALUES 
        ('m1', 'im_1', 'user', 'completed', 'Hi Rem', NULL, '2026-10-25T00:00:00Z', '2026-10-25T00:00:00Z'),
        ('m2', 'im_1', 'assistant', 'completed', 'Burst 1', ${now - 1000}, '2026-10-25T00:00:01Z', '2026-10-25T00:00:01Z'),
        ('m3', 'im_1', 'assistant', 'completed', 'Burst 2 (Future)', ${now + 5000}, '2026-10-25T00:00:02Z', '2026-10-25T00:00:02Z');
    `);

    const queryStmt = db.prepare(`
      SELECT id FROM ai_messages
      WHERE threadId = 'im_1' AND (visible_at IS NULL OR visible_at <= ?)
      ORDER BY createdAt DESC;
    `);
    const visibleRows = queryStmt.all(now);
    assert.equal(visibleRows.length, 2);
    assert.deepEqual(visibleRows.map(r => r.id), ['m2', 'm1']);

    // 5. 验证 Soft Reset：清空 messages 但保留 thread 实体
    db.exec(`DELETE FROM ai_messages WHERE threadId = 'im_1';`);
    const remainingThread = db.prepare(`SELECT id, roleCardId FROM ai_threads WHERE id = 'im_1';`).get();
    assert.ok(remainingThread);
    assert.equal(remainingThread.roleCardId, 'role_rem');

    db.close();
  });

  await t.test('listImThreads SQL ordering: sorts descending by most recent chat, pinned first, unchatted below', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE ai_role_cards (
        id TEXT PRIMARY KEY,
        space TEXT NOT NULL,
        name TEXT NOT NULL,
        avatarUri TEXT,
        avatarEnabled INTEGER DEFAULT 1,
        firstMessage TEXT,
        updatedAt TEXT NOT NULL,
        archivedAt TEXT
      );
      CREATE TABLE ai_threads (
        id TEXT PRIMARY KEY,
        space TEXT NOT NULL,
        title TEXT NOT NULL,
        roleCardId TEXT,
        chat_mode TEXT NOT NULL DEFAULT 'standard',
        lastMessagePreview TEXT,
        isPinned INTEGER DEFAULT 0,
        updatedAt TEXT NOT NULL,
        archivedAt TEXT
      );
      CREATE TABLE ai_messages (
        id TEXT PRIMARY KEY,
        threadId TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        completedAt TEXT,
        createdAt TEXT NOT NULL
      );
    `);

    // 预置数据：
    // Role A: 昨天聊过 IM
    // Role B: 刚刚聊过 IM (19:50)
    // Role C: 曾有长聊消息 (18:00)，无 IM
    // Role D: 刚添加/导入 (19:55)，从未聊过
    // Role E: 置顶，从未聊过 (19:00)
    db.exec(`
      INSERT INTO ai_role_cards (id, space, name, firstMessage, updatedAt) VALUES
        ('r_a', 'normal', '胡桃', '你好呀', '2026-10-20T10:00:00Z'),
        ('r_b', 'normal', '可莉', '可莉来啦', '2026-10-20T10:00:00Z'),
        ('r_c', 'normal', '芙宁娜', '我是水神', '2026-10-20T10:00:00Z'),
        ('r_d', 'normal', '雷电将军', '此身即永恒', '2026-10-25T19:55:00Z'),
        ('r_e', 'normal', '钟离', '欲买桂花同载酒', '2026-10-25T19:00:00Z');

      INSERT INTO ai_threads (id, space, title, roleCardId, chat_mode, lastMessagePreview, isPinned, updatedAt) VALUES
        ('th_a', 'normal', '胡桃', 'r_a', 'im', '明天见', 0, '2026-10-24T12:00:00Z'),
        ('th_b', 'normal', '可莉', 'r_b', 'im', '去炸鱼', 0, '2026-10-25T19:50:00Z'),
        ('th_c_long', 'normal', '芙宁娜', 'r_c', 'standard', '剧情进展', 0, '2026-10-25T18:00:00Z'),
        ('th_e', 'normal', '钟离', 'r_e', 'im', NULL, 1, '2026-10-25T19:00:00Z');

      INSERT INTO ai_messages (id, threadId, role, content, createdAt) VALUES
        ('m_a', 'th_a', 'user', '明天见', '2026-10-24T12:00:00Z'),
        ('m_b', 'th_b', 'assistant', '去炸鱼', '2026-10-25T19:50:00Z'),
        ('m_c', 'th_c_long', 'user', '剧情进展', '2026-10-25T18:00:00Z');
    `);

    const query = `
      SELECT * FROM (
        SELECT
           r.id AS roleCardId,
           r.name AS roleName,
           r.avatarUri AS avatarUri,
           r.avatarEnabled AS avatarEnabled,
           r.firstMessage AS firstMessage,
           r.updatedAt AS roleUpdatedAt,
           t.id AS threadId,
           t.title AS threadTitle,
           t.lastMessagePreview AS lastMessagePreview,
           COALESCE(t.isPinned, 0) AS isPinned,
           t.updatedAt AS threadUpdatedAt,
           COALESCE(
             im_msg.lastImMsgAt,
             CASE WHEN t.lastMessagePreview IS NOT NULL THEN t.updatedAt ELSE NULL END,
             role_act.lastChatAt
           ) AS lastChatAt
         FROM ai_role_cards r
         LEFT JOIN ai_threads t
           ON t.roleCardId = r.id
           AND t.chat_mode = 'im'
           AND t.space = r.space
         LEFT JOIN (
           SELECT
             threadId,
             MAX(COALESCE(completedAt, createdAt)) AS lastImMsgAt
           FROM ai_messages
           WHERE role IN ('user', 'assistant')
           GROUP BY threadId
         ) im_msg ON im_msg.threadId = t.id
         LEFT JOIN (
           SELECT
             th.roleCardId AS roleCardId,
             MAX(COALESCE(m.completedAt, m.createdAt, th.updatedAt)) AS lastChatAt
           FROM ai_threads th
           INNER JOIN ai_messages m
             ON m.threadId = th.id AND m.role IN ('user', 'assistant')
           WHERE th.space = ? AND th.archivedAt IS NULL AND th.roleCardId IS NOT NULL
           GROUP BY th.roleCardId
         ) role_act ON role_act.roleCardId = r.id
         WHERE r.space = ? AND r.archivedAt IS NULL

         UNION ALL

         SELECT
           t.roleCardId AS roleCardId,
           NULL AS roleName,
           NULL AS avatarUri,
           NULL AS avatarEnabled,
           NULL AS firstMessage,
           t.updatedAt AS roleUpdatedAt,
           t.id AS threadId,
           t.title AS threadTitle,
           t.lastMessagePreview AS lastMessagePreview,
           COALESCE(t.isPinned, 0) AS isPinned,
           t.updatedAt AS threadUpdatedAt,
           COALESCE(im_msg_orphan.lastImMsgAt, t.updatedAt) AS lastChatAt
         FROM ai_threads t
         LEFT JOIN (
           SELECT
             threadId,
             MAX(COALESCE(completedAt, createdAt)) AS lastImMsgAt
           FROM ai_messages
           WHERE role IN ('user', 'assistant')
           GROUP BY threadId
         ) im_msg_orphan ON im_msg_orphan.threadId = t.id
         WHERE t.chat_mode = 'im' AND t.space = ?
           AND (t.roleCardId IS NULL OR t.roleCardId NOT IN (SELECT id FROM ai_role_cards WHERE space = ? AND archivedAt IS NULL))
      )
      ORDER BY
        isPinned DESC,
        (lastChatAt IS NULL) ASC,
        lastChatAt DESC,
        roleUpdatedAt DESC,
        roleName ASC;
    `;

    const stmt = db.prepare(query);
    const initialRows = stmt.all('normal', 'normal', 'normal', 'normal');
    assert.deepEqual(
      initialRows.map(r => r.roleName),
      ['钟离', '可莉', '芙宁娜', '胡桃', '雷电将军']
    );

    // 动态模拟：用户在 20:00 与 雷电将军 开启短聊发了一条消息
    db.exec(`
      INSERT INTO ai_threads (id, space, title, roleCardId, chat_mode, lastMessagePreview, isPinned, updatedAt) VALUES
        ('th_d', 'normal', '雷电将军', 'r_d', 'im', '将军大人好', 0, '2026-10-25T20:00:00Z');
      INSERT INTO ai_messages (id, threadId, role, content, createdAt) VALUES
        ('m_d', 'th_d', 'user', '将军大人好', '2026-10-25T20:00:00Z');
    `);

    const updatedRows = stmt.all('normal', 'normal', 'normal', 'normal');
    assert.deepEqual(
      updatedRows.map(r => r.roleName),
      ['钟离', '雷电将军', '可莉', '芙宁娜', '胡桃']
    );

    db.close();
  });

  await t.test('Single diary card per day: dedup query and idempotent insert cleanup', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE ai_messages (
        id TEXT PRIMARY KEY NOT NULL,
        threadId TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        content TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
    `);

    // 模拟用户在多次点击刷新手账后产生的 3 条同日重复日记卡片 + 1 条昨日日记 + 普通消息
    db.exec(`
      INSERT INTO ai_messages (id, threadId, role, status, content, createdAt) VALUES
        ('m_user_1', 'th_main', 'user', 'completed', '早安', '2026-10-26T08:00:00Z'),
        ('m_diary_yesterday', 'th_main', 'assistant', 'completed', '{"type":"diary_card","diaryId":"diary_th_main_2026-10-26","diaryDate":"2026-10-26","title":"昨日手账"}', '2026-10-26T22:00:00Z'),
        ('m_user_2', 'th_main', 'user', 'completed', '晚安', '2026-10-27T01:00:00Z'),
        ('m_diary_old_1', 'th_main', 'assistant', 'completed', '{"type":"diary_card","diaryId":"diary_th_main_2026-10-27","diaryDate":"2026-10-27","title":"今日手账v1"}', '2026-10-27T03:44:00Z'),
        ('m_diary_old_2', 'th_main', 'assistant', 'completed', '{"type":"diary_card","diaryId":"diary_th_main_2026-10-27","diaryDate":"2026-10-27","title":"今日手账v2"}', '2026-10-27T03:45:00Z'),
        ('m_diary_latest', 'th_main', 'assistant', 'completed', '{"type":"diary_card","diaryId":"diary_th_main_2026-10-27","diaryDate":"2026-10-27","title":"今日手账v3"}', '2026-10-27T03:45:30Z');
    `);

    // 1. 模拟 extractDiaryCardDate 提取逻辑
    function extractDate(content, createdAt) {
      if (!content || !content.startsWith('{"type":"diary_card"')) return null;
      try {
        const d = JSON.parse(content);
        if (d.diaryDate) return String(d.diaryDate);
        if (d.diaryId) {
          const match = String(d.diaryId).match(/\d{4}-\d{2}-\d{2}/);
          if (match) return match[0];
          return String(d.diaryId);
        }
      } catch {}
      return createdAt ? createdAt.slice(0, 10) : null;
    }

    assert.equal(extractDate('{"type":"diary_card","diaryDate":"2026-10-27"}'), '2026-10-27');
    assert.equal(extractDate('{"type":"diary_card","diaryId":"diary_1_2026-10-27"}'), '2026-10-27');
    assert.equal(extractDate('hello'), null);

    // 2. 模拟 getVisibleImMessages 的去重与自愈逻辑
    const rows = db.prepare(`SELECT id, content, createdAt FROM ai_messages WHERE threadId = 'th_main' ORDER BY createdAt DESC`).all();
    const seenDiaryDates = new Set();
    const duplicateIds = [];
    const filteredRows = [];

    for (const r of rows) {
      const dateKey = extractDate(r.content, r.createdAt);
      if (dateKey) {
        if (seenDiaryDates.has(dateKey)) {
          duplicateIds.push(r.id);
          continue;
        }
        seenDiaryDates.add(dateKey);
      }
      filteredRows.push(r);
    }

    // 验证过滤后仅保留最新 1 条今日日记 + 1 条昨日日记
    const returnedDiaryIds = filteredRows.filter(r => extractDate(r.content, r.createdAt)).map(r => r.id);
    assert.deepEqual(returnedDiaryIds, ['m_diary_latest', 'm_diary_yesterday']);
    assert.deepEqual(duplicateIds, ['m_diary_old_2', 'm_diary_old_1']);

    // 3. 模拟异步清理脏数据
    if (duplicateIds.length > 0) {
      const placeholders = duplicateIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM ai_messages WHERE id IN (${placeholders})`).run(...duplicateIds);
    }

    // 验证清理后数据库中只剩唯一一条今日日记卡片
    const remainingDiaries = db.prepare(`SELECT id, content FROM ai_messages WHERE content LIKE '%"type":"diary_card"%' ORDER BY createdAt DESC`).all();
    assert.equal(remainingDiaries.length, 2);
    assert.equal(remainingDiaries[0].id, 'm_diary_latest');
    assert.equal(remainingDiaries[1].id, 'm_diary_yesterday');

    // 4. 模拟写入端覆盖插入（再次生成 2026-10-27 日记）
    const targetDate = '2026-10-27';
    db.prepare(`
      DELETE FROM ai_messages
      WHERE threadId = 'th_main'
        AND (
          content LIKE ?
          OR content LIKE ?
          OR (
            (content LIKE '{"type":"diary_card"%' OR content LIKE '{"diaryDate":%' OR content LIKE '{"diaryId":%')
            AND date(createdAt) = ?
          )
        );
    `).run(`%"diaryDate":"${targetDate}"%`, `%"diaryId":"diary_th_main_${targetDate}"%`, targetDate);

    db.prepare(`
      INSERT INTO ai_messages (id, threadId, role, status, content, createdAt)
      VALUES ('m_diary_v4', 'th_main', 'assistant', 'completed', '{"type":"diary_card","diaryId":"diary_th_main_2026-10-27","diaryDate":"2026-10-27","title":"今日手账v4"}', '2026-10-27T04:00:00Z');
    `).run();

    const afterInsertDiaries = db.prepare(`SELECT id, content FROM ai_messages WHERE content LIKE '%"type":"diary_card"%' ORDER BY createdAt DESC`).all();
    assert.equal(afterInsertDiaries.length, 2);
    assert.equal(afterInsertDiaries[0].id, 'm_diary_v4');
    assert.equal(afterInsertDiaries[1].id, 'm_diary_yesterday');

    db.close();
  });
});
