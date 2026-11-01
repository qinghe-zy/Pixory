const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const ts = require('typescript');

function transpileFile(relativePath) {
  const fullPath = path.resolve(__dirname, relativePath);
  const code = fs.readFileSync(fullPath, 'utf8');
  return ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

test('DiaryMemoryHarvester: 手账日记元数据反哺沉淀为 L2_FACT、L2_EPISODE 与次日话题钩子', async () => {
  const transpiled = transpileFile('../src/im/diary/engine/diaryMemoryHarvester.ts');

  const savedMemories = [];
  const mockMemoryRepository = {
    async saveMemory(record, space) {
      savedMemories.push({ record, space });
    },
  };

  let capturedHook = null;
  const mockThreadRepo = {
    async setThreadPendingDiaryHook(space, threadId, hook) {
      capturedHook = { space, threadId, hook };
    },
  };

  const customRequire = (specifier) => {
    if (specifier.includes('memoryRepository')) {
      return { memoryRepository: mockMemoryRepository };
    }
    if (specifier.includes('imThreadRepository')) {
      return mockThreadRepo;
    }
    return {};
  };

  const m = { exports: {} };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, customRequire);

  const { harvestDiaryMemoryToL2 } = m.exports;

  const mockMetadata = {
    summary: '今天和用户聊到了周末去植物园散步的计划，还吃到了好吃的抹茶冰淇淋。',
    userPreferences: ['喜欢微苦浓郁的宇治抹茶', '下雨天习惯待在室内看书'],
    keyEntities: ['植物园', '抹茶冰淇淋', '周末'],
    hooks: ['下次记得问问他植物园门票买好了没有'],
  };

  const result = await harvestDiaryMemoryToL2({
    space: 'normal',
    threadId: 'th_test_1',
    roleCardId: 'role_suiseisei',
    diaryDate: '2026-10-28',
    metadata: mockMetadata,
  });

  assert.equal(result.factsCreated, 2, '应该沉淀出 2 条 L2_FACT 偏好记忆');
  assert.equal(result.episodesCreated, 1, '应该沉淀出 1 条 L2_EPISODE 剧情纪事');
  assert.equal(result.hookStored, '下次记得问问他植物园门票买好了没有');

  assert.equal(savedMemories.length, 3);

  // 校验 L2_FACT
  const fact1 = savedMemories.find((m) => m.record.content.includes('宇治抹茶'));
  assert.ok(fact1);
  assert.equal(fact1.record.tier, 'L2_FACT');
  assert.equal(fact1.record.roleCardId, 'role_suiseisei');
  assert.ok(fact1.record.entities.includes('植物园'));
  assert.ok(fact1.record.triggerKeywords.includes('偏好'));

  // 校验 L2_EPISODE
  const episode1 = savedMemories.find((m) => m.record.tier === 'L2_EPISODE');
  assert.ok(episode1);
  assert.ok(episode1.record.content.includes('2026-10-28 手账纪事'));
  assert.ok(episode1.record.triggerKeywords.includes('手账'));

  // 校验 hook
  assert.equal(capturedHook?.threadId, 'th_test_1');
  assert.equal(capturedHook?.hook, '下次记得问问他植物园门票买好了没有');
});
