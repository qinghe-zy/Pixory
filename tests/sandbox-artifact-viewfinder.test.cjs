const { test } = require('node:test');
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

let sandboxDetector;
try {
  sandboxDetector = require(path.join(root, 'src/services/sandbox/sandboxDetector.ts'));
} finally {
  if (oldTsHandler) {
    require.extensions['.ts'] = oldTsHandler;
  } else {
    delete require.extensions['.ts'];
  }
}

const {
  detectStandaloneArtifactCandidate,
  INCOMPLETE_CODE_REGEX,
  UNRUNNABLE_DEPENDENCY_REGEX,
} = sandboxDetector;

test('1. Todo List 待办应用不被误杀 (无误杀防线)', () => {
  const todoAppHtml = `<!DOCTYPE html>
<html>
<head>
  <title>我的极简待办</title>
  <style>body { font-family: sans-serif; }</style>
</head>
<body>
  <h1>待办清单</h1>
  <input id="input" placeholder="输入任务" />
  <button id="add">添加</button>
  <ul id="list"></ul>
  <script>
    // todo item collection
    const todos = [];
    document.getElementById('add').onclick = () => {
      // add todo item
      todos.push(document.getElementById('input').value);
    };
  </script>
</body>
</html>`;

  const candidate = detectStandaloneArtifactCandidate(todoAppHtml, 'html');
  assert.ok(candidate, '含 todo 注释的合法待办小应用不得被误杀');
  assert.strictEqual(candidate.language, 'html');
  assert.strictEqual(candidate.title, '我的极简待办');
  assert.ok(candidate.lineCount >= 10);
});

test('2. 残缺与省略代码一票否决黑名单', () => {
  const incompleteExamples = [
    `<!DOCTYPE html><html><body><div>Game</div><script>// 剩余代码请自行实现\n</script></body></html>`,
    `<!DOCTYPE html><html><body><div>Game</div><script>/* 此处省略 */</script></body></html>`,
    `<!DOCTYPE html><html><body><div>Game</div><script>// todo: implement the render loop</script></body></html>`,
    `<!DOCTYPE html><html><body><div>Game</div><!-- 以下代码同上 --></body></html>`,
  ];

  for (const snippet of incompleteExamples) {
    const candidate = detectStandaloneArtifactCandidate(snippet, 'html');
    assert.strictEqual(candidate, null, `必须一票否决残缺代码：${snippet.slice(0, 50)}...`);
  }
});

test('3. 本地不可解析依赖与模板语法一票否决黑名单', () => {
  const unrunnableExamples = [
    `<!DOCTYPE html><html><head><script src="./my_game.js"></script></head><body></body></html>`,
    `<!DOCTYPE html><html><head><link rel="stylesheet" href="./style.css" /></head><body></body></html>`,
    `<!DOCTYPE html><html><body><template><div>{{ count }}</div></template></body></html>`,
    `<!DOCTYPE html><html><body><div v-for="item in items">{{ item }}</div></body></html>`,
    `<!DOCTYPE html><html><body><div className="btn">Click</div></body></html>`,
  ];

  for (const snippet of unrunnableExamples) {
    const candidate = detectStandaloneArtifactCandidate(snippet, 'html');
    assert.strictEqual(candidate, null, `必须拦截无法在本地单文件内解析的语法：${snippet.slice(0, 50)}...`);
  }
});

test('4. 严格区分看代码教学片段 vs 可交互礼物', () => {
  // Case A: 纯 CSS 布局教学代码（无 doctype，无 script，仅教学代码）-> 坚决不弹取景框！
  const cssTutorialSnippet = `<style>
.container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
}
.box {
  width: 100px;
  height: 100px;
  background: red;
}
</style>
<div class="container">
  <div class="box">居中</div>
</div>`;
  const tutorialCandidate = detectStandaloneArtifactCandidate(cssTutorialSnippet, 'html');
  assert.strictEqual(tutorialCandidate, null, '纯 CSS/HTML 居中教学代码坚决不能误弹取景框，必须保持普通代码块展示');

  // Case B: 无 doctype 但具备完整闭合 script 与 canvas 的交互小组件 -> 允许作为可交互礼物
  const interactiveCanvasWidget = `<canvas id="ball" width="300" height="200"></canvas>
<style>
  canvas { border: 1px solid #ccc; background: #fafafa; }
</style>
<script>
  const canvas = document.getElementById('ball');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#059669';
  ctx.fillRect(10, 10, 50, 50);
</script>`;
  const canvasCandidate = detectStandaloneArtifactCandidate(interactiveCanvasWidget, 'html');
  assert.ok(canvasCandidate, '无 doctype 但具备闭合 script 与 canvas 的组件可以作为交互作品');
  assert.strictEqual(canvasCandidate.language, 'html');
});

test('5. SVG 独立矢量图制品识别', () => {
  const svgArt = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <title>星轨罗盘</title>
  <circle cx="100" cy="100" r="80" stroke="#7C3AED" stroke-width="4" fill="none" />
  <circle cx="100" cy="100" r="40" stroke="#059669" stroke-width="2" fill="none" />
  <line x1="20" y1="100" x2="180" y2="100" stroke="#374151" />
  <line x1="100" y1="20" x2="100" y2="180" stroke="#374151" />
</svg>`;

  const candidate = detectStandaloneArtifactCandidate(svgArt, 'svg');
  assert.ok(candidate, '独立完整闭合的 SVG 必须被识别为矢量制品');
  assert.strictEqual(candidate.language, 'svg');
  assert.strictEqual(candidate.title, '星轨罗盘');

  // 验证前置 <?xml ...?> 声明容错
  const svgWithXml = `<?xml version="1.0" encoding="UTF-8"?>\n${svgArt}`;
  const candXml = detectStandaloneArtifactCandidate(svgWithXml, 'svg');
  assert.ok(candXml, '带 xml 声明的完整 SVG 必须正常识别');
  assert.strictEqual(candXml.title, '星轨罗盘');
});

test('6. 非前端视觉语言一律排除 (保持可阅读代码块)', () => {
  const pythonScript = `def fib(n):\n    if n <= 1: return n\n    return fib(n-1) + fib(n-2)\n\nprint(fib(10))`;
  assert.strictEqual(detectStandaloneArtifactCandidate(pythonScript, 'python'), null);
  assert.strictEqual(detectStandaloneArtifactCandidate(pythonScript, 'py'), null);

  const bashScript = `#!/bin/bash\necho "Starting deployment..."\nnpm run build\necho "Done!"`;
  assert.strictEqual(detectStandaloneArtifactCandidate(bashScript, 'bash'), null);
  assert.strictEqual(detectStandaloneArtifactCandidate(bashScript, 'sh'), null);
});

test('7. Prompt 零沙箱字眼与暗契约验证', () => {
  const promptBuilderPath = path.resolve(__dirname, '../src/ai/promptBuilder.ts');
  const promptBuilderSrc = fs.readFileSync(promptBuilderPath, 'utf-8');

  // 1. 验证存在 STABLE_INTERACTIVE_GIFT_POLICY
  assert.ok(promptBuilderSrc.includes('STABLE_INTERACTIVE_GIFT_POLICY'), 'promptBuilder 必须定义 STABLE_INTERACTIVE_GIFT_POLICY');

  // 2. 提取 STABLE_INTERACTIVE_GIFT_POLICY 内容
  const match = promptBuilderSrc.match(/export const STABLE_INTERACTIVE_GIFT_POLICY = (\[[\s\S]*?\]\.join\('\\n'\);)/);
  assert.ok(match, '必须成功提取 STABLE_INTERACTIVE_GIFT_POLICY 内容');

  const policyContent = match[1];
  // 3. 严格禁止出现“沙箱”或“sandbox”字样，防止反向注意力诱导
  assert.ok(!policyContent.includes('沙箱'), 'STABLE_INTERACTIVE_GIFT_POLICY 绝对不得出现“沙箱”字样');
  assert.ok(!/sandbox/i.test(policyContent), 'STABLE_INTERACTIVE_GIFT_POLICY 绝对不得出现“sandbox”字样');

  // 4. 验证装填进 stable_app_policy
  assert.ok(
    promptBuilderSrc.includes("block('stable_app_policy', STABLE_INTERACTIVE_GIFT_POLICY, true)"),
    '必须将 STABLE_INTERACTIVE_GIFT_POLICY 注入到 stable_app_policy 中以保证 100% Prefix Cache'
  );
});

test('8. 折叠态 HTML/Markdown 消息运行按钮支撑验证', () => {
  const contentSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ai/AiMessageContent.tsx'), 'utf-8');

  // 验证 codeHeader 内包含运行沙箱入口
  assert.ok(contentSrc.includes('accessibilityLabel="运行沙箱"'), 'AiMessageContent 必须包含运行沙箱按钮');
  // 验证 foldedControlBar 内包含 foldedRunButton
  assert.ok(contentSrc.includes('styles.foldedRunButton'), '折叠栏必须包含 foldedRunButton');
  // 验证单消息唯一取景框防线
  assert.ok(contentSrc.includes('viewfinderMountedInMessage'), '必须包含单消息唯一取景框互斥防线');
});

test('9. P0-1 验证：制品候选短路早于长文折叠，历史制品不被吞噬为8行代码块', () => {
  const contentSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ai/AiMessageContent.tsx'), 'utf-8');

  // 验证在 renderWholeRichHtml 中，artifactCandidate 的判断早于 shouldFoldAiHistoryMessage 且直接 return 卡片
  const richHtmlIdx = contentSrc.indexOf('if (renderWholeRichHtml) {');
  const candidateIdx = contentSrc.indexOf('wholeHtmlArtifactCandidate', richHtmlIdx);
  const foldingCallIdx = contentSrc.indexOf('const isEligibleForFolding = shouldFoldAiHistoryMessage', richHtmlIdx);

  assert.ok(candidateIdx !== -1 && foldingCallIdx !== -1, '必须同时包含候选检测与折叠判断');
  assert.ok(candidateIdx < foldingCallIdx, '制品检测与白卡返回必须早于折叠逻辑，保证历史制品展示白卡而不是折叠代码块');
});

test('10. P0-2 验证：取景框过滤 ResizeObserver 且首帧就绪后停用报错退化', () => {
  const viewfinderSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ai/AiSandboxArtifactViewfinder.tsx'), 'utf-8');

  assert.ok(viewfinderSrc.includes('ResizeObserver'), '注入脚本必须过滤无害的 ResizeObserver 警告');
  assert.ok(viewfinderSrc.includes('__pixory_viewfinder_ready'), '注入脚本必须在首帧就绪后标记 ready 避免普通交互异常引发退化');
});

test('11. P1-1 验证：白卡与取景框均包裹 React.memo 防止列表滚动重复渲染', () => {
  const cardSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ai/AiSandboxArtifactCard.tsx'), 'utf-8');
  const viewfinderSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ai/AiSandboxArtifactViewfinder.tsx'), 'utf-8');

  assert.ok(cardSrc.includes('export const AiSandboxArtifactCard = React.memo'), 'AiSandboxArtifactCard 必须使用 React.memo');
  assert.ok(viewfinderSrc.includes('export const AiSandboxArtifactViewfinder = React.memo'), 'AiSandboxArtifactViewfinder 必须使用 React.memo');
});

test('12. 取消4px限制改用radius.lg、压扁取景器微缩体态、方框形变按钮与同款胶囊运行按钮', () => {
  const cardSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ai/AiSandboxArtifactCard.tsx'), 'utf-8');
  const viewfinderSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ai/AiSandboxArtifactViewfinder.tsx'), 'utf-8');

  // 1. 卡片与取景器无缝统构
  assert.ok(cardSrc.includes('export const AiSandboxArtifactCard = React.memo'), 'AiSandboxArtifactCard 必须使用 React.memo');
  assert.ok(cardSrc.includes('defaultExpanded={false}'), '小卡片默认处于 defaultExpanded={false} 收拢态');

  // 2. 取消 4px 限制，对齐取景器 radius.lg 圆角与 stretch 全撑满宽度
  assert.ok(viewfinderSrc.includes('borderRadius: radius.lg'), '容器必须使用 radius.lg 圆角');
  assert.ok(viewfinderSrc.includes("alignSelf: 'stretch'"), '容器必须 stretch 撑满宽度');
  assert.ok(!viewfinderSrc.includes('globe-outline'), '必须彻底移除 HTML 地球图标');
  assert.ok(!viewfinderSrc.includes('#059669'), '白卡绝不出现绿色');

  // 3. 方框按钮：卡片态包含 scan-outline 展开按钮，取景框坚决不放折叠按钮 contract-outline（折叠纯由被动单例协调器触发）
  assert.ok(viewfinderSrc.includes('scan-outline'), '卡片态必须包含方框展开按钮 scan-outline');
  assert.ok(!viewfinderSrc.includes('contract-outline'), '取景框坚决不放手动折叠按钮 contract-outline，折叠纯由打开其他取景框被动触发');

  // 4. 同款大气胶囊运行/全屏按钮与 Claude 风格黄金比例三栏卡片
  assert.ok(viewfinderSrc.includes('cardContainer'), '必须包含 Claude 风格黄金比例卡片容器 cardContainer');
  assert.ok(viewfinderSrc.includes('cardIconWrap'), '卡片必须包含 42×42dp 左侧图标徽标容器');
  assert.ok(viewfinderSrc.includes('cardSquareButton'), '必须包含 34×34dp 大气方框展开按钮');
  assert.ok(viewfinderSrc.includes('cardPillButton'), '必须包含 34dp 高度黑色大气胶囊运行按钮');
  assert.ok(!viewfinderSrc.includes('自包含独立运行'), '卡片态彻底剔除自包含独立运行与代码行噪声整行');

  // 5. 变速动力学动画配置与半途光效保障
  assert.ok(viewfinderSrc.includes('EXPAND_ANIMATION_CONFIG'), '必须包含展开变速动画配置');
  assert.ok(viewfinderSrc.includes('COLLAPSE_ANIMATION_CONFIG'), '必须包含收拢变速动画配置');
  assert.ok(viewfinderSrc.includes('isMorphing'), '必须包含 isMorphing 形变状态保护半途极光特效');
});

test('13. 取景框 iframe 隔离与 center-center 几何居中防裁切', () => {
  const viewfinderSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ai/AiSandboxArtifactViewfinder.tsx'), 'utf-8');

  assert.ok(viewfinderSrc.includes('transform-origin: center center'), '取景框缩放必须以几何中心为原点防裁切');
  assert.ok(viewfinderSrc.includes('<iframe id="preview-frame"'), 'HTML 必须采用独立 iframe 隔离样式防污染');
  assert.ok(!viewfinderSrc.includes('轻触进入交互'), '取景框不再显示无用的轻触进入交互提示');
  assert.ok(!viewfinderSrc.includes('#10B981'), '取景框状态点必须去除绿色采用中性纯灰');
});

test('14. 沙箱模态窗关闭叉号右移与黑白灰状态点', () => {
  const modalSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/common/AiSandboxViewerModal.tsx'), 'utf-8');

  const toolbarRightIdx = modalSrc.indexOf('styles.toolbarRight');
  const closeBtnIdx = modalSrc.indexOf('accessibilityLabel="关闭沙箱"', toolbarRightIdx);
  assert.ok(closeBtnIdx !== -1, '关闭叉号必须位于 toolbarRight 内部最右侧');
  assert.ok(!modalSrc.includes("backgroundColor: '#10B981'"), '沙箱模态窗状态点去除绿色');
});

test('15. 选择文本预览直出全屏沙箱，杜绝 160dp 取景框套娃', () => {
  const selectModalSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ai/AiMessageTextSelectionModal.tsx'), 'utf-8');

  assert.ok(selectModalSrc.includes('fullscreenSandboxContainer'), '选择文本预览必须直接渲染全屏沙箱容器');
  assert.ok(selectModalSrc.includes('sandboxExecutable'), '必须包含可执行沙箱制品嗅探');
});

test('16. Markdown 折叠中制品仅按 2 行估算且虚拟切片不破坏制品', () => {
  const contentSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ai/AiMessageContent.tsx'), 'utf-8');

  assert.ok(contentSrc.includes('effectiveLineCount'), '折叠决策必须使用 effectiveLineCount 估算');
  assert.ok(contentSrc.includes('subset.push(block)'), '虚拟切片中遇到独立制品直接保留完整 block');
});

test('17. 全会话物理级单例活跃取景框互斥联动与半屏取景器坚决不放横屏按钮', () => {
  const viewfinderSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ai/AiSandboxArtifactViewfinder.tsx'), 'utf-8');
  const managerSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ai/activeSandboxArtifactManager.ts'), 'utf-8');

  // 1. 验证半屏取景器严禁包含横屏旋转按钮或屏幕旋转逻辑
  assert.ok(!viewfinderSrc.includes('phone-landscape-outline'), '半屏取景器坚决不放横屏旋转按钮');
  assert.ok(!viewfinderSrc.includes('ScreenOrientation'), '半屏取景器坚决不含屏幕旋转锁逻辑');

  // 2. 验证全会话物理级单例活跃协调器机制
  assert.ok(managerSrc.includes('class ActiveSandboxArtifactManager'), '必须提供 ActiveSandboxArtifactManager 协调器');
  assert.ok(viewfinderSrc.includes('activeSandboxArtifactManager'), '取景框必须接入 activeSandboxArtifactManager 实现展开互斥');
  assert.ok(viewfinderSrc.includes('isTransitioningRef'), '取景框必须包含 isTransitioningRef 动效防抖锁，防止连续点击打断动画');
});

test('18. 展开收拢重置 isLoaded 防首帧白屏闪烁与轻量行数计算', () => {
  const viewfinderSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ai/AiSandboxArtifactViewfinder.tsx'), 'utf-8');

  // 1. 白屏重置防护
  assert.ok(viewfinderSrc.includes('setIsLoaded(false); // 重置加载态，防止白屏脏读闪烁'), '展开前必须重置 isLoaded 防止二次展开暴露空白');

  // 2. 移除无谓的 useMemo 槽位
  assert.ok(!viewfinderSrc.includes('useMemo(() => (code ? code.split'), '必须精简 calculatedLineCount 移除无谓 Hook 槽位');
});

test('19. Claude 风格黄金比例沙箱卡片与纯被动折叠取景框排版验证', () => {
  const viewfinderSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ai/AiSandboxArtifactViewfinder.tsx'), 'utf-8');

  // 1. 卡片态纯净干净，无代码行与自包含整行
  assert.ok(!viewfinderSrc.includes('自包含独立运行'), '彻底去除“自包含独立运行”整行文字');

  // 2. 展开态取景框无折叠按钮
  assert.ok(!viewfinderSrc.includes('contract-outline'), '展开态取景框彻底去除手动折叠按钮');

  // 3. 经典三栏排版：左图标、中杂志风标题副标、右大气按钮群
  assert.ok(viewfinderSrc.includes('cardIconWrap'), '必须包含 cardIconWrap 左侧图标');
  assert.ok(viewfinderSrc.includes('cardTitle'), '必须包含 cardTitle 杂志风主标题');
  assert.ok(viewfinderSrc.includes('cardSubtitle'), '必须包含 cardSubtitle 极简副标');
  assert.ok(viewfinderSrc.includes('cardActions'), '必须包含 cardActions 右侧操作按钮群');
  assert.ok(viewfinderSrc.includes('cardSquareButton'), '必须包含 34dp 大气方框展开按钮');
  assert.ok(viewfinderSrc.includes('cardPillButton'), '必须包含 34dp 大气胶囊运行按钮');

  // 4. 单例互斥被动折叠机制
  assert.ok(viewfinderSrc.includes('activeSandboxArtifactManager.subscribe'), '必须订阅被动折叠通知');
});

test('20. 惰性计算、HTML短路与 performCollapse 统一收拢调度器验证', () => {
  const viewfinderSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ai/AiSandboxArtifactViewfinder.tsx'), 'utf-8');

  // 1. 验证 HTML 模板惰性装配：收拢态直接短路为 ''
  assert.ok(viewfinderSrc.includes("if (!expanded && !streaming) return '';"), 'HTML 文档在收拢态必须直接短路返回空字符串');

  // 2. 验证行数惰性测算：收拢态不执行 split
  assert.ok(viewfinderSrc.includes('(expanded || streaming)'), 'calculatedLineCount 必须在 expanded || streaming 时才测算');

  // 3. 验证抽取统一的 performCollapse
  assert.ok(viewfinderSrc.includes('const performCollapse = useCallback'), '必须抽取 performCollapse 统一调度器');

  // 4. 验证防连击定时器闭环清理
  assert.ok(viewfinderSrc.includes('transitionTimerRef'), '必须包含 transitionTimerRef 防连击定时器并在卸载时清理');

  // 5. 验证消除 Badge 内联 style 对象分配
  assert.ok(!viewfinderSrc.includes('backgroundColor: badgeBg'), '严禁使用 badgeBg 内联覆盖 StyleSheet');
});

test('21. 彻底根除被动关闭按钮变大错位缺陷：独立 Key 隔离、同频 34dp 物理对齐与防动画覆盖', () => {
  const viewfinderSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ai/AiSandboxArtifactViewfinder.tsx'), 'utf-8');

  // 1. 独立 Key 隔离：收拢卡片与展开取景框必须有独立的 key，防止 Android LayoutAnimation 跨结构 ViewTag 错位复用
  assert.ok(viewfinderSrc.includes('key="sandbox-collapsed-card"'), '收拢态卡片必须声明独立 key="sandbox-collapsed-card"');
  assert.ok(viewfinderSrc.includes('key="sandbox-expanded-viewfinder"'), '展开态取景框必须声明独立 key="sandbox-expanded-viewfinder"');

  // 2. 被动收拢防动画冲突：当 activeId !== null 时不得二次触发 configureNext 覆盖展开方动画
  assert.ok(viewfinderSrc.includes('performCollapse(activeId === null)'), '被动折叠必须传递 activeId === null，防止覆盖全局动画引发竞争撕裂');

  // 3. 展开态与收拢态操作按钮物理高度统一为 32dp 消除跳动，且方案 A 采用浅灰温润底色与细边框
  assert.ok(viewfinderSrc.includes('headerPrimaryButton: {\n    flexDirection: \'row\',\n    alignItems: \'center\',\n    backgroundColor: \'#F1F5F9\',\n    borderWidth: 1,\n    borderColor: \'#E2E8F0\',\n    paddingHorizontal: 13,\n    height: 32'), '展开态运行按钮高度必须与收拢态卡片按钮完全对齐锁定 32dp 且采用方案 A 浅灰底');
});
