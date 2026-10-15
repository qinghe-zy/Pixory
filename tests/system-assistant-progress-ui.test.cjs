const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

function fixture() {
  const cache = new Map();
  const states = [];
  let cursor = 0;
  const native = { View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator',
    Image: { resolveAssetSource: () => ({ uri: 'asset:avatar' }) },
    StyleSheet: { create: styles => styles, hairlineWidth: 0.5 }, Platform: { select: values => values.android ?? values.default } };
  const react = { memo: fn => fn, useRef: value => ({ current: value }), useEffect: () => {},
    useState: initial => {
      const slot = cursor++;
      if (!(slot in states)) states[slot] = initial;
      return [states[slot], next => { states[slot] = next; }];
    } };
  const mocks = { react, 'react-native': native, 'react/jsx-runtime': {
    jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, 'expo-image': { Image: 'Image' },
    '../SecureImage': { SecureImage: 'SecureImage' },
    '../IpRail': { IpRail: 'IpRail' },
    './SystemAssistantTaskDetails': { SystemAssistantTaskDetailsDialog: 'SystemAssistantTaskDetailsDialog' },
    '../../ai/aiStreamingBubbleWidthRegistry': { setLatestAssistantBubbleContentWidth: () => {} } };
  function load(relative) {
    let filename = path.resolve(__dirname, '..', relative);
    if (!fs.existsSync(filename)) filename = path.join(filename.replace(/\.ts$/, ''), 'index.ts');
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const requireModule = id => {
      if (/\.png$/.test(id)) return 1;
      if (mocks[id]) return mocks[id];
      if (/^\.\/Ai/.test(id)) return new Proxy({}, { get: (_, key) => key });
      const target = path.resolve(path.dirname(filename), id);
      return load(fs.existsSync(`${target}.tsx`) ? `${target}.tsx` : `${target}.ts`);
    };
    vm.runInNewContext(source, { module, exports: module.exports, require: requireModule, Date, Intl, Set, Map }, { filename });
    return module.exports;
  }
  return { load, render(component, props) { cursor = 0; return component(props); } };
}

function flatten(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (typeof node.type === 'function') return flatten(node.type(node.props));
  return [node, ...flatten(node.props?.children)];
}
function style(value) { return Object.assign({}, ...[value].flat(Infinity).filter(Boolean)); }

test('progress is absent for greetings and time queries, and expansion exposes only arrived stages', () => {
  const f = fixture();
  const { SystemAssistantProgress } = f.load('src/components/ai/SystemAssistantProgress.tsx');
  const props = { task: { status: 'planning', action: null, steps: [{ label: '正在理解请求' }] }, messageStatus: 'generating', hasAnswer: false };
  assert.equal(f.render(SystemAssistantProgress, props), null);
  props.task.steps.push({ label: '正在梳理角色设定', status: 'planning' });
  let tree = f.render(SystemAssistantProgress, props);
  let nodes = flatten(tree);
  const button = nodes.find(node => node.type === 'Pressable');
  assert.equal(button.props.accessibilityState.expanded, false);
  assert.equal(nodes.filter(node => node.type === 'Text').length, 1);
  assert.equal(style(nodes.find(node => node.type === 'Text').props.style).flex, undefined);
  button.props.onPress();
  tree = f.render(SystemAssistantProgress, props);
  nodes = flatten(tree);
  assert.equal(nodes.filter(node => node.type === 'Text').length, 2);
  props.task.status = 'waiting_for_user';
  props.task.steps.push({ label: '设定已记录', status: 'waiting_for_user' });
  nodes = flatten(f.render(SystemAssistantProgress, props));
  assert.equal(nodes.filter(node => node.type === 'Text').length, 3);
  assert.ok(nodes.some(node => node.type === 'Ionicons' && node.props.name === 'checkmark-circle'));
  assert.equal(nodes.some(node => node.type === 'ActivityIndicator'), false);
});

test('streaming system assistant metadata and progress have stable width before the first token', () => {
  const f = fixture();
  const { AiMessageBubble } = f.load('src/components/ai/AiMessageBubble.tsx');
  const props = { message: { id: 'a', role: 'assistant', content: '', status: 'generating',
    citations: [], versionTotal: 1, createdAt: '2026-10-14T00:00:00Z' },
    isSystemAssistant: true, showAvatar: true, generating: true, streaming: true,
    assistantDisplayName: 'Pixory', space: 'normal' };
  for (const content of ['', '你', '你希望怎样的角色？']) {
    props.message.content = content;
    const tree = f.render(AiMessageBubble, props);
    assert.equal(style(tree.props.style).width, '100%');
    assert.equal(style(tree.props.children.props.style).width, '94%');
    assert.equal(style(tree.props.children.props.style).minWidth, 0);
  }
  props.isSystemAssistant = false;
  assert.equal(style(f.render(AiMessageBubble, props).props.children.props.style).width, undefined);
});

test('task failures have no duplicate retry/cancel row and real results retain their role entry', () => {
  const f = fixture();
  const { SystemAssistantTaskCard } = f.load('src/components/ai/SystemAssistantTaskCard.tsx');
  const props = { task: { status: 'failed', action: null }, ips: [], disabled: false };
  assert.equal(f.render(SystemAssistantTaskCard, props), null);
  props.task.status = 'expired';
  assert.equal(f.render(SystemAssistantTaskCard, props), null);
  props.task = { status: 'completed', action: { type: 'role-draft' },
    createdRoleCard: { id: 'role', expiresAt: '2000-01-01T00:00:00Z' } };
  let opened;
  props.onOpenRole = id => { opened = id; };
  const nodes = flatten(f.render(SystemAssistantTaskCard, props));
  assert.deepEqual(nodes.filter(node => node.type === 'Text').map(node => node.props.children), ['角色卡已创建', '查看角色']);
  nodes.find(node => node.type === 'Pressable').props.onPress();
  assert.equal(opened, 'role');
});

test('navigation and rename keep the original operation card and controlled confirmation', () => {
  const f = fixture();
  const { SystemAssistantTaskCard } = f.load('src/components/ai/SystemAssistantTaskCard.tsx');
  let confirmed = 0;
  let cancelled = 0;
  const props = { task: { status: 'waiting_for_approval', action: { type: 'rename-thread', newTitle: '星星' } },
    ips: [], disabled: false, onConfirm: () => confirmed++, onCancel: () => cancelled++ };
  let nodes = flatten(f.render(SystemAssistantTaskCard, props));
  const card = nodes.find(node => node.type === 'View' && style(node.props.style).borderColor === '#e4e4e7');
  assert.ok(card, 'uses the original bordered operation card');
  assert.equal(style(card.props.style).borderRadius, 12);
  assert.equal(style(card.props.style).padding, 12);
  assert.deepEqual(nodes.filter(node => node.type === 'Text').map(node => node.props.children),
    ['确认修改昵称', '将修改为「星星」', '取消', '确认修改']);
  nodes.filter(node => node.type === 'Pressable')[1].props.onPress();
  assert.equal(confirmed, 1);
  nodes = flatten(f.render(SystemAssistantTaskCard, props));
  assert.equal(nodes.some(node => node.type === 'Text' && node.props.children === '已确认'), false);
  nodes.find(node => node.type === 'Pressable').props.onPress();
  assert.equal(cancelled, 1);
  props.task = { status: 'completed', action: { type: 'navigate', route: 'settings' } };
  nodes = flatten(f.render(SystemAssistantTaskCard, props));
  assert.ok(nodes.some(node => node.type === 'Text' && node.props.children === '再次前往'));
  nodes.find(node => node.type === 'Pressable').props.onPress();
  assert.equal(confirmed, 2);
  nodes.filter(node => node.type === 'Pressable')[1].props.onPress();
  nodes = flatten(f.render(SystemAssistantTaskCard, props));
  assert.equal(nodes.find(node => node.type === 'SystemAssistantTaskDetailsDialog').props.visible, true);
  props.disabled = true;
  nodes = flatten(f.render(SystemAssistantTaskCard, props));
  assert.ok(nodes.some(node => node.type === 'View' && node.props.pointerEvents === 'none'));
  assert.equal(nodes.filter(node => node.type === 'Pressable')[1].props.disabled, true);
});

test('IP selection and role undo use original cards without losing their callbacks', () => {
  const f = fixture();
  const { SystemAssistantTaskCard } = f.load('src/components/ai/SystemAssistantTaskCard.tsx');
  let created = 0;
  let selected;
  let undone = 0;
  const props = { task: { status: 'waiting_for_ip', action: null }, ips: [], disabled: false,
    onCreateIp: () => created++, onSelectIp: id => { selected = id; }, onCancel: () => {}, onUndo: () => undone++ };
  let nodes = flatten(f.render(SystemAssistantTaskCard, props));
  nodes.filter(node => node.type === 'Pressable')[1].props.onPress();
  assert.equal(created, 1);
  props.ips = [{ id: 7, name: 'IP' }];
  nodes = flatten(f.render(SystemAssistantTaskCard, props));
  assert.equal(nodes.filter(node => node.type === 'Pressable')[1].props.disabled, true);
  nodes.find(node => node.type === 'IpRail').props.onSelectIp(7);
  nodes = flatten(f.render(SystemAssistantTaskCard, props));
  nodes.filter(node => node.type === 'Pressable')[1].props.onPress();
  assert.equal(selected, 7);
  nodes = flatten(f.render(SystemAssistantTaskCard, props));
  assert.equal(nodes.some(node => node.type === 'Text' && node.props.children === '已确认'), false);
  props.task = { status: 'completed', action: { type: 'role-draft' },
    createdRoleCard: { id: 'role', expiresAt: '2099-01-01T00:00:00Z' } };
  props.onOpenRole = () => {};
  const roleFixture = fixture();
  const roleCard = roleFixture.load('src/components/ai/SystemAssistantTaskCard.tsx').SystemAssistantTaskCard;
  nodes = flatten(roleFixture.render(roleCard, props));
  assert.ok(nodes.some(node => node.type === 'Text' && node.props.children === '撤销'));
  nodes.find(node => node.type === 'Pressable').props.onPress();
  assert.equal(undone, 1);
});

test('user messages and editors use white surfaces, readable cursors and filled cancel/send buttons', () => {
  const f = fixture();
  const { AiMessageBubble } = f.load('src/components/ai/AiMessageBubble.tsx');
  let cancelled = 0;
  const props = { message: { id: 'user', role: 'user', content: '我的消息', status: 'completed',
    citations: [], versionTotal: 1, createdAt: '2026-10-14T00:00:00Z' },
    space: 'normal', onCancelEdit: () => cancelled++ };
  let nodes = flatten(f.render(AiMessageBubble, props));
  const bubble = nodes.find(node => node.type === 'Pressable' && style(node.props.style).backgroundColor === '#FFFFFF');
  assert.ok(bubble);
  assert.equal(style(nodes.find(node => node.type === 'Text' && node.props.children === '我的消息').props.style).color, '#1C1C1E');
  props.editingMessageId = 'user';
  nodes = flatten(f.render(AiMessageBubble, props));
  const editor = nodes.find(node => node.type === 'TextInput');
  assert.equal(style(editor.props.style).color, '#1C1C1E');
  assert.equal(editor.props.cursorColor, '#1C1C1E');
  const cancel = nodes.find(node => node.type === 'Pressable' && node.props.accessibilityLabel === '取消重写');
  const send = nodes.find(node => node.type === 'Pressable' && node.props.accessibilityLabel === '提交重写');
  assert.equal(style(cancel.props.style({ pressed: false })).backgroundColor, '#EDEDED');
  assert.equal(style(send.props.style({ pressed: false })).backgroundColor, '#5B9CF6');
  cancel.props.onPress();
  assert.equal(cancelled, 1);
  assert.equal(send.props.disabled, true);
  editor.props.onChangeText('修改后消息');
  props.onSubmitEdit = (id, value) => { assert.equal(id, 'user'); assert.equal(value, '修改后消息'); };
  nodes = flatten(f.render(AiMessageBubble, props));
  const enabledSend = nodes.find(node => node.type === 'Pressable' && node.props.accessibilityLabel === '提交重写');
  assert.equal(enabledSend.props.disabled, false);
  enabledSend.props.onPress();
});
