const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('backup export uses a remembered default system folder and shows concrete export details', () => {
  const source = readProjectFile('src/screens/BackupScreen.tsx');
  const serviceSource = readProjectFile('src/services/backupService.ts');
  const settingsSource = readProjectFile('src/database/repositories/settingsRepository.ts');

  assert.match(settingsSource, /BACKUP_EXPORT_DIRECTORY_URI_KEY/);
  assert.match(settingsSource, /getBackupExportDirectoryUri/);
  assert.match(settingsSource, /setBackupExportDirectoryUri/);
  assert.match(serviceSource, /requestBackupExportDirectory/);
  assert.match(serviceSource, /requestDirectoryPermissionsAsync\(initialDirectoryUri \?\? null\)/);
  assert.match(serviceSource, /exportBackupToSystemDirectory\(\s*backupDir: string,\s*destinationDirUri\?: string \| null/);
  assert.match(source, /默认导出文件夹/);
  assert.match(source, /chooseDefaultExportDirectory/);
  assert.match(source, /settingsRepository\.setBackupExportDirectoryUri/);
  assert.match(source, /function handleCreateFullBackup\(\)/);
  assert.match(source, /function handleCreateIpBackup\(ip: IpRecord\)/);
  assert.match(source, /createIpBackup\(ip\.id,\s*'normal'\)/);
  assert.match(source, /exportBackupToSystemDirectory\(result\.backupDir,\s*destinationDirUri\)/);
  assert.match(source, /导出到默认文件夹/);
  assert.match(source, /更改默认文件夹/);
  assert.match(source, /App 内部备份位置/);
  assert.match(source, /系统导出位置/);
  assert.match(source, /已生成本地资产包，未设置默认导出文件夹/);
  assert.doesNotMatch(source, /runBackup\(\(\) => createIpBackup\(ip\.id,\s*'normal'\),\s*`已导出/);
});
