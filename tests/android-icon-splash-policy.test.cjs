const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const splashBackground = '#4a7bf7';
const splashIcon = './icons/551977a0-2e08-4e2e-95cf-7644f680767d.png';
const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

test('uses chat artwork as a standard Android launcher icon', () => {
  const config = readJson('app.json').expo;
  assert.equal(config.icon, './icons/02_右上_蓝发女孩.png');
  assert.equal(config.android.adaptiveIcon, undefined);

  const manifest = fs.readFileSync(
    path.join(root, 'android/app/src/main/AndroidManifest.xml'),
    'utf8',
  );
  assert.equal(manifest.includes('android:roundIcon='), false);

  for (const density of densities) {
    assert.equal(
      fs.existsSync(path.join(root, `android/app/src/main/res/mipmap-${density}/ic_launcher.webp`)),
      true,
    );
  }

  assert.equal(
    fs.existsSync(path.join(root, 'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml')),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(root, 'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml')),
    false,
  );
});

test('configures Android 12 splash from the chat artwork', () => {
  const packageJson = readJson('package.json');
  const config = readJson('app.json').expo;
  const splashPlugin = config.plugins.find(
    (entry) => Array.isArray(entry) && entry[0] === 'expo-splash-screen',
  );

  assert.match(packageJson.dependencies['expo-splash-screen'] ?? '', /^~31\./);
  assert.deepEqual(splashPlugin, [
    'expo-splash-screen',
    {
      backgroundColor: splashBackground,
      image: splashIcon,
      imageWidth: 192,
      resizeMode: 'contain',
    },
  ]);

  const styles = fs.readFileSync(
    path.join(root, 'android/app/src/main/res/values/styles.xml'),
    'utf8',
  );
  assert.equal(styles.includes('parent="Theme.SplashScreen"'), true);
  assert.equal(styles.includes('windowSplashScreenAnimatedIcon'), true);
});
