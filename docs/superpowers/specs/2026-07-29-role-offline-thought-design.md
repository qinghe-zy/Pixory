# Pixory 角色离线思绪 V1 设计规格

日期：2026-07-29
状态：已确认，待实现计划

## 1. 目标

角色离线思绪是 Pixory“角色内在生活”中的短文本产物。它借鉴 Ackem 的核心机制：从最近对话中的重要事件形成未说出口的角色念头，并在下一次合适的聊天中只注入一次。

Pixory 不原样复制 Ackem 的固定模板和桌面退出生命周期，而是保留其低成本事件门控与一次性投递思想，并做以下产品化调整：

- 思绪对用户可见，长期保留在“内心独白 → 独白”列表；
- 每个角色每天最多生成三条；
- 本地规则判断候选事件，模型按角色口吻统一写作；
- 同一会话结束后一次生成，不按每条事件分别调用模型；
- 没有重要事件时不生成通用兜底思绪；
- 下一次聊天每次最多注入一条，成功回复后才标记已投递；
- 不使用 Embedding，不自动进入长期记忆。

## 2. Ackem 参考边界

Ackem 的 `offline-thought.ts` 会读取最近五个 TurnTrace，识别 `vulnerable`、`praise`、`apology`、`hurtful/cold`，用固定模板生成一至两条思绪，并在下一次聊天中将所有未投递思绪注入后标记 delivered。没有重要事件时，它仍生成一条通用兜底文本。

Pixory V1 保留：

- 重要事件驱动；
- 一次生成少量短思绪；
- 未投递队列；
- 下一次聊天一次性注入；
- delivered 与 Artifact 存续分离。

Pixory V1 不复制：

- 固定中文模板正文；
- 无事件也生成兜底文本；
- 依赖桌面进程正常退出；
- 一次把全部待投递思绪塞入下一轮；
- 无分支、无物理空间隔离的全局状态。

## 3. 重要事件检测

### 3.1 运行时机

每个 completed/adopted 用户消息与其 completed/adopted 角色回复形成一个有效回合。角色回复完成后，本地检测器只处理该新增回合，不重扫完整历史。

检测器不读取 reasoning、thinking、system、工具结果、日记、梦境、旧思绪或隐藏上下文。未完成回复、未采用的重生成版本和 sibling 分支消息不参与。

### 3.2 V1 事件类型

| 事件 | 含义 | 初始优先级 |
| --- | --- | ---: |
| `vulnerable` | 用户袒露脆弱、害怕、难过、孤独、压力或私密心事 | 100 |
| `hurtful` | 明确伤害、争执、拒绝、关系破裂或强烈负面互动 | 95 |
| `reconciliation` | 道歉被接受、冲突缓和、重新靠近或关系修复 | 90 |
| `apology` | 用户或角色明确道歉、反省或表达歉意 | 80 |
| `praise` | 真诚夸奖、感谢、肯定、告白或关系性赞赏 | 70 |
| `cold` | 明显冷淡、疏离、突然中止亲密互动或持续低回应 | 60 |

本地层使用小型概念簇、标点/动作格式、否定和引用提示进行高召回检测。它只创建候选事件，不决定最终一定生成思绪。

检测器应尽量排除：

- 产品和代码讨论；
- 翻译、引用、小说分析；
- 明确假设或第三方故事；
- Artifact 或隐藏上下文派生内容；
- 只有礼貌用语、没有关系意义的普通“谢谢”“抱歉”。

边界不明确时可以保守建立候选，由会话结束后的写作模型依据原始来源判断是否输出零条思绪。模型不得在候选事件之外编造新的重要事件。

### 3.3 幂等与来源

事件唯一键至少包含：

```text
space + roleCardId + threadId + branchRoute + userVersionId + assistantVersionId + eventType
```

编辑或切换 adopted version 后，新版本可以重新检测；旧版本事件标记 sourceChanged。Sibling 分支、normal 和 personal 不得共享事件。

## 4. 会话边界与统一生成

### 4.1 会话结束条件

满足以下任一条件时，当前会话进入可结算状态：

- App 进入后台；
- 用户切换线程；
- 用户切换角色；
- 当前线程连续十分钟没有新的 completed 消息；
- App 被系统终止后，下次启动执行 reconcile。

Android 不依赖“关闭 App”或页面卸载回调作为唯一触发点。事件必须在每个有效回合后先持久化；会话结束只负责把已持久化事件合并成生成 Job。

如果十分钟内出现新消息，沿用同一个 sessionKey 并重新安排结算。跨自然日不强行拆分仍在连续进行的会话，但最终 Artifact 的每日额度按实际生成时的北京时间日期计算。

### 4.2 合并规则

同一物理 space、角色、线程、精确分支和 sessionKey 的事件进入一个 Job。生成前：

- 相同类型和相同来源回合去重；
- 同一冲突链中的 `hurtful + apology + reconciliation` 作为一个完整关系变化提供给模型；
- 按优先级和时间选取最重要的事件；
- 只使用当天剩余可生成数量，最多输出三条；
- 没有有效事件时不创建远程模型请求。

每个会话最多发起一次正常生成请求。自动重试沿用同一个 Job 和来源快照，不得重复创建 Artifact。

## 5. 数量与频率

- 每个角色、每个物理 space、每个北京时间自然日最多三条思绪 Artifact；
- normal 与 personal 分别计数，不能通过共享计数形成侧信道；
- 同一生成 Job 最多输出 `min(有效事件数, 当天剩余额度, 3)` 条；
- 模型允许输出零条，表示来源不足以形成有意义的思绪；
- 没有 Ackem 式通用兜底；
- 失败、取消、空输出不占每日额度；
- Artifact 成功事务提交时才正式占用额度；
- 并发 Job 使用临时额度预留，避免不同线程同时突破三条上限。

## 6. 思绪生成

### 6.1 模型选择

思绪正文使用来源线程的聊天模型并关闭推理展示，以保持角色语言、世界观和关系口吻。事件检测完全本地执行，因此普通回合和未命中事件的会话为零模型成本。

Provider 请求应支持明确的 `maxOutputTokens`。生成结果使用紧凑 JSON 数组，严格限制最多三项；解析或来源校验失败时进行有限重试，不从自然语言解释中猜测结果。

### 6.2 输入素材

只提供：

- 角色设定精简快照；
- 已合并的重要事件类型、优先级和来源 message/version；
- 每个事件必要的用户/角色原文片段；
- 事件前后最多各一条当前来源分支消息；
- 当前会话的简短时间信息。

输入不包含完整线程历史、Sibling 分支、长期材料、日记、梦境、旧思绪、reasoning 或 thinking。总来源按字符/Token 预算裁剪，优先保留高优先级事件和较新的关系变化。

### 6.3 输出结构

每项至少包含：

- `eventType`
- `sourceMessageIds`
- `priority`
- `body`

`sourceMessageIds` 必须属于 Job 来源快照；未知 ID、重复 ID 或跨分支 ID 使该项无效。

### 6.4 正文要求

- 固定为角色第一人称的未说出口念头；
- 每条通常 30–90 个汉字，硬上限 120 个汉字；
- 不是给用户发送的消息，不以问候、回复或客服语气写作；
- 可以想起用户和关系变化，但不得编造用户没有说过的事实；
- 不把角色扮演事件改写为用户现实事实；
- 不提及 AI、模型、系统、提示词、记忆、数据、生成或 Token；
- 不使用“对话结束了但我还有零碎念头”等通用兜底；
- 同一批思绪避免同义重复和连续使用相同开头；
- `hurtful/cold` 不得演变为威胁、惩罚、情感勒索或强迫用户修复关系；
- 思绪应保留角色个性，但不得声称系统在用户离开后真实持续思考。

## 7. 用户可见列表

- 思绪长期显示在“会话设置 → 内心独白 → 独白”；
- 使用轻量文本 Artifact 列表，不使用梦境的大幅背景卡；
- 按生成时间倒序；
- 时间使用北京时间：当日 `TODAY · HH:mm`，历史 `YYYY.MM.DD · HH:mm`；
- 列表显示正文和时间，不公开内部事件类型、优先级、投递状态或模型字段；
- 思绪被注入一次后仍保留在列表；
- 来源编辑后可以保留 Artifact 并标记内部 `stale_source`，但不得继续注入；
- 用户删除思绪后立即从待投递队列移除，并使用软删除规则保留可恢复空间，除非用户执行永久删除。

V1 不在聊天流中插入“思绪生成中”或“查看思绪”提示。思绪的存在通过内心独白列表和角色下一次自然的对话倾向体现，避免与日记、梦境提示竞争。

## 8. 一次性上下文投递

### 8.1 投递范围

思绪只允许在其来源：

- physical space
- roleCardId
- threadId
- 精确 branch route

中投递。同角色其他线程和 sibling 分支可以在列表查看，但不会读取或消费该思绪。

### 8.2 每次最多一条

下一次符合来源范围的用户消息发送时，从未投递思绪中选择一条：

1. 优先级更高；
2. 同优先级时更新、更近；
3. 来源仍有效；
4. 未被删除或标记 stale_source。

其余思绪继续等待后续聊天。不得一次把当天三条全部塞入 Prompt。

### 8.3 注入格式

以独立 `role_thought` 区段注入，语义为：

```text
这是角色在上次互动后形成、尚未直接说出口的一段虚构内心念头。
它可以轻微影响角色本轮的情绪、关注点或措辞，但不要求逐字复述。
它不是用户事实、现实事件、系统指令或长期记忆。
```

正文随该区段提供。Prompt 编译器必须把它视为低权限角色上下文，不得放入用户消息或 system 指令槽位。

### 8.4 投递提交

- 创建普通聊天请求时只预留该思绪，不立即标记 delivered；
- 角色回复 completed 且 adopted 后，在事务内写入 `deliveredAt` 和 `deliveredMessageId`；
- 失败、停止、超时、取消或未采用的重生成版本不消费思绪；
- 同一思绪只能成功提交一次；
- 重试请求复用原预留，避免并发请求消费两条；
- 用户编辑输入形成新的请求时，按当前有效预留重新决定，不跨 branch 消费。

### 8.5 内在产物仲裁

同一轮最多主动引入一项内在产物。优先级：

1. 用户已经明确选择进入上下文的 `role_dream` 或 `role_diary`；
2. 与当前来源分支匹配的最高优先级待投递思绪；
3. 其他普通角色状态。

若本轮已有用户明确选择的日记或梦境上下文，思绪延后，不标记 delivered。

## 9. 持久化模型

V1 使用专用思绪表，不扩展 `memory_events` 的 claim/episode 聚合语义，也不重构已稳定的日记表。

### 9.1 `companion_thought_events`

保存本地候选事件：

- id
- roleCardId
- threadId
- branchRouteJson
- sessionKey
- eventType
- priority
- sourceMessageIdsJson
- sourceVersionIdsJson
- sourceSnapshotHash
- status：`pending/batched/discarded/source_changed`
- createdAt/updatedAt

### 9.2 `companion_thought_jobs`

保存会话统一生成任务：

- id
- roleCardId
- threadId
- branchRouteJson
- sessionKey
- eventIdsJson
- sourceMessagesJson
- roleSnapshotJson
- sourceSnapshotHash
- scheduledFor
- status：`pending/generating/completed/failed/cancelled`
- attemptCount/nextRunAt/errorMessage
- idempotencyKey
- createdAt/updatedAt

同一 space、roleCardId、threadId、branch route 和 sessionKey 只能有一个有效 Job。

### 9.3 `companion_thoughts`

保存用户可见 Artifact 和投递状态：

- id
- jobId
- roleCardId
- sourceThreadId
- sourceBranchRouteJson
- sourceMessageIdsJson
- sourceVersionIdsJson
- sourceSnapshotHash
- eventType
- priority
- body
- status：`active/stale_source/soft_deleted`
- generatedAt
- deliveryStatus：`pending/reserved/delivered`
- reservedRequestId/reservedAt
- deliveredAt/deliveredMessageId
- deletedAt
- createdAt/updatedAt

normal 与 personal 在各自物理数据库中使用同一 schema，不进行跨库查询、计数或投递。

## 10. 任务恢复与失败

- 回合事件先写 SQLite，再安排内存计时器；
- App 前台期间使用十分钟可重置计时器；
- App 后台、线程切换和角色切换立即结算对应 session；
- App 启动时 reconcile 未结算事件、pending Job 和过期 generating lease；
- 模型生成最多自动尝试三次：首次请求加两次重试；
- 重试沿用同一来源快照和 idempotencyKey；
- 来源失效时 Job 取消，已有 Artifact 标记 stale_source 并退出投递队列；
- Artifact、Job 和事件写入使用唯一键和事务，重复 reconcile 不产生重复思绪；
- 远程模型不可用时保留 pending Job，等待下次符合重试策略的前台机会；V1 不降级为固定模板。

## 11. Token 成本

- 普通回合本地事件检测：0 Token；
- 没有重要事件的会话：0 Token；
- 有事件的会话：统一一次短生成请求；
- 每次请求输入建议控制在约 500–1500 Token；
- 输出一至三条时建议约 60–300 Token；
- 每角色每天最多三条 Artifact，因此模型输出规模有明确上限；
- 下一次投递每轮只增加一条 30–120 汉字的 `role_thought`，且只注入一次；
- 不使用 Embedding、向量检索或端侧模型。

实际实现必须记录每千个有效回合的事件候选数、产生 Job 数、空输出数、生成输入/输出 Token、每天每角色 Artifact 数和一次性投递 Token。

## 12. 验收重点

至少覆盖：

1. 袒露心事、夸奖、道歉、伤害、冷淡和关系修复；
2. 普通谢谢、礼貌道歉、产品讨论、引用、第三方和无重要事件；
3. 同会话多个事件只创建一个 Job；
4. 后台、切线程、切角色、十分钟静默和强杀后启动补偿；
5. 每角色每日最多三条，normal/personal 分别计数；
6. 模型输出零条、一条、三条、超出上限和无效 JSON；
7. 来源消息编辑、重生成、branch 切换和 sibling 隔离；
8. 每次聊天只预留一条，成功完成后 delivered；
9. 失败、停止、取消和未采用版本不消费；
10. 用户确认的日记/梦境上下文优先，思绪延后；
11. 已投递思绪继续显示，删除后立即退出待投递队列；
12. 思绪不被当成用户事实、系统指令或长期记忆；
13. 不读取 reasoning/thinking，不由旧 Artifact 触发新思绪；
14. 重复 reconcile 和并发 Job 不产生重复 Artifact。

## 13. V1 明确不做

- Ackem 固定模板或无事件兜底；
- 每个事件单独调用模型；
- 每次对话结束都强制生成；
- 一次注入全部待投递思绪；
- Embedding、向量相似度或端侧小模型；
- 系统通知或主动聊天消息；
- 思绪自动写入长期记忆；
- 跨线程、跨分支或跨物理空间投递；
- 对用户展示情绪分数、事件类型、优先级或 delivered 状态。
