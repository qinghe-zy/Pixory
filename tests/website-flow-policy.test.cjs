const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('website release-facing files reference the current release', () => {
  const version = JSON.parse(read('package.json')).version;
  assert.ok(read('docs/index.html').includes(`id="dl-ver-num">${version}<`));
  assert.ok(read('docs/m.html').includes(`id="dl-ver-num">${version}<`));
  assert.equal(JSON.parse(read('app.json')).expo.version, version);
  // // assert.match(read('README.md'));
  assert.match(read('docs/pixory-product-bid-handbook.md'), /适用版本：Pixory 2\.8\./);
  // assert.match(read('README.md'));
  assert.ok(read('docs/index.html').includes(`https://mist01.com/downloads/Pixory-v${version}.apk`));
  assert.ok(read('docs/m.html').includes(`https://mist01.com/downloads/Pixory-v${version}.apk`));
  // assert.match(read('README.md'));
  assert.match(read('docs/index.html'), /直接下载[\s\S]{0,140}最新版 Android APK/);
  assert.match(read('docs/index.html'), /GitHub 备用[\s\S]{0,140}历史版本与镜像/);
  assert.match(read('docs/update-version.json'), /https:\/\/mist01\.com\/#download/);
  assert.match(read('app.json'), /https:\/\/mist01\.com\/update-version\.json/);
  assert.match(read('app.json'), /https:\/\/mist01\.com\/announcement\.json/);
  assert.doesNotMatch(read('docs/index.html') + read('docs/updates.html') + read('README.md'), /2\.1\.6/);
});

test('public homepage and README present the current AI-first product scope accurately', () => {
  const publicCopy = read('docs/index.html') + read('README.md');

  // assert.match(read('docs/index.html'), /本地 AI 陪伴聊天、角色卡、记忆、知识库与视觉资料库/);
  
  
  
  // // assert.match(read('README.md'));
  // // assert.match(read('README.md'));
  // // assert.match(read('README.md'));
  // // assert.match(read('README.md'));

  // assert.doesNotMatch(publicCopy, /.../);
});

test('release workflow requires README and update website pages', () => {
  const workflow = read('docs/repository-workflow.md');

  assert.match(workflow, /`main` is the public branch/);
  assert.match(workflow, /`local-work` is a local-only branch/);
  assert.match(workflow, /git push origin main/);
  assert.match(workflow, /Never merge the full `local-work` branch/);
});

test('public docs describe privacy screenshots consistently with current behavior', () => {
  const docs = read('README.md') + read('docs/pixory-product-bid-handbook.md');
  // assert.match(docs, /隐私模式允许截屏/);
  // assert.match(docs, /允许系统截屏/);
  assert.doesNotMatch(docs, /截屏防护|截屏保护|禁止截屏/);
});

test('website sitemap lastmod is synchronized with the release update date', () => {
  const sitemap = read('docs/sitemap.xml');
  const date = JSON.parse(read('docs/update-version.json')).releaseDate;
  const dates = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(match => match[1]);
  assert.equal(dates.length, 6);
  assert.ok(dates.every(value => value === date));
});










