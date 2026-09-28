const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function thread(id, roleCardId, updatedAt, createdAt = updatedAt) {
  return { id, roleCardId, updatedAt, createdAt };
}

function loadCoordinator(capture = {}) {
  const filename = path.join(root, 'src/ai/diary/diaryRuntimeCoordinator.ts');
  assert.equal(fs.existsSync(filename), true, 'diary runtime coordinator must exist');
  const previousExtension = require.extensions['.ts'];
  const previousLoad = Module._load;
  require.extensions['.ts'] = function (module, sourcePath) {
    module._compile(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, sourcePath);
  };
  Module._load = function patchedLoad(request, parent, isMain) {
    if (parent?.filename === filename && request === '../../database') {
      return {
        runWithDatabaseSpace: async (space, callback) => {
          capture.openedSpaces = [...(capture.openedSpaces ?? []), space];
          return callback({});
        },
        aiThreadRepository: {
          listActiveRoleThreads: async () => capture.threads ?? [],
          resolveBranchLineage: async (_db, rootId, versionIndex) => {
            capture.resolvedRoutes = [...(capture.resolvedRoutes ?? []), [rootId, versionIndex]];
            return rootId ? [{ branchRootMessageId: rootId, branchVersionIndex: versionIndex }] : [];
          },
        },
        settingsRepository: { getValue: async () => capture.enabled === false ? 'false' : 'true' },
      };
    }
    if (parent?.filename === filename && request === './diaryGenerationManager') {
      return { resumeDiaryBackgroundTasks: (space) => { capture.resumed = [...(capture.resumed ?? []), space]; } };
    }
    if (parent?.filename === filename && request === './diarySchedulerService') {
      return {
        nextDiaryWakeupAt: () => '2026-08-08T14:00:00.000Z',
        runDueDiaryJobs: async (space) => { capture.dueRuns = [...(capture.dueRuns ?? []), space]; },
        scheduleDiaryWakeup: async (input) => { capture.wakeups = [...(capture.wakeups ?? []), input]; },
      };
    }
    return previousLoad(request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename);
  } finally {
    Module._load = previousLoad;
    if (previousExtension) require.extensions['.ts'] = previousExtension;
    else delete require.extensions['.ts'];
  }
}

test('selects one latest active thread per role deterministically', () => {
  const coordinator = loadCoordinator();
  assert.deepEqual(
    coordinator.selectLatestDiaryThreadPerRole([
      thread('old-a', 'role-a', '2026-08-07T10:00:00Z'),
      thread('new-a', 'role-a', '2026-08-08T10:00:00Z'),
      thread('only-b', 'role-b', '2026-08-06T10:00:00Z'),
      thread('no-role', null, '2026-08-09T10:00:00Z'),
    ]).map((item) => item.id),
    ['new-a', 'only-b'],
  );
});

test('coordinates due work and one branch-aware wakeup per latest role thread', async () => {
  const capture = {
    threads: [
      { ...thread('new-a', 'role-a', '2026-08-08T10:00:00Z'), currentBranchRootMessageId: 'root-a', currentBranchVersionIndex: 2 },
      { ...thread('old-a', 'role-a', '2026-08-07T10:00:00Z'), currentBranchRootMessageId: null, currentBranchVersionIndex: null },
      { ...thread('only-b', 'role-b', '2026-08-06T10:00:00Z'), currentBranchRootMessageId: null, currentBranchVersionIndex: null },
    ],
  };
  const coordinator = loadCoordinator(capture);

  await coordinator.coordinateDiaryRuntime({ space: 'normal', now: new Date('2026-08-08T12:00:00.000Z') });

  assert.deepEqual(capture.resumed, ['normal']);
  assert.deepEqual(capture.dueRuns, ['normal']);
  assert.equal(capture.wakeups.length, 2);
  assert.deepEqual(capture.wakeups.map((item) => item.threadId), ['new-a', 'only-b']);
  assert.deepEqual(capture.wakeups[0].branchScopes, [{ branchRootMessageId: 'root-a', branchVersionIndex: 2 }]);
});

test('personal coordination fails closed before opening its database unless explicitly allowed', async () => {
  const capture = {};
  const coordinator = loadCoordinator(capture);

  await assert.rejects(
    coordinator.coordinateDiaryRuntime({ space: 'personal' }),
    /unlock|Personal|个人空间/i,
  );
  assert.deepEqual(capture.openedSpaces ?? [], []);
  assert.deepEqual(capture.resumed ?? [], []);
});

test('disabled diary setting still reconciles durable due jobs but schedules no new wakeups', async () => {
  const capture = { enabled: false, threads: [thread('only', 'role', '2026-08-08T10:00:00Z')] };
  const coordinator = loadCoordinator(capture);

  await coordinator.coordinateDiaryRuntime({ space: 'normal' });

  assert.deepEqual(capture.dueRuns, ['normal']);
  assert.deepEqual(capture.wakeups ?? [], []);
});
