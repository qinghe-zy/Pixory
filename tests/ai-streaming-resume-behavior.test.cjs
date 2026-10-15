const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

function load(file, mocks = {}) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, Date, Map, Set, AbortController,
    setTimeout, clearTimeout, console, require: name => {
      assert.ok(name in mocks, `Unexpected dependency ${name}`);
      return mocks[name];
    } }, { filename: file });
  return module.exports;
}

function managerFixture() {
  const requests = [];
  const runtime = load('src/ai/aiStreamingRuntime.ts');
  const service = { sendUserMessage: request => new Promise(resolve => requests.push({ request, resolve })) };
  const { aiGenerationManager: manager } = load('src/ai/aiGenerationManager.ts', {
    '../database': {}, './aiChatService': service, './aiStreamingRuntime': runtime,
    './generation/aiGenerationRepository': {}, './generation/aiGenerationRecovery': {},
  });
  return { manager, requests, runtime };
}

test('foreground refresh publishes queued text without requiring another provider event', async () => {
  const { manager, requests, runtime } = managerFixture();
  const received = [];
  const task = manager.startSendUserMessage({ space: 'normal', threadId: 't', subscriber: { onMessagePatch: patch => received.push(patch) } });
  const { request, resolve } = requests[0];
  request.onCreated({ assistantMessageId: 'm', userMessageId: 'u', generationId: 'g' });
  request.onMessagePatch({ id: 'm', generationId: 'g', content: 'old', status: 'generating' });
  const remove = runtime.registerStreamingControl('normal', 't', { generationId: 'g',
    publish: () => request.onMessagePatch({ id: 'm', generationId: 'g', content: 'already received while backgrounded', status: 'generating' }),
    persist: async () => {},
  });
  assert.equal(manager.refreshThread('normal', 't'), true);
  assert.equal(received.at(-1).content, 'already received while backgrounded');
  assert.equal(manager.refreshThread('personal', 't'), false);
  remove(); resolve({}); await task.promise;
  assert.equal(manager.refreshThread('normal', 't'), false, 'a settled task requires persisted-message reconciliation');
});

test('reattachment replays current content and cancellation prevents delayed creation', async () => {
  const { manager, requests } = managerFixture();
  const task = manager.startSendUserMessage({ space: 'normal', threadId: 't' });
  const { request, resolve } = requests[0];
  request.onCreated({ assistantMessageId: 'm', userMessageId: 'u', generationId: 'g', thinkingExpected: true });
  request.onMessagePatch({ id: 'm', generationId: 'g', reasoningText: 'reason', status: 'generating' });
  request.onMessagePatch({ id: 'm', generationId: 'g', content: 'answer', thinkingEndedAt: '2026-10-14T00:00:03Z' });
  const events = [];
  const unsubscribe = manager.subscribeToThread('normal', 't', {
    onCreated: ids => events.push(['created', ids.generationId]),
    onMessagePatch: patch => events.push(['patch', patch.content, patch.reasoningText, patch.thinkingEndedAt]),
  });
  const cancelled = manager.subscribeToThread('normal', 't', { onCreated: () => assert.fail('unsubscribed callback ran') });
  cancelled(); await tick();
  assert.deepEqual(events, [['created', 'g'], ['patch', 'answer', 'reason', '2026-10-14T00:00:03Z']]);
  unsubscribe(); resolve({}); await task.promise;
});

test('subscribing before creation delivers creation once when it races the replay timer', async () => {
  const { manager, requests } = managerFixture();
  const task = manager.startSendUserMessage({ space: 'normal', threadId: 't' });
  let created = 0;
  const unsubscribe = manager.subscribeToThread('normal', 't', { onCreated: () => created++ });
  requests[0].request.onCreated({ assistantMessageId: 'm', userMessageId: 'u', generationId: 'g' });
  await tick();
  assert.equal(created, 1);
  unsubscribe(); requests[0].resolve({}); await task.promise;
});

test('replaced generation cleanup cannot remove the new publication owner or cross spaces', async () => {
  const runtime = load('src/ai/aiStreamingRuntime.ts');
  const seen = [];
  const control = name => ({ generationId: name, publish: () => seen.push(name), persist: async () => seen.push(`persist-${name}`) });
  const oldCleanup = runtime.registerStreamingControl('normal', 't', control('old'));
  const newCleanup = runtime.registerStreamingControl('normal', 't', control('new'));
  const personalCleanup = runtime.registerStreamingControl('personal', 't', control('personal'));
  oldCleanup(); runtime.resumeStreamingPublication('normal', 't');
  await runtime.persistActiveStreamingGeneration('normal', 't');
  assert.deepEqual(seen, ['new', 'persist-new']);
  runtime.resumeStreamingPublication('normal', 't', 'old');
  await runtime.persistActiveStreamingGeneration('normal', 't', 'old');
  assert.deepEqual(seen, ['new', 'persist-new'], 'stale generation identities cannot act on the new owner');
  newCleanup(); runtime.resumeStreamingPublication('normal', 't');
  runtime.resumeStreamingPublication('personal', 't'); personalCleanup();
  assert.deepEqual(seen, ['new', 'persist-new', 'personal']);
});

test('thinking and answer timestamps persist independently, with safe legacy and malformed fallback', () => {
  const metrics = load('src/ai/aiGenerationMetrics.ts');
  const draft = metrics.createGenerationMetricsDraft({ space: 'normal', threadId: 't', messageId: 'm', generationId: 'g' });
  Object.assign(draft.timestamps, { generationStartAt: '2026-10-14T00:00:00Z', firstAnswerDeltaAt: '2026-10-14T00:00:03Z',
    thinkingEndedAt: '2026-10-14T00:00:03Z', lastProviderDeltaAt: '2026-10-14T00:01:00Z', generationSettledAt: '2026-10-14T00:01:02Z' });
  const final = metrics.finalizeGenerationMetrics(draft);
  assert.equal(final.durations.thinkingMs, 3000);
  assert.equal(final.durations.answerStreamMs, 57000);
  const json = JSON.stringify({ generationMetrics: final });
  assert.equal(metrics.readThinkingEndedAt(json), '2026-10-14T00:00:03Z');
  assert.equal(metrics.readThinkingEndedAt('{'), null);
  assert.equal(metrics.readThinkingEndedAt('{}'), null);
  assert.equal(metrics.readThinkingEndedAt('{"generationMetrics":{"timestamps":{"firstAnswerDeltaAt":"invalid"}}}'), null);
  metrics.assertContentFreeGenerationMetrics(final);
});

test('each generation starts compact regardless of the previous or reused message expansion', () => {
  const source = ts.createSourceFile('AiChatScreen.tsx', fs.readFileSync(path.join(root, 'src/screens/AiChatScreen.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let created;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'createGenerationSubscriber') {
      const result = node.body.statements.find(ts.isReturnStatement);
      created = result.expression.properties.find(property => property.name?.getText(source) === 'onCreated').initializer.getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(created);
  for (const expanded of [false, true]) {
    const states = new Map([['previous', expanded], ['current', expanded]]);
    const context = {
      space: 'normal', targetThreadId: 't', generation: 1, pendingUserMessage: undefined,
      isCurrentStream: () => true, activeStreamingIdentityRef: {}, generationStateRef: {},
      createAiGenerationState: () => ({}), transitionGenerationPhase() {},
      thinkingExpectedByMessageIdRef: { current: new Map() }, publishStreamingMessage() {},
      thinkingExpandedByMessageIdRef: { current: states },
      visibleMessagesRef: { current: [{ id: 'previous', role: 'assistant' }] },
      setActiveAssistantId() {}, setMessages() {}, scheduleIntentionalLatestJump() {}, reloadMessages() {},
    };
    const compiled = ts.transpileModule(`globalThis.created = ${created}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(compiled, context);
    context.created({ assistantMessageId: 'current', generationId: 'g', thinkingExpected: true, userMessageId: 'u' });
    assert.equal(states.get('current'), false, 'new and reused assistant IDs both start compact');
    assert.equal(states.get('previous'), expanded, 'existing messages keep their own reading state');
  }
});

function foregroundFixture() {
  const source = ts.createSourceFile('AiChatScreen.tsx', fs.readFileSync(path.join(root, 'src/screens/AiChatScreen.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  let lifecycle;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes("const subscription = AppState.addEventListener('change'")) effect = node.arguments[0].getText(source);
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes('screenMountedRef.current = false')) {
      lifecycle = node.arguments[0].getText(source);
      assert.equal(node.arguments[1].getText(source), '[]', 'only a real unmount disposes the screen runtime');
    }
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(effect);
  const calls = [];
  let handler;
  const ref = value => ({ current: value });
  const context = {
    space: 'normal', spaceRef: ref('normal'), screenMountedRef: ref(false), appActiveRef: ref(false),
    activeThreadIdRef: ref('t'), activeStreamGenerationRef: ref(1), pendingFinalReloadRef: ref(false),
    activeMessageBranchScopesRef: ref([]), messagesRef: ref([{}, {}]), CHAT_MESSAGE_PAGE_SIZE: 40,
    voiceSessionActiveRef: ref(false), voiceCancelledRef: ref(false), newChatFeedbackTimeoutRef: ref(null),
    AppState: { addEventListener: (_name, callback) => { handler = callback; return { remove() {} }; } },
    aiGenerationManager: { refreshThread: () => false },
    setAppIsActive() {}, reloadRoleDiaries: async () => {}, scheduleCompanionMaintenance() {},
    scheduleStreamingTailReconcile: () => calls.push('reconcile'),
    flushBufferedStreamingState: async () => calls.push('flush'),
    reloadMessages: async (threadId, options) => calls.push(['reload', threadId, options.forceToLatest]),
    cancelSpeechRecognition: async () => {}, flushActiveStreamingSnapshot: async () => {},
    clearTimeout,
  };
  for (const name of ['clearComposerFocusVisibilityTimeouts', 'clearLatestJumpTimeouts', 'clearInlineEditVisibilityTimeouts',
    'clearReplyTargetVisibilityTimeouts', 'clearBranchTreeScrollTimeouts', 'clearSearchScrollTimeouts', 'clearSearchHighlightTimeout',
    'cancelGenerationAction', 'clearGenerationSubscription', 'clearActiveStreamingIdentity', 'clearVoiceResetTimeout']) context[name] = () => {};
  const compiled = ts.transpileModule(`globalThis.mount = ${effect}; globalThis.lifecycle = ${lifecycle};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, context);
  const unmount = context.lifecycle();
  const unsubscribe = context.mount();
  const cleanup = () => { unsubscribe(); unmount(); };
  return { context, calls, cleanup, foreground: () => handler('active') };
}

test('foreground reconciles background completion without forcing the reading position to latest', async () => {
  const f = foregroundFixture();
  assert.equal(f.context.screenMountedRef.current, true);
  f.foreground(); await tick();
  assert.deepEqual(f.calls, ['flush', ['reload', 't', undefined]]);
  f.cleanup(); assert.equal(f.context.screenMountedRef.current, false);
});

test('foreground reconciliation ignores a thread, space or generation changed during the await', async () => {
  for (const [name, value] of [['activeThreadIdRef', 'other'], ['spaceRef', 'personal'], ['activeStreamGenerationRef', 2]]) {
    const f = foregroundFixture();
    let resume;
    f.context.flushBufferedStreamingState = () => new Promise(resolve => { resume = resolve; });
    f.foreground(); f.context[name].current = value; resume(); await tick();
    assert.equal(f.calls.length, 0, name);
    f.cleanup();
  }
});

test('foreground wakes active publication and does not query a stale persisted snapshot', async () => {
  const f = foregroundFixture();
  f.context.aiGenerationManager.refreshThread = () => { f.calls.push('publish'); return true; };
  f.foreground(); await tick();
  assert.deepEqual(f.calls, ['publish', 'reconcile']);
  f.cleanup();
});

test('service ends thinking before database waits and guards foreground replay after a failure', () => {
  const source = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  const start = source.indexOf("if (event.type === 'answer_delta') {", source.indexOf('await adapter.streamChat(', source.indexOf('async function streamAssistantReply')));
  const end = source.indexOf("if (event.type === 'reasoning_delta'", start);
  const answer = source.slice(start, end);
  assert.ok(answer.indexOf('await ensureGenerationStreaming()') >= 0);
  assert.ok(answer.indexOf("markGenerationMetric(generationMetrics, 'thinkingEndedAt'") < answer.indexOf('await ensureGenerationStreaming()'));
  assert.ok(answer.indexOf('emitMessagePatch({') < answer.indexOf('await ensureGenerationStreaming()'));
  assert.match(source, /const emitStreamingPatch = \(force = false\) => \{\s*if \(streamFailed \|\| input.signal\?\.aborted\)/);
  assert.match(source, /const persistStreamingSnapshot = async \(force = false\) => \{\s*if \(streamFailed \|\| input.signal\?\.aborted\)/);
  assert.match(source, /const originalThinkingEnd = readThinkingEndedAt\(assistantMessage.promptSnapshotJson\)/);
});

test('thinking toggles keep the live renderer attached and relax Android native clipping', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/AiChatScreen.tsx'), 'utf8');
  const start = source.indexOf('onThinkingExpandedChange={(messageId, expanded) => {');
  const end = source.indexOf('userProfile={{', start);
  const toggle = source.slice(start, end);
  assert.doesNotMatch(toggle, /bottomLockedRef.current = false|userScrolledAwayFromBottomRef.current = true/);
  assert.match(toggle, /setClippingEnabled\(false\)/);
  assert.match(toggle, /if \(sameTailMessage\) scheduleStreamingTailReconcile/);
  assert.match(source, /if \(!thinkingHeaderReadingRef.current\) setClippingEnabled\(true\)/);
});
