# Pixory AI 系统性能优化建议报告

> 审阅范围：`aiChatService.ts`、`aiMemoryService.ts`、`aiMemoryProfileService.ts`、`aiMemoryMaintenanceService.ts`、`aiMemorySummaryService.ts`、`aiContextBudget.ts`、`aiThreadRepository.ts`、`AiChatScreen.tsx`、`AiMessageBubble.tsx`、`schema.ts`
> 目标：长时间对话卡顿预防 & 记忆缺失修复
> 约束：只读分析，不修改文件

---

## 优先级总览

| # | 类型 | 影响 | 难度 | 描述摘要 |
|---|---|---|---|---|
| P1 | 数据库 | 🔴 高 | 低 | `incrementPendingMemoryTurn` 每次回复触发 read-then-write，无原子更新 |
| P2 | 数据库 | 🔴 高 | 中 | `ai_memories` 缺少 `normalizedContent` 索引，`findActiveMemoryByNormalizedContent` 全表扫描 |
| P3 | 数据库 | 🟠 中 | 低 | `touchMemories` 对同一列写两次 `createTimestamp()`，产生不一致时间戳 |
| P4 | 数据库 | 🟠 中 | 低 | `listMemoryBoardItems` 无 LIMIT，大量记忆时返回全量 |
| P5 | 记忆构建 | 🔴 高 | 中 | 每次回复前 `buildPromptForThread` 串行调用 `buildCompanionMemoryPrefix` + `buildStableMemoryPrefix` + `retrieveDynamicMemoryContext`，三次各自独立读 DB，且 `buildStableMemoryPrefix` 与 `retrieveDynamicMemoryContext` 都调用 `listActiveMemories(LIMIT 80)` |
| P6 | 记忆构建 | 🟠 中 | 低 | `loadDeepMemoryContext`（老路径）与 `retrieveDynamicMemoryContext` 并不互斥，两者都调用 `listActiveMemories(LIMIT 80)` + `touchMemories`，存在冗余读写 |
| P7 | 上下文预算 | 🟠 中 | 中 | `estimatePromptTokens` 用 `length / 3` 估算，中文字符实际 token 率约 1.5~2 字/token，低估约 50%；长会话可能携带超出模型 context window 的历史 |
| P8 | UI 渲染 | 🟠 中 | 中 | `AiMessageBubble` 未 `memo`，`applyStreamingMessagePatch` 触发整个 `setMessages` 导致列表所有气泡重渲染（每 80ms 一次） |
| P9 | UI 渲染 | 🟡 低 | 低 | `renderItem` 使用内联箭头函数 + Fragment，每次 `messages` 变更 FlatList 无法做 item 级 memo 比较 |
| P10 | 维护调度 | 🟡 低 | 低 | `scheduleDeepMemoryAfterReply` 与 `scheduleCompanionMemoryMaintenance` 并发 `void`，两者都可能触发 `updateDeepMemoryAfterReply`，无协调机制 |
| P11 | 记忆缺失 | 🟠 中 | 中 | `compressOldestThreadRounds` 阈值 50 轮固定，超长会话（>200 轮）未压缩区间可能导致摘要段已满（LIMIT 5）而不再触发新压缩，产生记忆盲区 |
| P12 | 记忆缺失 | 🟠 中 | 中 | `buildCompanionMemoryPrefix` 构建摘要注入时，`segments` 只读 `threadId`，跨会话迁移或 roleCard 切换后旧 segments 不会清理，可能注入过期段落 |

---

## 详细分析

---

### P1 🔴 `incrementPendingMemoryTurn` 非原子 read-then-write

**文件**：[aiMemoryService.ts](file:///D:/Project/Pixory/pixory/src/ai/aiMemoryService.ts#L126-L132)

**现象**：
```typescript
export async function incrementPendingMemoryTurn(db, threadId) {
  const current = await aiThreadRepository.getThreadMemoryJob(db, threadId); // 读
  await aiThreadRepository.updateThreadMemoryJob(db, {                        // 写
    threadId,
    pendingTurnCount: current.pendingTurnCount + 1,
  });
}
```

`getThreadMemoryJob` → `updateThreadMemoryJob` 是两次独立的 DB 操作，`updateThreadMemoryJob` 内部又再次调用 `getThreadMemoryJob`（read-merge-write 模式），实际完成了 **3 次 DB round-trip**：
1. `incrementPendingMemoryTurn` 读一次
2. `updateThreadMemoryJob` 内部再读一次
3. 写入一次

紧接着 `scheduleDeepMemoryAfterReply` 还会在同一个 `runWithDatabaseSpace` 块内再次调用 `getThreadMemoryJob`（第 689 行），形成 **4 次 DB IO**。

**风险**：低并发环境影响小，但在 SQLite WAL 模式下，多次短事务对写吞吐有影响；若未来支持并发流式写入，race condition 风险升级。

**建议**：用 `UPDATE ai_thread_memory_jobs SET pendingTurnCount = pendingTurnCount + 1 WHERE threadId = ?` 替换 read-modify-write，降低到 1 次 DB 操作，且原子性有保证。

---

### P2 🔴 `findActiveMemoryByNormalizedContent` 缺少复合索引

**文件**：[aiThreadRepository.ts](file:///D:/Project/Pixory/pixory/src/database/repositories/aiThreadRepository.ts#L1305-L1315) / [schema.ts](file:///D:/Project/Pixory/pixory/src/database/schema.ts)

**现象**：
```sql
SELECT * FROM ai_memories
WHERE space = ? AND scope = ? AND COALESCE(scopeId, '') = COALESCE(?, '')
  AND normalizedContent = ? AND status = 'active'
LIMIT 1
```

现有索引（schema.ts line 601）：
```sql
CREATE INDEX IF NOT EXISTS idx_ai_memories_scope_status
  ON ai_memories(space, scope, scopeId, status, importance);
```

此索引不包含 `normalizedContent`，导致去重检查（`updateDeepMemoryAfterReply` 中每个 candidate 都调一次）退化为索引范围扫描后全行比较。记忆量增大后（global scope 跨所有会话共享，容量无上限）成本线性增长。

**建议**：新增索引：
```sql
CREATE INDEX IF NOT EXISTS idx_ai_memories_normalized_content
  ON ai_memories(space, scope, COALESCE(scopeId, ''), normalizedContent, status);
```

---

### P3 🟠 `touchMemories` 双重 `createTimestamp()` 不一致

**文件**：[aiThreadRepository.ts](file:///D:/Project/Pixory/pixory/src/database/repositories/aiThreadRepository.ts#L1431-L1441)

**现象**：
```typescript
await db.runAsync(
  `UPDATE ai_memories SET lastUsedAt = ?, updatedAt = ? WHERE id IN (...)`,
  createTimestamp(),  // 第一次调用
  createTimestamp(),  // 第二次调用，可能不同毫秒
  ...memoryIds
);
```

两次 `createTimestamp()` 在极端情况下可能产生不同的时间戳（跨毫秒边界），`lastUsedAt > updatedAt` 的数据会影响按 `COALESCE(lastUsedAt, updatedAt) DESC` 排序的 `listActiveMemories`，可能让刚使用的记忆排到意外位置。

**建议**：提前计算一次 `const now = createTimestamp()`，使两列使用相同时间戳。

---

### P4 🟠 `listMemoryBoardItems` 无 LIMIT

**文件**：[aiThreadRepository.ts](file:///D:/Project/Pixory/pixory/src/database/repositories/aiThreadRepository.ts#L1396-L1401)

**现象**：
```sql
SELECT * FROM ai_memories
WHERE ... AND status = 'active'
ORDER BY scope ASC, importance DESC, createdAt ASC, id ASC
-- 无 LIMIT
```

`listMemoryBoardItems` 被 `buildStableMemoryPrefix`（Prompt 构建路径）调用，并在 JS 层截取前 24 条（`STABLE_MEMORY_LIMIT`）。数据库层不设限意味着即便有 500 条历史记忆，也会全量传输到 JS 层再切片。

**建议**：在 SQL 层加 `LIMIT 30`（或传参），避免大量行经由 expo-sqlite 桥传输到 JS 堆。

---

### P5 🔴 回复前三次独立 DB 读取 + 双重 `listActiveMemories`

**文件**：[aiChatService.ts L754-L801](file:///D:/Project/Pixory/pixory/src/ai/aiChatService.ts#L754-L801)

**现象**：
```typescript
async function buildPromptForThread(thread, userMessage) {
  const { companionMemoryPrefix, stableMemoryPrefix, dynamicMemoryContext } =
    await runWithDatabaseSpace(thread.space, async (db) => ({
      companionMemoryPrefix: await buildCompanionMemoryPrefix(db, thread),   // 读 getThreadMemorySettings + getUserProfile + listSummarySegments
      stableMemoryPrefix:    await buildStableMemoryPrefix(db, thread),      // 读 getThreadMemorySettings + getThreadSummary + listMemoryBoardItems
      dynamicMemoryContext:  await retrieveDynamicMemoryContext(db, thread), // 读 getThreadMemorySettings + listActiveMemories(80) + touchMemories
    }));
```

三个函数在同一个 `runWithDatabaseSpace` 块内并行执行，但内部各自：
- 各调一次 `getThreadMemorySettings`（三次重复读同一行）
- `buildStableMemoryPrefix` 调用 `listMemoryBoardItems`（间接读 `ai_memories`）
- `retrieveDynamicMemoryContext` 调用 `listActiveMemories(LIMIT 80)`（读 `ai_memories`）

两者都在读 `ai_memories` 表，但使用了不同的 SQL，各自独立扫描，在记忆量大时产生双倍 IO。

再加上 `loadDeepMemoryContext`（同路径，line 402）也调用 `listActiveMemories(LIMIT 80)`——实际上正常聊天路径只有 `retrieveDynamicMemoryContext`，而深度记忆路径会通过 `loadDeepMemoryContext` 再做一次；需确认两者是否在同一次回复中都被触发。

**建议**：
1. 在 `buildPromptForThread` 内部一次性读 `getThreadMemorySettings`，结果传给三个子函数，消除三次重复读。
2. 将 `listMemoryBoardItems` 与 `listActiveMemories` 的结果合并为一次查询，或共享同一个已排序列表，再在 JS 层按不同规则过滤。

---

### P6 🟠 `loadDeepMemoryContext` 与 `retrieveDynamicMemoryContext` 可能双重触发

**文件**：[aiChatService.ts L402-L446](file:///D:/Project/Pixory/pixory/src/ai/aiChatService.ts#L402-L446)

`loadDeepMemoryContext` 是老的深度记忆路径（读 `getThreadSummary` + `listActiveMemories(80)` + `touchMemories`），而 `retrieveDynamicMemoryContext`（通过 `buildStableMemoryPrefix`/`buildCompanionMemoryPrefix`）是新路径。

需确认两者在同一次 `buildPromptForThread` 调用中是否都激活——若同时开启深度记忆和普通记忆，会有 2 × `listActiveMemories(80)` + 2 × `touchMemories` 的写操作，每次回复均发生。

**建议**：梳理两条路径的激活条件，确保同一次回复只走其中一条，或显式合并结果。

---

### P7 🟠 token 估算低估导致长会话历史超限

**文件**：[aiContextBudget.ts](file:///D:/Project/Pixory/pixory/src/ai/aiContextBudget.ts)

**现象**：
```typescript
const DEFAULT_CONTEXT_BUDGET_TOKENS = 12000; // 保守 budget

export function estimatePromptTokens(value: string): number {
  return Math.ceil(value.length / 3); // 约 3 字节/token
}
```

中文文本的实际 tokenization 通常为 1~2 汉字/token（BPE），而代码按 3 字节估算，对纯中文内容低估约 50%。实际值：
- `"你好世界"` = 4字 = 4 token（GPT-4 tiktoken），估算 = 4×3=12字节 / 3 = 4 token（偶然正确）
- `"一段复杂的中文技术文档..."` 100汉字 ≈ 60~80 token，估算 = 300字节/3 = 100 token，**低估约 25%~40%**

当 `DEFAULT_CONTEXT_BUDGET_TOKENS = 12000` 时，实际可能发送了约 16,000~18,000 真实 token 的历史，在 Claude/GPT-3.5 等 16K context 模型上将触发 API 端的截断或 400 错误。

**建议**：提高中文估算系数（如 `length / 2.5`），或根据 `modelContextWindowTokens` 动态收紧，同时降低 `DEFAULT_CONTEXT_BUDGET_TOKENS` 至 8,000~10,000 做缓冲。

---

### P8 🟠 `AiMessageBubble` 未 `memo`，流式期间全列表重渲染

**文件**：[AiMessageBubble.tsx L49](file:///D:/Project/Pixory/pixory/src/components/ai/AiMessageBubble.tsx#L49)、[AiChatScreen.tsx L297-L320](file:///D:/Project/Pixory/pixory/src/screens/AiChatScreen.tsx#L297-L320)

**现象**：
- `AiMessageBubble` 用 `export function`，无 `React.memo`。
- 流式回复时 `applyStreamingMessagePatch` 每 80ms 调用一次 `setMessages(current => current.map(...))`，触发完整数组更新。
- FlatList 重新渲染时，`messages.map` 产生了新的引用，所有气泡（含历史消息）都会重渲染，即使 `props` 没有变化。

在 60 条消息（`CHAT_MESSAGE_PAGE_SIZE`）的会话中，每次 patch 会触发 60 次气泡渲染，即 80ms × 60 = 约 750 次/秒的组件渲染。在低端 Android 设备（≤ Snapdragon 665）上可能导致帧率下降。

**建议**：
1. 将 `AiMessageBubble` 用 `React.memo` 包裹，并为 `onCopy`、`onRegenerate`、`onSelectVersion` 等回调传入 `useCallback` 稳定引用（目前它们在 `renderItem` 内联，每次渲染都是新函数）。
2. 将 `renderItem` 提取为独立 `useCallback`，避免 FlatList 每帧重建渲染函数。

---

### P9 🟡 `renderItem` 内联 Fragment + 日期分隔判断

**文件**：[AiChatScreen.tsx L893-L920](file:///D:/Project/Pixory/pixory/src/screens/AiChatScreen.tsx#L893-L920)

**现象**：
```tsx
renderItem={({ item: message, index }) => (
  <>
    {shouldShowDateSeparator(visibleMessages, index) ? ...}
    <AiMessageBubble ... />
  </>
)}
```

`renderItem` 每次都是新的箭头函数（无 `useCallback`），导致 FlatList 的 `renderItem` 引用变更，触发所有可见 item 强制重渲染。`shouldShowDateSeparator` 也依赖 `visibleMessages` 整个数组，每次 messages 更新都会让每个 item 重新检查所有日期。

**建议**：将日期分隔信息预处理为 `visibleMessages` 中每个 item 的附加字段（`showDateSeparator: boolean`），避免在 `renderItem` 中遍历数组。将 `renderItem` 用 `useCallback` 稳定化。

---

### P10 🟡 `scheduleDeepMemoryAfterReply` 与 `scheduleCompanionMemoryMaintenance` 无协调

**文件**：[aiChatService.ts L1327-L1337](file:///D:/Project/Pixory/pixory/src/ai/aiChatService.ts#L1327-L1337)

**现象**：
```typescript
void scheduleCompanionMemoryMaintenance({ reason: 'reply_completed', ... });
void scheduleDeepMemoryAfterReply({ ... });
```

两者同时触发：
- `scheduleCompanionMemoryMaintenance` 会调用 `compressOldestThreadRounds` → `maybeUpdateUserProfile` 等，读大量消息。
- `scheduleDeepMemoryAfterReply` 在判断 `shouldRunConsolidation` 后，会调用 `updateDeepMemoryAfterReply` → `listMessages(LIMIT 80)` + `summarizeMemoryWithModel`。

两者竞争同一 thread 的 DB 写入（都会 `updateThreadMemoryJob`），且均为 `void` 调用，无等待/锁定关系。`activeMaintenanceTasks` 仅保护 `scheduleCompanionMemoryMaintenance` 的并发，不保护 `scheduleDeepMemoryAfterReply`。

在高频发送场景（快速连发多条消息）下，可能产生多个并发的 `updateDeepMemoryAfterReply` 写入，使 `pendingTurnCount` 计数紊乱，导致本该触发的记忆整合被跳过（**记忆缺失**）。

**建议**：将 `scheduleDeepMemoryAfterReply` 纳入 `activeMaintenanceTasks` 机制管理，或在 `scheduleCompanionMemoryMaintenance` 执行时检查 `deepMemory` 任务是否需要一并合并。

---

### P11 🟠 超长会话（>200 轮）压缩盲区导致记忆缺失

**文件**：[aiMemorySummaryService.ts L9-L11](file:///D:/Project/Pixory/pixory/src/ai/aiMemorySummaryService.ts#L9-L11)

**现象**：
```typescript
const UNCOMPRESSED_ROUND_THRESHOLD = 50;  // 触发阈值
const COMPRESS_OLDEST_ROUND_COUNT = 20;   // 每次压缩 20 轮
const SUMMARY_SEGMENT_LIMIT = 5;          // 最多 5 个段
const PRESERVE_LATEST_SEGMENT_COUNT = 2;  // 保留最新 2 个
```

压缩逻辑：每次压缩 20 轮，阈值 50 轮，最多 5 段。`maybeMergeSummarySegments` 在超过 5 段时合并最旧的（保留最新 2 段），合并后变为 3 段（2 保留 + 1 合并）。

问题点：
1. 如果维护模型不可用（remote_fallback），合并产生的是 `buildLocalMergedSummary`（本地轻量拼接），质量显著低于 AI 压缩摘要，多次轻量合并后信息严重失真。
2. 当会话达到 200 轮以上时，5 段 × 20 轮/段 = 仅覆盖 100 轮，剩余 100 轮始终是"未压缩"状态（在 `lastCompressedMessageId` 之后），在陪伴记忆注入时只注入 segments，不注入这部分原始历史，形成**记忆盲区**。

**建议**：
1. 增加对 `SUMMARY_SEGMENT_LIMIT` 的动态调整（或提高上限至 8-10），允许超长会话积累更多段。
2. 压缩前判断 local fallback 质量，连续两次 local fallback 时跳过合并，等待下次有远程模型可用时再合并。

---

### P12 🟠 会话迁移或 roleCard 切换后旧 segments 不清理

**文件**：[aiMemoryService.ts L206-L217](file:///D:/Project/Pixory/pixory/src/ai/aiMemoryService.ts#L206-L217)

**现象**：
```typescript
export async function buildCompanionMemoryPrefix(db, thread) {
  const [profile, segments] = await Promise.all([
    aiThreadRepository.getUserProfile(db, thread.space),
    aiThreadRepository.listSummarySegments(db, thread.id),  // 仅按 threadId 查
  ]);
  // 直接将所有 segments 注入 prompt
  return buildMainCompanionMemoryTemplate({ summarySegmentsText: ... });
}
```

`listSummarySegments` 只按 `threadId` 过滤，不区分 segment 的时间范围是否与当前会话角色设定对齐。若用户在 150 轮后切换了 roleCard（角色指令发生重大变化），旧的 50-100 轮摘要段仍会被注入，可能与新角色设定形成矛盾注入。

此外，`MoveAiThreadsBetweenSpaces` 迁移时（[aiChatService.ts L984](file:///D:/Project/Pixory/pixory/src/ai/aiChatService.ts#L984)），`importThread` 是否同步迁移 `ai_thread_summary_segments` 需要确认——若不迁移，迁移后的会话将丢失所有压缩历史（**记忆缺失**）。

**建议**：
1. 在 `buildCompanionMemoryPrefix` 中，对段落的 `startAt/endAt` 与当前 roleCard 的生效时间做比较，过滤掉 roleCard 切换前生成的摘要段，或在 roleCard 切换时打标记。
2. 确认 `exportThread` / `importThread` 是否包含 `ai_thread_summary_segments` 表的数据迁移。

---

## 修复优先级路线图

```
阶段 1（立即可做，改动小）
├─ P3: 修复 touchMemories 双 timestamp
├─ P4: listMemoryBoardItems 加 LIMIT
└─ P7: 调整 token 估算系数

阶段 2（1~2 周，核心性能）
├─ P1: incrementPendingMemoryTurn 原子 SQL UPDATE
├─ P2: 新增 normalizedContent 复合索引
├─ P8: AiMessageBubble memo + renderItem useCallback
└─ P9: 日期分隔预计算、renderItem 稳定化

阶段 3（2~4 周，架构改善）
├─ P5: buildPromptForThread 共享 settings + 合并 memory 读取
├─ P10: scheduleDeepMemoryAfterReply 纳入维护锁
└─ P11: 超长会话压缩段上限调整

阶段 4（需产品确认）
├─ P6: loadDeepMemoryContext 与 retrieveDynamicMemoryContext 路径统一
└─ P12: roleCard 切换后 segments 过滤策略 + moveThreads 迁移完整性
```

---

## 记忆缺失场景汇总

| 场景 | 根因 | 关联项 |
|---|---|---|
| 高频快速发送多条消息 | pendingTurnCount 计数竞争，整合被跳过 | P10 |
| 超长会话（>200 轮）未压缩区间 | SUMMARY_SEGMENT_LIMIT 固定为 5 | P11 |
| 连续远程模型失败后轻量合并失真 | local fallback 累积导致信息丢失 | P11 |
| roleCard 切换后旧摘要段仍注入 | segments 无时间范围过滤 | P12 |
| 会话迁移后压缩历史丢失 | importThread 可能未包含 segments | P12 |
| 去重检查慢导致 updateDeepMemoryAfterReply 阻塞 | 缺少 normalizedContent 索引 | P2 |

---

_报告生成时间：仅基于源代码静态分析，不含运行时 profiling 数据。建议在真机 > 100 轮对话下配合 Android Profiler 验证 P8 的实际帧率影响。_
