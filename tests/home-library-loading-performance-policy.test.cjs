const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('home loading keeps the list shell and renders exactly one card skeleton', () => {
  const home = readProjectFile('src/screens/HomeLibraryScreen.tsx');

  assert.match(home, /ListEmptyComponent=/);
  assert.match(home, /isLoading\s*\?\s*\(\s*<IPCardSkeleton\s*\/>/);
  assert.equal((home.match(/<IPCardSkeleton\s*\/>/g) ?? []).length, 1);
  assert.doesNotMatch(home, /正在读取本地资产库|SQLite 数据加载完成后/);
  assert.doesNotMatch(home, /isFirst=\{index === 0\}/);
  assert.match(home, /getItemLayout=/);
  assert.match(home, /initialNumToRender=\{3\}/);
  assert.match(home, /maxToRenderPerBatch=\{4\}/);
  assert.match(home, /windowSize=\{5\}/);
  assert.match(home, /index === 0 \? 'high' : 'normal'/);
});

test('IP cards and their loading skeleton share geometry without a first-item sensor path', () => {
  const card = readProjectFile('src/components/IPCard.tsx');
  const tokens = readProjectFile('src/design/tokens/components.ts');
  const skeletonPath = path.join(rootDir, 'src/components/IPCardSkeleton.tsx');

  assert.ok(fs.existsSync(skeletonPath), 'IPCardSkeleton.tsx must exist');
  const skeleton = readProjectFile('src/components/IPCardSkeleton.tsx');

  assert.doesNotMatch(card, /MagneticCardContainer|MagneticLiquidContainer|GyroSpecularHighlight|isFirst/);
  assert.match(tokens, /aspectRatio:\s*2\.08/);
  assert.match(tokens, /captionWidth:\s*'74%'/);
  assert.match(tokens, /shimmerDurationMs:\s*1_200/);
  assert.match(card, /aspectRatio:\s*componentTokens\.ipCard\.aspectRatio/);
  assert.match(card, /width:\s*componentTokens\.ipCard\.captionWidth/);
  assert.match(card, /transition=\{imagePriority === 'high' \? 0 : componentTokens\.ipCard\.imageTransitionMs\}/);
  assert.match(skeleton, /aspectRatio:\s*componentTokens\.ipCard\.aspectRatio/);
  assert.match(skeleton, /width:\s*componentTokens\.ipCard\.captionWidth/);
  assert.match(skeleton, /Animated\.loop/);
  assert.match(skeleton, /AccessibilityInfo\.isReduceMotionEnabled/);
  assert.match(skeleton, /reduceMotionChanged/);
});

test('secure image accepts recycling and priority hints without changing privacy policy', () => {
  const secureImage = readProjectFile('src/components/SecureImage.tsx');

  assert.match(secureImage, /priority\?:\s*ImageProps\['priority'\]/);
  assert.match(secureImage, /recyclingKey\?:\s*string/);
  assert.match(secureImage, /placeholder\?:\s*ImageProps\['placeholder'\]/);
  assert.match(secureImage, /transition\?:\s*ImageProps\['transition'\]/);
  assert.match(secureImage, /cachePolicy=\{space === 'personal' \? 'memory' : 'disk'\}/);
  assert.match(secureImage, /priority=\{priority\}/);
  assert.match(secureImage, /recyclingKey=\{recyclingKey\}/);
});
