const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

function load(relative, mocks = {}) {
  mocks = { './systemAssistantRoleCreation': {}, '../ai/systemAssistant/systemAssistantRoleCreation': {}, ...mocks };
  const filename = path.resolve(__dirname, '..', relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const requireModule = id => mocks[id] ?? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), `${id}.ts`)), mocks);
  vm.runInNewContext(source, { module, exports: module.exports, require: requireModule, Date, Set, Map }, { filename });
  return module.exports;
}

const base = 'src/ai/systemAssistant/';
const { SystemAssistantProtocol } = load(`${base}systemAssistantProtocol.ts`);
const { createSystemAssistantRuntime } = load(`${base}systemAssistantRuntime.ts`);

test('protocol never exposes any marker prefix for every split position and one-character deltas', () => {
  const raw = '打开素材\n<system_action type="navigate" route="all-images" ipName="夏日" />';
  for (let split = 0; split <= raw.length; split++) {
    const parser = new SystemAssistantProtocol();
    const chunks = [raw.slice(0, split), raw.slice(split)];
    let visible = '';
    for (const chunk of chunks) {
      visible += parser.push(chunk);
      assert.equal(visible.includes('<'), false, `split ${split}`);
    }
    visible += parser.finish();
    assert.equal(visible, '打开素材\n');
    assert.equal(parser.actions[0].route, 'all-images');
    assert.equal(parser.actions[0].ipName, '夏日');
  }
  const parser = new SystemAssistantProtocol();
  let visible = '';
  for (const char of raw) visible += parser.push(char);
  assert.equal(visible + parser.finish(), '打开素材\n');
});

test('truncated, malformed, unregistered and alternate envelopes stay hidden and cannot execute', () => {
  const payloads = ['<system_action type="navigate" route="arbitrary" />',
    '<system_action type="select_ip" sql="DROP TABLE ips" />',
    '<system_action type="navigate" route="ip-detail" ipId="NaN" />',
    '<system_action type="select_ip">secret</system_action>',
    '<system_action type="select_ip"', '<system_actionBAD type="select_ip" />',
    '{"tool_call":{"ipId":123}}', '```json\n{"ipId":123}\n```', '<tool_call name="SQL">'];
  for (const payload of payloads) {
    const parser = new SystemAssistantProtocol();
    let visible = '';
    for (const char of `收到\n${payload}`) visible += parser.push(char);
    assert.equal(visible + parser.finish(), '收到\n', payload);
    assert.equal(parser.actions.length, 0, payload);
    assert.equal(parser.invalid, true, payload);
  }
});

test('only first valid action is captured; trailing payload and excessive protocol buffers never leak', () => {
  const parser = new SystemAssistantProtocol();
  assert.equal(parser.push('<system_action type="select_ip" />'), '');
  assert.equal(parser.push('<system_action type="rename-thread" newTitle="hacked" />secret'), '');
  assert.equal(parser.actions.length, 1);
  const huge = new SystemAssistantProtocol();
  assert.equal(huge.push('<system_action ' + 'x'.repeat(6000)), '');
  assert.equal(huge.push('>secret'), '');
  assert.equal(huge.finish(), '');
  assert.equal(huge.invalid, true);
});

test('protocol permits brackets, braces, and markdown code blocks in visible text without rejection', () => {
  const parser = new SystemAssistantProtocol();
  const text = '好的，已为您找到 [相册]：\n```\n{ "count": 2 }\n```\n<system_action type="navigate" route="all-images" />';
  let visible = '';
  for (const char of text) visible += parser.push(char);
  visible += parser.finish();
  assert.equal(visible, '好的，已为您找到 [相册]：\n```\n{ "count": 2 }\n```\n');
  assert.equal(parser.actions.length, 1);
  assert.equal(parser.actions[0].route, 'all-images');
  assert.equal(parser.invalid, false);
});

test('protocol silently strips think tags at start and executes subsequent action', () => {
  const parser = new SystemAssistantProtocol();
  const text = '<think>思考一下用户的要求，应该打开回收站。</think>好的，为你打开回收站。<system_action type="navigate" route="trash" />';
  let visible = '';
  for (const char of text) visible += parser.push(char);
  visible += parser.finish();
  assert.equal(visible, '好的，为你打开回收站。');
  assert.equal(parser.actions.length, 1);
  assert.equal(parser.actions[0].route, 'trash');
  assert.equal(parser.invalid, false);
});

test('protocol silently strips think tags even without action and does not mark invalid', () => {
  const parser = new SystemAssistantProtocol();
  const text = '<think>用户想知道目前的时间，需要查看设置。</think>当前系统时间已同步。';
  let visible = '';
  for (const char of text) visible += parser.push(char);
  visible += parser.finish();
  assert.equal(visible, '当前系统时间已同步。');
  assert.equal(parser.actions.length, 0);
  assert.equal(parser.invalid, false);
});

test('protocol and registry resolve route aliases and strip harmless extra attributes', () => {
  const payloads = [
    '<system_action type="navigate" route="storage" label="存储空间" />',
    '<system_action type="navigate" route="/settings" title="系统设置" />',
    '<system_action type="navigate" route="trash-bin" desc="回收站" />',
    '<system_action type="navigate" route="roles" action="navigate" />',
    '<system_action type="navigate" route="images" summary="全部素材" />',
  ];
  const expected = ['storage-usage', 'settings', 'trash', 'ai-role-library', 'all-images'];
  for (let i = 0; i < payloads.length; i++) {
    const parser = new SystemAssistantProtocol();
    parser.push(payloads[i]);
    parser.finish();
    assert.equal(parser.actions.length, 1, payloads[i]);
    assert.equal(parser.actions[0].route, expected[i], payloads[i]);
    assert.equal(parser.invalid, false, payloads[i]);
  }
});

test('action recovery heuristic synthesizes select_ip when model reply asks user to choose IP or request is open IP', () => {
  const { recoverSystemAssistantActionFromIntent } = load(`${base}systemAssistantTaskIngestion.ts`, {
    '../../database': {},
    './systemAssistantExecutor': { listSystemAssistantIps: async () => [], validateSystemAssistantIp: async () => ({}) },
    './systemAssistantPersistence': { loadSystemTask: async () => null, saveSystemTask: async () => {} },
    './systemAssistantEvents': { publishSystemTask: () => {} },
    './systemAssistantRuntime': { withSystemTaskStep: (t, s, l) => t },
    './systemAssistantRegistry': { IP_SCOPED_SYSTEM_ROUTES: new Set() },
    './systemAssistantRoleCreation': {},
  });
  // Case 1: Model asks user to pick IP
  const recovered1 = recoverSystemAssistantActionFromIntent('查看素材', '未指定目标 IP，请选择要查看的 IP。');
  assert.equal(recovered1?.type, 'select_ip');

  // Case 2: User asks to open IP without specifying a name
  const recovered2 = recoverSystemAssistantActionFromIntent('帮我打开IP', '好的，为您准备。', [{ name: '夏日企划' }]);
  assert.equal(recovered2?.type, 'select_ip');

  // Case 3: User specifically named an IP, should NOT synthesize bare select_ip
  const recovered3 = recoverSystemAssistantActionFromIntent('打开夏日企划', '好的。', [{ name: '夏日企划' }]);
  assert.equal(recovered3, null);

  // Case 4: Normal conversation, no recovery
  const recovered4 = recoverSystemAssistantActionFromIntent('你叫什么名字', '我是 Pixory 系统管家。');
  assert.equal(recovered4, null);

  // Case 5: Real screenshot case - model says "要打开哪个 IP？请在下方选择。" and user says "打开啊"
  const recovered5 = recoverSystemAssistantActionFromIntent('打开啊', '要打开哪个 IP？请在下方选择。', [{ name: '夏日企划' }]);
  assert.equal(recovered5?.type, 'select_ip');

  // Case 6: Real screenshot case - model says "需要先确认要打开哪一个 IP。"
  const recovered6 = recoverSystemAssistantActionFromIntent('打开IP', '需要先确认要打开哪一个 IP。', [{ name: '夏日企划' }]);
  assert.equal(recovered6?.type, 'select_ip');

  // Case 7: Real screenshot case - user asks "卡片呢"
  const recovered7 = recoverSystemAssistantActionFromIntent('卡片呢', '请在下方选择。', [{ name: '夏日企划' }]);
  assert.equal(recovered7?.type, 'select_ip');
});

function fixture(overrides = {}) {
  let task = { version: 1, taskId: 'system-task:assistant', assistantMessageId: 'assistant',
    originMessageId: 'original-user', requestText: '打开素材', space: 'normal', status: 'waiting_for_ip',
    action: { type: 'select_ip' }, selectedIp: null, steps: [], error: null, undo: null,
    updatedAt: new Date().toISOString() };
  const calls = [];
  const host = { space: 'normal', load: async () => structuredClone(task), save: async next => { task = next; calls.push(next.status); },
    validateIp: async ipId => ({ space: 'normal', ipId, ipNameSnapshot: '夏日', expiresAt: new Date(Date.now() + 60000).toISOString() }),
    continueTask: async next => { calls.push(['continue', next.assistantMessageId, next.originMessageId, next.requestText]); },
    stopTask: async () => { calls.push('stop'); }, navigate: cmd => calls.push(['navigate', cmd]),
    rename: async () => null, undoRename: async () => {}, isActive: () => true, canContinue: () => true,
    changed: () => {}, ...overrides };
  return { runtime: createSystemAssistantRuntime(host), calls, get: () => task,
    set: value => { task = { ...task, ...value }; } };
}

test('IP selection continues same task once under repeated clicks and carries original request identity', async () => {
  const f = fixture();
  await Promise.all([f.runtime.resolveInput('assistant', 7), f.runtime.resolveInput('assistant', 7)]);
  assert.equal(f.get().selectedIp.ipId, 7);
  assert.equal(f.get().taskId, 'system-task:assistant');
  assert.equal(f.calls.filter(call => Array.isArray(call) && call[0] === 'continue').length, 1);
  assert.deepEqual(f.calls.find(Array.isArray), ['continue', 'assistant', 'original-user', '打开素材']);
});

test('scope mismatch, removed IP, inactive UI and concurrent generation never continue', async () => {
  for (const overrides of [
    { validateIp: async () => ({ space: 'personal' }) },
    { validateIp: async () => { throw new Error('SQL and path details'); } },
    { isActive: () => false }, { canContinue: () => false },
  ]) {
    const f = fixture(overrides);
    await f.runtime.resolveInput('assistant', 7);
    assert.equal(f.calls.some(call => Array.isArray(call) && call[0] === 'continue'), false);
    assert.equal(JSON.stringify(f.get()).includes('SQL and path'), false);
  }
});

test('known IP navigation resumes locally, waits for confirmation and persists result before navigation', async () => {
  const f = fixture();
  f.set({ action: { type: 'navigate', route: 'all-images' } });
  await f.runtime.resolveInput('assistant', 7);
  assert.equal(f.get().status, 'waiting_for_approval');
  assert.equal(f.calls.some(call => Array.isArray(call) && call[0] === 'continue'), false);
  await Promise.all([f.runtime.approve('assistant'), f.runtime.approve('assistant')]);
  assert.equal(f.get().status, 'completed');
  assert.equal(f.calls[f.calls.length - 2], 'completed');
  assert.equal(f.calls.filter(call => Array.isArray(call) && call[0] === 'navigate').length, 1);
});

test('expired selected IP requires selection again and cannot navigate', async () => {
  const f = fixture();
  f.set({ status: 'waiting_for_approval', action: { type: 'navigate', route: 'ip-detail' },
    selectedIp: { space: 'normal', ipId: 7, expiresAt: '2000-01-01T00:00:00.000Z' } });
  await f.runtime.approve('assistant');
  assert.equal(f.get().status, 'waiting_for_ip');
  assert.equal(f.calls.some(Array.isArray), false);
});

test('cancelling ongoing continuation stops generation and late failure does not overwrite cancellation', async () => {
  let reject;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const f = fixture({ continueTask: () => { started(); return new Promise((_, no) => { reject = no; }); } });
  const continuation = f.runtime.resolveInput('assistant', 7);
  await ready;
  await f.runtime.cancel('assistant');
  reject(new Error('internal'));
  await continuation;
  assert.equal(f.get().status, 'cancelled');
  assert.ok(f.calls.includes('stop'));
});

test('rename outcome exposes undo only after execution; failed undo keeps completed result', async () => {
  const undo = { previousName: null, appliedName: '伙伴', expiresAt: new Date(Date.now() + 60000).toISOString() };
  const f = fixture({ rename: async () => undo, undoRename: async () => { throw new Error('conflict'); } });
  f.set({ status: 'waiting_for_approval', action: { type: 'rename-thread', newTitle: '伙伴' } });
  await f.runtime.approve('assistant');
  assert.equal(f.get().status, 'completed');
  assert.equal(f.get().undo.appliedName, '伙伴');
  await f.runtime.undo('assistant');
  assert.equal(f.get().status, 'completed');
  assert.ok(f.get().error);
});

test('system assistant profile cannot activate for ordinary roles or IP-bound chats', () => {
  const { isSystemAssistantThread } = load(`${base}capabilityProfile.ts`);
  for (const id of ['role-1', 'ip-chat-1', 'personal-chat', '', 'pixory-system-assistant-2']) assert.equal(isSystemAssistantThread(id), false);
  assert.equal(isSystemAssistantThread('pixory-system-assistant'), true);
});

test('retry clears the old IP and retains required IP scope even without model ipName', async () => {
  const f = fixture();
  f.set({ status: 'failed', requiresIp: true, action: { type: 'navigate', route: 'all-images' },
    selectedIp: { space: 'normal', ipId: 7, ipNameSnapshot: '旧 IP', expiresAt: new Date(Date.now() + 60000).toISOString() } });
  await f.runtime.retry('assistant');
  assert.equal(f.get().status, 'waiting_for_ip');
  assert.equal(f.get().selectedIp, null);
  f.set({ status: 'failed' });
  await f.runtime.retry('assistant');
  assert.equal(f.get().status, 'waiting_for_ip');
  await f.runtime.resolveInput('assistant', 8);
  await f.runtime.approve('assistant');
  assert.equal(f.calls.find(call => Array.isArray(call) && call[0] === 'navigate')[1].ipId, 8);
});

test('restore never interrupts a local operation that outlives its original adapter', async () => {
  let finish;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const f = fixture({ rename: () => { started(); return new Promise(resolve => { finish = resolve; }); } });
  f.set({ status: 'waiting_for_approval', action: { type: 'rename-thread', newTitle: '伙伴' } });
  const approval = f.runtime.approve('assistant');
  await ready;
  const restored = createSystemAssistantRuntime({ space: 'normal', isActive: () => true,
    load: async () => f.get(), save: async task => f.set(task) });
  await restored.recover('assistant');
  assert.equal(f.get().status, 'executing');
  finish(null);
  await approval;
  assert.equal(f.get().status, 'completed');
});

test('recovery checks the exact generating message and preserves interrupted undo tokens', async () => {
  const f = fixture({ hasActiveGeneration: id => id === 'assistant' });
  f.set({ status: 'planning' });
  await f.runtime.recover('assistant');
  assert.equal(f.get().status, 'planning');
  const stopped = fixture({ hasActiveGeneration: () => false });
  stopped.set({ status: 'planning' });
  await stopped.runtime.recover('assistant');
  assert.equal(stopped.get().status, 'failed');
  const role = fixture({ hasActiveGeneration: () => false });
  role.set({ status: 'planning', action: null, steps: [{ label: '正在梳理角色设定' }] });
  await role.runtime.recover('assistant');
  assert.equal(role.get().status, 'waiting_for_user');
  assert.equal(role.get().error, null);
  assert.equal(role.get().steps.at(-1).label, '共创已暂停');
  stopped.set({ status: 'undoing', undo: { previousName: '旧名字', appliedName: '伙伴',
    expiresAt: new Date(Date.now() + 60000).toISOString() } });
  await stopped.runtime.recover('assistant');
  assert.equal(stopped.get().status, 'completed');
  assert.equal(stopped.get().undo.previousName, '旧名字');
});

test('cancel reports persistence errors and cannot stop generation after leaving its space', async () => {
  const errors = [];
  const f = fixture({ load: async () => { throw new Error('disk full'); }, reportError: message => errors.push(message) });
  await f.runtime.cancel('assistant');
  assert.equal(errors.length, 1);
  let active = true;
  const switched = fixture({ isActive: () => active, load: async () => { active = false; return { status: 'planning' }; } });
  await switched.runtime.cancel('assistant');
  assert.equal(switched.calls.length, 0);
});

function adapterFixture(threadId = 'pixory-system-assistant', isFocused = true) {
  const effects = [];
  const states = [];
  const reads = [];
  let resume;
  let removed = false;
  let runtimeHost;
  const react = {
    useRef: value => ({ current: value }),
    useMemo: factory => factory(),
    useEffect: callback => effects.push(callback),
    useState: initial => {
      const slot = states.length;
      states.push(initial);
      return [initial, value => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }];
    },
  };
  const { useSystemAssistantAdapter } = load('src/screens/useSystemAssistantAdapter.ts', {
    react,
    'react-native': { AppState: { addEventListener: (_, callback) => {
      resume = callback;
      return { remove: () => { removed = true; } };
    } } },
    '../ai/systemAssistant/systemAssistantExecutor': { listSystemAssistantIps: () => new Promise(resolve => reads.push(resolve)) },
    '../ai/systemAssistant/systemAssistantPersistence': { loadSystemTasks: async () => [] },
    '../ai/systemAssistant/systemAssistantEvents': { subscribeSystemTasks: () => () => {} },
    '../ai/systemAssistant/systemAssistantRuntime': { createSystemAssistantRuntime: host => {
      runtimeHost = host;
      return { recover: async () => {} };
    } },
    '../ai/aiGenerationManager': { aiGenerationManager: {} },
  });
  const input = { threadId, isFocused, space: 'normal', messageIds: [], navigation: {} };
  useSystemAssistantAdapter(input);
  const cleanups = effects.map(effect => effect()).filter(Boolean);
  return { states, reads, input, runtimeHost, resume: () => resume?.('active'),
    close: () => cleanups.forEach(cleanup => cleanup()), removed: () => removed };
}

test('IP candidates refresh on foreground and ignore stale requests and responses after space exit', async () => {
  const f = adapterFixture();
  assert.equal(f.reads.length, 1);
  f.resume();
  assert.equal(f.reads.length, 2);
  f.reads[1]([{ id: 8, name: '新 IP' }]);
  await Promise.resolve();
  f.reads[0]([{ id: 7, name: '旧 IP' }]);
  await Promise.resolve();
  assert.equal(f.states[1][0].id, 8);
  f.resume();
  f.close();
  f.reads[2]([{ id: 9, name: '离开后的 IP' }]);
  await Promise.resolve();
  assert.equal(f.states[1][0].id, 8);
  assert.equal(f.removed(), true);
});

test('ordinary chat adapter never reads IP candidates or subscribes to foreground refresh', () => {
  const f = adapterFixture('ordinary-chat');
  f.resume();
  assert.equal(f.reads.length, 0);
  f.close();
  assert.equal(f.removed(), false);
});

test('system assistant hidden beneath another route cannot refresh or start local operations', () => {
  const hidden = adapterFixture('pixory-system-assistant', false);
  hidden.resume();
  assert.equal(hidden.reads.length, 0);
  assert.equal(hidden.runtimeHost.isActive(), false);
  hidden.close();
  const focused = adapterFixture();
  assert.equal(focused.runtimeHost.isActive(), true);
  focused.input.isFocused = false;
  assert.equal(focused.runtimeHost.isActive(), false);
  focused.close();
});

test('action recovery heuristic recovers system function routes, rename, and post-ip-selection continuation', () => {
  const { recoverSystemAssistantActionFromIntent } = load(`${base}systemAssistantTaskIngestion.ts`, {
    '../../database': {},
    './systemAssistantExecutor': { listSystemAssistantIps: async () => [], validateSystemAssistantIp: async () => ({}) },
    './systemAssistantPersistence': { loadSystemTask: async () => null, saveSystemTask: async () => {} },
    './systemAssistantEvents': { publishSystemTask: () => {} },
    './systemAssistantRuntime': { withSystemTaskStep: (t, s, l) => t },
    './systemAssistantRegistry': { IP_SCOPED_SYSTEM_ROUTES: new Set() },
    './systemAssistantRoleCreation': {},
  });

  // 1. System function routes recovery
  assert.equal(recoverSystemAssistantActionFromIntent('打开回收站', '好的，为您打开回收站。')?.route, 'trash');
  assert.equal(recoverSystemAssistantActionFromIntent('清理存储空间', '已为您定位到存储空间。')?.route, 'storage-usage');
  assert.equal(recoverSystemAssistantActionFromIntent('锁定隐私空间', '准备锁定。')?.route, 'lock-personal-space');
  assert.equal(recoverSystemAssistantActionFromIntent('打开系统设置', '这就为您打开设置。')?.route, 'settings');
  assert.equal(recoverSystemAssistantActionFromIntent('打开设置', '好的，为您打开设置。')?.route, 'settings');
  assert.equal(recoverSystemAssistantActionFromIntent('去设置', '这就为您去设置。')?.route, 'settings');
  assert.equal(recoverSystemAssistantActionFromIntent('清理空间', '正在为您分析存储空间。')?.route, 'storage-usage');
  assert.equal(recoverSystemAssistantActionFromIntent('查看存储', '好的。')?.route, 'storage-usage');
  assert.equal(recoverSystemAssistantActionFromIntent('查看我的收藏', '好的。')?.route, 'favorites');
  assert.equal(recoverSystemAssistantActionFromIntent('看收藏', '这就打开收藏。')?.route, 'favorites');
  assert.equal(recoverSystemAssistantActionFromIntent('全部素材', '正在展示。')?.route, 'all-images');
  assert.equal(recoverSystemAssistantActionFromIntent('看图', '好的，打开相册。')?.route, 'all-images');
  assert.equal(recoverSystemAssistantActionFromIntent('打开相册', '好的。')?.route, 'all-images');
  assert.equal(recoverSystemAssistantActionFromIntent('帮我查重', '好的，检查重复素材。')?.route, 'duplicate-review');
  assert.equal(recoverSystemAssistantActionFromIntent('角色库', '好的，打开角色库。')?.route, 'ai-role-library');
  assert.equal(recoverSystemAssistantActionFromIntent('数据备份', '正在备份。')?.route, 'backup');
  assert.equal(recoverSystemAssistantActionFromIntent('发卡片', '好的。')?.type, 'select_ip');
  assert.equal(recoverSystemAssistantActionFromIntent('怎么没有卡片', '好的。')?.type, 'select_ip');
  assert.equal(recoverSystemAssistantActionFromIntent('给我选择卡', '好的。')?.type, 'select_ip');
  assert.equal(recoverSystemAssistantActionFromIntent('选卡', '好的。')?.type, 'select_ip');
  assert.equal(recoverSystemAssistantActionFromIntent('请选择', '已为您提供选择卡片，请在下方选择。')?.type, 'select_ip');
  assert.equal(recoverSystemAssistantActionFromIntent('打开素材', '好的。')?.type, 'select_ip');

  // Verify that an IP named "素材" does not swallow system routes like "全部素材" or "打开设置", nor does it swallow select_ip
  const trickyIps = [{ name: '素材', id: 1 }, { name: '相册', id: 2 }];
  assert.equal(recoverSystemAssistantActionFromIntent('全部素材', '正在展示。', trickyIps)?.route, 'all-images');
  assert.equal(recoverSystemAssistantActionFromIntent('打开设置', '好的。', trickyIps)?.route, 'settings');
  assert.equal(recoverSystemAssistantActionFromIntent('打开回收站', '好的。', trickyIps)?.route, 'trash');
  assert.equal(recoverSystemAssistantActionFromIntent('给我选择卡', '好的。', trickyIps)?.type, 'select_ip');
  assert.equal(recoverSystemAssistantActionFromIntent('导入素材', '好的。', trickyIps)?.type, 'select_ip');

  // 2. Rename thread recovery
  const renameAction = recoverSystemAssistantActionFromIntent('把你的名字改成小助手', '好的，已修改昵称为小助手。');
  assert.equal(renameAction?.type, 'rename-thread');
  assert.equal(renameAction?.newTitle, '小助手');

  // 3. Post-IP-selection continuation recovery
  const selectedIp = { ipId: 10, ipNameSnapshot: '初夏', space: 'normal', expiresAt: '2099-01-01' };
  const contAction = recoverSystemAssistantActionFromIntent('打开素材', '好的，准备为您打开初夏的素材。', [{ name: '初夏', id: 10 }], selectedIp);
  assert.equal(contAction?.type, 'navigate');
  assert.equal(contAction?.route, 'all-images');
  assert.equal(contAction?.ipName, '初夏');
});

test('role creation policy recognizes 直接生成这张卡, 确认, and authorizes creation', () => {
  const { detectSystemRoleIntent, nextSystemRoleSession, isSystemRoleCreationQuestion } = load(`${base}systemAssistantRolePolicy.ts`, {});

  assert.equal(detectSystemRoleIntent('直接生成这张卡'), 'finish');
  assert.equal(detectSystemRoleIntent('生成这张卡'), 'finish');
  assert.equal(detectSystemRoleIntent('确认'), 'finish');
  assert.equal(detectSystemRoleIntent('直接生成'), 'finish');
  assert.equal(detectSystemRoleIntent('造卡'), 'finish');

  assert.equal(isSystemRoleCreationQuestion('诺诺的设定已经定稿，草稿完整保留如下。'), true);
  assert.equal(isSystemRoleCreationQuestion('现在为你创建角色卡吗？'), true);

  const prevSession = {
    version: 1, space: 'normal', id: 'msg_0', phase: 'collecting',
    draft: { name: '诺诺', description: '活泼少女', prompt: '你是一个活泼的伙伴', firstMessage: '你好呀！' },
    lastUserMessageId: 'msg_0', authorizedMessageId: null, roleCardId: null,
    updatedAt: new Date().toISOString(), awaitingConfirmation: true,
  };

  const next1 = nextSystemRoleSession({
    space: 'normal', userMessageId: 'msg_1', requestText: '确认',
    previous: prevSession, now: new Date().toISOString(),
  });
  assert.equal(next1?.authorizedMessageId, 'msg_1');

  const next2 = nextSystemRoleSession({
    space: 'normal', userMessageId: 'msg_2', requestText: '直接生成这张卡',
    previous: prevSession, now: new Date().toISOString(),
  });
  assert.equal(next2?.authorizedMessageId, 'msg_2');
});
