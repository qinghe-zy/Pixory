# Android 聊天块级流式渲染设计

日期：2026-07-29
状态：已定稿，等待按配套实施计划执行。
范围：只改 AI 聊天的流式显示层；不改变 Provider 请求、消息持久化、梦境、思绪、记忆、分支、日记或 Prompt/缓存语义。

## 1. 结论

Pixory 应从“字符步进式显示”切换为“流式到达、语义块原子呈现”。Provider 仍可持续输出任意细粒度 delta，SQLite 仍以恢复优先的节奏保存完整文本；只有 UI 不再模拟逐字打字。

最终视觉效果：

- 首个可读文本到达后立即出现；文字本身不做逐字动画，也不对每一行做淡入动画。
- 后续内容以完整句子、完整换行或完整段落一次出现；快模型会在极短时间连续出现多个块，视觉上可以铺满半屏到一屏。
- 单个内部 block 不应大到触发昂贵的全屏 Text/Markdown 重排；“一屏出现”由 2 至 3 个已经收到并已预留的 block 在同一 UI flush 中组成，而不是把一整屏未知高度文本当成一个 block。
- 气泡保持一个连续的 assistant 气泡，而不是把每段做成独立对话气泡。仅保留一个低调的生成指示/光标，提示流仍在继续。
- 用户上滑阅读时，已读历史的可见位置不得因后续生成而移动；新增内容在不可见的 tail 区积累，用户返回底部后再平滑接入。

## 2. 现状与诊断

当前 aiChatService 使用 targetStreamingDisplayStep 和 30/45/60 FPS 目标，把 Provider delta 合并后继续按字符量逐步放给 UI。这个方案保护了首个字符速度，但产生明显打字机感，并会让不断增长的全文快照反复触发 Text/Markdown 布局。

项目已具备关键基础：

- aiStreamingMessageStore 用 useSyncExternalStore 把流式消息从整条消息列表中隔离。
- aiStreamingBlockSplitter 能按段落和标点切为 180 至 560 字符的可估高 block，并按真实气泡宽度、字体缩放和缓存高度估高。
- AiChatScreen 的 detached tail 在用户离开底部时会冻结主消息、保留 spacer、高度单调增长、记录 shrink debt，并在安全时机回收多余高度。
- FlatList 已启用 maintainVisibleContentPosition，并按 tail hot/warming/cold 分区调整预渲染与 clipping。

缺口：block 和 reservation 主要服务于“用户不在底部”的 detached tail；正常停留在底部时仍把不断变长的全文快照发布给 live renderer。

## 3. 目标与非目标

### 3.1 必达目标

1. 普通回复不再出现逐字打字机效果；每次可见更新至少包含一个完整可读单元。
2. 首个可读单元在收到首个 Provider delta 后 p95 不超过 150ms；此目标不包含 Provider 首 token 网络时间。
3. 用户在底部时，新增块被自动跟随；用户离开底部时，已显示历史在生成过程中的视觉坐标不改变。
4. 已收到但尚未被 UI 提升的文本必须先拥有保守的高度 reservation；未知未来文本不得制造空白预留。
5. 停止、失败、完成、路由离开、切后台、恢复续答和分支切换都必须保持完整文本、没有重复块、没有幽灵 spacer。
6. 不增加远程模型调用、prompt token、数据库 schema 或用户设置。

### 3.2 不做

- 不引入 FlashList 或新的第三方渲染/动画依赖；是否替换 FlatList 继续以真实 profile 为前提。
- 不做整页文字淡入、逐行弹跳、逐字 fade-in 或重型 LayoutAnimation。
- 不为每个 block 新建数据库记录；流式完整文本仍由既有 generation/persistence 链路持有。
- 不让梦境、思绪、记忆、分支或 citation 改变显示调度决策。
- 不新增“打字机/块级”的用户设置；首版仅用远程 feature flag 灰度。

## 4. 设计备选

### A. 仅调大字符步进参数：拒绝

改动小，但仍把一个不断变长的全文字符串重交给同一 Text/Markdown 树。大块 delta 会导致气泡高度一次跳变，用户上滑时也无法复用现有 tail reservation。这只是“更快的打字机”，不是块级渲染。

### B. UI 语义块调度器加统一 reservation：采用

Provider 文本保持权威全文；显示层单独把“新收到、尚未展示”的文本切为稳定 block，先预约高度，再在有限频率下原子提升 block。attached 和 detached 共享 block、估高、测量、debt 和 key 契约，只在提升与跟随规则不同。

这复用现有 tail 机制，最小化业务影响，并在不牺牲恢复能力的前提下消除打字机效果。

### C. 等完整回复再渲染：拒绝

布局最稳定，但失去流式首段反馈、停止感知与陪伴聊天的在场感。

## 5. 术语与不变量

| 术语 | 含义 |
| --- | --- |
| authoritative text | aiChatService 收到的完整 answer/reasoning 文本；用于持久化、停止、引用和恢复，绝不因 UI 节流丢失。 |
| display buffer | 已收到但尚未被 UI 提升的文本；只存在内存，不写入独立数据库。 |
| semantic block | 能独立阅读与估高的文本单元，含稳定 identity、lane、offset、结构类型、预留高度和测量高度。 |
| attached | 用户停留在最新消息底部；允许气泡向下增长和自动跟随。 |
| detached | 用户上滑、路由不聚焦或正在查看历史；主消息冻结，新增内容进入 tail/spacer。 |
| reservation | 已收到 block 的预计自然高度；其总值在用户交互期间只能增长。 |
| shrink debt | reservation 高于真实高度的差额；只能在安全条件下回收。 |

必须始终成立：

~~~
authoritative text >= display buffer + visible blocks
reservation(t + 1) >= reservation(t)    （用户拖动、惯性或 detached 期间）
visible historical item layout 不因后续 delta 被替换或缩短
同一 messageId + generationId + lane + startOffset 的 block 在一次生成中只提升一次
~~~

## 6. 显示状态机

~~~mermaid
stateDiagram-v2
  [*] --> receiving
  receiving --> attached: 位于底部且页面聚焦
  receiving --> detached: 上滑 / 页面失焦
  attached --> detached: 用户离开底部
  detached --> attached: 回到最新且无拖动/惯性
  attached --> terminal: 完成 / 停止 / 失败
  detached --> terminal: 完成 / 停止 / 失败
  terminal --> settled: 强制 flush、测量完成、debt 安全回收
  settled --> [*]
~~~

### 6.1 接收和切块

1. Provider delta 仅追加到 authoritative text 与 display buffer，不能直接触发整个消息列表刷新。
2. 调度器按优先级切块：空行段落边界 > Markdown 完整行/闭合块 > 句末标点 > 强制时间边界。
3. 未闭合 code fence、表格表头/分隔行、HTML 和数学块保持在 buffer；超时只能以 plain streaming block 显示，结构闭合后才升级为 rich renderer。
4. 每个 block 使用 messageId + generationId + lane + startOffset 作为稳定 identity。完成块不可因后续 delta 改写内容或 key。

### 6.2 attached：用户在底部

- 第一个可读单元走 leading edge：满足安全边界立即 flush；连续小 delta 未形成边界时，首 delta 后最多等待 120ms。
- 后续 flush 间隔目标为 120 至 180ms；每次最多一个 requestAnimationFrame 提交，绝不按 Provider delta 次数更新。
- 单 block 最大为 8 至 12 个视觉行（基线设备约 180 至 260dp）。若 Provider 一次送来大量文本，可在同一 flush 提升 2 至 3 个 block，合计最多约 0.70 个可视区域高度。
- 文本立即出现，不做 opacity、translate、scale 或逐字动画。最后一个未闭合 block 后保留轻量生成指示；它不参与文本高度估算。
- requestAnimationFrame 后校准 auto-follow；若用户在更新前离开底部，本批次转入 detached，不再强制滚动。

### 6.3 detached：用户阅读历史

- 立刻冻结此前可见 message，并把所有后续 block 写入既有 tail model。
- 先向 tail reservation 增加已收到 block 的估高，再决定哪些 block 提升为真实 FlatList item。用户不可见时保持透明 spacer，不让历史 item 发生替换。
- 当前视口、预热区和远离视口分别沿用 active/warming/cold 的 30/18/8 FPS 策略；只渲染当前视口和一个预热区的 block。
- 用户拖动或惯性期间禁止 shrink debt 回收；完成后也必须等 200ms 稳定窗口，并满足“底部且列表空闲”或 spacer 已离屏，才收回。

### 6.4 terminal 与恢复

- stop/error/complete 必须先强制 flush 所有 display buffer，再执行既有强制 SQLite persist、citation 解析与 terminal 消息落库。
- terminal 后未闭合 Markdown 按既有 streaming fallback 结束；最终数据库消息继续使用完整 renderer。
- generationId、messageId 或 threadId 不匹配的 patch 一律丢弃；切分支、重试和续答创建新的 display session，旧 session 的 timer、reservation 与 listener 必须清理。

## 7. Reservation 与高度算法

### 7.1 不预留未知未来

不在回复开始时预留固定一屏、固定段数或整条回答高度。唯一允许的 reservation 是“Provider 已经交付、但还没有完全挂载”的 block：

~~~
reservation(block) =
  cachedMeasuredHeight
  ?? estimate(block.raw, currentBubbleWidth, fontScale, lineHeight)
  + safetyMargin(block.type)
~~~

安全余量：plain/paragraph/list 为一行高度；code/table 为两行高度；image/math/html 使用保守 rich fallback，并在实测后只向上补差。

### 7.2 单调增长与 debt

~~~
nextReservedHeight = max(previousReservedHeight, estimate, measuredHeight)
shrinkDebt = nextReservedHeight - measuredHeight
~~~

- 测到更高时立即增加 reservation；用户在底部由 auto-follow 吸收增长，用户在历史处由 tail spacer 吸收增长。
- 测到更矮时不立即变小，记为 shrink debt。
- debt 只在列表空闲、非拖动/非惯性、稳定至少 200ms，且位于底部或 spacer 离屏时偿还。
- terminal flush 前仍有未测 block 时，保持 reservation，不允许用猜测的减高换取“干净列表”。

### 7.3 极端大 delta

若单个 Provider event 带来 1000+ 字符：

1. 切成不超过 8 至 12 视觉行的内部 block；绝不把一整屏作为单一 Text 节点一次替换。
2. 为全部已收到 block 建立 reservation；detached 时它们全部位于不可见 spacer。
3. attached 时一帧最多提升 2 至 3 块，超过 viewport 预算的 block 留到下一调度周期；用户在数百毫秒内看到接近整屏的自然文字，而不是逐字追赶。
4. Markdown 结构闭合后不得重置前一 block 的 key；只能升级 renderer，必要时增加 reservation/debt。

## 8. 组件边界

| 单元 | 职责 | 计划文件 |
| --- | --- | --- |
| display scheduler | 纯函数：delta buffer、边界识别、flush 决策、block budget、terminal flush。 | 新建 src/ai/aiStreamingDisplayScheduler.ts |
| runtime policy | 集中配置 latency、visual line/block/viewport 上限、device-pressure 降级。 | 修改 src/ai/aiStreamingRuntime.ts |
| stream service adapter | authoritative text/persistence 不变，把 scheduler 输出作为 UI patch 发出；记录指标。 | 修改 src/ai/aiChatService.ts |
| stream store | 保存不可变 display-session blocks 和 reservation metadata，按 lane 精确通知订阅者。 | 修改 src/ai/aiStreamingMessageStore.ts |
| attached renderer | 用 measured block/segment chrome 渲染连续气泡，不重渲历史。 | 新建 src/components/ai/AiLiveStreamingMessage.tsx |
| detached adapter | 复用 tail model；接收同一 block contract，而非从全文重新分割。 | 修改 aiStreamingTailModel 与 AiChatScreen |
| diagnostics | 只记录内容无关的 block/reservation/flush/measurement 指标。 | 修改 aiGenerationMetrics 与已有 diagnostics |

AiChatScreen 保留路由、scroll 状态和 attached/detached 切换协调；不得在该屏幕内新增文本分割、估高或语义边界规则。

## 9. 性能预期与验收

本设计不减少 Provider 首 token 网络时间，也不承诺“回答本身快 X%”。可量化提升只针对本地显示层：

- 当前正常底部目标为 30 至 60 UI patch/s；块级方案正常目标约为 6 至 8 UI flush/s，理论上将流式 UI 更新次数降低约 73% 至 90%。实际数值必须由 streamUiPatchCount 验证。
- firstDeltaToFirstVisibleTextMs p95 保持不超过 150ms；新增 firstReadableBlockMs，首个至少一视觉行文本也应不超过 150ms。
- 200+ 消息线程与 10,000 字回复中，maxUiBacklogAgeMs、maxUiBacklogChars、detachedTailMergeTotalMs、测量次数和 JS frame delay 必须较基线持平或改善。
- attached block 仅测量新 block，避免历史全文重复 layout；未经 Android profile 前不得宣称具体帧率或百分比收益。

| 场景 | 硬指标 |
| --- | --- |
| 普通短回复 | 首个完整可读单元 p95 <= 150ms；无逐字视觉。 |
| 快速 Provider burst | 1000 字 burst 不产生整条历史重渲；一帧提升不超过 0.70 viewport。 |
| 长回复 | 10,000 字中不出现持续超过 250ms 的 JS frame delay；UI flush 维持 6 至 8/s 或记录 pressure 降级。 |
| 上滑阅读 | 生成中任意停留 10 秒，当前可见历史项的视觉坐标不变；无自动跳到底部。 |
| 回到底部 | 无未测 block、未清 debt 或重复内容后才提交回主消息；无闪白/闪旧文本。 |
| 终态 | stop/error/complete/route blur/background 不丢失 display buffer，最终数据库正文完整。 |

## 10. 可观测性、安全和回滚

新增或明确以下 content-free 指标：

- streamSemanticFlushCount、streamSemanticMergedDeltaCount、streamFirstReadableBlockMs。
- streamAttachedBlockCount、streamDetachedBlockCount、streamMaxReservationHeight、streamMaxShrinkDebtHeight。
- streamBlockMeasureCount、streamBlockUnderReserveCount、streamBlockRendererFallbackCount。
- streamFlushReason：boundary、max_latency、viewport_budget、terminal。

这些字段只能包含数量、时间、布尔值、枚举和不可逆 generation identity；不得保存正文、token、文本 hash、dream/thought 内容、记忆内容、citation 内容或 Personal 原文。

新增独立远程开关 aiBlockStreamingRendererEnabled，默认仅在开发/验收环境启用。开关关闭时完全恢复当前 targetStreamingDisplayStep 字符步进和 live store 路径；不修改数据库、不清除 generation job、不影响已生成消息。

若运行时检测到 block identity、reservation 或测量不变量违反，记录无内容错误码，停止提升新 block，并在同 generation 内回退到当前全文 live renderer；不得丢弃 authoritative text。

## 11. 研究依据

- React Native 官方 VirtualizedList 文档说明 updateCellsBatchingPeriod 和 maxToRenderPerBatch 存在 fill-rate/响应性取舍。本设计只在已测量的 tail 区调整这些参数，不盲目放大窗口。
  https://reactnative.dev/docs/optimizing-flatlist-configuration
- React 官方 useSyncExternalStore 文档说明外部 store 更新不能依赖 concurrent transition 掩盖高频更新成本。因此应先合并 Provider delta 为有限 flush，而不是逐 delta publish。
  https://react.dev/reference/react/useSyncExternalStore
- 项目既有性能规格：
  docs/superpowers/specs/2026-06-19-ai-chat-latency-and-streaming-performance-design.md
