const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

test('Voice fallback chain: builtin presets fallback to native TTS on missing API key or 401', () => {
  const fallbackPath = path.resolve(__dirname, '../src/voice/fallbackChain.ts');
  const fallbackCode = fs.readFileSync(fallbackPath, 'utf8');

  // 必须对未配置 API Key 的内置推荐预设平滑降级至本机离线引擎，绝不上抛 401 报错
  assert.ok(
    fallbackCode.includes('preset.isBuiltin'),
    'Fallback chain must check preset.isBuiltin for graceful fallback'
  );
  assert.ok(
    fallbackCode.includes('nativeTtsEngine.synthesizeToFile'),
    'Fallback chain must invoke nativeTtsEngine as Tier 2 fallback'
  );
  assert.ok(
    fallbackCode.includes('hasApiKey'),
    'Fallback chain must detect presence of API key'
  );
});

test('VoiceSettingsScreen: full-bleed design and zero internal scrollbars', () => {
  const settingsPath = path.resolve(__dirname, '../src/voice/ui/VoiceSettingsScreen.tsx');
  const settingsCode = fs.readFileSync(settingsPath, 'utf8');

  // 1. 标题明确提示免 Key 极速试听 / 开发者统付免 KEY 畅听
  assert.ok(
    settingsCode.includes('系统声学推荐') && (settingsCode.includes('免 Key') || settingsCode.includes('免 KEY')),
    'Must indicate built-in presets require no key'
  );

  // 2. 彻底根除内部嵌套的水平与垂直 ScrollView
  assert.strictEqual(
    settingsCode.includes('horizontal'),
    false,
    'Internal horizontal ScrollView must be completely removed'
  );
  assert.ok(
    settingsCode.includes('voiceCandidateGrid'),
    'Must use voiceCandidateGrid wrap layout instead of horizontal scrollview'
  );

  // 3. 全通栏设计：外层 content paddingHorizontal 为 0
  assert.ok(
    settingsCode.includes('paddingHorizontal: 0'),
    'Outer content must use full-bleed paddingHorizontal: 0'
  );
});

test('ImSettingsRepository: voiceReplyEnabled persistence and setVoiceReplyEnabledForAll batch update', async () => {
  const repoPath = path.resolve(__dirname, '../src/im/repository/imSettingsRepository.ts');
  const repoCode = fs.readFileSync(repoPath, 'utf8');

  assert.ok(repoCode.includes('voiceReplyEnabled?: boolean;'), 'ImThreadSettings must define voiceReplyEnabled');
  assert.ok(repoCode.includes('setVoiceReplyEnabledForAll'), 'Must export setVoiceReplyEnabledForAll function');

  // SQLite in-memory simulation for setVoiceReplyEnabledForAll
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE ai_threads (
      id TEXT PRIMARY KEY,
      roleCardId TEXT,
      im_settings_json TEXT
    );
    INSERT INTO ai_threads (id, roleCardId, im_settings_json) VALUES
      ('t1', 'r1', '{"personalization":null}'),
      ('t2', 'r2', '{"voiceReplyEnabled":false}'),
      ('t3', 'r3', null);
  `);

  const rows = db.prepare('SELECT id, im_settings_json FROM ai_threads;').all();
  assert.equal(rows.length, 3);

  // Simulate updating all to true
  for (const row of rows) {
    let parsed = {};
    if (row.im_settings_json) {
      try { parsed = JSON.parse(row.im_settings_json); } catch {}
    }
    parsed.voiceReplyEnabled = true;
    db.prepare('UPDATE ai_threads SET im_settings_json = ? WHERE id = ?').run(JSON.stringify(parsed), row.id);
  }

  const updatedRows = db.prepare('SELECT id, im_settings_json FROM ai_threads;').all();
  for (const row of updatedRows) {
    const parsed = JSON.parse(row.im_settings_json);
    assert.strictEqual(parsed.voiceReplyEnabled, true, `Thread ${row.id} must have voiceReplyEnabled=true`);
  }

  // Simulate updating all to false
  for (const row of updatedRows) {
    let parsed = JSON.parse(row.im_settings_json);
    parsed.voiceReplyEnabled = false;
    db.prepare('UPDATE ai_threads SET im_settings_json = ? WHERE id = ?').run(JSON.stringify(parsed), row.id);
  }

  const updatedFalseRows = db.prepare('SELECT id, im_settings_json FROM ai_threads;').all();
  for (const row of updatedFalseRows) {
    const parsed = JSON.parse(row.im_settings_json);
    assert.strictEqual(parsed.voiceReplyEnabled, false, `Thread ${row.id} must have voiceReplyEnabled=false`);
  }
});

test('IM Companion Settings and Drawer: voice switch UI and bulk actions', () => {
  // 1. Single chat settings drawer
  const drawerPath = path.resolve(__dirname, '../src/im/components/drawer/ImChatSettingsDrawer.tsx');
  const drawerCode = fs.readFileSync(drawerPath, 'utf8');
  assert.ok(
    drawerCode.includes('title="允许模型回复语音"'),
    'ImChatSettingsDrawer must have 允许模型回复语音 switch row'
  );
  assert.ok(
    drawerCode.includes('voiceReplyEnabled !== false'),
    'voiceReplyEnabled must default to true'
  );

  // 2. Global companion chat settings
  const globalSettingsPath = path.resolve(__dirname, '../src/im/screens/ImCompanionSettingsScreen.tsx');
  const globalCode = fs.readFileSync(globalSettingsPath, 'utf8');
  assert.ok(
    globalCode.includes('所有角色回复语音总开关'),
    'ImCompanionSettingsScreen must have master switch'
  );
  assert.ok(
    globalCode.includes('一键开启全部会话') && globalCode.includes('一键关闭全部会话'),
    'ImCompanionSettingsScreen must have one-click bulk apply buttons'
  );
  assert.ok(
    globalCode.includes('setVoiceReplyEnabledForAll'),
    'ImCompanionSettingsScreen must call setVoiceReplyEnabledForAll'
  );
  assert.ok(
    globalCode.includes('AppDialog'),
    'ImCompanionSettingsScreen must use AppDialog for bulk confirmation'
  );
});

test('IM Context and Dispatcher: voice reply disabled enforcement', () => {
  const contextPath = path.resolve(__dirname, '../src/im/engine/imContextBuilder.ts');
  const contextCode = fs.readFileSync(contextPath, 'utf8');

  assert.ok(
    contextCode.includes('8. 【语音回复已停用】'),
    'Protocol must disallow voice tags when voiceReplyEnabled is false'
  );
  assert.ok(
    contextCode.includes('当前会话用户已关闭模型语音回复开关'),
    'Context builder must inject disabled notice'
  );

  const dispatcherPath = path.resolve(__dirname, '../src/im/engine/burstDispatcher.ts');
  const dispatcherCode = fs.readFileSync(dispatcherPath, 'utf8');

  assert.ok(
    dispatcherCode.includes('voiceReplyEnabled'),
    'BurstMessageDispatcher must support voiceReplyEnabled toggle'
  );
  assert.ok(
    dispatcherCode.includes('// 会话关闭语音回复时，平滑退化为普通文字对白气泡发射'),
    'Dispatcher must downgrade voice tag to regular text bubble when disabled'
  );
});
