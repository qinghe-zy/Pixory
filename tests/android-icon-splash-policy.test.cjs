const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { Jimp } = require('jimp');

const root = path.resolve(__dirname, '..');
const splashBackground = '#4a7bf7';
const splashIcon = './icons/splash_foreground_compact.png';
const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
const expectedSplashSizes = {
  mdpi: 288,
  hdpi: 432,
  xhdpi: 576,
  xxhdpi: 864,
  xxxhdpi: 1152,
};

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

function alphaAt(image, x, y) {
  return image.bitmap.data[(y * image.bitmap.width + x) * 4 + 3];
}

function nonTransparentBounds(image) {
  let minX = image.bitmap.width;
  let minY = image.bitmap.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.bitmap.height; y += 1) {
    for (let x = 0; x < image.bitmap.width; x += 1) {
      if (alphaAt(image, x, y) === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { maxX, maxY, minX, minY };
}

test('configures Android 12 splash from a transparent safe-area foreground', async () => {
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

  const masterPath = path.join(root, splashIcon.replace('./', ''));
  assert.equal(fs.existsSync(masterPath), true);
  const master = await Jimp.read(masterPath);
  const { width, height } = master.bitmap;
  assert.equal(width, height);
  assert.deepEqual([
    alphaAt(master, 0, 0),
    alphaAt(master, width - 1, 0),
    alphaAt(master, 0, height - 1),
    alphaAt(master, width - 1, height - 1),
  ], [0, 0, 0, 0]);
  const bounds = nonTransparentBounds(master);
  assert.ok(bounds.minX / width >= 0.24);
  assert.ok(bounds.minY / height >= 0.24);
  assert.ok((width - 1 - bounds.maxX) / width >= 0.24);
  assert.ok((height - 1 - bounds.maxY) / height >= 0.24);

  for (const density of densities) {
    const image = await Jimp.read(path.join(
      root,
      `android/app/src/main/res/drawable-${density}/splashscreen_logo.png`,
    ));
    assert.equal(image.bitmap.width, expectedSplashSizes[density]);
    assert.equal(image.bitmap.height, expectedSplashSizes[density]);
    assert.equal(alphaAt(image, 0, 0), 0);
  }
});
