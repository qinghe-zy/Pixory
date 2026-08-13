const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadService(fixture) {
  const filename = path.join(root, 'src/ai/aiEmbeddingService.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../database') {
      return fixture.database;
    }
    if (request === './aiProviderService') {
      return { getAdapterForProvider: () => fixture.adapter };
    }
    if (request === './secureAiSettingsService') {
      return { getProviderApiKeyForSpace: async () => 'secret-key' };
    }
    if (request === './aiBoundedConcurrency') {
      const helperFilename = path.join(root, 'src/ai/aiBoundedConcurrency.ts');
      const helperOutput = ts.transpileModule(fs.readFileSync(helperFilename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: helperFilename,
      }).outputText;
      const helperModule = { exports: {} };
      new Function('exports', 'module', 'require', helperOutput)(
        helperModule.exports,
        helperModule,
        require,
      );
      return helperModule.exports;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const module = { exports: {} };
    new Function('exports', 'module', 'require', '__filename', '__dirname', output)(
      module.exports,
      module,
      require,
      filename,
      path.dirname(filename),
    );
    return module.exports;
  } finally {
    Module._load = originalLoad;
  }
}

test('generating missing embeddings preserves existing vectors for the same document and model', async () => {
  const calls = [];
  const db = {
    async getAllAsync() {
      return [{ id: 'chunk-missing', text: 'new chunk' }];
    },
    async runAsync(sql, ...params) {
      calls.push({ params, sql });
      return { changes: 1 };
    },
    async withTransactionAsync(task) {
      return task();
    },
  };
  const fixture = {
    adapter: {
      async embedText() {
        return [0.25, 0.75];
      },
    },
    database: {
      aiKnowledgeRepository: {
        async replaceEmbeddings(_db, embeddings) {
          calls.push({ embeddings });
        },
      },
      aiProviderRepository: {
        async findProviderById() {
          return { id: 'provider-1', baseUrl: 'https://example.invalid' };
        },
      },
      async runWithDatabaseSpace(_space, task) {
        return task(db);
      },
    },
  };
  const service = loadService(fixture);

  const result = await service.generateMissingEmbeddingsForDocument({
    documentId: 'document-1',
    modelId: 'model-1',
    providerId: 'provider-1',
    space: 'normal',
  });

  assert.deepEqual(result, { generated: 1, failed: 0 });
  assert.equal(calls.filter((call) => call.sql?.startsWith('DELETE FROM ai_embeddings')).length, 0);
  assert.equal(calls.filter((call) => call.embeddings).length, 1);
  assert.equal(calls.find((call) => call.embeddings).embeddings[0].chunkId, 'chunk-missing');
});

test('embedding generation limits provider concurrency and keeps deterministic partial results', async () => {
  const chunks = Array.from({ length: 7 }, (_, index) => ({
    id: `chunk-${index}`,
    text: `text-${index}`,
  }));
  let active = 0;
  let maxActive = 0;
  let writtenEmbeddings = null;
  const db = {
    async getAllAsync() {
      return chunks;
    },
    async withTransactionAsync(task) {
      return task();
    },
  };
  const fixture = {
    adapter: {
      async embedText({ text }) {
        const index = Number(text.slice('text-'.length));
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, (7 - index) * 2));
        active -= 1;
        if (index === 2) {
          throw new Error('expected provider failure');
        }
        return index === 5 ? [] : [index, index + 0.5];
      },
    },
    database: {
      aiKnowledgeRepository: {
        async replaceEmbeddings(_db, embeddings) {
          writtenEmbeddings = embeddings;
        },
      },
      aiProviderRepository: {
        async findProviderById() {
          return { id: 'provider-1', baseUrl: 'https://example.invalid' };
        },
      },
      async runWithDatabaseSpace(_space, task) {
        return task(db);
      },
    },
  };
  const service = loadService(fixture);

  const result = await service.generateMissingEmbeddingsForDocument({
    documentId: 'document-1',
    modelId: 'model-1',
    providerId: 'provider-1',
    space: 'personal',
  });

  assert.equal(maxActive, 3);
  assert.deepEqual(result, { generated: 5, failed: 2 });
  assert.deepEqual(
    writtenEmbeddings.map((embedding) => embedding.chunkId),
    ['chunk-0', 'chunk-1', 'chunk-3', 'chunk-4', 'chunk-6'],
  );
});
