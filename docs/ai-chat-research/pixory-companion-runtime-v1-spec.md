# Pixory Companion Runtime V1 规格

> 状态：待用户评审，尚未进入代码实施
> 规格日期：2026-07-29
> 适用项目：Pixory Android-first AI Chat
> 主要参考：Ackem 的 L0 事件解释、L1 关系投影、L2 四维情绪、L3 psyche/话题仲裁，以及 Pixory 现有记忆账本、分支、Prompt Cache、日记任务与流式生成体系

## 1. 一页结论

本规格定义 Pixory 下一阶段的陪伴认知与聊天可靠性建设，包含：

1. 修复 31 至 50 轮以及用户缩小历史窗口后出现的摘要覆盖空洞。
2. 建立可追溯、可撤销、可重算的 `CompanionEvent` 事件账本。
3. 建立时间锚点、周期事件与 `OpenLoop` 未完成话题。
4. 借鉴 Ackem 的四层运行时，建立情绪观察、角色回应姿态、关系演化与修复协议。
5. 把所有高频动态状态放在 Prompt 的动态区，避免情绪每轮变化导致稳定前缀缓存失效。
6. 把当前“检索过即显示”的 citation 升级为模型实际引用后才显示的答案级引用。
7. 补齐 AI 文档、聊天附件和角色头像的完整备份、校验与 URI 重写。
8. 建立 SQLite 驱动的普通聊天生成恢复状态机。
9. 完善已有 Android 系统语音转文字，优先使用设备端识别，不依赖聊天模型配置。

本轮不实现多气泡、不实现记忆 Embedding、不实现主动消息与系统通知。相关接口会预留并在文档末尾标明恢复条件。

## 2. 范围状态表

| 能力 | 本轮状态 | 说明 |
| --- | --- | --- |
| 角色日记 | 已完成 | 继续使用现有独立任务与展示链路，不在本规格重做。 |
| 离线思绪 | 由其他工程实施 | 合并时接入 Companion Event 和统一 artifact 仲裁。 |
| 梦境 | 由其他工程实施 | 合并时接入 Companion Event 和统一 artifact 仲裁。 |
| 摘要连续覆盖 | 本轮实现 | 第一优先级。 |
| Companion Event | 本轮实现 | 情感、关系、时间与开放回路的共同事实源。 |
| 时间锚点与 OpenLoop | 本轮实现 | 仅在用户发起的正常聊天中自然使用。 |
| 情绪观察与回应姿态 | 本轮实现 | 不展示好感度进度条。 |
| 关系事件与修复协议 | 本轮实现 | 事件驱动、可重算、可撤销。 |
| 答案级引用 | 本轮实现 | 不再把所有进入 Prompt 的片段都显示为已使用来源。 |
| 完整 AI 文件备份 | 本轮实现 | 文档、附件、角色头像纳入 manifest 和恢复。 |
| 普通聊天生成恢复 | 本轮实现 | Provider 不支持重连时使用安全重试或续写恢复。 |
| 语音输入 | 本轮完善 | 只做语音转文字，不做实时语音通话和角色 TTS。 |
| `ResponsePresentationPlan` 与多气泡 | 明确后置 | 保留单 assistant 回合、单思考区、单正文消息。 |
| 记忆 Embedding | 明确后置 | 继续使用 FTS/词面召回，现有 outbox 不生成向量。 |
| 主动消息与系统通知 | 明确后置 | 不生成、不调度、不投递；OpenLoop 只在用户下一次正常聊天中使用。 |

## 3. 设计目标与不可破坏条件

### 3.1 目标

- 角色能感知当前事件、用户可能的情绪、互动气氛、关系变化和时间连续性。
- 同一角色的表达在长聊、跨天和分支切换后保持连贯，但不会把废弃分支状态带入当前分支。
- 用户纠正、边界与不适反馈在当前轮立即生效，优先于角色表演。
- 所有自动观察都有证据、置信度、版本和有效期。
- 关系和情绪状态可以仅由事件账本重建，不依赖不可解释的覆盖写入。
- 当前轮不增加额外的远端模型前置调用，避免扩大首字延迟。
- 情感运行时上线后，稳定 Prompt 前缀不会因为每轮情绪变化而失效。

### 3.2 不可破坏条件

- normal 与 personal 继续使用物理隔离的 SQLite 和文件目录。
- 所有事件、投影、锚点和开放回路必须带角色或线程主体、来源线程、来源消息版本与分支 lineage。
- sibling branch 默认不可互见；分支被编辑、重生成或切换后，旧事件不再参与当前投影。
- 内心产物不是用户事实，不自动写入稳定记忆。
- 自动推断的用户情绪不是稳定用户画像，必须带 TTL，不能进入稳定 System 前缀。
- 不在数据库中保存 Provider API Key；恢复任务只保存 Provider/模型标识和无密钥请求快照。
- 不把当前时间、事件 ID、request ID、projection version 放进可缓存稳定前缀。
- 不在 `AiChatScreen.tsx` 或 `aiChatService.ts` 内直接堆放事件分类、情绪递推和关系状态机。

## 4. 总体架构

```text
用户消息先完成落库
  -> Fast Event Observer（本地、确定性、无模型调用）
  -> CompanionEvent 追加写入
  -> Projection Engine 重算当前 branch overlay
  -> Stance Planner 生成本轮回应姿态
  -> Context Compiler 生成动态 companion_runtime segment
  -> 现有 Prompt Builder / Provider / Streaming 链路
  -> assistant 完成落库
  -> Post-turn Observer 写 assistant 事件
  -> 持久化 Enrichment Job 异步补充复杂事件、时间锚点和 OpenLoop
  -> Projection Rebuild / Trace / Metrics
```

运行时分为六个边界清楚的部分：

| 模块 | 职责 | 不负责 |
| --- | --- | --- |
| `CompanionEventObserver` | 当前轮本地快速分类、证据与置信度 | 不直接拼 Prompt，不调用远端模型 |
| `CompanionEventRepository` | 追加事件、撤销、可见性和幂等 | 不计算关系或情绪 |
| `CompanionProjectionEngine` | 从可见事件计算关系、情绪、时间投影 | 不渲染自然语言 |
| `CompanionStancePlanner` | 把投影和当前观察变成本轮表达策略 | 不改变长期关系状态 |
| `CompanionContextCompiler` | 生成短小的动态 ContextPlan segment | 不进入稳定前缀，不修改 memory epoch |
| `CompanionMaintenanceQueue` | 异步丰富、重建、过期与失败恢复 | 不阻塞正常聊天首字输出 |

## 5. 摘要连续覆盖

### 5.1 当前问题

当前默认历史窗口为 30 轮，而摘要压缩在未压缩轮数超过 50 后才触发。第 31 至 50 轮中的早期对话可能既不在近期历史，也不在摘要。用户把注入轮数从较大值调小后，也可能立即制造更大的空洞。

### 5.2 覆盖不变量

对当前 `thread + selected branch route + selected message versions` 中每一个有效完成回合，生成 Prompt 时必须满足以下三者之一：

```text
该回合属于 active summary segment
或属于 recent history window
或属于 history bridge / provisional bridge summary
```

不得依赖固定阈值推测“应该已经被压缩”。每次构建上下文都计算实际覆盖集合。

### 5.3 `ConversationCoveragePlan`

新增纯数据计划：

```ts
interface ConversationCoveragePlan {
  threadId: string;
  branchRouteHash: string;
  lineageVersion: number;
  summarySegmentIds: string[];
  recentMessageIds: string[];
  bridgeMessageIds: string[];
  provisionalSummaryId: string | null;
  uncoveredMessageIds: string[];
  coverageComplete: boolean;
}
```

计算顺序：

1. 加载当前 lineage 中被选中的有效 user/assistant 版本，按完成时间和拓扑顺序组成回合。
2. 加载当前 lineage 可见且 source hash 仍有效的摘要段。
3. 选择用户配置的最后 `historyRoundLimit` 轮作为 recent history。
4. 计算摘要 frontier 与 recent history 起点之间的 gap。
5. gap 较小时直接作为 `history_bridge` 动态段注入。
6. gap 超过桥接预算时，使用本地确定性压缩器生成 provisional summary，不允许为修复覆盖空洞而在发送前增加远端模型调用。
7. 异步维护任务随后用会话模型把 provisional summary 升级为 model summary；升级必须覆盖同一组 source message IDs。
8. `uncoveredMessageIds` 非空时禁止静默继续构建 Prompt，必须完成 raw bridge 或 provisional summary。

### 5.4 维护触发

- 压缩预热阈值改为 `max(8, historyRoundLimit - 5)`，不再固定等待 50 轮。
- assistant 回答完成后只入队，不阻塞 UI。
- 用户调小历史窗口时立即重新计算 coverage；必要时创建 provisional summary。
- 每个摘要段保存精确 `sourceMessageIdsJson`、`branchRouteHash`、`lineageVersion` 和 `sourceMessageVersionHash`。
- 分支或消息版本变化后，hash 不匹配的摘要段标记为 stale，不参与当前上下文。
- 合并摘要必须保持原 source message ID 并集，不能只保存来源摘要 ID。

### 5.5 预算与缓存

- raw bridge 属于动态层，不影响稳定前缀 hash。
- summary frontier 推进后才更新稳定 summary snapshot 和 memory epoch。
- summary 没有变化时，普通新消息不得改变稳定前缀。
- 预算紧张时，先压缩 bridge，再缩减低优先级 retrieval；不裁掉角色、当前请求、用户边界或 coverage 元数据。

### 5.6 验收

- 历史窗口分别设为 5、20、30、50、100，在 1 至 120 轮的每个长度上 `coverageComplete=true`。
- 从 100 轮设置直接改为 5 轮，下一次 Prompt 无 uncovered message。
- 两个 sibling branch 的摘要、bridge 和 recent history 零串扰。
- 编辑或重生成摘要覆盖区中的消息后，旧摘要不会继续生效。
- coverage 修复不增加发送前远端模型请求。

## 6. Companion Event 账本

### 6.1 事件不是记忆 Claim

`CompanionEvent` 表示“这一轮发生了什么”，Memory Claim 表示“可以长期记住什么”。同一条用户消息可以产生事件而不产生长期记忆，例如疲惫、玩笑、道歉、临时不安或一次轻微冲突。

事件只追加，不原地改写。纠正、撤销和分支切换通过新事件、状态和可见性投影处理。

### 6.2 事件类型

V1 使用以下稳定大类和 subtype：

| category | subtype 示例 | 作用 |
| --- | --- | --- |
| `interaction` | praise、gratitude、tease、casual、question、disclosure | 当前氛围与轻量关系信号 |
| `user_affect` | joy、sadness、fatigue、anxiety、anger、loneliness、excitement、uncertain | 低置信用户状态观察 |
| `relationship` | closeness、distance、rejection、conflict、apology、repair_offer、repair_confirmed | 关系投影 |
| `boundary` | naming、tone、topic、sexual、contact、notification、memory | 立即约束后续行为 |
| `correction` | fact、preference、identity、relationship、behavior | 触发记忆纠正和修复流程 |
| `commitment` | created、updated、completed、cancelled、missed | 共同约定与 OpenLoop |
| `temporal` | absolute_date、relative_date、deadline、recurrence、anniversary | 时间锚点 |
| `artifact` | diary、thought、dream_recalled、artifact_dismissed | 内心产物统一仲裁 |
| `assistant` | promise、follow_up、acknowledgement、violation | assistant 自己行为的审计 |

Ackem 的 praise、tease、cold、hurtful、apology、vulnerable、question 会保留为 subtype 兼容映射，但 Pixory 不把单个关键词直接等同于关系结论。

### 6.3 快速观察器

当前用户消息完成落库后，`Fast Event Observer` 必须在本地运行：

- 使用精准词组、句法位置、标点、否定范围和上下文窗口，不只做裸 `includes`。
- 复用现有 memory `speechMode`：`asserted/corrected/negated/hypothetical/joke/quoted/roleplay/uncertain`。
- quoted、hypothetical、joke、roleplay 默认不能形成边界、承诺或长期关系事件。
- “我在日记里写了你”不能被识别为生成日记意图；同样，“他说对不起”不能自动成为用户道歉。
- 每个事件必须保存 evidence message/version ID、evidence span、confidence、extractor version 和 idempotency key。
- 低于阈值的候选可以写诊断 trace，但不能改变投影。

强确定性事件，例如“别这样叫我”“你记错了”“明天告诉你结果”，在当前轮立即生效。复杂或含混事件由异步丰富器处理，只影响后续轮次。

V1 准入阈值：

- boundary/correction/explicit commitment 的本地 confidence `>= 0.85` 时当前轮生效。
- user affect observation 的 confidence `>= 0.65` 时可以影响 stance，但仍受 TTL 限制。
- 普通 interaction/relationship 事件的 confidence `>= 0.70` 时进入投影。
- 异步模型候选必须 confidence `>= 0.75` 且至少有一个当前可见 evidence ID。
- 同一 source message/version、category、subtype 和 normalized payload 使用唯一幂等键；本地观察与异步丰富命中同一语义时合并 provenance，不重复计分。

### 6.4 异步丰富器

- 使用当前会话 Provider/模型，但使用独立请求、独立 Prompt 和独立 token 预算。
- 不与普通聊天 history 或 Provider stream 混用。
- 只在强信号、累计一定回合或离开聊天时入队，避免每轮额外调用。
- 输出严格 JSON：事件候选、evidence IDs、speech mode、confidence、时间解析、OpenLoop 动作。
- 模型输出必须通过本地 evidence、scope、枚举和时间范围校验。
- 无模型配置、离线或调用失败时，快速观察器仍完整可用；job 持久化重试，不阻塞聊天。

### 6.5 作用域与分支

- 有角色卡：主体为 `space + roleCardId`，同时保存来源 thread 和 branch。
- 无角色卡：主体退化为 `space + threadId`，不在无关线程之间共享关系状态。
- 当前情绪和气氛永远是 thread/branch overlay。
- role 级关系只吸收当前已采纳 lineage 中的稳定关系事件；废弃 sibling branch 事件不进入 role projection。
- OpenLoop 默认 thread/branch scoped；未来只能通过显式用户动作提升为 role scope。
- 删除来源消息、版本、线程或角色时，相关事件按照数据删除语义级联失效并触发投影重建。

## 7. 时间锚点与 OpenLoop

### 7.1 TemporalAnchor

每个时间锚点同时保存：

- 原始文本，例如“明天下午”“每周五”“我们认识一周年”。
- 解析后的 UTC 时间范围。
- 解析时区和本地 date key。
- 精度：minute/hour/day/week/month/unknown。
- 类型：point/range/deadline/recurrence/anniversary。
- 来源事件、消息版本、branch、confidence 和 parser version。
- 状态：active/completed/expired/cancelled/superseded。

默认使用设备 IANA 时区；读取失败时回退 `Asia/Shanghai`。时区改变时保留原始语义和解析时区，不静默改写历史事件。

### 7.2 OpenLoop

OpenLoop 表示尚未完成、适合以后自然续接的话题：

- 用户准备做的事或正在等待的结果。
- 用户说“之后再告诉你”的内容。
- assistant 明确答应之后追问或继续处理的事项。
- 双方共同约定的下一步。

状态为 `open/resolved/dismissed/expired/superseded`。每项保存优先级、最早可提及时间、过期时间、提及次数、最后提及回合和 resolution evidence。

V1 默认过期规则：

- 有明确 deadline：在 deadline 后保留 7 天等待结果，之后 expired。
- “等结果”“之后告诉你”等无明确日期事项：30 天后 expired。
- 只有“以后再说”“有空再聊”等弱约定：14 天后 expired。
- recurring anchor 不因单次发生而永久完成，每次 occurrence 单独结算。
- 用户明确完成、取消或拒绝继续时立即 resolved/dismissed，不等待默认期限。

### 7.3 本轮使用规则

- 本轮没有主动消息。OpenLoop 只在用户已经向该角色发送新消息后参与回复仲裁。
- 当前用户请求永远优先；每轮最多选一个 OpenLoop 或时间话题作为可选补充。
- correction/boundary/repair 优先级高于时间锚点和 OpenLoop。
- 同一 OpenLoop 最多主动提及两次；用户未回应后静默至少 7 天，除非用户重新提起。
- 过期计划转成 episode-like event，不继续作为未来事项询问。
- 用户说“别再问这个”时立即 dismissed，并写 boundary event。

## 8. Ackem 式情绪运行时

### 8.1 分离两个概念

不得把“用户可能很难过”和“角色当前表达得更温柔”混为同一个状态：

1. `AffectiveObservation`：对用户当前状态的低置信观察，有 evidence、confidence 和 TTL。
2. `CompanionAffectState`：角色内部连续状态，用于跨轮表达连续性。

用户情绪观察默认 TTL 为 6 小时或 8 个有效回合，先到者为准。强烈但含混的观察不能进入稳定画像。

### 8.2 四维状态

借鉴 Ackem，V1 使用四个内部维度，范围均为 `[-100, 100]`：

| 维度 | 含义 | 对表达的主要影响 |
| --- | --- | --- |
| `affection` | 亲近、在意和温暖方向 | warmth、intimacy、proximity |
| `security` | 当前互动中的安全、确定和稳定 | reassurance、defensiveness |
| `arousal` | 情绪唤醒和表达活跃度 | energy、回复节奏、语气强度 |
| `agency` | 主动推进或退让的倾向 | assertiveness、提问和建议力度 |

状态递推采用 Ackem 的核心结构：

```text
rawDelta = eventStimulus
  * event.intensity
  * event.sincerity
  * relationship.stageWeight
  * relationship.trustMod

cappedDelta = rawDelta * max(0.1, 1 - abs(previousValue) / capDenominator)
next = previous * (1 - decay) + clamp(cappedDelta, perTurnMin, perTurnMax)
```

要求：

- 每个维度单轮变化限幅，默认不超过 8。
- 极值区域使用阻尼，避免连续关键词快速打满。
- 每轮执行轻微衰减，arousal 衰减最快，affection 最慢。
- 未解决 rupture 会抑制正向 security 增长，但不禁止自然修复。
- memory echo 只允许小幅影响本轮状态，四维合计变化不超过 4。
- V1 不加入随机噪声；相同事件序列必须得到相同投影。
- 用户离线时长不降低 affection、security、trust 或关系阶段。

V1 `affect-policy-v1` 默认参数：

```text
capDenominator = 120
capScaleFloor = 0.15
perTurnClamp = [-8, 8]
trustMod = 0.80 + trust / 250            // 0.80 至 1.20
stageWeight = new 0.85, familiar 1.00, trusted 1.10, close 1.15
decay = affection 0.01, security 0.025, arousal 0.12, agency 0.08
memoryEchoPerDimensionClamp = [-1.5, 1.5]
memoryEchoTotalAbsoluteBudget = 4
```

`sincerity` 默认 1；quoted/hypothetical/joke/roleplay 不进入投影；uncertain 若被允许进入观察层则使用 0.25。未解决 rupture 对正向 security delta 乘 0.65，对 affection delta 乘 0.85。

### 8.3 初始事件刺激方向

精确参数集中在版本化 policy 文件中，不散落在 UI 或 Prompt。初始方向如下：

| 事件 | affection | security | arousal | agency |
| --- | ---: | ---: | ---: | ---: |
| praise | +4.0 | +3.0 | +2.0 | -0.5 |
| gratitude | +3.0 | +3.0 | +1.0 | -0.5 |
| playful tease | +2.5 | +1.0 | +4.0 | +2.0 |
| casual | +0.5 | +0.4 | +0.8 | 0 |
| question | +0.5 | +0.5 | +1.5 | 0 |
| vulnerable disclosure | +5.0 | -1.0 | -1.0 | -3.0 |
| celebration / excitement | +4.0 | +3.0 | +5.0 | +1.0 |
| conflict | -5.0 | -6.0 | +5.0 | +3.0 |
| rejection / distance | -3.0 | -5.0 | -1.0 | -2.0 |
| user apology | +3.0 | +5.0 | -2.0 | -2.0 |
| correction | 0 | -1.0 | +1.0 | 0 |
| boundary | 0 | 0 | 0 | -4.0 |
| repair confirmed | +4.0 | +7.0 | -2.0 | 0 |

边界和纠正不是对关系的惩罚。它们改变本轮行为约束，并启动修复流程。

### 8.4 情绪标签

四维状态可以映射为内部标签，例如 calm、warm、quiet_fond、playful、concerned、hurt、defensive、repairing、excited。标签只用于 stance 和诊断，不作为角色必须说出的自我描述。

## 9. Companion Stance

### 9.1 输出字段

`CompanionStance` 是每轮生成策略，不是长期人格：

```ts
interface CompanionStance {
  warmth: 'low' | 'medium' | 'high';
  reassurance: 'none' | 'light' | 'strong';
  energy: 'quiet' | 'steady' | 'lively';
  assertiveness: 'low' | 'medium' | 'high';
  playfulness: 'off' | 'light' | 'on';
  intimacy: 'reserved' | 'familiar' | 'close';
  proximity: 'defensive' | 'neutral' | 'close';
  responseLength: 'short' | 'medium' | 'long';
  primaryIntent: 'answer' | 'comfort' | 'celebrate' | 'repair' | 'listen' | 'clarify';
  optionalTopicId: string | null;
}
```

### 9.2 规划优先级

```text
明确安全与产品边界
> 用户当前请求
> correction / boundary / repair
> 用户当前情绪需要
> 角色卡设定与关系阶段
> 时间锚点 / OpenLoop
> memory echo / 内心 artifact
```

- 每轮只有一个 `primaryIntent` 和最多一个 optional topic。
- 本轮仍输出一个 assistant 消息；不拆多气泡。
- `responseLength` 只给自然语言约束，不强制截断完整代码、表格或资料答案。
- 角色卡可以定义表达上限，但不能覆盖用户当前边界。
- 自动观察置信度不足时回退 neutral stance，不让模型装作确定理解用户情绪。

### 9.3 话题槽仲裁

候选来源包括 current request、repair、affective response、OpenLoop、TemporalAnchor、memory echo、diary/thought/dream。除 current request 外，每轮最多允许一个候选显式进入 Prompt。

每个候选具有 `priority/relevance/urgency/confidence/cooldown/mentionBudget/expiresAt`。仲裁必须确定性排序，并在 trace 中记录胜出和淘汰原因。

V1 候选分数：

```text
score = basePriority
  + relevance * 30
  + urgency * 20
  + confidence * 10
  - cooldownPenalty
  - mentionPenalty
```

`relevance/urgency/confidence` 均为 0 至 1。basePriority 依次为 repair 100、boundary/correction 95、current affect 70、due OpenLoop 55、TemporalAnchor 50、memory echo 35、artifact 30。除 repair/boundary 外，分数低于 60 不进入可选话题。并列时按 evidence 时间更近、event ID 字典序排序，禁止随机选择。

## 10. 关系投影与修复协议

### 10.1 关系状态

借鉴 Ackem 的 L1，使用：

```ts
interface RelationshipProjection {
  stage: 'new' | 'familiar' | 'trusted' | 'close';
  trust: number;
  ruptureCount: number;
  affectionMomentum: number;
  atmosphere: 'warm' | 'neutral' | 'cool' | 'repairing';
  consecutivePositiveTurns: number;
  turnsSinceLastRupture: number;
  sharedEventCount: number;
  unresolvedRepairIds: string[];
}
```

内部数值不在前台展示为好感度、经验条或签到奖励。

### 10.2 角色级基线与分支 overlay

- `role relationship base` 表示同一角色当前已采纳历史中的慢速关系状态。
- `thread/branch overlay` 表示当前线路最近的气氛、情绪与未解决修复。
- Prompt 使用 base 与当前 overlay 合成后的短 stance，不注入完整数值。
- sibling branch 的 overlay 永不互见。
- 分支被采用为主线后，相关稳定关系事件才有资格进入 role base。
- 无角色卡线程只使用 thread projection，不跨线程共享。

### 10.3 阶段变化

- casual turn 只产生极小变化，不能靠刷消息快速进入 close。
- 阶段提升需要 meaningful turns、shared events、trust 和无未解决 repair 共同满足。
- 阶段下降只由持续且未修复的关系事件触发，不由离线时长触发。
- 删除、撤销或切换事件来源后，阶段允许通过重算回退。
- 所有阈值进入版本化 policy，支持离线 replay 调参。

V1 `relationship-policy-v1` 默认值：

```text
initialTrust = 35
perTurnTrustDeltaClamp = [-5, 3]

new -> familiar:
  meaningfulTurns >= 8 AND sharedEventCount >= 3 AND trust >= 42

familiar -> trusted:
  meaningfulTurns >= 20 AND sharedEventCount >= 8 AND trust >= 65
  AND unresolvedRepairCount = 0

trusted -> close:
  meaningfulTurns >= 50 AND sharedEventCount >= 18 AND trust >= 82
  AND recentRelevantTurnsWithoutViolation >= 10

close -> trusted:
  trust < 55 OR unresolvedRuptureCount >= 2

trusted -> familiar:
  trust < 35 OR unresolvedRuptureCount >= 3
```

meaningful turn 指 disclosure、boundary/correction、commitment、repair、明显情绪分享、共同完成事项或双方连续有效交流，不包含纯“嗯/哦”、重复指令、系统消息和失败生成。

关系事件对 trust 的初始变化：praise/gratitude `+0.3`、meaningful disclosure `+1.0`、commitment completed `+2.0`、repair confirmed `+2.5`、ordinary conflict `-1.5`、assistant repeated boundary violation `-5.0`、correction/boundary 本身 `0`、casual `0`。只有 evidence 可见且事件尚未计入 projection 时才应用一次。

### 10.4 修复状态机

```text
detected
  -> constrained
  -> acknowledged
  -> observing
  -> verified

observing -> violated -> constrained
detected/observing -> dismissed（用户明确撤销）
```

处理规则：

1. 当前消息检测到 correction 或 boundary 后，立即生成强约束 segment。
2. 本轮停止使用冲突称呼、语气、话题、亲密表达或记忆。
3. assistant 只做简洁确认，需要澄清时只问一个必要问题。
4. 相关 Memory Claim 同时走现有 correction/supersede 流程，Companion Event 保存关联 claim ID，避免两套事实互相矛盾。
5. 后续三个相关 assistant 回合进入观察期。
6. 本地精确约束和异步语义 verifier 检查是否再次违反。
7. 连续通过后标记 verified；再次违反则 reopen，并提高 repair 优先级。

修复成功的判断依据是后续行为，不是单纯出现“对不起”。

## 11. ContextPlan 与 Prompt Cache

### 11.1 当前需要纠正的边界

现有 `memory_snapshot` 同时包含角色陪伴前缀、自动画像、摘要和稳定记忆。情绪或关系内容若继续进入 `companionMemoryPrefix`，可能频繁改变 `memoryEpoch` 和 `stablePrefixHash`。

V1 必须完成以下迁移：

- Confirmed/Manual Locked 稳定记忆继续留在 `memory_snapshot`。
- 稳定角色设定继续留在 `stable_role`。
- 受控摘要可以留在 `memory_snapshot`，只在 summary frontier 推进时变更。
- 自动用户情绪观察、关系 projection、当前时间、OpenLoop、当前 stance 全部迁入动态层。
- 自动画像中未被用户确认的推断迁入动态 `user_observation`；用户明确确认的偏好继续由 Memory Claim 管理。
- 旧 `buildCompanionMemoryPrefix` 的动态内容由 `CompanionContextCompiler` 接管，不再参与稳定 memory hash。

### 11.2 新增动态层

```text
stable_app_policy             cached
stable_role                   cached
stable_material_rules         cached
stable_tool_definitions       cached
memory_snapshot               cached by memory epoch
-------------------------------- cache boundary
companion_runtime             dynamic, 120-220 tokens
temporal_open_loops           dynamic, only selected candidate
summary_bridge                dynamic only when coverage needs it
dynamic_memory               dynamic
retrieval_context             dynamic
recent_history               dynamic messages
current_user_message          dynamic
```

每个动态 segment 带：

```text
id, type, source, scope, branchRouteHash, trust,
priority, tokenEstimate, version, privacy, expiresAt, traceOnly
```

### 11.3 缓存约束

- Companion projection 更新不得改变 `stablePrefixHash`。
- Companion projection 更新不得递增 memory epoch。
- `companionProjectionVersion` 只进入 generation snapshot、Context Trace 和诊断指标。
- Prompt cache key 保留 role、model、memory epoch、scope、branch 和 generation parameters，不加入当前情绪值或当前时间。
- 动态 segment 始终位于稳定前缀之后，保持 Provider prefix caching 的公共前缀。
- 不把 ISO 时间、UUID、event ID 或 job ID 写入稳定 block。
- 异步事件丰富完成只影响下一轮动态 segment，不重新生成已经完成的回答。

### 11.4 缓存验收

- 连续十轮只有情绪和关系变化时，`stablePrefixHash` 保持不变。
- Confirmed memory、角色卡或 summary frontier 变化时才允许稳定 hash 变化。
- 增加 Companion Runtime 后，缓存 purity warnings 不新增时间或 request ID 警告。
- generation metrics 记录 projection version、event count、stance label、dynamic token 数和稳定 hash 是否变化，不记录 Personal 内容。

## 12. 答案级引用

### 12.1 输出契约

每个进入 Prompt 的检索片段分配本轮稳定引用 ID，例如 `S1`、`S2`。资料区明确要求模型仅在实际依据某片段作答时输出隐藏标记：

```text
[[cite:S1]]
```

标记紧跟受支持句子。模型没有实际使用某片段时不得输出对应 ID。

### 12.2 流式与最终校验

- 流式渲染器缓存不完整的 `[[cite:` 尾部，避免原始控制标记闪烁。
- 完成后解析全部引用 ID，移除控制标记并保存文字位置。
- 只接受本轮 citation registry 中存在的 ID。
- 校验 source/chunk 仍存在、scope 可见、document version/hash 未变化。
- 对答案句和 source excerpt 做本地词面支持度检查；明显无关的引用标记为 invalid 并不展示。
- 模型没有输出引用标记时显示零条引用，禁止回退为“展示所有检索片段”。
- stopped/failed 回复仅保存已经闭合且有效的引用标记。

### 12.3 数据

扩展 citation 记录：`refId`、`claimStart`、`claimEnd`、`sourceExcerptHash`、`documentVersion`、`validationStatus`、`validationReason`、`usedAt`。

V1 的答案级引用证明“模型声明使用且来源仍有效”，不把本地词面检查宣传为完整事实蕴含证明。

## 13. 完整 AI 文件备份与恢复

### 13.1 必须纳入的文件

- `ai_documents` 中的用户文档原文件。
- 存放在 AI 文档目录中的聊天附件。
- `ai_role_avatars` 中的角色头像。
- 现有 originals、thumbnails 和视频原文件继续按原规则备份。
- 日记、事件、投影、锚点、OpenLoop 和 generation jobs 位于 SQLite，随数据库进入备份。
- 应用内置日记主题和字体不重复备份；只保存 theme/font key。

### 13.2 Manifest V2

每个受管文件记录：

```text
logicalId, ownerType, ownerId, category, relativePath,
sha256, size, mimeType, originalUri, required, space
```

- manifest 只保存相对路径，不把本机绝对 URI 当作恢复目标。
- 相同 hash 文件可在备份包内去重，但每个 logical reference 都保留映射。
- 备份完成前逐文件校验 size 和 SHA-256。
- 缺失 required 文件时备份结果必须明确失败或降级，不能报告“完整备份成功”。

### 13.3 恢复流程

```text
读取并校验 manifest
-> 校验包版本、space 与 hash
-> 复制到 staging
-> 分配目标受管 URI
-> 在 SQLite 事务中导入/合并记录并重写 URI
-> 提交事务
-> 清理 staging
-> 打开文档/附件/头像做存在性抽查
```

- 同 logical ID 冲突时按导入会话映射，不覆盖目标侧已有编辑。
- URI 重写失败时回滚数据库导入和本轮已复制文件。
- Personal 明文 staging 只能存在于解锁任务期间，打包后必须清理。
- 恢复报告分别列出数据库记录、成功文件、缺失文件、hash 错误和 URI 重写失败。

### 13.4 验收

- 真机完成“导出 -> 清空/重装 -> 导入 -> 打开聊天文档/附件/角色头像”。
- normal 备份不包含 personal 文件或路径。
- personal 加密备份解密前无法读取 manifest 内容和文件正文。
- 损坏一个文件时恢复明确报告该文件，不让整个数据库处于半导入状态。

## 14. 普通聊天生成恢复

### 14.1 状态机

新增 SQLite generation job/event：

```text
prepared
-> requesting
-> streaming
-> reconciling
-> completed

prepared/requesting/streaming/reconciling
-> recoverable_interrupted
-> retrying | continuing
-> completed | failed | stopped
```

job 保存：

- space、thread、user message、assistant message、generation ID、attempt ID。
- Provider、model、protocol 和不含密钥的参数快照。
- prompt snapshot hash、cache metadata、branch route hash、lineage version。
- partial content、partial reasoning、最后持久化序号和完成原因。
- provider request ID 或 cursor，仅在 Provider 实际提供时保存。
- retry count、lease、heartbeat、lastError 和 timestamps。

### 14.2 写入顺序

1. user message 和 assistant placeholder 落库。
2. generation job 以 `prepared` 落库。
3. Provider 请求发出前改为 `requesting`。
4. 收到首 delta 后改为 `streaming`。
5. delta 按现有合批策略同时更新 message partial 和 job cursor。
6. assistant 最终内容、citation、usage、job terminal state 在可恢复事务顺序中完成。

不得出现 Provider 已请求但数据库没有可定位 job 的窗口。

### 14.3 启动 reconcile

- App 启动、数据库打开和 Personal 解锁后扫描非终态 job。
- lease 未过期时不启动第二个相同 job；过期后单飞接管。
- Provider 支持 request retrieval/resume 时优先恢复原请求。
- Provider 不支持恢复且没有 partial 时，同一 assistant placeholder 自动安全重试一次。
- 已有 partial 时，以持久化正文和最后一段上下文发起 continuation；只追加正文，不重复 reasoning。
- continuation 结果在拼接边界执行重叠去重；无法可靠去重时保留 partial 并转为可见的 recoverable stopped 状态。
- 自动恢复失败后不无限烧调用，默认最多一次 retry 和一次 continuation。
- 页面不必保持打开；进程仍存活时由全局 generation manager 持有任务。

### 14.4 一致性

- 同一个 user message 只能有一个当前 assistant attempt，历史 attempt 作为版本保留。
- 分支、角色或模型设置在中断期间变化时，恢复使用原 request snapshot，不静默换人设。
- API Key 在恢复时重新从 SecureStore 读取，不写进 job。
- Personal 未解锁时不读取正文、不恢复网络请求。
- Provider 可能已经计费但无法恢复输出时，诊断中记录 `remote_outcome_unknown`。

### 14.5 验收

- requesting 前、首 token 前、流式中、最后 delta 后四个强杀点都有确定恢复结果。
- 同一 assistant 不出现重复正文或两个同时运行的任务。
- 断网、429、5xx、无效 key、Provider 切换都有明确终态。
- 恢复后的 message version、citation、usage 和 memory capture 只提交一次。

## 15. Android 语音转文字完善

### 15.1 当前基线

项目已经通过原生 `RecognizerIntent` 完成一次性语音识别，并在聊天页写回输入框。本轮不是重新造 ASR，而是补齐按住说话、设备端优先、取消和能力说明。

### 15.2 V1 行为

- 长按麦克风开始监听，松开结束并转写；滑动取消或点击取消不写入输入框。
- 第一次使用只申请 `RECORD_AUDIO` 最小权限。
- 不需要配置聊天模型、Provider 或 API Key。
- Android 12/API 31 及以上，设备支持时使用 `createOnDeviceSpeechRecognizer`。
- 其他设备使用系统 `SpeechRecognizer` 并设置离线优先选项；设备语音服务是否真正离线由系统实现决定。
- 若设备没有离线语言包或系统识别服务，给出简短错误并保留键盘输入，不自动改用远端聊天模型。
- 识别结果先进入输入框，仍由用户确认发送。
- 取消、超时、无语音、权限拒绝、识别器 busy、Activity 丢失都有独立状态。
- 切后台、离开页面或开始发送消息时停止识别并释放 recognizer。

### 15.3 明确边界

- “设备端可用时离线”可以承诺；低版本或未安装离线语言包的设备不能承诺纯离线。
- 若未来要求所有支持设备保证离线，需要单独引入打包语音模型，例如 Whisper 类实现。本轮不包含。
- 本轮不做 TTS、角色音色、实时对讲、持续 VAD 和锁屏录音。

## 16. 与日记、离线思绪和梦境的集成

- 日记继续使用现有 `companion_diaries` 表和调度，不因本规格迁表。
- Companion Event 可以引用日记、思绪和梦境 artifact，但不能把正文当作用户事实。
- 其他工程合并时，离线思绪和梦境至少提供统一 adapter：`artifactId/kind/roleCardId/sourceThreadId/sourceBranchRoute/sourceEventIds/status/createdAt`。
- 话题仲裁每轮最多选一个 artifact；日记、思绪和梦境不能各自绕过仲裁同时进入 Prompt。
- artifact 被删除或来源 branch 不可见后，相关候选立即失效。
- 日记 context opt-in 继续由用户控制；Companion Runtime 不能绕过该选择读取正文。

## 17. 数据模型增量

建议新增：

1. `companion_events`
2. `companion_projection_snapshots`
3. `companion_affective_observations`
4. `companion_temporal_anchors`
5. `companion_open_loops`
6. `companion_repairs`
7. `companion_runtime_jobs`
8. `ai_generation_jobs`
9. `ai_generation_job_events`

建议扩展：

- `ai_thread_summary_segments`：source message IDs、branch route hash、lineage version、source version hash、quality、status。
- `ai_message_citations`：answer span、source hash、document version 和 validation。

每张 companion 表都必须满足：

- normal/personal 分别创建在各自物理数据库。
- role/thread/branch/source message 外键或稳定引用齐全。
- 高频查询有复合索引，按 role/thread/status/time 检索不做全表扫描。
- event 和 job 有 idempotency key。
- 投影保存 `basedOnEventSequence` 和 `policyVersion`，版本变化时可重建。
- JSON 字段有运行时 schema 校验，解析失败回退重建或明确失败。

## 18. 模块与接入边界

建议新目录：

```text
src/ai/companion/
  companionTypes.ts
  companionEventObserver.ts
  companionEventRepository.ts
  companionEventEnrichmentService.ts
  companionProjectionEngine.ts
  companionAffectPolicy.ts
  companionRelationshipPolicy.ts
  companionStancePlanner.ts
  companionTemporalService.ts
  companionOpenLoopService.ts
  companionRepairService.ts
  companionTopicArbitrator.ts
  companionContextCompiler.ts
  companionMaintenanceQueue.ts
  companionDiagnostics.ts
```

可靠性能力保持独立：

```text
src/ai/context/conversationCoveragePlan.ts
src/ai/citations/answerCitationService.ts
src/ai/generation/generationJobRepository.ts
src/ai/generation/generationRecoveryService.ts
src/services/aiBackupManifestService.ts
src/services/aiBackupRestoreService.ts
src/native/aiSpeechRecognition.ts
```

接入 `aiChatService` 时只允许编排调用，不把 policy 实现写回该大文件。`AiChatScreen` 只订阅状态和渲染，不计算关系、时间或修复。

## 19. 调度、并发与失败处理

- 所有 projection rebuild、enrichment 和 generation recovery job 使用 SQLite lease、attempt count、nextRunAt 和幂等键。
- 同一 `space + role/thread + branch` 的 projection 串行更新，不同角色可并行。
- 快速观察器失败时聊天仍可继续，使用上一版 projection 和 neutral current observation。
- 投影写入失败不允许污染 stable memory；记录诊断并在维护队列重建。
- enrichment 输出无效时 job 失败并退避，不把半解析数据写入事件账本。
- 时间过期使用启动/前台协调和聊天前校验，不做每分钟轮询。
- 本轮没有主动消息，因此时间 job 不请求通知权限，也不在后台生成聊天消息。
- generation recovery 与普通发送共享单飞锁，避免同线程同时启动两个 Provider 请求。

## 20. 用户控制

- AI 设置增加“情感与时间感知”总开关，默认开启；关闭后不新增自动观察，但保留用户显式 correction/boundary 的正常聊天与记忆行为。
- 角色设置可重置该角色关系、情绪、时间锚点和 OpenLoop；重置是追加 reset event 并重建，不直接留下不可审计覆盖。
- 用户可查看并删除时间锚点、OpenLoop 和未完成修复；内部四维数值不直接展示。
- 删除角色时关联 companion 数据按角色删除语义清理。
- 关闭功能不删除历史数据；另提供明确“清除角色感知数据”动作。
- Personal 的诊断默认只记录计数、耗时、版本和状态，不记录正文或 evidence span。

## 21. 评测与测试

### 21.1 纯函数

- 事件否定、引用、玩笑、假设、角色扮演和说话人识别。
- Ackem 式四维递推、限幅、衰减、极值阻尼和 memory echo budget。
- relationship stage、rupture、repair 和 branch overlay。
- 时间相对词、跨年、月末、闰年、时区变化和周期规则。
- topic arbitration 的优先级、cooldown 和每轮单槽限制。
- summary coverage 在任意 history limit 下无空洞。
- citation marker 的流式半标记、非法 ID 和 stopped 内容。

### 21.2 SQLite 集成

- event append -> projection -> reset -> rebuild 得到相同结果。
- sibling branch 事件、锚点、OpenLoop、repair 零串扰。
- 删除 source message/version/thread/role 后投影正确回退。
- job lease 过期接管、幂等重试和 dead task 诊断。
- backup manifest、hash、URI rewrite 和事务回滚。
- generation job 在不同强杀点的 reconcile。

### 21.3 Prompt 与缓存

- 同一角色连续情绪变化不改变 stable prefix hash。
- dynamic companion segment 不进入 memory epoch。
- boundary/correction 当前轮进入动态 Prompt 且优先于 role performance。
- 自动观察没有 evidence 或过期后不注入。
- 当前请求之外最多一个 optional topic。
- 无模型配置时本地观察、时间解析和语音输入仍工作。

### 21.4 Android 真机

- 中低端 Android 上长聊 120 轮的 Prompt 构建耗时和 SQLite 查询。
- 冷启动、后台恢复、进程强杀、飞行模式和 Provider 429/5xx。
- 语音权限拒绝、永久拒绝、设备端识别可用/不可用、取消和切后台。
- 备份、重装、恢复并打开文档、附件和头像。
- Personal 锁定期间不恢复生成、不泄露文件或诊断正文。

## 22. 性能与质量门槛

- Fast Event Observer P95 小于 5ms，不访问网络。
- projection 增量更新 P95 小于 12ms；全量重建放后台并可中断。
- Companion 动态上下文通常不超过 220 tokens。
- 新系统不得增加发送前远端模型调用。
- 纯情绪变化导致的稳定 prefix hash 变更次数为 0。
- summary coverage 漏洞数为 0。
- sibling branch companion event leakage 为 0。
- correction/boundary 下一轮重复违反率进入可观测指标。
- generation recovery 后重复 assistant 消息数为 0。
- 完整备份恢复后受管 AI 文件可打开率为 100%。

## 23. 分阶段交付顺序

### Stage A：连续覆盖与上下文边界

- ConversationCoveragePlan、bridge 和 provisional summary。
- Companion 动态 segment 类型与缓存边界。
- 把动态 `companionMemoryPrefix` 和未确认自动画像移出稳定前缀。

退出条件：所有历史窗口覆盖测试通过，情绪变化不改变 stable hash。

### Stage B：事件、时间与开放回路

- Companion Event schema、observer、repository、jobs 和 trace。
- TemporalAnchor、OpenLoop、过期和单槽仲裁。
- 无模型本地路径和异步丰富器。

退出条件：事件可重算、分支零串扰、OpenLoop 不重复打扰。

### Stage C：情绪、关系与修复

- 四维情绪、relationship base/overlay、stance planner。
- correction/boundary/repair 状态机和后续行为验证。
- 与日记、思绪、梦境 adapter 的统一仲裁。

退出条件：相同事件 replay 结果一致，边界当前轮生效，三轮观察可验证修复。

### Stage D：引用与数据完整性

- 答案级 citation registry、流式解析和最终校验。
- AI 文件 manifest V2、hash、备份、恢复和 URI rewrite。

退出条件：未使用来源不显示，真机完整恢复通过。

### Stage E：生成恢复与语音

- generation job/event、启动 reconcile、续写与去重。
- Android direct SpeechRecognizer、设备端优先和可取消长按输入。

退出条件：四个强杀点恢复明确，设备无聊天模型配置时仍可语音转文字。

## 24. 明确后置登记

### 24.1 多气泡与 ResponsePresentationPlan

**状态：本轮不做。**

恢复条件：Companion Stance、单槽仲裁和 generation recovery 稳定后再设计。未来接入点是 `CompanionStance.responseLength/energy` 和独立 presentation layer。不得让模型通过 `[SPLIT]` 一类脆弱文本直接控制消息数据结构。

### 24.2 记忆 Embedding

**状态：本轮不启用。**

现有 `memoryIndexOutboxService` 继续保持不生成新向量。恢复条件是明确 on-device 或 Provider embedding 来源、模型版本、隐私边界、删除联动、充电/网络策略和真实召回评测。Companion Event 不依赖 Embedding 才能工作。

### 24.3 主动消息与系统通知

**状态：本轮不生成、不调度、不投递。**

OpenLoop 和 TemporalAnchor 只在用户发起正常聊天后参与回复。未来恢复时增加独立 `ProactiveCandidate -> FrequencyPolicy -> Delivery` 三层，不把通知逻辑写入情感投影。首版可采用应用启动时处理候选，不必依赖 Android 后台通知权限。

## 25. Spec 自审记录

### 25.1 占位符检查

- 文档没有 TBD、TODO、“稍后决定”或未定义的必选行为。
- 后置能力均有明确状态、恢复条件和接入点，不会被误判为已实现。

### 25.2 内部一致性检查

- 多气泡在范围表、Stance、交付阶段和后置登记中均明确不做；本轮始终保持单 assistant 消息和单思考区。
- Embedding 不参与事件、情绪、OpenLoop 或检索验收；无模型时本地核心仍可用。
- 主动消息不在任何调度流程中产生；时间锚点只在用户已经发起聊天后进入仲裁。
- 情绪、关系、时间和 OpenLoop 全部处于动态 Prompt 层，不参与 stable hash 或 memory epoch。
- role 级慢状态与 branch overlay 已分开，符合 Pixory 分支模型。
- 日记的用户 context opt-in 不被 Companion Runtime 绕过。
- 语音边界明确为设备端可用时离线，不对所有 Android 设备作无法验证的纯离线承诺。
- generation recovery 明确区分 Provider 原请求恢复、安全重试和 partial continuation，没有假设所有 Provider 支持 cursor。

### 25.3 范围检查

本规格包含九个实现域，不能由一份巨型代码改动交付。后续实施计划必须按 Stage A 至 E 分成五份独立计划，每份都能单独迁移、测试、提交和回滚。Stage B/C 共用 schema 和事件契约，但不得与备份、语音或多气泡混为同一次代码提交。

### 25.4 歧义检查

- 有角色卡时以 role 为长期主体、thread/branch 为即时 overlay；无角色卡时以 thread 为主体。
- OpenLoop 默认不跨 thread 提及。
- 用户离线不扣关系状态。
- 用户边界当前轮生效，不等待异步模型。
- 答案没有有效 citation marker 时显示零来源，不回退展示全部检索片段。
- 自动恢复最多一次 retry 和一次 continuation，不无限调用模型。
- AI 设置中的感知总开关默认开启，但内部数值不前台游戏化展示。

### 25.5 自审结论

规格在数据来源、分支隔离、Prompt 缓存、无模型降级、Android 生命周期、删除恢复和用户控制方面闭环。当前没有阻塞设计决策。进入实施前需要用户评审本文件，然后按 Stage A 至 E 分别编写逐文件实施计划。
