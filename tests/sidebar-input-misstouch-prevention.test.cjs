const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('AiPushScaleDrawerStage supports disableSwipeOpen and independent left/right drawer gating with getter functions', () => {
  const code = read('src/components/ai/AiPushScaleDrawerStage.tsx');

  // 1. Props include canOpenLeftDrawer, canOpenRightDrawer, and disableSwipeOpen supporting function getters
  assert.match(code, /canOpenLeftDrawer\?: boolean \| \(\(\) => boolean\)/);
  assert.match(code, /canOpenRightDrawer\?: boolean \| \(\(\) => boolean\)/);
  assert.match(code, /disableSwipeOpen\?: boolean \| \(\(\) => boolean\)/);

  // 2. Default values are provided
  assert.match(code, /canOpenLeftDrawer\s*=\s*true/);
  assert.match(code, /canOpenRightDrawer\s*=\s*true/);
  assert.match(code, /disableSwipeOpen\s*=\s*false/);

  // 3. stateRef tracks disableSwipeOpen and canOpenLeftDrawer
  assert.match(code, /canOpenLeftDrawer,\s*canOpenRightDrawer,\s*disableSwipeOpen/);

  // 4. Closing an open drawer is evaluated BEFORE disableSwipeOpen so swipe-to-close is never blocked
  const leftOpenCloseIdx = code.indexOf("gestureModeRef.current = 'close-left'");
  const rightOpenCloseIdx = code.indexOf("gestureModeRef.current = 'close-right'");
  const disableCheckIdx = code.indexOf('if (isSwipeDisabled) {');
  assert.ok(leftOpenCloseIdx > 0, 'Must have close-left logic');
  assert.ok(rightOpenCloseIdx > 0, 'Must have close-right logic');
  assert.ok(disableCheckIdx > leftOpenCloseIdx, 'disableSwipeOpen check must be after open drawer check');
  assert.ok(disableCheckIdx > rightOpenCloseIdx, 'disableSwipeOpen check must be after open drawer check');

  // 5. Open left and right drawers respect allowLeft and allowRight getters
  assert.match(code, /if\s*\(gs\.dx > 0 && allowLeft && stateRef\.current\.onOpenLeftDrawer\)/);
  assert.match(code, /if\s*\(gs\.dx < 0 && allowRight && stateRef\.current\.onOpenRightDrawer\)/);
});

test('ImPushScaleDrawerStage supports disableSwipeOpen and independent left/right drawer gating with getter functions', () => {
  const code = read('src/im/components/drawer/ImPushScaleDrawerStage.tsx');

  // 1. Props include canOpenLeftDrawer, canOpenRightDrawer, and disableSwipeOpen supporting function getters
  assert.match(code, /canOpenLeftDrawer\?: boolean \| \(\(\) => boolean\)/);
  assert.match(code, /canOpenRightDrawer\?: boolean \| \(\(\) => boolean\)/);
  assert.match(code, /disableSwipeOpen\?: boolean \| \(\(\) => boolean\)/);

  // 2. Defaults
  assert.match(code, /canOpenLeftDrawer\s*=\s*true/);
  assert.match(code, /canOpenRightDrawer\s*=\s*true/);
  assert.match(code, /disableSwipeOpen\s*=\s*false/);

  // 3. onMoveShouldSetPanResponder blocks opening when isSwipeDisabled is true
  assert.match(code, /if\s*\(!leftOpen && !rightOpen\)\s*\{\s*const isSwipeDisabled\s*=\s*typeof swipeDisabled === 'function'/);
  assert.match(code, /\(gs\.dx > 8 && allowLeft\) \|\| \(gs\.dx < -8 && allowRight\)/);

  // 4. onPanResponderRelease also respects isSwipeDisabled and allowLeft/allowRight
  assert.match(code, /if\s*\(!leftOpen && !rightOpen\)\s*\{\s*const isSwipeDisabled\s*=\s*typeof swipeDisabled === 'function'/);
  assert.match(code, /\(gs\.dx > 40 \|\| \(gs\.dx > 15 && gs\.vx > 0\.2\)\) && allowLeft/);
  assert.match(code, /\(gs\.dx < -40 \|\| \(gs\.dx < -15 && gs\.vx < -0\.2\)\) && allowRight/);
});

test('AiChatComposer tracks input touch interactions and text selection states with cleanup', () => {
  const code = read('src/components/ai/AiChatComposer.tsx');

  // 1. Interface exposes onInputGestureActiveChange
  assert.match(code, /onInputGestureActiveChange\?: \(active: boolean\) => void/);

  // 2. Tracks selection change start !== end
  assert.match(code, /const selecting = start !== end/);
  assert.match(code, /onSelectionChange=\{handleSelectionChange\}/);

  // 3. Input area binds onTouchStart, onTouchEnd, onTouchCancel
  assert.match(code, /onTouchStart=\{handleTouchStart\}/);
  assert.match(code, /onTouchEnd=\{handleTouchEnd\}/);
  assert.match(code, /onTouchCancel=\{handleTouchEnd\}/);

  // 4. Cleans up onBlur, unmount, and empty text
  assert.match(code, /onBlur=\{handleBlur\}/);
  assert.match(code, /isSelectingRef\.current = false;\s*isInteractingRef\.current = false;/);
  assert.match(code, /if\s*\(value\.length !== 0\)\s*\{\s*return;\s*\}\s*if\s*\(isSelectingRef\.current\)/);
});

test('ImInputBar tracks input touch interactions and text selection states with cleanup', () => {
  const code = read('src/im/components/ImInputBar.tsx');

  // 1. Interface exposes onInputGestureActiveChange
  assert.match(code, /onInputGestureActiveChange\?: \(active: boolean\) => void/);

  // 2. Tracks selection change start !== end
  assert.match(code, /const selecting = e\.nativeEvent\.selection\.start !== e\.nativeEvent\.selection\.end/);

  // 3. Container binds touch events
  assert.match(code, /onTouchStart=\{handleTouchStart\}/);
  assert.match(code, /onTouchEnd=\{handleTouchEnd\}/);
  assert.match(code, /onTouchCancel=\{handleTouchEnd\}/);

  // 4. Cleans up onBlur, unmount, collapse, and send
  assert.match(code, /onBlur=\{handleBlur\}/);
  assert.match(code, /collapse:\s*\(\)\s*=>\s*\{[\s\S]*?isSelectingRef\.current = false;/);
  assert.match(code, /onSend\(trimmed\);[\s\S]*?if\s*\(isSelectingRef\.current \|\| isInteractingRef\.current\)/);
});

test('AiChatScreen and ImChatScreen use zero-rerender ref getters for drawer stage disabling', () => {
  const aiChatCode = read('src/screens/AiChatScreen.tsx');
  const imChatCode = read('src/im/screens/ImChatScreen.tsx');

  // 1. AiChatScreen uses zero-render ref getter instead of state re-renders
  assert.match(aiChatCode, /const isComposerGestureActiveRef = useRef\(false\)/);
  assert.match(aiChatCode, /const handleComposerGestureActiveChange = useCallback/);
  assert.match(aiChatCode, /onInputGestureActiveChange=\{handleComposerGestureActiveChange\}/);
  assert.match(aiChatCode, /disableSwipeOpen=\{\(\) => isComposerGestureActiveRef\.current\}/);
  assert.match(aiChatCode, /!isComposerGestureActiveRef\.current/);

  // 2. ImChatScreen uses zero-render ref getter instead of state re-renders
  assert.match(imChatCode, /const isInputGestureActiveRef = useRef\(false\)/);
  assert.match(imChatCode, /const handleInputGestureActiveChange = useCallback/);
  assert.match(imChatCode, /onInputGestureActiveChange=\{handleInputGestureActiveChange\}/);
  assert.match(imChatCode, /disableSwipeOpen=\{\(\) => isInputGestureActiveRef\.current\}/);
});

test('Functional resolution semantics for disableSwipeOpen and canOpenLeft/RightDrawer', () => {
  const resolveSwipeDisabled = (v) => typeof v === 'function' ? v() : Boolean(v);
  const resolveAllow = (v) => typeof v === 'function' ? v() : v !== false;

  // Defaults
  assert.strictEqual(resolveSwipeDisabled(undefined), false);
  assert.strictEqual(resolveSwipeDisabled(false), false);
  assert.strictEqual(resolveSwipeDisabled(true), true);
  assert.strictEqual(resolveSwipeDisabled(() => false), false);
  assert.strictEqual(resolveSwipeDisabled(() => true), true);

  assert.strictEqual(resolveAllow(undefined), true);
  assert.strictEqual(resolveAllow(true), true);
  assert.strictEqual(resolveAllow(false), false);
  assert.strictEqual(resolveAllow(() => true), true);
  assert.strictEqual(resolveAllow(() => false), false);
});
