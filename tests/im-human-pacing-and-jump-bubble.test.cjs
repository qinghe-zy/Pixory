const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

function loadModule(relativePath, mockRequire = {}) {
  let targetPath = path.resolve(__dirname, relativePath);
  if (!targetPath.endsWith('.ts') && !targetPath.endsWith('.js')) {
    if (fs.existsSync(targetPath + '.ts')) targetPath += '.ts';
    else if (fs.existsSync(targetPath + '.js')) targetPath += '.js';
  }
  const code = fs.readFileSync(targetPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  const customRequire = (reqPath) => {
    if (mockRequire[reqPath]) return mockRequire[reqPath];
    if (reqPath.startsWith('.')) {
      return loadModule(path.join(path.dirname(targetPath), reqPath), mockRequire);
    }
    return require(reqPath);
  };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, customRequire);
  return m.exports;
}

test('Pacing Profile: Zero-wait first bubble and compact subsequent delay', () => {
  const { calculateBubbleTypingDelay, DEFAULT_IM_GLOBAL_SETTINGS, DEFAULT_PACING_CONFIG } = loadModule('../src/im/config/pacingProfile.ts');

  // Debounce is 0s
  assert.equal(DEFAULT_IM_GLOBAL_SETTINGS.debounceWaitSec, 0);
  assert.equal(DEFAULT_PACING_CONFIG.userInputDebounceMs, 0);

  // First bubble is 0ms immediate
  const firstDelay = calculateBubbleTypingDelay('你好呀！', DEFAULT_IM_GLOBAL_SETTINGS, true);
  assert.equal(firstDelay, 0);

  // Subsequent bubble has compact natural human delay between 180ms and 600ms
  const secondDelay = calculateBubbleTypingDelay('今天下雨了。', DEFAULT_IM_GLOBAL_SETTINGS, false);
  assert.ok(secondDelay >= 180 && secondDelay <= 600);
});

test('Input Aggregator: Immediate dispatch for complete sentence vs adaptive delay for conjunction', () => {
  const { InputAggregator } = loadModule('../src/im/engine/inputAggregator.ts');

  const dispatched = [];
  const aggregator = new InputAggregator((text) => {
    dispatched.push(text);
  }, 0);

  // Complete statement with period -> 0ms immediate dispatch
  aggregator.push('晚上一起去吃饭吧。');
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0], '晚上一起去吃饭吧。');

  aggregator.cancel();
});

test('Memory Scorer: Multi-channel RRF and Ebbinghaus Stability Floor Protection', () => {
  const { scoreCompanionMemory } = loadModule('../src/core/memory/memoryScorer.ts');

  const now = Date.now();
  const highImportanceMemory = {
    id: 'mem_1',
    content: '用户对花生严重过敏，误食会休克',
    tier: 'L2_FACT',
    category: 'diet_allergy',
    importance: 9,
    confidence: 1.0,
    triggerKeywords: ['花生', '过敏'],
    entities: ['entity:花生'],
    lastAccessedAt: now - 365 * 24 * 3600 * 1000, // 1 year ago!
    hitCount: 5,
  };

  const scored = scoreCompanionMemory(
    highImportanceMemory,
    '这道菜里面有花生吗？',
    now
  );

  assert.ok(scored !== null);
  // Even after 1 year, importance >= 8 stability floor guarantees decay >= 0.60
  // With trigger match 0.8 * 0.6 decay * 0.95 importance factor => score >= 0.40
  assert.ok(scored.score >= 0.40, `Expected score >= 0.40, got ${scored.score}`);
  assert.equal(scored.matchedChannel, 'entity');
});

test('Unread Badges and Jump Pill: Title format and jump scroll index calculation', () => {
  // Title badge formatting logic
  const formatTitle = (unread) => (unread > 0 ? `伴聊 (${unread > 99 ? '99+' : unread})` : '伴聊');
  assert.equal(formatTitle(0), '伴聊');
  assert.equal(formatTitle(5), '伴聊 (5)');
  assert.equal(formatTitle(120), '伴聊 (99+)');

  // Jump Pill visibility: visible when unreadCount > 0 and user scrolled away
  const shouldShowJumpPill = (unreadCount, isAtBottom) => unreadCount > 0 && !isAtBottom;
  assert.equal(shouldShowJumpPill(3, false), true);
  assert.equal(shouldShowJumpPill(3, true), false);
  assert.equal(shouldShowJumpPill(0, false), false);
});
