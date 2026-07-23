const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath) {
  const filename = path.join(root, relativePath);
  const originalExtension = require.extensions['.ts'];
  require.extensions['.ts'] = function compileTypeScript(module, sourcePath) {
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: sourcePath,
    }).outputText;
    module._compile(output, sourcePath);
  };
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename);
  } finally {
    if (originalExtension) {
      require.extensions['.ts'] = originalExtension;
    } else {
      delete require.extensions['.ts'];
    }
  }
}

function makeSnapshot(overrides = {}) {
  return {
    thread: {
      id: 'thread-1',
      contextType: 'normal',
      sessionApiKeyRef: null,
      ...overrides.thread,
    },
    messages: overrides.messages ?? [
      {
        id: 'message-1',
        status: 'completed',
      },
    ],
  };
}

test('ordinary idle threads without session secrets can move between spaces', () => {
  const { assertAiThreadSpaceMoveAllowed } = loadTypeScriptModule('src/ai/aiThreadSpaceMovePolicy.ts');

  assert.doesNotThrow(() => assertAiThreadSpaceMoveAllowed(makeSnapshot()));
});

test('IP and knowledge-base bound threads cannot silently cross independent space databases', () => {
  const { assertAiThreadSpaceMoveAllowed } = loadTypeScriptModule('src/ai/aiThreadSpaceMovePolicy.ts');

  assert.throws(
    () => assertAiThreadSpaceMoveAllowed(makeSnapshot({ thread: { contextType: 'ip' } })),
    /IP 或知识库绑定的聊天暂不支持跨空间移动/
  );
  assert.throws(
    () => assertAiThreadSpaceMoveAllowed(makeSnapshot({ thread: { contextType: 'knowledge_base' } })),
    /IP 或知识库绑定的聊天暂不支持跨空间移动/
  );
});

test('active generations and thread-scoped API keys block a cross-space move', () => {
  const { assertAiThreadSpaceMoveAllowed } = loadTypeScriptModule('src/ai/aiThreadSpaceMovePolicy.ts');

  for (const status of ['queued', 'generating', 'draft']) {
    assert.throws(
      () => assertAiThreadSpaceMoveAllowed(makeSnapshot({ messages: [{ id: 'message-1', status }] })),
      /仍有未完成的消息/
    );
  }
  assert.throws(
    () => assertAiThreadSpaceMoveAllowed(makeSnapshot({ thread: { sessionApiKeyRef: 'secure-ref' } })),
    /使用了本会话专属 API Key/
  );
});
