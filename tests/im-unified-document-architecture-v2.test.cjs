const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

global.__DEV__ = false;

function loadTsModule(relativePath) {
  const filePath = path.resolve(process.cwd(), relativePath);
  const code = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const customRequire = (id) => {
    if (id.startsWith('.')) {
      const targetPath = path.resolve(path.dirname(filePath), id);
      const candidates = [
        targetPath,
        `${targetPath}.ts`,
        `${targetPath}.tsx`,
        `${targetPath}.js`,
        `${targetPath}/index.ts`,
        `${targetPath}/index.tsx`,
      ];
      for (const c of candidates) {
        if (fs.existsSync(c) && !fs.statSync(c).isDirectory()) {
          return loadTsModule(path.relative(process.cwd(), c));
        }
      }
    }
    try {
      return require(id);
    } catch {
      return {};
    }
  };
  const m = { exports: {} };
  const fn = new Function('module', 'exports', 'require', '__dirname', '__filename', compiled.outputText);
  fn(m, m.exports, customRequire, path.dirname(filePath), filePath);
  return m.exports;
}

test('Test 1: imThreadRepository document serialization and deserialization integrity', () => {
  const repoModule = loadTsModule('src/im/repository/imThreadRepository.ts');
  const { serializeImDocumentMessage, tryParseDocumentRowContent } = repoModule;

  assert.equal(typeof serializeImDocumentMessage, 'function', 'serializeImDocumentMessage 必须导出');
  assert.equal(typeof tryParseDocumentRowContent, 'function', 'tryParseDocumentRowContent 必须导出');

  const docMsg = {
    id: 'msg_doc_001',
    threadId: 'th_test',
    sender: 'assistant',
    type: 'document',
    content: '[文件] 2026年Q1财务报告_v2.docx (15.4 KB)',
    timestamp: Date.now(),
    status: 'delivered',
    metadata: {
      document: {
        title: '2026年Q1财务报告_v2.docx',
        fileName: '2026年Q1财务报告_v2.docx',
        format: 'docx',
        sizeBytes: 15769,
        casUri: 'file:///cas/vfs_blobs/abc123456789.bin',
        casHash: 'abc123456789',
        baseMsgId: 'msg_doc_000',
        derivedFromMsgId: 'msg_doc_000',
        version: 2,
        diffSummary: '+180 词 · 预算调整',
        tocSkeleton: [
          { blockId: 'BLK_0001', previewText: '# 概述' },
          { blockId: 'BLK_0002', previewText: '## 财务预算测算：80万元' },
        ],
      },
    },
  };

  // 序列化
  const serialized = serializeImDocumentMessage(docMsg);
  assert.ok(typeof serialized === 'object', '序列化结果必须为对象');
  assert.ok(typeof serialized.rawContent === 'string', 'rawContent 必须为字符串');
  assert.ok(serialized.rawContent.startsWith('{'), 'rawContent 必须为有效 JSON 格式');

  // 反序列化
  const parsed = tryParseDocumentRowContent(serialized.rawContent);
  assert.ok(parsed, '必须能正确反序列化 JSON payload');
  assert.equal(parsed.type, 'document');
  assert.equal(parsed.title, '2026年Q1财务报告_v2.docx');
  assert.equal(parsed.format, 'docx');
  assert.equal(parsed.size, 15769);
  assert.equal(parsed.casHash, 'abc123456789');
  assert.equal(parsed.baseMsgId, 'msg_doc_000');
  assert.equal(parsed.diffSummary, '+180 词 · 预算调整');
  assert.equal(parsed.tocSkeleton.length, 2);
  assert.equal(parsed.tocSkeleton[0].blockId, 'BLK_0001');

  // 普通非 JSON 文本安全过滤
  const plainText = tryParseDocumentRowContent('你好呀，今天天气真不错');
  assert.equal(plainText, null, '普通文本不能被误判为文档 payload');
});

test('Test 2: imTagParser dual-track protocol: [DOCUMENT] and [DOCUMENT_PATCH] parse', () => {
  const parserModule = loadTsModule('src/im/engine/imTagParser.ts');
  const { parseDocumentTag, parseDocumentPatchTag, parsePatchOperations } = parserModule;

  // 1. 新建完整短文档 parseDocumentTag
  const newDocRaw = '预算大纲已写好：\n[DOCUMENT: 预算方案.docx]\n# 2026预算方案\n总计50万整。\n[/DOCUMENT]';
  const newDoc = parseDocumentTag(newDocRaw);
  assert.ok(newDoc, '必须解析出新建文档标签');
  assert.equal(newDoc.title, '预算方案.docx');
  assert.ok(newDoc.content.includes('# 2026预算方案'));

  // 2. 差量修改补丁 parseDocumentPatchTag
  const patchRaw = `修改已完成：
[DOCUMENT_PATCH: msg_101 | 预算方案_修改版.docx]
@@ PATCH [[BLK_0002]] @@
${'<' + '<<<<<<'} SEARCH
当前预算测算：总计50万元整
${'=' + '======='}
当前预算测算：总计80万元整
${'>' + '>>>>>>'} REPLACE

@@ APPEND_AFTER [[BLK_0003]] @@
## 免责声明
本方案测算数据仅供参考。
[/DOCUMENT_PATCH]`;

  const patch = parseDocumentPatchTag(patchRaw);
  assert.ok(patch, '必须解析出差量补丁标签');
  assert.equal(patch.baseMsgId, 'msg_101');
  assert.equal(patch.title, '预算方案_修改版.docx');
  assert.equal(patch.operations.length, 2);

  // 验证操作块 1: replace
  const op1 = patch.operations[0];
  assert.equal(op1.op, 'replace');
  assert.equal(op1.targetBlockId, '[[BLK_0002]]');
  assert.ok(op1.search.includes('当前预算测算：总计50万元整'));
  assert.ok(op1.replace.includes('当前预算测算：总计80万元整'));

  // 验证操作块 2: append
  const op2 = patch.operations[1];
  assert.equal(op2.op, 'append');
  assert.equal(op2.targetBlockId, '[[BLK_0003]]');
  assert.ok(op2.replace.includes('## 免责声明'));

  // 3. 容错性测试：兼容 4~8 个定界符与宽松换行
  const looseHunk = `
@@ PATCH [[BLK_0005]] @@
<<<< SEARCH
旧段落
====
新段落
>>>> REPLACE
`;
  const looseOps = parsePatchOperations(looseHunk);
  assert.equal(looseOps.length, 1);
  assert.equal(looseOps[0].targetBlockId, '[[BLK_0005]]');
  assert.equal(looseOps[0].search, '旧段落');
  assert.equal(looseOps[0].replace, '新段落');
});

test('Test 3: TagAwareStreamParser progress callback & tag stripping', () => {
  const streamModule = loadTsModule('src/im/engine/tagAwareStreamParser.ts');
  const { TagAwareStreamParser, stripMetaTags } = streamModule;

  const events = [];
  const parser = new TagAwareStreamParser({
    onDocumentStreamProgress: (evt) => {
      events.push(evt);
    },
  });

  // 模拟大模型流式吐字
  parser.feed('好的，正在为你修改文档：\n[DOCUMENT_PATCH: msg_88 | 方案_v2.docx]\n');
  parser.feed('@@ PATCH [[BLK_0001]] @@\n');
  parser.feed('<<<<<<< SEARCH\n旧标题\n=======\n# 第一章 战略规划\n>>>>>>> REPLACE\n');
  parser.feed('[/DOCUMENT_PATCH]\n修改完成了，请查阅！');

  const finalMessages = parser.flush();
  assert.ok(finalMessages.length >= 1, '必须正常产出气泡消息');

  // 验证进度事件流
  assert.ok(events.length >= 1, '必须触发流式进度通知');
  const hasStreaming = events.some((e) => e.status === 'streaming');
  const hasCompiling = events.some((e) => e.status === 'compiling');
  assert.ok(hasStreaming, '必须进入 streaming 状态');
  assert.ok(hasCompiling, '闭合标签时必须进入 compiling 状态');

  const compilingEvt = events.find((e) => e.status === 'compiling');
  assert.equal(compilingEvt.title, '方案_v2.docx');
  assert.equal(compilingEvt.baseMsgId, 'msg_88');

  // 验证普通气泡剥离
  const dirty = '前文说明[DOCUMENT: 总结.md]# 标题\n正文[/DOCUMENT]后文总结[DOCUMENT_PATCH: msg_1|改.docx]补丁[/DOCUMENT_PATCH]';
  const clean = stripMetaTags(dirty);
  assert.equal(clean, '前文说明后文总结');
});

test('Test 4: documentAnchorResolver dual-linked list resolution', () => {
  const resolverModule = loadTsModule('src/im/engine/documentAnchorResolver.ts');
  const { resolveTargetDocumentMessages } = resolverModule;

  const historyMessages = [
    {
      id: 'msg_001',
      type: 'document',
      metadata: {
        document: {
          title: '商业计划书_初稿.docx',
          fileName: '商业计划书_初稿.docx',
          tocSkeleton: [{ blockId: 'BLK_0001', previewText: '# 核心商业模式' }],
        },
      },
    },
    {
      id: 'msg_002',
      type: 'document',
      metadata: {
        document: {
          title: '商业计划书_第二版.docx',
          fileName: '商业计划书_第二版.docx',
          derivedFromMsgId: 'msg_001',
          tocSkeleton: [
            { blockId: 'BLK_0001', previewText: '# 核心商业模式' },
            { blockId: 'BLK_0002', previewText: '## 融资需求：500万' },
          ],
        },
      },
    },
    {
      id: 'msg_003',
      type: 'text',
      content: '帮我把计划书的融资需求改成800万',
    },
  ];

  // 1. 默认解析最新版本 (msg_002)
  const resolvedLatest = resolveTargetDocumentMessages(historyMessages, '帮我把计划书的融资需求改成800万');
  assert.ok(resolvedLatest, '必须解析出目标基准文档');
  assert.equal(resolvedLatest.primaryTarget.id, 'msg_002');
  assert.equal(resolvedLatest.primaryTarget.metadata.document.title, '商业计划书_第二版.docx');

  // 2. 溯源寻根：用户明确说“改回初稿/原件”
  const resolvedRoot = resolveTargetDocumentMessages(historyMessages, '请在最初那份初稿上做修改');
  assert.ok(resolvedRoot, '必须解析出最初初稿');
  assert.equal(resolvedRoot.primaryTarget.id, 'msg_001');
  assert.equal(resolvedRoot.primaryTarget.metadata.document.title, '商业计划书_初稿.docx');
});

test('Test 5: Document card middle-truncation & WeChat 1:1 replica specification', () => {
  const cardCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/document/DocumentBubbleCard.tsx'),
    'utf8'
  );
  const resolverCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/document/fileTypeResolver.ts'),
    'utf8'
  );

  // 1. 中间截断算法审计：严禁末尾 ... 截断导致扩展名丢失
  assert.ok(cardCode.includes('truncateMiddle'), '必须包含 truncateMiddle 智能中间截断函数');
  assert.ok(resolverCode.includes('maxHead'), '必须保留头部字符');
  assert.ok(resolverCode.includes('maxTail'), '必须保留尾部字符与扩展名');

  // 2. 微信原型圆角与尺寸规范
  assert.ok(cardCode.includes('borderRadius: 5'), '卡片外壳圆角必须满足微信 5px 微倒角规范');
  assert.ok(!cardCode.includes('borderRadius: 14'), '严禁使用 14px 大圆角');
  assert.ok(!cardCode.includes('borderRadius: 16'), '严禁使用 16px 大圆角');

  // 3. 微信原型白底卡片与折角图标架构
  assert.ok(cardCode.includes('cardContainer:'), '必须有卡片容器');
  assert.ok(cardCode.includes("backgroundColor: '#FFFFFF'"), '主体必须采用中性纯净白底');
  assert.ok(cardCode.includes('WeChatFileIcon'), '必须使用微信折角文件图标');

  // 4. 三态生命周期支持：streaming, compiling, ready
  assert.ok(cardCode.includes("status === 'streaming'"), '必须支持流式骨架脉冲态');
  assert.ok(cardCode.includes("status === 'compiling'"), '必须支持排版编译器烘焙态');
});
