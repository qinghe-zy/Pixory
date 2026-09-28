const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Android release builds include physical-device ABIs and exclude emulator ABIs', () => {
  const gradle = read('android/app/build.gradle');

  assert.match(
    gradle,
    /release\s*\{[\s\S]*?ndk\s*\{\s*abiFilters\s+['"]armeabi-v7a['"],\s*['"]arm64-v8a['"]\s*\}/,
  );
  assert.doesNotMatch(
    gradle.match(/release\s*\{[\s\S]*?\n\s*\}/)?.[0] ?? '',
    /x86(?:_64)?/,
  );
});

test('release packaging script cleans first and rejects simulator native libraries', () => {
  const script = read('scripts/build-android-release.ps1');
  const packageJson = JSON.parse(read('package.json'));

  assert.match(script, /gradlew\.bat[\s\S]*clean/);
  assert.match(script, /gradlew\.bat[\s\S]*assembleRelease/);
  assert.match(script, /armeabi-v7a,arm64-v8a/);
  assert.match(script, /lib\/(?:x86|x86_64)\//);
  assert.match(script, /throw\s+"Release APK contains emulator ABI/);
  assert.match(script, /output[\\/]release/);
  assert.equal(
    packageJson.scripts['release:android'],
    'powershell -ExecutionPolicy Bypass -File scripts/build-android-release.ps1',
  );
  const staleNativeCleanIndex = script.indexOf(
    '[System.IO.Directory]::Delete("\\\\?\\$nativeBuildDir", $true)',
  );
  const gradleCleanIndex = script.indexOf('& $gradleWrapper clean');
  assert.ok(staleNativeCleanIndex >= 0, 'script must clear stale generated CMake state');
  assert.ok(staleNativeCleanIndex < gradleCleanIndex, 'stale CMake state must be cleared before Gradle clean');
});
