# Pixory Companion Runtime V1 交接说明

> 用途：交给一个不了解此前聊天上下文的新 Codex 窗口。
> 仓库：`D:\Project\Pixory\pixory`
> 当前总规格：`docs/ai-chat-research/pixory-companion-runtime-v1-spec.md`
> 初始运行时规格提交：`b0dddd3 docs: specify companion cognitive runtime`（当前内容以后续总规格提交为准）
> 交接日期：2026-07-29

## 1. 新窗口应先做什么

按以下顺序开始，不需要重新进行产品方向讨论：

1. 读取仓库根目录 `AGENTS.md`，以当前文件为项目规则事实源。
2. 完整读取 `docs/ai-chat-research/pixory-companion-runtime-v1-spec.md`。
3. 读取本交接说明，确认并行工作、明确后置项和共享工作区状态。
4. 读取 `docs/feature-matrix.md` 与 `docs/product-capability-baseline.md`，但以当前源码和主规格为准；旧基线中部分记忆缺陷已经修复。
5. 检查 `git status --short --branch`，不得覆盖、回退或顺手提交其他工程的工作。
6. 先为 Stage A 编写独立实施计划，再开始代码；后续 Stage B 至 E 分别制定计划、实施、验证和提交。

交接后不应直接一次性修改全部子系统，也不应把情感逻辑继续堆进 `AiChatScreen.tsx` 或 `aiChatService.ts`。

## 2. 用户真正想要什么

Pixory 当前以 Android-first 的陪伴式 AI 聊天为中心。用户希望吸收 Ackem 在事件解释、连续情绪、关系演化、时间感、心理姿态和话题仲裁上的强项，使角色更完整、更生动、更有持续感。

用户的明确要求：

- 情感系统要充分参考 Ackem，不能只做一个浅层“好感度计算”。
- Ackem 设计成熟的部分应积极借鉴，避免因为 Pixory 自己设计不完整而漏掉关键机制。
- 不在前台展示好感度或亲密度数字；内部连续状态可以存在。
- 不要把此前研究报告中的“欺骗与操控风险”讨论当成本轮阻塞项。保持基本用户控制和数据边界即可，不要重新扩大这场讨论。
- 设计和实现必须照顾当前 Prompt 上下文注入与 Provider 前缀缓存命中率。
- Android 仍然优先，但旧的“必须纯 Expo managed”“绝不允许服务端”等历史约束不能阻挡合理架构；本轮仍以本地 SQLite 和现有 Provider 为主。
- 先完成可靠性与认知运行时，再考虑多气泡、Embedding 和主动消息。

## 3. 此前讨论如何演进

最初把工作分为三轮：

1. 角色内在生活：日记、离线思绪、梦境。
2. 多气泡、思考显示和回复时间。
3. 情感与感知系统。

当前状态已经调整：

- 角色日记已经实现并经过多轮 review、修复和性能加固。
- 离线思绪与梦境的独立产品设计已完成，并已完整并入当前总规格；当前接手任务负责代码闭环。
- 多气泡和 `ResponsePresentationPlan` 暂时不做。
- 本窗口负责认知运行时、上下文连续覆盖和剩余可靠性能力。
- 记忆 Embedding 暂时不启用。
- 主动消息与 Android 系统通知暂时不做。

因此本工作不是原“第二轮多气泡”，而是：摘要正确性 + 第三轮认知运行时 + 引用/备份/恢复/语音补全。

## 4. 已完成和并行中的工作

### 4.1 已完成：角色日记

代表提交：

- `0d74e59 feat: add role diary companion experience`
- `7bf82bf fix: keep role diary state scoped to active thread`
- `e3857e2 fix: harden diary runtime and chat performance`

日记当前具备：

- 角色与北京时间自然日作用域。
- 当前 thread/branch/message version 来源快照。
- 手动口令确认与夜间自动生成。
- 独立生成上下文，不污染普通聊天 history。
- SQLite job、版本、状态和 context opt-in。
- 退出聊天页面后由全局任务继续生成。
- Android AlarmManager、receiver、Headless JS 持久唤醒与前台补偿。
- 聊天时间线卡片、独立信纸阅读页和“内心独白”入口。
- 聊天首屏和工作台最近聊天性能优化。

不要重写日记数据表或调度。认知运行时只能通过 adapter 和 event reference 与日记集成，并继续尊重日记 `contextOptIn`。

### 4.2 已完成设计、待实现：离线思绪与梦境

角色梦境和离线思绪已分别完成设计，并合并进总规格第 16 节。当前基线没有对应产品代码；开始每一个 Stage 前仍要重新检查工作区和最近提交，防止其他工程在共享 main 合入同名 artifact、screen、schema、prompt、job 或测试文件。

梦境独立设计提交为 `4788ab9 docs: define role dream experience`，离线思绪独立设计提交为 `f98e0f2 docs: define role offline thoughts`。两份设计的完整约束现已统一进入总规格；独立文档保留为设计审计记录，不再与总规格竞争事实源。

实现要求：

- 最少提供统一 adapter：`artifactId/kind/roleCardId/sourceThreadId/sourceBranchRoute/sourceEventIds/status/createdAt`。
- 每轮最多只有日记、思绪、梦境中的一项进入话题仲裁。
- 不要为整合目的覆盖其他工程正在写的文档或代码。

## 5. 当前必须完成的范围

所有详细契约、阈值、状态机和验收要求都在主规格。实现范围是：

1. 修复 31 至 50 轮以及用户缩小 history limit 后的摘要覆盖空洞。
2. `ConversationCoveragePlan`、raw bridge 和 provisional local summary。
3. `CompanionEvent` 追加式事件账本、快速本地观察器和异步丰富任务。
4. `TemporalAnchor`、周期事件和 `OpenLoop`。
5. Ackem 式四维情绪：affection、security、arousal、agency。
6. `CompanionStance`：warmth、reassurance、energy、assertiveness、playfulness、intimacy、proximity、response length 和 primary intent。
7. 关系 role base + thread/branch overlay、阶段演化、rupture 和修复协议。
8. correction/boundary 当前轮生效，后续行为观察与 verified repair。
9. 单槽话题仲裁：每轮最多一个可选旧话题或 artifact。
10. 动态 ContextPlan segment 与 Prompt Cache 边界修正。
11. 答案级 citation marker、流式隐藏、最终验证和只保存实际使用来源。
12. AI 文档、聊天附件、角色头像的 manifest/hash/URI rewrite 完整备份恢复。
13. SQLite generation job/event、启动 reconcile、安全 retry/continuation 和重复防护。
14. 完善 Android 系统语音转文字：按住说话、设备端优先、取消和释放生命周期。

## 6. 明确不做的内容

### 6.1 多气泡与 ResponsePresentationPlan

本轮保持：一个 assistant 回合、一个思考区、一个正文消息。

不要：

- 让模型输出 `[SPLIT]`。
- 新增多 bubble schema。
- 做随机打字延迟或 wave generation。
- 借情绪系统顺手实现回复拆分。

未来接入点已在主规格 24.1 标注。

### 6.2 记忆 Embedding

本轮继续使用 FTS/词面召回。现有 `memoryIndexOutboxService` 只保持索引一致性，不生成新向量。

不要：

- 接入新的 embedding Provider。
- 下载本地 embedding 模型。
- 修改召回权重假装 semantic score 已可用。

未来恢复条件见主规格 24.2。

### 6.3 主动消息与通知

本轮不生成、不调度、不投递主动消息，也不申请通知权限。

OpenLoop 和 TemporalAnchor 只能在用户已经向角色发送新消息后参与当前回复。不要把情绪变化直接接到 Android 通知或后台消息。

未来恢复时使用独立 `ProactiveCandidate -> FrequencyPolicy -> Delivery` 三层，见主规格 24.3。

## 7. 最关键的技术决策

### 7.1 使用事件账本和可重算投影

采用：

```text
Fast Event Observer
-> CompanionEvent ledger
-> Projection Engine
-> Stance Planner
-> Dynamic Context Segment
```

不要采用：

- 把所有情绪和关系写成 Memory Claim。
- 每轮覆盖一行不可追溯的 JSON 状态。
- 当前轮前置调用另一个远端模型做情感分析。
- 在 React component 中维护长期情绪状态。

本地观察器负责当前轮立即可用信号，异步模型丰富器只影响后续轮次。

### 7.2 Ackem L0 至 L3 映射

- L0：事件 type、intensity、sincerity、speech mode 和 evidence。
- L1：stage、trust、rupture、affection momentum、atmosphere、positive streak、shared events。
- L2：affection/security/arousal/agency，带衰减、单轮限幅、极值阻尼和 memory echo budget。
- L3：CompanionStance、修复约束、长度倾向和单槽话题仲裁。
- Trace：每轮记录 L0/L1/L2/L3 的版本、结果和候选淘汰原因。

与 Ackem 不同，Pixory 状态必须持久化、可重算、branch-aware、space-isolated；不使用模块级随机计数器。

### 7.3 关系作用域

- 有角色卡：长期主体是 `space + roleCardId`，当前气氛和情绪是 thread/branch overlay。
- 无角色卡：主体退化为 `space + threadId`，不跨线程共享。
- sibling branch 事件不可互见。
- 废弃 branch 事件不能进入 role base。
- 用户离线时长不扣 trust、affection、security 或关系阶段。
- 内部数值不显示为前台好感度条。

### 7.4 correction 与 boundary

“你记错了”“别这样叫我”“这个话题别再提”等强确定性事件必须当前轮生效：

```text
detect
-> constrain current stance/context
-> concise acknowledgement
-> link/supersede conflicting memory claim
-> observe next relevant assistant turns
-> verified or reopen
```

修复成功看后续行为，不只看是否输出“对不起”。

## 8. Prompt Cache 红线

这是用户特别强调的部分。

当前 `promptBuilder.ts` 的 `memory_snapshot` 包含 `companionMemoryPrefix`、自动画像、摘要和稳定记忆。当前 `aiChatService.ts` 计算的 `memoryEpoch` 也包含陪伴前缀 hash。若直接把每轮情绪和关系放进去，会频繁改变 `stablePrefixHash`，降低 Provider prefix cache 命中。

必须执行：

- stable role、stable rules、Confirmed/Manual Locked memory 保持在稳定前缀。
- summary 只在 frontier 推进时改变稳定 snapshot。
- 当前情绪、关系 projection、时间、OpenLoop、stance 和未确认画像放到新的动态 segment。
- 旧 `buildCompanionMemoryPrefix` 的动态关系内容迁出 `memory_snapshot`。
- `companionProjectionVersion` 只进入 trace 和 generation snapshot，不进入 memory epoch 或 stable hash。
- 当前时间、event ID、job ID、request ID 不进入稳定 block。
- Companion 动态上下文通常控制在 120 至 220 tokens。

验收硬指标：连续十轮只有情绪/关系变化时，`stablePrefixHash` 必须保持不变。

## 9. 当前代码事实，不要被旧文档误导

### 9.1 已修复的旧问题

以下研究报告中的问题已有后续修复，不要重复实现：

- stable prompt memory 已 confirmed-only。
- current-turn forget/correction exclusion 已存在。
- branch Claim 只允许当前 ancestor lineage 可见。
- Memory ContextPlan 已接入主聊天链路。
- memory outbox 已有确定性消费者，但 Embedding 仍明确禁用。
- 日记生成和聊天入口性能已加固。

代表提交：`b66eb6a fix: harden memory consistency and native import`、`e3857e2 fix: harden diary runtime and chat performance`。

### 9.2 仍然存在的真实缺口

- `aiContextSettings.ts` 默认 history 30 轮。
- `aiMemorySummaryService.ts` 仍使用 `UNCOMPRESSED_ROUND_THRESHOLD = 50`。
- 当前没有跨 summary/recent/bridge 的覆盖不变量。
- `memoryIndexOutboxService.ts` 明确写着 V1 Embedding disabled，只删除旧向量。
- `CompanionInnerLifeScreen.tsx` 的 thought/dream 当前基线仍是占位，但并行工程可能正在改。
- citation 在 `aiChatService.ts` 完成时仍由所有 surviving snippets 直接生成，而不是模型实际使用项。
- `backupService.ts` 只完整复制数据库、originals 和 thumbnails，未复制 AI documents、attachments、role avatars。
- `aiGenerationManager.ts` 使用进程内 Map；普通聊天进程死亡后没有可恢复 Provider job。
- 语音已有一次性 `RecognizerIntent`，不是从零开始；当前未实现 direct `SpeechRecognizer` 的按住、松开、取消和 on-device 优先。

## 10. Ackem 参考入口

研究仓库：`D:\Project\pixory_research\projects\Ackem`

优先阅读：

- `src/main/engine/types.ts`：L0-L3、Event、L1State、Emotion4D、ExpressionParams、trace。
- `src/main/engine/interpreter.ts`：本地事件解释和强弱信号。
- `src/main/engine/relationship.ts`：trust、rift、momentum、atmosphere 和 stage 演化。
- `src/main/engine/emotion.ts`：四维刺激、调制、限幅、衰减、极值阻尼、标签和 memory echo。
- `src/main/engine/psyche.ts`：状态到表达姿态的编译。
- `src/main/engine/orchestrator.ts`：整轮编排、状态、trace 和话题选择。
- `src/main/engine/strategy/topicSelector.ts`：多来源话题仲裁。
- `src/main/engine/temporalAwareness/`：特殊日期、时间深度和 temporal memory bridge。
- `src/main/engine/emotionalEmergence.ts`：长聊中阶段性情绪主题。
- `src/main/engine/reunion.ts`：离线间隔与重逢表达，仅借鉴时间感，不采用离线扣关系状态。

借鉴机制，不要把 Ackem 的 Electron/内存状态、桌面 scheduler、全局 session scope 或 `[SPLIT]` 多气泡实现直接搬进 Pixory。

## 11. Pixory 关键代码入口

### 上下文、缓存与聊天

- `src/ai/aiContextSettings.ts`
- `src/ai/aiContextBudget.ts`
- `src/ai/aiMemorySummaryService.ts`
- `src/ai/promptBuilder.ts`
- `src/ai/aiPromptCache.ts`
- `src/ai/aiChatService.ts`
- `src/ai/aiGenerationManager.ts`

### 记忆与分支

- `src/ai/memory/memoryContextPlanService.ts`
- `src/ai/memory/memoryRetrievalService.ts`
- `src/ai/memory/memoryFacade.ts`
- `src/ai/memory/localFastExtractor.ts`
- `src/database/repositories/aiThreadRepository.ts`
- `src/database/schema.ts`

### 日记与内心入口

- `src/ai/diary/`
- `src/screens/CompanionInnerLifeScreen.tsx`
- `src/components/ai/DiaryChatCard.tsx`
- `src/components/ai/DiaryDeckPager.tsx`

### 引用、备份、语音与原生插件

- `src/components/ai/AiCitationList.tsx`
- `src/services/backupService.ts`
- `src/native/pixoryMediaModule.ts`
- `plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt`
- `plugins/withPixoryAndroidIntents.js`

Android 原生源码目录可能被 `.gitignore` 忽略。持久修改必须落在版本化 Expo plugin templates，并通过 `expo prebuild` 验证生成结果。

## 12. 实施顺序

### Stage A：连续覆盖与缓存边界

先做：

- `ConversationCoveragePlan`
- raw history bridge
- provisional local summary
- summary source/version/branch metadata
- dynamic companion context layer
- 动态 `companionMemoryPrefix`/未确认画像迁出 stable prefix

退出条件：所有 history limit 无空洞，情绪变化不会改变 stable hash。

### Stage B：事件、时间与 OpenLoop

- schema、repository、local observer、idempotency、branch visibility
- TemporalAnchor 和 OpenLoop
- persisted enrichment job
- topic candidate contract 和单槽仲裁

退出条件：事件可 replay 重建，branch 零串扰，无模型配置仍能工作。

### Stage C：情绪、关系与修复

- affect policy v1
- relationship policy v1
- role base + branch overlay
- stance planner/context compiler
- correction/boundary/repair verifier
- artifact adapter 与统一仲裁

退出条件：相同事件序列得到相同 projection，边界当前轮生效，修复以后续行为验证。

### Stage D：答案级引用与完整备份

- citation registry/marker/stream parser/final validation
- AI file manifest V2、hash、relative path、restore URI rewrite

退出条件：未使用来源不显示，真机恢复后文档、附件和头像全部可打开。

### Stage E：生成恢复与语音

- persisted generation jobs/events
- startup reconcile、resume/retry/continuation、overlap dedupe
- direct Android SpeechRecognizer、on-device 优先、hold/release/cancel

退出条件：四类强杀点结果明确，无重复 assistant；无聊天模型配置时语音仍可转文字。

## 13. 共享工作区和 Git 注意事项

交接编写期间，另一个工程直接把 `4788ab9 docs: define role dream experience` 提交到了共享 `main`，证明分支状态会实时变化。不要依赖本文件记录的 ahead 数量或假设 HEAD 固定不动。

最近一次检查时仍存在与本工作无关的修改或未跟踪文件：

```text
M  android/app/src/main/res/values/strings.xml
M  app.json
M  pnpm-lock.yaml
?? c7f15cd8-c699-4b38-be4f-d96695f6d236.png
?? docs/superpowers/plans/2026-07-29-android-icon-and-splash-implementation.md
?? tests/android-icon-splash-policy.test.cjs
```

这些属于图标、启动页或其他并行工作，不得回退、覆盖或混入认知运行时提交。该清单只是交接时快照，实际开始时状态可能已经变化，必须重新检查。

工作规则：

- 每个 Stage 单独计划、单独提交。
- 只暂存本 Stage 文件。
- 遇到已被其他工程修改的同一文件，先完整读取当前内容并以当前版本为基础合并。
- 不使用 `git reset --hard`、`git checkout --` 或其他破坏性回退。
- 不自动 push，除非用户明确要求。
- 用户可见功能、schema、native bridge、备份或 AI 能力变化时同步更新 `docs/feature-matrix.md`。

## 14. 计划和代码要求

- 主规格已经完成产品设计，不需要再次从零 brainstorm。
- 因范围较大，必须为 Stage A 至 E 分别创建实施计划。
- 实施计划要写清精确文件、迁移、函数接口、测试和回滚点。
- 每个行为改动先写失败测试，再实现最小代码，再跑针对性测试。
- 不在一个提交中同时做 schema 大迁移、UI 重构、备份、语音和生成恢复。
- policy 参数集中到版本化文件，不散落 magic number。
- 数据结构先稳定，再接 Prompt 和 UI。
- 情感系统不依赖 Embedding。
- 快速观察器不进行前置远端模型调用。

## 15. 每个 Stage 的验证

至少执行：

```powershell
pnpm typecheck
pnpm test
git diff --check
```

按能力增加：

- SQLite 集成测试：迁移、event replay、branch visibility、lease、恢复。
- Prompt/cache 测试：stable hash、memory epoch、dynamic segment、token budget。
- Android 原生改动：`npx expo prebuild --platform android --no-install` 后编译 Kotlin。
- 备份：真机导出、清空/重装、恢复、打开文档/附件/头像。
- 生成恢复：requesting 前、首 token 前、streaming 中、最后 delta 后强杀。
- 语音：权限拒绝、on-device 可用/不可用、取消、切后台和无语音。

不要把源码正则 policy test 当作真机、SQLite 或 Provider 行为验证的替代品。

## 16. 交付物要求

每个 Stage 完成时报告：

- 改了什么、为什么。
- 影响的 schema、service、UI、native 和文档。
- 新增测试与完整测试结果。
- 缓存命中边界是否变化。
- normal/personal 和 branch 隔离验证。
- Android 真机或模拟器未验证项。
- 未包含的并行工作和未提交文件。
- 对应 commit ID。

## 17. 可直接发给新窗口的指令

```text
请接手 D:\Project\Pixory\pixory 的 Companion Runtime V1 工作。

先完整读取：
1. 仓库根目录 AGENTS.md
2. docs/ai-chat-research/pixory-companion-runtime-v1-handoff.md
3. docs/ai-chat-research/pixory-companion-runtime-v1-spec.md
4. docs/feature-matrix.md

初始运行时规格提交是 b0dddd3，梦境设计提交是 4788ab9，思绪设计提交是 f98e0f2；当前产品范围以工作区内总规格最新版本为准。产品范围与架构已确认，不要重新从零讨论。当前明确不做多气泡/ResponsePresentationPlan、不启用记忆 Embedding、不做主动消息和系统通知。

情感系统要充分参考 Ackem：D:\Project\pixory_research\projects\Ackem，重点查看 engine/types.ts、interpreter.ts、relationship.ts、emotion.ts、psyche.ts、orchestrator.ts、strategy/topicSelector.ts 和 temporalAwareness。借鉴其 L0-L3、连续四维情绪、关系状态、衰减限幅、memory echo 和话题仲裁，但必须按 Pixory 的 SQLite、space、role、thread、branch 和可恢复任务架构独立实现。

先从 Stage A 开始：修复 31-50 轮摘要空洞，建立 ConversationCoveragePlan、history bridge/provisional summary，并把每轮变化的陪伴状态移出稳定 Prompt 前缀，确保连续情绪变化不改变 stablePrefixHash。先写 Stage A 实施计划，再按 TDD 实施、验证和独立提交；随后依次对 Stage B、C、D、E 重复“计划 → TDD → 集中 review → 完整验证 → 独立提交”，不得跨阶段混写。Stage C 必须按总规格完整交付梦境和离线思绪，而不是只留 adapter。

工作区有其他工程并行改动。开始前检查 git status，绝对不要回退或提交无关文件。每个用户可见功能、schema、native bridge、备份或 AI 能力变化都要同步 docs/feature-matrix.md。验证至少包含 pnpm typecheck、pnpm test、git diff --check；原生改动还需 expo prebuild 和 Kotlin 编译。
```

## 18. 交接完成判定

新窗口只要能回答以下问题，就具备开始 Stage A 的完整上下文：

1. 为什么情绪和关系不能继续放在 stable `memory_snapshot`？
2. 31 至 50 轮空洞是如何产生的，coverage invariant 是什么？
3. Companion Event 与 Memory Claim 有什么区别？
4. role base 和 thread/branch overlay 如何隔离？
5. Ackem L0-L3 分别映射到 Pixory 哪些模块？
6. 为什么本轮不做多气泡、Embedding 和主动消息？
7. 当前语音、citation、备份和 generation manager 已经做到哪里？
8. 哪些工作区文件属于其他工程，不能碰？

上述答案都能从本交接说明和主规格直接找到，不需要依赖原聊天记录。
