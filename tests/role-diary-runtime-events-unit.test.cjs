const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadRuntimeEvents() {
  const filename = path.join(root, 'src/ai/diary/diaryRuntimeEvents.ts');
  assert.equal(fs.existsSync(filename), true, 'diary runtime events must exist');
  const previousExtension = require.extensions['.ts'];
  require.extensions['.ts'] = function (module, sourcePath) {
    module._compile(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, sourcePath);
  };
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename);
  } finally {
    if (previousExtension) require.extensions['.ts'] = previousExtension;
    else delete require.extensions['.ts'];
  }
}

test('publishes diary completion only to active subscribers', () => {
  const events = loadRuntimeEvents();
  const received = [];
  const unsubscribe = events.subscribeDiaryRuntimeNotices((notice) => received.push(notice));

  events.emitDiaryRuntimeNotice({
    diaryId: 'diary-a',
    jobId: 'job-a',
    roleCardId: 'role-a',
    space: 'normal',
    threadId: 'thread-a',
    type: 'completed',
  });
  unsubscribe();
  events.emitDiaryRuntimeNotice({
    diaryId: 'diary-b',
    jobId: 'job-b',
    roleCardId: 'role-b',
    space: 'normal',
    threadId: 'thread-b',
    type: 'completed',
  });

  assert.deepEqual(received, [{
    diaryId: 'diary-a',
    jobId: 'job-a',
    roleCardId: 'role-a',
    space: 'normal',
    threadId: 'thread-a',
    type: 'completed',
  }]);
});

test('scheduler emits after a durable diary completion and chat reloads matching role cards', () => {
  const scheduler = fs.readFileSync(path.join(root, 'src/ai/diary/diarySchedulerService.ts'), 'utf8');
  const chat = fs.readFileSync(path.join(root, 'src/screens/AiChatScreen.tsx'), 'utf8');

  assert.match(scheduler, /emitDiaryRuntimeNotice/);
  assert.match(chat, /subscribeDiaryRuntimeNotices/);
  assert.match(chat, /notice\.roleCardId/);
  assert.match(chat, /reloadRoleDiaries\(\)/);
});
