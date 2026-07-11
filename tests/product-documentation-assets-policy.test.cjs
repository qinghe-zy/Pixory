const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('product documentation assets are rewritten from docs/assets to the public website assets path', () => {
  const source = read('src/services/productDocumentationService.ts');
  const markdown = read('src/content/productManualMarkdown.ts');

  assert.match(markdown, /docs\/assets\/og-cover\.png/);
  assert.match(source, /const PRODUCT_DOC_ASSET_PUBLIC_PREFIX = 'assets\/';/);
  assert.match(source, /const PRODUCT_DOC_ASSET_SOURCE_PREFIX = 'docs\/assets\/';/);
  assert.match(
    source,
    /return `\$\{PRODUCT_DOC_ASSET_PUBLIC_PREFIX\}\$\{relativePath\.slice\(PRODUCT_DOC_ASSET_SOURCE_PREFIX\.length\)\}`;/
  );
  assert.match(source, /return `\$\{PRODUCT_DOC_ASSET_BASE_URL\}\$\{getPublicAssetPath\(relativePath\)\}`;/);
  assert.doesNotMatch(source, /return `\$\{PRODUCT_DOC_ASSET_BASE_URL\}\$\{relativePath\}`;/);
});

test('product documentation asset downloads invalidate the old cache bucket and reject non-image responses', () => {
  const source = read('src/services/productDocumentationService.ts');

  assert.match(source, /const PRODUCT_DOC_ASSET_CACHE_DIR_NAME = 'product_documentation_assets_v2';/);
  assert.match(source, /downloadResult\.status !== 200/);
  assert.match(source, /contentType\?\.toLowerCase\(\)\.startsWith\('image\/'\)/);
  assert.match(source, /Unexpected content type/);
});
