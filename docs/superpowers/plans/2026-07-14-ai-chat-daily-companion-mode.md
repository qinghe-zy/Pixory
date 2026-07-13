# AI Chat Daily Companion Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不复制第二套聊天系统的前提下，为 Pixory 增加可切换的“日常陪伴”模式、可靠多消息连发、即时通信时间节奏和精简聊天顶部，同时保持现有沉浸对话、历史、记忆、分支与 provider 前缀缓存正确。

**Architecture:** 会话保存下一轮模式，消息保存模式快照；一个 assistant 父消息通过 SQLite 子片段表示多气泡回复。provider 输出先经过纯协议分类器，普通沉浸回复继续走现有流式管线，日常陪伴或显式 `<messages>` 回复进入片段事务和可中断演出。提示词保持 `共同稳定 system → 原样历史 → 当前用户消息 → 当前轮模式协议`，避免模式切换破坏历史大前缀。

**Tech Stack:** Expo 54、React Native 0.81、TypeScript 5.9、Expo SQLite、现有 provider adapters、Node `node:test`、项目 design tokens。

---

## 执行前约束

- 从包含本实施计划的最新 `main` 创建独立 worktree；不要在当前包含 README、功能矩阵、手册和其他未跟踪计划的脏工作区直接实现。
- 执行前先运行 `git status --short --branch`，确认 worktree 没有带入当前工作区的未提交文件。
- 当前数据库版本为 45；本计划使用 V46。若执行前数据库版本已经变化，必须把本计划所有 V46 名称和断言机械调整为当时的下一个连续版本，不能重复使用版本号。
- 使用 `pnpm`。每个命令设置显式超时；单文件 Node 测试建议 30 秒，`pnpm typecheck` 120 秒，全量 `pnpm test` 180 秒。
- 每个任务独立提交。任务中的 `git add` 只包含列出的文件，不暂存无关改动。
- 先写失败测试并观察预期失败，再写实现；不允许仅靠正则 policy 测试替代纯函数单元测试。
- 合并实现 worktree 前，对照当前主工作区已有的 README、功能矩阵、手册改动做三方合并，不能用实现分支的文档覆盖这些未提交内容。

## 文件结构

### 新建

- `src/ai/aiConversationMode.ts`：独立的展示模式类型、共用 system 规则、当前轮动态协议和标签。
- `src/ai/aiSegmentedReplyProtocol.ts`：流前缀分类、完整协议解析、XML 实体解码、回退和 20 气泡防御上限。
- `src/ai/aiCompanionDeliveryPolicy.ts`：首条/条间延迟、6 秒预算、后台直接完成判断。
- `src/ai/aiCompanionBurstPolicy.ts`：800ms 静默窗口、2.4 秒上限和用户消息组文本。
- `src/ai/aiCompanionTimeline.ts`：混合模式历史的日期/五分钟时间标签派生。
- `src/ai/aiSegmentedReplyService.ts`：片段事务、逐条 reveal、discard、后台完成与孤儿恢复。
- `src/database/repositories/aiMessageSegmentRepository.ts`：片段表的单一数据访问边界。
- `src/components/ai/AiConversationModePicker.tsx`：两种模式选择面板。
- `src/components/ai/AiSegmentedMessageBody.tsx`：同一父回合的多气泡正文。
- `tests/helpers/loadTypeScriptModule.cjs`：新纯 TypeScript 单元测试共用的最小 CommonJS loader。
- 对应的 `tests/ai-chat-*-unit.test.cjs` 和 policy 测试文件。

### 修改

- `src/ai/types.ts`、`src/database/schema.ts`、`src/database/db.ts`、`src/database/index.ts`、`src/database/repositories/aiThreadRepository.ts`：模式快照、delivery state、版本快照与迁移。
- `src/ai/promptBuilder.ts`、`src/ai/aiPromptCache.ts`、`src/ai/aiMemoryPrompts.ts`：高缓存提示词、防污染和观测。
- `src/ai/aiChatService.ts`、`src/ai/aiGenerationManager.ts`：模式捕获、协议输出、连续用户消息、打断和恢复。
- `src/components/ai/AiChatComposer.tsx`、`src/components/ai/AiMessageBubble.tsx`、`src/components/ai/aiLightTheme.ts`：模式入口、生成中插话、多气泡和专属画布色。
- `src/design/tokens/colors.ts`：`#EDEDED` 共享 token。
- `src/screens/AiChatScreen.tsx`、`src/screens/AiSessionConfigScreen.tsx`、`App.tsx`：页面状态、顶部精简、搜索迁移和路由。
- `docs/feature-matrix.md`、`docs/manual.md`、`src/content/productManualMarkdown.ts`：功能和使用说明。

## Phase A：数据与纯策略

### Task 1: 增加模式与片段数据库结构

**Files:**
- Create: `tests/ai-chat-companion-schema-policy.test.cjs`
- Modify: `src/ai/types.ts:18-20,97-127`
- Modify: `src/database/schema.ts:3,396-445,520-540,1018-end`
- Modify: `src/database/db.ts:3-52,159-352`
- Modify: `src/database/repositories/aiThreadRepository.ts:24-44,105-124,336-454,623-680`

- [ ] **Step 1: 写 V46 失败测试**

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('daily companion schema persists mode snapshots and segmented delivery', () => {
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');
  assert.match(schema, /DATABASE_VERSION = 46/);
  assert.match(schema, /MIGRATION_STATEMENTS_V46/);
  assert.match(schema, /chatMode TEXT NOT NULL DEFAULT 'immersive'/);
  assert.match(schema, /modeSnapshot TEXT NOT NULL DEFAULT 'immersive'/);
  assert.match(schema, /deliveryState TEXT NOT NULL DEFAULT 'none'/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_message_segments/);
  assert.match(schema, /status TEXT NOT NULL CHECK \(status IN \('queued', 'revealed', 'discarded'\)\)/);
  assert.match(schema, /UNIQUE\(messageId, generationId, ordinal\)/);
  assert.match(schema, /segmentSnapshotJson TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(db, /MIGRATION_STATEMENTS_V46/);
  assert.match(db, /currentVersion < 46/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/ai-chat-companion-schema-policy.test.cjs`

Expected: FAIL，首个失败为 `DATABASE_VERSION = 46` 未匹配。

- [ ] **Step 3: 增加类型和迁移**

在 `src/ai/types.ts` 增加并导出：

```ts
export type AiConversationMode = 'immersive' | 'companion';
export type AiMessageDeliveryState = 'none' | 'buffering' | 'ready' | 'revealing' | 'terminal';
export type AiMessageSegmentStatus = 'queued' | 'revealed' | 'discarded';
```

给 `AiThreadRecord` 增加 `chatMode: AiConversationMode`；给 `AiMessageRecord` 增加 `modeSnapshot`、`deliveryState`；给 `AiMessageVersionRecord` 增加 `modeSnapshot`、`segmentSnapshotJson`。V46 SQL 固定为：

```ts
export interface AiMessageRecord {
  modeSnapshot: AiConversationMode;
  deliveryState: AiMessageDeliveryState;
}

export interface AiMessageVersionRecord {
  modeSnapshot: AiConversationMode;
  segmentSnapshotJson: string;
}
```

以上片段表示需要加入现有 interface 的字段，不是替换 interface 的其他既有字段。

```sql
ALTER TABLE ai_threads ADD COLUMN chatMode TEXT NOT NULL DEFAULT 'immersive'
  CHECK (chatMode IN ('immersive', 'companion'));
ALTER TABLE ai_messages ADD COLUMN modeSnapshot TEXT NOT NULL DEFAULT 'immersive'
  CHECK (modeSnapshot IN ('immersive', 'companion'));
ALTER TABLE ai_messages ADD COLUMN deliveryState TEXT NOT NULL DEFAULT 'none'
  CHECK (deliveryState IN ('none', 'buffering', 'ready', 'revealing', 'terminal'));
ALTER TABLE ai_message_versions ADD COLUMN modeSnapshot TEXT NOT NULL DEFAULT 'immersive'
  CHECK (modeSnapshot IN ('immersive', 'companion'));
ALTER TABLE ai_message_versions ADD COLUMN segmentSnapshotJson TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS ai_message_segments (
  id TEXT PRIMARY KEY NOT NULL,
  messageId TEXT NOT NULL,
  generationId TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'revealed', 'discarded')),
  createdAt TEXT NOT NULL,
  revealedAt TEXT,
  FOREIGN KEY (messageId) REFERENCES ai_messages(id) ON DELETE CASCADE,
  UNIQUE(messageId, generationId, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_ai_message_segments_message_status
  ON ai_message_segments(messageId, status, ordinal);
```

同时把上述字段加入 fresh schema、row mapping、create/update input 和 `buildUpdateStatement`，所有旧数据必须映射为 `immersive / none`，不能使用可空模式。

- [ ] **Step 4: 接入迁移 runner 并验证**

Run: `node --test tests/ai-chat-companion-schema-policy.test.cjs tests/ai-schema-policy.test.cjs`

Expected: 两个文件全部 PASS；旧 schema policy 中的版本断言同步改为 46。

- [ ] **Step 5: 类型检查并提交**

Run: `pnpm typecheck`

Expected: PASS。

```powershell
git add tests/ai-chat-companion-schema-policy.test.cjs tests/ai-schema-policy.test.cjs src/ai/types.ts src/database/schema.ts src/database/db.ts src/database/repositories/aiThreadRepository.ts
git commit -m "feat: add companion chat message schema"
```

### Task 2: 建立片段仓储和父内容事务

**Files:**
- Create: `src/database/repositories/aiMessageSegmentRepository.ts`
- Create: `tests/ai-message-segment-repository-policy.test.cjs`
- Modify: `src/database/index.ts`
- Modify: `src/database/repositories/aiThreadRepository.ts:2791-2818,3435-3491`

- [ ] **Step 1: 写仓储契约失败测试**

测试必须断言：批量 queued 写入和 `deliveryState=ready` 在同一事务；reveal 同时物化父 `content`；discard 不进入 FTS；所有更新包含 generation guard。

```js
test('segment repository materializes only revealed content behind a generation guard', () => {
  const source = read('src/database/repositories/aiMessageSegmentRepository.ts');
  assert.match(source, /replaceQueuedSegmentsForGeneration/);
  assert.match(source, /database\.withTransactionAsync/);
  assert.match(source, /deliveryState = 'ready'/);
  assert.match(source, /revealNextSegmentForGeneration/);
  assert.match(source, /status = 'revealed'/);
  assert.match(source, /GROUP_CONCAT/);
  assert.match(source, /promptSnapshotJson[\s\S]*generationId/);
  assert.match(source, /discardQueuedSegmentsForGeneration/);
});
```

- [ ] **Step 2: 运行测试确认模块不存在**

Run: `node --test tests/ai-message-segment-repository-policy.test.cjs`

Expected: FAIL，提示目标文件不存在。

- [ ] **Step 3: 实现仓储公开接口**

```ts
export interface AiMessageSegmentRecord {
  id: string;
  messageId: string;
  generationId: string;
  ordinal: number;
  content: string;
  status: AiMessageSegmentStatus;
  createdAt: string;
  revealedAt: string | null;
}

export const aiMessageSegmentRepository = {
  replaceQueuedSegmentsForGeneration,
  revealNextSegmentForGeneration,
  discardQueuedSegmentsForGeneration,
  revealAllReadySegments,
  listSegmentsForMessage,
  listSegmentsForMessages,
  listRecoverableDeliveries,
};
```

`revealNextSegmentForGeneration` 必须在一个 SQLite 事务中：确认父消息的 `promptSnapshotJson` 仍包含当前 `generationId`；取最小 queued ordinal；更新为 revealed；按 ordinal 连接全部 revealed 内容为父 `content`；若没有 queued 则把父设为 `completed/terminal` 并同步 FTS。任何 guard 不匹配返回 `{ applied:false }`，不得改片段。

- [ ] **Step 4: 版本快照保存气泡边界**

在 `createMessageVersion` 中把当前 `modeSnapshot` 和按 ordinal 排序的片段序列化为：

```ts
type AiMessageSegmentSnapshot = Array<{
  content: string;
  ordinal: number;
}>;
```

切换版本时解析 `segmentSnapshotJson`；没有该字段或 JSON 损坏时退化为父 `content` 单气泡。

- [ ] **Step 5: 运行测试、类型检查并提交**

Run: `node --test tests/ai-message-segment-repository-policy.test.cjs tests/ai-message-favorites-policy.test.cjs tests/ai-branching-logic.test.cjs`

Run: `pnpm typecheck`

Expected: 全部 PASS。

```powershell
git add src/database/repositories/aiMessageSegmentRepository.ts src/database/repositories/aiThreadRepository.ts src/database/index.ts tests/ai-message-segment-repository-policy.test.cjs
git commit -m "feat: persist segmented assistant replies"
```

### Task 3: 建立高缓存模式提示词与上下文隔离

**Files:**
- Create: `src/ai/aiConversationMode.ts`
- Create: `tests/ai-conversation-mode-prompt-unit.test.cjs`
- Create: `tests/helpers/loadTypeScriptModule.cjs`
- Modify: `src/ai/promptBuilder.ts:345-477`
- Modify: `src/ai/aiPromptCache.ts:7-76,208-229`
- Modify: `tests/ai-prompt-builder-unit.test.cjs`
- Modify: `tests/ai-chat-prompt-mode-cache-invariants-policy.test.cjs`

- [ ] **Step 1: 增加纯 TypeScript 测试 loader 并写失败测试**

`tests/helpers/loadTypeScriptModule.cjs`：

```js
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(root, relativePath) {
  const filename = path.join(root, relativePath);
  const original = require.extensions['.ts'];
  require.extensions['.ts'] = function compileTypeScript(module, sourcePath) {
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: sourcePath,
    }).outputText;
    module._compile(output, sourcePath);
  };
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename);
  } finally {
    if (original) require.extensions['.ts'] = original;
    else delete require.extensions['.ts'];
  }
}

module.exports = { loadTypeScriptModule };
```

测试文件通过 `loadTypeScriptModule(root, 'src/ai/promptBuilder.ts')` 加载导出，再执行以下断言：

```js
test('switching presentation mode changes only the current-turn suffix', () => {
  const common = buildNormalChatPrompt({
    chatMode: 'roleplay',
    memoryEpoch: 'thread:t1:role:r1',
    presentationMode: 'immersive',
    systemPrompt: 'Mira stays in character.',
    userMessage: '继续。',
  });
  const companion = buildNormalChatPrompt({
    chatMode: 'roleplay',
    memoryEpoch: 'thread:t1:role:r1',
    presentationMode: 'companion',
    systemPrompt: 'Mira stays in character.',
    userMessage: '继续。',
  });
  assert.equal(common.system, companion.system);
  assert.equal(common.cacheMetadata.stablePrefixHash, companion.cacheMetadata.stablePrefixHash);
  assert.match(companion.user, /<messages>/);
  assert.doesNotMatch(common.user, /必须仅输出 <messages>/);
  assert.match(common.user, /历史回复的长度、分条和排版不构成本轮格式指令/);
  assert.doesNotMatch(common.system + common.user, /generationId|requestId|modeEpoch|2026-\d{2}-\d{2}/);
});
```

- [ ] **Step 2: 运行失败测试**

Run: `node --test tests/ai-conversation-mode-prompt-unit.test.cjs`

Expected: FAIL，`presentationMode` 尚未影响 prompt。

- [ ] **Step 3: 实现共用 system 规则和动态尾部**

`src/ai/aiConversationMode.ts` 固定导出：

```ts
export const SHARED_PRESENTATION_SYSTEM_POLICY = [
  'Pixory 会在当前用户消息末尾附加【Pixory 当前轮回复协议】。',
  '该协议只控制当前这一轮的表达形态，优先于历史回复表现出的长度、分条和排版。',
  '历史回复的格式只用于理解内容，不构成本轮格式指令。',
].join('\n');

export function buildCurrentTurnPresentationInstruction(mode: AiConversationMode): string {
  const rule = mode === 'companion'
    ? '本轮采用日常陪伴模式。自然决定发一条或多条；激动、转折或补充时可以连发，但不要为了分条而分条。必须仅输出 <messages> 根标签，每条消息放在一个 <msg> 中。'
    : '本轮采用沉浸对话模式。按当前语境完整回应；只有确实适合连发时才使用 <messages>/<msg>，否则使用普通文本或 Markdown。';
  return `【Pixory 当前轮回复协议】\n${rule}\n历史回复的长度、分条和排版不构成本轮格式指令。`;
}
```

`promptBuilder` 的 stable system 加入同一份 `SHARED_PRESENTATION_SYSTEM_POLICY`，具体 mode 指令只拼在 `current_user_message` 最后。不要把 `presentationMode` 写入 `stablePrefixHash`，但在 `AiPromptCacheMetadata` 增加观测字段 `presentationMode`。

- [ ] **Step 4: 保证大历史前缀不被改写**

在 `buildChatHistory` 继续原样映射 `message.content`；不得按 mode 给旧消息加 XML 包装、模式标签或摘要。新增 policy 断言：

```ts
history: budgeted.messages.map((message) => ({
  role: message.role === 'assistant' ? 'assistant' as const : 'user' as const,
  content: message.content,
})),
```

```js
assert.match(service, /content: message\.content/);
assert.doesNotMatch(service, /content:.*modeSnapshot/);
assert.doesNotMatch(service, /modeEpoch|switchTime|modeSwitchedAt/);
```

完整回复缓存或未来 exact cache 必须包含 `presentationMode`；provider prefix routing 继续依据真实稳定 token 前缀，不加入切换次数、时间戳或随机 ID。

- [ ] **Step 5: 运行 prompt/cache 测试并提交**

Run: `node --test tests/ai-conversation-mode-prompt-unit.test.cjs tests/ai-prompt-builder-unit.test.cjs tests/ai-chat-prompt-mode-cache-invariants-policy.test.cjs tests/ai-prompt-cache-unit.test.cjs`

Expected: 全部 PASS；沉浸与日常的 system 和 stablePrefixHash 相同，current user suffix 不同。

```powershell
git add src/ai/aiConversationMode.ts src/ai/promptBuilder.ts src/ai/aiPromptCache.ts tests/helpers/loadTypeScriptModule.cjs tests/ai-conversation-mode-prompt-unit.test.cjs tests/ai-prompt-builder-unit.test.cjs tests/ai-chat-prompt-mode-cache-invariants-policy.test.cjs
git commit -m "feat: isolate companion turn instructions"
```

### Task 4: 阻止产品模式进入长期记忆

**Files:**
- Create: `tests/ai-memory-presentation-isolation-policy.test.cjs`
- Modify: `src/ai/aiMemoryPrompts.ts:1-162`
- Modify: `src/ai/aiGenerationMetrics.ts`
- Modify: `src/ai/aiChatService.ts:1055-1090,3260-3300`

- [ ] **Step 1: 写失败测试**

```js
test('memory prompts exclude product presentation metadata', () => {
  const prompts = read('src/ai/aiMemoryPrompts.ts');
  assert.match(prompts, /不要记录 Pixory 的聊天模式/);
  assert.match(prompts, /气泡数量/);
  assert.match(prompts, /Markdown/);
  assert.match(prompts, /输入状态/);
  assert.match(prompts, /用户在正文中明确表达的沟通偏好/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/ai-memory-presentation-isolation-policy.test.cjs`

Expected: FAIL，缺少隔离规则。

- [ ] **Step 3: 给压缩、画像和摘要合并加入同一规则**

```ts
export const MEMORY_PRESENTATION_ISOLATION_RULE =
  '不要记录 Pixory 的聊天模式、AI 气泡数量、Markdown 排版、输入状态、演出延迟或协议标签。用户在正文中明确表达的沟通偏好可以记录为用户偏好，但界面切换动作本身不是记忆事实。';
```

把该常量加入 `buildCompressionPrompt`、`buildProfileUpdatePrompt` 和 `buildSummaryMergePrompt` 的安全边界。不要删除现有“说话习惯”，因为用户真实口头禅仍是有效画像。

- [ ] **Step 4: 增加缓存观测而不污染 prompt**

在 generation metrics/context snapshot 增加：

```ts
presentationMode: AiConversationMode | null;
modeSwitchedThisTurn: boolean;
memoryEpochChanged: boolean;
cacheMissReason: string | null;
historyPrefixHash: string | null;
historyPrefixEstimatedTokens: number | null;
```

`modeSwitchedThisTurn` 通过“当前捕获的 presentationMode 是否不同于历史中最后一条非 system 消息的 modeSnapshot”计算；`memoryEpochChanged` 与上一个已完成 assistant 的 prompt snapshot 比较；`cacheMissReason` 只能来自缓存关闭、低于阈值、TTL、provider 不支持或稳定前缀变化等枚举原因。`historyPrefixHash` 对 `systemPrompt + canonical history roles/content` 做规范化哈希，`historyPrefixEstimatedTokens` 估算同一段前缀 token；两者只用于观测模式切换是否改写历史。这些字段只进入 `promptSnapshotJson` 和观测，不进入 `systemPrompt`、`history`、`userPrompt` 或 provider cache routing key。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/ai-memory-presentation-isolation-policy.test.cjs tests/ai-memory-extreme-policy.test.cjs tests/ai-chat-latency-metrics-policy.test.cjs`

Run: `pnpm typecheck`

Expected: 全部 PASS。

```powershell
git add src/ai/aiMemoryPrompts.ts src/ai/aiGenerationMetrics.ts src/ai/aiChatService.ts tests/ai-memory-presentation-isolation-policy.test.cjs
git commit -m "feat: isolate chat presentation from memory"
```

### Task 5: 实现多消息协议分类与安全解析

**Files:**
- Create: `src/ai/aiSegmentedReplyProtocol.ts`
- Create: `tests/ai-segmented-reply-protocol-unit.test.cjs`

- [ ] **Step 1: 写纯函数测试**

覆盖：普通前缀、分块 `<mes` 未决、完整 `<messages>`、多条、XML 实体、空 msg、损坏标签、纯空响应、21 条合并为 20 条。

```js
test('protocol preserves semantic message boundaries and caps only pathological output', () => {
  assert.deepEqual(parseSegmentedReply('<messages><msg>你！</msg><msg>好！</msg></messages>'), {
    kind: 'segmented',
    segments: ['你！', '好！'],
  });
  assert.deepEqual(parseSegmentedReply('普通回复'), {
    kind: 'fallback',
    segments: ['普通回复'],
  });
  assert.equal(parseSegmentedReply('<messages></messages>').kind, 'empty');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/ai-segmented-reply-protocol-unit.test.cjs`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现明确 API**

```ts
export type SegmentedPrefixDecision = 'undecided' | 'plain' | 'segmented';
export type ParsedSegmentedReply =
  | { kind: 'segmented' | 'fallback'; segments: string[] }
  | { kind: 'empty'; segments: [] };

export const MAX_SEGMENTED_REPLY_BUBBLES = 20;
export function classifySegmentedReplyPrefix(value: string, final = false): SegmentedPrefixDecision;
export function parseSegmentedReply(value: string): ParsedSegmentedReply;
```

分类器忽略开头空白；只要非空前缀不再可能组成 `<messages>` 就返回 plain。解析器仅接受一个根标签和不嵌套的 `<msg>`；协议损坏时移除已知标签、解码 `&amp; &lt; &gt; &quot; &apos;` 并单气泡回退；不得使用 HTML renderer。

- [ ] **Step 4: 验证所有边界**

Run: `node --test tests/ai-segmented-reply-protocol-unit.test.cjs`

Expected: 全部 PASS。

- [ ] **Step 5: 类型检查并提交**

Run: `pnpm typecheck`

Expected: PASS。

```powershell
git add src/ai/aiSegmentedReplyProtocol.ts tests/ai-segmented-reply-protocol-unit.test.cjs
git commit -m "feat: parse segmented assistant replies"
```

### Task 6: 实现连发延迟和后台策略

**Files:**
- Create: `src/ai/aiCompanionDeliveryPolicy.ts`
- Create: `tests/ai-companion-delivery-policy-unit.test.cjs`

- [ ] **Step 1: 写延迟预算失败测试**

```js
test('delivery delays stay bounded and background work pauses theatre', () => {
  assert.equal(shouldPauseSegmentDelivery({ appActive: false, routeFocused: false }), true);
  assert.equal(shouldPauseSegmentDelivery({ appActive: true, routeFocused: true }), false);
  const first = nextCompanionDelay({ index: 0, random: () => 0, spentMs: 0 });
  const gap = nextCompanionDelay({ index: 1, random: () => 1, spentMs: 0 });
  assert.equal(first, 250);
  assert.equal(gap, 900);
  assert.equal(nextCompanionDelay({ index: 9, random: () => 1, spentMs: 6000 }), 0);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/ai-companion-delivery-policy-unit.test.cjs`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现集中常量和纯策略**

```ts
export const COMPANION_FIRST_DELAY_MS = { min: 250, max: 600 } as const;
export const COMPANION_GAP_DELAY_MS = { min: 350, max: 900 } as const;
export const COMPANION_TOTAL_DELAY_BUDGET_MS = 6000;

export function nextCompanionDelay(input: {
  index: number;
  random: () => number;
  spentMs: number;
}): number {
  if (input.spentMs >= COMPANION_TOTAL_DELAY_BUDGET_MS) return 0;
  const range = input.index === 0 ? COMPANION_FIRST_DELAY_MS : COMPANION_GAP_DELAY_MS;
  const sampled = Math.round(range.min + (range.max - range.min) * Math.min(1, Math.max(0, input.random())));
  return Math.min(sampled, COMPANION_TOTAL_DELAY_BUDGET_MS - input.spentMs);
}
```

`shouldPauseSegmentDelivery` 在 `appActive !== true` 或 `routeFocused !== true` 时返回 true。后台只保留 `deliveryState=ready` 的 queued 片段，不把它们物化为父正文；回到前台或重新进入路由时再跳过演出延迟一次性 reveal。减少动态效果只取消位移动画，不取消消息顺序。

- [ ] **Step 4: 验证并提交**

Run: `node --test tests/ai-companion-delivery-policy-unit.test.cjs`

Run: `pnpm typecheck`

Expected: 全部 PASS。

```powershell
git add src/ai/aiCompanionDeliveryPolicy.ts tests/ai-companion-delivery-policy-unit.test.cjs
git commit -m "feat: define companion delivery timing"
```

### Task 7: 实现日常陪伴时间标签策略

**Files:**
- Create: `src/ai/aiCompanionTimeline.ts`
- Create: `tests/ai-companion-timeline-unit.test.cjs`
- Modify: `src/screens/AiChatScreen.tsx:322-350,500-530,1875-1907`

- [ ] **Step 1: 写五分钟、跨天和混合模式测试**

测试固定 `now` 和时区输入，覆盖 4:59 不显示、5:00 显示、同日时间、一天至一周日期时间、一周外日期、一个 assistant 父回合只出现一次、分页边界不重复、沉浸消息继续按日分隔。

```js
test('companion timeline inserts one label at the five-minute boundary', () => {
  const items = buildConversationTimeline([
    message('u1', '2026-07-14T10:00:00+08:00', 'companion'),
    message('a1', '2026-07-14T10:05:00+08:00', 'companion'),
  ], new Date('2026-07-14T12:00:00+08:00'));
  assert.equal(items.filter((item) => item.type === 'timeSeparator').length, 2);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/ai-companion-timeline-unit.test.cjs`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现派生时间线**

```ts
export type ConversationTimelineItem<T> =
  | { id: string; type: 'message'; message: T }
  | { id: string; type: 'dateSeparator' | 'timeSeparator'; label: string };

export function buildConversationTimeline<T extends {
  createdAt: string;
  id: string;
  modeSnapshot: AiConversationMode;
}>(messages: T[], now = new Date()): ConversationTimelineItem<T>[];
```

函数以升序消息为输入；companion 使用相邻可见父消息 5 分钟规则，immersive 使用现有本地日期规则。模式转换点按当前消息快照计算，不能用会话当前模式重写历史。

- [ ] **Step 4: 用纯策略替换页面内日期循环**

`AiChatScreen` 的 `visibleMessageState` 调用 `buildConversationTimeline`，将 `timeSeparator` 与现有 `dateSeparator` 统一加入 `VisibleMessageItem`。渲染继续使用居中文本，但 companion label 不能在每个 segment 中重复。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/ai-companion-timeline-unit.test.cjs tests/ai-chat-search-policy.test.cjs`

Run: `pnpm typecheck`

Expected: 全部 PASS。

```powershell
git add src/ai/aiCompanionTimeline.ts src/screens/AiChatScreen.tsx tests/ai-companion-timeline-unit.test.cjs
git commit -m "feat: add companion chat time labels"
```

## Phase B：生成、连续用户消息与恢复

### Task 8: 把协议缓冲和片段 reveal 接入生成服务

**Files:**
- Create: `src/ai/aiSegmentedReplyService.ts`
- Create: `tests/ai-segmented-reply-service-policy.test.cjs`
- Modify: `src/ai/aiChatService.ts:2892-3738`
- Modify: `src/ai/aiGenerationManager.ts:21-27,78-200`
- Modify: `tests/ai-chat-streaming-runtime-policy.test.cjs`

- [ ] **Step 1: 写生成管线失败测试**

断言 companion 不发布 token patch、不把原始 XML 写入父 content；immersive 普通前缀仍走现有流；显式协议和 companion 在完成后写 queued；reveal 受 generation guard 控制。

```js
test('companion output is buffered while ordinary immersive output keeps streaming', () => {
  const service = read('src/ai/aiChatService.ts');
  assert.match(service, /classifySegmentedReplyPrefix/);
  assert.match(service, /presentationMode === 'companion'/);
  assert.match(service, /replaceQueuedSegmentsForGeneration/);
  assert.match(service, /runSegmentedReplyDelivery/);
  assert.match(service, /if \(outputMode === 'plain'\)[\s\S]*emitStreamingPatch/);
  assert.doesNotMatch(service, /content: rawProtocolBuffer/);
});
```

- [ ] **Step 2: 运行失败测试**

Run: `node --test tests/ai-segmented-reply-service-policy.test.cjs`

Expected: FAIL，尚未导入协议控制器。

- [ ] **Step 3: 实现 provider 输出控制状态**

在 `streamAssistantReply` 捕获消息创建时的 `presentationMode`，不要在流中重新读取 thread 当前值。状态只允许：

```ts
type AssistantOutputMode = 'undecided' | 'plain' | 'segmented';
let outputMode: AssistantOutputMode = presentationMode === 'companion' ? 'segmented' : 'undecided';
let rawProtocolBuffer = '';
```

immersive 在 undecided 时短暂缓存前缀；判定 plain 后把已缓存内容一次冲回现有 `answerText`，以后完全复用原流式 patch/tail replay。判定 segmented 后只积累 `rawProtocolBuffer`，禁止 partial persist 和 UI token patch。companion 从第一 token 起直接缓冲。

- [ ] **Step 4: 完成时持久化并演出片段**

`src/ai/aiSegmentedReplyService.ts` 导出：

```ts
export async function commitAndDeliverSegmentedReply(input: {
  assistantMessageId: string;
  generationId: string;
  mode: AiConversationMode;
  rawContent: string;
  reasoningText: string | null;
  signal?: AbortSignal;
  space: PixorySpace;
  visibility: () => StreamingVisibilityState;
  onPatch?: (patch: AiStreamingMessagePatch) => void;
  random?: () => number;
}): Promise<'completed' | 'detached' | 'failed' | 'stopped' | 'stale'>;
```

流程固定为 parse → 空响应失败，或 queued 事务 → `ready` → 前台逐条 reveal，后台返回 `detached` 并保留 queued → 最后一条后 `terminal`。每次 reveal 后发父消息 patch，patch.content 只能是已 revealed 的拼接文本。

- [ ] **Step 5: 保持任务活跃到最后一条显示**

前台时，`aiGenerationManager` 的 task promise 必须等待 `commitAndDeliverSegmentedReply` 完成再 `finishTask`，因此顶部“对方正在输入…”、停止和 late callback guard 覆盖整个队列。后台返回 `detached` 后允许 task settle；AppState 恢复和路由重新进入由 Task 10 的恢复函数立即 reveal。subscriber `onCreated` 增加 `modeSnapshot`。

- [ ] **Step 6: 验证流式回归并提交**

Run: `node --test tests/ai-segmented-reply-service-policy.test.cjs tests/ai-chat-streaming-runtime-policy.test.cjs tests/ai-chat-streaming-tail-contract.test.cjs tests/ai-chat-first-token-pipeline-policy.test.cjs`

Run: `pnpm typecheck`

Expected: 全部 PASS；普通沉浸流式相关 policy 不变。

```powershell
git add src/ai/aiSegmentedReplyService.ts src/ai/aiChatService.ts src/ai/aiGenerationManager.ts tests/ai-segmented-reply-service-policy.test.cjs tests/ai-chat-streaming-runtime-policy.test.cjs
git commit -m "feat: deliver segmented assistant replies"
```

### Task 9: 持久化并收集连续用户消息

**Files:**
- Create: `src/ai/aiCompanionBurstPolicy.ts`
- Create: `tests/ai-companion-burst-policy-unit.test.cjs`
- Modify: `src/ai/aiChatService.ts:130-236,3980-4070`
- Modify: `src/ai/aiGenerationManager.ts`
- Modify: `src/screens/AiChatScreen.tsx:5057-5238`

- [ ] **Step 1: 写 burst 纯策略测试**

```js
test('burst deadline resets inside the quiet window but never exceeds the hard limit', () => {
  const first = startCompanionBurst(1000, 'u1');
  const second = appendCompanionBurst(first, 1500, 'u2');
  assert.equal(second.deadlineAt, 2300);
  const third = appendCompanionBurst(second, 2200, 'u3');
  assert.equal(third.deadlineAt, 3000);
  const fourth = appendCompanionBurst(third, 2900, 'u4');
  assert.equal(fourth.deadlineAt, 3400);
});

test('burst prompt preserves individual user message boundaries', () => {
  assert.equal(buildCompanionBurstUserText(['你！', '好！', '啊！']),
    '用户刚刚连续发送了以下消息：\n[1] 你！\n[2] 好！\n[3] 啊！');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/ai-companion-burst-policy-unit.test.cjs`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 800ms/2.4 秒策略**

```ts
export const COMPANION_BURST_QUIET_MS = 800;
export const COMPANION_BURST_MAX_MS = 2400;
export type CompanionBurstState = {
  firstSentAt: number;
  lastSentAt: number;
  deadlineAt: number;
  userMessageIds: string[];
};
```

`deadlineAt = min(lastSentAt + 800, firstSentAt + 2400)`。附件、模式切换离开 companion、路由离开和用户主动停止会立即 seal。

- [ ] **Step 4: 新增“只保存用户消息”和“响应已保存消息组”服务**

```ts
export async function persistCompanionBurstUserMessage(input: {
  attachments?: AiOutgoingAttachment[];
  branchRootMessageId?: string | null;
  branchVersionIndex?: number | null;
  content: string;
  modeSnapshot: 'companion';
  space: PixorySpace;
  threadId: string;
}): Promise<AiMessageRecord>;

export async function respondToCompanionUserBurst(input: {
  space: PixorySpace;
  threadId: string;
  userMessageIds: string[];
} & GenerationCallbacks): Promise<void>;
```

第一函数在点击发送后立即事务写入消息和附件。第二函数重新读取这些 ID，验证同 thread、role=user、modeSnapshot=companion、按 createdAt 排序，然后创建一个 assistant 父回合；不能重复插入用户消息。

- [ ] **Step 5: 页面接入并允许 AI 回复中插话**

companion 下发送按钮不受 `generating` 禁用。若旧 task 活跃，先调用 stop/discard，保留 revealed、丢弃 queued，再立即保存新用户消息并进入 burst。immersive 保持原有单次发送路径。

- [ ] **Step 6: 验证并提交**

Run: `node --test tests/ai-companion-burst-policy-unit.test.cjs tests/ai-chat-continue-generation-policy.test.cjs tests/ai-branching-logic.test.cjs`

Run: `pnpm typecheck`

Expected: 全部 PASS。

```powershell
git add src/ai/aiCompanionBurstPolicy.ts src/ai/aiChatService.ts src/ai/aiGenerationManager.ts src/screens/AiChatScreen.tsx tests/ai-companion-burst-policy-unit.test.cjs
git commit -m "feat: collect companion user message bursts"
```

### Task 10: 完成停止、后台和孤儿恢复

**Files:**
- Create: `tests/ai-companion-recovery-policy.test.cjs`
- Modify: `src/ai/aiSegmentedReplyService.ts`
- Modify: `src/ai/aiGenerationManager.ts`
- Modify: `src/ai/aiChatService.ts`
- Modify: `src/screens/AiChatScreen.tsx:2298-2460,5249-5265`

- [ ] **Step 1: 写恢复状态失败测试**

断言：`ready/revealing` orphan 立即完成；`buffering` orphan 失败；停止只 discard queued；后台不依赖 foreground timer；stale generation 静默返回。

```js
test('orphan recovery distinguishes complete queued output from incomplete protocol buffers', () => {
  const source = read('src/ai/aiSegmentedReplyService.ts');
  assert.match(source, /deliveryState === 'ready' \|\| deliveryState === 'revealing'/);
  assert.match(source, /revealAllReadySegments/);
  assert.match(source, /deliveryState === 'buffering'/);
  assert.match(source, /discardQueuedSegmentsForGeneration/);
  assert.match(source, /hasActiveTask/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/ai-companion-recovery-policy.test.cjs`

Expected: FAIL，恢复 API 尚不完整。

- [ ] **Step 3: 实现统一终止操作**

```ts
export async function stopSegmentedReplyDelivery(input: {
  assistantMessageId: string;
  generationId: string;
  reason: 'user' | 'interrupted' | 'timeout';
  space: PixorySpace;
}): Promise<'stopped' | 'stale'>;
```

该操作只把 queued 改为 discarded，父 content 保持 revealed 拼接；用户打断为 `stopped/terminal`，timeout 为 `failed/terminal`。旧回调 guard 不匹配时返回 stale，不发 toast。

- [ ] **Step 4: 实现页面进入/进程启动恢复**

`recoverSegmentedReplyDeliveries(space, threadId, hasActiveTask)`：活动 task 不处理；ready/revealing 跳过延迟全部 reveal；buffering 标记失败，错误文案“生成已中断，请重试”；完成后 reload 当前 thread。该函数同时由路由加载和 AppState 从后台回到 active 的 effect 调用。normal/personal 必须分别在对应数据库运行。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/ai-companion-recovery-policy.test.cjs tests/ai-chat-streaming-runtime-policy.test.cjs tests/final-personal-system-policy.test.cjs`

Run: `pnpm typecheck`

Expected: 全部 PASS。

```powershell
git add src/ai/aiSegmentedReplyService.ts src/ai/aiGenerationManager.ts src/ai/aiChatService.ts src/screens/AiChatScreen.tsx tests/ai-companion-recovery-policy.test.cjs
git commit -m "feat: recover companion message delivery"
```

## Phase C：消息 UI、模式入口与顶部整理

### Task 11: 以一个父回合渲染多气泡

**Files:**
- Create: `src/components/ai/AiSegmentedMessageBody.tsx`
- Create: `tests/ai-segmented-message-ui-policy.test.cjs`
- Modify: `src/ai/aiChatService.ts:509-570,2050-2140`
- Modify: `src/components/ai/AiMessageBubble.tsx:23-65,253-602`
- Modify: `src/screens/AiChatScreen.tsx:1875-2005,5719-5945`

- [ ] **Step 1: 写父回合语义失败测试**

```js
test('segmented messages render many bodies but one parent action surface', () => {
  const body = read('src/components/ai/AiSegmentedMessageBody.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  assert.match(body, /segments\.map/);
  assert.match(body, /segment\.content/);
  assert.match(bubble, /AiSegmentedMessageBody/);
  assert.match(bubble, /hideParticipantName/);
  assert.match(bubble, /hideMessageTime/);
  assert.equal((bubble.match(/<AiMessageFooterActions/g) || []).length, 1);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/ai-segmented-message-ui-policy.test.cjs`

Expected: FAIL，组件不存在。

- [ ] **Step 3: 给消息加载结果附加片段**

`AiMessageWithCitations` 增加：

```ts
segments: AiMessageSegmentRecord[];
```

加载当前页消息后一次批量 `listSegmentsForMessages(messageIds)`，按 messageId 分组；版本选择使用 `segmentSnapshotJson`，没有片段则保留现有单气泡。

- [ ] **Step 4: 实现多气泡正文**

```tsx
export function AiSegmentedMessageBody({ segments }: {
  segments: AiMessageSegmentRecord[];
}) {
  return (
    <View style={styles.cluster}>
      {segments.filter((segment) => segment.status === 'revealed').map((segment) => (
        <View key={segment.id} style={styles.bubble}>
          <AiMessageContent content={segment.content} />
        </View>
      ))}
    </View>
  );
}
```

`AiMessageBubble` 仍只渲染一次头像区域、reasoning、引用和 footer actions；日常陪伴通过 `hideParticipantName` 隐藏名字，通过 `hideMessageTime` 隐藏 footer 时间。复制、收藏、继续、回复、重生成和版本切换全部操作父 message ID。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/ai-segmented-message-ui-policy.test.cjs tests/ai-message-favorites-policy.test.cjs tests/ai-branching-logic.test.cjs`

Run: `pnpm typecheck`

Expected: 全部 PASS。

```powershell
git add src/components/ai/AiSegmentedMessageBody.tsx src/components/ai/AiMessageBubble.tsx src/ai/aiChatService.ts src/screens/AiChatScreen.tsx tests/ai-segmented-message-ui-policy.test.cjs
git commit -m "feat: render segmented assistant bubbles"
```

### Task 12: 增加模式选择器和生成中插话按钮

**Files:**
- Create: `src/components/ai/AiConversationModePicker.tsx`
- Create: `tests/ai-conversation-mode-controls-policy.test.cjs`
- Modify: `src/components/ai/AiChatComposer.tsx:27-49,92-296,375-405`
- Modify: `src/screens/AiChatScreen.tsx:1726-1735,4132-4140,6296-6335`
- Modify: `src/ai/aiChatService.ts:2235-2250`

- [ ] **Step 1: 写控件失败测试**

```js
test('composer exposes the selected mode after model and reply assist actions', () => {
  const composer = read('src/components/ai/AiChatComposer.tsx');
  assert.match(composer, /conversationMode: AiConversationMode/);
  assert.match(composer, /onConversationModePress/);
  assert.match(composer, /沉浸|日常/);
  assert.match(composer, /allowInterruptingSend/);
  assert.match(composer, /showSendWhileReplyActive/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/ai-conversation-mode-controls-policy.test.cjs`

Expected: FAIL，composer 尚无模式 props。

- [ ] **Step 3: 实现选择器**

`AiConversationModePicker` 使用现有 `AppDialog` 和两个 Pressable 行，文案固定：

```ts
const MODE_OPTIONS = [
  { id: 'immersive', title: '沉浸对话', description: '适合完整表达、情景演绎和长内容' },
  { id: 'companion', title: '日常陪伴', description: '像即时聊天一样自然短聊，也可以连发' },
] as const;
```

当前项显示 checkmark。选择后调用 `setThreadConversationMode(space, threadId, mode)`；空会话先只保存在 screen state，`ensureThread` 创建时写入该模式。

`aiChatService` 同时导出明确 API：

```ts
export async function loadThreadConversationMode(
  space: PixorySpace,
  threadId: string,
): Promise<AiConversationMode>;

export async function setThreadConversationMode(
  space: PixorySpace,
  threadId: string,
  mode: AiConversationMode,
): Promise<AiThreadRecord | null>;
```

老会话由迁移返回 immersive；没有 threadId 的新聊天 screen state 初始也是 immersive，用户在首条消息前的选择通过 `CreateAiThreadInput.chatMode` 写入。

- [ ] **Step 4: 把紧凑按钮放在模型和帮答之后**

按钮文案为 `沉浸⌄` / `日常⌄`，使用 token 定义高度、pill radius 和字体。`AiChatComposer` 将状态拆为：

```ts
const hasSendableContent = value.trim().length > 0 || attachments.length > 0;
const showSendWhileReplyActive = generating && allowInterruptingSend && hasSendableContent;
const canSend = hasSendableContent && (!generating || allowInterruptingSend);
```

companion 回复期间：输入为空显示停止按钮；输入非空显示发送按钮，点击即走“打断旧回合并保存新消息”。immersive 保持现有生成时只显示停止按钮。

- [ ] **Step 5: 增加一次性非阻塞提示**

使用 `settingsRepository` 当前 space 的 `AI_CHAT_PRESENTATION_MODE_INTRO_SEEN_V1`。首次进入聊天时在模式按钮上方显示内联提示：“可切换沉浸对话或日常陪伴，之后也能随时切回。”点空白或模式按钮后写入 `1`，不使用阻塞弹窗。

- [ ] **Step 6: 验证并提交**

Run: `node --test tests/ai-conversation-mode-controls-policy.test.cjs tests/ai-composer-entrance-policy.test.cjs tests/accessibility-policy.test.cjs`

Run: `pnpm typecheck`

Expected: 全部 PASS。

```powershell
git add src/components/ai/AiConversationModePicker.tsx src/components/ai/AiChatComposer.tsx src/screens/AiChatScreen.tsx src/ai/aiChatService.ts tests/ai-conversation-mode-controls-policy.test.cjs
git commit -m "feat: add companion mode controls"
```

### Task 13: 精简顶部并迁移聊天搜索入口

**Files:**
- Create: `tests/ai-chat-header-companion-policy.test.cjs`
- Modify: `App.tsx:197-213,1665-1710,1766-1810`
- Modify: `src/screens/AiChatScreen.tsx:6048-6125,6568-6600`
- Modify: `src/screens/AiSessionConfigScreen.tsx:50-63,893-928`

- [ ] **Step 1: 写顶部和路由失败测试**

```js
test('chat header keeps drawer and a direct horizontal-ellipsis settings action', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  assert.match(chat, /name="ellipsis-horizontal"/);
  assert.match(chat, /accessibilityLabel="会话设置"/);
  assert.doesNotMatch(chat, /accessibilityLabel="搜索当前聊天"/);
  assert.doesNotMatch(chat, /accessibilityLabel="开启新会话"/);
  assert.doesNotMatch(chat, /fontFamily: aiLightDisplayFont/);
  assert.match(chat, /fontSize: 18/);
  assert.match(chat, /fontWeight: ['"]600['"]/);
});

test('session settings owns the current-thread search entry', () => {
  const settings = read('src/screens/AiSessionConfigScreen.tsx');
  assert.match(settings, /title="查找聊天记录"/);
  assert.match(settings, /onOpenChatSearch/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/ai-chat-header-companion-policy.test.cjs`

Expected: FAIL，仍存在顶部搜索和新建聊天按钮。

- [ ] **Step 3: 精简顶部**

左侧只保留现有 drawer。右侧一个 40×40 Pressable，Ionicon `ellipsis-horizontal` size 24，`hitSlop={spacing[1]}`，点击直接执行 `handleOpenSessionConfig()`。删除只服务于顶部新建按钮的 feedback state/JSX，但保留 drawer 使用的 `onNewChat` 能力。

标题使用：

```ts
title: {
  ...typography.textStyles.navTitle,
  color: aiLightColors.ink,
  fontSize: 18,
  fontWeight: '600',
  lineHeight: 24,
  maxWidth: '90%',
}
```

不再导入或使用 `aiLightDisplayFont`。

- [ ] **Step 4: 把搜索路由参数带入会话设置**

`ai-session-config` route 增加 `branchScopes: AiBranchScope[]`。ChatScreen 打开设置时传 `getPersistedCurrentBranchScopes()`；`AiSessionConfigScreenProps` 增加 `onOpenChatSearch`，在“会话名称”之后放 `查找聊天记录`，点击复用现有 `ai-chat-search` route 和 branchScopes。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/ai-chat-header-companion-policy.test.cjs tests/ai-chat-search-policy.test.cjs tests/ai-navigation-policy.test.cjs`

Run: `pnpm typecheck`

Expected: 全部 PASS；搜索页面与结果定位代码未复制。

```powershell
git add App.tsx src/screens/AiChatScreen.tsx src/screens/AiSessionConfigScreen.tsx tests/ai-chat-header-companion-policy.test.cjs tests/ai-chat-search-policy.test.cjs
git commit -m "feat: simplify chat header navigation"
```

### Task 14: 接入专属画布、顶部输入状态和模式快照

**Files:**
- Create: `tests/ai-chat-companion-presentation-policy.test.cjs`
- Modify: `src/design/tokens/colors.ts`
- Modify: `src/components/ai/aiLightTheme.ts`
- Modify: `src/screens/AiChatScreen.tsx:1726-1735,2298-2460,6038-6340,6490-6740`
- Modify: `src/components/ai/AiMessageBubble.tsx`

- [ ] **Step 1: 写 presentationMode 失败测试**

```js
test('companion presentation uses the shared EDEDED token and static header status', () => {
  const tokens = read('src/design/tokens/colors.ts');
  const theme = read('src/components/ai/aiLightTheme.ts');
  const chat = read('src/screens/AiChatScreen.tsx');
  assert.match(tokens, /companionChat: '#EDEDED'/);
  assert.match(theme, /companionCanvas: colors\.background\.companionChat/);
  assert.match(chat, /presentationMode/);
  assert.match(chat, /对方正在输入…/);
  assert.match(chat, /activeTurnMode/);
  assert.doesNotMatch(chat, /<AiTypingIndicator[^>]*companion/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/ai-chat-companion-presentation-policy.test.cjs`

Expected: FAIL，token 和状态不存在。

- [ ] **Step 3: 增加共享颜色 token**

```ts
background: {
  page: '#FBF7EF',
  companionChat: '#EDEDED',
}
```

`aiLightColors.companionCanvas = colors.background.companionChat`。日常陪伴时 screen root、message area 和 header 使用 companionCanvas；composerPanel 继续使用现有 surface。沉浸模式继续使用 `aiLightColors.canvas`。

- [ ] **Step 4: 计算当前展示模式和标题状态**

```ts
const presentationMode = activeTurnMode ?? conversationMode;
const companionReplyActive = presentationMode === 'companion' && generating;
const headerTitle = companionReplyActive ? '对方正在输入…' : displayTitle;
```

`activeTurnMode` 在 subscriber `onCreated` 从消息快照设置，在最后片段 settled、停止、失败或 stale 时清空。模式切换立即保存 thread.chatMode，但活动回合未结束时 `presentationMode` 不突变，并显示“下一轮生效”。模型副标题保留。

- [ ] **Step 5: 按消息快照隐藏名称和逐条时间**

传给 `AiMessageBubble`：

```tsx
hideParticipantName={message.modeSnapshot === 'companion'}
hideMessageTime={message.modeSnapshot === 'companion'}
```

只在 companion 活动回合禁用 `AiTypingIndicator`；沉浸模式保留现有 waiting/reasoning 行为。

- [ ] **Step 6: 验证并提交**

Run: `node --test tests/ai-chat-companion-presentation-policy.test.cjs tests/ai-chat-streaming-runtime-policy.test.cjs tests/accessibility-policy.test.cjs`

Run: `pnpm typecheck`

Expected: 全部 PASS。

```powershell
git add src/design/tokens/colors.ts src/components/ai/aiLightTheme.ts src/screens/AiChatScreen.tsx src/components/ai/AiMessageBubble.tsx tests/ai-chat-companion-presentation-policy.test.cjs
git commit -m "feat: style daily companion conversations"
```

## Phase D：版本、文档与整体验收

### Task 15: 补齐重生成、继续、版本和导出语义

**Files:**
- Create: `tests/ai-chat-companion-versioning-policy.test.cjs`
- Modify: `src/ai/aiChatService.ts:2707-2730,4040-4565`
- Modify: `src/database/repositories/aiThreadRepository.ts:3435-3586`
- Modify: `src/database/repositories/aiThreadRepository.ts:608-614,1374-1470`
- Modify: `src/ai/aiRoleCardContinuityExport.ts:29-38,198-230`
- Modify: `src/ai/aiRoleCardContinuityExportService.ts:96-160`

- [ ] **Step 1: 写版本模式失败测试**

```js
test('regenerate and continue preserve the source message presentation mode', () => {
  const service = read('src/ai/aiChatService.ts');
  assert.match(service, /modeSnapshot: sourceMessage\.modeSnapshot/);
  assert.match(service, /segmentSnapshotJson/);
  assert.match(service, /discardQueuedSegmentsForGeneration/);
  assert.doesNotMatch(service, /modeSnapshot: thread\.chatMode[\s\S]{0,120}regenerate/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/ai-chat-companion-versioning-policy.test.cjs`

Expected: FAIL，旧动作尚未传 mode snapshot。

- [ ] **Step 3: 固定动作语义**

- 新用户轮：使用 `thread.chatMode`。
- 重新生成旧 AI 消息：使用该 AI 消息 `modeSnapshot`。
- 继续旧 AI 消息：使用该 AI 消息 `modeSnapshot`。
- 从旧用户消息创建新分支：使用当前 `thread.chatMode`。
- snapshot 当前版本前保存 ordered revealed segments；应用旧版本时恢复相同边界。
- 替换/重新生成前将旧 generation queued 片段 discarded，不能复活。

- [ ] **Step 4: 导出和旧数据回退**

线程快照/连续性包只导出 revealed 父正文，并在支持结构化消息的内部备份中包含 `modeSnapshot` 和 segment snapshot。旧导入没有字段时使用 immersive 单气泡。完整数据库备份自然包含 segment 表，但面向用户的 Markdown 不输出 queued/discarded。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/ai-chat-companion-versioning-policy.test.cjs tests/ai-chat-continue-generation-policy.test.cjs tests/ai-branching-logic.test.cjs tests/ai-chat-continuity-import-policy.test.cjs`

Run: `pnpm typecheck`

Expected: 全部 PASS。

```powershell
git add src/ai/aiChatService.ts src/database/repositories/aiThreadRepository.ts tests/ai-chat-companion-versioning-policy.test.cjs
git commit -m "feat: preserve companion message versions"
```

### Task 16: 更新产品文档和最终验收策略

**Files:**
- Create: `tests/ai-chat-daily-companion-final-policy.test.cjs`
- Modify: `docs/feature-matrix.md`
- Modify: `docs/manual.md`
- Modify: `src/content/productManualMarkdown.ts`
- Modify: `README.md` only if its current AI capability summary enumerates chat modes

- [ ] **Step 1: 写最终 policy 测试**

测试从 schema、prompt、service、screen、composer、settings、tokens 和 docs 读取源码，至少断言：两种模式、老数据默认 immersive、`#EDEDED`、顶部三点、搜索迁移、无主动消息、无 companion 三点动画、两种模式多消息协议、visible-only history、缓存无 modeEpoch/时间戳、记忆隔离。

- [ ] **Step 2: 运行测试确认文档缺失**

Run: `node --test tests/ai-chat-daily-companion-final-policy.test.cjs`

Expected: FAIL，功能矩阵和手册尚未描述日常陪伴模式。

- [ ] **Step 3: 更新三份长期文档**

`docs/feature-matrix.md` 写实际完成的数据库、生成、模式切换、连发、搜索入口和测试文件；`docs/manual.md` 与内置手册写用户可见操作：模式按钮位置、下一轮生效、可切回、连续消息、打断行为、时间显示、第一版无主动消息。不要使用“微信官方模式”作为产品名称。

- [ ] **Step 4: 运行完整自动验证**

Run: `pnpm typecheck`

Expected: PASS。

Run: `pnpm test`

Expected: 所有 Node tests PASS，失败数 0。

Run: `git diff --check`

Expected: 无输出，exit 0。

- [ ] **Step 5: Android 人工验收**

Run: `pnpm android`

按设计规格的 12 项 Android 清单使用真实数据验证，额外记录：

- 同一角色/记忆不变时，沉浸和日常请求的 `stablePrefixHash` 相同。
- 对相同历史快照分别构造两种模式请求时，provider request 的 system、history、`historyPrefixHash` 和 `historyPrefixEstimatedTokens` 相同，只有 current user suffix 不同。
- `cachedInputTokens/cachedTokenRatio` 能按 `presentationMode` 观测；切换不产生 `modeEpoch` 或随机 cache family。
- 普通沉浸流式首 token、tail replay、搜索定位和 200+ 消息滚动无回归。

- [ ] **Step 6: 提交文档和最终策略**

```powershell
git add tests/ai-chat-daily-companion-final-policy.test.cjs docs/feature-matrix.md docs/manual.md src/content/productManualMarkdown.ts
git add README.md
git commit -m "docs: document daily companion chat mode"
```

如果 README 未发生必要变化，不执行第二条 `git add README.md`。

## 最终完成标准

- `pnpm typecheck`、`pnpm test`、`git diff --check` 全部通过。
- 数据库 normal/personal 均从 V45 安全迁移到 V46，老消息视觉不变。
- companion 普通响应不逐 token、不显示三点动画，标题状态覆盖到最后一个 revealed segment。
- 用户可在 AI 生成/连发期间发送新消息，已显示内容保留，未显示内容不会进入历史、搜索、摘要或记忆。
- 模式切换后 system 与历史大前缀保持一致，当前轮动态后缀明确隔离格式；切回时无上下文或旧回包串味。
- 侧边抽屉不变；顶部新建和搜索移除；三点直达会话设置；搜索从“当前会话”进入。
- 日常陪伴画布和顶部使用共享 `#EDEDED` token，composer 仍是独立 surface，沉浸模式颜色不变。
- 第一版没有 AI 主动消息、通知、已读回执、在线状态、撤回动画、语音/红包/转账/拍一拍和桌宠上线。
