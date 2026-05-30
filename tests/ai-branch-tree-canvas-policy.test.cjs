const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readJson = (file) => JSON.parse(read(file));

test('branch tree canvas dependencies are installed through the Expo-compatible stack', () => {
  const pkg = readJson('package.json');

  assert.match(pkg.dependencies['react-native-gesture-handler'] ?? '', /\d/);
  assert.match(pkg.dependencies['react-native-reanimated'] ?? '', /\d/);
  assert.match(pkg.dependencies['react-native-worklets'] ?? '', /\d/);
  assert.match(pkg.dependencies['react-native-svg'] ?? '', /\d/);
});

test('gesture handler is initialized before the app registers and wraps the root view', () => {
  const index = read('index.ts');
  const app = read('App.tsx');

  assert.match(index, /^import 'react-native-gesture-handler';/);
  assert.match(app, /import \{ GestureHandlerRootView \} from 'react-native-gesture-handler';/);
  assert.match(app, /<GestureHandlerRootView style=\{styles\.gestureRoot\}>/);
  assert.match(app, /gestureRoot:\s*\{\s*flex:\s*1\s*\}/);
});
