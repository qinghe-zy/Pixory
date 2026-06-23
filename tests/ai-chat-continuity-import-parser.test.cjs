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

test('external continuity parser preserves unstructured transcript residue as continuity blocks and marks partial reconstruction', () => {
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
  assert.equal(parsed.partial, true);
  assert.equal(parsed.sourcePlatform, 'OtherAI');
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
