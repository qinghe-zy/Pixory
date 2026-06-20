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
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { exports: module.exports, module, require }, { filename });
  return module.exports;
}

test('exports standard SillyTavern PNG role card without Pixory private metadata', () => {
  const exporter = loadTsModule('src/ai/sillyTavernRoleCardExporter.ts');
  const parser = loadTsModule('src/ai/sillyTavernRoleCardParser.ts');

  const card = {
    id: 'role_1',
    space: 'normal',
    name: 'Mira',
    description: 'Keeps careful notes.',
    prompt: [
      '## 角色描述',
      'Archivist',
      '',
      '## 性格',
      'Precise',
      '',
      '## 场景',
      'A quiet archive',
      '',
      '## 系统提示',
      'Stay in character',
      '',
      '## 历史后指令',
      'Remember facts',
      '',
      '## 对话示例',
      '<START>\nMira: Hello',
    ].join('\n'),
    firstMessage: 'Hello.',
    alternateGreetings: ['Hello.', 'Welcome.'],
    sourceType: 'pixory_manual',
    sourceJson: null,
    defaultLanguage: null,
    defaultModelId: null,
    boundaryMode: 'free',
    avatarEnabled: false,
    avatarUri: null,
    tags: ['archive'],
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:00.000Z',
    archivedAt: null,
  };

  const pngBase64 = exporter.buildSillyTavernRoleCardPngBase64({ card });
  const parsed = parser.parseSillyTavernPngBase64(pngBase64);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.normalized.sourceType, 'sillytavern_png_v2');
  assert.equal(parsed.normalized.name, 'Mira');
  assert.match(parsed.normalized.prompt, /Archivist/);
  assert.match(parsed.normalized.prompt, /Stay in character/);
  assert.deepEqual(Array.from(parsed.normalized.alternateGreetings), ['Hello.', 'Welcome.']);
  assert.doesNotMatch(Buffer.from(pngBase64, 'base64').toString('latin1'), /pixory|generationMetrics|promptSnapshotJson|providerCache|apiKey/i);
});

test('exports non-structured Pixory prompts into the SillyTavern PNG role definition', () => {
  const exporter = loadTsModule('src/ai/sillyTavernRoleCardExporter.ts');
  const parser = loadTsModule('src/ai/sillyTavernRoleCardParser.ts');
  const card = {
    name: 'Noel',
    description: 'A winter guide.',
    prompt: 'Noel speaks softly, remembers old promises, and never breaks the snowy shrine persona.',
    firstMessage: 'The snow has not stopped.',
    alternateGreetings: [],
    sourceJson: null,
    tags: ['winter'],
  };

  const parsed = parser.parseSillyTavernPngBase64(exporter.buildSillyTavernRoleCardPngBase64({ card }));

  assert.equal(parsed.ok, true);
  assert.match(parsed.normalized.prompt, /Noel speaks softly/);
  assert.match(parsed.normalized.prompt, /snowy shrine persona/);
});

test('falls back to a valid PNG when the source avatar bytes are unusable', () => {
  const exporter = loadTsModule('src/ai/sillyTavernRoleCardExporter.ts');
  const parser = loadTsModule('src/ai/sillyTavernRoleCardParser.ts');
  const card = {
    name: 'Fallback',
    description: 'Uses safe default art.',
    prompt: 'Keep the fallback character intact.',
    firstMessage: 'Still here.',
    alternateGreetings: [],
    sourceJson: null,
    tags: [],
  };

  const pngBase64 = exporter.buildSillyTavernRoleCardPngBase64({
    basePngBase64: Buffer.from('not a png').toString('base64'),
    card,
  });
  const parsed = parser.parseSillyTavernPngBase64(pngBase64);

  assert.match(Buffer.from(pngBase64, 'base64').toString('latin1'), /IHDR/);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.normalized.name, 'Fallback');
});

test('builds full continuity markdown with separated system persona and chat continuation sections', () => {
  const exporter = loadTsModule('src/ai/aiRoleCardContinuityExport.ts');
  const markdown = exporter.buildRoleContinuityMarkdown({
    exportedAt: '2026-06-20T12:00:00.000Z',
    space: 'normal',
    roleCard: {
      id: 'role_1',
      name: 'Mira',
      description: 'Keeps careful notes.',
      prompt: '## 角色描述\nArchivist\n\n## 系统提示\nStay in character',
      firstMessage: 'Hello.',
      alternateGreetings: ['Welcome.'],
      sourceType: 'sillytavern_png_v2',
      sourceJson: JSON.stringify({
        spec: 'chara_card_v2',
        data: { name: 'Mira', personality: 'Precise', scenario: 'Archive' },
      }),
      boundaryMode: 'free',
      tags: ['archive'],
    },
    thread: {
      id: 'thread_1',
      title: 'Mira chat',
      systemPrompt: 'Thread system prompt',
      materialRulesSnapshot: 'Use cited materials carefully.',
      summary: 'They discussed the map room.',
      contextType: 'normal',
      roleInstructionWeight: 'high',
      replyPreference: 'detailed',
      boundaryMode: 'free',
    },
    memories: [
      { id: 'm1', scope: 'role', type: 'fact', content: 'Mira keeps a brass key.', importance: 0.9, confidence: 0.8 },
      { id: 'm2', scope: 'thread', type: 'decision', content: 'The current scene uses ## night markers.', importance: 0.8, confidence: 0.7 },
    ],
    messages: [
      { id: 'u1', role: 'user', status: 'completed', content: 'Do you still have the key?\n## User fake heading', createdAt: '2026-06-20T11:00:00.000Z' },
      { id: 'a1', role: 'assistant', status: 'completed', content: 'Yes, it is in my left pocket.\n```text\nnested fence\n```', createdAt: '2026-06-20T11:01:00.000Z', promptSnapshotJson: '{"generationMetrics":{}}' },
    ],
  });

  assert.match(markdown, /# Pixory Role Continuity Export/);
  assert.match(markdown, /## 系统人设区/);
  assert.match(markdown, /## 对话框续聊区/);
  assert.match(markdown, /## 全量上下文系统/);
  assert.match(markdown, /## 全量记忆快照/);
  assert.match(markdown, /## 当前分支全量聊天上下文/);
  assert.match(markdown, /Thread system prompt/);
  assert.match(markdown, /## 开场白/);
  assert.match(markdown, /## 备用开场白/);
  assert.match(markdown, /## 标签/);
  assert.match(markdown, /Mira keeps a brass key/);
  assert.match(markdown, /Do you still have the key\?/);
  assert.match(markdown, /Yes, it is in my left pocket\./);
  assert.match(markdown, /````text[\s\S]*## User fake heading[\s\S]*````/);
  assert.match(markdown, /````text[\s\S]*```text[\s\S]*nested fence[\s\S]*```[\s\S]*````/);
  assert.doesNotMatch(markdown, /promptSnapshotJson|generationMetrics|providerCache|apiKey|requestId/i);
});

test('current-thread role export is scoped to the visible branch and lives in session settings', () => {
  const serviceSource = fs.readFileSync(path.join(root, 'src/ai/aiRoleCardContinuityExportService.ts'), 'utf8');
  const chatSource = fs.readFileSync(path.join(root, 'src/screens/AiChatScreen.tsx'), 'utf8');
  const sessionConfigSource = fs.readFileSync(path.join(root, 'src/screens/AiSessionConfigScreen.tsx'), 'utf8');

  assert.match(serviceSource, /resolveBranchLineage/);
  assert.match(serviceSource, /currentBranchRootMessageId/);
  assert.match(serviceSource, /currentBranchVersionIndex/);
  assert.match(serviceSource, /branchScopes:\s*resolvedBranchScopes/);
  assert.doesNotMatch(serviceSource, /import \{ listThreadMessages \} from '\.\/aiChatService'/);
  assert.match(serviceSource, /listMessages\(db,\s*thread\.id,\s*undefined,\s*resolvedBranchScopes\)/);

  assert.doesNotMatch(chatSource, /exportRoleContinuityPackage|getExportableRoleCardIdForThread|导出当前角色包/);
  assert.match(sessionConfigSource, /exportRoleContinuityPackage/);
  assert.match(sessionConfigSource, /getExportableRoleCardIdForThread/);
  assert.match(sessionConfigSource, /currentRoleCardId/);
  assert.match(sessionConfigSource, /disabled=\{!threadId \|\| !currentRoleCardId \|\| exportingRolePackage\}/);
  assert.match(sessionConfigSource, /Alert\.alert\('导出私密角色包'/);
  assert.match(sessionConfigSource, /导出当前角色包/);
});
