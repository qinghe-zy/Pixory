const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadDiaryTypes() {
  const filename = path.join(root, 'src/ai/diary/diaryTypes.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', 'require', compiled)(module, module.exports, require);
  return module.exports;
}

test('uses an explicit Asia/Shanghai diary calendar policy', () => {
  const source = readFileSync('src/ai/diary/diaryTypes.ts', 'utf8');

  assert.match(source, /export function beijingDiaryDate/);
  assert.match(source, /DIARY_TIME_ZONE\s*=\s*'Asia\/Shanghai'/);
  assert.match(source, /timeZone:\s*DIARY_TIME_ZONE/);
  assert.match(source, /export function decideDiaryTrigger/);
  assert.match(source, /auto_late_evening/);
});

test('automatic diary can use recent history when the Beijing day has no completed chat', () => {
  const { decideDiaryTrigger } = loadDiaryTypes();
  const decision = decideDiaryTrigger({
    hasCurrentDiary: false,
    hasDayChat: false,
    isSessionActive: false,
    lastInteractionAt: '2026-08-07T14:45:00.000Z',
    lastRealInteractionAt: '2026-08-07T14:45:00.000Z',
    now: '2026-08-08T14:30:00.000Z',
    sessionStartedAt: null,
  });

  assert.deepEqual(decision, { kind: 'auto_idle_monologue', diaryDate: '2026-08-08' });
});

test('automatic diary does not backfill indefinitely or duplicate a completed diary', () => {
  const { decideDiaryTrigger } = loadDiaryTypes();
  const base = {
    hasDayChat: false,
    isSessionActive: false,
    lastInteractionAt: '2026-08-07T14:29:00.000Z',
    lastRealInteractionAt: '2026-08-07T14:29:00.000Z',
    now: '2026-08-08T14:30:00.000Z',
    sessionStartedAt: null,
  };

  assert.deepEqual(decideDiaryTrigger({ ...base, hasCurrentDiary: false }), { kind: 'none' });
  assert.deepEqual(decideDiaryTrigger({ ...base, hasCurrentDiary: true }), { kind: 'none' });
});
