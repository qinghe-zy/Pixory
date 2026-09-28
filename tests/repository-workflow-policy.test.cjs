const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('public repository documents the local/public branch boundary', () => {
  const docs = read('docs/repository-workflow.md');
  assert.match(docs, /`main` is the public branch/);
  assert.match(docs, /`local-work` is a local-only branch/);
  assert.match(docs, /git push origin main/);
  assert.match(docs, /Never merge the full `local-work` branch/);
  assert.match(docs, /scripts\/local\//);
  assert.match(docs, /版本文档/);
});

test('pre-push hook rejects private branches and non-public remotes', () => {
  const hook = read('.githooks/pre-push');
  assert.match(hook, /local-work\|local\/\*/);
  assert.match(hook, /remote_name.*origin/);
  assert.match(hook, /refs\/heads\/main:refs\/heads\/main/);
  assert.match(hook, /refs\/tags\/v\*:/);
  assert.match(hook, /git ls-tree -r --name-only/);
  assert.match(hook, /forbidden_paths/);
  assert.match(hook, /拒绝推送/);
  assert.match(hook, /PIXORY_RELEASE_HANDOFF/);
});
