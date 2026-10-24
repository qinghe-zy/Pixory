const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = function compile(module, filename) {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename
  );
};

const { sniffCodeBlockInStream } = require(path.join(root, 'src/services/sandbox/sandboxDetector.ts'));
const { parseStreamingArtifactSegments } = require(path.join(root, 'src/services/sandbox/streamingArtifactSplitter.ts'));

test('sniffCodeBlockInStream 与 parseStreamingArtifactSegments 验证', () => {
  // 1. 微缓冲挂起测试 (<60 字符，未换行)
  const pending1 = sniffCodeBlockInStream('<!doctype ', 'html', false, true);
  assert.strictEqual(pending1.status, 'pending_sniff', '首行未满 60 字符且未换行时应挂起嗅探');

  // 2. 首行契约嗅探命中 HTML5
  const streamingHtml = sniffCodeBlockInStream(
    '<!DOCTYPE html>\n<html>\n<head><title>霓虹打砖块</title></head>\n<body><canvas></canvas>',
    'html',
    false,
    true
  );
  assert.strictEqual(streamingHtml.status, 'streaming_artifact', '完整 HTML5 头应触发取景框流式占位');
  assert.strictEqual(streamingHtml.liveTitle, '霓虹打砖块', '应实时提取到标题');
  assert.strictEqual(streamingHtml.artifactType, 'html');

  // 3. 普通教学片段（如 <div> 或 <style>）绝不误判
  const teachingSnippet = sniffCodeBlockInStream(
    '<div class="box">\n  <span>居中文本</span>\n</div>\n<style>.box { display: flex; }</style>',
    'html',
    false,
    true
  );
  assert.strictEqual(teachingSnippet.status, 'normal_codeblock', '无文档头的普通排版教学代码必须走普通代码块');

  // 4. 用户中途点击“停止生成”兜底（isMessageStreaming = false, isFenceClosed = false）
  const abortedHtml = sniffCodeBlockInStream(
    '<!DOCTYPE html>\n<html>\n<head><title>未完待续</title>',
    'html',
    false,
    false
  );
  assert.strictEqual(abortedHtml.status, 'normal_codeblock', '用户中途打断未闭合的代码块应安全回退为普通代码块');

  // 5. 非 Web 语言（如 Python）0 延迟直接走普通代码块
  const pyCode = sniffCodeBlockInStream('def hello():\n    return 42', 'python', false, true);
  assert.strictEqual(pyCode.status, 'normal_codeblock', '非 Web 语言直接走普通代码块');

  // 6. SVG 矢量插画首行嗅探
  const svgArt = sniffCodeBlockInStream(
    '<?xml version="1.0"?>\n<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">\n<circle cx="50" cy="50" r="40"/>\n',
    'svg',
    false,
    true
  );
  assert.strictEqual(svgArt.status, 'streaming_artifact');
  assert.strictEqual(svgArt.artifactType, 'svg');

  // 7. 闭合且完整的就绪制品（直接通过 detectStandaloneArtifactCandidate 校验）
  const fullReadyHtml = sniffCodeBlockInStream(
    '<!DOCTYPE html>\n<html>\n<head><title>完结作品</title><style>body{margin:0;}</style></head>\n<body><canvas id="c"></canvas><script>console.log("ready");</script></body>\n</html>',
    'html',
    true,
    false
  );
  assert.strictEqual(fullReadyHtml.status, 'ready_artifact', '闭合并通过校验的代码应就绪准备揭幕');
  assert.strictEqual(fullReadyHtml.liveTitle, '完结作品');

  // 8. 多代码块消息切片测试：前置普通代码块 + 后续 HTML5 独立制品
  const multiBlockMessage =
    '前置说明文字\n\n```python\nprint("hello")\n```\n\n接下来是为你制作的游戏：\n\n```html\n<!DOCTYPE html>\n<html>\n<head><title>连击消除</title></head>\n<body><canvas></canvas>';
  const parsedMulti = parseStreamingArtifactSegments(multiBlockMessage, true);
  assert.strictEqual(parsedMulti.hasArtifact, true, '复合消息应能准确越过普通代码块捕获到后续制品');
  assert.strictEqual(parsedMulti.status, 'streaming_artifact');
  assert.strictEqual(parsedMulti.artifact.title, '连击消除');
  assert.ok(parsedMulti.preText.includes('print("hello")'), '前置文本应完整保留前面的普通代码块');
});
