const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

function loader(mocks = {}) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(__dirname, '..', relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(source, { module, exports: module.exports, Date, Set, Map, Intl,
      require: id => mocks[id] ?? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), `${id}.ts`))),
    }, { filename });
    return module.exports;
  }
  return load;
}
const base = 'src/ai/systemAssistant/';
const load = loader();
const policy = load(`${base}systemAssistantRolePolicy.ts`);
const time = load(`${base}systemAssistantTime.ts`);
const { SystemAssistantProtocol } = load(`${base}systemAssistantProtocol.ts`);
const { getSystemProgressState, getSystemProgressRows, shouldShowSystemProgress } = load(`${base}systemAssistantPresentation.ts`);

test('only direct creation intent starts a role task; ordinary chat, tutorials and examples do not', () => {
  for (const text of ['帮我创建角色卡', '我想捏一个伙伴', '请帮我设计一个叫“小雨”的角色', '创建角色卡']) {
    assert.ok(policy.detectSystemRoleIntent(text), text);
  }
  for (const text of ['我喜欢温柔的人', '怎么创建角色卡', '打开角色卡编辑器', '不要创建角色卡',
    '如果我说帮我创建角色卡会怎么样', '“帮我创建角色卡”', '解释这句话：帮我创建角色卡']) {
    assert.equal(policy.detectSystemRoleIntent(text), null, text);
  }
});

test('first create request collects information; subsequent direct confirmation authorizes only that turn', () => {
  const first = policy.nextSystemRoleSession({ space: 'normal', userMessageId: 'start', requestText: '帮我创建角色卡', previous: null, now: '2026-10-14T00:00:00Z' });
  assert.equal(first.phase, 'collecting');
  assert.equal(first.authorizedMessageId, null);
  const next = policy.nextSystemRoleSession({ space: 'normal', userMessageId: 'confirm', requestText: '就这样吧，创建角色卡', previous: first, now: '2026-10-14T02:00:00Z' });
  assert.equal(next.id, 'start');
  assert.equal(next.authorizedMessageId, 'confirm');
  const changed = policy.nextSystemRoleSession({ space: 'normal', userMessageId: 'change', requestText: '先别创建，性格改成更活泼', previous: next, now: '2026-10-14T02:01:00Z' });
  assert.equal(changed.authorizedMessageId, null);
  assert.equal(policy.nextSystemRoleSession({ space: 'normal', userMessageId: 'cancel', requestText: '取消角色卡', previous: changed, now: changed.updatedAt }), null);
});

test('a completed task does not restart on repeated save; another space cannot inherit its draft', () => {
  const previous = { version: 1, space: 'normal', id: 'start', phase: 'created', draft: { name: '小雨' },
    lastUserMessageId: 'confirm', authorizedMessageId: null, roleCardId: 'role_system_start', updatedAt: '2026-10-14T00:00:00Z' };
  assert.equal(policy.nextSystemRoleSession({ space: 'normal', userMessageId: 'again', requestText: '创建吧', previous, now: previous.updatedAt }), previous);
  assert.equal(policy.nextSystemRoleSession({ space: 'personal', userMessageId: 'other', requestText: '温柔一点', previous, now: previous.updatedAt }), null);
});

test('execution negation wins over save language and natural cancellation ends the task', () => {
  for (const requestText of ['按前面说的创建角色卡，但先别执行', '就按刚才的设定保存，但不要提交',
    '先不要动手，按前面说的创建角色卡', '现在不可以执行创建角色卡', '按前面说的创建角色卡，不过只是演示一下']) {
    assert.equal(policy.detectSystemRoleIntent(requestText), null, requestText);
  }
  for (const requestText of ['不创建了，先聊别的', '取消角色卡，我们换个话题', '算了，聊点别的']) {
    assert.equal(policy.detectSystemRoleIntent(requestText), 'cancel', requestText);
  }
});

test('short confirmation requires a complete draft and a preceding creation question', () => {
  const previous = { version: 1, space: 'normal', id: 'start', phase: 'collecting',
    draft: { name: '小雨', prompt: '温柔' }, lastUserMessageId: 'later', authorizedMessageId: null,
    roleCardId: null, awaitingConfirmation: true, updatedAt: '2026-10-14T00:00:00Z' };
  const next = (requestText, state = previous, userMessageId = 'confirm') => policy.nextSystemRoleSession({
    space: 'normal', userMessageId, requestText, previous: state, now: previous.updatedAt });
  for (const requestText of ['好的', '确认', '可以', '就这样吧']) {
    assert.equal(next(requestText).authorizedMessageId, 'confirm');
    assert.equal(next(requestText, { ...previous, awaitingConfirmation: false }).authorizedMessageId, null);
    assert.equal(next(requestText, { ...previous, draft: null }).authorizedMessageId, null);
  }
  assert.equal(next('帮我创建角色卡', previous, 'start').authorizedMessageId, null);
  assert.equal(next('好的，但先别执行').authorizedMessageId, null);
  const another = next('这个先放着，帮我创建另一个角色');
  assert.equal(another.id, 'confirm');
  assert.equal(another.draft, null);
  for (const reply of ['现在创建角色卡吗？', '设定已整理。是否创建角色卡？', '要不要保存这个角色？']) {
    assert.equal(policy.isSystemRoleCreationQuestion(reply), true, reply);
  }
  for (const reply of ['你觉得这个性格好吗？', '现在创建角色卡吗？还是修改性格？', '你不要创建角色卡，好吗？', '现在不需要创建角色卡吗？']) {
    assert.equal(policy.isSystemRoleCreationQuestion(reply), false, reply);
  }
});

test('role draft protocol stays hidden through every split and preserves quotes, newlines and boundaries', () => {
  const raw = '你希望怎样相处？\n<system_action type="role-draft" name="小雨" description="温柔" prompt="喜欢 &quot;雨天&quot;&#10;不替用户做决定 &amp; 尊重边界" firstMessage="你好。" />';
  for (let split = 0; split <= raw.length; split++) {
    const parser = new SystemAssistantProtocol();
    const visible = parser.push(raw.slice(0, split)) + parser.push(raw.slice(split)) + parser.finish();
    assert.equal(visible, '你希望怎样相处？\n');
    assert.equal(parser.actions[0].prompt, '喜欢 "雨天"\n不替用户做决定 & 尊重边界');
  }
  for (const suffix of [' name="偷换"', ' sql="DROP TABLE ai_role_cards"']) {
    const parser = new SystemAssistantProtocol();
    parser.push(`<system_action type="role-draft" name="小雨" prompt="设定"${suffix} />`);
    parser.finish();
    assert.equal(parser.actions.length, 0);
    assert.equal(parser.invalid, true);
  }
});

test('time tools use one clock sample, handle daylight saving, date rollover and fractional UTC offsets', () => {
  const summer = new Date('2026-07-01T00:00:00Z');
  const winter = new Date('2026-01-01T00:00:00Z');
  const query = (text, date = summer) => time.resolveSystemAssistantTimeRequest(text, date, 'Asia/Shanghai');
  assert.match(query('现在几点').text, /08:00:00/);
  assert.match(query('纽约现在几点').text, /2026年06月30日.*20:00:00/);
  assert.match(query('纽约现在几点', winter).text, /2025年12月31日.*19:00:00/);
  assert.match(query('UTC+05:30现在几点').text, /05:30:00/);
  assert.match(query('UTC-00:30现在几点').text, /2026年06月30日.*23:30:00/);
  assert.equal(query('现在几点').sampledAt, summer.toISOString());
  assert.match(query('今天星期几').text, /星期三/);
});

test('unknown and ambiguous zones ask for necessary input rather than guessing; mixed requests stay in chat', () => {
  for (const request of ['美国现在几点', '纽约和伦敦现在几点', '芝加哥现在几点', '芝加哥几点了',
    '芝加哥的时间', 'Chicago几点了', 'UTC+8和UTC+9现在几点']) {
    const result = time.resolveSystemAssistantTimeRequest(request, new Date('2026-10-14T00:00:00Z'), 'Asia/Shanghai');
    assert.equal(result.stages[0], '等待选择时区', request);
  }
  assert.equal(time.resolveSystemAssistantTimeRequest('UTC+14:30现在几点').stages[0], '时区无效');
  for (const request of ['帮我创建一个东京出生的角色', '明天提醒我看看几点了', '现在几点，顺便搜索新闻', '如果我问现在几点']) {
    assert.equal(time.resolveSystemAssistantTimeRequest(request), null, request);
  }
});

test('compact UTC offsets are parsed completely and malformed offsets never become bare UTC', () => {
  const query = text => time.resolveSystemAssistantTimeRequest(text, new Date('2026-10-14T00:00:00Z'), 'Asia/Shanghai');
  for (const request of ['UTC+0800现在几点', 'GMT+08:00现在几点', 'UTC+8现在几点']) {
    assert.match(query(request).text, /08:00:00/, request);
  }
  assert.match(query('UTC-0330现在几点').text, /2026年10月13日.*20:30:00/);
  for (const request of ['UTC+08000现在几点', 'UTC+08:000现在几点', 'UTC+1260现在几点', 'UTC+现在几点',
    'UTC+8.5现在几点', 'UTC+08:00junk现在几点']) {
    assert.equal(query(request).stages[0], '时区无效', request);
  }
  assert.equal(query('America/Argentina/Buenos_Aires现在几点').timeZone, 'America/Argentina/Buenos_Aires');
  assert.equal(query('请告诉我现在几点了').timeZone, 'Asia/Shanghai');
});

test('every task status has explicit feedback, failures stop spinning and committed writes remain successful', () => {
  for (const status of ['waiting_for_ip', 'waiting_for_user', 'planning', 'waiting_for_approval', 'executing', 'completed', 'failed', 'cancelled', 'expired', 'undoing', 'undone']) {
    const state = getSystemProgressState({ status, steps: [{ label: '真实阶段', at: '2026-10-14T00:00:00Z' }] }, 'generating', false);
    assert.ok(state.icon);
    assert.ok(state.label);
    assert.equal(state.busy, ['planning', 'executing', 'undoing'].includes(status));
  }
  assert.equal(getSystemProgressState({ status: 'planning', steps: [] }, 'failed', false).busy, false);
  assert.equal(getSystemProgressState({ status: 'completed', steps: [] }, 'failed', true).status, 'completed');
  assert.equal(getSystemProgressState({ status: 'planning', steps: [] }, 'generating', true).label, '正在回复');
});

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updatedAt TEXT);
    CREATE TABLE ai_role_cards (id TEXT PRIMARY KEY, space TEXT, name TEXT, description TEXT, prompt TEXT,
      firstMessage TEXT, alternateGreetingsJson TEXT, sourceType TEXT, sourceJson TEXT, defaultLanguage TEXT,
      defaultModelId TEXT, boundaryMode TEXT, avatarEnabled INTEGER, avatarUri TEXT, tagsJson TEXT,
      createdAt TEXT, updatedAt TEXT, archivedAt TEXT);
    CREATE TABLE ai_threads (id TEXT PRIMARY KEY, roleCardId TEXT);`);
  const db = {
    getFirstAsync: async (sql, ...args) => sqlite.prepare(sql).get(...args),
    getAllAsync: async (sql, ...args) => sqlite.prepare(sql).all(...args),
    runAsync: async (sql, ...args) => sqlite.prepare(sql).run(...args),
    withTransactionAsync: async fn => {
      sqlite.exec('BEGIN');
      try { await fn(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, db };
}

function fixture() {
  const normal = database();
  const personal = database();
  const stores = { normal, personal };
  const events = [];
  const load = loader({
    '../../database': {
      runWithDatabaseSpace: (space, fn) => fn(stores[space].db),
      runWithTransactionRetry: (db, fn) => db.withTransactionAsync ? db.withTransactionAsync(() => fn(db)) : fn(db),
    },
    './systemAssistantEvents': { publishSystemTask: value => events.push(value) },
    './systemAssistantExecutor': {},
  });
  const roles = load(`${base}systemAssistantRoleCreation.ts`);
  const persistence = load(`${base}systemAssistantPersistence.ts`);
  const ingestion = load(`${base}systemAssistantTaskIngestion.ts`);
  const draft = { name: '小雨', description: '温柔但有边界', prompt: '尊重用户；不替用户做决定。', firstMessage: '今天过得怎么样？' };
  const task = (originMessageId, assistantMessageId = `a_${originMessageId}`) => ({
    version: 1, taskId: `system-task:${assistantMessageId}`, assistantMessageId, originMessageId,
    requestText: '创建角色卡', space: 'normal', status: 'planning', steps: [], error: null,
    selectedIp: null, undo: null, action: { type: 'role-draft', ...draft }, updatedAt: new Date().toISOString(),
    generationId: `g_${originMessageId}`,
  });
  const prepare = (userMessageId, requestText, previousGenerationId = null, generationId = `g_${userMessageId}`) =>
    roles.prepareSystemRoleTurn({ space: 'normal', userMessageId, requestText, previousGenerationId, generationId });
  async function ready() {
    await prepare('start', '帮我创建角色卡');
    await roles.applySystemRoleDraft(task('start'), draft);
    await prepare('confirm', '创建吧', 'g_start');
    return task('confirm');
  }
  return { normal, personal, roles, persistence, ingestion, draft, task, prepare, ready, events,
    close() { normal.sqlite.close(); personal.sqlite.close(); } };
}

test('drafts survive long pauses and DB reload, stay local to their space, and need explicit save authorization', async () => {
  const f = fixture();
  try {
    await assert.rejects(f.roles.applySystemRoleDraft(f.task('start'), f.draft), /任务已变化/);
    await f.prepare('start', '帮我创建角色卡');
    const result = await f.roles.applySystemRoleDraft(f.task('start'), f.draft);
    assert.equal(result.status, 'waiting_for_user');
    assert.equal(f.normal.sqlite.prepare('SELECT COUNT(*) count FROM ai_role_cards').get().count, 0);
    assert.equal((await f.roles.loadSystemRoleSession('normal')).draft.prompt, f.draft.prompt);
    assert.equal(await f.roles.loadSystemRoleSession('personal'), null);
    const updated = await f.prepare('later', '改成更活泼', 'g_start');
    assert.equal(updated.id, 'start');
    assert.equal(updated.draft.name, '小雨');
    assert.equal(updated.authorizedMessageId, null);
  } finally { f.close(); }
});

test('role creation and completed task commit together; retry does not create duplicate cards', async () => {
  const f = fixture();
  try {
    const task = await f.ready();
    const result = await f.roles.applySystemRoleDraft(task, f.draft);
    assert.equal(result.status, 'completed');
    assert.equal(result.createdRoleCard.id, 'role_system_start');
    const role = f.normal.sqlite.prepare('SELECT * FROM ai_role_cards').get();
    assert.equal(role.prompt, f.draft.prompt);
    assert.equal(role.firstMessage, f.draft.firstMessage);
    assert.equal((await f.persistence.loadSystemTask('normal', task.assistantMessageId)).createdRoleCard.id, role.id);
    await f.roles.applySystemRoleDraft(task, f.draft);
    assert.equal(f.normal.sqlite.prepare('SELECT COUNT(*) count FROM ai_role_cards').get().count, 1);
    assert.equal((await f.roles.loadSystemRoleSession('normal')).phase, 'created');
  } finally { f.close(); }
});

test('task persistence failures roll back the role and session, and stale generation guards prevent writes', async () => {
  const f = fixture();
  try {
    const task = await f.ready();
    await assert.rejects(f.roles.applySystemRoleDraft(task, f.draft, async () => false), /任务已变化/);
    const run = f.normal.db.runAsync;
    f.normal.db.runAsync = async (sql, ...args) => {
      if (args[0] === 'systemAssistantTask:v1:a_confirm') throw new Error('disk full');
      return run(sql, ...args);
    };
    await assert.rejects(f.roles.applySystemRoleDraft(task, f.draft), /disk full/);
    assert.equal(f.normal.sqlite.prepare('SELECT COUNT(*) count FROM ai_role_cards').get().count, 0);
    assert.equal((await f.roles.loadSystemRoleSession('normal')).phase, 'collecting');
    assert.equal((await f.roles.loadSystemRoleSession('normal')).authorizedMessageId, 'confirm');
  } finally { f.close(); }
});

test('replaying an early turn and returning to an old branch restore only the visible predecessor draft', async () => {
  const f = fixture();
  try {
    await f.prepare('start', '帮我创建角色卡');
    await f.roles.applySystemRoleDraft(f.task('start'), f.draft);
    await f.prepare('later', '改成更活泼', 'g_start');
    await f.roles.applySystemRoleDraft(f.task('later'), { ...f.draft, prompt: '后续回合才确定的设定' });
    const replay = await f.prepare('start', '帮我创建角色卡', null, 'g_replay');
    assert.equal(replay.draft, null);
    assert.equal(replay.authorizedMessageId, null);
    await f.roles.applySystemRoleDraft({ ...f.task('start'), generationId: 'g_replay' }, f.draft);
    assert.equal(f.normal.sqlite.prepare('SELECT COUNT(*) count FROM ai_role_cards').get().count, 0);
    const oldBranch = await f.prepare('old-branch', '补充开场白', 'g_start');
    assert.equal(oldBranch.draft.prompt, f.draft.prompt);
    const futureBranch = await f.prepare('future-branch', '继续', 'g_later');
    assert.equal(futureBranch.draft.prompt, '后续回合才确定的设定');
    await assert.rejects(f.roles.applySystemRoleDraft(f.task('later'), f.draft), /任务已变化/);
  } finally { f.close(); }
});

test('creation questions enable natural confirmation but other questions and cancellation do not', async () => {
  for (const question of ['现在创建角色卡吗？', '你觉得这个性格好吗？']) {
    const f = fixture();
    try {
      await f.prepare('start', '帮我创建角色卡');
      await f.roles.applySystemRoleDraft(f.task('start'), f.draft, undefined, question);
      const session = await f.prepare('confirm', '好的', 'g_start');
      assert.equal(session.authorizedMessageId, question.includes('创建') ? 'confirm' : null);
      await f.roles.applySystemRoleDraft(f.task('confirm'), f.draft);
      assert.equal(f.normal.sqlite.prepare('SELECT COUNT(*) count FROM ai_role_cards').get().count, question.includes('创建') ? 1 : 0);
    } finally { f.close(); }
  }
  const f = fixture();
  try {
    await f.ready();
    const negated = await f.prepare('negated', '按前面说的创建角色卡，但先别执行', 'g_confirm');
    assert.equal(negated.authorizedMessageId, null);
    await f.roles.applySystemRoleDraft(f.task('negated'), f.draft);
    assert.equal(f.normal.sqlite.prepare('SELECT COUNT(*) count FROM ai_role_cards').get().count, 0);
    assert.equal(await f.prepare('cancel', '不创建了，先聊别的', 'g_negated'), null);
    assert.equal(await f.prepare('chat', '好的', 'g_cancel'), null);
  } finally { f.close(); }
});

test('unscoped legacy drafts cannot leak into a new turn or another space', async () => {
  const f = fixture();
  try {
    await f.prepare('start', '帮我创建角色卡');
    await f.roles.applySystemRoleDraft(f.task('start'), f.draft);
    assert.equal(await f.prepare('unrelated', '继续'), null);
    assert.equal(await f.roles.prepareSystemRoleTurn({ space: 'personal', userMessageId: 'personal',
      requestText: '继续', generationId: 'g_personal', previousGenerationId: 'g_start' }), null);
  } finally { f.close(); }
});

test('initialization and local tool write errors settle the assistant and task without calling a provider', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/ai/aiChatService.ts'), 'utf8');
  const file = ts.createSourceFile('aiChatService.ts', source, ts.ScriptTarget.Latest, true);
  const stream = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'streamAssistantReply');
  const js = ts.transpileModule(`${stream.getText(file)}\nglobalThis.run = streamAssistantReply;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  for (const fault of ['begin', 'prepare', 'time-write']) {
    const f = fixture();
    try {
      const message = { id: 'a_start', status: 'queued' };
      const patches = [];
      let providerPreparation = 0;
      const fail = async () => { throw new Error('disk full'); };
      const { withSystemTaskStep } = load(`${base}systemAssistantRuntime.ts`);
      const context = {
        Date, Set, Map, Intl, SystemAssistantProtocol, withSystemTaskStep,
        CitationMarkerStreamParser: class {},
        isSystemAssistantThread: () => true,
        recordDiagnosticEvent: () => {}, hashPromptCacheText: () => 'hash',
        markGenerationMetric: (metrics, name) => { metrics.timestamps[name] = Date.now(); },
        stoppedMessageIds: new Set(), stoppedTimeoutGenerationIds: new Set(),
        stoppedGenerationKey: (messageId, generationId) => `${messageId}:${generationId}`,
        buildGenerationGuardSnapshotJsonWithDisplayKind: () => '{}',
        buildMetricsOnlyPromptSnapshotJson: () => '{}',
        runWithDatabaseSpace: (_space, fn) => fn(f.normal.db),
        updateAssistantMessageForGeneration: async (_db, _id, _generation, patch) => Object.assign(message, patch),
        isAssistantMessageCurrentGeneration: async () => true,
        aiThreadRepository: { replaceCitations: async () => {}, findPreviousMessageByRole: async () => null,
          updateThread: async () => {} },
        resolveStreamingBranchScopes: async () => [], readSnapshotGenerationId: () => null,
        beginSystemTask: fault === 'begin' ? fail : f.persistence.beginSystemTask,
        prepareSystemRoleTurn: fault === 'prepare' ? fail : f.roles.prepareSystemRoleTurn,
        resolveSystemAssistantTimeRequest: time.resolveSystemAssistantTimeRequest,
        buildSystemRoleTaskContext: f.roles.buildSystemRoleTaskContext,
        saveSystemTaskInDatabase: fault === 'time-write' ? fail : f.persistence.saveSystemTaskInDatabase,
        publishSystemTask: () => {},
        settleSystemTaskGeneration: f.persistence.settleSystemTaskGeneration,
        normalizeAiErrorMessage: error => error.message,
        setGenerationFailureReason: () => 'storage_error',
        markAssistantFailed: async () => { message.status = 'failed'; },
        createPreparedGenerationJob: async () => { providerPreparation++; },
      };
      vm.runInNewContext(js, context);
      await context.run({ space: 'normal', thread: { id: 'pixory-system-assistant' },
        userMessage: { id: 'start', content: fault === 'time-write' ? '现在几点' : '帮我创建角色卡' },
        assistantMessageId: message.id,
        generationMetrics: { context: { generationId: 'g_start' }, timestamps: {}, counters: {} },
        onMessagePatch: patch => patches.push(patch),
      });
      // Task settlement is dispatched by the message patch and finishes asynchronously.
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(message.status, 'failed', fault);
      assert.equal(patches.at(-1).status, 'failed', fault);
      assert.equal(providerPreparation, 0, fault);
      const task = await f.persistence.loadSystemTask('normal', message.id);
      if (fault === 'begin') assert.equal(task, null);
      else assert.equal(task.status, 'failed', fault);
      assert.equal(getSystemProgressState(task, message.status, false).busy, false);
    } finally { f.close(); }
  }
});

test('undo archives only the unmodified and unused created role; clearing chat also clears the draft', async () => {
  for (const changed of ['none', 'edited', 'used']) {
    const f = fixture();
    try {
      const result = await f.roles.applySystemRoleDraft(await f.ready(), f.draft);
      if (changed === 'edited') f.normal.sqlite.prepare("UPDATE ai_role_cards SET updatedAt = '2026-10-15T00:00:00Z'").run();
      if (changed === 'used') f.normal.sqlite.prepare('INSERT INTO ai_threads VALUES (?, ?)').run('chat', result.createdRoleCard.id);
      if (changed === 'none') {
        await f.roles.undoSystemRoleCreation(result);
        assert.ok(f.normal.sqlite.prepare('SELECT archivedAt FROM ai_role_cards').get().archivedAt);
        assert.equal((await f.persistence.loadSystemTask('normal', result.assistantMessageId)).status, 'undone');
      } else {
        await assert.rejects(f.roles.undoSystemRoleCreation(result), /无法撤销/);
        assert.equal(f.normal.sqlite.prepare('SELECT archivedAt FROM ai_role_cards').get().archivedAt, null);
      }
      await f.persistence.clearSystemTasksInDatabase(f.normal.db);
      assert.equal(await f.roles.loadSystemRoleSession('normal'), null);
      assert.equal(f.normal.sqlite.prepare("SELECT COUNT(*) count FROM app_settings WHERE key LIKE 'systemAssistantRoleSnapshot:v1:%'").get().count, 0);
    } finally { f.close(); }
  }
});

test('empty first-turn drafts remain hidden, collect normally and never create an empty card', async () => {
  const raw = '你希望怎样的角色？\n<system_action type="role-draft" name="" description="" prompt="" firstMessage="" />';
  for (let split = 0; split <= raw.length; split++) {
    const parser = new SystemAssistantProtocol();
    assert.equal(parser.push(raw.slice(0, split)) + parser.push(raw.slice(split)) + parser.finish(), '你希望怎样的角色？\n');
    assert.equal(parser.invalid, false);
    assert.equal(parser.actions.length, 1);
  }
  const f = fixture();
  try {
    await f.prepare('start', '创建角色卡');
    const empty = { name: '', description: '', prompt: '', firstMessage: '' };
    const first = await f.roles.applySystemRoleDraft(f.task('start'), empty);
    assert.equal(first.status, 'waiting_for_user');
    assert.equal(first.steps.at(-1).label, '等待补充设定');
    await f.prepare('confirm', '创建吧', 'g_start');
    await f.roles.applySystemRoleDraft(f.task('confirm'), empty);
    assert.equal(f.normal.sqlite.prepare('SELECT COUNT(*) count FROM ai_role_cards').get().count, 0);
    assert.equal((await f.roles.loadSystemRoleSession('normal')).authorizedMessageId, null);
  } finally { f.close(); }
});

test('empty later drafts retain established details, while normal corrections replace them', async () => {
  const f = fixture();
  try {
    await f.prepare('start', '创建角色卡');
    await f.roles.applySystemRoleDraft(f.task('start'), f.draft);
    await f.prepare('later', '温柔一点', 'g_start');
    await f.roles.applySystemRoleDraft(f.task('later'), { name: '', prompt: '', description: '', firstMessage: '' });
    assert.equal((await f.roles.loadSystemRoleSession('normal')).draft.prompt, f.draft.prompt);
    await f.prepare('edit', '清空开场白', 'g_later');
    await f.roles.applySystemRoleDraft(f.task('edit'), { ...f.draft, firstMessage: '' });
    assert.equal((await f.roles.loadSystemRoleSession('normal')).draft.firstMessage, '');
  } finally { f.close(); }
});

test('temporary operations and pauses preserve drafts without follow-up or lingering save authorization', async () => {
  for (const request of ['先放着', '打开模型设置', '查看素材', '今天星期几', '查时间', '打开记忆面板', '备份一下', '你好']) {
    const f = fixture();
    try {
      await f.ready();
      const paused = await f.prepare('other', request, 'g_confirm');
      assert.equal(paused.paused, true, request);
      assert.equal(paused.authorizedMessageId, null);
      assert.equal(paused.draft.name, f.draft.name);
      assert.equal(f.roles.buildSystemRoleTaskContext(paused, 'other'), '');
      const chat = await f.prepare('chat', '好的', 'g_other');
      assert.equal(chat.paused, true);
      assert.equal(chat.authorizedMessageId, null);
      const resumed = await f.prepare('resume', '继续创建角色卡的设定', 'g_chat');
      assert.equal(resumed.paused, false);
      assert.equal(resumed.draft.name, f.draft.name);
      assert.equal(resumed.authorizedMessageId, null);
      assert.ok(f.roles.buildSystemRoleTaskContext(resumed, 'resume'));
    } finally { f.close(); }
  }
});

test('missing or malformed collection protocol keeps natural dialogue and the previous draft', async () => {
  for (const invalid of [false, true]) {
    const f = fixture();
    try {
      await f.prepare('start', '创建角色卡');
      await f.roles.applySystemRoleDraft(f.task('start'), f.draft, undefined, '现在创建角色卡吗？');
      await f.prepare('next', '性格温柔一点', 'g_start');
      await f.persistence.saveSystemTask(f.task('next'));
      const reply = await f.ingestion.ingestSystemAssistantAction({ ...f.task('next'),
        action: null, invalid, replyText: '你希望怎样相处？', roleCollecting: true,
        canExecute: async () => true });
      assert.equal(reply, undefined);
      const retained = await f.roles.loadSystemRoleSession('normal');
      assert.equal(retained.draft.prompt, f.draft.prompt);
      assert.equal(retained.awaitingConfirmation, false);
      assert.equal((await f.persistence.loadSystemTask('normal', 'a_next')).status, 'waiting_for_user');
    } finally { f.close(); }
  }
});

test('late role output after cancellation or generation replacement is silent and cannot alter tasks', async () => {
  const f = fixture();
  try {
    await f.ready();
    const pending = f.task('confirm');
    await f.persistence.saveSystemTask(pending);
    await f.prepare('cancel', '取消角色卡', 'g_confirm');
    const reply = await f.ingestion.ingestSystemAssistantAction({ ...pending, roleSaveAuthorized: true });
    assert.equal(reply, undefined);
    assert.equal((await f.persistence.loadSystemTask('normal', 'a_confirm')).status, 'planning');
    await f.ingestion.ingestSystemAssistantAction({ ...pending, action: null, invalid: true,
      roleCollecting: true, roleSaveAuthorized: true, canExecute: async () => false });
    assert.equal((await f.persistence.loadSystemTask('normal', 'a_confirm')).status, 'planning');
    assert.equal(await f.roles.loadSystemRoleSession('normal'), null);
    assert.equal(f.normal.sqlite.prepare('SELECT COUNT(*) count FROM ai_role_cards').get().count, 0);
  } finally { f.close(); }
});

test('an authorized save with missing protocol fails concisely and clears authorization without discarding the draft', async () => {
  const f = fixture();
  try {
    const pending = await f.ready();
    await f.persistence.saveSystemTask(pending);
    const reply = await f.ingestion.ingestSystemAssistantAction({ ...pending, action: null,
      roleCollecting: true, roleSaveAuthorized: true, canExecute: async () => true });
    assert.match(reply, /暂未保存/);
    assert.equal((await f.persistence.loadSystemTask('normal', pending.assistantMessageId)).status, 'failed');
    const retained = await f.roles.loadSystemRoleSession('normal');
    assert.equal(retained.authorizedMessageId, null);
    assert.equal(retained.draft.name, f.draft.name);
    assert.equal(f.normal.sqlite.prepare('SELECT COUNT(*) count FROM ai_role_cards').get().count, 0);
  } finally { f.close(); }
});

test('an obsolete preparation cannot replace the current role session or write a branch snapshot', async () => {
  const f = fixture();
  try {
    await f.ready();
    const stale = await f.roles.prepareSystemRoleTurn({ space: 'normal', userMessageId: 'stale',
      requestText: '取消角色卡', generationId: 'g_stale', previousGenerationId: 'g_confirm', canExecute: async () => false });
    assert.equal(stale, null);
    assert.equal((await f.roles.loadSystemRoleSession('normal')).lastUserMessageId, 'confirm');
    assert.equal(f.normal.sqlite.prepare("SELECT value FROM app_settings WHERE key = 'systemAssistantRoleSnapshot:v1:g_stale'").get(), undefined);
  } finally { f.close(); }
});

test('progress hides simple replies and local time, streams concise rows, and colors only known outcomes', () => {
  assert.equal(shouldShowSystemProgress(null), false);
  for (const steps of [[{ label: '正在理解请求' }], [{ label: '读取设备时间' }, { label: '核对时区' }, { label: '时间已查询' }]]) {
    assert.equal(shouldShowSystemProgress({ status: 'completed', steps, action: null }), false);
  }
  const task = { status: 'planning', action: null, steps: [
    { label: '正在理解请求', status: 'planning' }, { label: '正在梳理角色设定', status: 'planning' }] };
  assert.equal(shouldShowSystemProgress(task), true);
  let rows = getSystemProgressRows(task, getSystemProgressState(task, 'generating', true));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, '梳理角色设定');
  assert.equal(rows[0].tone, 'neutral');
  assert.equal(rows[0].busy, true);
  task.status = 'waiting_for_user';
  task.steps.push({ label: '设定已记录', status: 'waiting_for_user' });
  rows = getSystemProgressRows(task, getSystemProgressState(task, 'completed', true));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].tone, 'neutral');
  assert.equal(rows[1].tone, 'success');
  task.status = 'failed';
  task.steps.push({ label: '角色卡未保存', status: 'failed' });
  rows = getSystemProgressRows(task, getSystemProgressState(task, 'completed', true));
  assert.equal(rows.at(-1).tone, 'danger');
  assert.equal(rows.at(-1).busy, false);
});

test('assistant clock includes the sampled date and zone and changes only a dynamic prompt segment', () => {
  const one = time.buildSystemAssistantClockContext(new Date('2026-10-14T00:00:00Z'), 'Asia/Shanghai');
  const two = time.buildSystemAssistantClockContext(new Date('2026-10-15T00:00:00Z'), 'Asia/Shanghai');
  assert.match(one, /2026年10月14日.*08:00:00.*Asia\/Shanghai/);
  assert.match(one, /不是联网校时/);
  assert.notEqual(one, two);
  const source = fs.readFileSync(path.resolve(__dirname, '../src/ai/aiChatService.ts'), 'utf8');
  const file = ts.createSourceFile('aiChatService.ts', source, ts.ScriptTarget.Latest, true);
  const declarations = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ['systemAssistantClockContext', 'dynamicSegments'].includes(node.name.getText(file))) declarations.push(node.getText(file));
    ts.forEachChild(node, visit);
  }
  visit(file);
  const code = ts.transpileModule(`const ${declarations.join('; const ')}; globalThis.segments = dynamicSegments;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const id of ['pixory-system-assistant', 'ordinary']) {
    const context = { thread: { id, space: 'normal' }, coverage: { plan: { branchRouteHash: 'branch' } },
      options: {}, artifactSelection: null, companionMemoryPrefix: '',
      isSystemAssistantThread: id => id === 'pixory-system-assistant', buildSystemAssistantClockContext: () => one,
      estimatePromptTokens: text => text.length };
    vm.runInNewContext(code, context);
    assert.equal(context.segments.length, id === 'ordinary' ? 0 : 1);
    if (context.segments.length) {
      assert.equal(context.segments[0].type, 'companion_runtime');
      assert.equal(context.segments[0].text, one);
    }
  }
});
