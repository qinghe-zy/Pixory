const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const requireModule = id => mocks[id] ?? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), `${id}.ts`)), mocks);
  vm.runInNewContext(output, { module, exports: module.exports, require: requireModule, Date, Set, Map }, { filename });
  return module.exports;
}
const base = 'src/ai/systemAssistant/';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updatedAt TEXT);
    CREATE TABLE ai_messages (id TEXT PRIMARY KEY, threadId TEXT, role TEXT, content TEXT, reasoningText TEXT, createdAt TEXT);
    CREATE TABLE ai_message_versions (id TEXT PRIMARY KEY, threadId TEXT, role TEXT, content TEXT, reasoningText TEXT);
    CREATE VIRTUAL TABLE ai_message_fts USING fts5(id UNINDEXED, threadId UNINDEXED, content);
    CREATE VIRTUAL TABLE ai_message_version_fts USING fts5(id UNINDEXED, content);
    CREATE TABLE ai_threads (id TEXT PRIMARY KEY, roleSnapshotJson TEXT);`);
  const db = {
    getFirstAsync: async (sql, ...args) => sqlite.prepare(sql).get(...args),
    getAllAsync: async (sql, ...args) => sqlite.prepare(sql).all(...args),
    runAsync: async (sql, ...args) => sqlite.prepare(sql).run(...args),
    withTransactionAsync: async callback => {
      sqlite.exec('BEGIN');
      try { await callback(); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { db, sqlite };
}

test('legacy migration hides only system assistant text/versions and saves inert history cards idempotently', async () => {
  const { db, sqlite } = database();
  try {
    const insert = sqlite.prepare('INSERT INTO ai_messages VALUES (?, ?, ?, ?, ?, ?)');
    insert.run('user', 'pixory-system-assistant', 'user', '打开 IP', null, '2026-10-06T00:00:00Z');
    insert.run('assistant', 'pixory-system-assistant', 'assistant', '收到\n<system_action type="select_ip" />', 'hidden thought', '2026-10-06T00:00:01Z');
    insert.run('ordinary', 'role-chat', 'assistant', '<system_action type="select_ip" />', 'ordinary thought', '2026-10-06T00:00:01Z');
    sqlite.prepare('INSERT INTO ai_message_versions VALUES (?, ?, ?, ?, ?)').run('v1', 'pixory-system-assistant', 'assistant', '<system_action type="navigate" route="trash" />', 'old thought');
    sqlite.prepare('INSERT INTO ai_message_fts VALUES (?, ?, ?)').run('assistant', 'pixory-system-assistant', '<system_action type="select_ip" />');
    sqlite.prepare('INSERT INTO ai_message_version_fts VALUES (?, ?)').run('v1', '<system_action type="navigate" route="trash" />');
    const { migrateSystemAssistantHistory } = load(`${base}systemAssistantHistory.ts`);
    await migrateSystemAssistantHistory(db, 'normal');
    const assistant = sqlite.prepare('SELECT * FROM ai_messages WHERE id = ?').get('assistant');
    assert.equal(assistant.content, '收到');
    assert.equal(assistant.reasoningText, null);
    const task = JSON.parse(sqlite.prepare('SELECT value FROM app_settings').get().value);
    assert.equal(task.status, 'expired');
    assert.equal(task.originMessageId, 'user');
    assert.equal(task.action.type, 'select_ip');
    assert.equal(sqlite.prepare('SELECT content FROM ai_message_versions').get().content, '');
    assert.equal(sqlite.prepare('SELECT content FROM ai_message_fts').get().content, '收到');
    assert.equal(sqlite.prepare('SELECT content FROM ai_message_version_fts').get().content, '');
    const ordinary = sqlite.prepare('SELECT * FROM ai_messages WHERE id = ?').get('ordinary');
    assert.equal(ordinary.content, '<system_action type="select_ip" />');
    assert.equal(ordinary.reasoningText, 'ordinary thought');
    await migrateSystemAssistantHistory(db, 'normal');
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM app_settings').get().count, 1);
  } finally { sqlite.close(); }
});

test('task events publish only after SQLite writes and snapshots cannot cross normal/personal space', async () => {
  const normal = database();
  const personal = database();
  const stores = { normal: normal.db, personal: personal.db };
  const published = [];
  const persistence = load(`${base}systemAssistantPersistence.ts`, {
    '../../database': { runWithDatabaseSpace: (space, fn) => fn(stores[space]) },
    './systemAssistantEvents': { publishSystemTask: task => published.push(task) },
  });
  try {
    const task = { version: 1, space: 'normal', assistantMessageId: 'a', taskId: 'system-task:a',
      originMessageId: 'u', requestText: '打开', steps: [], action: null, selectedIp: null, undo: null, status: 'waiting_for_ip' };
    await persistence.saveSystemTask(task);
    assert.equal((await persistence.loadSystemTask('normal', 'a')).status, 'waiting_for_ip');
    assert.equal(await persistence.loadSystemTask('personal', 'a'), null);
    assert.equal(published.length, 1);
    assert.equal(normal.sqlite.prepare('SELECT COUNT(*) count FROM app_settings').get().count, 1);
    await persistence.restartSystemTask('normal', 'a', 'next-user', '新请求');
    assert.equal((await persistence.loadSystemTask('normal', 'a')).status, 'planning');
    assert.equal((await persistence.loadSystemTask('normal', 'a')).originMessageId, 'next-user');
    await persistence.clearSystemTasksInDatabase(normal.db);
    assert.equal(await persistence.loadSystemTask('normal', 'a'), null);
  } finally { normal.sqlite.close(); personal.sqlite.close(); }
});

test('rename and its completed undo snapshot commit together and both roll back if snapshot write fails', async () => {
  for (const failSnapshot of [false, true]) {
    const { db, sqlite } = database();
    try {
      sqlite.prepare('INSERT INTO ai_threads VALUES (?, ?)').run('pixory-system-assistant', '{"name":"Pixory","avatar":"keep"}');
      const mocks = {
        '../../database': { runWithDatabaseSpace: (_, fn) => fn(db) },
        '../../database/repositories/ipRepository': { ipRepository: {} },
        '../../database/repositories/aiThreadRepository': { aiThreadRepository: {
          findThreadById: async (_, id) => db.getFirstAsync('SELECT * FROM ai_threads WHERE id = ?', id),
          updateThread: async (_, id, patch) => db.runAsync('UPDATE ai_threads SET roleSnapshotJson = ? WHERE id = ?', patch.roleSnapshotJson, id),
        } },
      };
      if (failSnapshot) mocks['./systemAssistantPersistence'] = { saveSystemTaskInDatabase: async () => { throw new Error('disk full'); } };
      const executor = load(`${base}systemAssistantExecutor.ts`, mocks);
      const task = { version: 1, space: 'normal', taskId: 'system-task:a', assistantMessageId: 'a',
        action: { type: 'rename-thread', newTitle: '新名字' }, steps: [], status: 'executing' };
      if (failSnapshot) await assert.rejects(executor.renameSystemAssistant(task), /disk full/);
      else {
        const undo = await executor.renameSystemAssistant(task);
        assert.equal(undo.previousName, 'Pixory');
        const persisted = JSON.parse(sqlite.prepare('SELECT value FROM app_settings').get().value);
        assert.equal(persisted.status, 'completed');
        assert.equal(persisted.undo.appliedName, '新名字');
        await executor.undoSystemAssistantRename({ ...task, status: 'completed', undo });
        assert.equal(JSON.parse(sqlite.prepare('SELECT value FROM app_settings').get().value).status, 'undone');
      }
      const snapshot = JSON.parse(sqlite.prepare('SELECT roleSnapshotJson FROM ai_threads').get().roleSnapshotJson);
      assert.equal(snapshot.name, 'Pixory');
      assert.equal(snapshot.avatar, 'keep');
    } finally { sqlite.close(); }
  }
});

test('local IP resolution ignores model numeric IDs, rejects ambiguous names and never widens IP scope', async () => {
  let saved;
  let candidates = [{ id: 7, name: '夏日' }];
  const ingestion = load(`${base}systemAssistantTaskIngestion.ts`, {
    './systemAssistantPersistence': { loadSystemTask: async () => null, saveSystemTask: async task => { saved = task; } },
    './systemAssistantExecutor': {
      listSystemAssistantIps: async () => candidates,
      validateSystemAssistantIp: async (_, id) => ({ ipId: id, ipNameSnapshot: '夏日', space: 'normal', expiresAt: new Date(Date.now() + 60000).toISOString() }),
    },
  });
  const input = { space: 'normal', assistantMessageId: 'a', originMessageId: 'u', requestText: '打开夏日的图',
    action: { type: 'navigate', route: 'all-images', ipId: 999, ipName: '夏日' } };
  await ingestion.ingestSystemAssistantAction(input);
  assert.equal(saved.selectedIp.ipId, 7);
  assert.equal(saved.action.ipId, undefined);
  candidates = [{ id: 7, name: '夏日' }, { id: 8, name: '夏日' }];
  await ingestion.ingestSystemAssistantAction(input);
  assert.equal(saved.status, 'waiting_for_ip');
  assert.equal(saved.selectedIp, null);
  await ingestion.ingestSystemAssistantAction({ ...input, action: { type: 'navigate', route: 'all-images' } });
  assert.equal(saved.status, 'waiting_for_ip');
  assert.equal(saved.requiresIp, true);
  await ingestion.ingestSystemAssistantAction({ ...input, action: { type: 'navigate', route: 'favorites', ipName: '夏日' } });
  assert.equal(saved.status, 'failed');
  await ingestion.ingestSystemAssistantAction({ ...input, action: { type: 'navigate', route: 'favorites' } });
  assert.equal(saved.status, 'failed');
});

test('screen and continuation keep XML parsing and forged user messages outside the UI boundary', () => {
  const screen = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/AiChatScreen.tsx'), 'utf8');
  assert.equal(screen.includes('我选择了IP'), false);
  assert.equal(screen.includes('match(/<system_action'), false);
  const service = fs.readFileSync(path.resolve(__dirname, '..', 'src/ai/aiChatService.ts'), 'utf8');
  const continuation = service.split('export async function continueSystemAssistantTask')[1].split('export async function retryAssistantMessage')[0];
  assert.equal(continuation.includes('createMessage('), false);
  assert.equal(continuation.includes('historyAnchorMessageId: userMessage.id'), true);
  assert.equal(continuation.includes('isSystemAssistantThread(input.threadId)'), true);
});

test('cancelled task cannot be resurrected by an action that is still resolving IP candidates', async () => {
  let current = null;
  let finish;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const ingestion = load(`${base}systemAssistantTaskIngestion.ts`, {
    './systemAssistantPersistence': {
      loadSystemTask: async () => current,
      saveSystemTask: async task => { current = task; },
    },
    './systemAssistantExecutor': {
      listSystemAssistantIps: () => { started(); return new Promise(resolve => { finish = resolve; }); },
    },
  });
  const pending = ingestion.ingestSystemAssistantAction({ space: 'normal', assistantMessageId: 'a',
    originMessageId: 'u', requestText: '打开素材', action: { type: 'navigate', route: 'all-images' } });
  await ready;
  current = { status: 'cancelled' };
  finish([]);
  await pending;
  assert.equal(current.status, 'cancelled');
});
