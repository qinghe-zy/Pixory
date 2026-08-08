const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const original = require.extensions['.ts'];
require.extensions['.ts'] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
let snapshots;
let validation;
try {
  snapshots = require(path.join(root, 'src/ai/companion/companionConversationSnapshotService.ts'));
  validation = require(path.join(root, 'src/ai/companion/companionRuntimeValidation.ts'));
} finally {
  if (original) require.extensions['.ts'] = original;
  else delete require.extensions['.ts'];
}

function loadRepository() {
  const filename = path.join(root, 'src/database/repositories/aiThreadRepository.ts');
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = function (module, sourcePath) {
    module._compile(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, sourcePath);
  };
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename).aiThreadRepository;
  } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
}

class AsyncDatabase {
  constructor() {
    this.db = new DatabaseSync(':memory:');
  }

  async getAllAsync(sql, ...params) {
    return this.db.prepare(sql).all(...params);
  }

  close() {
    this.db.close();
  }
}

function createRepositorySchema(db) {
  db.db.exec(`
    CREATE TABLE ai_messages (
      id TEXT PRIMARY KEY, threadId TEXT NOT NULL, branchRootMessageId TEXT,
      branchVersionIndex INTEGER, role TEXT, status TEXT, content TEXT,
      reasoningText TEXT, errorMessage TEXT, providerId TEXT, modelId TEXT,
      modelSnapshotJson TEXT, promptSnapshotJson TEXT, continuityImportSessionId TEXT,
      continuitySyntheticKind TEXT, createdAt TEXT, updatedAt TEXT, completedAt TEXT
    );
    CREATE TABLE ai_message_versions (
      id TEXT PRIMARY KEY, originalMessageId TEXT, threadId TEXT, versionIndex INTEGER,
      role TEXT, status TEXT, content TEXT, reasoningText TEXT, errorMessage TEXT,
      providerId TEXT, modelId TEXT, modelSnapshotJson TEXT, promptSnapshotJson TEXT,
      citationsJson TEXT, messageCreatedAt TEXT, messageUpdatedAt TEXT,
      messageCompletedAt TEXT, createdAt TEXT
    );
    CREATE TABLE ai_continuity_import_sessions (id TEXT PRIMARY KEY, reviewGateState TEXT);
  `);
}

function insertRepositoryMessage(db, input) {
  db.db.prepare(`INSERT INTO ai_messages (
    id, threadId, branchRootMessageId, branchVersionIndex, role, status, content,
    reasoningText, errorMessage, providerId, modelId, modelSnapshotJson, promptSnapshotJson,
    continuityImportSessionId, continuitySyntheticKind, createdAt, updatedAt, completedAt
  ) VALUES (?, 'thread-1', ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, '{}', '{}', NULL, NULL, ?, ?, ?)`)
    .run(input.id, input.branchRootMessageId ?? null, input.branchVersionIndex ?? null, input.role, input.status, input.content ?? input.id, input.createdAt, input.updatedAt ?? input.createdAt, input.completedAt ?? null);
}

function message(id, role, createdAt, content = id, options = {}) {
  return {
    id,
    threadId: 'thread-1',
    branchRootMessageId: null,
    branchVersionIndex: null,
    role,
    status: options.status ?? 'completed',
    content,
    reasoningText: null,
    errorMessage: null,
    providerId: null,
    modelId: null,
    modelSnapshotJson: '{}',
    promptSnapshotJson: '{}',
    continuityImportSessionId: null,
    continuitySyntheticKind: null,
    createdAt,
    updatedAt: options.updatedAt ?? createdAt,
    completedAt: options.completedAt ?? createdAt,
  };
}

function round(index, day, suffix = '') {
  const minute = String(index % 60).padStart(2, '0');
  return [
    message(`u-${day}-${index}${suffix}`, 'user', `${day}T0${Math.floor(index / 60)}:${minute}:00.000Z`, `user ${day} ${index}`),
    message(`a-${day}-${index}${suffix}`, 'assistant', `${day}T0${Math.floor(index / 60)}:${minute}:30.000Z`, `assistant ${day} ${index}`),
  ];
}

test('diary snapshots retain today rounds before backfilled history and anchor the latest assistant', () => {
  const messages = [
    ...Array.from({ length: 4 }, (_, index) => round(index + 1, '2026-08-07')).flat(),
    ...Array.from({ length: 28 }, (_, index) => round(index + 1, '2026-08-08')).flat(),
  ];
  const snapshot = snapshots.buildDiaryConversationSnapshot({ diaryDate: '2026-08-08', maxSourceCharacters: 100_000, messages });

  assert.equal(snapshot.focusRoundCount, 28);
  assert.equal(snapshot.backgroundRoundCount, 2);
  assert.equal(snapshot.roundCount, 30);
  assert.equal(snapshot.anchorMessageId, 'a-2026-08-08-28');
  assert.deepEqual(snapshot.sourceMessageIds.slice(0, 4), ['u-2026-08-07-3', 'a-2026-08-07-3', 'u-2026-08-07-4', 'a-2026-08-07-4']);
  assert.equal(snapshot.sourceMessageIds.at(-1), 'a-2026-08-08-28');
});

test('diary respects an exact 30-round focus limit without backfilling history', () => {
  const messages = [
    ...Array.from({ length: 5 }, (_, index) => round(index + 1, '2026-08-07')).flat(),
    ...Array.from({ length: 30 }, (_, index) => round(index + 1, '2026-08-08')).flat(),
  ];
  const snapshot = snapshots.buildDiaryConversationSnapshot({ diaryDate: '2026-08-08', maxSourceCharacters: 100_000, messages });

  assert.equal(snapshot.focusRoundCount, 30);
  assert.equal(snapshot.backgroundRoundCount, 0);
  assert.equal(snapshot.roundCount, 30);
});

test('dream keeps an unpaired manual trigger plus 20 complete background rounds and uses the trigger as anchor', () => {
  const manual = message('manual-trigger', 'user', '2026-08-08T08:00:00.000Z', 'write a dream for me');
  const messages = [manual, ...Array.from({ length: 24 }, (_, index) => round(index + 1, '2026-08-08')).flat()];
  const snapshot = snapshots.buildDreamConversationSnapshot({ maxSourceCharacters: 100_000, messages, triggerMessageIds: [manual.id] });

  assert.equal(snapshot.focusRoundCount, 0);
  assert.equal(snapshot.backgroundRoundCount, 20);
  assert.equal(snapshot.roundCount, 20);
  assert.equal(snapshot.focusMessages.length, 1);
  assert.equal(snapshot.focusMessages[0].id, manual.id);
  assert.equal(snapshot.anchorMessageId, manual.id);
  assert.equal(snapshot.sourceMessageIds.length, 41);
});

test('dream counts an automatic trigger round inside its 20-round total and excludes incomplete rounds', () => {
  const triggerRound = round(1, '2026-08-08', '-trigger');
  const incomplete = [message('u-incomplete', 'user', '2026-08-08T10:00:00.000Z')];
  const messages = [
    ...Array.from({ length: 25 }, (_, index) => round(index + 2, '2026-08-08')).flat(),
    ...triggerRound,
    ...incomplete,
  ];
  const snapshot = snapshots.buildDreamConversationSnapshot({
    maxSourceCharacters: 100_000,
    messages,
    triggerMessageIds: [triggerRound[0].id],
  });

  assert.equal(snapshot.focusRoundCount, 1);
  assert.equal(snapshot.backgroundRoundCount, 19);
  assert.equal(snapshot.roundCount, 20);
  assert.deepEqual(snapshot.focusMessages.map((item) => item.id), triggerRound.map((item) => item.id));
  assert.equal(snapshot.sourceMessageIds.includes('u-incomplete'), false);
});

test('dream respects an exact 20-round automatic-trigger focus limit without background rounds', () => {
  const focusRounds = Array.from({ length: 20 }, (_, index) => round(index + 1, '2026-08-08'));
  const backgroundRounds = Array.from({ length: 5 }, (_, index) => round(index + 1, '2026-08-07'));
  const snapshot = snapshots.buildDreamConversationSnapshot({
    maxSourceCharacters: 100_000,
    messages: [...backgroundRounds.flat(), ...focusRounds.flat()],
    triggerMessageIds: focusRounds.map((items) => items[0].id),
  });

  assert.equal(snapshot.focusRoundCount, 20);
  assert.equal(snapshot.backgroundRoundCount, 0);
  assert.equal(snapshot.roundCount, 20);
});

test('trimming removes whole oldest background rounds before focus rounds', () => {
  const focus = round(1, '2026-08-08', '-focus').map((item) => ({ ...item, content: 'focus' }));
  const oldBackground = round(1, '2026-08-07', '-old').map((item) => ({ ...item, content: 'background-old' }));
  const newBackground = round(2, '2026-08-07', '-new').map((item) => ({ ...item, content: 'background-new' }));
  const snapshot = snapshots.buildDreamConversationSnapshot({
    maxSourceCharacters: 130,
    messages: [...oldBackground, ...newBackground, ...focus],
    triggerMessageIds: [focus[0].id],
  });

  assert.equal(snapshot.sourceTrimmed, true);
  assert.deepEqual(snapshot.focusMessages.map((item) => item.id), focus.map((item) => item.id));
  assert.deepEqual(snapshot.backgroundMessages.map((item) => item.id), newBackground.map((item) => item.id));
});

test('an oversized unpaired trigger remains protected when its formatted message exceeds the budget', () => {
  const manual = message('oversized-manual', 'user', '2026-08-08T08:00:00.000Z', 'x'.repeat(200));
  const snapshot = snapshots.buildDreamConversationSnapshot({
    maxSourceCharacters: 1,
    messages: [manual],
    triggerMessageIds: [manual.id],
  });

  assert.equal(snapshot.sourceTrimmed, false);
  assert.deepEqual(snapshot.sourceMessageIds, [manual.id]);
});

test('source ordering and hashes are stable, and Beijing timestamps use Asia/Shanghai', () => {
  const first = message('a', 'user', '2026-08-08T08:00:00.000Z', 'first', { updatedAt: '2026-08-08T08:01:00.000Z' });
  const second = message('b', 'assistant', '2026-08-08T08:00:00.000Z', 'second');
  const snapshot = snapshots.buildDreamConversationSnapshot({ maxSourceCharacters: 100_000, messages: [second, first, second], triggerMessageIds: [first.id] });
  const expectedHashes = snapshot.sourceMessages.map((item) => validation.hashCompanionMessageVersion(item));
  const expectedSnapshotHash = validation.hashCompanionText(snapshot.sourceMessageIds.map((id, index) => `${id}:${expectedHashes[index]}`).join('\u001F'));

  assert.equal(snapshots.formatCompanionBeijingTimestamp('2026-08-08T08:00:00.000Z'), '2026-08-08 16:00');
  assert.deepEqual(snapshot.sourceMessageIds, ['a', 'b']);
  assert.deepEqual(snapshot.sourceMessageVersionHashes, expectedHashes);
  assert.equal(snapshot.sourceSnapshotHash, expectedSnapshotHash);
});

test('snapshot candidate loading includes completed selected versions and reorders their materialized timestamps', async () => {
  const db = new AsyncDatabase();
  createRepositorySchema(db);
  insertRepositoryMessage(db, {
    branchRootMessageId: 'branch-root',
    branchVersionIndex: 1,
    createdAt: '2026-08-08T01:00:00.000Z',
    id: 'branch-root',
    role: 'assistant',
    status: 'generating',
  });
  insertRepositoryMessage(db, {
    createdAt: '2026-08-08T02:00:00.000Z',
    id: 'visible-completed',
    role: 'assistant',
    status: 'completed',
  });
  db.db.prepare(`INSERT INTO ai_message_versions (
    id, originalMessageId, threadId, versionIndex, role, status, content,
    reasoningText, errorMessage, providerId, modelId, modelSnapshotJson, promptSnapshotJson,
    citationsJson, messageCreatedAt, messageUpdatedAt, messageCompletedAt, createdAt
  ) VALUES ('version-1', 'branch-root', 'thread-1', 1, 'assistant', 'completed', 'selected historical version', NULL, NULL, NULL, NULL, '{}', '{}', '[]', '2026-08-08T03:00:00.000Z', '2026-08-08T03:00:00.000Z', '2026-08-08T03:00:00.000Z', '2026-08-08T03:00:00.000Z')`).run();

  const repository = loadRepository();
  const messages = await repository.listSnapshotCandidateMessages(db, 'thread-1', 20, [{ branchRootMessageId: 'branch-root', branchVersionIndex: 1 }]);

  assert.deepEqual(messages.map((item) => item.id), ['visible-completed', 'branch-root']);
  assert.equal(messages[1].status, 'completed');
  assert.equal(messages[1].createdAt, '2026-08-08T03:00:00.000Z');
  db.close();
});
