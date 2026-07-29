const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const old = require.extensions['.ts'];
require.extensions['.ts'] = function compile(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
let protocol;
try { protocol = require(path.join(root, 'src/services/backupManifestProtocol.ts')); }
finally { if (old) require.extensions['.ts'] = old; else delete require.extensions['.ts']; }

test('manifest paths reject absolute, traversal, encoded traversal, and backslash forms', () => {
  assert.equal(protocol.isSafeBackupRelativePath('files/abc.bin'), true);
  for (const unsafe of ['/data/file', 'C:/data/file', '../file', 'files/../file', 'files/%2e%2e/file', 'files\\file']) {
    assert.equal(protocol.isSafeBackupRelativePath(unsafe), false, unsafe);
  }
});

test('manifest shape requires version 2, SHA-256, bounded size, scope, and relative paths', () => {
  const valid = {
    manifestVersion: 2,
    databaseRelativePath: 'database/pixory.sqlite',
    files: [{ logicalId: 'database:main', ownerType: 'database', ownerId: 'main', category: 'database', relativePath: 'database/pixory.sqlite', sha256: 'a'.repeat(64), size: 1, mimeType: 'application/vnd.sqlite3', originalUri: null, required: true, space: 'normal' }],
  };
  assert.doesNotThrow(() => protocol.assertManagedManifestShape(valid));
  assert.throws(() => protocol.assertManagedManifestShape({ ...valid, files: [{ ...valid.files[0], sha256: 'bad' }] }));
  assert.throws(() => protocol.assertManagedManifestShape({ ...valid, files: [{ ...valid.files[0], space: 'personal', relativePath: '../secret' }] }));
});

test('backup V2 covers AI files, validates before staging, and merges without overwriting target rows', () => {
  const managed = read('src/services/managedBackupService.ts');
  const backup = read('src/services/backupService.ts');
  assert.match(managed, /ai_documents[\s\S]*ai_message_attachments[\s\S]*ai_role_cards/);
  assert.match(managed, /HASH_CHUNK_BYTES/);
  assert.match(managed, /export async function hashManagedFile/);
  assert.match(managed, /relativePathByHash/);
  assert.match(managed, /INSERT OR IGNORE INTO/);
  assert.match(managed, /PRAGMA defer_foreign_keys = ON/);
  assert.match(managed, /managed-backup:/);
  assert.match(managed, /memory_import_id_map/);
  assert.match(managed, /logicalIdMaps/);
  assert.match(managed, /foreign_key_list/);
  assert.match(managed, /remapManagedLogicalReferences/);
  assert.match(managed, /row\.localUri = uri/);
  assert.match(managed, /row\.avatarUri = uri/);
  assert.match(backup, /await validateManagedBackupManifestV2\([\s\S]*await stageManagedAiFiles\(/);
  assert.match(backup, /stagedDestinationUris[\s\S]*deleteLocalFile/);
  assert.match(backup, /runBackupBuild[\s\S]*deleteLocalFile\(backupDir\)/);
  assert.match(backup, /createEncryptedPackFromBackup[\s\S]*finally \{[\s\S]*deleteLocalFile\(backup\.backupDir\)/);
  assert.doesNotMatch(backup, /originalRoot:\s*getOriginalsDir/);
});

test('citation schema stores answer-level positions and hides invalid rows from readers', () => {
  const schema = read('src/database/schema.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  for (const column of ['refId', 'claimStart', 'claimEnd', 'sourceExcerptHash', 'documentVersion', 'validationStatus', 'validationReason', 'usedAt']) {
    assert.match(schema, new RegExp(`ADD COLUMN ${column}\\b`));
  }
  assert.match(repository, /WHERE messageId = \? AND validationStatus = 'valid'/);
  assert.match(repository, /ORDER BY claimStart ASC/);
});
