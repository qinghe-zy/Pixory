const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

// Helper to transpile and load TS modules in CommonJS test runner
function loadTsModule(relativePath, customMocks = {}) {
  const fullPath = path.join(root, relativePath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: fullPath,
  }).outputText;

  const mod = { exports: {} };
  const customRequire = (reqPath) => {
    if (customMocks[reqPath]) {
      return customMocks[reqPath];
    }
    if (reqPath.startsWith('.')) {
      const resolved = path.resolve(path.dirname(fullPath), reqPath);
      const possibleExtensions = ['.ts', '.js', '/index.ts', '/index.js'];
      for (const ext of possibleExtensions) {
        const candidate = resolved + ext;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return loadTsModule(path.relative(root, candidate), customMocks);
        }
      }
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        return loadTsModule(path.relative(root, resolved), customMocks);
      }
    }
    return require(reqPath);
  };

  const fn = new Function('exports', 'module', 'require', '__filename', '__dirname', transpiled);
  fn(mod.exports, mod, customRequire, fullPath, path.dirname(fullPath));
  return mod.exports;
}

test('Pixory RAG Bridge - 动态 Embedding 感知与免配降级测试', async (t) => {
  await t.test('未配置 Embedding 模型时，安全解析为 undefined (激活纯 BM25 模式)', async () => {
    const mocks = {
      '../../database': {
        runWithDatabaseSpace: async (space, fn) => fn({}),
        aiProviderRepository: {
          findProviderById: async () => null,
        },
      },
      '../aiEmbeddingService': {
        getEmbeddingProviderForSpace: async () => null, // 模拟未配置
      },
      '../secureAiSettingsService': {
        getProviderApiKeyForSpace: async () => null,
      },
      '../aiProviderService': {
        getAdapterForProvider: () => ({}),
      },
    };

    const embedderModule = loadTsModule('src/ai/rag/pixoryRagEmbedder.ts', mocks);
    const embedder = await embedderModule.resolvePixoryEmbedder('normal');
    assert.equal(embedder, undefined, '未配置时必须返回 undefined，促使 RAG 自动切换纯 BM25 模式');
  });

  await t.test('配置了有效 Embedding 模型时，成功生成 PixoryDynamicEmbedder 实例', async () => {
    const mocks = {
      '../../database': {
        runWithDatabaseSpace: async (space, fn) =>
          fn({
            id: 'mock-db',
          }),
        aiProviderRepository: {
          findProviderById: async (db, id) => ({
            id: 'openai',
            baseUrl: 'https://api.openai.com/v1',
          }),
        },
      },
      '../aiEmbeddingService': {
        getEmbeddingProviderForSpace: async () => ({
          providerId: 'openai',
          modelId: 'text-embedding-3-small',
        }),
      },
      '../secureAiSettingsService': {
        getProviderApiKeyForSpace: async () => 'sk-test-key',
      },
      '../aiProviderService': {
        getAdapterForProvider: () => ({
          embedText: async () => [0.1, 0.2, 0.3],
        }),
      },
    };

    const embedderModule = loadTsModule('src/ai/rag/pixoryRagEmbedder.ts', mocks);
    const embedder = await embedderModule.resolvePixoryEmbedder('normal');
    assert.ok(embedder !== undefined);
    assert.equal(embedder.id, 'embedder:pixory-dynamic');

    const vector = await embedder.embedQuery('测试文本');
    assert.deepEqual(vector, [0.1, 0.2, 0.3]);
  });
});

test('Pixory RAG Bridge - 聊天与文档全流程接入测试', async (t) => {
  // 构造模拟数据库环境
  const inMemoryTables = {
    docs: new Map(),
    chunks: new Map(),
    embeds: new Map(),
  };

  const fakeDb = {
    async execAsync() {},
    async runAsync(sql, ...args) {
      if (sql.includes('INSERT OR REPLACE INTO pixory_rag_normal_documents')) {
        inMemoryTables.docs.set(args[0], {
          id: args[0],
          title: args[1],
          content: args[2],
          metadataJson: args[4],
        });
      } else if (sql.includes('INSERT OR REPLACE INTO pixory_rag_normal_chunks')) {
        inMemoryTables.chunks.set(args[0], {
          id: args[0],
          documentId: args[1],
          chunkIndex: args[2],
          text: args[3],
          normalizedText: args[4],
          locatorJson: args[5],
          metadataJson: args[7],
        });
      } else if (sql.includes('DELETE FROM pixory_rag_normal_documents WHERE id = ?')) {
        inMemoryTables.docs.delete(args[0]);
      } else if (sql.includes('DELETE FROM pixory_rag_normal_chunks WHERE documentId = ?')) {
        for (const [id, c] of inMemoryTables.chunks.entries()) {
          if (c.documentId === args[0]) inMemoryTables.chunks.delete(id);
        }
      }
      return { changes: 1 };
    },
    async getAllAsync(sql, ...args) {
      if (sql.includes('FROM pixory_rag_normal_chunks')) {
        return Array.from(inMemoryTables.chunks.values());
      }
      if (sql.includes('FROM pixory_rag_normal_documents WHERE id = ?')) {
        const found = inMemoryTables.docs.get(args[0]);
        return found ? [found] : [];
      }
      if (sql.includes('FROM pixory_rag_normal_embeddings')) {
        return [];
      }
      return [];
    },
  };

  const bridgeMocks = {
    '../../database': {
      runWithDatabaseSpace: async (space, fn) => fn(fakeDb),
    },
    './pixoryRagEmbedder': {
      resolvePixoryEmbedder: async () => undefined, // 验证免 Embedding (纯 BM25) 下的业务运作
    },
  };

  const bridge = loadTsModule('src/ai/rag/pixoryRagBridge.ts', bridgeMocks);

  await t.test('1. 文档系统同步至 RAG (syncDocumentToRag)', async () => {
    await bridge.syncDocumentToRag('normal', {
      id: 'doc_ip_1',
      title: '赛博朋克设定集',
      content: '夜之城是一个充满霓虹与仿生人的未来科技大都会。主角居住在小唐人街。',
      ownerType: 'ip',
      ownerId: 'ip_101',
    });

    assert.ok(inMemoryTables.docs.has('doc_ip_1'));
    assert.ok(inMemoryTables.chunks.size >= 1);
  });

  await t.test('2. 聊天检索命中 RAG (retrieveForThreadWithRag)', async () => {
    const result = await bridge.retrieveForThreadWithRag({
      space: 'normal',
      ownerType: 'ip',
      ownerId: 'ip_101',
      query: '主角住在哪里？',
      limit: 3,
    });

    assert.ok(result !== null);
    assert.equal(result.mode, 'keyword'); // 纯 BM25 模式
    assert.ok(result.snippets.length >= 1);
    assert.equal(result.snippets[0].sourceId, 'doc_ip_1');
    assert.equal(result.snippets[0].label, '赛博朋克设定集');
    assert.ok(result.snippets[0].text.includes('小唐人街'));
  });

  await t.test('3. 不相关查询未命中返回 null (触发后续兜底防线)', async () => {
    const result = await bridge.retrieveForThreadWithRag({
      space: 'normal',
      ownerType: 'ip',
      ownerId: 'ip_101',
      query: '量子力学与黑洞视界',
    });

    assert.equal(result, null, '未检索到高相关内容时返回 null，通知上层无缝执行原有兜底');
  });

  await t.test('4. 记忆系统同步与融合检索 (syncMemoryToRag & searchMemoriesWithRag)', async () => {
    await bridge.syncMemoryToRag('normal', {
      id: 'claim_99',
      content: '用户平时最喜欢喝少糖的无糖燕麦拿铁',
      category: 'diet_preference',
      roleCardId: 'role_alice',
    });

    const memorySnippets = await bridge.searchMemoriesWithRag('normal', '咖啡喜好');
    assert.ok(memorySnippets.length >= 1);
    assert.ok(memorySnippets[0].text.includes('燕麦拿铁'));
  });

  await t.test('5. 文档删除同步 (deleteDocumentFromRag)', async () => {
    await bridge.deleteDocumentFromRag('normal', 'doc_ip_1');
    assert.equal(inMemoryTables.docs.has('doc_ip_1'), false);
    assert.equal(inMemoryTables.chunks.size, 1); // 仅剩记忆切片
  });
});
