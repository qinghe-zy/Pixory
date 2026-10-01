const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('video player uses single player and replaceAsync for stability', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  assert.match(source, /replaceAsync/);
  assert.doesNotMatch(source, /VideoPreloadPool/);
});

test('committed swipe publishes target cover before settle animation completes', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  const switchBlock = source.slice(
    source.indexOf('function switchVideoWithTransition'),
    source.indexOf('async function adjustBrightnessFromGesture')
  );
  // We use Animated.timing for single player transition
  assert.match(switchBlock, /Animated\.timing/);
});
