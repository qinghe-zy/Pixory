const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('ordinary chat entry reveals from committed list layout without delayed correction jumps', () => {
  const source = read('src/screens/AiChatScreen.tsx');
  const entryStart = source.indexOf('// ── Prefetch fast path');
  const entryEffect = source.slice(entryStart, source.indexOf('messagesRef.current = messages', entryStart));

  assert.match(source, /isMessageListReady/);
  assert.match(source, /onContentSizeChange=\{handleMessageListContentSizeChange\}/);
  assert.doesNotMatch(entryEffect, /scheduleIntentionalLatestJump/);
  assert.doesNotMatch(entryEffect, /fadeInMessageArea\(250\)/);
  assert.doesNotMatch(entryEffect, /scrollToLatestMessage\(false, true\)/);
  assert.match(source, /scheduleSearchTargetScroll/);
  assert.match(source, /scheduleBranchTreeTargetScroll/);
  assert.match(source, /scheduleInlineEditVisibility/);
});

test('all central AI chat route pushes start revision-safe prefetch before navigation mutation', () => {
  const source = read('App.tsx');
  const pushRouteBlock = source.slice(source.indexOf('function pushRoute'), source.indexOf('function openAiChatRoute'));
  const openRouteBlock = source.slice(source.indexOf('function openAiChatRoute'), source.indexOf('function openNewAiChat'));

  for (const block of [pushRouteBlock, openRouteBlock]) {
    assert.match(block, /prefetchThreadMessages/);
    assert.ok(block.indexOf('prefetchThreadMessages') < block.indexOf('setRouteStack'));
  }
  assert.match(source, /clearThreadMessagePrefetch\('personal'\)/);
  const prefetch = read('src/ai/aiThreadMessagePrefetch.ts');
  const chat = read('src/screens/AiChatScreen.tsx');
  assert.match(prefetch, /loadAdoptedThreadRouteSnapshot\([\s\S]{0,180}\)\.catch\(\(\) => null\)/);
  assert.match(chat, /isAdoptedThreadRouteSnapshotCurrent/);
});

test('hidden parallax loops are cancelled instead of running behind invisible chat UI', () => {
  const component = read('src/components/ParallaxLightSweep.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');
  assert.match(component, /cancelAnimation/);
  assert.match(component, /const animationActive = active \?\? visible/);
  assert.match(chat, /active=\{showSweep && appIsActive\}/);
});
