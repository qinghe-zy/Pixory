const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

// Helper to transpile and load TS modules in CommonJS test runner
function loadTsModule(relativePath) {
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
    if (reqPath.startsWith('.')) {
      const resolved = path.resolve(path.dirname(fullPath), reqPath);
      const possibleExtensions = ['.ts', '.js', '/index.ts', '/index.js'];
      for (const ext of possibleExtensions) {
        const candidate = resolved + ext;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return loadTsModule(path.relative(root, candidate));
        }
      }
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        return loadTsModule(path.relative(root, resolved));
      }
    }
    return require(reqPath);
  };

  const fn = new Function('exports', 'module', 'require', '__filename', '__dirname', transpiled);
  fn(mod.exports, mod, customRequire, fullPath, path.dirname(fullPath));
  return mod.exports;
}

const rag = loadTsModule('src/plugins/rag/index.ts');

test('RAG Plugin - Component Registry (统一组件注册中心)', async (t) => {
  const registry = new rag.RagComponentRegistry();

  await t.test('注册与查询组件', () => {
    const splitter = new rag.RecursiveTextSplitter();
    registry.register(splitter);

    const retrieved = registry.get(splitter.id);
    assert.equal(retrieved?.id, 'splitter:recursive');
    assert.equal(retrieved?.kind, 'splitter');

    const splitters = registry.getByKind('splitter');
    assert.equal(splitters.length, 1);
    assert.equal(splitters[0].id, 'splitter:recursive');
  });

  await t.test('注销组件并触发生命周期销毁', async () => {
    let disposed = false;
    const dummyComponent = {
      id: 'dummy:test',
      kind: 'store',
      async dispose() {
        disposed = true;
      },
    };
    registry.register(dummyComponent);
    assert.equal(registry.get('dummy:test')?.id, 'dummy:test');

    const unregistered = await registry.unregister('dummy:test');
    assert.equal(unregistered, true);
    assert.equal(disposed, true);
    assert.equal(registry.get('dummy:test'), undefined);
  });
});

test('RAG Plugin - RecursiveTextSplitter (递归语义切分器)', async (t) => {
  const splitter = new rag.RecursiveTextSplitter({ chunkSize: 30, chunkOverlap: 5 });

  await t.test('自然段落与标点语义切分', () => {
    const text = '第一段内容非常重要，必须完整保留。\n\n第二段是核心细节，包含了大量关键技术点。最后一段进行总结。';
    const chunks = splitter.splitText(text, 'doc-1');

    assert.ok(chunks.length >= 2, '应该切分为多个切片');
    for (const chunk of chunks) {
      assert.ok(chunk.text.length <= 60, `切片长度不能过大: ${chunk.text.length}`);
      assert.equal(chunk.documentId, 'doc-1');
      assert.ok(typeof chunk.chunkIndex === 'number');
    }
  });

  await t.test('空文本边界处理', () => {
    const emptyChunks = splitter.splitText('', 'doc-empty');
    assert.deepEqual(emptyChunks, []);
  });
});

test('RAG Plugin - MarkdownTextSplitter (Markdown 结构切分器)', async (t) => {
  const splitter = new rag.MarkdownTextSplitter({ chunkSize: 100 });

  await t.test('按标题层级切分并注入章节面包屑', () => {
    const md = '# 架构设计\n这是架构概述。\n\n## 模块划分\n这是模块划分正文。';
    const chunks = splitter.splitText(md, 'md-doc');

    assert.ok(chunks.length >= 2);
    assert.ok(chunks[0].text.includes('[章节: 架构设计]'));
    assert.ok(chunks[1].text.includes('[章节: 模块划分]'));
  });
});

test('RAG Plugin - BM25 & Cosine 算法准确性', async (t) => {
  await t.test('余弦相似度计算', () => {
    const vecA = [1, 0, 0];
    const vecB = [1, 0, 0];
    const vecC = [0, 1, 0];

    assert.equal(Math.round(rag.cosineSimilarity(vecA, vecB)), 1);
    assert.equal(rag.cosineSimilarity(vecA, vecC), 0);
  });

  await t.test('BM25 中英文检索排序', () => {
    const chunks = [
      { id: 'c1', documentId: 'd1', chunkIndex: 0, text: 'Pixory 是一款注重隐私与伴聊体验的移动应用' },
      { id: 'c2', documentId: 'd1', chunkIndex: 1, text: '天气预报显示明天北京气温下降' },
      { id: 'c3', documentId: 'd1', chunkIndex: 2, text: '伴聊智能体与角色卡机制设计' },
    ];
    const scorer = new rag.Bm25Scorer(chunks);
    const results = scorer.score('伴聊');

    assert.ok(results.length >= 2);
    assert.ok(results[0].chunk.id === 'c1' || results[0].chunk.id === 'c3');
    assert.ok(!results.some((r) => r.chunk.id === 'c2'), '不相关的片段不应被召回');
  });
});

test('RAG Plugin - PromptContextBuilder (上下文组装与引用追踪)', async (t) => {
  const snippets = [
    {
      chunkId: 'c1',
      documentId: 'd1',
      documentTitle: '设计指南',
      text: '主按钮采用墨蓝色沉稳调性。',
      score: 0.95,
      matchType: 'hybrid',
    },
    {
      chunkId: 'c2',
      documentId: 'd2',
      documentTitle: 'API手册',
      text: '接口返回统一为 JSON 结构。',
      score: 0.88,
      matchType: 'keyword',
    },
  ];

  await t.test('预算控制与格式化装配', () => {
    const context = rag.PromptContextBuilder.buildContext(snippets, { maxChars: 500 });
    assert.ok(context.formattedContext.includes('【参考资料切片】'));
    assert.ok(context.formattedContext.includes('[1] 《设计指南》'));
    assert.ok(context.formattedContext.includes('[2] 《API手册》'));
    assert.equal(context.citations.length, 2);
    assert.equal(context.citations[0].refId, '[1]');
    assert.equal(context.citations[0].title, '设计指南');
  });

  await t.test('预算超限截断', () => {
    const smallBudget = rag.PromptContextBuilder.buildContext(snippets, { maxChars: 50 });
    assert.ok(smallBudget.snippetCount <= 1);
  });
});

test('RAG Plugin - LocalHybridRagProvider (端到端独立完整闭环测试)', async (t) => {
  const store = new rag.MemoryRagStore();
  const embedder = new rag.MockRagEmbedder(16);
  const splitter = new rag.RecursiveTextSplitter({ chunkSize: 80, chunkOverlap: 10 });
  const provider = new rag.LocalHybridRagProvider({ store, embedder, splitter });

  await t.test('1. 摄入文档 (Ingest)', async () => {
    const res = await provider.ingest({
      id: 'doc-ai',
      title: 'AI架构指南',
      content: '本指南介绍 RAG 插件的独立设计原则。RAG 必须做到与主应用完全解耦，支持一键插拔与替换。',
      metadata: { category: 'arch' },
    });
    assert.equal(res.documentId, 'doc-ai');
    assert.ok(res.chunkCount >= 1);
    assert.equal(res.embeddedCount, res.chunkCount, '所有切片均应完成向量化');
  });

  await t.test('2. 混合检索与召回 (Search)', async () => {
    const results = await provider.search('解耦与插拔', { topK: 3, mode: 'hybrid' });
    assert.ok(results.length >= 1, '应成功召回切片');
    assert.equal(results[0].documentId, 'doc-ai');
    assert.equal(results[0].documentTitle, 'AI架构指南');
    assert.ok(results[0].score > 0);
  });

  await t.test('3. 组装 Prompt (BuildContext)', async () => {
    const results = await provider.search('解耦', { topK: 2 });
    const promptContext = provider.buildContext(results);
    assert.ok(promptContext.formattedContext.includes('[1] 《AI架构指南》'));
    assert.ok(promptContext.citations.length >= 1);
  });

  await t.test('4. 删除文档 (Delete)', async () => {
    const deleted = await provider.delete('doc-ai');
    assert.equal(deleted, true);

    const postSearch = await provider.search('解耦');
    assert.equal(postSearch.length, 0, '文档删除后切片与索引必须同时清除');
  });
});

test('RAG Plugin - StandaloneSqliteStore (独立 SQLite 存储驱动测试)', async (t) => {
  const executedSql = [];
  const fakeDb = {
    async execAsync(sql) {
      executedSql.push(sql);
    },
    async runAsync(sql, ...args) {
      executedSql.push({ sql, args });
      return { changes: 1 };
    },
    async getAllAsync(sql, ...args) {
      if (sql.includes('SELECT id, title')) {
        return [
          {
            id: 'sqlite-doc-1',
            title: 'SQLite 测试文档',
            content: '内容',
            sourceType: 'text',
            metadataJson: '{"tag":"test"}',
            createdAt: '2026-11-08',
            updatedAt: '2026-11-08',
          },
        ];
      }
      if (sql.includes('SELECT id, documentId')) {
        return [
          {
            id: 'sqlite-chunk-1',
            documentId: 'sqlite-doc-1',
            chunkIndex: 0,
            text: '切片文本',
            normalizedText: '切片文本',
            locatorJson: '{}',
            tokenEstimate: 4,
            metadataJson: '{}',
          },
        ];
      }
      return [];
    },
  };

  const store = new rag.StandaloneSqliteStore(fakeDb, { tablePrefix: 'my_custom_rag' });

  await t.test('初始化建表', async () => {
    await store.init();
    assert.ok(executedSql.some((item) => typeof item === 'string' && item.includes('my_custom_rag_documents')));
  });

  await t.test('读写文档与切片', async () => {
    await store.saveDocument({
      id: 'sqlite-doc-1',
      title: 'SQLite 测试文档',
      content: '内容',
      metadata: { tag: 'test' },
    });
    const doc = await store.getDocument('sqlite-doc-1');
    assert.equal(doc?.id, 'sqlite-doc-1');
    assert.equal(doc?.title, 'SQLite 测试文档');

    const chunks = await store.getChunksByDocument('sqlite-doc-1');
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].text, '切片文本');
  });
});

test('RAG Plugin - RagHub (一键插拔与集中管控测试)', async (t) => {
  const hub = rag.createDefaultRagHub();

  await t.test('使用默认内置 Local Provider 进行摄入与搜索', async () => {
    await hub.ingest({
      id: 'doc-default',
      title: '默认本地知识库',
      content: '这是内置混合引擎摄入的知识内容。',
    });

    const searchRes = await hub.search('混合引擎');
    assert.ok(searchRes.length >= 1);
    assert.equal(searchRes[0].documentTitle, '默认本地知识库');
  });

  await t.test('一键热插拔替换为 Mock 第三方框架 (模拟无缝切换 Dify/FastGPT)', async () => {
    let mockSearchCalled = false;

    const mockExternalProvider = {
      id: 'provider:external-mock',
      kind: 'provider',
      async ingest(doc) {
        return { documentId: doc.id, chunkCount: 1, embeddedCount: 1, durationMs: 0 };
      },
      async delete() {
        return true;
      },
      async search(query) {
        mockSearchCalled = true;
        return [
          {
            chunkId: 'ext_1',
            documentId: 'ext_doc',
            documentTitle: '外部第三方知识库',
            text: `外部引擎处理查询: ${query}`,
            score: 0.99,
            matchType: 'hybrid',
          },
        ];
      },
      buildContext(snippets, budget) {
        return rag.PromptContextBuilder.buildContext(snippets, budget);
      },
    };

    // 一行代码注册并激活新的 Provider
    hub.registerAndActivate(mockExternalProvider);
    assert.equal(hub.getActiveProvider().id, 'provider:external-mock');

    // 宿主调用方完全无需改变调用方式
    const switchedResults = await hub.search('查询外部测试');
    assert.equal(mockSearchCalled, true);
    assert.equal(switchedResults[0].documentTitle, '外部第三方知识库');
    assert.ok(switchedResults[0].text.includes('外部引擎处理查询: 查询外部测试'));

    // 上下文生成依然完全一致
    const context = hub.buildContext(switchedResults);
    assert.ok(context.formattedContext.includes('[1] 《外部第三方知识库》'));
  });

  await t.test('销毁与资源清理', async () => {
    await hub.dispose();
    assert.throws(() => hub.getActiveProvider(), /NO_ACTIVE_PROVIDER/);
  });
});

test('RAG Plugin - React Hooks (UX 四态与最佳实践标准导出验证)', async (t) => {
  const reactHooks = loadTsModule('src/plugins/rag/react/index.ts');

  await t.test('钩子函数定义与导出完整性', () => {
    assert.equal(typeof reactHooks.useRagSearch, 'function');
    assert.equal(typeof reactHooks.useRagIngest, 'function');
  });
});
