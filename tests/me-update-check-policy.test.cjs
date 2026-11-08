const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('updateCheckService exports checkAllAppUpdates and getAppVersion', () => {
  const source = read('src/services/updateCheckService.ts');
  assert.match(source, /export async function checkAllAppUpdates/);
  assert.match(source, /export function getAppVersion/);
  assert.match(source, /Updates\.checkForUpdateAsync/);
  assert.match(source, /checkForAppUpdate/);
  assert.match(source, /isCheckUpdateInProgress/);
});

test('AboutScreen and MeScreen share the checkAllAppUpdates service logic', () => {
  const aboutSource = read('src/screens/AboutScreen.tsx');
  const meSource = read('src/screens/MeScreen.tsx');

  assert.match(aboutSource, /checkAllAppUpdates/);
  assert.match(meSource, /checkAllAppUpdates/);
});

test('MeScreen renders check-updates at the bottom with version number in both minimalist and classic modes', () => {
  const meSource = read('src/screens/MeScreen.tsx');

  // Minimalist mode
  assert.match(meSource, /title="检查更新"/);
  assert.match(meSource, /valueText=\{`v\$\{version\}`\}/);
  assert.match(meSource, /handleEntryPress\("check-updates"\)/);
  assert.match(meSource, /accessibilityLabel=\{valueText \? `\$\{title\}，\$\{valueText\}` : title\}/);

  // Classic mode
  assert.match(meSource, /<Text style=\{styles\.systemListTitle\}>检查更新<\/Text>/);
  assert.match(meSource, /<Text style=\{styles\.systemListValue\}>v\{version\}<\/Text>/);
  assert.match(meSource, /accessibilityLabel=\{`检查更新，当前版本 v\$\{version\}`\}/);
  assert.match(meSource, /cloud-download-outline/);
});
