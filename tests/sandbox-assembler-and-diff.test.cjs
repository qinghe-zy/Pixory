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

let sandboxRuntimeShims;
let sandboxAssembler;
let sandboxDetector;
let sandboxIntentRouter;
let sandboxContextDehydrator;

try {
  sandboxRuntimeShims = require(path.join(root, 'src/services/sandbox/sandboxRuntimeShims.ts'));
  sandboxAssembler = require(path.join(root, 'src/services/sandbox/sandboxAssembler.ts'));
  sandboxDetector = require(path.join(root, 'src/services/sandbox/sandboxDetector.ts'));
  sandboxIntentRouter = require(path.join(root, 'src/services/sandbox/sandboxIntentRouter.ts'));
  sandboxContextDehydrator = require(path.join(root, 'src/services/sandbox/sandboxContextDehydrator.ts'));
} finally {
  if (oldTsHandler) {
    require.extensions['.ts'] = oldTsHandler;
  } else {
    delete require.extensions['.ts'];
  }
}

test('1. SINGLE_LINE_RUNTIME_SHIM 必须是零换行单行代码且包含关键防御逻辑', () => {
  const { SINGLE_LINE_RUNTIME_SHIM, getSandboxBaseUrl } = sandboxRuntimeShims;

  assert.ok(SINGLE_LINE_RUNTIME_SHIM, '垫片脚本应存在');
  assert.strictEqual(SINGLE_LINE_RUNTIME_SHIM.includes('\n'), false, '垫片脚本绝对不能包含 \\n 换行符');
  assert.strictEqual(SINGLE_LINE_RUNTIME_SHIM.includes('\r'), false, '垫片脚本绝对不能包含 \\r 回车符');

  // 验证关键防御 1：else if (e.message) 过滤图片等静态资源 404 误报
  assert.ok(
    SINGLE_LINE_RUNTIME_SHIM.includes('else if(e.message)'),
    '垫片必须使用 else if(e.message) 严格过滤非脚本异常'
  );

  // 验证关键防御 2：AudioContext 构造函数劫持与实例队列
  assert.ok(
    SINGLE_LINE_RUNTIME_SHIM.includes('AudioContext') && SINGLE_LINE_RUNTIME_SHIM.includes('q.push'),
    '垫片必须包含 AudioContext 构造器劫持队列'
  );

  // 验证关键防御 3：document.head 空指针兜底
  assert.ok(
    SINGLE_LINE_RUNTIME_SHIM.includes('document.head||document.documentElement'),
    '垫片必须包含 document.head 空指针兜底'
  );

  // 验证关键防御 4：动态域名隔离
  const url2048 = getSandboxBaseUrl('art_2048');
  const urlSnake = getSandboxBaseUrl('art_snake');
  assert.strictEqual(url2048, 'https://art_2048.sandbox.pixory.local/');
  assert.strictEqual(urlSnake, 'https://art_snake.sandbox.pixory.local/');
  assert.notStrictEqual(url2048, urlSnake, '不同制品的 baseUrl 必须完全隔离');
});

test('2. assembleSandboxHtml 零换行前置注入与首行空格容错', () => {
  const { assembleSandboxHtml } = sandboxAssembler;

  // Case A: 标准 <!DOCTYPE html>
  const rawHtmlA = `<!DOCTYPE html>
<html>
<head>
  <title>测试游戏</title>
</head>
<body>
  <h1>Hello</h1>
</body>
</html>`;

  const assembledA = assembleSandboxHtml(rawHtmlA);
  const linesA = assembledA.split('\n');

  // 验证行号零位移：原第 2 行是 <html>，注入后第 2 行仍必须是 <html>！
  assert.strictEqual(linesA[1], '<html>', '第 2 行内容必须严格不变');
  assert.strictEqual(linesA[2], '<head>', '第 3 行内容必须严格不变');
  assert.strictEqual(linesA.length, rawHtmlA.split('\n').length, '总换行符行数必须 100% 保持一致');
  assert.ok(linesA[0].startsWith('<!DOCTYPE html><script>'), '第一行必须直接贴入 script 标签');

  // Case B: 首行带水平空格容错 "  <!DOCTYPE html>"
  const rawHtmlB = `  <!DOCTYPE html>
<html>
<head><title>空格测试</title></head>
<body></body>
</html>`;

  const assembledB = assembleSandboxHtml(rawHtmlB);
  const linesB = assembledB.split('\n');
  assert.strictEqual(linesB[1], '<html>', '首行带空格时第 2 行仍必须严格对齐');
  assert.strictEqual(linesB.length, rawHtmlB.split('\n').length, '行数不能增加');
  assert.ok(linesB[0].includes('<!DOCTYPE html><script>'), '水平空格后正确注入');
});

test('3. applySearchReplacePatch Aider 级差分引擎（精确匹配、行尾容错与多块连续合入）', () => {
  const { applySearchReplacePatch } = sandboxAssembler;

  const originalSource = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { background: #000; }
    #score { font-size: 16px; }
  </style>
</head>
<body>
  <script>
    let ballSpeed = 5;
    let paddleWidth = 80;
    function update() {
      x += ballSpeed;
    }
  </script>
</body>
</html>`;

  // 多块替换补丁：1. 调整背景与文字大小；2. 降低球速
  const SEARCH_TAG = '<' + '<<<<<< SEARCH';
  const DIVIDER_TAG = '=' + '======';
  const REPLACE_TAG = '>' + '>>>>>> REPLACE';
  const diffText = `这里是伴侣的回复：帮你把球速调慢啦！

${SEARCH_TAG}
    body { background: #000; }
    #score { font-size: 16px; }
${DIVIDER_TAG}
    body { background: #111; }
    #score { font-size: 20px; }
${REPLACE_TAG}

还有球速也改了：
${SEARCH_TAG}
    let ballSpeed = 5;
${DIVIDER_TAG}
    let ballSpeed = 2.5;
${REPLACE_TAG}
`;

  const result = applySearchReplacePatch(originalSource, diffText);
  assert.strictEqual(result.success, true, '差分合并应成功');
  assert.strictEqual(result.replacedBlocks, 2, '应成功替换 2 个差分块');
  assert.ok(result.result.includes('let ballSpeed = 2.5;'), '球速应已更新为 2.5');
  assert.ok(result.result.includes('background: #111;'), '背景色应已更新');
  assert.ok(!result.result.includes('let ballSpeed = 5;'), '旧球速已被替换');

  // Case C: 找不到锚点报错
  const badDiff = `${SEARCH_TAG}
    const nonExistentVariable = 999;
${DIVIDER_TAG}
    const nonExistentVariable = 1;
${REPLACE_TAG}`;

  const badResult = applySearchReplacePatch(originalSource, badDiff);
  assert.strictEqual(badResult.success, false, '不存在的锚点应失败');
  assert.ok(badResult.error.includes('未能'), '应返回明确的错误提示');

  // Case D: replacement 包含 $ 符（如 jQuery 或正则），绝不能被 String.prototype.replace 转义吞没
  const dollarDiff = `${SEARCH_TAG}
    let paddleWidth = 80;
${DIVIDER_TAG}
    let $paddle = $("#paddle");
    let price = "$100";
    let regex = str.replace(/(a)/, "$1-$&");
${REPLACE_TAG}`;

  const dollarResult = applySearchReplacePatch(originalSource, dollarDiff);
  assert.strictEqual(dollarResult.success, true);
  assert.ok(dollarResult.result.includes('let $paddle = $("#paddle");'), '$paddle 必须字面保留');
  assert.ok(dollarResult.result.includes('let price = "$100";'), '$100 必须字面保留');
  assert.ok(dollarResult.result.includes('"$1-$&"'), '$1-$& 绝不能被解析为正则替换后项');
});

test('4. sandboxDetector 识别与全屏/抽屉决策', () => {
  const { isExecutableSandboxCode, isCodeBlockClosed, decideInitialMode } = sandboxDetector;

  // HTML5 游戏
  const gameCode = `<!DOCTYPE html><html><body><canvas id="c"></canvas><script>requestAnimationFrame(loop); window.addEventListener('keydown', onKey);</script></body></html>`;
  assert.strictEqual(isExecutableSandboxCode(gameCode, 'html'), true);
  assert.strictEqual(decideInitialMode(gameCode), 'fullscreen', '含按键监听与 Canvas 的小游戏应初始为 fullscreen');

  // 普通 SVG
  const svgCode = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red" /></svg>`;
  assert.strictEqual(isExecutableSandboxCode(svgCode, 'svg'), true);
  assert.strictEqual(decideInitialMode(svgCode), 'drawer', '静态 SVG 初始应为 drawer 抽屉');

  // 普通 Python 代码
  const pythonCode = `def hello():\n    print("world")`;
  assert.strictEqual(isExecutableSandboxCode(pythonCode, 'python'), false);

  // 代码块闭合检测
  assert.strictEqual(isCodeBlockClosed('```html\n<h1>hi</h1>\n```'), true);
  assert.strictEqual(isCodeBlockClosed('```html\n<h1>生成中未闭合...'), false);

  // 消息全文中快速提取可执行沙箱制品
  const { extractSandboxExecutableCode, hasRichFormatting } = sandboxDetector;
  const rawSvgMsg = `这是为你画的一朵小花：\n<svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="pink" /></svg>\n希望你喜欢！`;
  const extractedSvg = extractSandboxExecutableCode(rawSvgMsg);
  assert.ok(extractedSvg, '应能从自然语言中提取裸 <svg> 块');
  assert.strictEqual(extractedSvg.language, 'svg');

  const mdHtmlMsg = `给你写了个贪吃蛇：\n\`\`\`html\n<!DOCTYPE html><html><body><canvas id="c"></canvas></body></html>\n\`\`\`\n去玩吧`;
  const extractedHtml = extractSandboxExecutableCode(mdHtmlMsg);
  assert.ok(extractedHtml, '应能从 Markdown 围栏中提取 HTML5 沙箱代码');
  assert.ok(extractedHtml.code.includes('<!DOCTYPE html>'));

  const plainChat = `今天天气真好，出去散步吗？`;
  assert.strictEqual(extractSandboxExecutableCode(plainChat), null, '普通日常闲聊提取应为 null');

  // hasRichFormatting 富文本标记嗅探
  assert.strictEqual(hasRichFormatting('# 标题一'), true);
  assert.strictEqual(hasRichFormatting('这是**加粗**文本'), true);
  assert.strictEqual(hasRichFormatting('- 列表项 1\n- 列表项 2'), true);
  assert.strictEqual(hasRichFormatting('<div style="color:red">带颜色的字</div>'), true);
  assert.strictEqual(hasRichFormatting('普通纯文本没有任何排版标记'), false);

  // 极端大文本防 ReDoS 回溯基准测试
  const evilText = '<div ' + 'a'.repeat(50000);
  const start = Date.now();
  assert.strictEqual(hasRichFormatting(evilText), false);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 20, `大文本正则嗅探必须在线性时间内完成 (耗时: ${elapsed}ms)`);
});

test('5. sandboxIntentRouter 双轨路由与 Prompt 装填', () => {
  const { detectSandboxTrack, buildSandboxDynamicPromptSection } = sandboxIntentRouter;

  // 轨 A: 纯伴侣日常聊天
  const trackA = detectSandboxTrack({
    userMessage: '今天好累呀，抱抱我',
  });
  assert.strictEqual(trackA, 'chat', '日常情感输入必须走 chat 轨');
  const sectionA = buildSandboxDynamicPromptSection({
    userMessage: '今天好累呀，抱抱我',
  });
  assert.strictEqual(sectionA, null, '纯聊天轨绝对不挂载任何代码或规范，保持 100% 缓存命中');

  // 轨 B: 微调已有制品
  const trackB = detectSandboxTrack({
    activeArtifact: {
      id: 'art_brick',
      title: '打砖块小游戏',
      code: '<!DOCTYPE html><html>...</html>',
      version: 1,
    },
    userMessage: '球速有点快，帮我调慢一点',
  });
  assert.strictEqual(trackB, 'modify', '挂载活跃制品时必须走 modify 轨');
  const sectionB = buildSandboxDynamicPromptSection({
    activeArtifact: {
      id: 'art_brick',
      title: '打砖块小游戏',
      code: '<!DOCTYPE html><html>...</html>',
      version: 1,
    },
    userMessage: '球速有点快，帮我调慢一点',
  });
  assert.ok(sectionB.includes('<active_artifact id="art_brick"'), '必须挂载当前制品快照');
  assert.ok(sectionB.includes('<<<<<<< SEARCH'), '必须挂载差分协议说明');

  // 轨 C: 新建制品
  const trackC = detectSandboxTrack({
    userMessage: '帮我写一个小游戏 2048 网页',
  });
  assert.strictEqual(trackC, 'create');
  const sectionC = buildSandboxDynamicPromptSection({
    userMessage: '帮我写一个小游戏 2048 网页',
  });
  assert.ok(sectionC.includes('【交互式沙箱制品生成规范】'), '必须挂载单文件生成规范');
});

test('6. sandboxContextDehydrator 历史消息脱水存根', () => {
  const { dehydrateHistoricalMessageContent } = sandboxContextDehydrator;

  const historyMessage = `这是上轮给你写的小游戏：
\`\`\`html
<!DOCTYPE html>
<html>
<head><title>贪吃蛇大作战</title></head>
<body>
  <canvas id="game"></canvas>
  <script>
    // 300 行游戏逻辑...
  </script>
</body>
</html>
\`\`\`
快去试试看吧！`;

  const dehydrated = dehydrateHistoricalMessageContent(historyMessage);

  assert.ok(!dehydrated.includes('300 行游戏逻辑'), '大段历史代码必须被移除');
  assert.ok(dehydrated.includes('<artifact_ref'), '必须替换为精简 XML 存根');
  assert.ok(dehydrated.includes('贪吃蛇大作战'), '必须保留游戏标题');
  assert.ok(dehydrated.includes('这是上轮给你写的小游戏'), '伴侣自然语言消息完全保留');
  assert.ok(dehydrated.includes('快去试试看吧！'), '伴侣尾部语言完全保留');

  // Case B: 历史 User 消息中携带的 <active_artifact_context> 必须完全被脱水清理
  const userMessageWithArtifact = `把球速调慢一点

<active_artifact_context>
【当前活跃制品快照 (Active Artifact Snapshot)】
<active_artifact id="art_123" title="打砖块">
<!DOCTYPE html><html><body>400 lines of code</body></html>
</active_artifact>
</active_artifact_context>`;

  const dehydratedUserMsg = dehydrateHistoricalMessageContent(userMessageWithArtifact);
  assert.strictEqual(dehydratedUserMsg, '把球速调慢一点', '动态制品快照容器必须在历史上下文完全脱水');
});

test('7. sandboxDetector.detectStandaloneArtifactCandidate 独立可运行制品严格识别', () => {
  const { detectStandaloneArtifactCandidate } = sandboxDetector;

  // Case 1: 标准完整 HTML5 游戏/交互文档
  const validHtml = `<!DOCTYPE html>
<html>
<head>
  <title>星际弹球</title>
  <style>body { margin: 0; background: #000; }</style>
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    const canvas = document.getElementById('c');
  </script>
</body>
</html>`;
  const cand1 = detectStandaloneArtifactCandidate(validHtml, 'html');
  assert.ok(cand1, '完整 HTML5 必须被识别为独立制品');
  assert.strictEqual(cand1.language, 'html');
  assert.strictEqual(cand1.title, '星际弹球');

  // Case 2: 完整 SVG 矢量绘图
  const validSvg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <title>几何徽章</title>
  <circle cx="50" cy="50" r="40" fill="#4caf50" />
  <rect x="30" y="30" width="40" height="40" fill="#ffffff" />
  <path d="M 10 10 L 90 90" stroke="#000" />
</svg>`;
  const cand2 = detectStandaloneArtifactCandidate(validSvg, 'svg');
  assert.ok(cand2, '完整 SVG 必须被识别为独立制品');
  assert.strictEqual(cand2.language, 'svg');
  assert.strictEqual(cand2.title, '几何徽章');

  // Case 3: 包含省略代码注释（一票否决黑名单）
  const incompleteHtml = `<!DOCTYPE html>
<html>
<head><title>未完待续</title></head>
<body>
  <div>游戏界面</div>
  <script>
    // 剩余代码省略...
  </script>
</body>
</html>`;
  assert.strictEqual(detectStandaloneArtifactCandidate(incompleteHtml, 'html'), null, '包含残缺省略注释的代码必须被一票否决');

  // Case 4: 包含无法解析的本地依赖或 Vue 模板（一票否决）
  const relativeDepHtml = `<!DOCTYPE html>
<html>
<head><script src="./local_script.js"></script></head>
<body><div id="app"></div></body>
</html>`;
  assert.strictEqual(detectStandaloneArtifactCandidate(relativeDepHtml, 'html'), null, '包含不可解析本地脚本引用的代码必须被一票否决');

  // Case 5: 明确的非前端可执行语言（例如 python / ts / json / bash）
  const pyCode = `import pygame\npygame.init()\nscreen = pygame.display.set_mode((640, 480))`;
  assert.strictEqual(detectStandaloneArtifactCandidate(pyCode, 'python'), null, '非前端制品语言必须直接返回 null');

  // Case 6: 微型无意义碎语
  assert.strictEqual(detectStandaloneArtifactCandidate('<div>hello world</div>', 'html'), null, '微型碎语必须过滤');
});
