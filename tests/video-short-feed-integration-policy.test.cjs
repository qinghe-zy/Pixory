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

test.skip('committed swipe uses adjacent covers and waits for the first frame', () => {
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

test('surface gesture responder delegates through a render-updated ref to avoid stale switch targets', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  const handlersStart = source.indexOf('surfacePanHandlersRef.current = {');
  const responderStart = source.indexOf('const surfacePanResponder = useMemo(');
  const saveLocalStart = source.indexOf('async function handleSaveLocal');
  assert.notEqual(handlersStart, -1);
  assert.notEqual(responderStart, -1);
  assert.ok(handlersStart < responderStart);
  const responderBlock = source.slice(responderStart, saveLocalStart);
  assert.match(responderBlock, /surfacePanHandlersRef\.current/);
  assert.match(responderBlock, /\[\],\s*\);/);
});

test('video switch transition cleans up tracked commit and safety timers on completion and unmount', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  assert.match(source, /switchCommitTimerRef\.current = setTimeout/);
  assert.match(source, /switchSafetyTimerRef\.current = setTimeout/);
  assert.match(source, /clearVideoSwitchTimers\(\)/);
  assert.doesNotMatch(source, /_safetyTimer/);
});

test.skip('scrub feedback stays above the anchored progress controls', () => {
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

test.skip('video rendering uses one stable texture surface for transformed feed transitions', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  assert.match(source, /const VIDEO_SURFACE_TYPE = 'textureView' as const/);
  assert.match(source, /surfaceType=\{VIDEO_SURFACE_TYPE\}/);
  assert.match(source, /player=\{player\}[\s\S]*surfaceType=\{VIDEO_SURFACE_TYPE\}/);
});

test.skip('queue uses a bounded virtualized list and transition callbacks are token guarded', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  assert.match(source, /<FlatList[\s\S]*initialNumToRender=\{4\}/);
  assert.match(source, /removeClippedSubviews/);
  assert.match(source, /const transitionToken = switchTransitionTokenRef\.current \+ 1/);
  assert.match(source, /if \(transitionToken !== switchTransitionTokenRef\.current\)/);
  assert.doesNotMatch(source, /queue\.map\(\(item\) => \(\s*<Pressable/);
});

test('toggling shuffle playback order synchronously initializes session and refreshes displayQueue', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  const toggleStart = source.indexOf('function togglePlaybackOrder()');
  const toggleEnd = source.indexOf('function shouldSwitchVideoFromCenterVerticalGesture');
  assert.notEqual(toggleStart, -1);
  assert.notEqual(toggleEnd, -1);
  const toggleBlock = source.slice(toggleStart, toggleEnd);
  assert.match(toggleBlock, /new VideoShuffleSession/);
  assert.match(toggleBlock, /historyRef\.current = activeVideoId \? \[activeVideoId\] : \[\]/);
  assert.match(toggleBlock, /setShuffleRevision/);
  assert.match(source, /\[queue, playbackOrder, activeVideoId, shuffleRevision\]/);
});

test('brightness and volume gestures use edge-anchored VerticalGestureHud without artificial black screen overlay', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  const hudSource = fs.readFileSync(path.join(root, 'src/components/video/VerticalGestureHud.tsx'), 'utf8');
  assert.match(source, /<VerticalGestureHud/);
  assert.match(source, /verticalGestureTokenRef/);
  assert.match(source, /verticalGestureAnchorDyRef/);
  assert.doesNotMatch(source, /brightnessOverlayOpacity/);
  assert.match(hudSource, /\}, \[isShown, opacityAnim, scaleAnim\]\);/);
});

test('playlist drawer uses lazy-mounted virtualized FlatList and player enforces personal export confirmation', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/VideoPlayerScreen.tsx'), 'utf8');
  assert.match(source, /drawerMounted[\s\S]*<FlatList[\s\S]*getItemLayout=\{getDrawerItemLayout\}/);
  assert.match(source, /<DrawerQueueRow/);
  assert.match(source, /setPersonalExportConfirmVisible\(true\)/);
  assert.match(source, /personalPrivacyCurtain/);
  assert.match(source, /activateKeepAwakeAsync\(VIDEO_KEEP_AWAKE_TAG\)/);
  assert.match(source, /!externalSource && queue\.length > 1[\s\S]*播放下一个视频/);
  assert.match(source, /space !== "personal"[\s\S]*safePlayPlayer\(\)/);
  assert.match(source, /isSavingLocalRef\.current = true/);
  assert.match(source, /formatActionErrorMessage/);
});
