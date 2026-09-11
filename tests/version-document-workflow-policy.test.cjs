const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('version document workflow keeps local archives flat, additive, and outside git', () => {
  const ignore = read('.gitignore');
  const workflow = read('scripts/version-document-workflow.ps1');
  const rootPrd = read('PRD.md');

  assert.match(ignore, /^\/版本文档\/$/m);
  assert.match(ignore, /^\/?LOCAL_UPDATES_LOG\.md$/m);
  assert.match(workflow, /ValidateSet\('Status',[\s\S]{0,160}'PreviewRelease',[\s\S]{0,120}'FinalizeRelease',[\s\S]{0,80}'MigrateLegacy'\)/);
  assert.match(workflow, /InitializeCycle/);
  assert.match(workflow, /AppendUpdate/);
  assert.match(workflow, /ValidateCurrent/);
  for (const required of ['PRD.md', 'TDD.md', 'Test-Report.md', 'Release-Notes-External.md', 'Release-Notes-Internal.md']) {
    assert.match(workflow, new RegExp(required.replace('.', '\\.'), 'i'));
  }
  assert.match(workflow, /历史文档/);
  assert.match(workflow, /版本更新说明/);
  assert.match(workflow, /待办/);
  assert.match(workflow, /Get-ChildItem[^\n]*-File/);
  assert.doesNotMatch(workflow, /feature-matrix\.md[\s\S]{0,160}(Copy-Item|Move-Item)/i);
  assert.doesNotMatch(workflow, /待办[\s\S]{0,160}Move-Item/);
  assert.match(workflow, /Refusing to overwrite|拒绝覆盖/);
  assert.match(workflow, /alreadyArchived|已归档/);
  assert.match(workflow, /\$indexPath = if \(\$group\.Name -eq \$currentDir\)[\s\S]{0,100}\$currentIndexPath/);
  assert.match(workflow, /当前有效内容/);
  assert.match(workflow, /需求冲突/);
  assert.match(rootPrd, /# Pixory 总体产品需求文档/);
  assert.match(rootPrd, /## 0\. 文档基础/);
  assert.match(rootPrd, /## \d+\. 版本路线图/);
  assert.match(rootPrd, /PIXORY_ROADMAP_START/);
});

test('Android release previews documents before Gradle and finalizes only after APK copy', () => {
  const build = read('scripts/build-android-release.ps1');
  const handoff = read('scripts/release-handoff.ps1');
  const previewIndex = build.indexOf("-Action PreviewRelease");
  const cleanIndex = build.indexOf('& $gradleWrapper clean');
  const copyIndex = build.indexOf('Copy-Item -LiteralPath $builtApk');
  const finalizeIndex = build.indexOf("-Action FinalizeRelease");

  assert.ok(previewIndex >= 0, 'release must preview the local documentation plan');
  assert.ok(previewIndex < cleanIndex, 'documentation preview must happen before Gradle work');
  assert.ok(finalizeIndex > copyIndex, 'documentation finalization must happen after the APK is copied');
  assert.match(build, /-ApkPath \$outputApk/);
  assert.match(build, /release-handoff\.ps1/);
  assert.match(build, /当前分支为/);
  assert.match(handoff, /Release-Notes-External\.md/);
  assert.match(handoff, /Release-Notes-Internal\.md/);
  assert.match(handoff, /gh @releaseArgs|gh release create/);
  assert.match(handoff, /gh release upload/);
  assert.match(handoff, /PRD\.md/);
});

test('successful finalization archives one flat version and opens the next patch cycle', { skip: process.platform !== 'win32' }, () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'pixory-version-docs-'));
  const current = path.join(fixture, '版本文档', '当前版本文档');
  const todo = path.join(fixture, '版本文档', '待办');
  fs.mkdirSync(current, { recursive: true });
  fs.mkdirSync(todo, { recursive: true });
  fs.writeFileSync(path.join(current, '版本区间.json'), JSON.stringify({ fromVersion: '1.2.3', toVersion: '1.2.4' }));
  fs.writeFileSync(path.join(current, '版本过程索引.md'), '# index\n');
  for (const file of ['PRD.md', 'TDD.md', 'Test-Report.md', 'Release-Notes-External.md', 'Release-Notes-Internal.md']) {
    const body = file === 'PRD.md'
      ? `# 产品需求文档（PRD）\n\n## 0. 文档基础\n\n### 0.2 修订历史\n\n## 1. 项目概况\n\n${'当前有效业务规则。'.repeat(40)}\n\n## 变更记录\n<!-- PIXORY_CHANGE_RECORD -->\n`
      : `# ${file}\n\n## 当前有效内容\n\n## 变更记录\n<!-- PIXORY_CHANGE_RECORD -->\n`;
    fs.writeFileSync(path.join(current, file), body);
  }
  fs.writeFileSync(path.join(todo, '性能优化待办.md'), '# todo\n');
  fs.writeFileSync(path.join(fixture, 'LOCAL_UPDATES_LOG.md'), '# log\n');
  const apk = path.join(fixture, 'Pixory-v1.2.4.apk');
  fs.writeFileSync(apk, 'apk-fixture');

  const script = path.join(root, 'scripts', 'version-document-workflow.ps1');
  const args = [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-Action', 'FinalizeRelease', '-ReleasedVersion', '1.2.4',
    '-RepositoryRoot', fixture, '-ApkPath', apk, '-Commit', 'abc1234', '-Tag', 'v1.2.4',
  ];
  const first = spawnSync('powershell', args, { encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr || first.stdout);

  const history = path.join(fixture, '版本文档', '历史文档', 'v1.2.4');
  assert.deepEqual(fs.readdirSync(history).sort(), ['PRD.md', 'TDD.md', 'Test-Report.md', 'Release-Notes-External.md', 'Release-Notes-Internal.md', '版本区间.json', '版本过程索引.md'].sort());
  assert.equal(fs.readdirSync(history, { withFileTypes: true }).some((entry) => entry.isDirectory()), false);
  assert.match(fs.readFileSync(path.join(history, '版本过程索引.md'), 'utf8'), /PIXORY_FINAL_VERSION:v1\.2\.4/);
  assert.match(fs.readFileSync(path.join(fixture, '版本文档', '版本更新说明', 'Pixory-v1.2.4-版本更新说明.md'), 'utf8'), /最终版本：v1\.2\.4/);
  assert.equal(fs.existsSync(path.join(todo, '性能优化待办.md')), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(current, '版本区间.json'), 'utf8')), { fromVersion: '1.2.4', toVersion: '1.2.5' });
  assert.match(fs.readFileSync(path.join(fixture, 'LOCAL_UPDATES_LOG.md'), 'utf8'), /1\.2\.4 → 1\.2\.5/);
  assert.match(fs.readFileSync(path.join(fixture, 'PRD.md'), 'utf8'), /PIXORY_ROADMAP_START/);
  assert.match(fs.readFileSync(path.join(fixture, 'PRD.md'), 'utf8'), /当前后续迭代：v1\.2\.5/);

  const second = spawnSync('powershell', args, { encoding: 'utf8' });
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.match(second.stdout, /已归档/);
  assert.equal(fs.readdirSync(path.join(fixture, '版本文档', '版本更新说明')).length, 1);
});

test('cycle initialization and update append create the required evolving document set', { skip: process.platform !== 'win32' }, () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'pixory-version-cycle-'));
  const current = path.join(fixture, '版本文档', '当前版本文档');
  fs.mkdirSync(current, { recursive: true });
  fs.writeFileSync(path.join(current, '版本区间.json'), JSON.stringify({ fromVersion: '2.8.5', toVersion: '2.8.6' }));
  fs.writeFileSync(path.join(current, '版本过程索引.md'), '# index\n');
  fs.writeFileSync(path.join(fixture, 'LOCAL_UPDATES_LOG.md'), '# log\n');
  const script = path.join(root, 'scripts', 'version-document-workflow.ps1');
  const base = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-RepositoryRoot', fixture];
  const init = spawnSync('powershell', [...base, '-Action', 'InitializeCycle'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr || init.stdout);
  for (const file of ['PRD.md', 'TDD.md', 'Test-Report.md', 'Release-Notes-External.md', 'Release-Notes-Internal.md']) {
    assert.equal(fs.existsSync(path.join(current, file)), true, file);
  }
  const append = spawnSync('powershell', [...base, '-Action', 'AppendUpdate', '-EventType', 'HotUpdate', '-Summary', '修复流式恢复'], { encoding: 'utf8' });
  assert.equal(append.status, 0, append.stderr || append.stdout);
  assert.match(fs.readFileSync(path.join(fixture, 'LOCAL_UPDATES_LOG.md'), 'utf8'), /修复流式恢复/);
  assert.match(fs.readFileSync(path.join(current, '版本过程索引.md'), 'utf8'), /HotUpdate/);
});
