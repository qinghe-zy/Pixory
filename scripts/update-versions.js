const fs = require('node:fs');
const path = require('node:path');

const VERSION = '\\d+\\.\\d+\\.\\d+(?:\\.\\d+)?';
const compare = (a, b) => {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const delta = (left[i] || 0) - (right[i] || 0);
    if (delta) return Math.sign(delta);
  }
  return 0;
};

// Validate every file and anchor before writing any of the planned changes.
function planVersions(root, target, date) {
  const plan = new Map();
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const pkg = JSON.parse(read('package.json'));
  const app = JSON.parse(read('app.json'));
  const update = JSON.parse(read('docs/update-version.json'));
  target ||= pkg.version;
  if (!new RegExp(`^${VERSION}$`).test(target)) throw new Error(`Invalid version: ${target}`);
  if (compare(target, pkg.version) < 0 || compare(target, app.expo.version) < 0) throw new Error('Refusing a version downgrade');
  if (!date && target === update.version) date = update.releaseDate || read('README.md').match(/当前版本：[^\r\n]*?(\d{4}-\d{2}-\d{2})/)?.[1];
  date ||= new Date().toLocaleDateString('en-CA');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new Error('Invalid release date');
  const previousCode = Math.max(app.expo.android.versionCode, update.versionCode || 0, update.latestVersionCode || 0);
  const code = Math.max(Number(target.replaceAll('.', '')), previousCode + (compare(target, app.expo.version) > 0 ? 1 : 0));
  if (!Number.isSafeInteger(code) || code > 2100000000) throw new Error('Android versionCode is out of range');
  const json = (file, value) => plan.set(file, JSON.stringify(value, null, 2) + '\n');
  const edit = (file, rules) => {
    let text = read(file);
    for (const [pattern, replacement] of rules) {
      if (!new RegExp(pattern.source, pattern.flags.replace('g', '')).test(text)) {
        throw new Error(`${file}: missing required version anchor ${pattern}`);
      }
      text = text.replace(pattern, replacement);
    }
    plan.set(file, text);
  };
  pkg.version = target;
  app.expo.version = app.expo.runtimeVersion = target;
  app.expo.android.versionCode = code;
  update.version = update.latestVersion = target;
  update.versionCode = update.latestVersionCode = code;
  update.releaseDate = date;
  update.message = update.message.replace(new RegExp(`Pixory v?${VERSION}`, 'g'), `Pixory ${target}`);
  json('package.json', pkg);
  json('app.json', app);
  json('docs/update-version.json', update);
  edit('src/services/updateCheckService.ts', [
    [/FALLBACK_CURRENT_VERSION = '[^']+'/g, `FALLBACK_CURRENT_VERSION = '${target}'`],
    [/FALLBACK_CURRENT_VERSION_CODE = \d+/g, `FALLBACK_CURRENT_VERSION_CODE = ${code}`]
  ]);
  edit('src/screens/AboutScreen.tsx', [[/expoConfig\?\.version \?\? '[^']+'/g, `expoConfig?.version ?? '${target}'`]]);
  edit('src/screens/ProductDocumentationScreen.tsx', [[/expoConfig\?\.version \?\? '[^']+'/g, `expoConfig?.version ?? '${target}'`]]);
  edit('android/app/build.gradle', [
    [/versionCode \d+/g, `versionCode ${code}`],
    [/versionName "[^"]+"/g, `versionName "${target}"`],
    [/outputFileName = "Pixory-v[^"\r\n]+\.apk"/g, `outputFileName = "Pixory-v${target}-local-release.apk"`]
  ]);
  edit('android/app/src/main/res/values/strings.xml', [[/(<string name="expo_runtime_version">)[^<]+/g, `$1${target}`]]);
  for (const file of ['README.md', 'docs/README.md']) {
    edit(file, [[/当前版本：[^（\r\n]+（\d{4}-\d{2}-\d{2}/g, `当前版本：${target}（${date}`]]);
  }
  for (const file of ['docs/index.html', 'docs/m.html']) {
    edit(file, [
    [/(id="dl-ver-num">)[^<]+/g, (_, prefix) => prefix + target],
      [/https:\/\/mist01\.com\/downloads\/Pixory-v[\d.]+\.apk/g, `https://mist01.com/downloads/Pixory-v${target}.apk`],
      [/data\.latestVersion \|\| data\.version \|\| '[^']+'/g, `data.latestVersion || data.version || '${target}'`]
    ]);
  }
  edit('docs/manual.html', [
    [/(class="app-version">)v[^<]+/g, (_, prefix) => prefix + 'v' + target],
    [/currentDoc\.path \+ '\?v=[^']+'/g, `currentDoc.path + '?v=${target}'`]
  ]);
  edit('docs/sitemap.xml', [[/<lastmod>[^<]+<\/lastmod>/g, `<lastmod>${date}</lastmod>`]]);
  edit('docs/feature-matrix.md', [
    [/最后更新：\d{4}-\d{2}-\d{2}/, `最后更新：${date}`],
    [/适用版本：Pixory [\d.]+/, `适用版本：Pixory ${target}`]
  ]);
  edit('docs/pixory-product-bid-handbook.md', [[/适用版本：Pixory [\d.]+/, `适用版本：Pixory ${target}`]]);
  const handbookPath = 'docs/pixory-product-bid-handbook.md';
  const publicHandbook = plan.get(handbookPath);
  const row = `| ${target} | ${date} | ${update.releaseNotes.replace(/[\r\n|]+/g, ' ')} |`;
  const currentRow = new RegExp(`^\\| ${target.replaceAll('.', '\\.')} \\|[^\\r\\n]*`, 'm');
  if (currentRow.test(publicHandbook)) plan.set(handbookPath, publicHandbook.replace(currentRow, row));
  else {
    if (!/^\| [\d.]+ \|/m.test(publicHandbook)) throw new Error(`${handbookPath}: missing release history table`);
    plan.set(handbookPath, publicHandbook.replace(/^(?=\| [\d.]+ \|)/m, row + '\n'));
  }
  // Decode the exported JSON string to avoid corrupting embedded Markdown escapes.
  const handbookFile = 'src/content/handbookMarkdown.ts';
  const embedded = read(handbookFile).match(/^export const HANDBOOK_MARKDOWN = ("[\s\S]*");\s*$/);
  if (!embedded) throw new Error(`${handbookFile}: unsupported export format`);
  let handbook = JSON.parse(embedded[1]);
  if (!/适用版本：Pixory [\d.]+/.test(handbook) || !/最后更新：\d{4}-\d{2}-\d{2}/.test(handbook)) {
    throw new Error(`${handbookFile}: missing version/date header`);
  }
  handbook = handbook.replace(/适用版本：Pixory [\d.]+/, `适用版本：Pixory ${target}`)
    .replace(/最后更新：\d{4}-\d{2}-\d{2}/, `最后更新：${date}`);
  plan.set(handbookFile, `export const HANDBOOK_MARKDOWN = ${JSON.stringify(handbook)};\n`);
  for (const file of ['docs/download.html', 'docs/updates.html']) {
    if (!read(file).includes('url=index.html')) throw new Error(`${file}: review changed download route`);
  }
  // Refresh release notices from current release copy; preserve independent notices.
  const announcement = JSON.parse(read('docs/announcement.json'));
  if (/^Pixory v?[\d.]+ 正式发布$/.test(announcement.title)) {
    Object.assign(announcement, {
      id: `pixory-${target}-release-${date.replaceAll('-', '')}`,
      version: target, title: `Pixory v${target} 正式发布`,
      message: update.releaseNotes, content: update.message, detailLines: update.detailLines
    });
    json('docs/announcement.json', announcement);
  }
  const changes = [...plan].filter(([file, text]) => read(file).replaceAll('\r\n', '\n') !== text.replaceAll('\r\n', '\n'));
  return { version: target, code, date, changes };
}

function synchronize(root, version, { check = false, date } = {}) {
  const result = planVersions(root, version, date);
  if (check && result.changes.length) throw new Error(`Version drift:\n${result.changes.map(([file]) => file).join('\n')}`);
  if (!check) for (const [file, content] of result.changes) fs.writeFileSync(path.join(root, file), content);
  return result;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const check = args.includes('--check');
    const dateIndex = args.indexOf('--date');
    const date = dateIndex < 0 ? undefined : args.splice(dateIndex, 2)[1];
    const versions = args.filter(arg => arg !== '--check');
    if (versions.length > 2) throw new Error('Usage: node scripts/update-versions.js [oldVersion] [version] [--check] [--date YYYY-MM-DD]');
    const result = synchronize(path.resolve(__dirname, '..'), versions.at(-1), { check, date });
    console.log(`${check ? 'Verified' : 'Synchronized'} ${result.version} (Android ${result.code}, ${result.date}); ${result.changes.length} files changed`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { planVersions, synchronize };
