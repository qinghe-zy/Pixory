const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const schema = fs.readFileSync(path.join(root, 'src/database/schema.ts'), 'utf8');
const db = fs.readFileSync(path.join(root, 'src/database/db.ts'), 'utf8');

const requiredTables = [
  'memory_claims',
  'memory_events',
  'memory_evidence',
  'memory_outbox',
  'memory_projection_meta',
  'memory_import_id_map',
  'memory_deletion_certificates',
  'memory_episodes',
  'memory_relational_states',
  'memory_profiles',
  'memory_board_projection',
  'memory_current_turn_observations',
  'memory_ontology_predicates',
  'memory_ontology_aliases',
  'memory_embeddings',
  'memory_lineage_meta',
];

test('memory v1 schema is registered as a repeatable migration', () => {
  assert.match(schema, /DATABASE_VERSION\s*=\s*5[1-9]/);
  assert.match(schema, /MIGRATION_STATEMENTS_V47/);
  assert.match(db, /MIGRATION_STATEMENTS_V47/);
  assert.match(db, /currentVersion\s*<\s*47/);
  assert.match(schema, /MIGRATION_STATEMENTS_V48/);
  assert.match(db, /currentVersion\s*<\s*48/);
});

test('memory v1 migration declares every required table and active indexes', () => {
  for (const table of requiredTables) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`), table);
  }
  assert.match(schema, /uq_memory_claims_active_canonical/);
  assert.match(schema, /idx_memory_current_turn_pending/);
  assert.match(schema, /idx_memory_board_lane/);
  assert.match(schema, /ontology-v1/);
});

test('memory v1 schema includes lineage and current-turn retention fields', () => {
  assert.match(schema, /lineageVersion INTEGER NOT NULL DEFAULT 0/);
  assert.match(schema, /expiresAt TEXT NOT NULL/);
  assert.match(schema, /status TEXT NOT NULL CHECK \(status IN \('pending', 'consumed', 'expired', 'deleted'\)\)/);
  assert.match(schema, /ALTER TABLE ai_threads ADD COLUMN lineageVersion INTEGER NOT NULL DEFAULT 0/);
});
