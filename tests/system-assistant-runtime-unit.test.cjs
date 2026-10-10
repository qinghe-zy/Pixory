const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

function load(relative, mocks = {}) {
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
    '{"tool_call":{"ipId":123}}', '```json\n{"ipId":123}\n```', '<tool_call name="SQL">',
    '<think>internal thought</think>'];
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
