const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalTsLoader = require.extensions['.ts'];
require.extensions['.ts'] = function compileTypeScript(module, sourcePath) {
  const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText;
  module._compile(output, sourcePath);
};

let schema;
try { schema = require(path.join(root, 'src/database/schema.ts')); }
finally {
  if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
  else delete require.extensions['.ts'];
}

test('V53 declares every Stage C projection dream and thought table', () => {
  const dbSource = fs.readFileSync(path.join(root, 'src/database/db.ts'), 'utf8');
  assert.ok(schema.DATABASE_VERSION >= 53);
  for (const table of [
    'companion_projection_snapshots', 'companion_affective_observations', 'companion_repairs',
    'companion_dream_scenes', 'companion_dream_seeds', 'companion_dream_jobs', 'companion_dreams',
    'companion_role_round_counters', 'companion_role_round_receipts',
    'companion_thought_events', 'companion_thought_jobs', 'companion_thoughts',
  ]) assert.match(schema.MIGRATION_STATEMENTS_V53, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(schema.MIGRATION_STATEMENTS_V53, /sourceSnapshotHash TEXT NOT NULL/);
  assert.match(schema.MIGRATION_STATEMENTS_V53, /idempotencyKey TEXT NOT NULL UNIQUE/);
  assert.match(schema.MIGRATION_STATEMENTS_V53, /leaseOwner TEXT/);
  assert.match(schema.MIGRATION_STATEMENTS_V53, /idx_companion_dream_jobs_ready/);
  assert.match(schema.MIGRATION_STATEMENTS_V53, /idx_companion_thoughts_delivery/);
  assert.match(schema.MIGRATION_STATEMENTS_V53, /classifierPromptTokens INTEGER/);
  assert.match(schema.MIGRATION_STATEMENTS_V53, /generationCompletionTokens INTEGER/);
  assert.match(schema.MIGRATION_STATEMENTS_V53, /promptTokens INTEGER/);
  assert.match(schema.MIGRATION_STATEMENTS_V53, /completionTokens INTEGER/);
  assert.ok(dbSource.indexOf('MIGRATION_STATEMENTS_V53') > dbSource.indexOf('MIGRATION_STATEMENTS_V52'));
  assert.match(dbSource, /currentVersion < 53[\s\S]*MIGRATION_STATEMENTS_V53/);
});
