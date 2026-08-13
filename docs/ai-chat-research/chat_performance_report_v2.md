# Pixory AI 聊天功能全面性能优化报告 v2

> [!CAUTION]
> **审阅状态：已完成第一轮源码核对，不可直接按本报告实施。** 报告中的若干建议与现有 Android 稳定性修复或产品约束冲突，且“60%+”“5–10x”等收益尚无基准数据支持。请先阅读 [P0/P1 核对表](./chat_performance_report_v2_triage.md) 与 [性能优化设计说明](../superpowers/specs/2026-08-11-ai-chat-performance-optimization-design.md)。
>
> 标记规则：`已验证` 可进入安全优化波次；`部分成立` 需缩小问题描述；`约束冲突` 不得照抄原建议；`待 Android 基准` 仅在复现并达到门槛后实施。P2/P3 当前仅作为路线图候选。
>
> **第二轮全量复审（2026-08-13）：** 已再次对照本报告、核对表、设计与实施计划检查保留代码。复审修正了 embedding 部分补全误删既有向量、批量替换重复逻辑键语义漂移和完整差异行尾检查遗漏；高风险 Android 项仍保持阻塞。实际状态与证据继续以核对表为准。

> 分析时间：2026-08-11 | 覆盖源码总量：~1.2MB | 分析文件：60+ 个
> 涵盖：主聊天屏、所有 AI 组件、导航层、数据库 Schema、Repository 层、AI 服务管线、Provider 客户端、记忆系统

---

## 问题总览

| 等级 | 数量 | 主要分布 |
|------|------|---------|
| 🔴 HIGH | 18 | 渲染、DB 查询、AI 管线、导航架构 |
| 🟡 MEDIUM | 21 | 组件、动画、网络、内存、辅助界面 |
| 🔵 LOW | 9 | 样式分配、边缘逻辑、小优化点 |

---

## 第一部分：闪烁 / 瞬闪（用户直接可见）

### 🔴 HIGH-F1 — `AiMeasuredStreamBlock` 双重测量造成流式布局闪动

**文件**：`src/components/ai/AiMeasuredStreamBlock.tsx`（第 111–125 行）

同时存在 `onLayout` 回调 **和** `useEffect` 内的 `requestAnimationFrame` + `.measure()` 调用，对同一个 View 进行两种测量方式。两者竞争上报高度，触发双重 state 更新，在 AI 生成期间每个 token 都可能产生布局闪动和高度跳变。

**根因**：`.measure()` 是异步桥接调用，`onLayout` 是原生同步回调，两者时序不一致导致连续抖动。

**修复方向**：删除 `useEffect` 中的 `requestAnimationFrame + .measure()` 块，仅保留 `onLayout` 上报高度。

---

### 🔴 HIGH-F2 — `AiThinkingBlock` 收起时布局瞬跳

**文件**：`src/components/ai/AiThinkingBlock.tsx`（第 60、83–90 行）

`bodyVisible` 变为 `false` 时立即从树中卸载内部 `<Text>`，高度瞬间归零，但 `expandedProgress` 的 180ms 渐隐动画还在继续——用户看到的是"内容先消失，再慢慢收起"，而非平滑折叠。

**修复方向**：不要条件卸载内容，改用 Reanimated 同步动画 `height` 从实际高度到 0、`opacity` 从 1 到 0，动画完成后再卸载。

---

### 🟡 MEDIUM-F3 — 导航跳转无过渡动画（白屏/黑屏闪）

**文件**：`App.tsx`（第 1898–2206 行）

使用自定义 `routeStack` 数组实现路由，激活屏幕通过条件赋值绝对覆盖渲染。每次跳转均为即时替换，无任何过渡动画，导致导航时出现明显的白屏/黑屏闪烁，也无原生手势支持（左滑返回）。

**修复方向**：迁移到 `@react-navigation/native-stack` 或 Expo Router，获得原生 slide 动画与手势支持。

---

### 🟡 MEDIUM-F4 — `AiChatComposer` 输入框高度两次 layout 造成跳动

**文件**：`src/components/ai/AiChatComposer.tsx`（第 216–228 行）

用隐藏的绝对定位 `<Text>` 镜像 `TextInput` 的值来测量高度。每次击键流程：JS 更新 state → 渲染隐藏 Text → 等待原生 layout → `onLayout` 回调 → 更新 `inputHeight` state → 再次渲染 Composer。**每个字符触发双重渲染 + 双次 layout 计算**，在键盘弹起时可见跳动。

**修复方向**：删除 `inputMeasurer` 隐藏 Text，改用 `TextInput` 原生的 `onContentSizeChange` 事件一次性获取高度。

---

### 🟡 MEDIUM-F5 — `AiHomeScreen` 嵌套纵向 ScrollView 滚动抖动

**文件**：`src/screens/AiHomeScreen.tsx`（第 128、199 行）

父层有纵向 `ScrollView`，内部嵌套另一个纵向 `ScrollView`（`nestedScrollEnabled`）。React Native 嵌套同向 ScrollView 存在手势抢占冲突，导致滚动抖动，且无法启用视口裁剪优化。

**修复方向**：重构为单一 `FlatList`，`ListHeaderComponent` 承载 header 区域。

---

### 🔵 LOW-F6 — `AiChatComposer` 附件图片无占位符（空白闪）

**文件**：`src/components/ai/AiChatComposer.tsx`

Composer 的附件预览使用原生 `Image` 组件，无占位符也无解码缓存（如 `expo-image`）。本地缩略图加载期间产生空白闪。

**修复方向**：将附件 `Image` 替换为 `expo-image`，并设置 `placeholder` 颜色或 blurhash。

---

## 第二部分：渲染性能（Re-renders / 计算）

### 🔴 HIGH-R1 — `AiMessageContent` 完全未记忆化 + 渲染中执行重量级正则

**文件**：`src/components/ai/AiMessageContent.tsx`（第 604、757–797 行）

- `AiMessageContent` 未使用 `React.memo`，父组件 `AiMessageBubble` 任何 re-render 都会触发它完整执行
- 渲染体直接调用 `shouldRenderWholeRichHtml(content)` —— 内含 6 个正则测试
- `renderInlineText()` 在渲染路径中对整段内容执行 `INLINE_TOKEN_PATTERN` 的 `while` 循环正则
- 对 15K+ 字符的消息，这会完全阻塞 JS 线程

**修复方向**：用 `React.memo` 包裹；将 `shouldRenderWholeRichHtml` 结果放入 `useMemo(content)` 缓存。

---

### 🔴 HIGH-R2 — 流式状态耦合顶层 `AiChatScreen`，每个 token 触发全量 O(N) 重算

**文件**：`src/screens/AiChatScreen.tsx`

`forceUpdateTailState()` (`useReducer` dispatch) 在每个流式 chunk 到达时触发整个 `AiChatScreen` re-render，继而重算 `nextVisibleMessages` 和 `invertedMessageItems`（数组 slice + map，O(N)）。

**修复方向**：将流式状态迁移到 `useSyncExternalStore` 或 Zustand slice，子气泡直接订阅，父组件不 re-render。

---

### 🔴 HIGH-R3 — `AiStreamingTailContinuationBubble` / `AiStreamingTailMessageSegment` 无 `React.memo`

**文件**：`src/components/ai/AiStreamingTailContinuationBubble.tsx`、`AiStreamingTailMessageSegment.tsx`

两个流式气泡组件均未使用 `React.memo()`，随顶层每个 chunk 触发的 re-render 全量重渲染，CPU 在生成最繁忙时负担最重。

**修复方向**：加 `React.memo` + 自定义 `areEqual` 函数。

---

### 🔴 HIGH-R4 — `renderMessageItem` 每次重建，FlatList item 全量重渲染

**文件**：`src/screens/AiChatScreen.tsx`

`renderMessageItem` 依赖数组中包含未用 `useCallback` 包裹的函数（`handleRegenerate`、`handleContinueAssistantMessage` 等），这些函数每次渲染时重建，导致 `renderMessageItem` 随之重建，进而触发 FlatList 所有 item 重渲染。

**修复方向**：所有消息操作函数加 `useCallback`，配合 stable ref（useEvent 模式）打破循环依赖。

---

### 🔴 HIGH-R5 — `AiMathBlock` KaTeX 编译在渲染体中执行

**文件**：`src/components/ai/AiMathBlock.tsx`（第 38–117 行）

`katex.renderToString` 和完整 HTML 模板拼接直接在渲染体中执行。当 WebView 发回 `onMessage` 调整容器高度触发 `setHeight(h)` 时，组件重渲染，KaTeX AST 从头完整重新编译。

**修复方向**：将 KaTeX 编译和 HTML 组装放入 `useMemo([math])` 缓存。

---

### 🟡 MEDIUM-R6 — `AiChatComposer` 未使用 `React.memo`

**文件**：`src/components/ai/AiChatComposer.tsx`

Composer 接收数组 `attachments` 和多个回调 props，但未使用 `React.memo`。`AiChatScreen` 任何状态变化（流式 tick 泄漏到组件、UI toggle）均触发 Composer 完整重渲染。

**修复方向**：加 `React.memo`，对数组 props 使用 `useMemo` 稳定引用。

---

### 🟡 MEDIUM-R7 — `AiMessageBubble` stale closure 导致操作 bug

**文件**：`src/screens/AiChatScreen.tsx`

`areAiMessageBubblePropsEqual` 故意忽略函数 props 避免重渲染，但导致 `handleRegenerate`、`handleContinueAssistantMessage` 等函数捕获挂载时的旧状态快照。用户点击旧气泡上的操作按钮，行为可能错误。

**修复方向**：用 `useRef` 存储最新操作函数，稳定 ref 传递给 bubble，`areEqual` 忽略函数 props 不产生 stale closure。

---

### 🟡 MEDIUM-R8 — `AiSessionConfigScreen` 35+ 个 `useState` + Set 在渲染循环重建

**文件**：`src/screens/AiSessionConfigScreen.tsx`（第 140–241 行、第 1456–1491 行）

超过 35 个独立 `useState`，任何输入触发整个 1845 行组件树重渲染。`isProtectedSessionModelOption` 在 options `.map()` 每次迭代创建 `new Set(builtInModelsForProvider(...))`。

**修复方向**：将 draft 字段合并为 `useReducer`；`new Set(...)` 提升到 `useMemo`。

---

### 🟡 MEDIUM-R9 — `AiProviderSettingsScreen` Set 在渲染循环重建 + 派生值无 `useMemo`

**文件**：`src/screens/AiProviderSettingsScreen.tsx`（第 75–78、795、868 行）

`isProtectedProviderModel` 在模型列表 `.map()` 内每次迭代执行 `new Set(...)`；`selectedCard`、`chatModels`、`embeddingModels` 等派生值未使用 `useMemo`。

---

### 🔵 LOW-R10 — `AiMessageBubble` 渲染体内联 `.filter()` 分配

**文件**：`src/components/ai/AiMessageBubble.tsx`（第 411 行）

`message.attachments.filter((a) => a.kind === 'image')` 在 JSX 渲染体执行，每次渲染分配新数组，长列表中持续触发 GC。

**修复方向**：放入 `useMemo([message.attachments])`。

---

## 第三部分：导航与屏幕跳转

### 🔴 HIGH-N1 — 自定义路由无导航动画，整个 App 根组件随导航重渲染

**文件**：`App.tsx`（第 471 行、第 1898–2206 行）

1. `routeStack`、`globalSearchQuery`、`personalSessionState` 等全局状态持有在根组件，任何导航动作触发包括 `BottomTabBar` 和 `StrictPager` 的整个根组件 re-render。
2. 路由实现为自定义 `routeStack` 数组，激活屏幕即时替换，无 slide 动画，无手势支持，导航每次产生白屏闪。

**修复方向**：迁移到 `@react-navigation/native-stack`；将全局 UI 状态下推到 Zustand 或 Context，解除根组件导航依赖。

---

### 🟡 MEDIUM-N2 — `KeyboardAvoidingView` 与 `react-native-keyboard-controller` 混用

**文件**：`src/components/AppScreen.tsx`（第 73–77 行）

`App.tsx` 已包裹 `<KeyboardProvider>`（`react-native-keyboard-controller`），但 `AppScreen.tsx` 仍使用 RN 内置 `<KeyboardAvoidingView behavior="padding">`。两套键盘处理系统并存，动画时序不匹配，导致键盘弹出/收起时布局跳动。

**修复方向**：移除 `KeyboardAvoidingView`，改用 `react-native-keyboard-controller` 的 `useKeyboardHandler` hook 或 `KeyboardAwareScrollView`，动画与原生键盘帧同步。

---

### 🟡 MEDIUM-N3 — `LoadingTransition` 动画未使用 Native Driver

**文件**：`src/components/LoadingTransition.tsx`（第 18–29 行）

Loading dots 使用 `Animated.timing` 循环并 `useNativeDriver: false`，同时插值背景色和 transform scale，连续桥接 JS ↔ UI 线程，在屏幕挂载繁忙时加剧 JS 线程饥饿。

**修复方向**：迁移到 Reanimated，在 UI 线程完整运行；或将 transform 提到 `useNativeDriver: true`，颜色通过原生样式实现。

---

### 🟡 MEDIUM-N4 — `aiHomeRefreshToken` 强制回首页数据重刷

**文件**：`App.tsx`（第 538–545 行）

栈深度回到 1 时自增 `aiHomeRefreshToken`，每次退出聊天都强制 `AiHomeScreen` 重新拉取数据，可能产生 layout 抖动或 home 页视觉跳变。

**修复方向**：使用 SQLite 数据监听器或 TanStack Query 的 `invalidateQueries` 按需刷新，而非强制 re-render token。

---

## 第四部分：数据库查询

### 🔴 HIGH-D1 — `aiGenerationRepository` 对 `generationId` 无索引，全表扫描（流式生成热路径）

**文件**：`src/ai/generation/aiGenerationRepository.ts`

```sql
SELECT * FROM ai_generation_jobs WHERE generationId = ?
```
`ai_generation_jobs` 表的主键是 `id = 'aigjob_${generationId}'`，但查询使用 `generationId` 字段（无独立索引），导致全表扫描。**此查询在流式生成时持续执行**，是最严重的热路径查询问题。

**修复方向**：改为 `WHERE id = 'aigjob_' || ?` 利用主键；或在 `generationId` 列添加 `CREATE UNIQUE INDEX`。

---

### 🔴 HIGH-D2 — `aiKnowledgeRepository.deleteDocument` N+1 逐行删除

**文件**：`src/database/repositories/aiKnowledgeRepository.ts`

文档有 1000 个 chunk 时，循环内逐行执行：
```ts
for (const chunkId of chunkIds) {
  DELETE FROM ai_embeddings WHERE chunkId = ?
  DELETE FROM ai_message_citations WHERE sourceId = ?
}
```
→ **2000 次独立 SQLite 查询**。`replaceEmbeddings` 同样逐行 INSERT。

**修复方向**：改用 `WHERE chunkId IN (SELECT id FROM ai_chunks WHERE documentId = ?)` 批量删除；INSERT 使用多行 VALUES 或分批事务。

---

### 🔴 HIGH-D3 — `aiRoleCardRepository.listActive` 跨全表聚合

**文件**：`src/database/repositories/aiRoleCardRepository.ts`

列出角色卡时，子查询 JOIN `ai_threads` + `ai_messages`（过滤 `role <> 'system'`）并 GROUP BY 计算 `lastChatAt`。消息量达到 100,000 条时，每次列出角色卡都要聚合扫描整张消息表。

**修复方向**：在 `ai_threads` 上维护 `lastChatAt` 字段（消息写入时同步更新），消除聚合子查询；或对 `(roleCardId, role, createdAt)` 建覆盖索引。

---

### 🔴 HIGH-D4 — `aiKnowledgeRepository.replaceEmbeddings` + `markInterruptedGenerationJobs` N+1

**文件**：`src/database/repositories/aiKnowledgeRepository.ts`、`src/ai/generation/aiGenerationRepository.ts`

`replaceEmbeddings` 对每条 embedding 逐一 DELETE + INSERT；`markInterruptedGenerationJobs` 在 `for...of` 内逐条 UPDATE + INSERT 事件。

**修复方向**：改为批量 INSERT/UPDATE with 事务包裹，减少事务开销至 O(1) 次提交。

---

### 🟡 MEDIUM-D5 — `ai_chunks` 关键词检索无 FTS5

**文件**：`src/ai/aiRetrievalService.ts`（第 163–180 行）

```sql
SELECT ... FROM ai_chunks WHERE normalizedText LIKE ?
```
`ai_memory_fts` 已有 FTS5，但 `ai_chunks` 没有，每次知识库关键词检索全表扫描。

**修复方向**：为 `ai_chunks.normalizedText` 创建 FTS5 虚拟表。

---

### 🟡 MEDIUM-D6 — `ai_threads` 缺少 `(providerId, modelId)` 联合索引

**文件**：`src/database/repositories/aiProviderRepository.ts`

`deleteProviderModelAndCleanup` 执行：
```sql
UPDATE ai_threads SET providerId = CASE ... WHERE providerId = ? AND modelId = ?
```
若 `ai_threads` 上无 `(providerId, modelId)` 索引，全表扫描。

---

### 🟡 MEDIUM-D7 — `aiChatService.moveAiThreadSpace` 循环内串行查询

**文件**：`src/ai/aiChatService.ts`（约第 3130–3310 行）

对每个 threadId 循环调用：
```ts
await exportThread(db, threadId)
await findAnyById(db, roleCardId)
await importThread(db, snapshot, targetSpace)
```
M 个线程 × 多次 DB 往返 = O(M×N) 串行 SQLite 调用。

---

### 🟡 MEDIUM-D8 — `loadBranchRootMessages` 循环内迭代 DB 查询

**文件**：`src/ai/aiChatService.ts`

`while (pendingRootIds.length > 0)` 内逐一 fetch 分支根消息，深度嵌套对话分支导致 N 次串行 SQLite 查询才能构建树结构。

---

### 🟡 MEDIUM-D9 — `listThreadMessagesInDatabase` 强制串行多次批量查询

**文件**：`src/ai/aiChatService.ts`

因 `expo-sqlite` prepared statement 并发崩溃问题，attachments、citations、version totals 等批量查询全部串行执行（无 `Promise.all`）。大线程首次加载需等待 4–5 次串行批量查询，产生明显等待感。

**修复方向**：将相互独立的查询合并为单次 JOIN；或缓存消息页查询结果（首屏消息变化不频繁）。

---

### 🔵 LOW-D10 — `aiRoleCardRepository.deleteUnreferencedRoleCardsAfterThreadMove` N+1 删除记忆

**文件**：`src/database/repositories/aiRoleCardRepository.ts`

对 `ai_memories`、`ai_memory_fts` 逐行删除，同 D2 模式。

---

## 第五部分：AI 管线与流式生成

### 🔴 HIGH-A1 — `estimatePromptTokens` 在 O(L log L) 二分搜索中同步执行 CJK 正则

**文件**：`src/ai/aiContextBudget.ts`（第 26、95–104 行）

`value.match(CJK_CHAR_PATTERN)` 为分配大型字符串数组的正则，在 `trimTextToTokenBudget` 的二分查找循环内反复调用，对 MB 级 context 文本造成 O(L log L) 同步阻塞，严重时导致 UI 完全冻结。

**修复方向**：改用 `replace + 空字符串计数` 避免数组分配；对 token 估算用字节/字符比率近似代替完整正则；或迁移到 JSI 原生模块。

---

### 🔴 HIGH-A2 — `generateMissingEmbeddingsForDocument` 完全串行，无批处理

**文件**：`src/ai/aiEmbeddingService.ts`（第 104–127 行）

对每个 chunk 逐一发起独立 API 请求，大型知识库文档需数百次串行网络往返。

**修复方向**：按 provider 批量化（`Promise.all` + 并发限制 5），或调用 batch embedding API。

---

### 🔴 HIGH-A3 — `aiStreamingBlockSplitter` 每次 patch 重新解析整段内容

**文件**：`src/ai/aiStreamingBlockSplitter.ts`（第 237–241 行）

`splitStreamingTextIntoBlocks` 对完整的 `content` 字符串执行全局正则 `/\n{2,}/g`，随流式内容增长，每个 patch 都重新扫描全部已处理文本，计算成本线性增长。

**修复方向**：只传入新 delta 给 splitter，维护有状态机跟踪 open block，缓存已确定的 block 边界。

---

### 🟡 MEDIUM-A4 — `mergeStreamingTailPatch` 每个 token 重建整个 block Map

**文件**：`src/ai/aiStreamingTailModel.ts`（第 271–292 行）

每次 SSE patch：
```ts
previousById = new Map(blocks.map(b => [b.id, b]))
// 再全量遍历所有 blocks 合并
```
高速 token 流时，每个 chunk 都分配新 Map，持续触发 GC，导致流式渲染抖动。

**修复方向**：对 append-only patch 只更新最后一个 open block，不全量重建 Map。

---

### 🟡 MEDIUM-A5 — `AbortController` 在用户离开时不终止生成

**文件**：`src/ai/aiGenerationManager.ts`（第 117–124、214–228 行）

`unsubscribe` 仅从 `subscribers` Set 移除监听，不调用 `AbortController.abort()`。用户离开聊天页后，生成任务继续消耗网络、内存和数据库资源。

**修复方向**：`subscribers.size === 0` 时自动调用 `stopGeneration()`（除非明确需要后台完成）。

---

### 🟡 MEDIUM-A6 — Gemini Provider 手动 JSON 边界解析

**文件**：`src/ai/providers/geminiProvider.ts`（第 63–100 行）

`emitCompletedGeminiChunks` 用 `for` 循环逐字符跟踪花括号深度来定位 JSON 边界，大 chunk 时阻塞 JS 线程且 CPU 密集。

**修复方向**：改用增量 JSON 解析库，或用 `indexOf('}')` + try/catch JSON.parse 更高效地定位边界。

---

### 🟡 MEDIUM-A7 — 嵌入向量 320 条 JSON 同步批量解析

**文件**：`src/ai/aiEmbeddingService.ts`（`tryEmbeddingRetrieval`，约第 215–220 行）

`.map()` 中同步 `JSON.parse` 解析最多 320 条高维浮点数组（1536 维），主线程同步阻塞。

**修复方向**：分批异步处理，或将向量解析移至 `InteractionManager.runAfterInteractions`。

---

### 🟡 MEDIUM-A8 — 嵌入生成失败无重试/退避

**文件**：`src/ai/aiEmbeddingService.ts`（第 124–127 行）

网络失败仅记录 `failed += 1` 跳过，瞬时网络问题永久跳过部分 chunk 向量化。

**修复方向**：指数退避重试最多 3 次，区分可重试（超时、限速）与不可重试（认证失败）错误。

---

### 🟡 MEDIUM-A9 — OpenAI Provider 流缓冲区每 chunk 全量 `split('\n')`

**文件**：`src/ai/providers/openAiCompatibleProvider.ts`（第 232–234 行）

`buffer.split('\n')` 在每个 chunk 到达时执行，大代码块无换行时对持续增长的 buffer 重复完整 split。

**修复方向**：追踪最后换行位置，仅对新增部分切分，剩余保留在 buffer 不重复处理。

---

### 🔵 LOW-A10 — `aiUsageAnalytics` 批量同步 JSON 解析

**文件**：`src/ai/aiUsageAnalytics.ts`（第 116–120 行）

`aggregateAiUsageObservations` 循环内对所有 observation 同步执行 `JSON.parse(promptSnapshotJson)`，长日期范围（数百条）在主线程形成可感知延迟。

---

## 第六部分：动画与交互响应

### 🔴 HIGH-An1 — `AiComprehensiveRecordDrawer` PanResponder 在 JS 线程驱动抽屉滑动

**文件**：`src/components/ai/AiComprehensiveRecordDrawer.tsx`（第 123–184 行）

`onPanResponderMove` 在 JS 线程同步调用 `drawerTranslateX.setValue()` 更新位置并同步更新遮罩透明度。生成繁忙或 JS 线程饥饿时，抽屉拖拽严重掉帧，触控与动画脱节。

**修复方向**：迁移到 `react-native-gesture-handler` + Reanimated `useAnimatedGestureHandler`，拖动全程在 UI 线程执行。

---

### 🟡 MEDIUM-An2 — `AiScrollToLatestButton` 混用两套动画引擎

**文件**：`src/components/ai/AiScrollToLatestButton.tsx`（第 60、62 行）

`opacity` 使用 RN 内置 `Animated.Value`，`phase`/`arrowBounce` 使用 Reanimated `useSharedValue`，同一 View 挂载两套动画引擎，破坏硬件加速同步，产生桥接流量。

**修复方向**：统一迁移至 Reanimated，opacity 改为 `useSharedValue + withTiming`。

---

### 🟡 MEDIUM-An3 — `AiChatScreen` JS 驱动动画未开启 Native Driver

**文件**：`src/screens/AiChatScreen.tsx`

- `resizeHandleOpacity` 的 `Animated.timing` 使用 `useNativeDriver: false`
- `petPan.x`（用于 `transform: [{ translateX }]`）使用 `useNativeDriver: false`

两者均应改为 `useNativeDriver: true`，opacity 和 transform 均支持原生驱动。

---

### 🟡 MEDIUM-An4 — `AiHistoryScreen` PanResponder 在 `.map()` 中逐 item 动态创建

**文件**：`src/screens/AiHistoryScreen.tsx`（第 201–228 行）

`getThreadSwipeHandlers(thread)` 在每次渲染时、在 `.map()` 内为每个 item 创建全新 `PanResponder` 实例，大量 GC 压力。

**修复方向**：提取为独立 `React.memo` 组件，PanResponder 挂在组件内部（挂载时创建一次）。

---

## 第七部分：内存管理

### 🟡 MEDIUM-M1 — `exportThread` 将全部会话历史一次性加载入内存

**文件**：`src/ai/aiChatService.ts`（约第 3131 行起）

`exportThread` 将整条对话的消息、引用、附件全量加载到 `exported = []`。超长对话在 RN 受限内存环境下可能导致 OOM。

**修复方向**：改为流式/分批导出（每批 50 条），或分批写入导出文件。

---

### 🟡 MEDIUM-M2 — `aiStreamingMessageStore` 持有 streaming 状态引用未清理

**文件**：`src/ai/aiStreamingMessageStore.ts`

streaming 完成后，若 store 仍持有消息内容大对象引用（包括 thinking block 全文），长期留在内存中不释放。

**修复方向**：streaming 完成或页面销毁时显式清空 store 内容（保留 metadata，释放 text content）。

---

### 🔵 LOW-M3 — Voice gesture state 无卸载清理

**文件**：`src/components/ai/AiChatComposer.tsx`

语音录制手势使用 `voiceStartYRef`、`voiceLongPressRef` 等原始 ref，组件中途卸载（线程关闭、app 后台）时无清理机制，全局音频录制状态可能悬挂。

---

### 🔵 LOW-M4 — 嵌入可用性缓存非 LRU + 无主动失效

**文件**：`src/ai/aiRetrievalService.ts`（第 78–122 行）

`ownerEmbeddingAvailabilityCache` 超 160 项淘汰最早插入（非 LRU），且仅 5 分钟 TTL 失效，不在嵌入生成/删除后主动清除，导致用户刚生成嵌入后短时间读到"不可用"缓存。

---

## 第八部分：辅助界面汇总

| 文件 | 问题 | 严重度 |
|------|------|-------|
| `AiHistoryScreen.tsx` | 列表未虚拟化（全量 `.map()` + ScrollView） | 🔴 HIGH |
| `AiHistoryScreen.tsx` | 搜索无分页，拉全量历史 | 🟡 MEDIUM |
| `AiChatSearchScreen.tsx` | `renderItem` 内编译 RegExp | 🟡 MEDIUM |
| `AiBranchTreeScreen.tsx` | 回调 props 未 `useCallback` | 🟡 MEDIUM |
| `AiMemoryBoardScreen.tsx` | 未虚拟化（120 条 + ScrollView） | 🟡 MEDIUM |
| `AiMemoryBoardScreen.tsx` | 搜索过滤未防抖（逐键触发 `toLocaleLowerCase` × 120） | 🟡 MEDIUM |
| `AiMaterialListScreen.tsx` | 无分页 + 未虚拟化 | 🟡 MEDIUM |

---

## 第九部分：已发现的良好实践（无需更改）

- ✅ `aiThreadMessagePrefetch.ts` — 轻量 fire-and-forget 预取，零内存泄漏
- ✅ `aiThreadRouteSnapshotService.ts` — 避免 `Promise.all` 防止 SQLite 语句冲突
- ✅ `AiChatSearchScreen.tsx` — FlatList 虚拟化 + 220ms 防抖 + 偏移分页
- ✅ `AiHomeScreen.tsx` — 模块级 `homeThreadCache`/`homeRoleCardCache` 快速挂载
- ✅ `AiHistoryScreen.tsx` — 搜索 300ms 防抖，进入前预取消息
- ✅ `aiMemoryMaintenanceQueue.ts` — 队列化后台维护，不阻塞主对话流
- ✅ `aiScrollToLatestPolicy.ts` — 独立策略模块，逻辑与渲染解耦
- ✅ `aiChatFastPath.ts` + `aiChatPerformanceMode.ts` — 已有性能模式概念

---

## 优先级行动矩阵

### P0 — 立即修复（用户强感知）

| # | 问题 | 文件 | 预期收益 |
|---|------|------|---------|
| 1 | 流式气泡 `React.memo` + 流式状态解耦 | `AiChatScreen.tsx` 等 | 流式帧率提升 60%+ |
| 2 | `AiMeasuredStreamBlock` 删除双重测量 | `AiMeasuredStreamBlock.tsx` | 消除流式布局闪动 |
| 3 | `AiMessageContent` + `React.memo` + `useMemo` 正则缓存 | `AiMessageContent.tsx` | 消除大消息 JS 线程阻塞 |
| 4 | `AiChatComposer` 改用 `onContentSizeChange` | `AiChatComposer.tsx` | 消除输入双重渲染跳动 |
| 5 | `aiGenerationRepository` 改用主键查询 | `aiGenerationRepository.ts` | 消除热路径全表扫描 |
| 6 | `estimatePromptTokens` 去正则化 | `aiContextBudget.ts` | 消除可能的 UI 冻结 |

### P1 — 重要（启动延迟 / 明显等待）

| # | 问题 | 文件 | 预期收益 |
|---|------|------|---------|
| 7 | 嵌入生成串行改并发批处理 | `aiEmbeddingService.ts` | 知识库向量化 5–10x 加速 |
| 8 | `AiMathBlock` KaTeX 编译放入 `useMemo` | `AiMathBlock.tsx` | 消除数学公式重渲染卡顿 |
| 9 | `aiKnowledgeRepository` N+1 删除改批量 | `aiKnowledgeRepository.ts` | 文档删除从 2000 次降到 2 次查询 |
| 10 | `aiStreamingBlockSplitter` 增量解析 | `aiStreamingBlockSplitter.ts` | 长回复流式 CPU 占用下降 |
| 11 | `AiComprehensiveRecordDrawer` 迁移到 Reanimated | `AiComprehensiveRecordDrawer.tsx` | 抽屉拖拽流畅无掉帧 |
| 12 | 所有 JS-driven 动画改 Native Driver | `AiChatScreen.tsx` | 消除动画阻塞主线程 |

### P2 — 重要（规模化后劣化）

| # | 问题 | 文件 |
|---|------|------|
| 13 | `aiRoleCardRepository.listActive` 去聚合 | `aiRoleCardRepository.ts` |
| 14 | `ai_chunks` 建 FTS5 | `schema.ts` / `aiRetrievalService.ts` |
| 15 | `AiHistoryScreen` 虚拟化 + PanResponder 提取 | `AiHistoryScreen.tsx` |
| 16 | `KeyboardAvoidingView` 统一迁移 `react-native-keyboard-controller` | `AppScreen.tsx` |
| 17 | `aiStreamingTailModel.mergeStreamingTailPatch` 去全量 Map 重建 | `aiStreamingTailModel.ts` |
| 18 | `AbortController` 在订阅为 0 时终止生成 | `aiGenerationManager.ts` |
| 19 | `moveAiThreadSpace` 批量化 | `aiChatService.ts` |
| 20 | 嵌入失败指数退避重试 | `aiEmbeddingService.ts` |

### P3 — 优化（长期健康）

| # | 问题 |
|---|------|
| 21 | 迁移到 `@react-navigation/native-stack`（长期规划） |
| 22 | 根组件全局状态迁移 Zustand |
| 23 | `aiHomeRefreshToken` 改为数据监听驱动 |
| 24 | `exportThread` 分批导出防 OOM |
| 25 | 嵌入缓存改 LRU + 主动失效 |
| 26 | OpenAI/Gemini provider 流缓冲区优化 |
| 27 | `AiScrollToLatestButton` 统一迁移 Reanimated |
| 28 | `AiMemoryBoardScreen` 搜索防抖 + 虚拟化 |
| 29 | `AiThinkingBlock` 折叠改动画延迟卸载 |
| 30 | 聊天页 FlatList 考虑迁移 FlashList |
