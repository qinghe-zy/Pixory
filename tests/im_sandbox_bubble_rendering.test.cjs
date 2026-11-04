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
      jsx: ts.JsxEmit.ReactJSX,
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
      return {
        memo: (c) => c,
        useRef: () => ({ current: 0 }),
        useMemo: (fn) => fn(),
        StyleSheet: { create: (s) => s, hairlineWidth: 1 },
      };
    }
  };
  const m = { exports: {} };
  const fn = new Function('module', 'exports', 'require', '__dirname', '__filename', compiled.outputText);
  fn(m, m.exports, customRequire, path.dirname(filePath), filePath);
  return m.exports;
}

const streamingSplitterModule = loadTsModule('src/services/sandbox/streamingArtifactSplitter.ts');
const detectorModule = loadTsModule('src/services/sandbox/sandboxDetector.ts');

test('1. 伴聊纯自包含 HTML 礼物：自动识别为制品并剥离源码', () => {
  const { parseStreamingArtifactSegments } = streamingSplitterModule;

  const htmlGift = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>星空心动小组件</title>
  <style>
    body { margin: 0; background: #000; overflow: hidden; }
    canvas { display: block; width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    const c = document.getElementById('c');
    const ctx = c.getContext('2d');
    function draw() {
      ctx.fillStyle = 'rgba(255, 0, 100, 0.8)';
      ctx.fillRect(50, 50, 100, 100);
      requestAnimationFrame(draw);
    }
    draw();
  </script>
</body>
</html>`;

  const parsed = parseStreamingArtifactSegments(htmlGift, false);
  assert.equal(parsed.hasArtifact, true, '必须命中沙箱交互制品');
  assert.ok(parsed.artifact, '必须提取出有效 artifact 对象');
  assert.equal(parsed.artifact.title, '星空心动小组件', '应从 <title> 自动提取出精美标题');
  assert.equal(parsed.artifact.language, 'html');
  assert.equal(parsed.preText, '', '纯制品不应有多余前置文字');
  assert.equal(parsed.postText, '', '纯制品不应有多余后置文字');
});

test('2. 伴聊复合陪伴消息：前置情话 + 围栏 HTML 礼物 + 后置说明', () => {
  const { parseStreamingArtifactSegments } = streamingSplitterModule;

  const compositeMessage = `依依为你手写了一个下雪许愿卡，快看：
\`\`\`html
<!DOCTYPE html>
<html>
<head>
  <title>冬日飘雪许愿球</title>
  <style>body { background: #1a202c; color: #fff; text-align: center; }</style>
</head>
<body>
  <div id="snow">❄️ 正在飘雪 ❄️</div>
  <button onclick="alert('愿望已送达')">许愿</button>
  <script>
    console.log("雪花纷飞");
  </script>
</body>
</html>
\`\`\`
点击卡片可以直接全屏体验哦~ 喜欢就告诉我！`;

  const parsed = parseStreamingArtifactSegments(compositeMessage, false);
  assert.equal(parsed.hasArtifact, true, '复合消息必须命中沙箱制品');
  assert.ok(parsed.artifact, '必须存在 artifact');
  assert.equal(parsed.artifact.title, '冬日飘雪许愿球');
  assert.ok(parsed.preText.includes('依依为你手写了一个下雪许愿卡'), '前置情话文本应完整保留');
  assert.ok(parsed.postText.includes('点击卡片可以直接全屏体验'), '后置说明文本应完整保留');
  assert.equal(parsed.artifact.code.includes('冬日飘雪许愿球'), true, '制品代码应完整提取');
});

test('3. 普通非交互代码块（如 Python / Bash）：不被误判为沙箱，保留普通展示', () => {
  const { parseStreamingArtifactSegments } = streamingSplitterModule;

  const pythonSnippet = `这是我今天写的计算脚本：
\`\`\`python
def calculate_days(start, end):
    return (end - start).days

print(calculate_days(1, 10))
\`\`\`
给你参考一下。`;

  const parsed = parseStreamingArtifactSegments(pythonSnippet, false);
  assert.equal(parsed.hasArtifact, false, 'Python 代码绝不能误判为沙箱交互制品');
});

test('4. TextBubbleRenderer: 伴聊气泡集成沙箱取景框与卡片架构审计', () => {
  const textRendererCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/im/components/renderers/TextBubbleRenderer.tsx'),
    'utf8'
  );
  assert.ok(
    textRendererCode.includes('parseStreamingArtifactSegments'),
    'TextBubbleRenderer 必须引入并使用 parseStreamingArtifactSegments 进行沙箱制品智能拦截'
  );
  assert.ok(
    textRendererCode.includes('AiSandboxArtifactViewfinder'),
    'TextBubbleRenderer 必须装配 AiSandboxArtifactViewfinder 用于最新消息的原位微缩取景'
  );
  assert.ok(
    textRendererCode.includes('AiSandboxArtifactCard'),
    'TextBubbleRenderer 必须装配 AiSandboxArtifactCard 用于历史消息的高质感白卡收拢'
  );
  assert.ok(
    textRendererCode.includes('isLatestMessage'),
    'TextBubbleRenderer 必须支持 isLatestMessage 状态决策'
  );
  assert.ok(
    textRendererCode.includes('sandboxCardWrap'),
    'TextBubbleRenderer 必须定义 292dp 紧凑卡片容器样式'
  );
});
