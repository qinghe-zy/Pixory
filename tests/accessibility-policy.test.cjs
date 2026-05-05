const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function relativeLuminance(hexColor) {
  const channels = hexColor
    .match(/[0-9A-Fa-f]{2}/g)
    .map((channel) => parseInt(channel, 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

test('primary button token keeps white text at WCAG AA contrast', () => {
  const source = readProjectFile('src/design/tokens/colors.ts');
  const match = source.match(/default:\s*'(#[0-9A-Fa-f]{6})'/);

  assert.ok(match, 'primary default color must be declared as a hex color');
  assert.notEqual(match[1].toUpperCase(), '#B99055', 'primary default must not use the old low-contrast gold');
  assert.ok(
    contrastRatio('#FFFFFF', match[1]) >= 4.5,
    `primary default ${match[1]} must have at least 4.5:1 contrast with white text`
  );
});

test('thumbnail tiles expose clickable image accessibility metadata', () => {
  const source = readProjectFile('src/components/ThumbnailTile.tsx');

  assert.match(source, /accessibilityRole="imagebutton"/);
  assert.match(source, /accessibilityLabel=\{accessibilityLabel\}/);
  assert.match(source, /打开图片：\$\{image\.originalFilename\}/);
  assert.match(source, /已选中/);
  assert.match(source, /accessibilityState=\{\{\s*selected\s*\}\}/);
});

test('bottom tabs expose text-only accessibility labels and selected state', () => {
  const source = readProjectFile('src/components/BottomTabBar.tsx');

  assert.match(source, /accessibilityLabel=\{item\.label\}/);
  assert.match(source, /accessibilityState=\{\{\s*selected:\s*isActive\s*\}\}/);
});
