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
  assert.match(source, /videoPreloadPool\.update/);
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

test('queue panel is virtualized and no longer maps an unbounded ScrollView', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  assert.match(source, /<FlatList/);
  assert.match(source, /renderQueueItem/);
  assert.doesNotMatch(source, /<ScrollView[\s\S]{0,300}\{queue\.map/);
  assert.match(source, /findCursorPageAroundId/);
  assert.match(source, /findVideoQueuePageByIpId/);
  assert.doesNotMatch(source, /findQueueVideosByIpId/);
});

test('committed swipe publishes target cover before settle animation completes', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  const switchBlock = source.slice(
    source.indexOf('function switchVideoWithTransition'),
    source.indexOf('async function adjustBrightnessFromGesture')
  );
  assert.ok(switchBlock.indexOf('setLoadingCoverVideo(nextVideo)') < switchBlock.indexOf('Animated.timing'));
});
