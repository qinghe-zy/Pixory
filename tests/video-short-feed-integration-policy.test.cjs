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

test('committed swipe uses adjacent covers and waits for the first frame', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  const switchBlock = source.slice(
    source.indexOf('function switchVideoWithTransition'),
    source.indexOf('async function adjustBrightnessFromGesture')
  );
  assert.match(switchBlock, /Animated\.spring/);
  assert.match(source, /styles\.videoAdjacentSlot/);
  assert.match(source, /onFirstFrameRender/);
});

test('video view keeps native props stable during progress updates', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  assert.match(source, /const VIDEO_FULLSCREEN_OPTIONS = \{ enable: false \} as const/);
  assert.match(source, /fullscreenOptions=\{VIDEO_FULLSCREEN_OPTIONS\}/);
  assert.match(source, /onFirstFrameRender=\{handleVideoFirstFrameRender\}/);
  assert.doesNotMatch(source, /fullscreenOptions=\{\{ enable: false \}\}/);
  assert.doesNotMatch(source, /onFirstFrameRender=\{\(\) =>/);
});

test('queue updates do not replace the active video source', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  const sourceEffect = source.slice(
    source.indexOf('useEffect(() => {\n    if (!sourceUri) {'),
    source.indexOf('useEffect(() => {\n    player.loop')
  );
  assert.doesNotMatch(sourceEffect, /queue\.length, showToast/);
});

test('vertical gesture responder tracks resolved adjacent videos', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  const responderBlock = source.slice(
    source.indexOf('const surfacePanResponder = useMemo('),
    source.indexOf('async function handleSaveLocal')
  );
  assert.match(responderBlock, /nextSwitchVideo/);
  assert.match(responderBlock, /previousSwitchVideo/);
});

test('scrub feedback stays above the anchored progress controls', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  const bottomBarStart = source.indexOf('<View style={[styles.bottomBar');
  const bottomBar = source.slice(
    bottomBarStart,
    source.indexOf('</View>\n        </Animated.View>', bottomBarStart)
  );
  assert.equal(bottomBar.indexOf('scrubBubbleOverlay'), -1);
  assert.match(source, /scrubBubbleOverlay:[\s\S]*position: 'absolute'/);
  assert.match(source, /<View\s*\n\s*pointerEvents="none"[\s\S]*styles\.scrubBubbleOverlay/);
});

test('video rendering uses one stable texture surface for transformed feed transitions', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  assert.match(source, /const VIDEO_SURFACE_TYPE = 'textureView' as const/);
  assert.match(source, /surfaceType=\{VIDEO_SURFACE_TYPE\}/);
  assert.match(source, /player=\{player\}[\s\S]*surfaceType=\{VIDEO_SURFACE_TYPE\}/);
});

test('queue uses a bounded virtualized list and transition callbacks are token guarded', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  assert.match(source, /<FlatList[\s\S]*initialNumToRender=\{4\}/);
  assert.match(source, /removeClippedSubviews/);
  assert.match(source, /const transitionToken = switchTransitionTokenRef\.current \+ 1/);
  assert.match(source, /if \(transitionToken !== switchTransitionTokenRef\.current\)/);
  assert.doesNotMatch(source, /queue\.map\(\(item\) => \(\s*<Pressable/);
});
