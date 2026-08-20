const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function loadPitchModule() {
  const filename = path.join(rootDir, 'src/media/videoPlaybackRate.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { exports: module.exports, module }, { filename });
  return module.exports;
}

test('pitch preservation is enabled before assigning a valid playback rate', () => {
  const { applyPitchPreservingRate } = loadPitchModule();
  const calls = [];
  const player = {
    set preservesPitch(value) {
      calls.push(['pitch', value]);
    },
    set playbackRate(value) {
      calls.push(['rate', value]);
    },
  };

  applyPitchPreservingRate(player, 1.5);

  assert.deepEqual(calls, [['pitch', true], ['rate', 1.5]]);
});

test('invalid playback rates are rejected before mutating the player', () => {
  const { applyPitchPreservingRate } = loadPitchModule();
  const calls = [];
  const player = {
    set preservesPitch(value) {
      calls.push(['pitch', value]);
    },
    set playbackRate(value) {
      calls.push(['rate', value]);
    },
  };

  for (const rate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => applyPitchPreservingRate(player, rate), /positive finite/);
  }
  assert.deepEqual(calls, []);
});

test('video player routes every playback-rate write through the pitch helper', () => {
  const playerSource = readProjectFile('src/screens/VideoPlayerScreen.tsx');

  assert.match(playerSource, /import \{ applyPitchPreservingRate \} from '\.\.\/media\/videoPlaybackRate'/);
  assert.doesNotMatch(playerSource, /\b(?:instance|player)\.playbackRate\s*=/);
  assert.ok((playerSource.match(/applyPitchPreservingRate\(/g) ?? []).length >= 5);
});
