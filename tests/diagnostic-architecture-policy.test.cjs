const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('diagnostic export keeps architecture metadata and explicit deep-only content boundary', () => {
  const exporter = fs.readFileSync('src/diagnostics/diagnosticExportService.ts', 'utf8');
  assert.match(exporter, /architecture\.json/);
  assert.match(exporter, /analysis-ready\.json/);
  assert.match(exporter, /checksums\.sha256/);
  assert.match(exporter, /input\.level === 'deep'/);
  assert.match(exporter, /conversation-snapshots\.jsonl/);
  assert.match(exporter, /correlationSaltScope: 'single_export_only'/);
  assert.match(exporter, /assertStandardExportPrivacy/);
});
