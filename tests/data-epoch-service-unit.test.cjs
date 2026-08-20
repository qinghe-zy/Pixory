const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

function loadEpochService() {
  const filename = path.join(rootDir, 'src/services/dataEpochService.ts');
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { exports: module.exports, module }, { filename });
  return module.exports;
}

test('data epochs bump monotonically without invalidating other domains', () => {
  const { bumpDataEpoch, getDataEpoch } = loadEpochService();
  const mediaKeyBefore = `normal:media:${getDataEpoch('media')}:page-1`;

  assert.equal(getDataEpoch('media'), 0);
  assert.equal(getDataEpoch('ipLibrary'), 0);
  assert.equal(getDataEpoch('chatThread:thread-a'), 0);
  assert.equal(bumpDataEpoch('media'), 1);
  assert.equal(bumpDataEpoch('media'), 2);
  assert.equal(bumpDataEpoch('chatThread:thread-a'), 1);
  assert.equal(getDataEpoch('media'), 2);
  assert.equal(getDataEpoch('ipLibrary'), 0);
  assert.equal(getDataEpoch('chatThread:thread-b'), 0);

  const mediaKeyAfter = `normal:media:${getDataEpoch('media')}:page-1`;
  assert.notEqual(mediaKeyBefore, mediaKeyAfter);
});

test('media epochs isolate normal and Personal while global bumps remain fail-safe', () => {
  const { bumpDataEpoch, getDataEpoch } = loadEpochService();

  assert.equal(getDataEpoch('media', 'normal'), 0);
  assert.equal(getDataEpoch('media', 'personal'), 0);
  assert.equal(bumpDataEpoch('media', 'normal'), 1);
  assert.equal(getDataEpoch('media', 'normal'), 1);
  assert.equal(getDataEpoch('media', 'personal'), 0);
  assert.equal(bumpDataEpoch('media', 'personal'), 1);
  assert.equal(getDataEpoch('media', 'normal'), 1);
  assert.equal(getDataEpoch('media', 'personal'), 1);

  assert.equal(bumpDataEpoch('media'), 1);
  assert.equal(getDataEpoch('media', 'normal'), 2);
  assert.equal(getDataEpoch('media', 'personal'), 2);
});

test('database handles carry their own Pixory space without a mutable current-space global', () => {
  const filename = path.join(rootDir, 'src/database/databaseSpaceRegistry.ts');
  assert.equal(fs.existsSync(filename), true, 'database space registry must exist');
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { exports: module.exports, module, require }, { filename });
  const normalDb = {};
  const personalDb = {};
  module.exports.registerDatabaseSpace(normalDb, 'normal');
  module.exports.registerDatabaseSpace(personalDb, 'personal');
  assert.equal(module.exports.getRegisteredDatabaseSpace(normalDb), 'normal');
  assert.equal(module.exports.getRegisteredDatabaseSpace(personalDb), 'personal');
  assert.equal(module.exports.getRegisteredDatabaseSpace({}), undefined);
});

test('media repository invalidates reader sessions after structural writes', () => {
  const repositorySource = fs.readFileSync(path.join(rootDir, 'src/database/repositories/imageRepository.ts'), 'utf8');
  const viewerSource = fs.readFileSync(path.join(rootDir, 'src/screens/ImageViewerScreen.tsx'), 'utf8');

  assert.match(repositorySource, /getRegisteredDatabaseSpace/);
  assert.match(repositorySource, /async create[\s\S]{0,3400}bumpDataEpoch\('media', getRegisteredDatabaseSpace\(db\)\);[\s\S]{0,80}return record/);
  assert.match(repositorySource, /async update[\s\S]{0,4400}bumpDataEpoch\('media', getRegisteredDatabaseSpace\(db\)\);[\s\S]{0,80}return record/);
  assert.match(repositorySource, /async softDeleteMany[\s\S]{0,1900}if \(changedCount > 0\) \{[\s\S]{0,100}bumpDataEpoch\('media', getRegisteredDatabaseSpace\(db\)\)/);
  assert.match(viewerSource, /getDataEpoch\('media', context\.space\)/);
  const lastViewedBlock = repositorySource.slice(
    repositorySource.indexOf('async touchLastViewedAtMany'),
    repositorySource.indexOf('async clearRecentViewed')
  );
  assert.doesNotMatch(lastViewedBlock, /bumpDataEpoch\('media'/);
});
