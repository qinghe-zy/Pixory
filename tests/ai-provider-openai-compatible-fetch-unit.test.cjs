const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
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

function loadProviderWithFetch(fetchImpl) {
  return loadProviderModuleWithFetch(
    'src/ai/providers/openAiCompatibleProvider.ts',
    'openAiCompatibleProvider',
    fetchImpl,
  );
}

function loadProviderModuleWithFetch(relativePath, exportName, fetchImpl) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'expo/fetch') {
      return { fetch: fetchImpl };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return loadTypeScriptModule(relativePath)[exportName];
  } finally {
    Module._load = originalLoad;
  }
}

function chatInput() {
  return {
    apiKey: 'test-key',
    baseUrl: 'https://example.com/v1',
    history: [],
    modelId: 'model',
    systemPrompt: 'system',
    userPrompt: 'hello',
  };
}

function streamingResponse(chunks) {
  const encoder = new TextEncoder();
  const encodedChunks = chunks.map((chunk) =>
    typeof chunk === 'string' ? encoder.encode(chunk) : chunk
  );
  let index = 0;
  return {
    body: {
      getReader() {
        return {
          async read() {
            if (index >= encodedChunks.length) {
              return { done: true };
            }
            const value = encodedChunks[index];
            index += 1;
            return { done: false, value };
          },
        };
      },
    },
    ok: true,
    status: 200,
  };
}

function textResponse(text) {
  return {
    body: null,
    ok: true,
    status: 200,
    async text() {
      return text;
    },
  };
}

async function collectStreamEvents(provider) {
  const events = [];
  await provider.streamChat(chatInput(), (event) => {
    events.push(event);
  });
  return events;
}

function expoResponse(body) {
  let reads = 0;
  return {
    ok: true,
    status: 200,
    clone() {
      throw new Error('Not implemented');
    },
    async text() {
      reads += 1;
      if (reads > 1) {
        throw new Error('body already consumed');
      }
      return body;
    },
    get reads() {
      return reads;
    },
  };
}

test('DeepSeek verification consumes an Expo response once without requiring Response.clone', async () => {
  const response = expoResponse(JSON.stringify({ id: 'chatcmpl-test', choices: [] }));
  const provider = loadProviderWithFetch(async () => response);

  await provider.verifyChatCompletion({
    apiKey: 'test-key',
    baseUrl: 'https://api.deepseek.com',
    modelId: 'deepseek-chat',
  });

  assert.equal(response.reads, 1);
});

test('OpenAI-compatible verification retains root-to-v1 fallback after consuming each body once', async () => {
  const rootResponse = expoResponse('<html>gateway</html>');
  const v1Response = expoResponse(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }));
  const urls = [];
  const provider = loadProviderWithFetch(async (url) => {
    urls.push(url);
    return urls.length === 1 ? rootResponse : v1Response;
  });

  await provider.verifyChatCompletion({
    apiKey: 'test-key',
    baseUrl: 'https://example.com',
    modelId: 'model',
  });

  assert.deepEqual(urls, [
    'https://example.com/chat/completions',
    'https://example.com/v1/chat/completions',
  ]);
  assert.equal(rootResponse.reads, 1);
  assert.equal(v1Response.reads, 1);
});

test('OpenAI-compatible streamed JSON fallback emits usage answer and completion once in order', async () => {
  const body = JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { content: 'fallback answer' } }],
    usage: { completion_tokens: 2, prompt_tokens: 3, total_tokens: 5 },
  });
  const provider = loadProviderWithFetch(async () => streamingResponse([body]));

  const events = await collectStreamEvents(provider);

  assert.deepEqual(events, [
    {
      rawUsage: { completion_tokens: 2, prompt_tokens: 3, total_tokens: 5 },
      type: 'provider_usage',
    },
    { text: 'fallback answer', type: 'answer_delta' },
    { finishReason: 'stop', type: 'completed' },
  ]);
});

test('OpenAI-compatible non-stream JSON keeps message content that contains data markers', async () => {
  const body = JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { content: 'mention data: marker' } }],
  });
  const provider = loadProviderWithFetch(async () => textResponse(body));

  const events = await collectStreamEvents(provider);

  assert.deepEqual(events, [
    { text: 'mention data: marker', type: 'answer_delta' },
    { finishReason: 'stop', type: 'completed' },
  ]);
});

test('OpenAI-compatible SSE emits each delta and completion exactly once', async () => {
  const provider = loadProviderWithFetch(async () => streamingResponse([
    'data: {"choices":[{"delta":{"content":"A"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"B"},"finish_reason":"stop"}]}\n\n',
    'data: [DONE]\n\n',
  ]));

  const events = await collectStreamEvents(provider);

  assert.deepEqual(events, [
    { text: 'A', type: 'answer_delta' },
    { text: 'B', type: 'answer_delta' },
    { finishReason: 'stop', type: 'completed' },
  ]);
});

test('OpenAI-compatible raw JSON streaming parses every line once without fallback replay', async () => {
  const provider = loadProviderWithFetch(async () => streamingResponse([
    '{"choices":[{"delta":{"content":"A"}}]}\n',
    '{"choices":[{"delta":{"content":"B"},"finish_reason":"stop"}]}\n',
  ]));

  const events = await collectStreamEvents(provider);

  assert.deepEqual(events, [
    { text: 'A', type: 'answer_delta' },
    { text: 'B', type: 'answer_delta' },
    { finishReason: 'stop', type: 'completed' },
  ]);
});

test('OpenAI-compatible raw JSON streaming preserves a leading usage-only frame', async () => {
  const provider = loadProviderWithFetch(async () => streamingResponse([
    '{"usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4}}\n',
    '{"choices":[{"delta":{"content":"A"},"finish_reason":"stop"}]}\n',
  ]));

  const events = await collectStreamEvents(provider);

  assert.deepEqual(events, [
    {
      rawUsage: { completion_tokens: 1, prompt_tokens: 3, total_tokens: 4 },
      type: 'provider_usage',
    },
    { text: 'A', type: 'answer_delta' },
    { finishReason: 'stop', type: 'completed' },
  ]);
});

test('provider stream readers flush decoders and preserve split UTF-8 characters', async () => {
  const NativeTextDecoder = global.TextDecoder;
  let eofFlushCount = 0;
  global.TextDecoder = class TrackingTextDecoder extends NativeTextDecoder {
    decode(input, options) {
      if (arguments.length === 0) {
        eofFlushCount += 1;
      }
      return super.decode(input, options);
    }
  };
  try {
    const encoder = new TextEncoder();
    const openAiPayload = encoder.encode('data: {"choices":[{"delta":{"content":"你"},"finish_reason":"stop"}]}\n\n');
    const chineseStart = openAiPayload.indexOf(0xe4);
    const openAiProvider = loadProviderWithFetch(async () => streamingResponse([
      openAiPayload.slice(0, chineseStart + 1),
      openAiPayload.slice(chineseStart + 1, chineseStart + 2),
      openAiPayload.slice(chineseStart + 2),
    ]));
    const openAiEvents = await collectStreamEvents(openAiProvider);

    const claudeProvider = loadProviderModuleWithFetch(
      'src/ai/providers/claudeProvider.ts',
      'claudeProvider',
      async () => streamingResponse([
        'data: {"type":"content_block_delta","delta":{"text":"你"}}\n',
      ]),
    );
    const claudeEvents = await collectStreamEvents(claudeProvider);

    const geminiProvider = loadProviderModuleWithFetch(
      'src/ai/providers/geminiProvider.ts',
      'geminiProvider',
      async () => streamingResponse([
        '{"candidates":[{"content":{"parts":[{"text":"你"}]}}]}',
      ]),
    );
    const geminiEvents = await collectStreamEvents(geminiProvider);

    assert.deepEqual(openAiEvents, [
      { text: '你', type: 'answer_delta' },
      { finishReason: 'stop', type: 'completed' },
    ]);
    assert.equal(claudeEvents.filter((event) => event.type === 'answer_delta')[0]?.text, '你');
    assert.equal(geminiEvents.filter((event) => event.type === 'answer_delta')[0]?.text, '你');
    assert.equal(eofFlushCount, 3);
  } finally {
    global.TextDecoder = NativeTextDecoder;
  }
});
