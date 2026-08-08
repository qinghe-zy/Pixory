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

test('dream preserves global caller sequence across equal-timestamp background and manual trigger categories', () => {
  const createdAt = '2026-08-08T08:00:00.000Z';
  const backgroundUser = message('u-bg', 'user', createdAt);
  const backgroundAssistant = message('a-bg', 'assistant', createdAt);
  const manualTrigger = message('u-manual', 'user', createdAt);
  const snapshot = snapshots.buildDreamConversationSnapshot({
    maxSourceCharacters: 100_000,
    messages: [backgroundUser, backgroundAssistant, manualTrigger],
    triggerMessageIds: [manualTrigger.id],
  });

  assert.deepEqual(snapshot.sourceMessageIds, [backgroundUser.id, backgroundAssistant.id, manualTrigger.id]);
  assert.equal(snapshot.anchorMessageId, manualTrigger.id);
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

test('an automatic trigger round remains protected when its complete round exceeds the source budget', () => {
  const triggerRound = round(1, '2026-08-08', '-protected').map((item) => ({ ...item, content: 'x'.repeat(200) }));
  const snapshot = snapshots.buildDreamConversationSnapshot({
    maxSourceCharacters: 0,
    messages: triggerRound,
    triggerMessageIds: [triggerRound[0].id],
  });

  assert.deepEqual(snapshot.sourceMessageIds, triggerRound.map((item) => item.id));
  assert.equal(snapshot.anchorMessageId, triggerRound[1].id);
  assert.equal(snapshot.focusRoundCount, 1);
});

test('equal timestamps preserve user-before-assistant semantic ordering and assistant anchors', () => {
  const createdAt = '2026-08-08T08:00:00.000Z';
  const user = message('u1', 'user', createdAt);
  const assistants = [message('a1', 'assistant', createdAt), message('a2', 'assistant', createdAt)];
  const snapshot = snapshots.buildDiaryConversationSnapshot({
    diaryDate: '2026-08-08',
    maxSourceCharacters: 100_000,
    messages: [user, ...assistants],
  });

  assert.equal(snapshot.roundCount, 1);
  assert.deepEqual(snapshot.sourceMessageIds, ['u1', 'a1', 'a2']);
  assert.equal(snapshot.anchorMessageId, 'a2');
});

test('equal timestamps preserve two complete rounds in their caller sequence', () => {
  const createdAt = '2026-08-08T08:00:00.000Z';
  const messages = [
    message('u1', 'user', createdAt),
    message('a1', 'assistant', createdAt),
    message('u2', 'user', createdAt),
    message('a2', 'assistant', createdAt),
  ];
  const snapshot = snapshots.buildDiaryConversationSnapshot({ diaryDate: '2026-08-08', maxSourceCharacters: 100_000, messages });

  assert.equal(snapshot.roundCount, 2);
  assert.deepEqual(snapshot.sourceMessageIds, ['u1', 'a1', 'u2', 'a2']);
  assert.equal(snapshot.anchorMessageId, 'a2');
});

test('an equal-timestamp assistant greeting remains unpaired before the later user-assistant round', () => {
  const createdAt = '2026-08-08T08:00:00.000Z';
  const greeting = message('a-greeting', 'assistant', createdAt);
  const user = message('u1', 'user', createdAt);
  const reply = message('a-reply', 'assistant', createdAt);
  const snapshot = snapshots.buildDiaryConversationSnapshot({ diaryDate: '2026-08-08', maxSourceCharacters: 100_000, messages: [greeting, user, reply] });

  assert.equal(snapshot.roundCount, 1);
  assert.deepEqual(snapshot.sourceMessageIds, [user.id, reply.id]);
  assert.equal(snapshot.anchorMessageId, reply.id);
});

test('late assistant completion does not reorder consecutive conversation rounds or their anchor', () => {
  const messages = [
    message('u1', 'user', '2026-08-08T08:00:00.000Z'),
    message('a1', 'assistant', '2026-08-08T08:01:00.000Z', 'first reply', { completedAt: '2026-08-08T08:05:00.000Z' }),
    message('u2', 'user', '2026-08-08T08:02:00.000Z'),
    message('a2', 'assistant', '2026-08-08T08:03:00.000Z', 'second reply', { completedAt: '2026-08-08T08:04:00.000Z' }),
  ];
  const snapshot = snapshots.buildDiaryConversationSnapshot({
    diaryDate: '2026-08-08',
    maxSourceCharacters: 100_000,
    messages,
  });

  assert.equal(snapshot.roundCount, 2);
  assert.deepEqual(snapshot.sourceMessageIds, ['u1', 'a1', 'u2', 'a2']);
  assert.equal(snapshot.anchorMessageId, 'a2');
});

test('dream caps trigger-containing focus rounds and does not restore omitted-round triggers', () => {
  const focusRounds = Array.from({ length: 21 }, (_, index) => round(index + 1, '2026-08-08', '-cap'));
  const snapshot = snapshots.buildDreamConversationSnapshot({
    maxSourceCharacters: 100_000,
    messages: focusRounds.flat(),
    triggerMessageIds: focusRounds.map((items) => items[0].id),
  });

  assert.equal(snapshot.focusRoundCount, 20);
  assert.equal(snapshot.roundCount, 20);
  assert.equal(snapshot.sourceMessageIds.includes(focusRounds[0][0].id), false);
  assert.equal(snapshot.sourceMessageIds.includes(focusRounds.at(-1)[0].id), true);
});

test('dream treats zero and negative round limits as zero without splitting completed triggers into focus evidence', () => {
  const triggerRound = round(1, '2026-08-08', '-zero');
  for (const roundLimit of [0, -1]) {
    const snapshot = snapshots.buildDreamConversationSnapshot({
      maxSourceCharacters: 100_000,
      messages: triggerRound,
      roundLimit,
      triggerMessageIds: [triggerRound[0].id],
    });
    assert.equal(snapshot.roundCount, 0);
    assert.deepEqual(snapshot.sourceMessageIds, []);
  }
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

test('diary retains its only latest complete round and assistant anchor when that round exceeds the model budget', () => {
  const oversizedRound = [
    message('diary-oversized-user', 'user', '2026-08-08T08:00:00.000Z', '甲'.repeat(1_800)),
    message('diary-oversized-assistant', 'assistant', '2026-08-08T08:01:00.000Z', '乙'.repeat(1_800)),
  ];
  const snapshot = snapshots.buildDiaryConversationSnapshot({
    diaryDate: '2026-08-08',
    maxSourceCharacters: 3_000,
    messages: oversizedRound,
    roundLimit: 30,
  });

  assert.equal(snapshot.roundCount, 1);
  assert.deepEqual(snapshot.sourceMessageIds, oversizedRound.map((item) => item.id));
  assert.equal(snapshot.anchorMessageId, 'diary-oversized-assistant');
});

test('diary model-budget trimming removes older rounds before its protected latest anchor round', () => {
  const olderRounds = Array.from({ length: 3 }, (_, index) => round(index + 1, '2026-08-07'))
    .flat()
    .map((item) => ({ ...item, content: '旧'.repeat(900) }));
  const latestRound = [
    message('diary-latest-user', 'user', '2026-08-08T08:00:00.000Z', '今'.repeat(1_800)),
    message('diary-latest-assistant', 'assistant', '2026-08-08T08:01:00.000Z', '日'.repeat(1_800)),
  ];
  const snapshot = snapshots.buildDiaryConversationSnapshot({
    diaryDate: '2026-08-08',
    maxSourceCharacters: 3_000,
    messages: [...olderRounds, ...latestRound],
    roundLimit: 30,
  });

  assert.equal(snapshot.roundCount, 1);
  assert.deepEqual(snapshot.sourceMessageIds, latestRound.map((item) => item.id));
  assert.equal(snapshot.anchorMessageId, 'diary-latest-assistant');
  assert.equal(snapshot.sourceTrimmed, true);
});

test('diary uses valid createdAt when completedAt is malformed and excludes records without any valid timestamp', () => {
  const fallbackRound = [
    message('fallback-user', 'user', '2026-08-08T08:00:00.000Z'),
    message('fallback-assistant', 'assistant', '2026-08-08T08:01:00.000Z', 'reply', { completedAt: 'not-a-timestamp' }),
  ];
  const invalidMessages = [
    message('invalid-user', 'user', 'not-a-timestamp'),
    message('invalid-assistant', 'assistant', 'not-a-timestamp'),
  ];
  const snapshot = snapshots.buildDiaryConversationSnapshot({
    diaryDate: '2026-08-08',
    maxSourceCharacters: 100_000,
    messages: [...fallbackRound, ...invalidMessages],
  });

  assert.deepEqual(snapshot.sourceMessageIds, fallbackRound.map((item) => item.id));
  assert.equal(snapshot.anchorMessageId, 'fallback-assistant');
});

test('an invalid diary date does not classify messages using raw timestamp prefixes', () => {
  const snapshot = snapshots.buildDiaryConversationSnapshot({
    diaryDate: 'not-a-date',
    maxSourceCharacters: 100_000,
    messages: round(1, '2026-08-08'),
  });

  assert.equal(snapshot.roundCount, 0);
  assert.deepEqual(snapshot.sourceMessageIds, []);
});

test('source ordering and hashes are stable, and Beijing timestamps use Asia/Shanghai', () => {
  const first = message('a', 'user', '2026-08-08T08:00:00.000Z', 'first', { updatedAt: '2026-08-08T08:01:00.000Z' });
  const second = message('b', 'assistant', '2026-08-08T08:00:00.000Z', 'second');
  const snapshot = snapshots.buildDreamConversationSnapshot({ maxSourceCharacters: 100_000, messages: [first, second, second], triggerMessageIds: [first.id] });
  const expectedHashes = snapshot.sourceMessages.map((item) => validation.hashCompanionMessageVersion(item));
  const expectedSnapshotHash = validation.hashCompanionText(snapshot.sourceMessageIds.map((id, index) => `${id}:${expectedHashes[index]}`).join('\u001F'));

  assert.equal(snapshots.formatCompanionBeijingTimestamp('2026-08-08T08:00:00.000Z'), '2026-08-08 16:00');
  assert.deepEqual(snapshot.sourceMessageIds, ['a', 'b']);
  assert.deepEqual(snapshot.sourceMessageVersionHashes, expectedHashes);
  assert.equal(snapshot.sourceSnapshotHash, expectedSnapshotHash);
});

test('conflicting duplicate IDs select the same canonical message regardless of input order', () => {
  const earlier = message('duplicate-user', 'user', '2026-08-08T08:00:00.000Z', 'earlier', { updatedAt: '2026-08-08T08:01:00.000Z' });
  const later = message('duplicate-user', 'user', '2026-08-08T08:00:00.000Z', 'later', { updatedAt: '2026-08-08T08:02:00.000Z' });
  const assistant = message('duplicate-assistant', 'assistant', '2026-08-08T08:03:00.000Z');
  const first = snapshots.buildDreamConversationSnapshot({ maxSourceCharacters: 100_000, messages: [earlier, later, assistant], triggerMessageIds: [later.id] });
  const reversed = snapshots.buildDreamConversationSnapshot({ maxSourceCharacters: 100_000, messages: [assistant, later, earlier], triggerMessageIds: [later.id] });

  assert.deepEqual(first.sourceMessageIds, reversed.sourceMessageIds);
  assert.deepEqual(first.sourceMessageVersionHashes, reversed.sourceMessageVersionHashes);
  assert.equal(first.sourceSnapshotHash, reversed.sourceSnapshotHash);
  assert.equal(first.sourceMessages[0].content, 'later');
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

test('snapshot candidate loading preserves SQLite row order for equal materialized timestamps', async () => {
  const db = new AsyncDatabase();
  createRepositorySchema(db);
  const createdAt = '2026-08-08T08:00:00.000Z';
  insertRepositoryMessage(db, { createdAt, id: 'z-first', role: 'assistant', status: 'completed' });
  insertRepositoryMessage(db, {
    branchRootMessageId: 'a-second',
    branchVersionIndex: 1,
    createdAt,
    id: 'a-second',
    role: 'assistant',
    status: 'generating',
  });
  db.db.prepare(`INSERT INTO ai_message_versions (
    id, originalMessageId, threadId, versionIndex, role, status, content,
    reasoningText, errorMessage, providerId, modelId, modelSnapshotJson, promptSnapshotJson,
    citationsJson, messageCreatedAt, messageUpdatedAt, messageCompletedAt, createdAt
  ) VALUES ('version-same-time', 'a-second', 'thread-1', 1, 'assistant', 'completed', 'selected version', NULL, NULL, NULL, NULL, '{}', '{}', '[]', ?, ?, ?, ?)`).run(createdAt, createdAt, createdAt, createdAt);

  const repository = loadRepository();
  const messages = await repository.listSnapshotCandidateMessages(db, 'thread-1', 20, [{ branchRootMessageId: 'a-second', branchVersionIndex: 1 }]);

  assert.deepEqual(messages.map((item) => item.id), ['z-first', 'a-second']);
  db.close();
});

test('snapshot candidate loading scans past newer failed generating and system noise', async () => {
  const db = new AsyncDatabase();
  createRepositorySchema(db);
  const timestamp = (seconds) => new Date(Date.UTC(2026, 7, 8, 0, 0, seconds)).toISOString();
  for (let index = 0; index < 60; index += 1) {
    insertRepositoryMessage(db, {
      createdAt: timestamp(index), id: `eligible-${String(index).padStart(3, '0')}`,
      role: index % 2 === 0 ? 'user' : 'assistant', status: 'completed',
    });
  }
  for (let index = 0; index < 120; index += 1) {
    const mode = index % 3;
    insertRepositoryMessage(db, {
      createdAt: timestamp(60 + index), id: `noise-${String(index).padStart(3, '0')}`,
      role: mode === 0 ? 'system' : mode === 1 ? 'assistant' : 'user',
      status: mode === 0 ? 'completed' : mode === 1 ? 'failed' : 'generating',
    });
  }

  const repository = loadRepository();
  const messages = await repository.listSnapshotCandidateMessages(db, 'thread-1', 30, []);

  assert.equal(messages.length, 60);
  assert.deepEqual(messages.map((item) => item.id), Array.from({ length: 60 }, (_, index) => `eligible-${String(index).padStart(3, '0')}`));
  db.close();
});

test('snapshot candidate loading returns the newest bounded eligible window in ascending order', async () => {
  const db = new AsyncDatabase();
  createRepositorySchema(db);
  const timestamp = (seconds) => new Date(Date.UTC(2026, 7, 8, 0, 0, seconds)).toISOString();
  for (let index = 0; index < 140; index += 1) {
    insertRepositoryMessage(db, {
      createdAt: timestamp(index), id: `eligible-${String(index).padStart(3, '0')}`,
      role: index % 2 === 0 ? 'user' : 'assistant', status: 'completed',
    });
  }

  const repository = loadRepository();
  const limit20 = await repository.listSnapshotCandidateMessages(db, 'thread-1', 20, []);
  const limit30 = await repository.listSnapshotCandidateMessages(db, 'thread-1', 30, []);

  assert.equal(limit20.length, 96);
  assert.equal(limit20[0].id, 'eligible-044');
  assert.equal(limit20.at(-1).id, 'eligible-139');
  assert.equal(limit30.length, 120);
  assert.equal(limit30[0].id, 'eligible-020');
  assert.equal(limit30.at(-1).id, 'eligible-139');
  db.close();
});

test('an old selected branch root cannot displace a newer eligible message after a noisy scan page', async () => {
  const db = new AsyncDatabase();
  createRepositorySchema(db);
  const timestamp = (seconds) => new Date(Date.UTC(2026, 7, 8, 0, 0, seconds)).toISOString();
  insertRepositoryMessage(db, {
    branchRootMessageId: 'old-root', branchVersionIndex: 1,
    createdAt: timestamp(0), id: 'old-root', role: 'assistant', status: 'generating',
  });
  db.db.prepare(`INSERT INTO ai_message_versions (
    id, originalMessageId, threadId, versionIndex, role, status, content,
    reasoningText, errorMessage, providerId, modelId, modelSnapshotJson, promptSnapshotJson,
    citationsJson, messageCreatedAt, messageUpdatedAt, messageCompletedAt, createdAt
  ) VALUES ('old-root-version', 'old-root', 'thread-1', 1, 'assistant', 'completed', 'old selected version', NULL, NULL, NULL, NULL, '{}', '{}', '[]', ?, ?, ?, ?)`)
    .run(timestamp(0), timestamp(0), timestamp(0), timestamp(0));
  for (let index = 1; index <= 121; index += 1) {
    insertRepositoryMessage(db, {
      createdAt: timestamp(index), id: `eligible-${String(index).padStart(3, '0')}`,
      role: index % 2 === 0 ? 'user' : 'assistant', status: 'completed',
    });
  }
  insertRepositoryMessage(db, {
    createdAt: timestamp(122), id: 'newest-noise', role: 'assistant', status: 'failed',
  });

  const repository = loadRepository();
  const messages = await repository.listSnapshotCandidateMessages(
    db, 'thread-1', 30, [{ branchRootMessageId: 'old-root', branchVersionIndex: 1 }],
  );

  assert.equal(messages.length, 120);
  assert.equal(messages.some((item) => item.id === 'old-root'), false);
  assert.equal(messages[0].id, 'eligible-002');
  assert.equal(messages.at(-1).id, 'eligible-121');
  db.close();
});
