const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('S7-05 [极简文档阅读器 ImDocumentMinimalViewer 架构与样式设计准则审计]', () => {
  const viewerCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/document/ImDocumentMinimalViewer.tsx'),
    'utf8'
  );

  // 1. 极简原则：坚决不包含多层嵌套卡片外壳或深黑遮罩
  assert.ok(
    !viewerCode.includes('rgba(0, 0, 0, 0.7)') && !viewerCode.includes('rgba(0,0,0,0.8)'),
    '严禁使用压抑沉重的深黑遮罩层'
  );

  // 2. 根容器必须是全屏通透平铺背景
  assert.ok(
    viewerCode.includes("backgroundColor: '#FFFFFF'"),
    '阅读器必须使用清爽白净的全屏平铺背景'
  );

  // 3. 必须支持干净模式与留痕对比模式 (Clean Mode vs Diff Mode)
  assert.ok(viewerCode.includes("mode === 'clean'"), '必须支持 Clean 模式');
  assert.ok(viewerCode.includes("mode === 'diff'"), '必须支持 Diff 留痕模式');

  // 4. 留痕样式必须使用柔和绿底与红底中划线
  assert.ok(viewerCode.includes('#E6F4EA'), '新增内容必须使用浅柔绿底 (#E6F4EA)');
  assert.ok(viewerCode.includes('#FCE8E6'), '删除内容必须使用浅柔红底 (#FCE8E6)');
  assert.ok(viewerCode.includes("'line-through'"), '删除内容必须使用中划线');

  // 5. 格式自适应：必须同时支持 Markdown 与 DOCX
  assert.ok(viewerCode.includes('MarkdownDriver'), '必须集成 MarkdownDriver');
  assert.ok(viewerCode.includes('DocxDriver'), '必须集成 DocxDriver');
});

test('S7-06 [文档气泡渲染器与气泡注册表契约审计]', () => {
  const bubbleCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/im/components/renderers/DocumentBubbleRenderer.tsx'),
    'utf8'
  );
  const registryCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/im/registry/bubbleRegistry.ts'),
    'utf8'
  );
  const chatScreenCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/im/screens/ImChatScreen.tsx'),
    'utf8'
  );

  // 1. DocumentBubbleRenderer 必须支持 onOpenDocument 点击直达
  assert.ok(bubbleCode.includes('onOpenDocument'), '文档气泡必须暴露 onOpenDocument 回调');
  assert.ok(bubbleCode.includes('handleCardPress'), '卡片点击必须触发打开文档');
  assert.ok(bubbleCode.includes('点击即开即读'), '必须包含即开即读提示');

  // 2. 注册表必须映射 document 类型
  assert.ok(
    registryCode.includes("registry.set('document', DocumentBubbleRenderer)"),
    'BubbleRegistry 必须注册 document 消息类型'
  );

  // 3. 聊天主屏幕必须直接挂载 ImDocumentMinimalViewer
  assert.ok(
    chatScreenCode.includes('<ImDocumentMinimalViewer'),
    'ImChatScreen 必须挂载极简文档阅读器'
  );
  assert.ok(
    chatScreenCode.includes('onOpenDocument='),
    'ImChatList 必须接收 onOpenDocument 事件并同步给阅读器'
  );
});
