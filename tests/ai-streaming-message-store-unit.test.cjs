const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadStreamingStore() {
  const source = fs.readFileSync(path.join(root, 'src/ai/aiStreamingMessageStore.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  const sandbox = {
    Date,
    Map,
    Set,
    console,
    exports: module.exports,
    module,
    require(request) {
      if (request === 'react') {
        return {
          useSyncExternalStore() {
            throw new Error('React hook should not run in store behavior tests.');
          },
        };
      }
      throw new Error(`Unexpected require: ${request}`);
    },
  };
  vm.runInNewContext(compiled, sandbox, { filename: 'aiStreamingMessageStore.ts' });
  return module.exports;
}

function identity() {
  return {
    generationId: 'gen_1',
    messageId: 'msg_1',
    space: 'normal',
    threadId: 'thread_1',
  };
}

test('reasoning phase ends on ingress metadata even before any visible answer text', () => {
  const store = loadStreamingStore();
  const id = identity();
  store.publishStreamingMessage(id, { reasoningText: 'thinking' });
  let reasoning = 0;
  let content = 0;
  store.subscribeStreamingMessageReasoning(id, () => reasoning++);
  store.subscribeStreamingMessageContent(id, () => content++);
  store.publishStreamingMessage(id, { thinkingEndedAt: '2026-10-14T00:00:03Z' });
  assert.equal(reasoning, 1);
  assert.equal(content, 0);
  assert.equal(store.getStreamingMessageSnapshot(id).content, '');
  store.publishStreamingMessage(id, { content: 'first answer' });
  store.publishStreamingMessage(id, { content: 'first answer continues' });
  assert.equal(store.getStreamingMessageSnapshot(id).thinkingEndedAt, '2026-10-14T00:00:03Z');
  store.publishStreamingMessage({ ...id, generationId: 'other' }, { thinkingEndedAt: null });
  assert.equal(store.getStreamingMessageSnapshot(id).thinkingEndedAt, '2026-10-14T00:00:03Z');
});

test('streaming message store notifies only changed subscription channels', () => {
  const store = loadStreamingStore();
  const id = identity();
  let allNotifications = 0;
  let contentNotifications = 0;
  let reasoningNotifications = 0;

  const unsubscribeAll = store.subscribeStreamingMessage(id, () => {
    allNotifications += 1;
  });
  const unsubscribeContent = store.subscribeStreamingMessageContent(id, () => {
    contentNotifications += 1;
  });
  const unsubscribeReasoning = store.subscribeStreamingMessageReasoning(id, () => {
    reasoningNotifications += 1;
  });

  store.publishStreamingMessage(id, { content: 'hello', status: 'generating' });
  assert.equal(allNotifications, 1);
  assert.equal(contentNotifications, 1);
  assert.equal(reasoningNotifications, 1);

  store.publishStreamingMessage(id, { content: 'hello world' });
  assert.equal(allNotifications, 2);
  assert.equal(contentNotifications, 2);
  assert.equal(reasoningNotifications, 1);

  store.publishStreamingMessage(id, { reasoningText: 'thinking' });
  assert.equal(allNotifications, 3);
  assert.equal(contentNotifications, 2);
  assert.equal(reasoningNotifications, 2);

  store.publishStreamingMessage(id, { status: 'completed' });
  assert.equal(allNotifications, 4);
  assert.equal(contentNotifications, 2);
  assert.equal(reasoningNotifications, 3);

  store.publishStreamingMessage(id, { status: 'completed' });
  assert.equal(allNotifications, 4);
  assert.equal(contentNotifications, 2);
  assert.equal(reasoningNotifications, 3);

  unsubscribeAll();
  unsubscribeContent();
  unsubscribeReasoning();
});

test('streaming message store clear resets snapshots and notifies active subscribers once', () => {
  const store = loadStreamingStore();
  const id = identity();
  let allNotifications = 0;
  let contentNotifications = 0;
  let reasoningNotifications = 0;

  store.publishStreamingMessage(id, { content: 'hello', reasoningText: 'thinking', status: 'generating' });

  const unsubscribeAll = store.subscribeStreamingMessage(id, () => {
    allNotifications += 1;
  });
  const unsubscribeContent = store.subscribeStreamingMessageContent(id, () => {
    contentNotifications += 1;
  });
  const unsubscribeReasoning = store.subscribeStreamingMessageReasoning(id, () => {
    reasoningNotifications += 1;
  });

  store.clearStreamingMessage(id);
  assert.equal(allNotifications, 1);
  assert.equal(contentNotifications, 1);
  assert.equal(reasoningNotifications, 1);
  const clearedSnapshot = store.getStreamingMessageSnapshot(id);
  assert.equal(clearedSnapshot.content, '');
  assert.equal(clearedSnapshot.hasSnapshot, false);
  assert.equal(clearedSnapshot.reasoningText, null);
  assert.equal(clearedSnapshot.status, 'generating');
  assert.equal(clearedSnapshot.updatedAt, 0);

  store.clearStreamingMessage(id);
  assert.equal(allNotifications, 1);
  assert.equal(contentNotifications, 1);
  assert.equal(reasoningNotifications, 1);

  unsubscribeAll();
  unsubscribeContent();
  unsubscribeReasoning();
});

test('first answer token notifies reasoning once so thinking ends before the answer finishes', () => {
  const store = loadStreamingStore();
  const id = identity();
  store.publishStreamingMessage(id, { reasoningText: 'working', content: '' });
  let notifications = 0;
  store.subscribeStreamingMessageReasoning(id, () => notifications++);
  store.publishStreamingMessage(id, { content: 'first' });
  assert.equal(notifications, 1);
  assert.equal(store.getStreamingMessageSnapshot(id).status, 'generating');
  store.publishStreamingMessage(id, { content: 'first answer' });
  assert.equal(notifications, 1);
});
