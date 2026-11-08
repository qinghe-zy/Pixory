const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

function loadModule(relativePath, mockRequire = {}) {
  let targetPath = path.resolve(__dirname, relativePath);
  if (!targetPath.endsWith('.ts') && !targetPath.endsWith('.js')) {
    if (fs.existsSync(targetPath + '.ts')) targetPath += '.ts';
    else if (fs.existsSync(targetPath + '.js')) targetPath += '.js';
  }
  const code = fs.readFileSync(targetPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  const customRequire = (reqPath) => {
    if (mockRequire[reqPath]) return mockRequire[reqPath];
    if (reqPath.startsWith('.')) {
      return loadModule(path.join(path.dirname(targetPath), reqPath), mockRequire);
    }
    return require(reqPath);
  };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, customRequire);
  return m.exports;
}

const { modulateVoiceProsody } = loadModule('../src/voice/prosodyModulator.ts');

test('Voice Prosody Modulator - 情绪到语速与音高的自适应微调', () => {
  // 1. 无语气指令时，保持基准配置恒定
  const neutral = modulateVoiceProsody(1.0, 0.0, null);
  assert.equal(neutral.rate, 1.0);
  assert.equal(neutral.pitch, 0.0);

  // 2. 轻柔 / 软 / 耳语 / 困倦 -> 放缓语速（~0.9x），音高微低平稳
  const gentle = modulateVoiceProsody(1.0, 0.0, '声音放得又轻又软');
  assert.ok(gentle.rate < 1.0, '轻柔语气语速应放缓');
  assert.equal(gentle.rate, 0.90);
  assert.equal(gentle.pitch, -2.0);
  assert.equal(gentle.detectedEmotion, 'gentle_whisper');

  const sleepy = modulateVoiceProsody(1.0, 0.0, '困倦，声音很小');
  assert.equal(sleepy.rate, 0.90);
  assert.equal(sleepy.pitch, -2.0);

  // 3. 急促 / 慌张 / 催促 / 兴奋 -> 加快语速（~1.15x），音高上扬（+5%）
  const hurried = modulateVoiceProsody(1.0, 0.0, '快点回话呀，着急');
  assert.ok(hurried.rate > 1.0, '急促催促语速应加快');
  assert.equal(hurried.rate, 1.15);
  assert.equal(hurried.pitch, 5.0);
  assert.equal(hurried.detectedEmotion, 'hurried_excited');

  // 4. 撒娇 / 粘人 / 甜美 / 娇嗔 -> 语速略缓（~0.94x），音调显著拔高（+6%）
  const coy = modulateVoiceProsody(1.0, 0.0, '撒娇轻嗔');
  assert.equal(coy.rate, 0.94);
  assert.equal(coy.pitch, 6.0);
  assert.equal(coy.detectedEmotion, 'coy_sweet');

  // 5. 傲娇 / 嫌弃 / 生气 -> 语速干脆略快（~1.06x），音调稍低（-2%）
  const tsundere = modulateVoiceProsody(1.0, 0.0, '傲娇，嘴上嫌弃');
  assert.equal(tsundere.rate, 1.06);
  assert.equal(tsundere.pitch, -2.0);
  assert.equal(tsundere.detectedEmotion, 'tsundere_annoyed');

  // 6. 叹气 / 无奈 -> 语速微慢（~0.95x）
  const sigh = modulateVoiceProsody(1.0, 0.0, '深深叹气，真拿你没办法');
  assert.equal(sigh.rate, 0.95);
  assert.equal(sigh.pitch, -1.0);
  assert.equal(sigh.detectedEmotion, 'helpless_sigh');

  // 7. 极值与基准保护验证 (基准为 1.5 时，撒娇按比例缩放并安全夹紧)
  const coyFast = modulateVoiceProsody(1.5, 10.0, '撒娇');
  assert.equal(coyFast.rate, 1.41);
  assert.equal(coyFast.pitch, 16.0);
});
