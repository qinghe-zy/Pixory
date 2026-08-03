const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(output, filename);
  return mod.exports;
}

test('composer entrance policy only grants animation for new chat route keys', () => {
  const policy = read('src/ai/aiComposerEntrancePolicy.ts');
  const { shouldStartComposerEntrance } = loadTsModule('src/ai/aiComposerEntrancePolicy.ts');
  const playedRouteKeys = new Set(['played-key']);

  assert.match(policy, /export type ComposerEntranceReason/);
  assert.match(policy, /'new_chat'/);
  assert.match(policy, /'open_thread'/);
  assert.match(policy, /'replace_current'/);
  assert.match(policy, /'thread_ready'/);
  assert.match(policy, /'title_update'/);
  assert.match(policy, /'keyboard'/);
  assert.match(policy, /'streaming'/);
  assert.match(policy, /'composer_height'/);
  assert.match(policy, /'drawer'/);
  assert.match(policy, /export function shouldStartComposerEntrance/);
  assert.match(policy, /reason === 'new_chat' \|\| reason === 'open_thread'/);
  assert.match(policy, /previousRouteKey !== nextRouteKey/);
  assert.match(policy, /playedRouteKeys\.has\(nextRouteKey\)/);

  assert.equal(shouldStartComposerEntrance({ nextRouteKey: 'chat-a', playedRouteKeys, previousRouteKey: undefined, reason: 'new_chat' }), true);
  assert.equal(shouldStartComposerEntrance({ nextRouteKey: 'thread-b', playedRouteKeys, previousRouteKey: 'chat-a', reason: 'open_thread' }), true);
  assert.equal(shouldStartComposerEntrance({ nextRouteKey: 'played-key', playedRouteKeys, previousRouteKey: 'chat-a', reason: 'open_thread' }), false);
  assert.equal(shouldStartComposerEntrance({ nextRouteKey: 'chat-a', playedRouteKeys, previousRouteKey: 'chat-a', reason: 'new_chat' }), false);
  for (const reason of ['replace_current', 'thread_ready', 'title_update', 'keyboard', 'streaming', 'composer_height', 'drawer']) {
    assert.equal(shouldStartComposerEntrance({ nextRouteKey: `blocked-${reason}`, playedRouteKeys, previousRouteKey: 'chat-a', reason }), false, reason);
  }
});

test('composer entrance runtime ignores stale async completions', () => {
  const policy = read('src/ai/aiComposerEntrancePolicy.ts');
  const chat = read('src/screens/AiChatScreen.tsx');
  const { createComposerEntranceRun, isCurrentComposerEntranceRun } = loadTsModule('src/ai/aiComposerEntrancePolicy.ts');

  const runA = createComposerEntranceRun('route-a');
  const runB = createComposerEntranceRun('route-b');
  assert.equal(isCurrentComposerEntranceRun(runA, 'route-a', runA.token), true);
  assert.equal(isCurrentComposerEntranceRun(runB, 'route-a', runA.token), false);
  assert.equal(isCurrentComposerEntranceRun(runA, 'route-b', runA.token), false);
  assert.equal(isCurrentComposerEntranceRun(null, 'route-a', runA.token), false);

  assert.match(policy, /export function createComposerEntranceRun/);
  assert.match(policy, /runToken/);
  assert.match(policy, /isCurrentComposerEntranceRun/);
  assert.match(policy, /run\.key === key && run\.token === token/);
  assert.match(chat, /composerEntranceRunRef/);
  assert.match(chat, /createComposerEntranceRun/);
  assert.match(chat, /isCurrentComposerEntranceRun/);
  assert.match(chat, /if \(cancelled \|\| !isCurrentComposerEntranceRun/);
  assert.match(chat, /playedComposerEntranceKeysRef\.current\.add\(composerEntranceKey\)/);
  assert.doesNotMatch(chat, /animatedComposerEntranceKeys\.add\(composerEntranceKey\)[\s\S]{0,240}AccessibilityInfo\.isReduceMotionEnabled/);
});

test('composer entrance does not bind to keyboard scroll streaming or layout work', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const app = read('App.tsx');
  const entranceEffect = /useEffect\(\(\) => \{[\s\S]{0,300}const shouldStart = shouldStartComposerEntrance[\s\S]*?\n  \}, \[composerEntranceKey, composerEntranceProgress, composerEntranceReason, isInitialMessageLoading\]\);/.exec(chat)?.[0] ?? '';

  assert.match(app, /composerEntranceReason:\s*'new_chat'/);
  assert.match(app, /composerEntranceReason:\s*'open_thread'/);
  assert.match(app, /composerEntranceReason:\s*route\.composerEntranceReason \?\? 'replace_current'/);
  assert.match(app, /composerEntranceReason=\{currentRoute\.composerEntranceReason \?\? 'replace_current'\}/);
  assert.match(chat, /composerEntranceReason\?: ComposerEntranceReason/);
  assert.match(entranceEffect, /AccessibilityInfo\.isReduceMotionEnabled/);
  assert.match(entranceEffect, /isCurrentComposerEntranceRun/);
  assert.doesNotMatch(chat, /TextInput\.focus\(/);
  assert.doesNotMatch(chat, /Keyboard\.addListener\(/);
  assert.doesNotMatch(entranceEffect, /scrollToOffset/);
  assert.doesNotMatch(entranceEffect, /followLatestMessage/);
  assert.doesNotMatch(entranceEffect, /reloadMessages/);
  assert.doesNotMatch(entranceEffect, /setMessages/);
  assert.doesNotMatch(entranceEffect, /setPendingAttachments/);
  assert.doesNotMatch(entranceEffect, /setComposerText/);
  assert.doesNotMatch(entranceEffect, /setLatestVisible/);
});
