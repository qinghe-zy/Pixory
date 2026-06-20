const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const promptBuilderPath = path.join(root, 'src/ai/promptBuilder.ts');
const originalTsLoader = require.extensions['.ts'];

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const output = ts.transpileModule(require('node:fs').readFileSync(filename, 'utf8'), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { buildNormalChatPrompt } = require(promptBuilderPath);
if (originalTsLoader) {
  require.extensions['.ts'] = originalTsLoader;
} else {
  delete require.extensions['.ts'];
}

test('normal prompt preserves role card prompt text without importing greeting fields', () => {
  const prompt = buildNormalChatPrompt({
    chatMode: 'roleplay',
    memoryEpoch: 'thread:t1:role:r1',
    roleInstructionWeight: 'high',
    systemPrompt: '## 角色描述\nMira keeps careful notes.\n\n## 历史后指令\nRemember facts.',
    userMessage: '继续。',
  });

  assert.match(prompt.system, /Mira keeps careful notes/);
  assert.match(prompt.system, /Remember facts/);
  assert.match(prompt.system, /沉浸式对话框架/);
  assert.equal(prompt.cacheMetadata.promptLayerVersions.role, 3);
  assert.doesNotMatch(prompt.system, /下一条回复要求/);
  assert.doesNotMatch(prompt.user, /Mira keeps careful notes/);
  assert.match(prompt.user, /下一条回复要求/);
  assert.doesNotMatch(prompt.system + prompt.user, /alternateGreetings|firstMessage/);
});

test('normal prompt keeps dynamic material snippets out of the stable prefix hash', () => {
  const base = {
    chatMode: 'roleplay',
    memoryEpoch: 'thread:t1:role:r1',
    systemPrompt: 'Stay in character.',
    userMessage: '这份资料里有什么？',
  };
  const withoutMaterial = buildNormalChatPrompt(base);
  const withMaterial = buildNormalChatPrompt({
    ...base,
    materialSnippets: [{ label: 'doc-a', text: 'Only dynamic retrieval text.' }],
  });

  assert.equal(withMaterial.cacheMetadata.stablePrefixHash, withoutMaterial.cacheMetadata.stablePrefixHash);
  assert.notEqual(withMaterial.cacheMetadata.retrievalHash, withoutMaterial.cacheMetadata.retrievalHash);
  assert.match(withMaterial.user, /Only dynamic retrieval text/);
  assert.doesNotMatch(withMaterial.system, /Only dynamic retrieval text/);
});

test('normal roleplay prompt expands SillyTavern role fields into cache-aware prompt sections', () => {
  const sourceJson = JSON.stringify({
    spec: 'chara_card_v2',
    data: {
      name: 'Mira',
      description: 'Keeps a moonlit archive.',
      personality: 'Warm, precise, quietly playful.',
      scenario: '{{char}} and {{user}} are reviewing forbidden maps in the archive.',
      system_prompt: 'Stay in character as {{char}}.',
      post_history_instructions: 'Keep the current scene intimate and continuous.',
      mes_example: '<START>\n{{user}}: Are we alone?\n{{char}}: For now, yes.',
    },
  });

  const prompt = buildNormalChatPrompt({
    chatMode: 'roleplay',
    memoryEpoch: 'thread:t1:role:r1',
    roleCardContext: {
      name: 'Mira',
      sourceJson,
    },
    systemPrompt: '## 角色描述\nFallback text should not erase structured fields.',
    userMessage: '继续。',
  });

  assert.match(prompt.system, /SillyTavern 风格角色卡结构/);
  assert.match(prompt.system, /角色描述[\s\S]*Keeps a moonlit archive\./);
  assert.match(prompt.system, /性格[\s\S]*Warm, precise, quietly playful\./);
  assert.match(prompt.system, /场景[\s\S]*Mira and 用户 are reviewing forbidden maps/);
  assert.match(prompt.system, /系统提示[\s\S]*Stay in character as Mira\./);
  assert.match(prompt.system, /对话示例[\s\S]*Mira: For now, yes\./);
  assert.match(prompt.system, /只写当前角色这一条回复/);
  assert.match(prompt.system, /不要替用户决定/);
  assert.match(prompt.user, /历史后指令[\s\S]*Keep the current scene intimate and continuous\./);
  assert.doesNotMatch(prompt.system, /历史后指令[\s\S]*Keep the current scene intimate and continuous\./);
  assert.doesNotMatch(prompt.system + prompt.user, /sourceJson|alternate_greetings|first_mes/);
});

test('structured SillyTavern prompts do not duplicate folded role card sections', () => {
  const sourceJson = JSON.stringify({
    spec: 'chara_card_v2',
    data: {
      name: 'Mira',
      description: 'Keeps a moonlit archive.',
      personality: 'Warm, precise, quietly playful.',
      scenario: 'Archive at night.',
      system_prompt: 'Stay in character.',
      post_history_instructions: 'Stay close to the current exchange.',
      mes_example: '<START>\nMira: I kept the lamp low.',
    },
  });

  const prompt = buildNormalChatPrompt({
    chatMode: 'roleplay',
    memoryEpoch: 'thread:t1:role:r1',
    roleCardContext: { name: 'Mira', sourceJson },
    systemPrompt: [
      '## 角色描述',
      'Keeps a moonlit archive.',
      '',
      '## 性格',
      'Warm, precise, quietly playful.',
      '',
      '## 场景',
      'Archive at night.',
      '',
      '## 系统提示',
      'Stay in character.',
      '',
      '## 历史后指令',
      'Stay close to the current exchange.',
      '',
      '## 对话示例',
      '<START>\nMira: I kept the lamp low.',
      '',
      '## 附加设定',
      'The old maps are stored below the west stair.',
    ].join('\n'),
    userMessage: '继续。',
  });

  assert.equal((prompt.system.match(/Keeps a moonlit archive\./g) ?? []).length, 1);
  assert.equal((prompt.system.match(/Warm, precise, quietly playful\./g) ?? []).length, 1);
  assert.equal((prompt.system.match(/Archive at night\./g) ?? []).length, 1);
  assert.equal((prompt.system.match(/Stay in character\./g) ?? []).length, 1);
  assert.equal((prompt.system.match(/Mira: I kept the lamp low\./g) ?? []).length, 1);
  assert.match(prompt.system, /附加设定[\s\S]*The old maps are stored below the west stair\./);
  assert.doesNotMatch(prompt.system, /Stay close to the current exchange\./);
  assert.match(prompt.user, /Stay close to the current exchange\./);
});

test('SillyTavern source JSON fields take precedence over Pixory display description', () => {
  const sourceJson = JSON.stringify({
    spec: 'chara_card_v2',
    data: {
      name: 'Mira',
      description: 'Original ST character description.',
      personality: 'Original ST personality.',
    },
  });

  const prompt = buildNormalChatPrompt({
    chatMode: 'roleplay',
    memoryEpoch: 'thread:t1:role:r1',
    roleCardContext: {
      description: 'Pixory display notes from creator_notes.',
      name: 'Mira',
      sourceJson,
    },
    systemPrompt: '## 附加设定\nKeep the candle lit.',
    userMessage: '继续。',
  });

  assert.match(prompt.system, /角色描述[\s\S]*Original ST character description\./);
  assert.match(prompt.system, /性格[\s\S]*Original ST personality\./);
  assert.doesNotMatch(prompt.system, /Pixory display notes from creator_notes/);
});

test('high role instruction weight wraps structured SillyTavern role fields', () => {
  const sourceJson = JSON.stringify({
    spec: 'chara_card_v2',
    data: {
      name: 'Mira',
      description: 'Original ST character description.',
      personality: 'Original ST personality.',
    },
  });

  const prompt = buildNormalChatPrompt({
    chatMode: 'roleplay',
    memoryEpoch: 'thread:t1:role:r1',
    roleCardContext: { name: 'Mira', sourceJson },
    roleInstructionWeight: 'high',
    systemPrompt: [
      '## 角色描述',
      'Original ST character description.',
      '',
      '## 性格',
      'Original ST personality.',
    ].join('\n'),
    userMessage: '继续。',
  });

  assert.match(prompt.system, /【最高优先级：当前会话角色指令】[\s\S]*Original ST character description\./);
  assert.match(prompt.system, /下面内容定义本会话的身份、语气、边界和输出方式。[\s\S]*Original ST personality\./);
});

test('post-history role instructions do not change stable prefix hash between turns', () => {
  const base = {
    chatMode: 'roleplay',
    memoryEpoch: 'thread:t1:role:r1',
    roleCardContext: {
      name: 'Mira',
      postHistoryInstructions: 'Answer as the next beat of the scene.',
    },
    systemPrompt: 'Mira is present and vivid.',
  };
  const first = buildNormalChatPrompt({ ...base, userMessage: '第一句。' });
  const second = buildNormalChatPrompt({ ...base, userMessage: '第二句。' });

  assert.equal(first.cacheMetadata.stablePrefixHash, second.cacheMetadata.stablePrefixHash);
  assert.equal(first.cacheMetadata.retrievalHash, second.cacheMetadata.retrievalHash);
  assert.match(first.user, /Answer as the next beat of the scene\./);
});

test('SillyTavern roleplay frame is not injected into non-roleplay prompts without role cards', () => {
  const prompt = buildNormalChatPrompt({
    chatMode: 'companion',
    memoryEpoch: 'thread:t1:role:none',
    systemPrompt: 'You are a practical assistant.',
    userMessage: '帮我列一个清单。',
  });

  assert.doesNotMatch(prompt.system, /SillyTavern 风格沉浸式角色扮演要求/);
  assert.doesNotMatch(prompt.system, /只写当前角色这一条回复/);
});
