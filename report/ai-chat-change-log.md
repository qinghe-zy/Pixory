# AI 聊天变更记录

> 后续 AI 聊天相关新增修改、review 结论和验证结果，统一追加到本文档。

## 2026-05-25

- 采用接近 ChatGPT 的编辑分支方案：编辑原消息后，从该消息开始生成一条新路径；旧的后续消息仍保留在旧版本 / 旧分支里，可切回查看。
- 该方案优先保证数据安全和可恢复性，不做删除后续消息、不弹删除确认；代价是分支可见性、提示词历史、记忆摘要过滤都必须跟随当前版本路径。
- 修复编辑原消息、重新生成后的分支逻辑：后续消息不再删除，改为按旧版本分支隐藏；切换原消息版本时，回复分支同步切换。
- 新增分支可见性工具 `src/ai/aiBranching.ts`，覆盖嵌套分支、缺失根消息、循环引用和继续发送继承当前分支。
- 修复分页加载隐藏分支泄漏风险：消息列表会补加载分支根消息后再做递归过滤。
- 修复深度记忆串分支风险：动态历史、稳定记忆、伴随摘要、自动记忆候选、摘要合并均按当前分支范围过滤。
- 保留完整历史版本和原始分支数据，避免用户编辑后丢失旧内容。
- 验证：`npm.cmd test` 301 通过；`npm.cmd run typecheck` 通过；`git diff --check` 通过。
- 未验证：当前无 Android 设备连接，未做真机 UI 验收。

### 涉及文件

- `src/ai/aiBranching.ts`：新增分支可见性、当前分支继承工具。
- `src/screens/AiChatScreen.tsx`：聊天页按当前消息版本过滤可见消息，发送新消息时继承当前分支。
- `src/ai/aiChatService.ts`：编辑原消息、重新生成、流式生成、prompt 构建、分页加载根消息改为分支安全逻辑。
- `src/database/repositories/aiThreadRepository.ts`：新增分支字段读写、分支路径查询、可见消息过滤、记忆 / 摘要来源过滤。
- `src/database/schema.ts`：为 `ai_messages` 增加分支字段和索引。
- `src/database/db.ts`：同步数据库版本 / migration。
- `src/ai/aiMemoryService.ts`：稳定记忆、伴随摘要、动态记忆查询支持当前分支范围。
- `src/ai/aiMemoryCaptureService.ts`：自动记忆捕获和候选记忆按当前分支过滤。
- `src/ai/aiMemoryMaintenanceQueue.ts`：后台记忆维护任务携带当前分支范围。
- `src/ai/aiMemoryProfileService.ts`：用户画像维护读取当前分支范围内的消息。
- `src/ai/aiMemorySummaryService.ts`：摘要压缩和摘要合并按当前分支范围处理。
- `src/components/ai/AiThinkingBlock.tsx`：思考过程折叠 / 展开显示修复，避免内容被固定高度裁切。
- `App.tsx`：聊天相关后台 / 生命周期维护入口跟随当前修复链路调整。
- `tests/ai-branching-logic.test.cjs`：新增分支逻辑可执行测试。
- `tests/ai-chat-fixes-policy.test.cjs`：补充分支、编辑、重生成、记忆隔离策略测试。
- `tests/ai-final-acceptance-policy.test.cjs`、`tests/ai-navigation-policy.test.cjs`、`tests/ai-schema-policy.test.cjs` 等策略测试：同步本轮行为约束和版本断言。

## 2026-05-25 返回栈修复

- 修复连续新建 / 打开不同 AI 会话后，Android 返回需要一层层退回旧聊天的问题。
- 新增 `openAiChatRoute`：当前在聊天页时，新建聊天或打开另一个线程会替换当前聊天 route；当前在历史页且上一层是聊天页时，会折叠历史页并替换上一层聊天 route。
- 保留从 AI 工作台、IP 选择、知识库选择等非聊天入口进入聊天时的正常导航语义。
- 涉及文件：`App.tsx`、`tests/ai-navigation-policy.test.cjs`、`report/ai-chat-change-log.md`。
- 验证：`npm.cmd test -- tests/ai-navigation-policy.test.cjs` 通过；`npm.cmd run typecheck` 通过；`git diff --check` 通过。

## 2026-05-25 聊天页右上角精简

- 移除聊天页右上角“新聊天”按钮，右上角只保留“会话设置”。
- 新建会话入口统一保留在左侧综合记录抽屉中，避免同一功能在聊天页顶部重复出现。
- 保留综合记录抽屉内的新聊天逻辑和生成中停止确认逻辑。
- 涉及文件：`src/screens/AiChatScreen.tsx`、`tests/ai-navigation-policy.test.cjs`、`report/ai-chat-change-log.md`。
- 验证：`npm.cmd test -- tests/ai-navigation-policy.test.cjs` 通过；`npm.cmd run typecheck` 通过；`git diff --check` 通过。

## 2026-05-25 角色页头像区域压缩

- 角色编辑页不再默认选中第一个 IP，初始只显示 IP 选择 chip，不展开图片网格。
- 用户选择某个 IP 后，才展开该 IP 的候选头像图片；如果该 IP 没有图片，再显示空提示。
- 压缩角色内容输入框高度、头像卡片内边距、头像预览和候选图尺寸，减少首屏占用。
- 涉及文件：`src/screens/AiRoleCardEditorScreen.tsx`、`tests/ai-role-card-import-policy.test.cjs`、`report/ai-chat-change-log.md`。
- 验证：`npm.cmd test -- tests/ai-role-card-import-policy.test.cjs` 通过；`npm.cmd run typecheck` 通过；`git diff --check` 通过。

## 2026-05-25 分支记忆泄露审计修复

- 修复旧分支读取 AI 上下文时可能拿到 `ai_messages.content` 最新内容的问题：带 `branchScopes` 的仓库消息查询会把当前分支 root 消息物化为对应 `ai_message_versions` 内容。
- 新增历史版本 FTS 表 `ai_message_version_fts` 和 V32 migration，深层记忆检索可以命中旧版本内容，同时返回结果仍按当前分支版本物化，避免新分支内容穿回旧分支。
- “停止当前回复并新建聊天”改为先进入新聊天，再后台停止旧生成，不再等待停流数据库更新和消息重载。
- `messageMatchesSelectedBranchPath` 改为迭代链路校验，避免极深嵌套分支触发递归栈压力。
- 涉及文件：`src/database/schema.ts`、`src/database/db.ts`、`src/database/repositories/aiThreadRepository.ts`、`src/screens/AiChatScreen.tsx`、`src/ai/aiBranching.ts`、`tests/ai-chat-fixes-policy.test.cjs`、`tests/ai-branching-logic.test.cjs`。
- 验证：`node --test tests/ai-branching-logic.test.cjs tests/ai-chat-fixes-policy.test.cjs` 通过；`pnpm test` 305 通过；`pnpm typecheck` 通过；`git diff --check` 通过（仅有既有 CRLF 提示）。

## 2026-05-25 综合记录抽屉最近项操作

- 左侧综合记录抽屉的“最近”列表支持长按会话项，在当前项下方显示轻量操作浮层。
- 操作浮层提供“重命名”和“删除”；重命名使用轻量输入弹窗，删除使用确认弹窗，成功后刷新最近列表。
- 复用已有 `renameAiThread` 和 `deleteAiThreads` 服务，不新增数据结构。
- 涉及文件：`src/components/ai/AiComprehensiveRecordDrawer.tsx`、`src/screens/AiChatScreen.tsx`、`tests/ai-navigation-policy.test.cjs`。
- 验证：`node --test tests/ai-navigation-policy.test.cjs` 通过；`pnpm typecheck` 通过。

## 2026-05-25 聊天输入框边框增强

- 聊天页底部输入框边框由极细发丝线调整为更清晰的浅色 1px 边框，提升输入区和背景的分隔感。
- 涉及文件：`src/components/ai/AiChatComposer.tsx`、`tests/ai-navigation-policy.test.cjs`。
- 验证：`node --test tests/ai-navigation-policy.test.cjs` 通过。

## 2026-05-25 综合记录抽屉当前会话同步

- 抽屉最近项重命名命中当前会话时，同步刷新聊天页顶部标题，避免抽屉和聊天页标题不一致。
- 抽屉最近项删除命中当前会话时，删除完成后立即切到新聊天，避免当前页面继续挂在已删除 thread 上。
- 涉及文件：`src/screens/AiChatScreen.tsx`、`tests/ai-navigation-policy.test.cjs`。
- 验证：`node --test tests/ai-navigation-policy.test.cjs` 通过。
