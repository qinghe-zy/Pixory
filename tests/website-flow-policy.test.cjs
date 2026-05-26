const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const pages = {
  'docs/index.html': ['updates.html', 'culture.html'],
  'docs/culture.html': ['index.html', 'features.html'],
  'docs/features.html': ['culture.html', 'data.html'],
  'docs/data.html': ['features.html', 'download.html'],
  'docs/download.html': ['data.html', 'updates.html'],
  'docs/updates.html': ['download.html', 'index.html'],
};

test('website pages form a continuous previous and next reading path', () => {
  for (const [page, [previous, next]] of Object.entries(pages)) {
    const source = read(page);
    assert.match(source, /class="page-bridge"/, `${page} should include the page bridge`);
    assert.match(source, new RegExp(`class="bridge-card bridge-prev[\\s\\S]*href="${previous}"`), `${page} should link to previous page`);
    assert.match(source, new RegExp(`class="bridge-card bridge-next[\\s\\S]*href="${next}"`), `${page} should link to next page`);
    assert.match(source, /site\.css\?v=motion-8/);
    assert.match(source, /site\.js\?v=motion-8/);
  }
});

test('website release-facing files reference the current 2.1.21 release', () => {
  assert.match(read('docs/download.html'), /<div class="version-number">2\.1\.21<\/div>/);
  assert.match(read('docs/download.html'), /versionCode 235/);
  assert.match(read('docs/updates.html'), /<h2 class="section-title reveal">2\.1\.21<\/h2>/);
  assert.match(read('docs/updates.html'), /资料生命周期修复/);
  assert.match(read('docs/updates.html'), /长对话更稳/);
  assert.match(read('docs/features.html'), /会话整理/);
  assert.match(read('README.md'), /当前版本 `2\.1\.21`/);
  assert.match(read('docs/pixory-product-bid-handbook.md'), /适用版本：Pixory 2\.1\.21/);
  assert.doesNotMatch(read('docs/download.html') + read('docs/updates.html') + read('README.md'), /2\.1\.6/);
});

test('release workflow requires README and update website pages', () => {
  const agents = read('AGENTS.md');

  assert.match(agents, /`README\.md`/);
  assert.match(agents, /`docs\/download\.html`/);
  assert.match(agents, /`docs\/updates\.html`/);
  assert.match(agents, /`docs\/sitemap\.xml`/);
  assert.match(agents, /README current-version text/);
  assert.match(agents, /website download\/update pages/);
  assert.match(agents, /remote release-facing website pages/);
  assert.match(agents, /remote README/);
});

test('public docs describe privacy screenshots consistently with current behavior', () => {
  const docs = read('README.md') + read('docs/pixory-product-bid-handbook.md');
  assert.match(docs, /隐私模式允许截屏/);
  assert.match(docs, /允许系统截屏/);
  assert.doesNotMatch(docs, /截屏防护|截屏保护|禁止截屏/);
});

test('website sitemap lastmod is synchronized with the release update date', () => {
  const sitemap = read('docs/sitemap.xml');
  const matches = sitemap.match(/<lastmod>2026-05-26<\/lastmod>/g) ?? [];
  assert.equal(matches.length, 6);
});
