const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

global.__DEV__ = false;

function loadTsModule(relativePath) {
  const filePath = path.resolve(process.cwd(), relativePath);
  const code = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const customRequire = (id) => {
    if (id.startsWith('.')) {
      const targetPath = path.resolve(path.dirname(filePath), id);
      const candidates = [
        targetPath,
        `${targetPath}.ts`,
        `${targetPath}.tsx`,
        `${targetPath}.js`,
        `${targetPath}/index.ts`,
        `${targetPath}/index.tsx`,
      ];
      for (const c of candidates) {
        if (fs.existsSync(c) && !fs.statSync(c).isDirectory()) {
          return loadTsModule(path.relative(process.cwd(), c));
        }
      }
    }
    try {
      return require(id);
    } catch {
      return {};
    }
  };
  const m = { exports: {} };
  const fn = new Function('module', 'exports', 'require', '__dirname', '__filename', compiled.outputText);
  fn(m, m.exports, customRequire, path.dirname(filePath), filePath);
  return m.exports;
}

test('SQL Resilience: ai_messages must NEVER be queried with non-existent column "type"', () => {
  const generatorSource = fs.readFileSync(path.resolve(process.cwd(), 'src/im/diary/engine/imDiaryGenerator.ts'), 'utf8');

  // Verify that SELECT from ai_messages does not select column `type`
  assert.doesNotMatch(
    generatorSource,
    /SELECT[^;]+,\s*type\s*,[^;]+FROM\s+ai_messages/i,
    'imDiaryGenerator must not select non-existent column "type" from ai_messages'
  );

  // Verify that WHERE clause on ai_messages does not filter by `type = 'diary_card'`
  assert.doesNotMatch(
    generatorSource,
    /FROM\s+ai_messages[^;]+WHERE[^;]+type\s*=\s*'diary_card'/i,
    'imDiaryGenerator must not query WHERE type = "diary_card" on ai_messages'
  );
});

test('SQL Resilience: burstDispatcher must not query non-existent im_messages table or metadata column', () => {
  const burstSource = fs.readFileSync(path.resolve(process.cwd(), 'src/im/engine/burstDispatcher.ts'), 'utf8');
  assert.doesNotMatch(
    burstSource,
    /FROM\s+im_messages/i,
    'burstDispatcher must not query non-existent table im_messages'
  );
  assert.doesNotMatch(
    burstSource,
    /SELECT[^;]*metadata[^;]*FROM\s+ai_messages/i,
    'burstDispatcher must not select non-existent column metadata from ai_messages'
  );
});

test('Diary Parsing: parseDualLayerDiary strips <think> tags and handles unclosed tags', () => {
  const { parseDualLayerDiary } = loadTsModule('src/im/diary/engine/imDiaryGenerator.ts');

  const sampleWithThink = `
<think>
思考中：今天和小鱼聊了手账和热可可的事情。
用户的喜好很明显。
</think>
[THEME: rainwater]
[MOOD: 温暖]
[WEATHER: 细雨]
<Diary_Content>
<think>内部多余的思考</think>
今天窗外下着细雨。
我和清和聊起了热可可，夜里炉火很暖。
</Diary_Content>
<Memory_Metadata>
- 核心事件摘要：雨夜围炉聊热可可
- 捕捉到的用户偏好：喜欢喝热可可
- 关键物品与地点：窗边、热可可杯
- 待触发钩子：明天看看是否醒着
</Memory_Metadata>
  `;

  const result = parseDualLayerDiary(sampleWithThink);
  assert.equal(result.theme, 'rainwater');
  assert.equal(result.mood, '温暖');
  assert.equal(result.weather, '细雨');
  assert.ok(!result.content.includes('<think>'), 'Content must not contain <think> tags');
  assert.ok(!result.content.includes('内部多余的思考'), 'Content must not contain think inner text');
  assert.ok(result.content.includes('今天窗外下着细雨'), 'Content must contain clean diary text');
  assert.equal(result.metadata.summary, '雨夜围炉聊热可可');
  assert.deepEqual(result.metadata.userPreferences, ['喜欢喝热可可']);
  assert.deepEqual(result.metadata.keyEntities, ['窗边、热可可杯']);
  assert.deepEqual(result.metadata.hooks, ['明天看看是否醒着']);
});

test('Dialogue Selection: selectDiaryDialogue cleans tags and formats stickers', () => {
  const { selectDiaryDialogue } = loadTsModule('src/im/diary/engine/diaryDayWindow.ts');

  const messages = [
    { role: 'user', content: '今天好冷啊', type: 'text' },
    { role: 'assistant', content: '给你煮了一杯热可可[STATUS: 喝热可可]', type: 'text' },
    { role: 'user', content: '开心', type: 'sticker', metadata: { sticker: { name: '开心蹦跳' } } },
    { role: 'assistant', content: '{"type":"diary_card","diaryId":"1"}', type: 'diary_card' },
    { role: 'system', content: '[系统提示: 连接已重置]', type: 'notice' },
    { role: 'assistant', content: '晚上早点休息[PASS]', type: 'text' },
  ];

  const dialogue = selectDiaryDialogue(messages, 3000);
  assert.ok(dialogue.includes('用户: 今天好冷啊'));
  assert.ok(dialogue.includes('伴侣: 给你煮了一杯热可可'));
  assert.ok(!dialogue.includes('[STATUS:'), 'Must strip status tag');
  assert.ok(dialogue.includes('开心蹦跳'), 'Must include resolved sticker label');
  assert.ok(!dialogue.includes('diary_card'), 'Must filter out diary card message');
  assert.ok(!dialogue.includes('系统提示'), 'Must filter out system notices');
  assert.ok(!dialogue.includes('[PASS]'), 'Must strip PASS tag');
});

test('Schema Resilience: ensureDiaryTable contains ALTER TABLE statements for all possible columns and unique index', () => {
  const repoSource = fs.readFileSync(path.resolve(process.cwd(), 'src/im/diary/repository/imDiaryRepository.ts'), 'utf8');
  assert.ok(repoSource.includes('idx_diaries_thread_date_unique'), 'Must create unique index on (thread_id, diary_date)');
  assert.ok(repoSource.includes('ADD COLUMN theme_key'), 'Must have theme_key ALTER TABLE');
  assert.ok(repoSource.includes('ADD COLUMN memory_metadata_json'), 'Must have memory_metadata_json ALTER TABLE');
  assert.ok(repoSource.includes('ADD COLUMN previous_versions_json'), 'Must have previous_versions_json ALTER TABLE');
  assert.ok(repoSource.includes('ADD COLUMN paper_texture'), 'Must have paper_texture ALTER TABLE');
  assert.ok(repoSource.includes('ADD COLUMN polaroid_json'), 'Must have polaroid_json ALTER TABLE');
  assert.ok(repoSource.includes('ADD COLUMN stickers_json'), 'Must have stickers_json ALTER TABLE');
  assert.ok(repoSource.includes('ADD COLUMN tapes_json'), 'Must have tapes_json ALTER TABLE');
});

test('Token Conservation: imDiaryGenerator reuses existing diary when auto-triggered without forceRewrite', () => {
  const generatorSource = fs.readFileSync(path.resolve(process.cwd(), 'src/im/diary/engine/imDiaryGenerator.ts'), 'utf8');
  assert.ok(generatorSource.includes('getCompanionDiaryByDate(space, threadId, dateStr)'), 'Must check existing diary before generating');
  assert.ok(generatorSource.includes('if (!forceRewrite)'), 'Must check forceRewrite condition');
});

test('UX & React Best Practices: ImDiaryBookModal displays ActivityIndicator during generation', () => {
  const modalSource = fs.readFileSync(path.resolve(process.cwd(), 'src/im/diary/ImDiaryBookModal.tsx'), 'utf8');
  assert.ok(modalSource.includes('<ActivityIndicator'), 'Must show ActivityIndicator during diary generation');
});
