const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('diagnostic export shares and saves the generated ZIP as a file', () => {
  const screen = fs.readFileSync('src/screens/DiagnosticsSettingsScreen.tsx', 'utf8');
  const service = fs.readFileSync('src/diagnostics/diagnosticExportService.ts', 'utf8');
  assert.match(screen, /saveDiagnosticsToSystemDirectory/);
  assert.match(screen, /目标会话（可多选）/);
  assert.match(screen, /下载标准诊断包到设备/);
  assert.match(service, /threadIdHashes/);
  assert.match(service, /saveDiagnosticsToSystemDirectory/);
  assert.match(service, /copyFileToSafWithProgress/);
  assert.match(service, /诊断包 ZIP 生成失败或为空/);
});
