const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

let tsHookInstalled = false;
let reactNativeStubInstalled = false;

function installTsHook() {
  if (tsHookInstalled) return;
  tsHookInstalled = true;
  require.extensions['.ts'] = (module, filename) => {
    const source = require('node:fs').readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.React,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: filename,
    });
    module._compile(output.outputText, filename);
  };
}

function installReactNativeStub() {
  if (reactNativeStubInstalled) return;
  reactNativeStubInstalled = true;
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'react-native') {
      return {
        PixelRatio: {
          getFontScale: () => 1,
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
}

function loadContracts() {
  installTsHook();
  installReactNativeStub();
  return require(path.join(root, 'src/ai/aiStreamingTailRenderContract.ts'));
}

function split(content, options = {}) {
  installTsHook();
  installReactNativeStub();
  const { splitStreamingTextIntoBlocks } = require(path.join(root, 'src/ai/aiStreamingBlockSplitter.ts'));
  return splitStreamingTextIntoBlocks({
    bubbleWidth: 320,
    content,
    fontScale: 1,
    generationId: options.generationId ?? 'gen_a',
    lane: options.lane ?? 'content',
    messageId: options.messageId ?? 'assistant_1',
    versionIndex: options.versionIndex ?? 0,
  });
}

test('buildTailMessageSegments returns stable block ranges without raw snapshots', () => {
  const { buildTailMessageSegments, getTailReplayItemKey } = loadContracts();
  const blocks = split('一段。\n\n二段。\n\n三段。\n', {
    messageId: 'assistant_seg',
  });
  const segments = buildTailMessageSegments({ blocks, maxBlocksPerSegment: 2 });

  assert.deepEqual(segments.map((segment) => segment.edge), ['first', 'last']);
  assert.deepEqual(segments.map((segment) => segment.blockRange), [
    { endBlockIndex: 1, lane: 'content', startBlockIndex: 0 },
    { endBlockIndex: 2, lane: 'content', startBlockIndex: 2 },
  ]);
  assert.deepEqual(segments.map(getTailReplayItemKey), [
    'assistant_seg:0',
    'assistant_seg:1',
  ]);
  for (const segment of segments) {
    assert.equal('raw' in segment, false);
    assert.equal('renderState' in segment, false);
    assert.equal('blocks' in segment, false);
  }
});

test('detached tail commits only after replay is visually settled', () => {
  const { canCommitStreamingTailToMessage } = loadContracts();
  const settled = {
    atLatest: true,
    dragging: false,
    pendingShrinkHeight: 0,
    remainingTailHeight: 0,
    unmeasuredBlockCount: 0,
  };

  assert.equal(canCommitStreamingTailToMessage(settled), true);
  assert.equal(
    canCommitStreamingTailToMessage({ ...settled, atLatest: false }),
    false,
  );
  assert.equal(
    canCommitStreamingTailToMessage({ ...settled, dragging: true }),
    false,
  );
  assert.equal(
    canCommitStreamingTailToMessage({ ...settled, remainingTailHeight: 24 }),
    false,
  );
  assert.equal(
    canCommitStreamingTailToMessage({ ...settled, pendingShrinkHeight: 12 }),
    false,
  );
  assert.equal(
    canCommitStreamingTailToMessage({ ...settled, unmeasuredBlockCount: 1 }),
    false,
  );
});

test('footerVisible only allows terminal single or last segment footer', () => {
  const { footerVisible } = loadContracts();
  const terminal = { hasPendingTail: false, terminalState: 'done' };
  const pending = { hasPendingTail: true, terminalState: 'done' };

  assert.equal(footerVisible(terminal, 'single'), true);
  assert.equal(footerVisible(terminal, 'last'), true);
  assert.equal(footerVisible(terminal, 'first'), false);
  assert.equal(footerVisible(terminal, 'middle'), false);
  assert.equal(footerVisible({ hasPendingTail: false, terminalState: 'streaming' }, 'last'), false);
  assert.equal(footerVisible(pending, 'last'), false);
});

test('debt spacer clamps height and payoff only happens at safe times', () => {
  const { createTailDebtSpacer, shouldPayoffDebt } = loadContracts();

  assert.equal(createTailDebtSpacer('m1', -10).height, 0);
  assert.equal(createTailDebtSpacer('m1', 12).height, 12);
  assert.equal(shouldPayoffDebt({ debtHeight: 10, isAtBottom: false, isListIdle: false, isMvcpCompensatedSide: false, isSpacerOffscreen: false }), false);
  assert.equal(shouldPayoffDebt({ debtHeight: 10, isAtBottom: false, isListIdle: false, isMvcpCompensatedSide: false, isSpacerOffscreen: true }), true);
  assert.equal(shouldPayoffDebt({ debtHeight: 10, isAtBottom: true, isListIdle: true, isMvcpCompensatedSide: false, isSpacerOffscreen: false }), true);
  assert.equal(shouldPayoffDebt({ debtHeight: 10, isAtBottom: false, isListIdle: false, isMvcpCompensatedSide: true, isSpacerOffscreen: false }), false);
  assert.equal(shouldPayoffDebt({ debtHeight: 10, isAtBottom: false, isListIdle: true, isMvcpCompensatedSide: true, isSpacerOffscreen: false }), true);
});

test('message segments keep reasoning and content lane ranges separate', () => {
  const { buildTailMessageSegments } = loadContracts();
  const blocks = [
    ...split('思考一。\n\n思考二。\n', {
      lane: 'reasoning',
      messageId: 'assistant_lanes',
    }),
    ...split('正文一。\n\n正文二。\n', {
      lane: 'content',
      messageId: 'assistant_lanes',
    }),
  ];
  const segments = buildTailMessageSegments({ blocks, maxBlocksPerSegment: 2 });

  assert.deepEqual(
    segments.map((segment) => segment.blockRange),
    [
      { endBlockIndex: 1, lane: 'reasoning', startBlockIndex: 0 },
      { endBlockIndex: 1, lane: 'content', startBlockIndex: 0 },
    ],
  );
  assert.deepEqual(segments.map((segment) => segment.edge), ['single', 'single']);
  assert.deepEqual(segments.map((segment) => segment.id), [
    'assistant_lanes:0',
    'assistant_lanes:1',
  ]);
});

test('promoted segments stitch after the frozen prefix instead of opening a new bubble', () => {
  const { stitchTailSegmentEdgeAfterFrozenPrefix } = loadContracts();

  assert.equal(stitchTailSegmentEdgeAfterFrozenPrefix('single'), 'last');
  assert.equal(stitchTailSegmentEdgeAfterFrozenPrefix('first'), 'middle');
  assert.equal(stitchTailSegmentEdgeAfterFrozenPrefix('middle'), 'middle');
  assert.equal(stitchTailSegmentEdgeAfterFrozenPrefix('last'), 'last');
});

test('segment chrome avoids visible reserved height and internal Android elevation', () => {
  const { getSegmentChrome } = loadContracts();

  assert.equal(getSegmentChrome('middle', 'android').elevation, 0);
  assert.equal(getSegmentChrome('middle', 'android').shadowOpacity, 0);
  assert.equal('minHeight' in getSegmentChrome('last', 'android'), false);
  assert.equal(getSegmentChrome('single', 'android').drawsFooter, true);
  assert.equal(getSegmentChrome('last', 'android').drawsFooter, true);
  assert.equal(getSegmentChrome('first', 'android').drawsFooter, false);
  assert.equal(getSegmentChrome('single', 'android').drawsCitations, true);
  assert.equal(getSegmentChrome('last', 'android').drawsCitations, true);
  assert.equal(getSegmentChrome('first', 'android').drawsCitations, false);
  assert.equal(getSegmentChrome('middle', 'android').drawsCitations, false);
});

test('streaming final and reload segment keys are equal in order and set', () => {
  const { buildTailMessageSegments, getTailReplayItemKey } = loadContracts();
  const streamingFinal = buildTailMessageSegments({
    blocks: split('foo \n\n\nbar\n', { generationId: 'stream' }),
    maxBlocksPerSegment: 1,
  }).map(getTailReplayItemKey);
  const reload = buildTailMessageSegments({
    blocks: split('foo\n\nbar\n', { generationId: 'reload' }),
    maxBlocksPerSegment: 1,
  }).map(getTailReplayItemKey);

  assert.deepEqual(reload, streamingFinal);
  assert.deepEqual(new Set(reload), new Set(streamingFinal));
});

test('selectVisibleMessage keeps selected-version data while applying frozen tail overrides', () => {
  const { selectVisibleMessage } = loadContracts();
  const selectedVersionMessage = {
    citations: [{ id: 'c3' }],
    completedAt: '2026-07-10T12:05:00.000Z',
    content: '第三版正文',
    createdAt: '2026-07-10T12:00:00.000Z',
    errorMessage: null,
    id: 'assistant_visible',
    reasoningText: '第三版思考',
    status: 'completed',
    updatedAt: '2026-07-10T12:05:00.000Z',
    versionIndex: 3,
    versionTotal: 3,
  };

  const frozen = selectVisibleMessage({
    message: selectedVersionMessage,
    tailOverride: {
      frozenContent: '冻结前缀',
      frozenReasoningText: '冻结思考',
      messageId: 'assistant_visible',
      status: 'detached',
    },
  });

  assert.equal(frozen.content, '冻结前缀');
  assert.equal(frozen.reasoningText, '冻结思考');
  assert.equal(frozen.versionIndex, 3);
  assert.equal(frozen.completedAt, selectedVersionMessage.completedAt);
  assert.deepEqual(frozen.citations, selectedVersionMessage.citations);

  const untouched = selectVisibleMessage({
    message: selectedVersionMessage,
    tailOverride: {
      frozenContent: '不会命中',
      frozenReasoningText: '不会命中',
      messageId: 'someone_else',
      status: 'detached',
    },
  });

  assert.deepEqual(untouched, selectedVersionMessage);
});
