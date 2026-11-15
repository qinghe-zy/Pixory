const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');

test('Bm25Scorer: filters single-character stop words and keeps 2-grams', () => {
  const { Bm25Scorer } = require(path.join(root, 'src/plugins/rag/components/searchers/bm25.ts'));
  const tokens = Bm25Scorer.tokenize('我的朋友在苹果树下');

  // '我'、'的'、'在' 是停用词，不应单独作为单字 token 出现
  assert.ok(!tokens.includes('我'), '单字 "我" 应被过滤');
  assert.ok(!tokens.includes('的'), '单字 "的" 应被过滤');
  assert.ok(!tokens.includes('在'), '单字 "在" 应被过滤');

  // 2-gram 组合必须保留，以支持词组语义匹配
  assert.ok(tokens.includes('我的'), '2-gram "我的" 应被保留');
  assert.ok(tokens.includes('朋友'), '2-gram "朋友" 应被保留');
  assert.ok(tokens.includes('苹果'), '2-gram "苹果" 应被保留');
  assert.ok(tokens.includes('果树'), '2-gram "果树" 应被保留');

  // 非停用字单字保留
  assert.ok(tokens.includes('树'), '非停用单字 "树" 应被保留');
});

test('Bm25Scorer: scores with query term deduplication and saturation', () => {
  const { Bm25Scorer } = require(path.join(root, 'src/plugins/rag/components/searchers/bm25.ts'));
  const chunks = [
    {
      id: 'chunk_1',
      documentId: 'doc_1',
      text: 'Pixory 是一款支持本地离线隐私伴聊与资料库检索的移动应用。',
    },
    {
      id: 'chunk_2',
      documentId: 'doc_2',
      text: '今天天气真好，出去散步看风景。',
    },
  ];

  const scorer = new Bm25Scorer(chunks);

  // 正常查询
  const normalResults = scorer.score('Pixory 本地');
  assert.ok(normalResults.length > 0);
  assert.equal(normalResults[0].chunk.id, 'chunk_1');

  // 重复口水词查询，得分应当饱和受限，不可呈线性暴涨
  const repeatedResults = scorer.score('Pixory Pixory Pixory 本地 本地 本地');
  assert.ok(repeatedResults.length > 0);
  assert.equal(repeatedResults[0].chunk.id, 'chunk_1');

  // 3 次重复时，BM25 权重比为 ((1.2 + 1) * 3) / (3 + 1.2) = 6.6 / 4.2 ≈ 1.57 倍，远低于 3 倍
  const scoreRatio = repeatedResults[0].score / normalResults[0].score;
  assert.ok(scoreRatio < 2.0, `重复查询的得分比率应受限（实际为 ${scoreRatio}），不可翻 3 倍`);
});

test('aiProviderService: saveProviderApiKey invalidates RAG engine cache', () => {
  const providerServiceContent = fs.readFileSync(path.join(root, 'src/ai/aiProviderService.ts'), 'utf8');
  assert.match(
    providerServiceContent,
    /async function saveProviderApiKeyAndTimestamp[\s\S]*?invalidateRagEngineCache\(space\);/
  );
});

test('LocalHybridRagProvider: uses MarkdownTextSplitter for markdown documents', () => {
  const providerContent = fs.readFileSync(path.join(root, 'src/plugins/rag/providers/localProvider.ts'), 'utf8');
  assert.match(providerContent, /import \{ MarkdownTextSplitter \}/);
  assert.match(providerContent, /isMarkdown/);
  assert.match(providerContent, /new MarkdownTextSplitter\(\)/);
});

test('StandaloneSqliteStore: getEmbeddings supports modelId filtering', () => {
  const storeContent = fs.readFileSync(path.join(root, 'src/plugins/rag/components/stores/standaloneSqliteStore.ts'), 'utf8');
  assert.match(storeContent, /getEmbeddings\(chunkIds\?: string\[\], modelId\?: string\)/);
  assert.match(storeContent, /modelClause/);
  assert.match(storeContent, /modelId \? ' AND modelId = \?'/);
});

test('PixoryDynamicEmbedder: dynamically updates dimensions when batch returns', () => {
  const embedderContent = fs.readFileSync(path.join(root, 'src/ai/rag/pixoryRagEmbedder.ts'), 'utf8');
  assert.match(embedderContent, /public dimensions: number;/);
  assert.match(embedderContent, /this\.dimensions = firstValid\.length;/);
});

test('aiChatService: reuses sharedQueryVector across concurrent retrievals in a single turn', () => {
  const chatServiceContent = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  assert.match(chatServiceContent, /import \{ resolvePixoryEmbedder \}/);
  assert.match(chatServiceContent, /let sharedQueryVector: number\[\] \| undefined;/);
  assert.match(chatServiceContent, /sharedQueryVector = vector;/);
  assert.match(chatServiceContent, /queryVector: sharedQueryVector,/);
});
