const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const redirects = {
  'docs/culture.html': 'index.html',
  'docs/features.html': 'index.html#features',
  'docs/data.html': 'index.html#about',
  'docs/download.html': 'index.html#download',
};

test('website uses a single-page homepage while legacy pages redirect to stable sections', () => {
  const index = read('docs/index.html');
  assert.match(index, /href="#about"/);
  assert.match(index, /href="#matrix"/);
  assert.match(index, /href="#workflow"/);
  assert.match(index, /href="#download"/);
  assert.match(index, /href="updates\.html"/);
  assert.match(index, /site\.css\?v=11/);
  assert.match(index, /site\.js\?v=11/);

  for (const [page, target] of Object.entries(redirects)) {
    const source = read(page);
    assert.match(source, new RegExp(`http-equiv="refresh" content="0; url=${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    assert.match(source, new RegExp(`href="${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  }
});

test('website release-facing files reference the current 2.4.4 release', () => {
  assert.match(read('docs/index.html'), /当前版本：2\.4\.4/);
  assert.match(read('docs/update-version.json'), /"versionCode": 244/);
  assert.match(read('docs/updates.html'), /Version 2\.4\.4/);
  assert.match(read('docs/updates.html'), /长会话渲染更轻/);
  assert.match(read('docs/updates.html'), /发布前回归修复/);
  assert.match(read('docs/index.html'), /SQLite/);
  assert.match(read('README.md'), /当前版本 `2\.4\.4`/);
  assert.match(read('docs/pixory-product-bid-handbook.md'), /适用版本：Pixory 2\.4\.4/);
  assert.doesNotMatch(read('docs/index.html') + read('docs/updates.html') + read('README.md'), /2\.1\.6/);
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
  const matches = sitemap.match(/<lastmod>2026-06-09<\/lastmod>/g) ?? [];
  assert.equal(matches.length, 6);
});

test('homepage has mobile overflow safeguards for the editorial grid', () => {
  const css = read('docs/site.css');

  assert.match(css, /html,\s*body\s*\{[\s\S]*?overflow-x:\s*hidden;/);
  assert.match(css, /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.grid\s*>\s*\*\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1\s*!important;/);
  assert.match(css, /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.mockup-card-dark\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;/);
  assert.match(css, /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.section:first-child\s*\.grid\s*\{[\s\S]*?gap:\s*var\(--space-xl\);/);
  assert.match(css, /@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*?\.nav-actions\s*\.btn-primary\s*\{[\s\S]*?display:\s*none;/);
});
