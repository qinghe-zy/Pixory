const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('IM theme tokens and provider policy verification', async (t) => {
  const themePath = path.resolve(__dirname, '../src/im/theme/imTheme.ts');
  const providerPath = path.resolve(__dirname, '../src/im/theme/ImThemeProvider.tsx');

  const themeContent = fs.readFileSync(themePath, 'utf8');
  const providerContent = fs.readFileSync(providerPath, 'utf8');

  await t.test('imTheme.ts contains authentic WeChat colors, typography and metrics', () => {
    // 微信底色与气泡颜色
    assert.match(themeContent, /background:\s*'#EDEDED'/);
    assert.match(themeContent, /bubbleLeftBackground:\s*'#FFFFFF'/);
    assert.match(themeContent, /bubbleRightBackground:\s*'#95EC69'/);
    assert.match(themeContent, /sendButtonBackground:\s*'#95EC69'/);
    assert.match(themeContent, /composerBackground:\s*'#F7F7F7'/);

    // 微信经典尺寸与圆角
    assert.match(themeContent, /bubbleRadius:\s*5/);
    assert.match(themeContent, /avatarRadius:\s*4/);
    assert.match(themeContent, /avatarSize:\s*32/);
    assert.match(themeContent, /bubbleSpacingSameSpeaker:\s*16/);
    assert.match(themeContent, /bubbleSpacingDiffSpeaker:\s*26/);
    assert.match(themeContent, /beakWidth:\s*6/);
    assert.match(themeContent, /beakHeight:\s*10/);
    assert.match(themeContent, /beakOffsetTop:\s*7/);
  });

  await t.test('ImThemeProvider exports Context provider and useImTheme hook', () => {
    assert.match(providerContent, /export function ImThemeProvider/);
    assert.match(providerContent, /export function useImTheme/);
    assert.match(providerContent, /createContext<ImThemeTokens>\(defaultWechatTheme\)/);
  });
});
