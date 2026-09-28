const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('keeps the native splash until the first React surface is ready without a text loading interstitial', () => {
  const app = read('App.tsx');

  assert.match(app, /import \* as SplashScreen from 'expo-splash-screen'/);
  assert.match(app, /SplashScreen\.preventAutoHideAsync\(\)/);
  assert.match(app, /SplashScreen\.hideAsync\(\)/);
  assert.equal(app.includes('正在初始化 Pixory 本地数据库与文件目录...'), false);
  assert.match(app, /styles\.startupFallback/);
});

test('loads diary-only fonts after the startup critical path', () => {
  const app = read('App.tsx');
  const criticalFonts = app.match(/useFonts\(\{([\s\S]*?)\}\);/);

  assert.ok(criticalFonts, 'critical useFonts block must exist');
  assert.equal(criticalFonts[1].includes('DiaryHandwriting'), false);
  assert.equal(criticalFonts[1].includes('DiaryKai'), false);
  assert.equal(criticalFonts[1].includes('PlayfairDisplay_400Regular'), false);
  assert.match(app, /Font\.loadAsync\(\{[\s\S]*PlayfairDisplay_400Regular,[\s\S]*DiaryHandwriting:[\s\S]*DiaryKai:/);
  assert.match(app, /InteractionManager\.runAfterInteractions/);
});

test('initializes independent startup storage and database work in parallel', () => {
  const app = read('App.tsx');
  assert.match(app, /await Promise\.all\(\[\s*ensureAppDirectories\(\),\s*initDatabase\(\),?\s*\]\)/);
});

test('warms root tabs incrementally and passes active visibility into animated roots', () => {
  const app = read('App.tsx');

  assert.equal(
    app.includes("setRenderedTabs(new Set(['home', 'organize', 'ai', 'me']))"),
    false,
  );
  assert.match(app, /buildRootTabWarmupOrder\(/);
  assert.match(app, /<HomeLibraryScreen[\s\S]*?isActive=\{currentTab === 'home'\}/);
  assert.match(app, /<AiHomeScreen[\s\S]*?isActive=\{currentTab === 'ai'\}/);
  assert.match(app, /<MeScreen[\s\S]*?isActive=\{currentTab === 'me'\}/);
});

test('cancels infinite decorative animations while their root page is hidden', () => {
  const home = read('src/screens/HomeLibraryScreen.tsx');
  const me = read('src/screens/MeScreen.tsx');
  const aiHome = read('src/screens/AiHomeScreen.tsx');
  const spectrum = read('src/components/ai/AiActiveSpectrum.tsx');

  assert.match(home, /function HomeBrandHeader\(\{ isActive \}/);
  assert.match(home, /cancelAnimation\(timeT\)/);
  assert.match(me, /function ProfileMemoryCore\(\{ isActive \}/);
  assert.match(me, /cancelAnimation\(rot1\)/);
  assert.match(aiHome, /<AiActiveSpectrum active=\{isActive\}/);
  assert.match(spectrum, /active\?: boolean/);
  assert.match(spectrum, /cancelAnimation\(theta\)/);
});
