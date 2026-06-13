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
  assert.match(index, /site\.css\?v=13/);
  assert.match(index, /site\.js\?v=12/);

  for (const [page, target] of Object.entries(redirects)) {
    const source = read(page);
    assert.match(source, new RegExp(`http-equiv="refresh" content="0; url=${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    assert.match(source, new RegExp(`href="${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  }
});

test('website release-facing files reference the current 2.4.5 release', () => {
  assert.match(read('docs/index.html'), /当前版本：2\.4\.5/);
  assert.match(read('docs/update-version.json'), /"versionCode": 245/);
  assert.match(read('docs/updates.html'), /Version 2\.4\.5/);
  assert.match(read('docs/updates.html'), /AI 工作台更顺手/);
  assert.match(read('docs/updates.html'), /双下载入口/);
  assert.match(read('docs/index.html'), /SQLite/);
  assert.match(read('README.md'), /当前版本 `2\.4\.5`/);
  assert.match(read('docs/pixory-product-bid-handbook.md'), /适用版本：Pixory 2\.4\.5/);
  assert.match(read('README.md'), /https:\/\/gitee\.com\/Qinghe_zy\/pixory\/releases/);
  assert.match(read('docs/index.html'), /https:\/\/gitee\.com\/Qinghe_zy\/pixory\/releases/);
  assert.match(read('README.md'), /https:\/\/github\.com\/qinghe-zy\/Pixory\/releases\/latest/);
  assert.match(read('docs/index.html'), /https:\/\/github\.com\/qinghe-zy\/Pixory\/releases\/latest/);
  assert.match(read('docs/index.html'), /GitHub 下载[\s\S]{0,140}国际网络友好/);
  assert.match(read('docs/index.html'), /Gitee 下载[\s\S]{0,140}国内网络友好/);
  assert.match(read('docs/update-version.json'), /https:\/\/mist01\.com\/#download/);
  assert.match(read('docs/updates.html'), /访问 Gitee Releases/);
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
  assert.match(agents, /`gitee` \/ `git@gitee\.com:Qinghe_zy\/pixory\.git`/);
  assert.match(agents, /Create a Gitee Release/);
  assert.match(agents, /Gitee release URL/);
  assert.match(agents, /preflight Gitee Release publishing credentials/);
  assert.match(agents, /GITEE_TOKEN/);
  assert.match(agents, /continue only when the user explicitly accepts that Gitee Release creation will be deferred/);
  assert.match(agents, /app update popup defaults to the official website download section/);
  assert.match(agents, /docs\/update-version\.json` `downloadUrl` points to `https:\/\/mist01\.com\/#download`/);
  assert.match(agents, /website download section exposes both GitHub and Gitee download choices/);
});

test('public docs describe privacy screenshots consistently with current behavior', () => {
  const docs = read('README.md') + read('docs/pixory-product-bid-handbook.md');
  assert.match(docs, /隐私模式允许截屏/);
  assert.match(docs, /允许系统截屏/);
  assert.doesNotMatch(docs, /截屏防护|截屏保护|禁止截屏/);
});

test('website sitemap lastmod is synchronized with the release update date', () => {
  const sitemap = read('docs/sitemap.xml');
  const matches = sitemap.match(/<lastmod>2026-06-13<\/lastmod>/g) ?? [];
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

test('homepage adds eye-catching motion without ignoring reduced-motion users', () => {
  const index = read('docs/index.html');
  const css = read('docs/site.css');
  const js = read('docs/site.js');

  assert.match(index, /class="scroll-progress"/);
  assert.match(index, /class="hero-signal"/);
  assert.match(index, /class="asset-sheen"/);
  assert.match(css, /@keyframes\s+mockupScan/);
  assert.match(css, /@keyframes\s+assetPulse/);
  assert.match(css, /@keyframes\s+signalDrift/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(js, /updateScrollProgress/);
  assert.match(js, /createRipple/);
  assert.match(js, /prefersReducedMotion/);
});

test('mobile homepage hero uses layered composition instead of plain stacking', () => {
  const css = read('docs/site.css');

  assert.match(css, /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.hero-grid\s*\{[\s\S]*?grid-template-areas:\s*"copy" "visual";/);
  assert.match(css, /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.hero-copy\s*\{[\s\S]*?grid-area:\s*copy;[\s\S]*?z-index:\s*2;/);
  assert.match(css, /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.hero-visual\s*\{[\s\S]*?grid-area:\s*visual;[\s\S]*?margin-top:\s*calc\(var\(--space-lg\) \* -1\);/);
  assert.match(css, /@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*?\.hero-visual\s*\{[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*?\.hero-mockup\s*\{[\s\S]*?width:\s*calc\(100% \+ 40px\);[\s\S]*?transform:\s*translateX\(-20px\);/);
  assert.match(css, /@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*?\.mockup-interface\s*\{[\s\S]*?flex-direction:\s*row;/);
});
