const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

function transpileFile(relativePath) {
  const fullPath = path.resolve(__dirname, relativePath);
  const code = fs.readFileSync(fullPath, 'utf8');
  return ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

test('DiaryDayWindow: 本地时区起止时间计算与非对话杂音清洗', () => {
  const dayWindowCode = transpileFile('../src/im/diary/engine/diaryDayWindow.ts');
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', dayWindowCode)(mod, mod.exports, require);
  const { toLocalDateStr, getLocalDayRange, selectDiaryDialogue } = mod.exports;

  const todayStr = toLocalDateStr(new Date('2026-11-01T15:00:00Z'));
  assert.ok(todayStr.includes('2026-11-0'), '应当正确返回本地日期格式');

  const range = getLocalDayRange('2026-11-01');
  assert.equal(range.dateStr, '2026-11-01');
  assert.equal(range.endUtcMs - range.startUtcMs, 24 * 3600 * 1000, '本地一整天的时间跨度严格为 24 小时');
  assert.ok(range.startIso.length > 0);
  assert.ok(range.endIso.length > 0);

  const rawMessages = [
    { role: 'user', content: '今天天气真好，去公园晒太阳了', type: 'text' },
    { role: 'assistant', content: '是呀！公园里花都开了呢[STATUS: 散步看花 | load=free | privacy=private][HEARTBEAT: 20s | 还拍了小猫呢]', type: 'text' },
    { role: 'assistant', content: '{"type":"diary_card","diaryId":"d1"}', type: 'diary_card' },
    { role: 'system', content: '这是一条系统通知', type: 'notice' },
    { role: 'user', content: '晚上去吃火锅[PASS]', type: 'text' },
  ];

  const cleaned = selectDiaryDialogue(rawMessages, 3000);
  assert.ok(cleaned.includes('今天天气真好'));
  assert.ok(cleaned.includes('是呀！公园里花都开了呢'));
  assert.ok(cleaned.includes('晚上去吃火锅'));
  assert.ok(!cleaned.includes('STATUS:'), '协议标签应当被彻底剥离');
  assert.ok(!cleaned.includes('HEARTBEAT:'), '协议标签应当被彻底剥离');
  assert.ok(!cleaned.includes('diary_card'), '日记小卡片应当被过滤');
  assert.ok(!cleaned.includes('这是一条系统通知'), '系统通知应当被过滤');
});

test('DiaryRepository: 手账保存自动压栈旧版本 (最多3版) 与撤销恢复', async () => {
  const repoCode = transpileFile('../src/im/diary/repository/imDiaryRepository.ts');

  // 构建内存 SQLite
  const dbSync = new DatabaseSync(':memory:');
  const mockDb = {
    async execAsync(sql) {
      dbSync.exec(sql);
    },
    async runAsync(sql, params = []) {
      const stmt = dbSync.prepare(sql);
      return stmt.run(...params);
    },
    async getFirstAsync(sql, params = []) {
      const stmt = dbSync.prepare(sql);
      return stmt.get(...params) || null;
    },
    async getAllAsync(sql, params = []) {
      const stmt = dbSync.prepare(sql);
      return stmt.all(...params);
    },
  };

  const customRequire = (specifier) => {
    if (specifier.includes('database')) {
      return { initDatabase: async () => mockDb };
    }
    return {};
  };

  const mod = { exports: {} };
  new Function('module', 'exports', 'require', repoCode)(mod, mod.exports, customRequire);
  const {
    saveCompanionDiary,
    getCompanionDiaryByDate,
    restorePreviousDiaryVersion,
    deleteCompanionDiary,
  } = mod.exports;

  // 1. 初次保存日记 (V1)
  const diaryV1 = {
    id: 'diary_th1_2026-11-01',
    threadId: 'th1',
    roleCardId: 'role1',
    diaryDate: '2026-11-01',
    title: '初次手账 V1',
    content: '今天是初版手账内容。',
    weather: '晴',
    moodTag: '开心',
    stickers: [],
    tapes: [],
    paperTexture: 'grid',
    themeKey: 'sage',
    createdAt: 1000,
    updatedAt: 1000,
  };
  await saveCompanionDiary('normal', diaryV1);

  const saved1 = await getCompanionDiaryByDate('normal', 'th1', '2026-11-01');
  assert.equal(saved1.title, '初次手账 V1');
  assert.equal(saved1.previousVersions.length, 0);

  // 2. 重写生成日记 (V2) - 应当自动将 V1 存入 previousVersions
  const diaryV2 = {
    ...diaryV1,
    title: '重写手账 V2',
    content: '这是重写后的手账正文，内容更丰富。',
    updatedAt: 2000,
  };
  await saveCompanionDiary('normal', diaryV2);

  const saved2 = await getCompanionDiaryByDate('normal', 'th1', '2026-11-01');
  assert.equal(saved2.title, '重写手账 V2');
  assert.equal(saved2.previousVersions.length, 1);
  assert.equal(saved2.previousVersions[0].title, '初次手账 V1');
  assert.equal(saved2.previousVersions[0].content, '今天是初版手账内容。');

  // 3. 再次重写生成 (V3)
  const diaryV3 = {
    ...diaryV1,
    title: '再次重写 V3',
    content: '这是第三次写的手账。',
    updatedAt: 3000,
  };
  await saveCompanionDiary('normal', diaryV3);

  const saved3 = await getCompanionDiaryByDate('normal', 'th1', '2026-11-01');
  assert.equal(saved3.title, '再次重写 V3');
  assert.equal(saved3.previousVersions.length, 2);
  assert.equal(saved3.previousVersions[0].title, '重写手账 V2');
  assert.equal(saved3.previousVersions[1].title, '初次手账 V1');

  // 4. 执行版本撤销恢复 -> 应当恢复为 V2
  const restored = await restorePreviousDiaryVersion('normal', 'th1', '2026-11-01');
  assert.equal(restored.title, '重写手账 V2');
  assert.equal(restored.content, '这是重写后的手账正文，内容更丰富。');
  assert.equal(restored.previousVersions.length, 1);
  assert.equal(restored.previousVersions[0].title, '初次手账 V1');

  // 5. 删除日记
  await deleteCompanionDiary('normal', 'th1', '2026-11-01');
  const deleted = await getCompanionDiaryByDate('normal', 'th1', '2026-11-01');
  assert.equal(deleted, null, '删除后应当查询不到该日记');
});
