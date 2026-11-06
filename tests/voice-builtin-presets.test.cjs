const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('builtin voice presets acoustic design and proportion verification', () => {
  const filePath = path.resolve(__dirname, '../src/voice/builtinPresets.ts');
  const content = fs.readFileSync(filePath, 'utf8');

  // 必须导出 BUILTIN_VOICE_PRESETS
  assert.ok(content.includes('BUILTIN_VOICE_PRESETS'), 'Must export BUILTIN_VOICE_PRESETS');

  // 必须包含小米官方 4 款顶级声学预设
  assert.ok(content.includes('mimo-bingtang'), 'Must include 冰糖·清澈甜美 (小米MiMo)');
  assert.ok(content.includes('mimo-moli'), 'Must include 茉莉·温柔知性 (小米MiMo)');
  assert.ok(content.includes('mimo-suda'), 'Must include 苏打·阳光活力 (小米MiMo)');
  assert.ok(content.includes('mimo-baihua'), 'Must include 白桦·沉稳磁性 (小米MiMo)');

  // 必须彻底清除已失效的旧 Edge-TTS 预设与不可用离线音
  assert.strictEqual(content.includes('builtin-female-gentle'), false, 'Dead Edge-TTS presets must be removed');
  assert.strictEqual(content.includes('builtin-female-cheerful'), false, 'Dead Edge-TTS presets must be removed');
  assert.strictEqual(content.includes('builtin-native-system'), false, 'Dead native preset must be removed');

  // 验证预设总数严格为 4
  const mimoMatches = content.match(/id:\s*'mimo-/g) || [];
  assert.equal(mimoMatches.length, 4, 'Must have exactly 4 official Xiaomi MiMo presets');
});
