# Android 聊天块级流式渲染设计

日期：2026-07-29
状态：修订定稿，已完成 rail 对齐、可见更新等待和 reservation 风险审计；等待按配套实施计划执行。
范围：只改 AI 聊天的流式显示层；不改变 Provider 请求、消息持久化、梦境、思绪、记忆、分支、日记或 Prompt/缓存语义。

## 1. 结论

Pixory 应从“字符步进式显示”切换为“流式到达、语义块原子呈现”。Provider 仍可持续输出任意细粒度 delta，SQLite 仍以恢复优先的节奏保存完整文本；只有 UI 不再模拟逐字打字。

最终视觉效果：

- 首个可读文本到达后立即出现；文字本身不做逐字动画，也不对每一行做淡入动画。
- 后续内容优先以完整句子、完整换行或完整段落一次出现；快模型会在极短时间连续出现多个块，视觉上可以铺满半屏到一屏。
- 单个内部 block 不应大到触发昂贵的全屏 Text/Markdown 重排；“一屏出现”由 2 至 3 个已经收到并已预留的 block 在同一 UI flush 中组成，而不是把一整屏未知高度文本当成一个 block。
- “每次可见更新至少一个完整可读单元”不能解释为“必须等待语法句号”。Provider 可能长时间不发标点、只发极小 delta 或出现网络间隙；严格等待会把 UI 等待拉到秒级。产品契约改为“语义边界优先、时间有上限”：有边界时提升完整 semantic block；无边界达到 deadline 时提升一个不可拆 grapheme 的 bounded fragment（能凑成一视觉行就凑一视觉行，否则显示当前已收到内容），该片段仍是独立可读的视觉单元，但不宣称是完整语法句。
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

1. 普通回复不再出现逐字打字机效果；每次可见更新至少包含一个完整 semantic block，或在 deadline 触发时包含一个 grapheme-safe bounded fragment；不得因等待句号而无限延迟。
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

### 3.3 气泡与输入框的水平对齐契约

本规格中的“输入框边缘”统一指聊天底部 `composerShell` 的可见外轮廓左右边缘，不是内部 `TextInput` 的字符起点，也不是屏幕安全区边缘。当前组件树中 `screenContent` 已经提供 `layout.pagePaddingHorizontal`，`composerShell` 与消息列表是同一父级下的兄弟；因此 rail 的外宽就是该父级的 content width，不能再给 composer 追加一次同样的水平 margin。

- 发送气泡在达到最大宽度时，左右两个外边缘都必须与 `composerShell` 的左右外边缘重合；短发送消息仍保持右对齐的自然宽度。
- AI 回复气泡在达到最大宽度时，左右两个外边缘都必须与 `composerShell` 的左右外边缘重合；短回复仍保持左对齐，不会为了右边缘对齐而把短消息挪到右侧。
- 该 rail 同时适用于普通历史气泡、attached live block 气泡、detached tail 气泡、续答和停止/失败后的最终气泡，以及思考模块。长思考模块的右侧外边缘同样对齐 `composerShell` 右边缘；短思考保持左对齐。操作行、日期分隔线和引用列表不强制套用此最大宽度。
- 屏幕旋转（当前产品锁定竖屏）、字体缩放、键盘、safe area、附件栏高度和 composer 高度变化不得改变 rail 的左右来源；它只能随页面的共享横向 layout token 改变。字体缩放只影响 content height，不得通过旧的 assistant 气泡测量值反推 rail 宽度。
- 不通过运行时测量 input 的 x/y 再异步修正气泡宽度。首帧必须由同一 layout token 得到正确 rail，避免初始错位后跳动。

实现约束：rail 只提供 `outerWidth`/`maxWidth: '100%'` 和按 lane/bubble padding 换算出的 `contentWidth`；不要在 `AiChatComposer` 内添加额外 `marginHorizontal`，不要把 `Dimensions` 的屏幕宽直接当成气泡 content width，也不要把测量短消息得到的自然宽度写入全局 registry。

### 3.4 可见更新的等待契约（以成熟方案为准）

公开的 OpenAI/Gemini 流式 API 和 Google Chrome 的官方渲染指南都采用“增量到达、追加已有输出”的模型，没有公开证据表明 ChatGPT 或 Gemini 会为了等句号而阻塞显示。Andes 论文进一步把体验定义为首 token 时间（TTFT）和用户可消化的 token delivery timeline（TDT），并允许客户端短暂缓冲突发 token 后按可消化节奏释放。

因此 Pixory 的硬契约不是“每次必须完整语法句”，而是：

1. 每次可见提交必须追加至少一个非空、不可重复的 render unit；已追加 unit 的 key 和正文不回写。
2. 优先把空行段落、完整 Markdown 行/闭合块、句末标点组织成 semantic block；尚未确定的 Markdown 片段暂存在 active tail，确定后追加新 renderer 节点。
3. 如果模型连续输出没有边界，不等待句号、不人为制造数秒空白；按已验证的 pacing profile 追加 grapheme-safe 文本单元。极短 delta 可以并入下一次提交，但不得无限等待。
4. 终态必须立即 append/flush 剩余 active tail，再由完整 renderer 接管；Provider 没有新数据时不人为刷新。

节奏不在 Spec 中硬编码 120/180ms。验收使用有依据的两级指标：本地已有 Provider delta 时，首个可见响应以“接近即时”的 100ms 级目标观测；首个可读内容以 HCI 研究中“少于 1 秒维持交互连续性”的目标观测。后续 TDS/flush 间隔由 Android 基线、设备压力和 Andes 式用户可消化速度 profile 校准，不得凭经验写死一个数。

## 4. 设计备选

### A. 仅调大字符步进参数：拒绝

改动小，但仍把一个不断变长的全文字符串重交给同一 Text/Markdown 树。大块 delta 会导致气泡高度一次跳变，用户上滑时也无法复用现有 tail reservation。这只是“更快的打字机”，不是块级渲染。

### B. UI 语义块调度器加统一 reservation：采用

Provider 文本保持权威全文；显示层单独把“新收到、尚未展示”的文本切为稳定 block，先预约高度，再在有限频率下原子提升 block。attached 和 detached 共享 block、估高、测量、debt 和 key 契约，只在提升与跟随规则不同。

这复用现有 tail 机制，最小化业务影响，并在不牺牲恢复能力的前提下消除打字机效果。

### C. 严格等语法完整单元再渲染：拒绝

布局最稳定，但当模型不发标点或只发慢速小 delta 时会出现 0.5 至数秒的本地等待；这与陪伴聊天的在场感和首段反馈冲突。采用 B 的 append-only active tail，保留流式感，同时将未确定语法限制在一个可继续追加的渲染单元内。

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
2. 调度器按优先级切块：空行段落边界 > Markdown 完整行/闭合块 > 句末标点 > 弱标点/空格 > 强制时间边界。
3. 未闭合 code fence、表格表头/分隔行、HTML 和数学块优先留在 active tail；结构闭合后追加 rich renderer，不能重置已显示 block 的 key。不得为了等闭合而让整个消息空白。
4. 每个 block 使用 messageId + generationId + lane + startOffset 作为稳定 identity。完成块不可因后续 delta 改写内容或 key。

### 6.2 attached：用户在底部

- 第一个可读单元走 leading edge：满足 semantic/安全弱边界立即追加；连续小 delta 未形成边界时按 pacing profile 合并，不得继续等句号。
- 后续提交只追加新的 render unit；每次最多一个 requestAnimationFrame 提交，绝不按 Provider delta 次数更新。profile 的目标是让用户感觉连续、可消化，而不是追求 Provider token 速率。
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
  ?? estimate(block.raw, currentBubbleContentWidth, fontScale, lineHeight)
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

### 7.3 Rail 变化与高度测量边界

- `currentBubbleContentWidth` 必须由共享 rail 的 outer width 减去实际 renderer 的 horizontal padding/border 得到；assistant、user、reasoning lane 分别使用自己的 content inset。不能把 composer 的 outer width、TextInput 的 inner width 或自然宽度短消息的 `onLayout` 值混用。
- 宽度、字体缩放或 renderer 版本变化创建新的 geometry epoch/cache key。旧宽度的 measured height 不能直接复用；在 detached/拖动期间仍遵守 `max(previousReservedHeight, nextEstimate, measuredHeight)`，因此变宽导致的真实高度变小会暂时表现为 shrink debt，而不是立即缩短 spacer。
- 首帧对齐使用共享 layout token；`onLayout`/`measure` 只用于 block 高度校准和诊断，不用于异步修正 rail 的 x/y。RN 官方说明 `onLayout` 回调发生在布局计算后、状态更新可能产生中间态；`measure` 通过异步回调返回，不适合作为首帧 rail 来源。
- 任何 rail 宽度改变都必须先使旧 reservation 标记为 geometry-stale，再按新宽度为尚未挂载 block 建立估高；否则旧的窄 rail 估高会在新宽度下形成错误 blank spacer 或提前暴露列表项。

### 7.4 Reservation 风险登记

| 风险 | 触发条件 | 影响 | 必须的缓解/验收 |
| --- | --- | --- | --- |
| 双重水平 inset（高） | 在已有 `screenContent` padding 上再给 composer 加 page margin | 输入框和气泡整体错开，无法达到 1dp 边缘契约 | rail 只消费父级 content width；Android 长 user/assistant/thinking 截图两侧误差 <= 1dp |
| outer/content width 混用（高） | 用 composer 外宽估 Text/Markdown 内容行宽 | 行数、reservation 和实际高度不一致，出现 blank 或二次跳高 | 估高 API 明确接收 `currentBubbleContentWidth`，按 lane inset 单测 |
| 全局短消息宽度污染（高） | assistant `onLayout` 写入自然宽度 registry，下一次 tail 复用 | 长回复被按窄宽度估高，用户上滑时 spacer 失真 | 删除/禁用自然宽度作为 source of truth；用 rail geometry epoch |
| rail/字体变化（高） | 旋转、分屏、字体缩放、主题 renderer 变化 | 旧 measured height 不能复用；单调 reservation 会暂时积累 debt | cache key 带 width/font/renderer epoch；无拖动且稳定 200ms 后再回收 |
| rich fallback 低估（中） | code/table/image/html 实际布局比 fallback 高 | 首次挂载时补高，可能推动底部或 tail | type-specific safety margin；`streamBlockUnderReserveCount` 必须可观测 |
| pacing 下语法不完整（中） | Provider 长时间无标点或网络小 burst | 若严格等待则卡顿；若粗暴截断则 Markdown 破坏 | active tail 使用 grapheme-safe 增量 renderer；结构闭合后追加 rich renderer；终态完整 renderer 接管 |
| FlatList 批次空白/阻塞（中） | 一次提升过多 block 或 batching period 不匹配 | 空白区、触摸响应变慢、掉帧 | 每帧最多 2–3 block/0.70 viewport；按设备压力记录 frame delay，不能盲调窗口 |
| MVCP 重排（高） | detached 时替换历史 item、重置 key 或重排数组 | 官方警告可能 jump/jank | 冻结历史 item；只追加 tail/spacer；坐标 10 秒保持不变 |

### 7.5 极端大 delta

若单个 Provider event 带来 1000+ 字符：

1. 切成不超过 8 至 12 视觉行的内部 block；绝不把一整屏作为单一 Text 节点一次替换。
2. 为全部已收到 block 建立 reservation；detached 时它们全部位于不可见 spacer。
3. attached 时一帧最多提升 2 至 3 块，超过 viewport 预算的 block 留到下一调度周期；用户在数百毫秒内看到接近整屏的自然文字，而不是逐字追赶。若文本没有任何语义边界，按 pacing profile 追加 active tail，不等待完整回答。
4. Markdown 结构闭合后不得重置前一 block 的 key；只能升级 renderer，必要时增加 reservation/debt。

## 8. 组件边界

| 单元 | 职责 | 计划文件 |
| --- | --- | --- |
| display scheduler | 纯函数：delta buffer、边界识别、flush 决策、block budget、terminal flush。 | 新建 src/ai/aiStreamingDisplayScheduler.ts |
| runtime policy | 集中配置 latency、visual line/block/viewport 上限、device-pressure 降级。 | 修改 src/ai/aiStreamingRuntime.ts |
| stream service adapter | authoritative text/persistence 不变，把 scheduler 输出作为 UI patch 发出；记录指标。 | 修改 src/ai/aiChatService.ts |
| stream store | 保存不可变 display-session blocks 和 reservation metadata，按 lane 精确通知订阅者。 | 修改 src/ai/aiStreamingMessageStore.ts |
| bubble rail | 唯一维护 composerShell 外轮廓与消息最大宽度的共享横向 token，禁止 94% 或重复 gutter。 | 新建 src/components/ai/aiChatBubbleRail.ts |
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
| 普通短回复 | 本地已有 delta 时首个可见响应按 100ms 级“接近即时”目标观测；首个可读内容 p95 < 1s；无逐字视觉。 |
| 快速 Provider burst | 1000 字 burst 不产生整条历史重渲；一帧提升不超过 0.70 viewport。 |
| 长回复 | 10,000 字中不出现持续超过 250ms 的 JS frame delay；TDS/flush 使用已验证 pacing profile，不能用未经实测的固定频率宣称达标。 |
| 上滑阅读 | 生成中任意停留 10 秒，当前可见历史项的视觉坐标不变；无自动跳到底部。 |
| 回到底部 | 无未测 block、未清 debt 或重复内容后才提交回主消息；无闪白/闪旧文本。 |
| 终态 | stop/error/complete/route blur/background 不丢失 display buffer，最终数据库正文完整。 |
| 水平几何 | 长用户、长 AI、长思考气泡的左右两个外边缘都与 composerShell 对齐，误差 <= 1dp；短消息仍保留各自自然对齐；普通、attached、detached、terminal 四种状态一致。 |

## 10. 可观测性、安全和回滚

新增或明确以下 content-free 指标：

- streamSemanticFlushCount、streamSemanticMergedDeltaCount、streamFirstReadableBlockMs。
- streamAttachedBlockCount、streamDetachedBlockCount、streamMaxReservationHeight、streamMaxShrinkDebtHeight。
- streamBlockMeasureCount、streamBlockUnderReserveCount、streamBlockRendererFallbackCount。
- streamFlushReason：boundary、pacing_profile、viewport_budget、terminal。

这些字段只能包含数量、时间、布尔值、枚举和不可逆 generation identity；不得保存正文、token、文本 hash、dream/thought 内容、记忆内容、citation 内容或 Personal 原文。

新增独立远程开关 aiBlockStreamingRendererEnabled，默认仅在开发/验收环境启用。开关关闭时完全恢复当前 targetStreamingDisplayStep 字符步进和 live store 路径；不修改数据库、不清除 generation job、不影响已生成消息。

若运行时检测到 block identity、reservation 或测量不变量违反，记录无内容错误码，停止提升新 block，并在同 generation 内回退到当前全文 live renderer；不得丢弃 authoritative text。

## 11. 研究依据

- OpenAI 官方 Streaming API 说明输出可在完整回答结束前开始处理；Gemini 官方 Streaming API 同样以增量 chunk 返回内容，适合交互式应用。
  https://developers.openai.com/api/docs/guides/streaming-responses
  https://ai.google.dev/api/generate-content
- Google Chrome 官方指南以 Gemini/ChatGPT 为例，建议 append-only 渲染；Markdown 需要增量 parser，避免每个 chunk 重新解析和替换全文。
  https://developer.chrome.com/docs/ai/render-llm-responses
- Andes 论文定义 TTFT/TDS/TDT，并提出客户端 token buffer 按用户可消化速度平滑释放；本设计借用 QoE 指标思想，不照搬其服务端调度实现。
  https://arxiv.org/abs/2404.16283
- Shneiderman 的 ACM 综述指出用户通常偏好低于一秒的响应，同时过快或过慢都可能影响错误率；因此本设计用 100ms 级即时反馈和 <1s 连续性作为观测目标，而不是臆造固定 chunk 毫秒值。
  https://www.cs.umd.edu/~ben/papers/Shneiderman1984Response.pdf
- React Native 官方 FlatList 文档说明 updateCellsBatchingPeriod 和 maxToRenderPerBatch 存在 fill-rate/响应性取舍。本设计只在已测量的 tail 区调整这些参数，不盲目放大窗口。
  https://reactnative.dev/docs/optimizing-flatlist-configuration
- React Native 官方测量文档和 LayoutEvent 文档说明 `onLayout`/`measure` 的时序与异步边界；它们只用于高度校准，不作为 rail 首帧 x/y 来源。
  https://reactnative.dev/docs/the-new-architecture/layout-measurements
  https://reactnative.dev/docs/layoutevent
- React Native 官方 ScrollView 文档说明 `maintainVisibleContentPosition` 适用于聊天，但重排子项会造成 jumpiness/jank；因此 detached 只允许稳定历史 item + tail/spacer 增长。
  https://reactnative.dev/docs/scrollview
- React 官方 useSyncExternalStore 文档说明外部 store 更新不能依赖 concurrent transition 掩盖高频更新成本。因此应先合并 Provider delta 为有限 flush，而不是逐 delta publish。
  https://react.dev/reference/react/useSyncExternalStore
- 项目既有性能规格：
  docs/superpowers/specs/2026-06-19-ai-chat-latency-and-streaming-performance-design.md
