const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('diagnostics uses extensible monitor and metric registries', () => {
  const registry = fs.readFileSync('src/diagnostics/diagnosticRegistry.ts', 'utf8');
  assert.match(registry, /registerDiagnosticMonitor/);
  assert.match(registry, /registerDiagnosticMetric/);
  assert.match(registry, /diagnosticCatalog/);
});

test('high-density diagnostic storage has operations, windows, and incidents', () => {
  const schema = fs.readFileSync('src/database/schema.ts', 'utf8');
  const exporter = fs.readFileSync('src/diagnostics/diagnosticExportService.ts', 'utf8');
  for (const table of ['diagnostic_operations', 'diagnostic_windows', 'diagnostic_incidents']) assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  for (const file of ['operations.jsonl', 'windows.jsonl', 'incidents.jsonl', 'metrics-catalog.json', 'monitors.json']) assert.match(exporter, new RegExp(file.replace('.', '\\.'), 'i'));
});

test('developer mode supports seven taps and settings exit', () => {
  const about = fs.readFileSync('src/screens/AboutScreen.tsx', 'utf8');
  const settings = fs.readFileSync('src/screens/SettingsScreen.tsx', 'utf8');
  const developerSettings = fs.readFileSync('src/screens/DeveloperModeSettingsScreen.tsx', 'utf8');
  assert.match(about, /count >= 7/);
  assert.match(about, /10000/);
  assert.match(about, /isDeveloperModeRevealEnabled/);
  assert.match(settings, /性能与诊断/);
  assert.match(developerSettings, /关闭开发者模式/);
});

test('settings hierarchy keeps diagnostics below the settings screen', () => {
  const me = fs.readFileSync('src/screens/MeScreen.tsx', 'utf8');
  const settings = fs.readFileSync('src/screens/SettingsScreen.tsx', 'utf8');
  assert.match(me, /设置/);
  assert.doesNotMatch(me, /性能与诊断/);
  assert.match(settings, /useDeveloperMode/);
  assert.match(settings, /onOpenDiagnostics/);
});
