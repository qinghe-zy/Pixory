const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTs(relPath) {
  const full = path.resolve(__dirname, relPath.endsWith('.ts') ? relPath : `${relPath}.ts`);
  const out = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out)(mod, mod.exports, (id) =>
    id.startsWith('.') ? loadTs(path.resolve(path.dirname(full), id)) : require(id)
  );
  return mod.exports;
}

const {
  buildEffectiveRecallQuery,
  filterCooldownRecalledMemories,
} = loadTs('../src/im/engine/recallQueryBuilder.ts');

const {
  extractCommitmentFromUserText,
  checkCommitmentFollowupStatus,
} = loadTs('../src/im/engine/commitmentExtractor.ts');

const {
  resolveBudgets,
  LAYER_2_MAX_TOKENS,
  LAYER_4_MAX_TOKENS,
} = loadTs('../src/im/engine/imTokenBudgetController.ts');

test('buildEffectiveRecallQuery: 短文本结合上下文关键实体', () => {
  const recentMessages = [
    { id: '1', role: 'user', content: '我明天下午两点要去腾讯面试前端岗位', type: 'text' },
    { id: '2', role: 'assistant', content: '哇腾讯面试！加油呀', type: 'text' },
  ];
  const query = buildEffectiveRecallQuery({
    currentUserInput: '嗯嗯',
    recentMessages,
  });
  assert.ok(query.includes('嗯嗯'));
  assert.ok(query.includes('腾讯') || query.includes('面试') || query.includes('前端'), `短文本应补充前文实体，当前为: ${query}`);
});

test('buildEffectiveRecallQuery: 长实体文本保持原生', () => {
  const query = buildEffectiveRecallQuery({
    currentUserInput: '周末想去国家博物馆看三星堆文物特展',
    recentMessages: [],
  });
  assert.equal(query, '周末想去国家博物馆看三星堆文物特展');
});

test('filterCooldownRecalledMemories: 优先展示未冷却的新记忆', () => {
  const memories = [
    { id: 'm1', content: '记忆1' },
    { id: 'm2', content: '记忆2' },
    { id: 'm3', content: '记忆3' },
  ];
  const cooldown = new Set(['m1']);
  const filtered = filterCooldownRecalledMemories(memories, cooldown, 2);
  assert.equal(filtered[0].id, 'm2');
  assert.equal(filtered[1].id, 'm3');
});

test('extractCommitmentFromUserText: 准确抽取未来承诺与动作', () => {
  const now = new Date('2026-11-01T14:00:00Z').getTime();
  const c1 = extractCommitmentFromUserText('我明天下午要去体检', now);
  assert.ok(c1, '应成功抽取体检约定');
  assert.equal(c1.title, '体检');
  assert.ok(c1.dueAt > now, '约定时间应在未来');

  const c2 = extractCommitmentFromUserText('你明天有空吗？', now);
  assert.equal(c2, null, '疑问句不应作为承诺抽取');
});

test('checkCommitmentFollowupStatus: 正确判断临近与事后关怀窗口', () => {
  const due = 100000;
  assert.equal(checkCommitmentFollowupStatus(due, due - 20 * 60 * 1000), 'imminent');
  assert.equal(checkCommitmentFollowupStatus(due, due + 30 * 60 * 1000), 'post_check');
  assert.equal(checkCommitmentFollowupStatus(due, due - 2 * 3600 * 1000), 'none');
  assert.equal(checkCommitmentFollowupStatus(due, due + 30 * 3600 * 1000), 'expired');
});

test('resolveBudgets: 自适应预算派生正确且预算上限符合预期', () => {
  assert.equal(LAYER_2_MAX_TOKENS, 900);
  assert.equal(LAYER_4_MAX_TOKENS, 360);

  const shortSession = resolveBudgets(3);
  assert.equal(shortSession.layer2MaxTokens, 600);
  assert.equal(shortSession.layer4MaxTokens, 250);

  const deepSession = resolveBudgets(15);
  assert.equal(deepSession.layer2MaxTokens, 900);
  assert.equal(deepSession.layer4MaxTokens, 360);
});
