# 聊天采用分支与最新消息加载审计

> 日期：2026-08-09
> 本轮范围：先完成根因审计，随后以 adopted-route snapshot 实现并验证聊天分支、最近会话、搜索和路线树的一致投影。

## 1. 结论

没有发现进入聊天页时把路由中的 `threadId` 替换成“上一条退出线程”的直接证据。预取缓存也会同时校验 `space + threadId`，因此更可能出现的实际故障是：**进入了正确 thread，但首屏、最近会话列表和创作路线树分别使用了不同的 adopted branch 投影**，视觉上等同于“进错线程”或“没有加载最新消息”。

以下问题会共同造成该症状，必须在后续作为一次完整的数据投影修复处理，不能只增加一次 reload 或滚动到底部来掩盖。

## 2. 已确认问题

### P0：首屏预取绕过 adopted branch

- `src/ai/aiThreadMessagePrefetch.ts` 的预取只调用 `listThreadMessages(space, threadId, { limit })`，没有加载或携带 persisted branch scopes，也没有 selected-version map。
- `src/screens/AiChatScreen.tsx` 命中预取后直接渲染并提前返回；随后后台 reload 仍未传 branch scopes。
- 结果：从首页/历史点击进入时，首屏可显示所有分支混合后的最近行；日记和梦境时间线也会暂时按错误 route hash/锚点集合过滤。

### P0：空分支数组被错误退化成“所有分支”

- repository 的语义是：`branchScopes === undefined` 表示不限制分支，`branchScopes === []` 表示只显示 base route。
- `AiChatScreen.reloadMessages` 却把显式空数组转换成 `undefined`。
- 结果：没有采用任何分支、或当前采用路线确实是 base 时，会把 sibling/descendant 分支一起查询出来。

### P0：先分页再做正确分支投影会丢失真正最新消息

- `listMessagesBase` 在 SQL 中按 `createdAt DESC LIMIT ?` 取一页；当 branch scopes 缺失时，这个窗口覆盖整个 thread 的所有分支。
- 若未采用的较新 sibling 分支超过首屏窗口，adopted branch 的最新消息在查询阶段就已被挤出，之后任何客户端过滤或滚动都无法恢复它。
- 当前查询只以 `createdAt` 排序，没有统一使用 `rowid/id` 作为同时间戳稳定游标；`hasEarlierMessages` 又用注入 branch root 后的数组长度推断分页，也可能产生错误“还有历史”状态。

### P0：selected version 在首次 reload 时可能读取旧 ref

- 正常路径先 `setSelectedVersionByMessageId(...)`，随即调用 `reloadMessages(...)`。
- `reloadMessages` 读取的是由后续 effect 才同步的 `selectedVersionByMessageIdRef.current`。
- 结果：首次进入可能用旧/空 selection materialize 历史根消息，第二次 reload 才显示正确版本。

### P1：最近会话的排序时间和预览正文不是同一条消息

- `listHistoryItems` 的 `lastMessageAt` 是 thread 内所有消息的 `MAX(completedAt/updatedAt/createdAt)`，没有限定 adopted route、可见状态或角色。
- `ai_threads.lastMessagePreview` 主要在用户发送、编辑或重新生成入口写入用户正文；它不等于上述 MAX 对应消息。
- 结果：隐藏 sibling、failed/generating 或其他非采用路线活动可以让 thread 排到最前，但卡片正文仍是另一条较旧用户消息；用户进入后又看不到支撑这个时间的消息。

### P1：路线树只表达“发生过版本分叉的根”，不是完整当前路线

- candidate 查询从 `HAVING versionTotal > 1` 开始，并排除当前 `generating` 根；普通最新 tail 不是树节点。
- 当调用方传空 scopes 时，服务会为每个 root 独立选择最高 version，可能合成一组历史上从未共同 adopted 的 scopes。
- 结果：路线树可能不显示当前最新生成 tail，也可能高亮一条合成路线，不能可靠解释聊天页实际加载内容。

### P1：设置页搜索和路线树入口丢失当前 scopes

- `App.tsx` 从会话设置打开搜索和路线树时都显式传入 `[]`，没有携带当前 adopted branch。
- 结果：分支内消息可能无法搜索，路线树初始高亮也可能偏离当前会话。

### P1：采用分支写入不是一个事务

- `adoptBranchSelection` 先写 thread 当前分支，再单独 upsert route metadata。
- 第二步失败时，调用方会看到失败，但 thread 实际采用分支已改变，后续页面和路线树可能再次分歧。

## 3. 不建议采用的局部补丁

- 进入页面后固定延时再 reload。
- 无条件增加首屏 `limit`。
- 首屏先显示所有分支，再在 JS 中过滤。
- 仅把列表强制滚到 offset 0/底部。
- 只修首页预览文字，不统一排序消息的 route/status 口径。
- 在路线树缺节点时临时绘制一个没有持久身份的“最新”节点。

这些做法无法保证首屏数据存在，也不能让聊天页、搜索、最近会话、路线树和日记/梦境锚点共享同一路线身份。

## 4. 后续推荐实现边界

建立一个原子的 **adopted conversation route snapshot**，至少包含：

1. thread 基础记录；
2. adopted lineage/scopes 和 selection map；
3. route hash 与 lineageVersion；
4. 按该 route 在 SQL 层过滤后的稳定游标消息页；
5. 该页对应的 branch roots/version materialization；
6. latest visible terminal message 与 generation 状态。

然后统一使用：

- 首屏预取缓存完整 snapshot，key 至少为 `space/threadId/lineageVersion/routeHash`；
- branch mode 使用显式枚举（例如 `all | base | adopted`），不再依赖 `undefined/[]` 的隐式三态；
- 最近会话按 adopted route 的 latest visible terminal message 排序和显示，generation 状态作为独立字段；
- 路线树显示真实 adopted lineage 和当前 head/tail（含 generating 状态），不合成“每根最新版本”；
- 搜索、收藏、日记/梦境时间线复用同一 snapshot identity；
- 分支采用和 metadata 更新放在一个 SQLite 事务。

## 5. 必须通过的后续集成验收

1. 预取命中与未命中得到同一 adopted route、同一消息页。
2. base route、单层分支、嵌套分支、选择历史 version 均首次进入即正确，不依赖第二次 effect/reload。
3. 60 条以上未采用 sibling 消息不能挤掉 adopted route 最新消息。
4. 相同 `createdAt` 的多条消息稳定分页，无重复、遗漏或顺序漂移。
5. 最近会话的排序时间、预览正文和进入后可见 terminal message 指向同一事件。
6. 路线树、搜索、收藏、日记卡和梦境卡均只看到同一 adopted lineage。
7. generating/failed/stopped 的可见性规则明确，隐藏分支活动不能误排最近会话。
8. 分支采用任一步失败时事务整体回滚，不产生 thread 与 route metadata 分裂。

## 6. 实施结论（2026-08-09）

- 已新增 `AiAdoptedThreadRouteSnapshot`：在同一 SQLite 事务内读取线程、持久 adopted lineage、版本选择 map、route hash、route-scoped 消息页和准确的分页状态。预取结果还会在显示前按 `lineageVersion` 复核，路线已变则丢弃，冷加载重新读取。
- 聊天首屏、预取、分页/刷新和搜索定位均由该快照传递显式 scopes；`[]` 固定表示 base route，绝不再扩展成全分支查询。消息分页对同时间戳使用 `rowid` 作为稳定游标。
- 最近聊天逐线程投影其 adopted route 的最后一条 completed 非 system 消息，并用同一条消息的正文与时间排序；真实 SQLite 回归覆盖“2099 年的隐藏 sibling 不能抢占 adopted 预览”。
- 路线树在没有调用方显式路线时读取线程持久 adopted route，不再从各分支根的“最高版本”合成一条聊天不存在的路线；采用路线指针与 metadata 已同一事务写入。
- 设置页打开搜索/路线树不再伪造 `[]`，搜索会先解析持久 adopted route，并把实际 scopes 带回目标消息定位。

仍保留的产品边界：路线树继续只绘制真实版本分叉节点，并不把普通消息 tail 伪造成分叉节点；最近聊天只以完成消息排序，进行中/失败消息不会冒充一条可打开的“最新对话”。
