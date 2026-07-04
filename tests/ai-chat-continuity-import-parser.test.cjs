const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { exports: module.exports, module, require }, { filename });
  return module.exports;
}

test('native continuity parser recognizes pixory markdown deterministically', () => {
  const { detectContinuityImportMode } = loadTsModule('src/ai/aiContinuityImportParser.ts');
  const mode = detectContinuityImportMode(`# Pixory Role Continuity Export\n\n## Native Continuity Metadata\n- Format Version: 1\n- Source: pixory-native\n`);

  assert.equal(mode.mode, 'pixory_native_markdown');
});

test('external continuity prompt requires hard markers and structured transcript blocks', () => {
  const { buildExternalContinuityPrompt } = loadTsModule('src/ai/aiContinuityImportPrompt.ts');
  const prompt = buildExternalContinuityPrompt();

  assert.match(prompt, /PIXORY-CONTINUITY-BEGIN/);
  assert.match(prompt, /PIXORY-CONTINUITY-END/);
  assert.match(prompt, /必须保留所有标题/);
  assert.match(prompt, /### 1\. user/);
  assert.match(prompt, /```text/);
  assert.match(prompt, /每个 `###` 只表示一条消息/);
});

test('txt files with pixory native markers are still treated as external text in v1', () => {
  const { parseContinuityImportDocument } = loadTsModule('src/ai/aiContinuityImportParser.ts');
  const parsed = parseContinuityImportDocument({
    fileName: 'Pixory-Role.txt',
    text: [
      '# Pixory Role Continuity Export',
      '',
      '## Native Continuity Metadata',
      '- Format Version: 1',
      '- Source: pixory-native',
      '',
      '用户：我们继续吧。',
      '助手：好，我接上。',
    ].join('\n'),
  });

  assert.equal(parsed.mode, 'external_text');
  assert.equal(parsed.messages.length, 2);
});

test('external continuity parser separates transcript messages from continuity blocks', () => {
  const { parseContinuityImportDocument } = loadTsModule('src/ai/aiContinuityImportParser.ts');
  const parsed = parseContinuityImportDocument({
    fileName: 'handoff.md',
    text: [
      '# Continuity',
      '## State Continuity Summary',
      '他们在车站分别前仍未说开。',
      '## Chat Transcript',
      'user: 你还会回来吗？',
      'assistant: 我会。',
    ].join('\n'),
  });

  assert.equal(parsed.mode, 'external_markdown');
  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.blocks.length, 1);
  assert.equal(parsed.blocks[0].kind, 'state_continuity_summary');
  assert.equal(parsed.containsCompressedContinuity, false);
  assert.equal(parsed.partial, false);
});

test('external continuity parser keeps immediate unlabeled continuation lines with the previous transcript message', () => {
  const { parseContinuityImportDocument } = loadTsModule('src/ai/aiContinuityImportParser.ts');
  const parsed = parseContinuityImportDocument({
    fileName: 'handoff.md',
    text: [
      '# Continuity',
      '## Metadata',
      '- Source Platform: OtherAI',
      '## Chat Transcript',
      'user: 你还会回来吗？',
      '这句没有角色标签，不能伪造成消息',
      'assistant: 我会。',
    ].join('\n'),
  });

  assert.equal(parsed.mode, 'external_markdown');
  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.messages[0].content, '你还会回来吗？\n这句没有角色标签，不能伪造成消息');
  assert.equal(parsed.partial, false);
  assert.equal(parsed.sourcePlatform, 'OtherAI');
});

test('external continuity parser still preserves truly unassigned transcript residue as continuity blocks and marks partial reconstruction', () => {
  const { parseContinuityImportDocument } = loadTsModule('src/ai/aiContinuityImportParser.ts');
  const parsed = parseContinuityImportDocument({
    fileName: 'handoff.md',
    text: [
      '# Continuity',
      '## Metadata',
      '- Source Platform: OtherAI',
      '## Chat Transcript',
      '### 1. user',
      '```text',
      '你还会回来吗？',
      '```',
      '这里多出一段无法归属到具体消息的说明',
      '### 2. assistant',
      '```text',
      '我会。',
      '```',
    ].join('\n'),
  });

  assert.equal(parsed.mode, 'external_markdown');
  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.partial, true);
  assert.ok(parsed.blocks.some((block) => block.title.includes('未安全还原')));
});

test('damaged pixory native markdown falls back to tolerant markdown parsing instead of bypassing review as trusted native', () => {
  const { parseContinuityImportDocument } = loadTsModule('src/ai/aiContinuityImportParser.ts');
  const parsed = parseContinuityImportDocument({
    fileName: 'Pixory-Role.md',
    text: [
      '# Pixory Role Continuity Export',
      '',
      '## Native Continuity Metadata',
      '- Format Version: 1',
      '- Source: pixory-native',
      '',
      '## Native Message Payload',
      '```json',
      '[{broken json',
      '```',
      '',
      '## 当前分支全量聊天上下文',
      '### 1. User · 2026-06-23T10:00:00.000Z',
      '',
      '````text',
      '你还记得我们在车站的约定吗？',
      '````',
      '',
      '### 2. Assistant · 2026-06-23T10:00:10.000Z',
      '',
      '````text',
      '记得，我没有忘。',
      '````',
    ].join('\n'),
  });

  assert.equal(parsed.mode, 'external_markdown');
  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.messages[0].role, 'user');
  assert.equal(parsed.messages[1].role, 'assistant');
  assert.equal(parsed.partial, false);
});

test('external continuity parser understands chinese headings and role labels', () => {
  const { parseContinuityImportDocument } = loadTsModule('src/ai/aiContinuityImportParser.ts');
  const parsed = parseContinuityImportDocument({
    fileName: 'handoff.md',
    text: [
      '# 连续性迁移',
      '## 元数据',
      '- 来源平台: 其他平台AI',
      '- 格式版本: 1',
      '## 状态连续摘要',
      '两人刚结束争执，但默认关系没有断裂。',
      '## 压缩历史',
      '更早的二十轮已压缩。',
      '## 聊天记录',
      '用户：你还在生气吗？',
      '助手：没有，我只是需要一点时间。',
      '系统：场景仍在雨夜车站。',
    ].join('\n'),
  });

  assert.equal(parsed.mode, 'external_markdown');
  assert.equal(parsed.sourcePlatform, '其他平台AI');
  assert.equal(parsed.formatVersion, '1');
  assert.equal(parsed.messages.length, 3);
  assert.equal(parsed.messages[0].role, 'user');
  assert.equal(parsed.messages[1].role, 'assistant');
  assert.equal(parsed.messages[2].role, 'system');
  assert.equal(parsed.containsCompressedContinuity, true);
  assert.ok(parsed.blocks.some((block) => block.kind === 'state_continuity_summary'));
});

test('external continuity parser reconstructs pixory exported transcript sections when native machine payload is damaged', () => {
  const { parseContinuityImportDocument } = loadTsModule('src/ai/aiContinuityImportParser.ts');
  const parsed = parseContinuityImportDocument({
    fileName: 'Pixory-Role.md',
    text: [
      '# Pixory Role Continuity Export',
      '',
      '## Native Continuity Metadata',
      '- Format Version: 1',
      '- Source: pixory-native',
      '',
      '## Native Message Payload',
      '```json',
      '{not valid',
      '```',
      '',
      '## 对话框续聊区',
      '### 1. User · 2026-06-23T09:59:00.000Z',
      '',
      '````text',
      '你昨天为什么没来？',
      '````',
      '',
      '### 2. Assistant · 2026-06-23T09:59:10.000Z',
      '',
      '````text',
      '我临时出了点事。',
      '````',
      '',
      '## 当前分支全量聊天上下文',
      '### 1. User · 2026-06-23T10:00:00.000Z',
      '',
      '````text',
      '你还记得我们在车站的约定吗？',
      '````',
      '',
      '### 2. Assistant · 2026-06-23T10:00:10.000Z',
      '',
      '````text',
      '记得，我没有忘。',
      '````',
    ].join('\n'),
  });

  assert.equal(parsed.mode, 'external_markdown');
  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.messages[0].content, '你还记得我们在车站的约定吗？');
  assert.equal(parsed.messages[1].content, '记得，我没有忘。');
});

test('external continuity parser understands delimited plain-text sections and structured transcript blocks', () => {
  const { parseContinuityImportDocument } = loadTsModule('src/ai/aiContinuityImportParser.ts');
  const parsed = parseContinuityImportDocument({
    fileName: 'handoff.txt',
    text: [
      '下面是给 Pixory 的迁移文档。',
      'PIXORY-CONTINUITY-BEGIN',
      'Metadata',
      '- Source Platform: OtherAI',
      '- Format Version: 1',
      '',
      'Relationship Continuity:',
      '他们仍默认彼此负责，还没有正式和解。',
      '',
      'Psychological Background',
      '用户嘴上冷淡，但其实在等对方先示弱。',
      '',
      'Chat Transcript',
      '### 1. user',
      '```text',
      '你如果还想继续，就别再躲着我。',
      '我不是想吵架，我只是想听实话。',
      '```',
      '',
      '### 2. assistant',
      '```text',
      '我没有想躲你。',
      '我是在想怎么把事情解释清楚。',
      '```',
      'PIXORY-CONTINUITY-END',
      '请按需使用。',
    ].join('\n'),
  });

  assert.equal(parsed.mode, 'external_text');
  assert.equal(parsed.sourcePlatform, 'OtherAI');
  assert.equal(parsed.formatVersion, '1');
  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.messages[0].role, 'user');
  assert.equal(parsed.messages[0].content, '你如果还想继续，就别再躲着我。\n我不是想吵架，我只是想听实话。');
  assert.equal(parsed.messages[1].role, 'assistant');
  assert.ok(parsed.blocks.some((block) => block.kind === 'relationship_summary'));
  assert.ok(parsed.blocks.some((block) => block.kind === 'psychology'));
  assert.equal(parsed.partial, false);
});

test('external continuity parser keeps multiline inline transcript messages together instead of dropping them into residue', () => {
  const { parseContinuityImportDocument } = loadTsModule('src/ai/aiContinuityImportParser.ts');
  const parsed = parseContinuityImportDocument({
    fileName: 'handoff.md',
    text: [
      '# Pixory External Continuity',
      '',
      '## Chat Transcript',
      'user:',
      '我知道你昨天其实看见消息了。',
      '你只是一直没回我。',
      '',
      'assistant:',
      '我看见了。',
      '但我当时不知道该怎么回答。',
      '',
      '## Long-Term Memory Candidates',
      '- 用户把“及时回应”视为重要的关系边界。',
    ].join('\n'),
  });

  assert.equal(parsed.mode, 'external_markdown');
  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.messages[0].content, '我知道你昨天其实看见消息了。\n你只是一直没回我。');
  assert.equal(parsed.messages[1].content, '我看见了。\n但我当时不知道该怎么回答。');
  assert.ok(parsed.blocks.some((block) => block.kind === 'memory_candidates'));
  assert.equal(parsed.partial, false);
});

test('external continuity parser keeps continuation lines attached to inline role messages', () => {
  const { parseContinuityImportDocument } = loadTsModule('src/ai/aiContinuityImportParser.ts');
  const parsed = parseContinuityImportDocument({
    fileName: 'handoff.md',
    text: [
      '# Pixory External Continuity',
      '',
      '## Chat Transcript',
      'user: 我没有要离开你。',
      '我只是昨天真的不知道怎么开口。',
      '',
      'assistant: 那你至少该告诉我你还在。',
      '而不是让我一个人乱想。',
    ].join('\n'),
  });

  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.messages[0].content, '我没有要离开你。\n我只是昨天真的不知道怎么开口。');
  assert.equal(parsed.messages[1].content, '那你至少该告诉我你还在。\n而不是让我一个人乱想。');
  assert.equal(parsed.partial, false);
});
