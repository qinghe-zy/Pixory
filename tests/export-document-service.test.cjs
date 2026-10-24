const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectSuggestedExportFormat,
  buildDefaultExportFileName,
  sanitizeFileName,
  stripMarkdownToPlainText,
  buildStandaloneHtmlDocument,
  buildDocumentContent,
} = require('../src/services/export/exportDocumentGenerators.ts');

test('导出格式智能预判：detectSuggestedExportFormat', () => {
  // 1. JSON
  assert.equal(detectSuggestedExportFormat('{"name": "test", "version": 1}'), 'json');
  assert.equal(detectSuggestedExportFormat('[1, 2, 3]'), 'json');

  // 2. HTML
  assert.equal(detectSuggestedExportFormat('<!DOCTYPE html><html><body><h1>Hello</h1></body></html>'), 'html');

  // 3. Markdown (代码块、标题、列表、粗体)
  assert.equal(detectSuggestedExportFormat('# 架构设计方案\n这是一段正文'), 'md');
  assert.equal(detectSuggestedExportFormat('```typescript\nconst a = 1;\n```'), 'md');
  assert.equal(detectSuggestedExportFormat('- 列表第一项\n- 列表第二项'), 'md');
  assert.equal(detectSuggestedExportFormat('这是**加粗文字**说明'), 'md');

  // 4. 纯文本
  assert.equal(detectSuggestedExportFormat('今天天气真好，我们一起去公园散步吧。'), 'txt');
  assert.equal(detectSuggestedExportFormat(''), 'txt');
});

test('文件名智能提取与去噪：buildDefaultExportFileName', () => {
  // 1. Markdown 标题优先
  const mdContent = '# 2026年年度策划白皮书\n\n正文第一段说明。';
  assert.equal(buildDefaultExportFileName(mdContent), '2026年年度策划白皮书');

  const subHeadingContent = '前言说明\n## 技术重构核心目标\n正文';
  assert.equal(buildDefaultExportFileName(subHeadingContent), '技术重构核心目标');

  // 2. 无标题时首句提取
  const plainParagraph = ' Pixory 致力于打造纯本地安全的伴侣型智能助手。第二句内容。';
  assert.equal(buildDefaultExportFileName(plainParagraph), 'Pixory 致力于打造纯本地安全的伴侣型智能助手');

  // 3. 语法标记过滤
  const styledHeading = '# **重点**：关于`内核`优化的*总结*\n正文';
  assert.equal(buildDefaultExportFileName(styledHeading), '重点：关于内核优化的总结');

  // 4. 非法字符过滤
  const illegalHeading = '# 系统报告: 2026/10/22 <测试版>?\n正文';
  assert.equal(buildDefaultExportFileName(illegalHeading), '系统报告_2026_10_22_测试版');

  // 5. 空值回退兜底时间戳
  const fallback = buildDefaultExportFileName('   \n\n  ');
  assert.match(fallback, /^Pixory_文档_\d{8}_\d{4}$/);
});

test('文件名非法字符清理：sanitizeFileName', () => {
  assert.equal(sanitizeFileName('report/2026:10*01?.txt'), 'report_2026_10_01_.txt');
  assert.equal(sanitizeFileName('  __test___file__  '), 'test_file');
});

test('Markdown 语法剥离纯文本：stripMarkdownToPlainText', () => {
  const md = `# 主标题
这是一段包含 **粗体** 和 *斜体* 以及 \`内联代码\` 的文本。
> 这是一段引用

\`\`\`javascript
console.log("hello");
\`\`\`

- 列表项 1
- 列表项 2
[点击链接](https://example.com)
`;

  const plain = stripMarkdownToPlainText(md);
  assert.match(plain, /主标题/);
  assert.match(plain, /这是一段包含 粗体 和 斜体 以及 内联代码 的文本/);
  assert.match(plain, /console\.log\("hello"\);/);
  assert.match(plain, /点击链接 \(https:\/\/example\.com\)/);
  assert.equal(plain.includes('```'), false);
  assert.equal(plain.includes('**'), false);
  assert.equal(plain.includes('#'), false);
});

test('自包含精美 HTML 生成（含表格与公式）：buildStandaloneHtmlDocument', () => {
  const md = `# 标题一
这是一段段落。

| 表头 A | 表头 B |
| --- | --- |
| 内容 1 | 内容 2 |

$$E = mc^2$$
`;

  const html = buildStandaloneHtmlDocument('测试报告', md, {
    createdAt: '2026-10-22 10:00:00',
  });

  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /<title>测试报告<\/title>/);
  assert.match(html, /<h1 class="doc-title">测试报告<\/h1>/);
  assert.match(html, /<h1>标题一<\/h1>/);
  assert.match(html, /<div class="table-container"><table>/);
  assert.match(html, /<th>表头 A<\/th>/);
  assert.match(html, /<td>内容 1<\/td>/);
  assert.match(html, /<div class="math-block">\$\$E = mc\^2\$\$<\/div>/);
  assert.match(html, /var\(--bg\)/); // CSS 样式
});

test('极端大文本安全性（防 ReDoS）', () => {
  const longList = Array.from({ length: 1000 }, (_, i) => `- Item ${i} with extra description`).join('\n');
  const start = Date.now();
  const html = buildStandaloneHtmlDocument('Long List', longList);
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 200, `HTML 生成耗时过长: ${elapsed}ms`);
  assert.match(html, /<li>Item 0 with extra description<\/li>/);
  assert.match(html, /<li>Item 999 with extra description<\/li>/);
});

test('文档内容分流构建：buildDocumentContent', () => {
  const content = '# 标题\n正文内容';

  // md
  assert.equal(buildDocumentContent({ content, fileName: 'test', format: 'md' }), content);

  // txt
  assert.equal(buildDocumentContent({ content, fileName: 'test', format: 'txt' }), '标题\n正文内容');

  // json
  const jsonStr = buildDocumentContent({ content, fileName: 'test', format: 'json' });
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.title, 'test');
  assert.equal(parsed.content, content);
  assert.equal(parsed.source, 'Pixory');
});

test('可执行 HTML 制品导出：保持纯净可运行，杜绝实体转义与多余包装', () => {
  const gameHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <title>打砖块大作战</title>
</head>
<body>
  <canvas id="gameCanvas" width="400" height="600"></canvas>
  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 400, 600);
  </script>
</body>
</html>`;

  // 1. 导出 html 格式：必须原汁原味输出纯净代码，禁止转义为 &lt;script&gt; 或增加 <p> 标签
  const outputHtml = buildDocumentContent({
    content: gameHtml,
    fileName: '打砖块大作战',
    format: 'html',
  });

  assert.match(outputHtml, /<!DOCTYPE html>/i);
  assert.match(outputHtml, /<meta charset="UTF-8">/i); // 自动补齐 UTF-8 声明
  assert.match(outputHtml, /<canvas id="gameCanvas"/);
  assert.match(outputHtml, /<script>[\s\S]*const canvas = document\.getElementById/);
  assert.doesNotMatch(outputHtml, /&lt;canvas/); // 绝不能转义为实体
  assert.doesNotMatch(outputHtml, /&lt;script/);
  assert.doesNotMatch(outputHtml, /<div class="container">/); // 绝不加排版外壳
  assert.doesNotMatch(outputHtml, /来自 Pixory/); // 绝不加水印
  assert.doesNotMatch(outputHtml, /本文档由 Pixory/);

  // 2. 导出 txt 格式：返回源码纯文本
  const outputTxt = buildDocumentContent({
    content: gameHtml,
    fileName: '打砖块大作战',
    format: 'txt',
  });
  assert.match(outputTxt, /const canvas = document\.getElementById/);

  // 3. 被 Markdown 围栏包裹的代码：同样应剥离围栏返回纯净 HTML
  const fencedHtml = `\`\`\`html\n${gameHtml}\n\`\`\``;
  const outputFromFence = buildDocumentContent({
    content: fencedHtml,
    fileName: '打砖块大作战',
    format: 'html',
  });
  assert.doesNotMatch(outputFromFence, /```/);
  assert.match(outputFromFence, /<canvas id="gameCanvas"/);

  // 4. 复合消息（带前言和后语）中的代码块提取
  const compositeMessage = `为你生成了一个霓虹打砖块游戏：\n\n\`\`\`html\n${gameHtml}\n\`\`\`\n\n快来体验吧！`;
  const outputFromComposite = buildDocumentContent({
    content: compositeMessage,
    fileName: '打砖块大作战',
    format: 'html',
  });
  assert.match(outputFromComposite, /<canvas id="gameCanvas"/);
  assert.doesNotMatch(outputFromComposite, /为你生成了一个霓虹打砖块游戏/);
});

test('SVG 矢量图形导出为 HTML：注入极简响应式全屏视口外壳', () => {
  const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" fill="#3B82F6" />
</svg>`;

  const html = buildDocumentContent({
    content: svg,
    fileName: '蓝色圆形徽标',
    format: 'html',
  });

  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /<title>蓝色圆形徽标<\/title>/);
  assert.match(html, /<svg viewBox="0 0 100 100"/);
  assert.match(html, /max-width: 95vw/);
  assert.doesNotMatch(html, /来自 Pixory/);
});
