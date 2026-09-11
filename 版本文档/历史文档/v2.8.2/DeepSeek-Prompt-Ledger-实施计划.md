# DeepSeek Prompt Ledger 实施计划

> **给执行模型的说明：** 本文档是完整上下文交接。执行者不需要知道此前讨论内容，只需要严格按本文实施。实施时必须先写失败测试，再写源码；不得在 `main` 直接修改；不得污染 `ai_messages.content`；不得影响 Pixory 的导入导出与续聊导入模块。

## 1. 目标

为 Pixory 的 DeepSeek 官方 V4 聊天请求增加一套本地 Prompt Ledger，用于提升 DeepSeek Context Caching 的前缀命中率，并提供可诊断的缓存观测数据。

这个功能只针对 DeepSeek 官方 V4：

- Provider 类型：DeepSeek。
- Base URL：官方 `api.deepseek.com`。
- Model：官方 DeepSeek V4 模型，例如 `deepseek-v4-flash` / `deepseek-v4-pro`。

不要为 OpenAI compatible 自定义中转、Claude、Gemini、OpenAI 官方模型改变默认行为。

## 2. 背景

Pixory 是 Android 优先的陪伴型 AI 聊天产品。它的对话上下文通常包含：

- 角色卡与角色设定。
- 长期记忆。
- 分支对话历史。
- RAG 资料片段。
- companion runtime，例如当前情绪、开放话题、关系状态。
- 当前用户消息。
- 当前回复 nudge，例如继续沉浸式角色对话、不复述规则。

DeepSeek 提供官方 Context Caching。它不要求客户端手动创建缓存，但要求后续请求复用相同前缀。当前 Pixory 的一个主要问题是：本轮发给 DeepSeek 的 user prompt 里包含 RAG/runtime/nudge 等动态内容，但下一轮构造 history 时只回放干净的 `ai_messages.content`。因此 DeepSeek 看到的历史前缀与上一轮实际请求不一致，导致缓存命中率下降。

本计划的核心是：**业务聊天历史继续保持干净，DeepSeek 请求回放使用单独的 Prompt Ledger。**

## 3. 核心原则

1. `ai_messages.content` 永远保存干净聊天内容。
2. RAG、runtime、nudge、附件摘要等 rendered prompt 内容不得写回 `ai_messages.content`。
3. Prompt Ledger 只用于 DeepSeek 请求回放、缓存命中诊断、问题复现。
4. 普通导入导出、续聊导入、native memory package 不读取 Prompt Ledger。
5. 只有完整 snapshots 写入成功后，request 才能从 `pending` 变为 `completed`。
6. 回放查询必须过滤 `ai_prompt_requests.status = 'completed'`。
7. 分支和重生成必须按当前可见分支路线精准选择 snapshot。
8. 上下文滑杆变化允许造成一次缓存 miss，但必须被记录和诊断。

## 4. 当前存在的问题

### 4.1 动态内容没有作为历史真实前缀回放

当前请求形态大致是：

```ts
messages = [
  { role: 'system', content: prompt.system },
  ...historyFromAiMessages,
  { role: 'user', content: prompt.user },
]
```

其中：

- `prompt.system` 来自 stable blocks。
- `historyFromAiMessages` 来自 `ai_messages.content`。
- `prompt.user` 包含动态上下文与当前用户消息。

问题在于，第 N 轮的 `prompt.user` 包含的动态上下文不会进入第 N+1 轮 history，因此 DeepSeek 无法看到完全一致的前缀。

### 4.2 `replayInFuture: boolean` 不足以处理分支

如果同一个用户消息发生重生成：

```text
Turn 2 - User: "讲个故事"
  rendered_user_2 = "[RAG-B] + 讲个故事 + nudge"
  assistant_2 = "从前有座山..."

Turn 2' - Regenerate
  rendered_user_2' = "[RAG-B'] + 讲个故事 + nudge"
  assistant_2' = "很久很久以前..."
```

Turn 3 继续 `assistant_2'` 路线时，必须回放 `rendered_user_2'`，不能回放 `rendered_user_2`。

因此 boolean 只能说明“可不可以回放”，无法说明“当前路线应该回放哪一个版本”。

### 4.3 缓存诊断粒度不足

只存 `requestMessagesHash` 只能判断整个请求变了，不能定位变化发生在哪一层。

必须分别记录：

- `stablePrefixHash`：stable/system 层 hash。
- `historyHash`：history 序列 hash，不含 current user。
- `retrievalHash`：本轮实际 RAG 片段集合 hash。
- `requestMessagesHash`：完整 messages 数组 hash。

这样才能判断 miss 原因是 system 变动、history 回放断裂、RAG 漂移，还是整体请求形态变化。

### 4.4 缺少 TTFT 验收数据

DeepSeek Context Caching 的收益不只是费用，也包括首 token 延迟。需要记录：

- `sentAt`
- `firstTokenAt`
- `completedAt`
- `ttftMs`

后续才能做 `cachedTokenRatio` 与 `ttftMs` 的关系分析。

### 4.5 上下文滑杆会改变前缀

Pixory 支持用户滑动切换上下文装配条数。`historyRoundLimit` 改变时，历史前缀会变化，DeepSeek cache 可能 miss。

这不是错误，但必须记录为上下文装配 profile 变化，避免误判为 RAG 或分支回放问题。

## 5. 目标架构

### 5.1 数据层

新增两张表：

- `ai_prompt_requests`
- `ai_prompt_message_snapshots`

`ai_prompt_requests` 记录一次 DeepSeek 请求的元信息、缓存诊断 hash、DeepSeek usage、TTFT。

`ai_prompt_message_snapshots` 记录这次请求实际发送给 DeepSeek 的 message 片段，包括 system、history、current user rendered content。

### 5.2 请求回放层

构造 DeepSeek history 时，先按现有逻辑得到当前可见历史消息序列，然后对其中 user 消息执行替换：

```text
干净 user content
  -> 如果找到当前路线对应的 current_user_rendered snapshot，则替换成 rendered content
  -> 找不到则继续使用干净 content
```

assistant 消息仍使用当前路线可见的干净 assistant content。

### 5.3 Provider 限定

只在官方 DeepSeek V4 启用：

```ts
isOfficialDeepSeekV4Model({
  providerType: provider.providerType,
  baseUrl: provider.baseUrl,
  modelId,
})
```

其他 provider 不使用 ledger replay。

## 6. Schema 定稿

### 6.1 `ai_prompt_requests`

```ts
ai_prompt_requests {
  id: string
  threadId: string
  userMessageId: string
  assistantMessageId: string

  branchRouteHash: string
  branchScopesJson: string
  lineageVersion: number

  requestKind: "generate" | "regenerate" | "continue" | "followup"
  status: "pending" | "completed" | "failed"

  promptVersion: number
  contextAssemblyProfileHash: string
  historyRoundLimit: number

  providerId: string
  modelId: string

  stablePrefixHash: string
  historyHash: string
  retrievalHash: string
  requestMessagesHash: string

  promptCacheHitTokens: number | null
  promptCacheMissTokens: number | null
  cachedTokenRatio: number | null

  sentAt: string
  firstTokenAt: string | null
  completedAt: string | null
  ttftMs: number | null

  createdAt: string
  updatedAt: string
}
```

说明：

- `branchRouteHash`：当前完整 branch scope 链的 hash。
- `branchScopesJson`：当前完整 branch scope 链 JSON，用于 descendant 判断。
- `lineageVersion`：线程当前分支选择状态版本，用于过期保护。
- `contextAssemblyProfileHash`：装配规则 hash，不包含 RAG 正文。
- `retrievalHash`：实际召回 RAG 片段 hash。
- `requestMessagesHash`：完整 provider messages hash。

### 6.2 `ai_prompt_message_snapshots`

```ts
ai_prompt_message_snapshots {
  id: string
  requestId: string
  threadId: string

  sourceMessageId: string | null
  sourceMessageVersionHash: string
  producedAssistantMessageId: string | null

  branchRouteHash: string
  branchScopesJson: string
  lineageVersion: number

  seq: number
  role: "system" | "user" | "assistant"
  sourceKind:
    | "stable_system"
    | "history_user_rendered"
    | "history_assistant"
    | "current_user_rendered"

  replayPolicy: "never" | "same_route" | "descendant_route"

  content: string
  contentHash: string
  createdAt: string
}
```

说明：

- `current_user_rendered` 是最重要的回放内容。
- `stable_system` 可用于诊断，不参与 user history 替换。
- `history_assistant` 可用于复现整次请求，但普通回放时 assistant content 仍以当前可见历史为准。
- `replayPolicy = never` 的 snapshot 只用于诊断，不参与回放。

## 7. SQL 迁移建议

迁移版本：`V60`。

```sql
CREATE TABLE IF NOT EXISTS ai_prompt_requests (
  id TEXT PRIMARY KEY NOT NULL,
  threadId TEXT NOT NULL,
  userMessageId TEXT NOT NULL,
  assistantMessageId TEXT NOT NULL,
  branchRouteHash TEXT NOT NULL,
  branchScopesJson TEXT NOT NULL DEFAULT '[]',
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  requestKind TEXT NOT NULL CHECK (requestKind IN ('generate', 'regenerate', 'continue', 'followup')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  promptVersion INTEGER NOT NULL,
  contextAssemblyProfileHash TEXT NOT NULL,
  historyRoundLimit INTEGER NOT NULL,
  providerId TEXT NOT NULL,
  modelId TEXT NOT NULL,
  stablePrefixHash TEXT NOT NULL,
  historyHash TEXT NOT NULL,
  retrievalHash TEXT NOT NULL,
  requestMessagesHash TEXT NOT NULL,
  promptCacheHitTokens INTEGER,
  promptCacheMissTokens INTEGER,
  cachedTokenRatio REAL,
  sentAt TEXT NOT NULL,
  firstTokenAt TEXT,
  completedAt TEXT,
  ttftMs INTEGER,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (userMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (assistantMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_requests_assistant
  ON ai_prompt_requests(threadId, assistantMessageId, status, completedAt DESC);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_requests_cache_diagnostics
  ON ai_prompt_requests(threadId, providerId, modelId, branchRouteHash, completedAt DESC);

CREATE TABLE IF NOT EXISTS ai_prompt_message_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  requestId TEXT NOT NULL,
  threadId TEXT NOT NULL,
  sourceMessageId TEXT,
  sourceMessageVersionHash TEXT NOT NULL DEFAULT '',
  producedAssistantMessageId TEXT,
  branchRouteHash TEXT NOT NULL,
  branchScopesJson TEXT NOT NULL DEFAULT '[]',
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  sourceKind TEXT NOT NULL CHECK (sourceKind IN ('stable_system', 'history_user_rendered', 'history_assistant', 'current_user_rendered')),
  replayPolicy TEXT NOT NULL CHECK (replayPolicy IN ('never', 'same_route', 'descendant_route')),
  content TEXT NOT NULL,
  contentHash TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  UNIQUE(requestId, seq),
  FOREIGN KEY (requestId) REFERENCES ai_prompt_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (sourceMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL,
  FOREIGN KEY (producedAssistantMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_snapshots_replay
  ON ai_prompt_message_snapshots(threadId, producedAssistantMessageId, sourceMessageId, sourceKind, replayPolicy);
```

## 8. Repository 设计

新增文件：

```text
src/ai/deepseekPromptLedger.ts
```

建议导出类型：

```ts
export type AiPromptReplayPolicy = 'never' | 'same_route' | 'descendant_route';

export type AiPromptRequestStatus = 'pending' | 'completed' | 'failed';

export type AiPromptRequestKind = 'generate' | 'regenerate' | 'continue' | 'followup';

export type AiPromptSnapshotSourceKind =
  | 'stable_system'
  | 'history_user_rendered'
  | 'history_assistant'
  | 'current_user_rendered';
```

建议导出函数：

```ts
export async function beginDeepSeekPromptRequest(db, input): Promise<void>
```

职责：

- 在请求发给 DeepSeek 前插入 `status = 'pending'` 的 request。
- 不写 snapshots。
- 记录 `sentAt`。

```ts
export async function completeDeepSeekPromptRequest(db, input): Promise<void>
```

职责：

- 必须在事务内调用。
- 先删除同 requestId 的旧 snapshots，保证重试幂等。
- 插入完整 snapshots。
- 最后更新 request 为 `completed`。
- 更新 usage 与 TTFT 字段。

原子性要求：

```text
snapshots 未完整写入 -> request 不得 completed
request 未 completed -> 回放查询不得读取
```

```ts
export async function failDeepSeekPromptRequest(db, input): Promise<void>
```

职责：

- 请求失败、停止、空回复时将 request 标记为 `failed`。
- 不参与回放。

```ts
export async function findRenderedUserSnapshotsForAssistantIds(db, input): Promise<Map<string, Snapshot>>
```

职责：

- 根据当前历史序列中的 assistant ids 批量查找 rendered user snapshot。
- 必须 `JOIN ai_prompt_requests r ON r.id = s.requestId`。
- 必须 `WHERE r.status = 'completed'`。
- 必须 `s.sourceKind = 'current_user_rendered'`。
- 必须 `s.replayPolicy <> 'never'`。

```ts
export async function buildDeepSeekReplayHistory(db, input): Promise<Array<{ role: 'user' | 'assistant'; content: string }>>
```

职责：

- 输入当前可见历史消息记录。
- 找每个 user 后面的当前可见 assistant。
- 用 produced assistant 对应的 snapshot 替换 user content。
- 找不到 snapshot 时 fallback 到干净 content。

## 9. 分支与重生成回放规则

### 9.1 回放主锚点

最可靠锚点是：

```text
producedAssistantMessageId
```

因为当前 user rendered prompt 是为了生成某条 assistant 回复而存在。

在重生成场景中，同一个 user message 可能对应多个 assistant 版本。后续沿着哪个 assistant 版本继续，就应该回放生成那个 assistant 版本时的 rendered user prompt。

### 9.2 回放优先级

对每个历史 user message：

```text
1. producedAssistantMessageId 精准匹配当前可见 assistant
2. same_route + branchRouteHash 匹配
3. descendant_route + branchScopesJson 继承判断
4. fallback 到 ai_messages.content
```

第 4 条 fallback 必须存在，用于：

- 老版本没有 ledger 的历史消息。
- 续聊导入的历史消息。
- snapshot 丢失或异常。
- 非 DeepSeek provider。

### 9.3 `sourceMessageVersionHash`

必须参与匹配。

原因：

- Pixory 支持编辑历史消息。
- Pixory 支持消息版本和分支。
- 同一个 `sourceMessageId` 可能在不同 branch scope 下有不同内容。

如果 hash 不匹配，不能使用 snapshot，必须 fallback。

### 9.4 `branchScopesJson`

当前仓库已有 `resolveBranchLineage()` 动态推算分支 scope 链，不需要新增祖先链表。

但是为了判断 `descendant_route`，snapshot 需要保存当时完整 `branchScopesJson`。

继承判断建议：

```text
snapshotScopes 为空：
  可作为根路线 ancestor，被非 never snapshot 继承。

snapshotScopes 非空：
  如果 snapshotScopes 是 currentScopes 的前缀，视为 descendant_route 可继承。
```

如果担心 prefix 判断与当前分支模型不完全一致，可以第一版只依赖 `producedAssistantMessageId` 和 `same_route`，保留 `descendant_route` 字段但少用。不要为了 descendant_route 新建一套分支真相源。

## 10. `contextAssemblyProfileHash`

这个 hash 只表示“装配规则”，不表示“装配内容”。

应该包含：

```text
promptVersion
promptLayerVersions
chatMode
historyRoundLimit
context budget 策略版本
memoryEpoch
retrievalVersion
retrieval topK / rerank 策略版本
nudge 模板版本
role frame version
thinkingDisabled
requestKind
```

不应该包含：

```text
当前用户消息正文
实际 RAG 片段正文
实际 runtime 情绪文本
requestId
traceId
时间戳
随机数
设备状态
usage
TTFT
```

实际 RAG 内容变化用 `retrievalHash` 表达。

完整 messages 变化用 `requestMessagesHash` 表达。

## 11. `historyHash`

`historyHash` 应该在 DeepSeek 最终发送前计算。

也就是说：

- 非 DeepSeek：可以继续使用旧 history，不要求 ledger。
- DeepSeek：先执行 rendered replay 替换，再计算 `historyHash`。

建议：

```ts
historyHash = hashPromptCacheText(JSON.stringify(history))
```

其中 `history` 是最终发送给 provider 的 history 数组，不含 system 和 current user。

## 12. `stablePrefixHash`

`stablePrefixHash` 使用现有 `prompt.cacheMetadata.stablePrefixHash`。

它应该代表 stable/system 层，而不是完整请求。

如果 stable 层只有 system message，那么它等价于对 system content 的 hash。

## 13. `retrievalHash`

使用现有 `prompt.cacheMetadata.retrievalHash`。

要求：

- 对实际注入本轮 prompt 的 RAG 内容计算。
- 不把 retrieval 策略版本混进来。
- retrieval 策略版本属于 `contextAssemblyProfileHash`。

## 14. `requestMessagesHash`

对最终发送给 DeepSeek 的完整 messages 数组计算。

建议：

```ts
const requestMessages = [
  { role: 'system', content: prompt.system },
  ...history,
  { role: 'user', content: userPrompt },
];

requestMessagesHash = hashPromptCacheText(JSON.stringify(requestMessages));
```

注意：计算时必须使用 provider 最终会收到的 content，而不是中间草稿。

## 15. TTFT 采集

`sentAt`：

- 在调用 `adapter.streamChat()` 前记录。
- 与现有 `providerRequestSentAt` 对齐。

`firstTokenAt`：

- 收到首个有效 `answer_delta` 时记录。
- 如果启用 reasoning 并且首个有效事件是 `reasoning_delta`，也可以记录。
- 如果 reasoning 被禁用且收到 reasoning delta，应忽略。

`ttftMs`：

```ts
ttftMs = Date.parse(firstTokenAt) - Date.parse(sentAt)
```

如果没有 `firstTokenAt`，则为 `null`。

## 16. 与现有文件的集成点

### 16.1 `src/database/schema.ts`

修改：

- `DATABASE_VERSION = 60`
- 添加 `MIGRATION_STATEMENTS_V60`

### 16.2 `src/database/db.ts`

修改：

- import `MIGRATION_STATEMENTS_V60`
- 在 migrations 中添加：

```ts
if (currentVersion < 60) {
  await database.execAsync(MIGRATION_STATEMENTS_V60);
}
```

### 16.3 `src/ai/deepseekPromptLedger.ts`

新增。

负责所有 ledger 写入、查询、回放构造。

### 16.4 `src/ai/aiChatService.ts`

修改点：

1. import `isOfficialDeepSeekV4Model`。
2. import ledger 方法。
3. 在普通 history 构造完成后，如果是官方 DeepSeek V4，则执行 `buildDeepSeekReplayHistory()`。
4. 在请求发出前 `beginDeepSeekPromptRequest()`。
5. 在流式事件中记录 `firstTokenAt`。
6. 在最终完成事务里 `completeDeepSeekPromptRequest()`。
7. 在失败/停止路径中 `failDeepSeekPromptRequest()`。

不要改普通导入导出逻辑。

### 16.5 `docs/feature-matrix.md`

更新 Prompt/cache 或 Usage 行，说明：

- DeepSeek 官方 V4 使用本地 Prompt Ledger 做分支感知 rendered replay。
- 记录 stable/history/retrieval/request hash。
- 记录 DeepSeek native cache hit/miss 与 TTFT。
- 导入导出仍使用干净聊天内容。

## 17. TDD 计划

### Task 1：Schema Policy Test

新增测试：

```text
tests/ai-deepseek-prompt-ledger-policy.test.cjs
```

测试内容：

- `DATABASE_VERSION = 60`
- `MIGRATION_STATEMENTS_V60`
- 两张表存在。
- request 字段完整。
- snapshot 字段完整。
- check constraints 存在。
- replay index 存在。

运行：

```bash
node --test tests/ai-deepseek-prompt-ledger-policy.test.cjs
```

预期先失败，原因是 V60 和 ledger schema 不存在。

### Task 2：Ledger Repository Policy Test

同一个测试文件继续检查：

- `src/ai/deepseekPromptLedger.ts` 存在。
- 导出 `beginDeepSeekPromptRequest`。
- 导出 `completeDeepSeekPromptRequest`。
- 导出 `failDeepSeekPromptRequest`。
- 导出 `findRenderedUserSnapshotsForAssistantIds`。
- 回放查询包含 `JOIN ai_prompt_requests r ON r.id = s.requestId`。
- 回放查询包含 `r.status = 'completed'`。
- 回放查询包含 `s.sourceKind = 'current_user_rendered'`。

预期先失败。

### Task 3：DeepSeek-only Integration Policy Test

检查 `src/ai/aiChatService.ts`：

- 使用 `isOfficialDeepSeekV4Model`。
- 只在 DeepSeek 官方 V4 执行 ledger replay。
- 有 `historyHash`、`stablePrefixHash`、`retrievalHash`、`requestMessagesHash`。
- 有 `firstTokenAt`、`ttftMs`。
- 有 begin/complete/fail 调用。

预期先失败。

### Task 4：Import/Export Isolation Policy Test

检查这些文件不读取 ledger 表：

```text
src/ai/memory/nativeMemoryPackage.ts
src/ai/aiContinuityImportService.ts
```

断言：

```text
不出现 ai_prompt_requests
不出现 ai_prompt_message_snapshots
```

## 18. 推荐 policy 测试示例

可以直接创建以下测试框架，然后根据实际代码微调正则：

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('DeepSeek prompt ledger schema stores route-aware replay snapshots and cache diagnostics hashes', () => {
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');

  assert.match(schema, /DATABASE_VERSION = 60/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_prompt_requests/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_prompt_message_snapshots/);
  assert.match(schema, /stablePrefixHash TEXT NOT NULL/);
  assert.match(schema, /historyHash TEXT NOT NULL/);
  assert.match(schema, /retrievalHash TEXT NOT NULL/);
  assert.match(schema, /requestMessagesHash TEXT NOT NULL/);
  assert.match(schema, /firstTokenAt TEXT/);
  assert.match(schema, /ttftMs INTEGER/);
  assert.match(schema, /branchScopesJson TEXT NOT NULL DEFAULT '\\[\\]'/);
  assert.match(schema, /producedAssistantMessageId TEXT/);
  assert.match(schema, /replayPolicy TEXT NOT NULL CHECK \\(replayPolicy IN \\('never', 'same_route', 'descendant_route'\\)\\)/);
  assert.match(schema, /idx_ai_prompt_snapshots_replay/);

  assert.match(db, /MIGRATION_STATEMENTS_V60/);
  assert.match(db, /if \\(currentVersion < 60\\)/);
});

test('DeepSeek prompt ledger repository completes only after snapshots are written and replays completed requests only', () => {
  const ledger = read('src/ai/deepseekPromptLedger.ts');

  assert.match(ledger, /export type AiPromptReplayPolicy = 'never' \\| 'same_route' \\| 'descendant_route'/);
  assert.match(ledger, /beginDeepSeekPromptRequest/);
  assert.match(ledger, /completeDeepSeekPromptRequest/);
  assert.match(ledger, /failDeepSeekPromptRequest/);
  assert.match(ledger, /INSERT INTO ai_prompt_message_snapshots/);
  assert.match(ledger, /UPDATE ai_prompt_requests\\s+SET status = 'completed'/);
  assert.match(ledger, /findRenderedUserSnapshotsForAssistantIds/);
  assert.match(ledger, /JOIN ai_prompt_requests r ON r\\.id = s\\.requestId/);
  assert.match(ledger, /r\\.status = 'completed'/);
  assert.match(ledger, /s\\.sourceKind = 'current_user_rendered'/);
  assert.match(ledger, /s\\.replayPolicy <> 'never'/);
});

test('DeepSeek history replay is provider-specific and ordinary exports keep clean ai_messages content', () => {
  const chat = read('src/ai/aiChatService.ts');
  const nativePackage = read('src/ai/memory/nativeMemoryPackage.ts');
  const continuityImport = read('src/ai/aiContinuityImportService.ts');

  assert.match(chat, /isOfficialDeepSeekV4Model/);
  assert.match(chat, /buildDeepSeekReplayHistory/);
  assert.match(chat, /beginDeepSeekPromptRequest/);
  assert.match(chat, /completeDeepSeekPromptRequest/);
  assert.match(chat, /failDeepSeekPromptRequest/);
  assert.match(chat, /stablePrefixHash: prompt\\.cacheMetadata\\.stablePrefixHash/);
  assert.match(chat, /historyHash: hashPromptCacheText\\(JSON\\.stringify\\(history\\)\\)/);
  assert.match(chat, /retrievalHash: prompt\\.cacheMetadata\\.retrievalHash/);
  assert.match(chat, /requestMessagesHash/);
  assert.match(chat, /firstTokenAt/);
  assert.match(chat, /ttftMs/);

  assert.doesNotMatch(nativePackage, /ai_prompt_message_snapshots|ai_prompt_requests/);
  assert.doesNotMatch(continuityImport, /ai_prompt_message_snapshots|ai_prompt_requests/);
});
```

## 19. 功能测试建议

如果可以写真实 unit test，优先覆盖 `deepseekPromptLedger.ts` 的纯函数部分：

### 19.1 produced assistant 精准匹配

输入：

```text
history:
  user_2 clean content
  assistant_2_prime visible

snapshots:
  request for assistant_2 -> rendered_user_2
  request for assistant_2_prime -> rendered_user_2_prime
```

期望：

```text
user_2 被替换为 rendered_user_2_prime
```

### 19.2 sourceMessageVersionHash 不匹配 fallback

输入：

```text
sourceMessageId 相同
sourceMessageVersionHash 不同
```

期望：

```text
使用 ai_messages.content 干净内容
```

### 19.3 old imported history fallback

输入：

```text
历史消息没有任何 snapshot
```

期望：

```text
仍然正常构造 history
不抛错
```

### 19.4 DeepSeek-only

输入：

```text
provider 不是官方 DeepSeek V4
```

期望：

```text
不调用 ledger replay
history 与旧逻辑一致
```

## 20. 原子性标准

正确顺序：

```text
1. begin request -> status = pending
2. 发起 DeepSeek streaming request
3. 采集 usage / firstTokenAt / completedAt
4. 最终 assistant 内容落库
5. 同一事务写入 snapshots
6. 同一事务把 request status 更新为 completed
```

错误顺序：

```text
1. request 先 completed
2. snapshots 后写
```

这个错误会导致 App 崩溃后下一轮读到半截数据。

回放查询必须包含：

```sql
JOIN ai_prompt_requests r ON r.id = s.requestId
WHERE r.status = 'completed'
```

## 21. DeepSeek usage 字段

DeepSeek 官方 usage 中关注：

```text
prompt_cache_hit_tokens
prompt_cache_miss_tokens
prompt_tokens
completion_tokens
```

项目现有 `src/ai/aiProviderUsage.ts` 已有 DeepSeek native usage 归一化逻辑。执行者应复用现有 `normalizeProviderUsage()`，不要重复写一套解析。

落库：

```ts
promptCacheHitTokens = normalizedUsage.cachedInputTokens
promptCacheMissTokens = normalizedUsage.cacheMissInputTokens
cachedTokenRatio = normalizedUsage.cachedTokenRatio
```

## 22. 验收指标

### 22.1 正确性

- 分支重生成后继续对话，回放的是当前可见 assistant 版本对应的 rendered user。
- 旧历史、导入历史、无 ledger 历史不报错。
- 非 DeepSeek 官方 V4 行为不变。
- 导入导出内容不含 RAG/runtime/nudge。

### 22.2 可观测性

每条 completed DeepSeek request 应可查询：

- stable prefix 是否变化。
- history 是否变化。
- retrieval 是否变化。
- 完整 request 是否变化。
- cache hit/miss token。
- cached token ratio。
- TTFT。

### 22.3 性能

- Ledger 查询应批量按 assistant ids 查，不要每条历史消息单独查数据库。
- 没有 snapshot 时应快速 fallback。
- 不应在 UI 线程做大 JSON 解析循环；如不可避免，控制数据量。

### 22.4 数据隔离

- Personal space 与 normal space 仍然物理隔离，因为 ledger 表在各自 SQLite 中迁移。
- 不跨 space 查询 ledger。
- 不把 provider prompt 正文混入普通导出。

## 23. 命令验收

执行者最终必须跑：

```bash
pnpm typecheck
pnpm test
git diff --check
```

如果其中任何一个失败，不能声称完成。

如果命令超时：

1. 先检查进程是否仍在运行。
2. 检查是否产生副作用。
3. 不要盲目重复执行。
4. 报告超时命令、已检查状态、是否安全重试。

## 24. 人工验收清单

验收者检查 diff 时逐项确认：

- [ ] 只在独立分支/工作树改动。
- [ ] 没有把 rendered prompt 写入 `ai_messages.content`。
- [ ] `ai_prompt_requests.status = completed` 晚于 snapshots 完整写入。
- [ ] 回放查询过滤 `r.status = 'completed'`。
- [ ] `producedAssistantMessageId` 是回放主锚点。
- [ ] `sourceMessageVersionHash` 参与匹配。
- [ ] `branchRouteHash` 和 `branchScopesJson` 都落库。
- [ ] `contextAssemblyProfileHash` 不包含 RAG 正文。
- [ ] `retrievalHash` 单独记录实际 RAG 内容 hash。
- [ ] `historyRoundLimit` 落库。
- [ ] 记录 `sentAt / firstTokenAt / completedAt / ttftMs`。
- [ ] 非 DeepSeek 官方 V4 不走 ledger replay。
- [ ] `nativeMemoryPackage.ts` 不读取 ledger 表。
- [ ] `aiContinuityImportService.ts` 不读取 ledger 表。
- [ ] `docs/feature-matrix.md` 已更新。
- [ ] `pnpm typecheck` 通过。
- [ ] `pnpm test` 通过。
- [ ] `git diff --check` 通过。

## 25. 不要做的事

- 不要引入 Redis、GPTCache、LangChain semantic cache。
- 不要把相似问题的旧回答复用给陪伴聊天。
- 不要修改导入导出格式，除非另有明确需求。
- 不要把 RAG 片段、runtime、nudge 写进干净消息正文。
- 不要为 descendant route 新增独立祖先链真相源。
- 不要重构整个 `aiChatService.ts`。
- 不要修改 DeepSeek 以外 provider 的请求行为。
- 不要在 Personal space 和 normal space 之间共享 ledger。

## 26. 给执行模型的完整提示词

```text
你在 D:\Project\Pixory\pixory 工作。请先阅读 AGENTS.md 和本文档，然后在独立分支/工作树 codex/deepseek-prompt-ledger 上实施。不要在 main 直接改。

目标：只针对 DeepSeek 官方 V4 优化 Context Caching。实现本地 Prompt Ledger，让每轮实际发送给 DeepSeek 的 rendered user prompt 被保存，并在下一轮历史回放时按当前分支路线精准复用。不得污染 ai_messages.content，不得影响导入导出和续聊导入。

必须先写失败测试，再写实现。新增 tests/ai-deepseek-prompt-ledger-policy.test.cjs，至少覆盖：
1. DATABASE_VERSION 升到 60。
2. schema 有 ai_prompt_requests 与 ai_prompt_message_snapshots。
3. request 有 stablePrefixHash/historyHash/retrievalHash/requestMessagesHash/sentAt/firstTokenAt/ttftMs/status。
4. snapshot 有 branchRouteHash/branchScopesJson/lineageVersion/sourceMessageVersionHash/producedAssistantMessageId/replayPolicy。
5. replay 查询 JOIN ai_prompt_requests 并过滤 r.status = 'completed'。
6. DeepSeek-only：只有 official DeepSeek V4 使用 ledger replay。
7. nativeMemoryPackage.ts 与 aiContinuityImportService.ts 不读取 ledger 表。

实现：
1. 修改 src/database/schema.ts：DATABASE_VERSION = 60，新增 MIGRATION_STATEMENTS_V60。
2. 修改 src/database/db.ts：导入并执行 MIGRATION_STATEMENTS_V60。
3. 新增 src/ai/deepseekPromptLedger.ts，导出 beginDeepSeekPromptRequest、completeDeepSeekPromptRequest、failDeepSeekPromptRequest、findRenderedUserSnapshotsForAssistantIds、buildDeepSeekReplayHistory。
4. 修改 src/ai/aiChatService.ts：仅 official DeepSeek V4 在 history 构造后执行 ledger replay；请求前 begin；流式首 token 记录 firstTokenAt；完成后 complete；失败/停止/空回复 fail。
5. complete 必须在同一事务中先写完整 snapshots，再 UPDATE ai_prompt_requests SET status = 'completed'。
6. 回放优先级：producedAssistantMessageId 精准匹配当前可见 assistant；same_route；descendant_route；fallback ai_messages.content。
7. sourceMessageVersionHash 必须参与匹配。
8. contextAssemblyProfileHash 只包含装配规则，不包含 RAG 正文。
9. retrievalHash 单独记录实际 RAG 内容 hash。
10. 使用现有 normalizeProviderUsage() 读取 DeepSeek prompt_cache_hit_tokens / prompt_cache_miss_tokens。
11. 更新 docs/feature-matrix.md。

验证：
pnpm typecheck
pnpm test
git diff --check

最终交付报告必须包含：
- 修改文件列表
- schema 字段与索引摘要
- DeepSeek-only 判断位置
- 分支/重生成回放逻辑说明
- 导入导出隔离证明
- 测试命令输出摘要
- 未验证风险
```

## 27. 验收者备注

验收时不要只看测试通过。这个改动最容易出现三类隐性 bug：

1. 把 rendered prompt 混入干净聊天历史，导致导出、搜索、记忆提取污染。
2. request 先 completed，snapshot 后写，导致崩溃后半截数据参与回放。
3. 重生成分支只按 `sourceMessageId` 找 snapshot，导致 Turn 3 回放到旧 assistant 版本对应的 RAG。

重点审查这三点。

## 28. 2026-09-05 总体方案定稿

本章节是前述 Prompt Ledger 计划的正式扩展和最终执行口径。若前文章节与本章节在 Prompt 装配、日志字段、性能验收、视觉模型或 snapshot 粒度上存在差异，以本章节为准。

本阶段同时解决：

1. DeepSeek 官方 V4 专属 Prompt Ledger，提高可复用历史前缀的 Context Caching 命中率。
2. 情绪、姿态、评分和伴侣内部决策退出主聊天 Prompt，避免 reasoning 执行额外策略分类。
3. 多线程切换、分支、重生成、继续生成、图片、文档和后台恢复等复杂场景保持正确。
4. 建立发送、数据库、上下文、Provider、流式渲染、页面加载、刷新和导航全链路日志。
5. 在设置页增加脱敏诊断日志导出，用真实数据制定后续优化计划。

优先级：

```text
聊天与分支正确性
> 记忆和导入导出完整性
> 视觉输入真实性
> 可复用前缀稳定性
> 首 token 延迟
> 日志可解释性
> 存储开销
```

### 28.1 90%+ 的科学定义

不得承诺所有请求始终超过 90%。冷启动、修改轮数、编辑消息、切换分支、角色或稳定记忆变化、导入旧历史、模型切换和 Provider 缓存回收都会合法改变前缀。

正式目标：

```text
eligiblePrefixReuseRatio >= 90%

eligible 请求：
- official DeepSeek V4 文本请求
- 同一 thread 第 2 轮及以后
- contextAssemblyProfileHash 未变化
- branchRouteHash 未变化
- stablePrefixHash 未变化
- source message 未编辑
- 前一轮 completed Ledger snapshot 存在
- 非 continue 特殊请求
```

```ts
eligiblePrefixReuseRatio =
  promptCacheHitTokens / Math.max(1, reusablePrefixEstimatedTokens);

providerCachedTokenRatio =
  promptCacheHitTokens /
  Math.max(1, promptCacheHitTokens + promptCacheMissTokens);
```

- `eligiblePrefixReuseRatio` 衡量 Pixory 可控历史前缀的复用。
- `providerCachedTokenRatio` 是整个请求的 Provider 原始缓存占比；当前用户消息和当前轮动态内容天然属于 miss。

验收：

```text
eligiblePrefixReuseRatio：P50 >= 95%，P90 >= 90%
Ledger 精准回放率：>= 99%
未知 miss reason：< 5%
eligible 样本不足 100 条时不得声称达到 90%+
```

## 29. 最终 Prompt 装配契约

### 29.1 Provider messages 固定顺序

```ts
const messages = [
  { role: 'system', content: stableSystemPrompt },
  ...deepSeekReplayHistory,
  { role: 'user', content: currentRenderedUserPrompt },
];
```

空 block 稳定省略；分隔符固定；数组按稳定业务 key 排序；不得加入时间、随机数、request ID 或 generation ID。

### 29.2 稳定 System 前缀

只允许用户编辑的 system prompt、角色卡核心、回复偏好、必要材料规则、已晋升稳定摘要、确认后的长期记忆快照，以及材料会话固定引用协议。

不得包含 affect、relationship、stance、primaryIntent、warmth、reassurance、energy、assertiveness、intimacy、responseLength、topic score、当前轮 RAG、动态记忆、附件摘要、用户消息、时间和诊断数据。

### 29.3 情绪系统边界

情绪系统继续本地维护 affect、relationship、stance、open loop、temporal anchor、repair、topic score、dream、diary 和 thought 状态。

主聊天默认：

```ts
companionPromptInjectionMode = 'disabled';
```

不得注入当前回应姿态、回应意图、温度、安抚、能量、主动性、亲密表达、篇幅、安慰/修复模式或“高于角色表演要求”等内部规则。

未来 A/B 只允许：

```ts
type CompanionPromptInjectionMode = 'disabled' | 'facts_only';
```

`facts_only` 只能注入经验证的连续性事实，不得注入回应策略、评分、强制风格或思考步骤。

### 29.4 当前分支历史回放

```text
conversation coverage 选择历史
→ historyRoundLimit 裁剪
→ 当前 branch 路线
→ user 后当前可见 assistant 为主锚点
→ producedAssistantMessageId 批量查 completed snapshot
→ 校验 sourceMessageVersionHash
→ 校验 same_route / descendant_route
→ 替换 user 为当时 current_user_rendered
→ 找不到则保留 ai_messages.content
```

assistant 始终使用当前可见 `ai_messages.content`；普通下一轮不得回放 `reasoningText`。

### 29.5 当前轮动态 User Prompt

固定顺序：

```text
summary_bridge
dynamic_memory
retrieval_context
attachment_context
current_user_message
post_history_instruction
```

用户原始消息完整保留；RAG 按 documentVersion、chunkId、refId 稳定排序；动态内容本轮属于 miss，下一轮通过 Ledger 原样回放后成为可复用历史前缀。

### 29.6 请求类型与上下文轮数

```text
generate：写可回放 snapshot
regenerate：写新 snapshot 并绑定新 assistant
continue：只写诊断，不覆盖原 user snapshot
followup：只有真实新 user message 才写 snapshot
```

`contextHistoryRoundLimit` 保持唯一产品设置；Ledger 只替换已选历史。修改轮数后允许一次 `history_round_limit_changed` miss，不得偷偷改变用户轮数。

## 30. 可复用前缀稳定策略

```text
角色核心 + 固定规则 + 稳定摘要 + 稳定记忆
→ Ledger 历史
→ 当前轮动态内容
→ 当前用户消息
```

只有用户手动记忆变更、高置信度维护完成、稳定摘要晋升或用户纠正导致稳定记忆失效时才能推进 `memoryEpoch`。普通情绪波动、自动画像细节和短期观察不得改变稳定前缀。

```ts
type StablePromptDescriptor = {
  promptSchemaVersion: number;
  historyRoundLimit: number;
  stableBlockVersions: Record<string, number>;
  memoryEpoch: string;
  branchRouteHash: string;
  thinkingDisabled: boolean;
  reasoningEffort: 'low' | 'high' | 'max' | null;
  attachmentMode: 'none' | 'text_only' | 'vision';
};
```

对象 key 和数组顺序稳定后再 hash。

## 31. DeepSeek 图片发送链路调查结论与修复范围

### 31.1 当前链路

```text
选择图片
→ 复制到线程私有目录
→ ai_message_attachments 保存 localUri/mimeType/fileSize
→ prepareOutgoingAttachments()
→ Base64 读取
→ AiChatAttachment
→ image_url data URL
→ /chat/completions
```

当前 request content 结构基本符合 DeepSeek 官方视觉示例的 OpenAI-compatible `image_url` 形式。

### 31.2 当前高概率根因

截至 2026-09-05，DeepSeek 官方视觉文档列出的视觉模型是单独的实验模型 `deepseek-v4-flash-vision-exp`，而当前 Pixory：

- 只允许 `deepseek-v4-flash` 和 `deepseek-v4-pro`。
- `DEEPSEEK_OFFICIAL_MODEL_IDS` 不包含视觉实验模型。
- DeepSeek 内置模型 `supportsVision` 为 false。
- DeepSeek provider preset `visionEnabled` 为 false。
- 发送代码因为“用户附图优先”仍会把图片强制发给纯文本 Flash/Pro。

因此图片可能已经进入 HTTP body，但目标模型不接受图片，最终返回 400 或模型能力错误。

### 31.3 视觉修复原则

1. 不向纯文本模型强制发送图片。
2. 为官方视觉模型建立独立 allowlist 和能力声明。
3. 能力来自官方策略或能力探测，不根据名称猜测。
4. JPEG、PNG、GIF、WebP 直接支持；HEIC/HEIF 明确拒绝或生成临时派生副本，绝不覆盖原图。
5. 记录 modelId、MIME、图片数、原始字节、Base64 字节、request body bytes、HTTP 状态和稳定错误码。
6. 视觉实验模型的 Context Caching 必须通过真实 usage 验证，未验证前不计入文本 90% 目标。

### 31.4 模型策略

```ts
export const DEEPSEEK_OFFICIAL_TEXT_MODEL_IDS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
] as const;

export const DEEPSEEK_OFFICIAL_VISION_MODEL_IDS = [
  'deepseek-v4-flash-vision-exp',
] as const;
```

```text
无图片 → 使用当前文本或视觉模型
有图片 + 支持视觉 → 发送 image_url
有图片 + 不支持视觉 → 请求前阻止并提示切换视觉模型
```

不得静默丢图，也不得只发送文件名后让模型误以为看到了图片。

### 31.5 图片请求前验证

校验 URI、文件存在、实际文件签名、MIME、支持格式、单图与总大小、Base64 非空、data URL 前缀和最终 image content block 数量。官方 inline Base64 请求体上限为 48 MiB，单图上限为 32 MiB；本地门禁必须在 Base64 编码前按原始大小预判，并在编码后按最终 JSON body bytes 再校验一次。图片仅允许出现在 user message，禁止写入 system/assistant history。

## 32. 复杂稳定性矩阵

| 场景 | 必须保证 |
|---|---|
| 快速切换多个线程 | generation、Ledger、日志按 threadId/generationId 隔离，旧流不污染当前页面 |
| normal/personal 切换 | 使用各自 SQLite，不共享 Ledger、附件路径或可关联日志 ID |
| 线程 A 生成中打开 B | A 可后台完成；B 不显示 A 的 delta、错误、缓存或附件状态 |
| App 后台恢复 | generation job 可恢复；pending Ledger 不回放；日志 flush 后续写 |
| 分支切换 | 产生已分类 miss，只回放当前路线 snapshot |
| 重生成 | 同一 user 的不同 assistant 绑定不同 rendered snapshot |
| 编辑历史 | sourceMessageVersionHash 失效并 fallback |
| 修改轮数 | 一次 profile miss，后续相同配置重新稳定 |
| 文本 + 单图 | 只向视觉模型发送并证明图片进入 request body |
| 文本 + 多图 | 顺序稳定、总大小校验、读取并发有界 |
| 图片读取失败 | 明确失败数，UI 不得声称模型已看到 |
| HEIC/不支持格式 | 拒绝或生成临时派生副本，不覆盖原图 |
| 图片 + RAG + 记忆 | block 顺序稳定，attachmentHash 与 retrievalHash 分离 |
| continue + 图片 | 使用持久附件，不依赖已失效临时 URI |
| 导入旧对话 | 无 Ledger 时干净 fallback，新轮逐步建立 Ledger |
| 删除线程 | 级联删除关联 Ledger/generation/diagnostics，不影响其他线程 |

## 33. 全链路诊断架构

### 33.1 统一事件流

```text
业务模块
→ DiagnosticEvent
→ 内存缓冲
→ 批量 SQLite
→ 保留期清理
→ 设置页导出脱敏 ZIP
```

“详细日志”指阶段、数量、hash、版本、耗时、状态、错误码和关联 trace 详细，不代表默认记录聊天正文。

### 33.2 数据库版本与表

```text
当前：V59
Prompt Ledger：V60
统一 diagnostics：V61
```

```sql
CREATE TABLE IF NOT EXISTS diagnostic_events (
  id TEXT PRIMARY KEY NOT NULL,
  sessionId TEXT NOT NULL,
  traceId TEXT,
  parentTraceId TEXT,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal', 'global')),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  phase TEXT,
  status TEXT NOT NULL CHECK (status IN ('start', 'success', 'failure', 'cancelled', 'info')),
  durationMs INTEGER,
  threadIdHash TEXT,
  messageIdHash TEXT,
  routeName TEXT,
  payloadJson TEXT NOT NULL DEFAULT '{}',
  errorCode TEXT,
  createdAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_events_created
  ON diagnostic_events(createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_events_trace
  ON diagnostic_events(traceId, createdAt ASC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_events_category
  ON diagnostic_events(category, name, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_events_thread
  ON diagnostic_events(threadIdHash, createdAt DESC);
```

### 33.3 类型与隐私 allowlist

```ts
type DiagnosticCategory =
  | 'app'
  | 'navigation'
  | 'screen'
  | 'database'
  | 'chat_generation'
  | 'prompt_assembly'
  | 'prompt_cache'
  | 'memory'
  | 'retrieval'
  | 'attachment'
  | 'provider'
  | 'streaming'
  | 'render'
  | 'refresh'
  | 'export';
```

payload 使用 allowlist。出现 `content`、`prompt`、`systemPrompt`、`apiKey`、`reasoningText`、`memoryText`、`retrievedText`、文件名或完整路径 key 时拒绝写入。

normal 和 personal 使用各自数据库。global 事件不得保存 Personal 可关联原始 ID。thread/message ID 使用本地诊断 salt hash，导出时不包含 salt。

### 33.4 低开销与保留

```text
内存缓冲上限：200
25 条或 2 秒批量 flush
App background：立即 flush
Generation settled：立即 flush 当前 trace
streaming delta：只在内存计数，结束时写汇总
默认保留：7 天或 20,000 条
failure：保留 30 天，最多 5,000 条
```

日志失败不得阻塞聊天、页面加载或刷新；不得逐 token 写 SQLite。

## 34. 聊天、缓存、视觉和 Provider 指标

### 34.1 生成阶段

```text
send_pressed
user_message_persist
assistant_placeholder_persist
branch_resolve
generation_job_persist
provider_resolve
attachment_validate
attachment_copy
attachment_read
attachment_encode
companion_observer
companion_compiler
conversation_coverage
memory_retrieval
stable_memory_build
dynamic_memory_build
material_retrieval
query_embedding
prompt_layer_build
context_budget_trim
ledger_replay_query
ledger_replay_apply
request_hash_build
request_serialize
provider_request_sent
first_provider_byte
first_reasoning_delta
first_answer_delta
first_ui_patch
first_visible_text
final_persist
generation_settled
```

必须区分 first byte、first reasoning、first answer 和 first visible text。当前单一 `firstProviderDeltaAt` 不能代替用户看到正文的时间。

### 34.2 派生耗时

```text
sendToProviderRequestMs
providerRequestToFirstByteMs
providerRequestToFirstDeltaMs
providerRequestToFirstAnswerDeltaMs
sendToFirstVisibleTextMs
branchResolveMs
generationJobPersistMs
providerResolveMs
attachmentValidateMs
attachmentCopyMs
attachmentReadMs
attachmentEncodeMs
companionObserverMs
companionCompilerMs
conversationCoverageMs
memoryRetrievalMs
stableMemoryBuildMs
dynamicMemoryBuildMs
retrievalMs
queryEmbeddingMs
promptLayerBuildMs
contextBudgetTrimMs
ledgerReplayQueryMs
ledgerReplayApplyMs
requestHashMs
requestSerializeMs
firstDeltaToFirstUiPatchMs
finalizationMs
```

### 34.3 Prompt 和缓存体积

```text
stablePrefixEstimatedTokens
stableMemoryEstimatedTokens
replayedHistoryEstimatedTokens
currentDynamicMemoryEstimatedTokens
retrievalEstimatedTokens
attachmentEstimatedTokens
currentUserEstimatedTokens
totalPromptEstimatedTokens
requestBodyBytes
historyMessageCount
historyRoundCount
ledgerCandidateCount
ledgerMatchedCount
ledgerFallbackCount
retrievalSnippetCount
memoryCandidateCount
memoryInjectedCount
promptCacheHitTokens
promptCacheMissTokens
providerCachedTokenRatio
reusablePrefixEstimatedTokens
eligiblePrefixReuseRatio
cacheMissReason
```

### 34.4 视觉链路

```text
selectedImageCount
validatedImageCount
sentImageCount
failedImageCount
unsupportedImageCount
originalImageBytes
base64Bytes
requestBodyBytes
imageMimeTypes（枚举聚合，不含文件名）
visionModelSelected
modelSupportsVision
providerVisionEnabled
imageContentBlockCount
providerHttpStatus
providerStableErrorCode
```

### 34.5 Provider

```text
providerType
providerHost
modelId
requestKind
thinkingDisabled
reasoningEffort
httpStatus
finishReason
usageObserved
streamCompletedObserved
chunkCount
answerChars
reasoningChars
firstByteTimeoutTriggered
idleTimeoutTriggered
abortRequested
```

## 35. 页面加载、多线程切换和刷新日志

### 35.1 App 和数据库

```text
app_process_start
database_open_start/end
database_migration_start/end
secure_settings_load_start/end
root_state_restore_start/end
first_root_render
first_interactive
```

### 35.2 导航与线程切换

```text
fromRoute
toRoute
navigationKind
routeStackDepth
navigationStartAt
screenMountedAt
screenDataReadyAt
firstMeaningfulRenderAt
activeThreadHash
backgroundGenerationCount
```

不得记录线程标题和搜索正文。

### 35.3 AI 首页

```text
thread_list_query_ms
thread_list_row_count
thread_list_first_render_ms
thread_list_refresh_reason
thread_list_cache_hit
thread_list_cache_age_ms
```

### 35.4 聊天页

```text
thread_record_load_ms
initial_message_query_ms
initial_message_row_count
branch_lineage_resolve_ms
message_merge_ms
streaming_state_restore_ms
scroll_anchor_restore_ms
first_message_render_ms
first_screen_stable_ms
```

### 35.5 分页与刷新

```text
history_page_query_ms
history_page_row_count
history_page_merge_ms
history_page_render_ms
history_page_duplicate_count
scroll_offset_before
scroll_offset_after
refresh_reason
refresh_query_count
refresh_db_ms
refresh_merge_ms
refresh_render_ms
refresh_scroll_restore_ms
```

```ts
type RefreshReason =
  | 'pull_to_refresh'
  | 'route_focus'
  | 'message_completed'
  | 'message_failed'
  | 'message_stopped'
  | 'branch_changed'
  | 'message_edited'
  | 'message_regenerated'
  | 'import_completed'
  | 'settings_changed'
  | 'app_foregrounded'
  | 'manual_retry';
```

## 36. 架构快照与诊断包

### 36.1 architecture-snapshot.json

```text
appVersion
runtimeVersion
databaseVersion
platform
androidApiLevel
providerTypesConfigured
activeProviderType
activeProviderHost
activeModelId
historyRoundLimit
promptSchemaVersion
memoryProjectionVersion
memoryRetrievalScorerVersion
companionPolicyVersion
companionPromptInjectionMode
promptLedgerEnabled
diagnosticsSchemaVersion
streamingFeatureFlags
messagePageSize
retrievalLimit
queryEmbeddingTimeoutMs
databaseFileSize
messageCount
threadCount
promptLedgerRequestCount
promptLedgerSnapshotCount
diagnosticEventCount
```

### 36.2 设置页入口

在“我的”设置区域新增“诊断与性能”，路由：

```ts
| { name: 'diagnostics-settings'; space: PixorySpace }
```

新增 `src/screens/DiagnosticsSettingsScreen.tsx`，包含：

1. 基础性能日志开关，默认开启内容无关日志。
2. 日志条数、大小、最早和最新时间。
3. normal/personal 范围；Personal 仅在解锁状态导出。
4. 最近 1 小时、24 小时、7 天、全部保留期。
5. 生成、缓存、页面、数据库、视觉、错误、全部类别。
6. “导出诊断包”主操作。
7. “清除诊断日志”二次确认。
8. 隐私说明：不含聊天正文、Prompt 正文、API key、文件名和完整路径。

### 36.3 ZIP 结构

```text
Pixory-Diagnostics-v{appVersion}-{yyyyMMdd-HHmmss}.zip
├─ manifest.json
├─ architecture-snapshot.json
├─ summary.json
├─ generation-events.jsonl
├─ cache-events.jsonl
├─ attachment-events.jsonl
├─ screen-events.jsonl
├─ database-events.jsonl
├─ errors.jsonl
├─ generation-summary.csv
├─ cache-summary.csv
├─ screen-summary.csv
└─ README.txt
```

`summary.json` 至少包含总生成数、成功/失败/停止、eligible 请求数、缓存 P50/P90/P95、首 token P50/P90/P95、页面加载/刷新 P50/P90/P95、最慢 20 个 trace、miss reason、fast path、附件、context type 和模型聚合。

导出复用 Storage Access Framework：先写 app temp、校验、生成 ZIP、复制到用户目录、最后清理 temp。失败不得删除源日志。

## 37. 当前性能瓶颈假设与验证顺序

当前 Provider 请求前串行等待 generation job、manual dream detection、companion observer/compiler、companion trace、Provider 解析、附件准备以及 memory/retrieval。

当 `companionPromptInjectionMode = 'disabled'` 时，dream detection、companion observer/compiler 和 trace 不再是主回复硬依赖，应进入请求后后台路径。

分支确定后并行启动：

```text
Provider/API key/model 解析
附件验证与读取
conversation coverage + memory
RAG retrieval
Ledger replay 查询
```

把当前笼统的 `promptPipelineMs` 拆成：

```text
contextResolveMs
promptLayerBuildMs
tokenEstimateMs
contextTrimMs
hashMs
serializeMs
```

重点检查 `compileConversationCoverage`、`compileMemoryContextPlan`、`buildCompanionMemoryPrefix`、`buildStableMemoryPrefix` 和 `findCompanionProjection` 是否重复读取相同数据。同一 generation 只允许一个 conversation coverage 真相源。

## 38. 文件结构定稿

### 新增文件

```text
src/ai/deepseekPromptLedger.ts
src/ai/promptAssemblyContract.ts
src/ai/deepseekVisionPolicy.ts
src/diagnostics/diagnosticTypes.ts
src/diagnostics/diagnosticPrivacy.ts
src/diagnostics/diagnosticBuffer.ts
src/diagnostics/diagnosticRepository.ts
src/diagnostics/diagnosticLogger.ts
src/diagnostics/diagnosticSummary.ts
src/diagnostics/diagnosticArchitectureSnapshot.ts
src/diagnostics/diagnosticExportService.ts
src/diagnostics/screenPerformanceTracker.ts
src/screens/DiagnosticsSettingsScreen.tsx
tests/ai-deepseek-prompt-ledger-policy.test.cjs
tests/ai-prompt-assembly-contract-unit.test.cjs
tests/ai-deepseek-vision-policy.test.cjs
tests/ai-deepseek-vision-payload-unit.test.cjs
tests/ai-multithread-generation-isolation-policy.test.cjs
tests/diagnostic-schema-policy.test.cjs
tests/diagnostic-privacy-unit.test.cjs
tests/diagnostic-buffer-unit.test.cjs
tests/diagnostic-summary-unit.test.cjs
tests/diagnostic-export-policy.test.cjs
tests/diagnostics-settings-ui-policy.test.cjs
tests/ai-chat-full-trace-policy.test.cjs
tests/ai-chat-screen-load-trace-policy.test.cjs
```

### 修改文件

```text
src/database/schema.ts
src/database/db.ts
src/ai/aiChatService.ts
src/ai/promptBuilder.ts
src/ai/aiGenerationMetrics.ts
src/ai/aiPromptCache.ts
src/ai/deepseekModelPolicy.ts
src/ai/providerRegistry.ts
src/ai/aiProviderService.ts
src/ai/providers/base.ts
src/ai/providers/openAiCompatibleProvider.ts
src/ai/companion/companionContextCompiler.ts
src/ai/aiRetrievalService.ts
src/ai/memory/memoryContextPlanService.ts
src/screens/AiChatScreen.tsx
src/screens/AiHomeScreen.tsx
src/screens/MeScreen.tsx
App.tsx
docs/feature-matrix.md
scripts/benchmark-ai-chat-performance.cjs
```

不得把 diagnostics、Ledger 和视觉策略继续堆进 `aiChatService.ts`。

## 39. 分阶段 TDD 实施任务

### Task 1：冻结最终 Prompt 装配契约

**文件：**

- Create: `src/ai/promptAssemblyContract.ts`
- Create: `tests/ai-prompt-assembly-contract-unit.test.cjs`
- Modify: `src/ai/promptBuilder.ts`
- Modify: `src/ai/companion/companionContextCompiler.ts`

- [ ] 写失败测试：稳定层不含 affect、stance、score、时间和 request ID。
- [ ] 写失败测试：动态顺序固定为 summary bridge、dynamic memory、retrieval、attachment、current user、post-history instruction。
- [ ] 写失败测试：injection disabled 时不含“当前回应姿态”“回应意图”“温度”“安抚”“主动性”“亲密表达”。
- [ ] 写失败测试：用户原始消息完整保留。
- [ ] 实现 `assembleStableSystemPrompt()` 与 `assembleCurrentRenderedUserPrompt()`。
- [ ] 移除主聊天 companion projection 注入，保留本地 projection 和 diagnostics。
- [ ] 运行 `node --test tests/ai-prompt-assembly-contract-unit.test.cjs`。

### Task 2：实现 V60 最小 Prompt Ledger

**文件：**

- Modify: `src/database/schema.ts`
- Modify: `src/database/db.ts`
- Create: `src/ai/deepseekPromptLedger.ts`
- Create: `tests/ai-deepseek-prompt-ledger-policy.test.cjs`

- [ ] 写 schema 失败测试，确认 request 与 snapshot 字段、索引和外键。
- [ ] snapshot 默认只持久化可回放 `current_user_rendered`；完整请求只存 hash、token 和统计。
- [ ] 实现 pending、completed、failed 生命周期。
- [ ] complete 在同一事务中先写 snapshots，再标 completed。
- [ ] 实现批量 assistant ID 查询和 completed JOIN 过滤。
- [ ] 实现 producedAssistantMessageId、sourceMessageVersionHash、same route 和 descendant route 匹配。
- [ ] 覆盖 regenerate、branch、edited message、imported history 和 continue 不覆盖。

### Task 3：接入 DeepSeek-only 回放与缓存诊断

**文件：**

- Modify: `src/ai/aiChatService.ts`
- Modify: `src/ai/deepseekModelPolicy.ts`
- Modify: `src/ai/aiPromptCache.ts`
- Test: `tests/ai-deepseek-prompt-ledger-policy.test.cjs`

- [ ] 在现有 history 选择完成后执行 Ledger replay。
- [ ] 仅 official DeepSeek V4 文本模型启用。
- [ ] begin 在实际发送前执行；assistant 完整落库后 complete。
- [ ] stopped、failed、abort 和空回复不得产生可回放 completed snapshot。
- [ ] 记录 candidate、matched、fallback、reusablePrefixEstimatedTokens 和 miss reason。
- [ ] 确认 OpenAI、Claude、Gemini 和自定义中转请求行为不变。

### Task 4：修复 DeepSeek 视觉模型和能力判断

**文件：**

- Create: `src/ai/deepseekVisionPolicy.ts`
- Modify: `src/ai/deepseekModelPolicy.ts`
- Modify: `src/ai/providerRegistry.ts`
- Modify: `src/ai/aiProviderService.ts`
- Modify: `src/ai/aiChatService.ts`
- Create: `tests/ai-deepseek-vision-policy.test.cjs`

- [ ] 写失败测试：纯文本 Flash/Pro 不得接收图片。
- [ ] 写失败测试：官方视觉模型被识别为 supportsVision。
- [ ] 写失败测试：有图且当前模型不支持视觉时，在 Base64 读取前失败并提示切换模型。
- [ ] 写失败测试：模型同步不能把官方视觉模型能力降级为 false。
- [ ] 将文本模型和视觉模型 allowlist 分开。
- [ ] 设置 Provider/model 视觉能力，并在设置页显示“视觉”标签。
- [ ] 视觉实验模型不得默认替换用户当前文本模型，只在用户选择或明确自动切换策略下使用。

### Task 5：验证图片 payload、格式和持久附件

**文件：**

- Modify: `src/ai/providers/openAiCompatibleProvider.ts`
- Modify: `src/ai/aiChatService.ts`
- Modify: `src/ai/aiAttachmentPolicy.ts`
- Create: `tests/ai-deepseek-vision-payload-unit.test.cjs`

- [ ] 测试单图和多图生成正确 `image_url` data URL。
- [ ] 测试文本与图片 content 顺序稳定。
- [ ] 验证 JPEG、PNG、GIF、WebP MIME。
- [ ] HEIC/HEIF 明确拒绝或走独立 temp 派生副本，不修改原图。
- [ ] 测试空 Base64、失效 URI、读取失败、单图超限和总大小超限。
- [ ] continue/retry 使用已持久化附件 localUri，不依赖 picker 临时 URI。
- [ ] Provider 错误分类保留 HTTP 状态和稳定错误码，不把原始敏感 body 写日志。

### Task 6：新增 V61 诊断 schema 与隐私边界

**文件：**

- Modify: `src/database/schema.ts`
- Modify: `src/database/db.ts`
- Create: `src/diagnostics/diagnosticTypes.ts`
- Create: `src/diagnostics/diagnosticPrivacy.ts`
- Create: `src/diagnostics/diagnosticRepository.ts`
- Create: `tests/diagnostic-schema-policy.test.cjs`
- Create: `tests/diagnostic-privacy-unit.test.cjs`

- [ ] 数据库版本升到 61，V60 与 V61 分步执行。
- [ ] 创建 `diagnostic_events` 与索引。
- [ ] 实现 payload allowlist 和 forbidden key 拒绝。
- [ ] 实现 normal/personal/global 规则及本地 salt hash。
- [ ] 测试 API key、正文、文件名和完整路径无法进入日志。
- [ ] 测试 Personal 事件不会进入 normal/global 数据库。

### Task 7：实现低开销日志缓冲

**文件：**

- Create: `src/diagnostics/diagnosticBuffer.ts`
- Create: `src/diagnostics/diagnosticLogger.ts`
- Create: `tests/diagnostic-buffer-unit.test.cjs`

- [ ] 覆盖 25 条 flush、2 秒 flush、200 条上限、background flush 和 generation settled flush。
- [ ] streaming delta 只累加计数，结束写汇总。
- [ ] 批量写入失败保留未落库 failure 事件，最多自动重试一次。
- [ ] diagnostics 不可用时聊天继续。
- [ ] 验证 logger 不产生逐 token SQLite 写入。

### Task 8：扩展生成、缓存和视觉全链路 trace

**文件：**

- Modify: `src/ai/aiGenerationMetrics.ts`
- Modify: `src/ai/aiChatService.ts`
- Modify: `src/ai/aiRetrievalService.ts`
- Modify: `src/ai/memory/memoryContextPlanService.ts`
- Modify: `src/ai/providers/openAiCompatibleProvider.ts`
- Create: `tests/ai-chat-full-trace-policy.test.cjs`

- [ ] 增加本计划 34.1 全部阶段。
- [ ] 区分 first byte、first reasoning、first answer、first UI patch 和 first visible text。
- [ ] 记录 Prompt 各层 token、request body bytes 和 Ledger 时间。
- [ ] 记录图片验证、读取、编码和实际 content block 数。
- [ ] 记录 query embedding、keyword/vector/fallback retrieval 时间。
- [ ] 使用现有 `normalizeProviderUsage()` 记录 DeepSeek cache usage。
- [ ] 所有 metrics 和事件保持内容无关。

### Task 9：缩短 Provider 请求前关键路径

**文件：**

- Modify: `src/ai/aiChatService.ts`
- Modify: `src/ai/companion/companionRuntimeService.ts`
- Modify: `src/ai/companion/companionContextCompiler.ts`
- Test: `tests/ai-chat-full-trace-policy.test.cjs`

- [ ] dream detection 不得位于 Provider 请求前 await 链。
- [ ] companion trace 持久化不得阻塞 Provider 请求。
- [ ] injection disabled 时 companion compiler 不再是 Prompt 硬依赖。
- [ ] Provider resolve、附件准备、memory/retrieval 和 Ledger 查询并行启动。
- [ ] 保留 branch resolution、generation job 和必要附件持久化为发送前步骤。
- [ ] 记录优化前后相同设备的 `sendToProviderRequestMs`。

### Task 10：多线程、后台和分支隔离

**文件：**

- Modify: `src/ai/aiGenerationManager.ts`
- Modify: `src/ai/aiStreamingMessageStore.ts`
- Modify: `src/screens/AiChatScreen.tsx`
- Create: `tests/ai-multithread-generation-isolation-policy.test.cjs`

- [ ] 线程 A 生成中切到 B，A 的 delta 不进入 B。
- [ ] A 后台完成后只更新 A 的 repository 和 streaming identity。
- [ ] normal/personal 同名 ID 不能产生交叉状态。
- [ ] App background/foreground 后 generation、Ledger 和日志 trace 继续关联原 generationId。
- [ ] route 变化后 completion reload 固定绑定原 threadId。
- [ ] 快速来回切换不重复创建 generation job 或 Ledger request。

### Task 11：页面加载、分页和刷新 trace

**文件：**

- Create: `src/diagnostics/screenPerformanceTracker.ts`
- Modify: `src/screens/AiHomeScreen.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `App.tsx`
- Create: `tests/ai-chat-screen-load-trace-policy.test.cjs`

- [ ] 记录 route push/pop/tab switch。
- [ ] 记录 AI 首页 thread query 和 first render。
- [ ] 记录聊天页 thread、message、branch、stream state 和 scroll anchor 加载。
- [ ] 记录分页 query、merge、render 和 scroll offset 保持。
- [ ] 所有 refresh 调用必须传 `RefreshReason`。
- [ ] 防止 React effect 重跑生成重复 start/success 事件。

### Task 12：诊断摘要与架构快照

**文件：**

- Create: `src/diagnostics/diagnosticSummary.ts`
- Create: `src/diagnostics/diagnosticArchitectureSnapshot.ts`
- Create: `tests/diagnostic-summary-unit.test.cjs`

- [ ] 实现 P50/P90/P95。
- [ ] 实现 eligible 请求筛选和 90% 验收。
- [ ] 聚合 miss reason、fast path、附件、context type、模型和线程切换。
- [ ] 生成 architecture snapshot。
- [ ] 覆盖空数据、单样本、偶数样本、异常 duration 和 null usage。

### Task 13：诊断 ZIP 导出

**文件：**

- Create: `src/diagnostics/diagnosticExportService.ts`
- Create: `tests/diagnostic-export-policy.test.cjs`

- [ ] 创建独立 temp 目录。
- [ ] 分页读取并流式写 JSONL/CSV，避免一次加载全部日志。
- [ ] 写 manifest、architecture snapshot、summary 和 README。
- [ ] 生成 ZIP，校验存在和非零大小。
- [ ] 使用 Storage Access Framework 复制到用户目录。
- [ ] 成功或失败后只清理本次 temp。
- [ ] Personal 只有解锁时允许导出。

### Task 14：设置页日志入口

**文件：**

- Create: `src/screens/DiagnosticsSettingsScreen.tsx`
- Modify: `src/screens/MeScreen.tsx`
- Modify: `App.tsx`
- Create: `tests/diagnostics-settings-ui-policy.test.cjs`

- [ ] 新增 `diagnostics-settings` route。
- [ ] “我的”加入“诊断与性能”。
- [ ] 显示日志状态、条数、大小、保留期和时间范围。
- [ ] 增加类别筛选、导出进度、成功路径和错误提示。
- [ ] 增加清除日志二次确认。
- [ ] 使用共享 design tokens，并验证 Android 小屏。

### Task 15：Feature Matrix、基准和总验收

**文件：**

- Modify: `docs/feature-matrix.md`
- Modify: `scripts/benchmark-ai-chat-performance.cjs`

- [ ] 更新 Prompt/cache、视觉输入、生成指标、页面性能和诊断导出条目。
- [ ] 基准覆盖冷启动、稳定连续对话、轮数变化、分支、RAG、单图、多图和线程切换。
- [ ] 运行 `pnpm typecheck`。
- [ ] 运行 `pnpm test`。
- [ ] 运行 `pnpm bench:ai-chat`。
- [ ] 运行 `git diff --check`。
- [ ] Android 真机完成稳定文本聊天、视觉模型图片、多线程切换和后台恢复。
- [ ] 收集至少 100 个 eligible 请求后计算 90%+ 指标。
- [ ] 分别导出 normal 和已解锁 Personal 诊断包并检查内容。

## 40. 性能和正确性门槛

### 40.1 正确性

- 聊天正文、搜索、记忆提取和导入导出不出现 rendered prompt。
- 分支重生成精准匹配当前 assistant。
- continue 不覆盖原 user snapshot。
- 非官方 DeepSeek V4 不走 Ledger。
- 文本模型不接收图片；视觉模型真实收到图片 content block。
- diagnostics 关闭或失败时业务行为不变。

### 40.2 缓存

- eligible 样本达到 100 后评估。
- `eligiblePrefixReuseRatio` P90 >= 90%。
- Ledger 精准匹配率 >= 99%。
- 未分类 miss < 5%。
- 轮数、分支、编辑、memory epoch 和视觉模式变化均有明确 miss reason。

### 40.3 本地性能

先记录基线，再要求：

```text
普通无附件 sendToProviderRequestMs P50 至少下降 30%
普通无附件 sendToProviderRequestMs P90 不回退
diagnostic logger 同步调用开销 P95 < 2ms
日志开启后页面首次加载 P90 回退不超过 5%
批量 flush 不造成可见掉帧
```

绝对毫秒门槛由真实 Android 设备基线确定，不得伪造。

### 40.4 视觉

- 单图、多图和大图错误均可从日志定位到 validate/read/encode/request/provider 阶段。
- `sentImageCount` 必须等于最终 request 的 image content block 数量。
- UI 声称“已发送图片”时，必须已有非空 Base64 block。
- Provider 不支持模型时在请求前失败，不浪费 Base64 和网络时间。

## 41. 诊断隐私与失败降级

默认不得导出 API key、SecureStore、user/assistant/reasoning/memory/RAG/system prompt 正文、附件正文、文件名、完整路径或 Personal 原始 ID。

允许导出 hash、字符/token/字节数、Provider host、model ID、策略版本、阶段耗时、状态、错误码、缓存 usage、数据库行数和文件大小。

```text
Ledger 查询失败 → 干净历史 fallback，记录 ledger_query_failed
Ledger complete 失败 → assistant 保持 completed，request 不标 completed
Diagnostics 写入失败 → 丢弃低优先级 info，业务继续
Diagnostics 导出失败 → 保留源日志，清理本次 temp
页面 trace 未结束 → 下次启动标 abandoned，不伪造成功 duration
图片读取失败 → 请求前明确失败或排除失败图片并明确 UI 状态
```

普通备份、续聊导入和 native memory package 不包含 diagnostics 或 Prompt Ledger；诊断导出是独立功能。

## 42. 首轮数据分析计划

实现后先收集数据，不立即继续大规模重构。第一轮分析必须回答：

1. 首 token 慢主要在请求前还是 Provider 内。
2. `sendToProviderRequestMs` 最慢的三个阶段。
3. cache hit、uncached token 与 Provider TTFT 的相关性。
4. memory、RAG、附件和历史轮数分别增加多少延迟。
5. 图片错误发生在能力判断、读取、编码、HTTP 还是模型拒绝。
6. 页面首次加载慢在数据库、merge、render 还是 scroll restore。
7. 哪些 refresh reason 触发不必要重复查询。
8. Ledger fallback 的主要原因。
9. 多线程切换是否造成旧流、重复查询或重复 generation。
10. 90%+ 是否达到；未达到由哪类 hash 变化导致。

只有完成这份分析，才制定第二轮性能优化计划。

## 43. 最终交付报告

必须包含数据库迁移、最终 Prompt 顺序、情绪系统退出主 Prompt 的证明、DeepSeek-only 判断、Ledger 分支规则、视觉模型与 payload 验证、导入导出隔离、diagnostics schema、设置页入口、导出包清单、P50/P90/P95、eligible 样本与 90% 验收、miss reason、图片失败原因、最慢阶段、页面加载与刷新结果、测试输出和未验证风险。

## 44. 最终禁止项

- 不使用语义缓存复用私人陪伴回复。
- 不为达到 90% 伪造分母、排除正常 eligible 请求或隐藏 miss。
- 不偷偷改变用户上下文轮数。
- 不把 rendered prompt 写入 `ai_messages.content`。
- 不把 diagnostics 混入普通导入导出。
- 不逐 token 写 SQLite。
- 不记录 API key、正文、文件名、完整路径或 Personal 明文 ID。
- 不让 dream、diary、thought 或 companion diagnostics 阻塞首 token。
- 不向不支持视觉的模型强制发送图片。
- 不覆盖、压缩或重编码原始图片；兼容格式只能生成独立临时派生副本。
