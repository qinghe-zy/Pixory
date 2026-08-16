const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('website release-facing files reference the current 2.8.1 release', () => {
  assert.match(read('docs/index.html'), /当前版本：2\.8\.1/);
  assert.match(read('docs/m.html'), /当前版本：2\.8\.1/);
  assert.match(read('app.json'), /"version": "2\.8\.1"/);
  assert.match(read('README.md'), /当前版本 `2\.8\.1`/);
  assert.match(read('docs/pixory-product-bid-handbook.md'), /适用版本：Pixory 2\.8\.1/);
  assert.match(read('README.md'), /https:\/\/mist01\.com\/downloads\/Pixory-v2\.8\.1\.apk/);
  assert.match(read('docs/index.html'), /https:\/\/mist01\.com\/downloads\/Pixory-v2\.8\.1\.apk/);
  assert.match(read('docs/m.html'), /https:\/\/mist01\.com\/downloads\/Pixory-v2\.8\.1\.apk/);
  assert.match(read('package.json'), /"version": "2\.8\.1"/);
  assert.match(read('README.md'), /https:\/\/github\.com\/qinghe-zy\/Pixory\/releases\/latest/);
  assert.match(read('docs/index.html'), /https:\/\/github\.com\/qinghe-zy\/Pixory\/releases\/latest/);
  assert.match(read('docs/index.html'), /直接下载[\s\S]{0,140}最新版 Android APK/);
  assert.match(read('docs/index.html'), /GitHub 备用[\s\S]{0,140}历史版本与镜像/);
  assert.match(read('docs/update-version.json'), /https:\/\/mist01\.com\/#download/);
  assert.match(read('app.json'), /https:\/\/mist01\.com\/update-version\.json/);
  assert.match(read('app.json'), /https:\/\/mist01\.com\/announcement\.json/);
  assert.doesNotMatch(read('docs/index.html') + read('docs/updates.html') + read('README.md'), /2\.1\.6/);
});

test('public homepage and README present the current AI-first product scope accurately', () => {
  const publicCopy = read('docs/index.html') + read('README.md');

  assert.match(read('docs/index.html'), /本地 AI 陪伴聊天、角色卡、记忆、知识库与视觉资料库/);
  
  
  
  assert.match(read('README.md'), /陪伴型 AI 聊天为核心/);
  assert.match(read('README.md'), /深度记忆/);
  assert.match(read('README.md'), /分支对话/);
  assert.match(read('README.md'), /多模型供应商但数据边界清楚/);

  assert.doesNotMatch(publicCopy, /完全不需要联网|聊天内容出不了这块屏幕|纯粹的“Local-first”本地优先应用/);
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
  assert.match(agents, /Do not maintain the old Gitee release path/);
  assert.match(agents, /Do not push release commits or tags to the `gitee` remote/);
  assert.match(agents, /Do not create or update Gitee Releases/);
  assert.doesNotMatch(agents, /GITEE_TOKEN/);
  assert.doesNotMatch(agents, /preflight Gitee Release publishing credentials/);
  assert.match(agents, /app update popup defaults to the official website download section/);
  assert.match(agents, /app\.json` `expo\.extra\.updateCheck\.url` points to `https:\/\/mist01\.com\/update-version\.json`/);
  assert.match(agents, /app\.json` `expo\.extra\.updateCheck\.githubLatestUrl` points to `https:\/\/api\.github\.com\/repos\/qinghe-zy\/Pixory\/releases\/latest`/);
  assert.match(agents, /app\.json` `expo\.extra\.updateCheck\.fallbackDownloadUrl` points to `https:\/\/mist01\.com\/#download`/);
  assert.match(agents, /app\.json` `expo\.extra\.announcement\.url` points to `https:\/\/mist01\.com\/announcement\.json`/);
  assert.match(agents, /docs\/update-version\.json` `downloadUrl` points to `https:\/\/mist01\.com\/#download`/);
  assert.match(agents, /website download section exposes the official server direct APK as the primary action and GitHub Release as the backup\/history action/);
});

test('public docs describe privacy screenshots consistently with current behavior', () => {
  const docs = read('README.md') + read('docs/pixory-product-bid-handbook.md');
  assert.match(docs, /隐私模式允许截屏/);
  assert.match(docs, /允许系统截屏/);
  assert.doesNotMatch(docs, /截屏防护|截屏保护|禁止截屏/);
});

test('website sitemap lastmod is synchronized with the release update date', () => {
  const sitemap = read('docs/sitemap.xml');
  const matches = sitemap.match(/<lastmod>2026-08-16<\/lastmod>/g) ?? [];
  assert.equal(matches.length, 6);
});
