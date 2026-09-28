const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('clearTrash reports database deletion and file deletion outcomes separately', () => {
  const source = readProjectFile('src/services/trashService.ts');

  assert.match(source, /requestedCount:\s*number/);
  assert.match(source, /databaseDeletedCount:\s*number/);
  assert.match(source, /fileDeletedCount:\s*number/);
  assert.match(source, /fileFailures:\s*TrashClearFileFailure\[\]/);
});

test('clearTrash deletes database records before deleting local original and thumbnail files', () => {
  const source = readProjectFile('src/services/trashService.ts');
  const clearTrashStart = source.indexOf('export async function clearTrash');
  const databaseDeleteIndex = source.indexOf('deletePermanentlyMany', clearTrashStart);
  const fileDeleteIndex = source.indexOf('deleteTrashImageFiles', clearTrashStart);

  assert.notEqual(clearTrashStart, -1);
  assert.notEqual(databaseDeleteIndex, -1);
  assert.notEqual(fileDeleteIndex, -1);
  assert.ok(
    databaseDeleteIndex < fileDeleteIndex,
    'database records must be deleted before local files are removed'
  );
});
