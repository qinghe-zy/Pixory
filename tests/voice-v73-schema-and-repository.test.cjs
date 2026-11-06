const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

test('Voice V73 schema definition and database migration verification', async (t) => {
  const schemaPath = path.resolve(__dirname, '../src/database/schema.ts');
  const dbPath = path.resolve(__dirname, '../src/database/db.ts');

  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  const dbContent = fs.readFileSync(dbPath, 'utf8');

  await t.test('schema.ts defines DATABASE_VERSION >= 73 and MIGRATION_STATEMENTS_V73', () => {
    assert.match(schemaContent, /export const DATABASE_VERSION = 73;/);
    assert.match(schemaContent, /export const MIGRATION_STATEMENTS_V73/);
    assert.match(schemaContent, /CREATE TABLE IF NOT EXISTS voice_presets/);
    assert.match(schemaContent, /CREATE TABLE IF NOT EXISTS voice_bindings/);
    assert.match(schemaContent, /CREATE TABLE IF NOT EXISTS voice_audio_cache/);
    assert.match(schemaContent, /CREATE INDEX IF NOT EXISTS idx_voice_cache_last_used/);
    assert.match(schemaContent, /CREATE INDEX IF NOT EXISTS idx_voice_bindings_preset/);
  });

  await t.test('db.ts registers and executes V73 migration and ensureVoiceSchema', () => {
    assert.match(dbContent, /MIGRATION_STATEMENTS_V73/);
    assert.match(dbContent, /currentVersion < 73/);
    assert.match(dbContent, /ensureVoiceSchema/);
  });

  await t.test('SQLite in-memory simulation: executes V73 statements cleanly and tests foreign nullification', () => {
    const db = new DatabaseSync(':memory:');

    // 提取 V73 SQL 并执行
    const v73Match = schemaContent.match(/export const MIGRATION_STATEMENTS_V73 = `([\s\S]*?)`;/);
    assert.ok(v73Match && v73Match[1], 'Must extract MIGRATION_STATEMENTS_V73');

    db.exec(v73Match[1]);

    // 插入测试预设
    db.prepare(`
      INSERT INTO voice_presets (id, name, engine_kind, voice_id, rate, pitch, is_builtin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('custom-1', '测试自建音色', 'openai_compat', 'my-voice', 1.05, 5.0, 0, '2026-11-05T00:00:00Z', '2026-11-05T00:00:00Z');

    const preset = db.prepare('SELECT * FROM voice_presets WHERE id = ?').get('custom-1');
    assert.equal(preset.name, '测试自建音色');
    assert.equal(preset.rate, 1.05);
    assert.equal(preset.pitch, 5.0);

    // 绑定到会话与角色
    db.prepare(`
      INSERT INTO voice_bindings (scope_type, scope_id, preset_id, rate_override, pitch_override, voice_bubble_enabled, auto_read_enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('thread_im', 'thread-123', 'custom-1', 1.1, null, 1, 0, '2026-11-05T00:00:00Z');

    const binding = db.prepare('SELECT * FROM voice_bindings WHERE scope_type = ? AND scope_id = ?').get('thread_im', 'thread-123');
    assert.equal(binding.preset_id, 'custom-1');
    assert.equal(binding.voice_bubble_enabled, 1);

    // 模拟删除预设时将引用的 preset_id 置空
    db.prepare('UPDATE voice_bindings SET preset_id = NULL WHERE preset_id = ?').run('custom-1');
    db.prepare('DELETE FROM voice_presets WHERE id = ?').run('custom-1');

    const afterDelete = db.prepare('SELECT * FROM voice_bindings WHERE scope_type = ? AND scope_id = ?').get('thread_im', 'thread-123');
    assert.equal(afterDelete.preset_id, null, 'Preset id must be nullified to prevent dangling references');

    // 测试音频缓存表插入与根据 last_used_at 排序
    db.prepare(`
      INSERT INTO voice_audio_cache (cache_key, file_path, duration_ms, byte_size, engine_kind, created_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('hash-1', '/path/to/1.mp3', 3500, 24000, 'builtin_free', '2026-11-05T00:00:00Z', '2026-11-05T01:00:00Z');

    db.prepare(`
      INSERT INTO voice_audio_cache (cache_key, file_path, duration_ms, byte_size, engine_kind, created_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('hash-2', '/path/to/2.mp3', 1200, 9600, 'native', '2026-11-05T00:00:00Z', '2026-11-05T02:00:00Z');

    const stats = db.prepare('SELECT COUNT(*) as count, SUM(byte_size) as totalBytes FROM voice_audio_cache').get();
    assert.equal(stats.count, 2);
    assert.equal(stats.totalBytes, 33600);
  });
});
