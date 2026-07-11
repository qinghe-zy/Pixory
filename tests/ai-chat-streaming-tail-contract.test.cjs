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

function loadSplitter() {
  installTsHook();
  installReactNativeStub();
  return require(path.join(root, 'src/ai/aiStreamingBlockSplitter.ts'));
}

function split(content, options = {}) {
  const { splitStreamingTextIntoBlocks } = loadSplitter();
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

function loadTailModel() {
  installTsHook();
  installReactNativeStub();
  global.__DEV__ = false;
  return require(path.join(root, 'src/ai/aiStreamingTailModel.ts'));
}

test('stable block keys ignore generation id, block type, and byte offset', () => {
  const streaming = split('foo \n\n\nbar', { generationId: 'gen_stream' }).map(
    (block) => block.blockId,
  );
  const persisted = split('foo\n\nbar', { generationId: 'gen_persisted' }).map(
    (block) => block.blockId,
  );

  assert.deepEqual(persisted, streaming);
  for (const key of streaming) {
    assert.doesNotMatch(key, /gen_stream|gen_persisted/);
    assert.doesNotMatch(key, /paragraph|code|heading|list|blockquote|plain/);
    assert.match(key, /^assistant_1:0:content:\d+$/);
  }
});

test('blockIndex is unique, continuous, and mirrored by ordinal per message version lane', () => {
  const blocks = [
    ...split('第一段。\n\n第二段。\n\n第三段。\n\n第四段。\n', {
      lane: 'content',
      messageId: 'assistant_index',
      versionIndex: 2,
    }),
    ...split('思考一。\n\n思考二。\n', {
      lane: 'reasoning',
      messageId: 'assistant_index',
      versionIndex: 2,
    }),
  ];
  const grouped = new Map();
  for (const block of blocks) {
    assert.equal(block.ordinal, block.blockIndex);
    const groupKey = `${block.messageId}:${block.versionIndex}:${block.lane}`;
    const indexes = grouped.get(groupKey) ?? [];
    indexes.push(block.blockIndex);
    grouped.set(groupKey, indexes);
  }

  for (const indexes of grouped.values()) {
    assert.deepEqual(indexes, Array.from({ length: indexes.length }, (_, index) => index));
    assert.equal(new Set(indexes).size, indexes.length);
  }
});

test('finalized prefix block keys remain stable as streaming content grows', () => {
  const finalKeys = split('第一段。\n\n第二段。\n\n第三段。\n').map(
    (block) => block.blockId,
  );
  const prefixKeys = split('第一段。\n\n第二段开头').filter((block) => block.finalized).map(
    (block) => block.blockId,
  );

  assert.deepEqual(prefixKeys, finalKeys.slice(0, prefixKeys.length));
});

test('reasoning lane uses the same stable key contract as content lane', () => {
  const streaming = split('思考内容 \n\n\n继续思考', {
    generationId: 'reasoning_stream',
    lane: 'reasoning',
  }).map((block) => block.blockId);
  const reload = split('思考内容\n\n继续思考', {
    generationId: 'reasoning_reload',
    lane: 'reasoning',
  }).map((block) => block.blockId);

  assert.deepEqual(reload, streaming);
  assert.ok(streaming.every((key) => /^assistant_1:0:reasoning:\d+$/.test(key)));
});

test('terminal tail patches finalize the open frontier block in-place', () => {
  const {
    createEmptyStreamingTailState,
    mergeStreamingTailPatch,
    startStreamingTailDetach,
  } = loadTailModel();
  const detached = startStreamingTailDetach({
    bubbleWidth: 320,
    currentContent: '已显示的前缀。',
    currentReasoningText: null,
    generationId: 'gen_terminal',
    messageId: 'assistant_terminal',
    targetContent:
      '已显示的前缀。' +
      '这是一段很长的开放尾部内容，用来确保 detach freeze 不会一次吃掉全部文本，' +
      '从而留下一个没有换行结束、仍处于 live 状态的 tail frontier block。',
    targetReasoningText: null,
  });

  assert.ok(detached.blocks.some((block) => !block.finalized));

  const stopped = mergeStreamingTailPatch({
    bubbleWidth: 320,
    patch: {
      content: '仍在输出中的开放段落',
      generationId: 'gen_terminal',
      id: 'assistant_terminal',
      status: 'stopped',
    },
    previous: detached,
  });

  assert.equal(stopped.status, 'completed');
  assert.equal(stopped.debtPayoffEligible, true);
  assert.ok(stopped.blocks.length > 0);
  assert.ok(stopped.blocks.every((block) => block.finalized));

  const failed = mergeStreamingTailPatch({
    bubbleWidth: 320,
    patch: {
      content: '失败前的开放段落',
      generationId: 'gen_terminal',
      id: 'assistant_terminal',
      status: 'failed',
    },
    previous: createEmptyStreamingTailState(),
  });

  assert.equal(failed.status, 'completed');
  assert.equal(failed.debtPayoffEligible, true);
  assert.ok(failed.blocks.every((block) => block.finalized));
});

test('growing tail blocks invalidate stale measurements before safe commit', () => {
  const { createEmptyStreamingTailState, mergeStreamingTailPatch } = loadTailModel();
  const [openBlock] = split('仍在增长的尾部', {
    generationId: 'gen_measure',
    messageId: 'assistant_measure',
  });
  const previous = {
    ...createEmptyStreamingTailState(),
    blocks: [{ ...openBlock, measuredHeight: 40 }],
    generationId: 'gen_measure',
    messageId: 'assistant_measure',
    status: 'detached',
    tailContent: '仍在增长的尾部',
    totalReservedHeight: openBlock.reservedHeight,
  };

  const grown = mergeStreamingTailPatch({
    bubbleWidth: 320,
    patch: {
      content: '仍在增长的尾部，追加了尚未布局的新文字',
      generationId: 'gen_measure',
      id: 'assistant_measure',
      status: 'generating',
    },
    previous,
  });

  assert.equal(grown.blocks[0].blockId, openBlock.blockId);
  assert.equal(grown.blocks[0].measuredHeight, undefined);
});
