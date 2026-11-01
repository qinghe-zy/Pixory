const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const ts = require('typescript');

function loadModule(relativePath) {
  const fullPath = path.resolve(__dirname, relativePath);
  const code = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, (p) => {
    if (p.startsWith('.')) {
      return loadModule(path.join(path.dirname(fullPath), p));
    }
    return require(p);
  });
  return m.exports;
}

test('IM Pacing and Clear Cascade: 核心契约与功能完整性验证', async (t) => {
  const { resolveCompanionRolePrompt } = loadModule('../src/im/engine/imRolePromptResolver.ts');
  const { calculateContrastingTextColor, buildImThemeFromPreferences } = loadModule('../src/im/theme/imTheme.ts');
  const { buildProactivePromptDirective } = loadModule('../src/im/engine/proactiveTimingEvaluator.ts');
  const { evaluateProactivePacing, HIBERNATION_CUTOFF_MS } = loadModule('../src/im/heartbeat/proactivePacingGuard.ts');

  await t.test('1. 六大鲜明说话风格与称呼契约打通', () => {
    const mockRole = { name: '小依', prompt: '你是一个贴心伴侣。' };
    const personalization = {
      companionCallName: '阿依',
      userNickname: '林木',
      replyStyleGear: 'clingy_sweet',
    };

    const resolved = resolveCompanionRolePrompt(mockRole, '小依', personalization);
    assert.equal(resolved.companionName, '小依');
    assert.ok(resolved.rolePrompt.includes('对方对你的专属称谓: "阿依"'));
    assert.ok(resolved.rolePrompt.includes('对方专属称呼: "林木"'));
    assert.ok(resolved.rolePrompt.includes('甜糯粘人'));
  });

  await t.test('2. 气泡自定义配色明度算法与主题映射', () => {
    // 浅绿 -> 深色文字
    assert.equal(calculateContrastingTextColor('#95EC69'), '#111111');
    // 纯白 -> 深色文字
    assert.equal(calculateContrastingTextColor('#FFFFFF'), '#111111');
    // 靛紫 -> 白色文字
    assert.equal(calculateContrastingTextColor('#6366F1'), '#FFFFFF');
    // 玄黑 -> 白色文字
    assert.equal(calculateContrastingTextColor('#26282B'), '#FFFFFF');

    // 动态主题构建测试
    const theme = buildImThemeFromPreferences(undefined, undefined, undefined, '#6366F1');
    assert.equal(theme.colors.bubbleRightBackground, '#6366F1');
    assert.equal(theme.colors.bubbleRightText, '#FFFFFF');
  });

  await t.test('3. 三阶前台阶梯伴随节律指令 (3s/10s/30s)', () => {
    const s1 = buildProactivePromptDirective(1, '小依');
    assert.ok(s1.includes('Stage 1'));
    assert.ok(s1.includes('顺着刚才的话题'));

    const s2 = buildProactivePromptDirective(2, '小依');
    assert.ok(s2.includes('Stage 2'));
    assert.ok(s2.includes('二选一趣味轻决断'));
    assert.ok(s2.includes('让对方一直有事干'));

    const s3 = buildProactivePromptDirective(3, '小依');
    assert.ok(s3.includes('Stage 3'));
    assert.ok(s3.includes('[PING:'));
  });

  await t.test('4. 心跳 72h 内永不静默关闭，除非超过 3 天', () => {
    const now = 1700000000000;
    // 连续 4 次未回复，但在 10 分钟前互动 -> 绝不进入休眠
    const activeDec = evaluateProactivePacing(4, now - 10 * 60 * 1000, now);
    assert.equal(activeDec.allowHeartbeat, true);
    assert.equal(activeDec.isHibernating, false);

    // 超过 72 小时无互动 -> 终极休眠
    const deadDec = evaluateProactivePacing(0, now - (HIBERNATION_CUTOFF_MS + 5000), now);
    assert.equal(deadDec.allowHeartbeat, false);
    assert.equal(deadDec.isHibernating, true);
  });
});
