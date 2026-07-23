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
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'expo/fetch') {
      return { fetch: fetchImpl };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return loadTypeScriptModule('src/ai/providers/openAiCompatibleProvider.ts')
      .openAiCompatibleProvider;
  } finally {
    Module._load = originalLoad;
  }
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
