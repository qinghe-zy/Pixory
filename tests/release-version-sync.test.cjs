const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { synchronize, planVersions } = require('../scripts/update-versions.js');
const source = path.resolve(__dirname, '..');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pixory-version-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = [
    'package.json', 'app.json', 'docs/update-version.json', 'README.md', 'docs/README.md',
    'src/services/updateCheckService.ts', 'src/screens/AboutScreen.tsx', 'src/screens/ProductDocumentationScreen.tsx', 'android/app/build.gradle',
    'android/app/src/main/res/values/strings.xml', 'docs/index.html', 'docs/m.html', 'docs/manual.html',
    'docs/sitemap.xml', 'docs/feature-matrix.md', 'docs/pixory-product-bid-handbook.md',
    'src/content/handbookMarkdown.ts', 'docs/download.html', 'docs/updates.html', 'docs/announcement.json'
  ];
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(source, file), path.join(root, file));
  }
  // Keep regression fixtures stable when the repository advances to newer releases.
  for (const file of ['package.json', 'app.json', 'docs/update-version.json']) {
    const value = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    const config = value.expo || value;
    config.version = '2.8.9.2';
    if (value.expo) config.android.versionCode = 2892;
    if (file === 'docs/update-version.json') {
      config.latestVersion = config.version;
      config.versionCode = config.latestVersionCode = 2892;
    }
    fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + '\n');
  }
  return root;
}

test('version synchronization repairs stale fields, preserves history, and is idempotent', t => {
  const root = fixture(t);
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const announcement = JSON.stringify({ enabled: true, id: 'maintenance', title: 'Scheduled maintenance', version: '1.0.0' });
  fs.writeFileSync(path.join(root, 'docs/announcement.json'), announcement);
  const historicalRows = text => text.split('\n').filter(line => line.startsWith('|') && !line.startsWith('| 2.8.9.2 |'));
  const history = historicalRows(read('docs/pixory-product-bid-handbook.md'));
  const app = JSON.parse(read('app.json'));
  app.expo.runtimeVersion = '1.0.0';
  fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify(app, null, 2) + '\n');
  assert.throws(() => synchronize(root, undefined, { check: true }), /Version drift/);
  synchronize(root);
  assert.equal(synchronize(root, undefined, { check: true }).changes.length, 0);
  assert.equal(synchronize(root).changes.length, 0);
  assert.equal(read('docs/announcement.json'), announcement);
  assert.deepEqual(historicalRows(read('docs/pixory-product-bid-handbook.md')), history);
});

test('missing required source or anchor prevents any writes', t => {
  for (const missing of [true, false]) {
    const root = fixture(t);
    const before = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
    const file = path.join(root, 'docs/manual.html');
    if (missing) fs.unlinkSync(file);
    else fs.writeFileSync(file, '<html></html>');
    assert.throws(() => synchronize(root, '3.0.0'), /ENOENT|missing required version anchor/);
    assert.equal(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), before);
  }
});

test('Android version code increases across mixed three/four component versions', t => {
  const root = fixture(t);
  synchronize(root, '2.8.9.2');
  const before = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo.android.versionCode;
  const result = synchronize(root, '2.8.10', { date: '2026-10-16' });
  assert.equal(result.code, before + 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'docs/announcement.json'), 'utf8')).version, '2.8.10');
  assert.equal(synchronize(root, '2.8.10').changes.length, 0);
  assert.throws(() => planVersions(root, '2.8.9.2'), /downgrade/);
  assert.throws(() => planVersions(root, 'invalid'), /Invalid version/);
});

test('checked-in release references agree with the canonical version', () => {
  assert.equal(synchronize(source, undefined, { check: true }).changes.length, 0);
});

test('build and publishing always enforce version checks and avoid private/forced pushes', () => {
  const build = fs.readFileSync(path.join(source, 'scripts/build-android-release.ps1'), 'utf8');
  const publish = fs.readFileSync(path.join(source, 'scripts/publish-dual.ps1'), 'utf8');
  assert.ok(build.indexOf('update-versions.js') < build.indexOf('& $gradleWrapper clean'));
  assert.match(build, /--check \$Version/);
  assert.match(publish, /--check \$Version/);
  assert.match(publish, /sync-clean-repo\.ps1/);
  assert.match(publish, /dump badging \$ApkPath/);
  assert.match(publish, /versionCode='\$expectedCode'/);
  assert.match(publish, /push --atomic origin main/);
  assert.doesNotMatch(publish, /push[^\r\n]*(--force|--no-verify|\s-f\b|legacy|local-work)/);
  assert.doesNotMatch(publish, /2\.8\.9\.1/);
});
