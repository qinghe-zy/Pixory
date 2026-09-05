const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('diagnostic export shares and saves the generated ZIP as a file', () => {
  const screen = fs.readFileSync('src/screens/DiagnosticsSettingsScreen.tsx', 'utf8');
  const service = fs.readFileSync('src/diagnostics/diagnosticExportService.ts', 'utf8');
  assert.match(screen, /Sharing\.shareAsync\(uri/);
  assert.match(screen, /runSave/);
  assert.match(service, /saveDiagnosticsToSystemDirectory/);
  assert.match(service, /copyFileToSafWithProgress/);
  assert.match(service, /诊断包 ZIP 生成失败或为空/);
});
