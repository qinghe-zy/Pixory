const assert = require('node:assert/strict');
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

test('snapshot candidate loading is bounded and materializes the visible branch route', () => {
  const repository = fs.readFileSync(path.join(root, 'src/database/repositories/aiThreadRepository.ts'), 'utf8');
  const method = /async listSnapshotCandidateMessages[\s\S]*?\n  },\n\n  async listCompletedMessagesInDateRange/.exec(repository)?.[0] ?? '';

  assert.match(method, /Math\.max\(96, roundLimit \* 4\)/);
  assert.match(method, /buildVisibleBranchClause\('ai_messages', branchScopes\)/);
  assert.match(method, /status = 'completed'/);
  assert.match(method, /role <> 'system'/);
  assert.match(method, /materializeMessagesForBranchScopes\(db, rows, branchScopes\)/);
  assert.match(method, /materialized\.filter\(\(message\) => message\.status === 'completed' && message\.role !== 'system'\)/);
});
