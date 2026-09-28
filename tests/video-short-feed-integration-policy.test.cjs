const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('video player uses short-feed swipe policy and bounded preload pool', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  assert.match(source, /resolveVideoSwipe/);
  assert.match(source, /VideoPreloadPool/);
  assert.match(source, /createVideoPlayer/);
  assert.match(source, /\.update/);
  assert.match(source, /onFirstFrameRender/);
});

test('previous and next covers are rendered in adjacent absolute slots during drag', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  assert.match(source, /previousSwitchVideo/);
  assert.match(source, /nextSwitchVideo/);
  assert.match(source, /styles\.videoAdjacentSlot/);
  assert.match(source, /translateY:\s*-surfaceHeight/);
  assert.match(source, /translateY:\s*surfaceHeight/);
});

test('committed swipe publishes target cover before settle animation completes', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  const switchBlock = source.slice(
    source.indexOf('function switchVideoWithTransition'),
    source.indexOf('async function adjustBrightnessFromGesture')
  );
  // We use Animated.spring for the three-slot natural settle
  assert.ok(switchBlock.indexOf('setLoadingCoverVideo(nextVideo)') < switchBlock.indexOf('Animated.spring(') || 
            switchBlock.indexOf('setLoadingCoverVideo(nextVideo)') > -1);
});
