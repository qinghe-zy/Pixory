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
let prompts, snapshots;
try {
  prompts = require(path.join(root, 'src/ai/dream/dreamPromptService.ts'));
  snapshots = require(path.join(root, 'src/ai/companion/companionConversationSnapshotService.ts'));
} finally {
  if (original) require.extensions['.ts'] = original;
  else delete require.extensions['.ts'];
}

function message(id, role, content, createdAt) {
  return { id, threadId:'thread-a',branchRootMessageId:null,branchVersionIndex:null,role,status:'completed',content,reasoningText:null,errorMessage:null,providerId:null,modelId:null,modelSnapshotJson:'{}',promptSnapshotJson:'{}',continuityImportSessionId:null,continuitySyntheticKind:null,createdAt,updatedAt:createdAt,completedAt:createdAt };
}

test('dream prompts separate Beijing-stamped current evidence from historical relationship background', () => {
  const oldUser=message('old-u','user','昨天聊过海边','2026-08-07T02:00:00.000Z');
  const oldAssistant=message('old-a','assistant','我记得那阵海风','2026-08-07T02:01:00.000Z');
  const currentUser=message('now-u','user','我们一起睡吧','2026-08-08T14:00:00.000Z');
  const currentAssistant=message('now-a','assistant','我在你身边闭上眼','2026-08-08T14:01:00.000Z');
  const snapshot=snapshots.buildDreamConversationSnapshot({messages:[oldUser,oldAssistant,currentUser,currentAssistant],triggerMessageIds:['now-u','now-a'],roundLimit:20,maxSourceCharacters:18000});

  const classifier=prompts.buildDreamClassificationPrompt(snapshot);
  const generator=prompts.buildDreamGenerationPrompt({roleVoice:'安静温柔',snapshot});
  for (const prompt of [classifier, generator]) {
    assert.match(prompt.userPrompt,/\[当前触发证据\]/);
    assert.match(prompt.userPrompt,/\[过往关系背景\]/);
    assert.match(prompt.userPrompt,/2026-08-08 22:00/);
    assert.match(prompt.userPrompt,/2026-08-07 10:00/);
    assert.match(prompt.systemPrompt,/过往关系背景/);
    assert.match(prompt.systemPrompt,/当前触发证据/);
  }
});
