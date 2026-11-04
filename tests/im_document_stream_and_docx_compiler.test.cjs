const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const oldTsHandler = require.extensions['.ts'];
require.extensions['.ts'] = function compile(module, filename) {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename
  );
};

let tagAwareStreamParserModule;
let docxCompilerModule;
let docxDriverModule;

try {
  tagAwareStreamParserModule = require(path.join(root, 'src/im/engine/tagAwareStreamParser.ts'));
  docxCompilerModule = require(path.join(root, 'src/services/sandbox/docx/docxCompiler.ts'));
  docxDriverModule = require(path.join(root, 'src/services/sandbox/drivers/docxDriver.ts'));
} finally {
  if (oldTsHandler) {
    require.extensions['.ts'] = oldTsHandler;
  } else {
    delete require.extensions['.ts'];
  }
}

test('1. TagAwareStreamParser: 文档流式输出全阻断、零泄漏与文档块静默抽离', async () => {
  const { TagAwareStreamParser } = tagAwareStreamParserModule;

  let completedDoc = null;
  const parser = new TagAwareStreamParser({
    onDocumentCompleted: (doc) => {
      completedDoc = doc;
    },
  });

  const streamChunks = [
    '好，我这就把今天聊过的整理成一份，给你发过去：[BR]',
    '[DOCUMENT: 今日对话纪要.docx]\n',
    '# 今日对话纪要\n',
    '一、今日聊过的话题[BR]',
    '我们讨论了 PDF 与 Word 的演进。\n',
    '八、结语\n',
    '[/DOCUMENT][BR]',
    '文档已经写好了，请查收！',
  ];

  const allSentences = [];
  for (const chunk of streamChunks) {
    const s = parser.feed(chunk);
    allSentences.push(...s);
  }
  const trailing = parser.flush();
  allSentences.push(...trailing);

  // 断言 1: 普通气泡中绝不包含文档内部的「一、今日聊过的话题」或「八、结语」
  assert.equal(
    allSentences.some((s) => s.includes('今日聊过的话题')),
    false,
    '普通聊天气泡严禁包含文档内部正文！'
  );
  assert.equal(
    allSentences.some((s) => s.includes('八、结语')),
    false,
    '普通聊天气泡严禁包含文档结语！'
  );

  // 断言 2: 普通气泡中绝不泄漏 [/DOCUMENT]
  assert.equal(
    allSentences.some((s) => s.includes('[/DOCUMENT]')),
    false,
    '普通聊天气泡严禁泄漏 [/DOCUMENT] 标签！'
  );

  // 断言 3: 正确切分出了前导句子与后续交待句子
  assert.ok(
    allSentences.some((s) => s.includes('好，我这就把今天聊过的整理成一份')),
    '应正常输出前导自然对话句子'
  );
  assert.ok(
    allSentences.some((s) => s.includes('文档已经写好了，请查收！')),
    '应正常输出文档完成后后续交待句子'
  );

  // 断言 4: onDocumentCompleted 成功捕获完整文档块
  assert.ok(completedDoc !== null, '必须触发 onDocumentCompleted');
  assert.equal(completedDoc.tagType, 'DOCUMENT');
  assert.ok(completedDoc.rawTagBlock.includes('今日对话纪要.docx'));
  assert.ok(completedDoc.rawTagBlock.includes('一、今日聊过的话题'));
});

test('2. stripMetaTags: 孤儿闭合标签与成对标签全面脱敏', () => {
  const { stripMetaTags } = tagAwareStreamParserModule;

  // 成对标签
  const text1 = '文档如下：[DOCUMENT: test.docx]正文内容[/DOCUMENT]请查收';
  assert.equal(stripMetaTags(text1), '文档如下：请查收');

  // 孤儿闭合标签 (流中断或提前切分遗留)
  const text2 = '八、结语内容 [/DOCUMENT] 文档已经写好了';
  assert.equal(stripMetaTags(text2), '八、结语内容 文档已经写好了');

  // 孤儿开启标签
  const text3 = '[DOCUMENT: test.docx] 孤儿正文';
  assert.equal(stripMetaTags(text3), '孤儿正文');
});

test('3. docxCompiler: 将 Markdown 编译为合法的 ECMA-376 OOXML ZIP 压缩包', async () => {
  const { compileMarkdownToDocx } = docxCompilerModule;
  const { DocxDriver } = docxDriverModule;

  const markdown = `# 今日对话纪要

一、会议议题
大家讨论了文档沙箱与流式生成。

二、决议事项
通过了横向卡片设计与真 DOCX 编译方案。`;

  const docxBytes = await compileMarkdownToDocx(markdown, '今日对话纪要.docx');

  // 验证 ZIP 幻数 (PK\x03\x04 = 0x50, 0x4B, 0x03, 0x04)
  assert.equal(docxBytes[0], 0x50, '必须以 PK 幻数开头');
  assert.equal(docxBytes[1], 0x4b, '必须以 PK 幻数开头');
  assert.equal(docxBytes[2], 0x03, '必须以 PK 幻数开头');
  assert.equal(docxBytes[3], 0x04, '必须以 PK 幻数开头');

  // 验证合法的 DOCX 大于 1KB (不应只有 478 字节的伪裸文本)
  assert.ok(docxBytes.length > 1000, `生成的 DOCX 大小为 ${docxBytes.length} 字节，必须大于 1000 字节`);

  // 使用真正的 DocxDriver 解压并检查骨架，证明外部 Word/WPS 完全可读
  const driver = new DocxDriver();
  const skeletons = await driver.inspectSkeleton(docxBytes);

  assert.ok(skeletons.length >= 3, `骨架段落数应至少为 3，实际为: ${skeletons.length}`);
  assert.equal(skeletons[0].kind, 'heading', '第一块应为标题');
  assert.ok(skeletons[0].previewText.includes('今日对话纪要'));
});

test('4. NodeDocxZipAdapter: 模拟移动端纯 JS Store (method 0) 打包与自愈解压', async () => {
  const zipAdapterModule = require(path.join(root, 'src/services/sandbox/docx/docxZipAdapter.ts'));
  const { NodeDocxZipAdapter, crc32 } = zipAdapterModule;

  const adapter = new NodeDocxZipAdapter();
  const entries = new Map();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  entries.set('test.txt', encoder.encode('Hello Mobile Store Mode!'));
  entries.set('nested/doc.xml', encoder.encode('<w:document><w:body><w:p><w:t>纯JS打包测试</w:t></w:p></w:body></w:document>'));

  const zipBytes = await adapter.writeDocx(entries);
  assert.equal(zipBytes[0], 0x50);
  assert.equal(zipBytes[1], 0x4b);

  // 验证纯 JS 解压
  const readBack = await adapter.readEntries(zipBytes);
  assert.equal(decoder.decode(readBack.get('test.txt')), 'Hello Mobile Store Mode!');
  assert.ok(decoder.decode(readBack.get('nested/doc.xml')).includes('纯JS打包测试'));
});

test('5. compileMarkdownToDocx: 严格过滤 XML 1.0 非法控制字符', async () => {
  const { compileMarkdownToDocx } = docxCompilerModule;
  const { DocxDriver } = docxDriverModule;

  // 包含非法控制字符 \x00, \x08, \x0B, \x1F
  const dirtyMarkdown = `# 标题带控制符\x00\x08
这是一段包含\x0B隐藏控制符\x1F的正文`;

  const docxBytes = await compileMarkdownToDocx(dirtyMarkdown, 'clean.docx');
  assert.ok(docxBytes.length > 500);

  const driver = new DocxDriver();
  const skeletons = await driver.inspectSkeleton(docxBytes);
  assert.ok(skeletons.length >= 2);
  assert.ok(!skeletons[0].previewText.includes('\x00'));
  assert.ok(!skeletons[1].previewText.includes('\x1F'));
});

test('6. serializeImDocumentMessage: 完整序列化与反序列化 content 正文，杜绝 SQLite 重载后文档丢失', () => {
  const tsCode = fs.readFileSync(path.join(root, 'src/im/repository/imThreadRepository.ts'), 'utf8');
  // 提取 serializeImDocumentMessage 与 tryParseDocumentRowContent 函数在独立沙盒执行
  const compiled = ts.transpileModule(tsCode, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const sandbox = {
    exports: {},
    module: { exports: {} },
    require: (id) => ({}),
  };
  const fn = new Function('module', 'exports', 'require', compiled.outputText);
  fn(sandbox.module, sandbox.module.exports, sandbox.require);

  const { serializeImDocumentMessage, tryParseDocumentRowContent } = sandbox.module.exports;

  const originalContent = '# 今日对话纪要\n\n1. 汇报了沙箱进展\n2. 决定重构横向卡片';
  const testMessage = {
    id: 'msg_test_doc_1',
    threadId: 'th_1',
    role: 'assistant',
    content: '今日对话纪要.docx',
    type: 'document',
    metadata: {
      document: {
        title: '今日对话纪要.docx',
        casUri: 'file:///data/user/0/com.pixory/cas/test.docx',
        casHash: 'hash123',
        size: 2048,
        content: originalContent,
      },
    },
    status: 'sent',
    deliveryStatus: 'delivered',
    createdAt: new Date().toISOString(),
  };

  const serialized = serializeImDocumentMessage(testMessage);
  assert.ok(serialized.rawContent.includes('"content":'));
  assert.ok(serialized.rawContent.includes('汇报了沙箱进展'));

  const restored = tryParseDocumentRowContent(serialized.rawContent);
  assert.ok(restored !== null);
  assert.equal(restored.title, '今日对话纪要.docx');
  assert.equal(restored.content, originalContent);
});

test('7. 流式未闭合文档探测: 正确切分 preText 并隔离流式正文，严禁正文泄露至聊天气泡', () => {
  const streamText = '好的，我这就为你整理今天的纪要：\n[DOCUMENT: 今日对话纪要.docx]\n# 今日对话纪要\n一、会议议题\n大家讨论了文档沙箱与流式生成。';

  const match = streamText.match(/\[(?:DOCUMENT|DOC):\s*([^\]\n]+?)\]([\s\S]*)$/i);
  assert.ok(match !== null);
  const title = match[1].trim();
  const streamedBody = match[2];
  const preText = streamText.slice(0, match.index).trim();

  assert.equal(title, '今日对话纪要.docx');
  assert.equal(preText, '好的，我这就为你整理今天的纪要：');
  assert.ok(streamedBody.includes('大家讨论了文档沙箱与流式生成。'));
  assert.ok(!preText.includes('[DOCUMENT:'));
  assert.ok(!preText.includes('今日对话纪要.docx'));
});
