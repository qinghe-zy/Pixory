const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

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

test('Requirement 1: [文档可直接阅读] 阅读器状态完备度与移动端人体工学审计', () => {
  const viewerCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/document/ImDocumentMinimalViewer.tsx'),
    'utf8'
  );

  // 1. 状态必须包含 loading, empty, parseError (四态完备)
  assert.ok(viewerCode.includes('setParseError(true)'), '必须有解析失败 parseError 状态');
  assert.ok(viewerCode.includes('无法解析该文档'), '解析失败必须呈现友好用户反馈');
  assert.ok(viewerCode.includes('文档内容为空'), '空文档必须呈现设计好的空状态');
  assert.ok(viewerCode.includes('正在打开极简文档'), '加载中文档必须呈现友好 loading');

  // 2. 触控热区准则：返回按钮必须 >= 44x44
  assert.ok(viewerCode.includes('width: 44'), '返回按钮宽度必须满足 44px 触控规范');
  assert.ok(viewerCode.includes('height: 44'), '返回按钮高度必须满足 44px 触控规范');

  // 3. DocumentBubbleRenderer 必须支持 base64 内容向 Uint8Array / UTF8 的动态解算
  const bubbleCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/im/components/renderers/DocumentBubbleRenderer.tsx'),
    'utf8'
  );
  assert.ok(bubbleCode.includes('atob(rawContent)'), '必须从 base64 中解算二进制 Uint8Array 供阅读器即开即读');
});

test('Requirement 2: [文档可下载与分享] 导出工具函数与主聊天屏联动审计', () => {
  const exportUtilCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/im/utils/documentExport.ts'),
    'utf8'
  );
  const chatScreenCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/im/screens/ImChatScreen.tsx'),
    'utf8'
  );

  // 1. 导出工具必须同时支持文本与二进制 Uint8Array
  assert.ok(exportUtilCode.includes('writeAsStringAsync'), '必须写入本地缓存文件');
  assert.ok(exportUtilCode.includes('Share.share'), '必须调起系统原生分享/导出面板');
  assert.ok(exportUtilCode.includes('EncodingType.Base64'), '二进制必须转为 Base64 写入');

  // 2. ImChatScreen 必须按契约将 onExport 注入阅读器
  assert.ok(chatScreenCode.includes('exportDocumentToShare'), 'ImChatScreen 必须引入 exportDocumentToShare');
  assert.ok(chatScreenCode.includes('onExport={activeDocument ? () => void exportDocumentToShare(activeDocument) : undefined}'), '阅读器必须装配一键导出能力');

  // 3. ImChatScreen 架构铁律：代码行数永久 <= 150 行
  const lines = chatScreenCode.split('\n').length;
  assert.ok(lines <= 150, `ImChatScreen 行数必须严格 <= 150，当前为 ${lines}`);
});

test('Requirement 3: [发送接受入口友好] handleFile 文件读取与卡片构建审计', () => {
  const sessionCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/im/hooks/useImChatSession.ts'),
    'utf8'
  );
  const inputBarCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/im/components/ImInputBar.tsx'),
    'utf8'
  );

  // 1. 输入栏必须有直达文件选择按钮
  assert.ok(inputBarCode.includes('accessibilityLabel="发送文件"'), '输入栏必须包含发送文件按钮');
  assert.ok(inputBarCode.includes('onSelectFile'), '输入栏必须暴露 onSelectFile 入口');

  // 2. handleFile 必须在发送前接入 CAS 存储池并存入 document 卡片
  assert.ok(sessionCode.includes('ingestFileUri') || sessionCode.includes('readAsStringAsync'), '发送文档前必须接入 CAS 存储或读取内容');
  assert.ok(sessionCode.includes('casUri') || sessionCode.includes('content: fileContent'), 'metadata 中必须持久化文档 CAS 引用或内容');
  assert.ok(sessionCode.includes("type: 'document'"), '消息类型必须为 document 卡片');
});

test('Requirement 4: [AI可以直接发回文档] 协议解析、流式剥离与独立气泡分发审计', () => {
  const { parseDocumentTag } = loadTsModule('src/im/engine/imTagParser.ts');
  const { stripMetaTags } = loadTsModule('src/im/engine/tagAwareStreamParser.ts');

  // 1. 块状格式解析验证
  const blockInput = '这是前面的说明文字[BR][DOCUMENT: 测试项目总结.docx]\n# 一级标题\n这里是正文修改内容\n[/DOCUMENT]';
  const blockResult = parseDocumentTag(blockInput);
  assert.ok(blockResult, '必须能识别 [DOCUMENT: ...]...[/DOCUMENT] 块');
  assert.equal(blockResult.title, '测试项目总结.docx');
  assert.ok(blockResult.content.includes('# 一级标题'));

  // 2. 行内管道格式解析验证
  const inlineInput = '[DOC: 简报.md | # 今日简要\n- 事项1\n- 事项2]';
  const inlineResult = parseDocumentTag(inlineInput);
  assert.ok(inlineResult, '必须能识别 [DOC: title | content] 管道格式');
  assert.equal(inlineResult.title, '简报.md');
  assert.ok(inlineResult.content.includes('事项1'));

  // 3. 流式文本切句净化验证：文档标签块绝不能作为裸文本泄露至普通气泡
  const stripped = stripMetaTags(blockInput);
  assert.ok(!stripped.includes('[DOCUMENT:'), '普通文本气泡必须剥离文档标签');
  assert.ok(!stripped.includes('# 一级标题'), '普通文本气泡必须剥离文档正文');
  assert.equal(stripped, '这是前面的说明文字[BR]');

  // 4. BurstMessageDispatcher 必须具备 dispatchDocument 能力
  const dispatcherCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/im/engine/burstDispatcher.ts'),
    'utf8'
  );
  assert.ok(dispatcherCode.includes('dispatchDocument'), 'BurstMessageDispatcher 必须包含 dispatchDocument 方法');
  assert.ok(dispatcherCode.includes("type: 'document'"), '分发消息必须为 document 卡片');
  assert.ok(dispatcherCode.includes("role: 'assistant'"), '分发消息必须归属 assistant');

  // 5. useImChatSession 必须在 AI 响应后触发文档分发
  const sessionCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/im/hooks/useImChatSession.ts'),
    'utf8'
  );
  assert.ok(sessionCode.includes('parseDocumentTag(fullRawResponse)'), 'AI 响应流结束必须检测文档标签');
  assert.ok(sessionCode.includes('dispatcher.dispatchDocument'), '检测到文档后必须分发独立卡片');
});

test("Requirement 6: [防闪退架构审计] 文档系统级分享安全探针 (防 Cannot find native module 'ExpoSharing')", () => {
  const exportServiceCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/export/exportDocumentService.ts'),
    'utf8'
  );
  const documentExportCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/im/utils/documentExport.ts'),
    'utf8'
  );

  // 1. exportDocumentService 必须导出 safeShareFileAsync 且接入 requireOptionalNativeModule 探针
  assert.ok(exportServiceCode.includes('export async function safeShareFileAsync'), '必须导出 safeShareFileAsync 安全分享封装');
  assert.ok(exportServiceCode.includes("requireOptionalNativeModule('ExpoSharing')"), '必须使用 requireOptionalNativeModule 预检原生模块');

  // 2. documentExport.ts 必须调用 safeShareFileAsync，严禁直接裸写 import('expo-sharing')
  assert.ok(documentExportCode.includes('safeShareFileAsync'), 'documentExport 必须接入 safeShareFileAsync');
  assert.ok(!documentExportCode.includes("import('expo-sharing')"), 'documentExport 严禁直接无保护动态导入 expo-sharing');

  // 3. 必须具备兜底文本分享能力，在缺失原生模块时绝不闪退且保留正文
  assert.ok(documentExportCode.includes('Share.share'), 'documentExport 必须包含 Share.share 兜底');
  assert.ok(exportServiceCode.includes('Share.share'), 'exportDocumentService 必须包含 Share.share 兜底');
});
