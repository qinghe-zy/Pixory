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
let promptService;
let snapshotService;
try {
  promptService = require(path.join(root, 'src/ai/diary/diaryPromptService.ts'));
  snapshotService = require(path.join(root, 'src/ai/companion/companionConversationSnapshotService.ts'));
} finally {
  if (original) require.extensions['.ts'] = original;
  else delete require.extensions['.ts'];
}

function message(id, role, createdAt, content, completedAt = createdAt) {
  return {
    id,
    threadId: 'thread-1',
    branchRootMessageId: null,
    branchVersionIndex: null,
    role,
    status: 'completed',
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
    updatedAt: createdAt,
    completedAt,
  };
}

test('separates today interaction from historical relationship background with Beijing timestamps', () => {
  const history = [
    message('old-user', 'user', '2026-08-07T12:30:00.000Z', '昨天聊过一件事'),
    message('old-assistant', 'assistant', '2026-08-07T12:31:00.000Z', '我记得'),
  ];
  const today = [
    message('today-user', 'user', '2026-08-08T14:10:00.000Z', '今天见'),
    message('today-assistant', 'assistant', '2026-08-08T14:11:00.000Z', '我来了'),
  ];

  const built = promptService.buildDiaryPrompt({
    roleContext: '温柔的陪伴者',
    threadSummary: null,
    standardContext: null,
    focusMessages: today,
    backgroundMessages: history,
  });

  assert.match(built.prompt, /\[今日互动\]/);
  assert.match(built.prompt, /\[2026-08-08 22:10\] 用户：今天见/);
  assert.match(built.prompt, /\[2026-08-08 22:11\] 角色：我来了/);
  assert.match(built.prompt, /\[过往关系背景\]/);
  assert.match(built.prompt, /以下仅用于保持人物、关系和语境。不得写成今天发生的事，也不得声称用户今天说过这些内容。/);
  assert.match(built.prompt, /\[2026-08-07 20:30\] 用户：昨天聊过一件事/);
  assert.deepEqual(built.sourceMessages.map((item) => item.id), [
    'old-user', 'old-assistant', 'today-user', 'today-assistant',
  ]);
});

test('states that today had no completed interaction without discarding historical background', () => {
  const history = [
    message('old-user', 'user', '2026-08-07T12:30:00.000Z', '昨天说过的话'),
    message('old-assistant', 'assistant', '2026-08-07T12:31:00.000Z', '昨天的回应'),
  ];

  const built = promptService.buildDiaryPrompt({
    roleContext: '温柔的陪伴者',
    threadSummary: '过去彼此约定过下次见面。',
    focusMessages: [],
    backgroundMessages: history,
  });

  assert.match(built.prompt, /今天没有与用户完成的互动。不得编造今天用户说过、做过或经历过什么。/);
  assert.match(built.prompt, /\[2026-08-07 20:30\] 用户：昨天说过的话/);
  assert.match(built.prompt, /\[2026-08-07 20:31\] 角色：昨天的回应/);
  assert.ok(
    built.prompt.indexOf('不得写成今天发生的事') < built.prompt.indexOf('[当前脉络]'),
    'the historical warning must govern the thread summary too',
  );
});

test('uses final assistant completion time to classify the diary day', () => {
  const messages = [
    message('user-midnight', 'user', '2026-08-07T15:58:00.000Z', '睡前聊聊'),
    message('assistant-midnight', 'assistant', '2026-08-07T15:59:00.000Z', '晚安', '2026-08-07T16:01:00.000Z'),
  ];

  const snapshot = snapshotService.buildDiaryConversationSnapshot({
    diaryDate: '2026-08-08',
    maxSourceCharacters: 24_000,
    messages,
    roundLimit: 30,
  });

  assert.equal(snapshot.focusRoundCount, 1);
  assert.equal(snapshot.backgroundRoundCount, 0);
  assert.equal(snapshot.anchorMessageId, 'assistant-midnight');
});

test('a normal second-pass budget drops oldest frozen rounds without moving the latest anchor', () => {
  const messages = [];
  for (let index = 1; index <= 4; index += 1) {
    const day = index < 4 ? '2026-08-07' : '2026-08-08';
    messages.push(
      message(`user-${index}`, 'user', `${day}T12:0${index}:00.000Z`, `用户内容${index}${'甲'.repeat(45)}`),
      message(`assistant-${index}`, 'assistant', `${day}T12:0${index}:30.000Z`, `角色内容${index}${'乙'.repeat(45)}`),
    );
  }
  const frozen = snapshotService.buildDiaryConversationSnapshot({
    diaryDate: '2026-08-08', maxSourceCharacters: 24_000, messages, roundLimit: 30,
  });
  const trimmed = snapshotService.buildDiaryConversationSnapshot({
    diaryDate: '2026-08-08', maxSourceCharacters: 300, messages: frozen.sourceMessages, roundLimit: 30,
  });

  assert.equal(frozen.anchorMessageId, 'assistant-4');
  assert.equal(trimmed.anchorMessageId, frozen.anchorMessageId);
  assert.equal(trimmed.sourceTrimmed, true);
  assert.ok(trimmed.roundCount > 0 && trimmed.roundCount < frozen.roundCount);
});

test('keeps the diary request private, first-person, and free of backstage concepts', () => {
  const source = fs.readFileSync(path.join(root, 'src/ai/diary/diaryPromptService.ts'), 'utf8');

  assert.match(source, /\[角色日记请求\]/);
  assert.match(source, /通常不超过 300 个汉字/);
  assert.match(source, /不得提及 AI、模型、系统、提示词、上下文、记忆、数据、生成/);
  assert.match(source, /formatCompanionBeijingTimestamp/);
});
