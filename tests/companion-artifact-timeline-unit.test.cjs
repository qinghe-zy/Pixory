const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTypeScriptModule(filename) {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = function (module, sourcePath) {
    module._compile(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, sourcePath);
  };
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename);
  } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
}

const servicePath = path.join(root, 'src/ai/companion/companionArtifactTimelineService.ts');
const timeline = fs.existsSync(servicePath) ? loadTypeScriptModule(servicePath) : {};

function message(id, createdAt) {
  return { id, createdAt };
}

function artifact(id, kind, sourceMessageIds, createdAt) {
  return { id, kind, sourceMessageIds, createdAt, payload: { label: id } };
}

function keys(items) {
  return items.map((item) => item.type === 'message'
    ? `message:${item.message.id}`
    : `${item.artifact.kind}:${item.artifact.id}`);
}

test('a modern diary stays immediately after its last source when newer messages arrive', () => {
  assert.equal(typeof timeline.buildCompanionArtifactTimeline, 'function');
  const diary = artifact('diary-1', 'diary', ['m1', 'm2'], '2026-08-08T10:30:00.000Z');
  const before = timeline.buildCompanionArtifactTimeline({
    messages: [message('m1', '2026-08-08T10:00:00.000Z'), message('m2', '2026-08-08T10:05:00.000Z')],
    artifacts: [diary],
  });
  const after = timeline.buildCompanionArtifactTimeline({
    messages: [
      message('m1', '2026-08-08T10:00:00.000Z'),
      message('m2', '2026-08-08T10:05:00.000Z'),
      message('m3', '2026-08-08T11:00:00.000Z'),
    ],
    artifacts: [diary],
  });

  assert.deepEqual(keys(before), ['message:m1', 'message:m2', 'diary:diary-1']);
  assert.deepEqual(keys(after), ['message:m1', 'message:m2', 'diary:diary-1', 'message:m3']);
});

test('rebuilding the timeline produces the same modern anchor position', () => {
  const input = {
    messages: [message('m1', '2026-08-08T10:00:00.000Z'), message('m2', '2026-08-08T10:05:00.000Z')],
    artifacts: [artifact('dream-1', 'dream', ['m1'], '2026-08-08T11:00:00.000Z')],
  };

  assert.deepEqual(keys(timeline.buildCompanionArtifactTimeline(input)), keys(timeline.buildCompanionArtifactTimeline({
    messages: [...input.messages],
    artifacts: input.artifacts.map((item) => ({ ...item, sourceMessageIds: [...item.sourceMessageIds] })),
  })));
});

test('a modern artifact with an unloaded anchor is hidden without timestamp fallback', () => {
  const items = timeline.buildCompanionArtifactTimeline({
    messages: [message('visible', '2026-08-08T10:00:00.000Z')],
    artifacts: [artifact('unloaded', 'dream', ['visible', 'missing'], '2026-08-08T10:30:00.000Z')],
  });

  assert.deepEqual(keys(items), ['message:visible']);
});

test('a legacy artifact uses the nearest not-later message and hides without an eligible message', () => {
  const messages = [
    message('m1', '2026-08-08T10:00:00.000Z'),
    message('m2', '2026-08-08T11:00:00.000Z'),
    message('m3', '2026-08-08T12:00:00.000Z'),
  ];
  const items = timeline.buildCompanionArtifactTimeline({
    messages,
    artifacts: [
      artifact('legacy', 'diary', [], '2026-08-08T11:30:00.000Z'),
      artifact('too-early', 'dream', [], '2026-08-08T09:00:00.000Z'),
    ],
  });

  assert.deepEqual(keys(items), ['message:m1', 'message:m2', 'diary:legacy', 'message:m3']);
});

test('same-anchor artifacts sort by createdAt and then id across all artifact kinds', () => {
  const items = timeline.buildCompanionArtifactTimeline({
    messages: [message('anchor', '2026-08-08T10:00:00.000Z')],
    artifacts: [
      artifact('z', 'dreamJob', ['anchor'], '2026-08-08T10:03:00.000Z'),
      artifact('b', 'dream', ['anchor'], '2026-08-08T10:02:00.000Z'),
      artifact('a', 'diary', ['anchor'], '2026-08-08T10:02:00.000Z'),
    ],
  });

  assert.deepEqual(keys(items), ['message:anchor', 'diary:a', 'dream:b', 'dreamJob:z']);
});

test('duplicate artifact identities render only once', () => {
  const duplicate = artifact('same', 'dream', ['anchor'], '2026-08-08T10:02:00.000Z');
  const items = timeline.buildCompanionArtifactTimeline({
    messages: [message('anchor', '2026-08-08T10:00:00.000Z')],
    artifacts: [duplicate, { ...duplicate, payload: { label: 'reloaded duplicate' } }],
  });

  assert.deepEqual(keys(items), ['message:anchor', 'dream:same']);
});

test('timeline preserves message order exactly and inserts no synthetic date nodes', () => {
  const messages = [
    message('late-clock', '2026-08-09T00:00:00.000Z'),
    message('early-clock', '2026-08-08T00:00:00.000Z'),
  ];
  const items = timeline.buildCompanionArtifactTimeline({
    messages,
    artifacts: [artifact('card', 'dream', ['late-clock'], '2026-08-10T00:00:00.000Z')],
  });

  assert.deepEqual(keys(items), ['message:late-clock', 'dream:card', 'message:early-clock']);
  assert.equal(items.some((item) => item.type === 'dateSeparator'), false);
});

class AsyncDatabase {
  constructor() {
    this.db = new DatabaseSync(':memory:');
  }

  async getAllAsync(sql, ...params) {
    return this.db.prepare(sql).all(...params);
  }

  async getFirstAsync(sql, ...params) {
    return this.db.prepare(sql).get(...params);
  }

  close() {
    this.db.close();
  }
}

test('diary listing joins only the current version and parses source message ids defensively', async () => {
  const db = new AsyncDatabase();
  db.db.exec(`
    CREATE TABLE companion_diaries (
      id TEXT PRIMARY KEY, roleCardId TEXT, diaryDate TEXT, currentVersionId TEXT,
      themeKey TEXT, bodyFontKey TEXT, status TEXT, sourceThreadId TEXT,
      sourceBranchRouteJson TEXT, sourceSnapshotHash TEXT, contextOptIn INTEGER,
      createdAt TEXT, updatedAt TEXT
    );
    CREATE TABLE companion_diary_versions (
      id TEXT PRIMARY KEY, diaryId TEXT, versionNumber INTEGER, body TEXT,
      pageLayoutJson TEXT, generationModelSnapshotJson TEXT, sourceMessageIdsJson TEXT,
      sourceSummarySnapshot TEXT, sourceSnapshotHash TEXT, status TEXT,
      createdAt TEXT, supersededAt TEXT
    );
  `);
  const insertDiary = db.db.prepare(`INSERT INTO companion_diaries VALUES
    (?, 'role-1', ?, ?, 'sage_botanical', 'system', 'ready', 'thread-1', '[]', 'hash', NULL, ?, ?)`);
  const insertVersion = db.db.prepare(`INSERT INTO companion_diary_versions VALUES
    (?, ?, ?, 'body', NULL, '{}', ?, NULL, 'hash', ?, ?, NULL)`);
  insertDiary.run('d1', '2026-08-08', 'd1-v2', '2026-08-08T10:00:00.000Z', '2026-08-08T10:00:00.000Z');
  insertVersion.run('d1-v1', 'd1', 1, '["old-source"]', 'superseded', '2026-08-08T09:00:00.000Z');
  insertVersion.run('d1-v2', 'd1', 2, '["current-user","current-assistant"]', 'current', '2026-08-08T10:00:00.000Z');
  insertDiary.run('d2', '2026-08-07', 'd2-v1', '2026-08-07T10:00:00.000Z', '2026-08-07T10:00:00.000Z');
  insertVersion.run('d2-v1', 'd2', 1, '{broken', 'current', '2026-08-07T10:00:00.000Z');
  insertDiary.run('d3', '2026-08-06', 'd3-v1', '2026-08-06T10:00:00.000Z', '2026-08-06T10:00:00.000Z');
  insertVersion.run('d3-v1', 'd3', 1, '["valid",42]', 'current', '2026-08-06T10:00:00.000Z');

  const repositoryPath = path.join(root, 'src/ai/diary/diaryRepository.ts');
  const repository = loadTypeScriptModule(repositoryPath).diaryRepository;
  const diaries = await repository.listCurrentDiariesForRole(db, 'role-1');

  assert.deepEqual(diaries.map((item) => item.sourceMessageIds), [
    ['current-user', 'current-assistant'],
    [],
    [],
  ]);
  db.close();
});
