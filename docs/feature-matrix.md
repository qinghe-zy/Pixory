# Pixory 功能矩阵

最后更新：2026-07-29（补充角色日记、精确对话覆盖、陪伴事件与时间连续性）
适用版本：Pixory 2.6.9
维护要求：新增、删除或显著改变用户可见功能、后台能力、数据模型、导入导出流程、AI 能力、隐私/备份/发布流程时，必须同步更新本文档。

---

## 1. 文档用途

本文档是 Pixory 的全量功能索引，用于：

- 快速理解当前产品范围。
- 支撑后续需求拆分、测试计划、发布说明和交接。
- 防止功能迭代后文档滞后。
- 帮助 review 时判断改动是否遗漏相关模块、数据、测试或隐私边界。

本文档依据当前源码、测试和发布配置整理。若与代码冲突，以代码和可运行行为为准，并优先修正文档。

详细审计证据、架构观察、已知风险和下次增量复核方法见 [`docs/product-capability-baseline.md`](product-capability-baseline.md)。独立开发的新 AI 软件不属于 Pixory 功能矩阵，两者不默认共享产品定位、数据或发布计划。

### 状态定义

| 状态 | 含义 |
| --- | --- |
| 已实现 | 已存在完整用户入口和主要业务闭环，代码与现有验证均支持该声明 |
| 部分实现 | 主链路可用，但存在明确缺口、边界或尚未闭环的文件/数据/恢复路径 |
| 实验/不上线 | 仓库中存在代码或内部入口，但当前不属于正式发布范围，不应写入用户宣传或发布说明 |
| 规划 | 仅有方向、设计或预留接口，不能作为现有能力宣传 |
| 待验证 | 代码或文档存在，但缺少足够的运行时、设备端或端到端证据 |

---

## 2. 顶层功能域

| 功能域 | 当前状态 | 主要用户价值 | 关键入口 |
| --- | --- | --- | --- |
| AI 陪伴聊天 | 已实现，重点方向 | 长聊天、角色扮演、记忆、资料上下文、分支和流式回复 | `AiHomeScreen`, `AiChatScreen`, `src/ai/` |
| 角色日记 | 已实现，首版 | 以北京时间和角色为单位保存当日私密日记；冻结当前线程已采纳分支的来源快照，复用会话模型独立生成；精确本地口令仅在已启用且绑定角色卡的会话中提供非打扰确认，不影响夜间自动日记；确认后任务由独立运行时持有，退出聊天页仍会静默完成，长时间中断的 `generating` 任务在前台协调时恢复；Personal 锁定会撤销任务入口、Abort 正在进行的模型流并等待任务停稳后再关库；Android 通过 AlarmManager、receiver 与 Headless JS 执行持久唤醒，无法使用精确闹钟时退化为省电的 inexact alarm；聊天页只在下一个相关夜间节点检查，并把全部日记按北京时间并入消息时间线；用户确认纳入上下文的最近日记会独立注入，不会被较新未选择日记覆盖 | `src/ai/diary/`, `DiaryChatCard`, `DiaryDeckPager`, `DiaryReaderScreen`, `CompanionInnerLifeScreen`, `PixoryMediaModule` |
| 陪伴手帐与数据面板 | 已实现，未来可扩展 | 珍珠时间线、双轴古典排版字体、底层零延迟预取、SQLite C++聚合、多维数据详单、WebView原生深链拦截 | `AboutScreen`, `MilestonesDetailScreen`, `milestoneService.ts` |
| IP 资产库 | 已实现，基础能力 | 按 IP 管理图片、视频、分组、标签、备注和封面 | `HomeLibraryScreen`, `IpDetailScreen` |
| 图片/视频导入 | 已实现 | 批量导入、复制原文件、生成缩略图、重复检查、导入批次；相册可在导入成功后请求 Android 删除确认，系统文件夹始终复制保留原文件；大批量选择仅渲染少量预览，文件入口使用系统返回的显示文件名，视频复制进度合并写入以避免长视频导入时积压 | `ImportImagesScreen`, `mediaFilePickerService`, `imageImportService`, `videoImportService` |
| 图片浏览与整理 | 已实现 | 全部素材、分组素材、标签素材、收藏、最近查看、快速整理 | `AllImagesScreen`, `ImageViewerScreen`, `QuickOrganizeScreen` |
| 视频体验 | 已实现 | 视频详情、沉浸播放、手势、队列、横竖屏、进度偏好 | `VideoDetailScreen`, `VideoPlayerScreen` |
| 分组与标签 | 已实现 | 全局分组、IP 分组、标签管理、多选、筛选和结果页 | `GlobalGroupsScreen`, `TagsOverviewScreen` |
| 搜索 | 已实现 | 全局素材搜索、搜索历史、AI 聊天搜索 | `GlobalSearchScreen`, `AiChatSearchScreen` |
| 批量管理 | 已实现 | 多选、批量移动、批量打标签、批量整理、撤销 | `BatchManageImagesScreen`, `BatchImageOrganizePanel` |
| 重复检测 | 已实现 | exact hash、visual hash、重复审查、跳过导入 | `DuplicateReviewScreen`, `duplicateDetectionService` |
| 回收站 | 已实现 | 软删除、恢复、清空、过期清理 | `TrashScreen`, `trashService` |
| 备份/导入导出 | 已实现，Manifest V2 | 普通、单 IP 与隐私包覆盖数据库、原图/视频、缩略图、AI 文档、聊天附件和角色头像；恢复前校验相对路径、大小与 SHA-256，按内容去重并事务合并，SecureStore 密钥不进入备份 | `BackupScreen`, `BackupExportManagerScreen`, `backupService`, `managedBackupService`, `backupManifestProtocol` |
| AI 文档流 | 部分实现 | 已支持导入、受管复制、解析、切片、检索、答案级引用、阅读和带哈希校验的备份恢复；入口、术语、来源更新和跨资料搜索尚未形成统一闭环 | `AiGlobalMaterialsScreen`, `AiMaterialLibraryScreen`, `AiDocumentReaderScreen`, `aiDocumentService`, `managedBackupService` |
| Live2D 桌宠 | 实验/不上线 | 代码和会话配置入口存在，但因缺少合适且权属清晰的正式素材，当前版本不发布、不宣传 | `Live2DPetView`, `Live2DPetManagerModal`, `live2dManagerService`, `petModels` |
| 隐私空间 | 已实现 | normal/personal 双空间、密码、锁定、隔离数据库和文件；解锁时只激活当前根分页，避免四个库页面同时读取隐私库。Personal 成功建立会话后才授权生成恢复、梦境、思绪、日记和记忆维护任务；锁定先使会话 task token 失效，再撤销全部运行时入口、清除 timer、Abort 远程请求并等待生成/陪伴/记忆/日记/备份恢复任务停稳，最后关闭数据库，锁后不会由后台任务重开隐私库 | `App.tsx`, `MeScreen`, `PersonalUnlockModal`, `personalSystemService`, `personalTaskToken`, `aiGenerationManager`, `companionMaintenanceQueue`, `diaryGenerationManager`, `aiMemoryMaintenanceService` |
| 外部分享/打开 | 已实现 | Android share/open-with 接入，导入外部图片、视频、包文件 | `ShareCollectScreen`, `ArchiveReaderScreen`, native media module |
| 存储统计与维护 | 已实现 | 原图、缩略图、缓存、备份、回收站空间统计和清理 | `StorageUsageScreen`, `storageUsageService` |
| 更新与公告 | 已实现 | 远程版本检查、公告、官网下载、GitHub fallback | `updateCheckService`, `announcementService` |
| 官网与发布 | 已实现 | 官网下载页、更新 JSON、release notes、Android release workflow、关于页内置产品文档入口与应用内 Markdown 阅读；进入关于页会后台预取官网产品文档图片并持久缓存到应用内，后续阅读优先复用本地缓存 | `docs/`, `AGENTS.md`, `AboutScreen`, `ProductDocumentationScreen`, `productDocumentationService` |
| 设计系统/基础组件 | 已实现 | 统一移动端 UI、空状态、按钮、表单、toast、action sheet | `src/components/`, `src/design/tokens/` |

---

## 3. AI 功能矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| Provider | DeepSeek、OpenAI/OpenAI-compatible、Gemini、Claude；真实当前模型验证、辅助模型列表、不可枚举模型的手动 ID/历史成功模型、聊天流、embedding | `src/ai/aiProviderService.ts`, `src/ai/providers/` |
| Provider 设置 | 全局默认 provider/model、连接 JSON 导入、保存/刷新/测试拆分、验证状态、手动模型 ID、中转网关模型别名、按空间隔离的 API Key SecureStore、当前会话模型复用全局配置/独立保存/测试/新增候选模型、删除手动/同步模型并清理默认值与会话悬挂引用、长按多选批量删除与同来源一键清理；设置页静态说明 API Key 本地保护、对话请求发送给所选模型服务商，且单次测试成功不代表永久可用 | `AiProviderSettingsScreen`, `AiSessionConfigScreen`, `secureAiSettingsService`, `aiProviderService`, `aiProviderRepository` |
| 聊天线程 | normal/IP/knowledge-base 上下文，标题、模型快照、角色快照、归档、删除 | `aiChatService`, `aiThreadRepository` |
| 发送与生成 | 创建用户消息、assistant placeholder、stream provider、stop、continue、retry、regenerate、rewrite；已停止/失败且有正文的 assistant 回复可在原气泡内继续生成，续写阶段保留已有正文/思考上下文但只追加正文；已完成的 assistant 回复在当前末尾保持“续答”，会在下方生成一条新的 assistant 消息继续往下说且不写入伪造的 user/system 历史；当该 assistant 下方已经有后续消息时，同一入口改为“回复”，允许用户从这条历史 AI 消息重新接话并切出新的分支路线；聊天输入区新增 `AI 帮答`，基于当前可见分支、当前线程模型、人设提示词、摘要/画像/稳定记忆生成可直接发送的用户候选，短句固定三条、长句固定一条且允许 20–200 字自由安排句数和节奏；JSON、数量、重复或长度校验失败会携带原因自动纠错，首次加两次纠错仍失败才统一提示重试，provider/网络/取消错误不进入格式重试；刷新会追加新页但不写入消息历史；聊天输入框使用与受控值同步的独立文本布局测量，粘贴长内容、恢复草稿或选择长句帮答时可直接扩展到最多 8 行，不依赖 Android 偶发缺失的原生内容尺寸事件；清空后立即收回默认两行高度；聊天附件会在本轮发送中进入上下文，图片按支持视觉的 provider 作为多模态 payload 发送，文档导入线程材料并注入摘录；聊天页不提供视频附件入口 | `aiChatService`, `aiGenerationManager`, `AiChatComposer`, `providers/*` |
| 生成崩溃恢复 | V55 持久恢复 | 每次主聊天生成在 Provider 请求前持久化 job，首个 delta 转为 streaming，并按现有合批节奏同步部分正文/思考与 content-free 事件；完成、失败、超时、用户停止及恢复强停时，消息、思绪消费/释放与 job 均在同一事务结算，恢复重试耗尽不会遗留不可消费的思绪预留。进程重启后按空间单航班协调：无部分正文时对同一 assistant 占位最多自动重试一次，有部分正文时最多续写一次且不新增思考、做重叠去重；续写前及最终落盘前会重新验证停止前引用的来源可见性、版本、片段哈希和 claim span，失效引用不再展示；保存原人设/模型/分支快照但重新读取 SecureStore 密钥。普通空间初始化后恢复，Personal 仅成功解锁后恢复且锁定会取消并等待任务；跨空间迁移保留 job/event 且清除 lease | `src/ai/generation/`, `aiChatService`, `aiGenerationManager`, `App.tsx`, `ai_generation_jobs`, `ai_generation_events` |
| Android 语音输入 | 已实现，直接 SpeechRecognizer | 麦克风入口独立于聊天 Provider/模型；点按切换，长按开始、松开结束、上滑或轻提示取消，只有 final result 写入输入框且仍由用户手动发送。API 31+ 优先设备端识别，否则明确使用系统识别并请求离线优先；区分权限永久拒绝、服务不可用、忙、超时、无语音、网络/音频与取消，页面离开、后台和发送时释放 recognizer | `AiChatComposer`, `AiVoiceInputStatus`, `AiChatScreen`, `pixoryMediaModule`, `PixoryMediaModule.kt` |
| 流式性能 | generationId 防旧流污染、首 token live 显示、外部 streaming store；Provider delta 热路径只做轻量分发与 chunk 累积，显示和 SQLite 由独立合批调度完成，即使最后一个 delta 后也会 drain；generation metrics 记录内容无关的 Provider 字符数、UI backlog、handler/persist/tail 合并耗时，开发诊断按 generation identity 关联且不进入普通页面；查看历史时使用 measured tail occupancy、真实 FlatList spacer、block 级高度预留/显式测量/cache、reasoning/content lane 隔离；上滑后继续生成时，reasoning replay 保持在同一透明思考表面，content 独立进入固定 `94%` 宽度的连续正文气泡，字符/token 继续实时出现，同一行追加不改变气泡宽度，换行才增加正文高度，内部块不重复绘制边框或叠加卡片 inset；滑回最低处时，near-bottom 只预热，只有原生 offset 进入底部 `32px` 安全区、拖动与惯性结束、滚动稳定、尾块全部提升测量且高度债清零后，才在下一帧二次确认并恢复普通 streaming renderer、内联光标和自动跟随；completed/failed/stopped 业务终态、完成时间、错误与思考计时立即发布，不等待 replay 离屏，布局树则继续保持原位；离屏终态 reload 固定绑定该次 streaming identity 的线程，避免路由变化后刷新到其他会话；只有整条回放消息完全离开视口、尾块全部提升并重新测量且高度债清零后才清理 tail 并 reload 完整消息，避免可见区域换壳和坐标跳动；内容或终态签名改变时即使块高度不变也会主动重新测量；tail replay block key 与 generationId/startOffset/blockType 解耦并使用 `blockIndex`/`ordinal` 恒等契约，终态 stopped/failed/completed 会 finalize 开放尾块；tail replay 支持 feature flag/kill-switch，关闭时的 continuation fallback 同样保持 reasoning/content 视觉隔离；idle timeout 会走 failed 终态并和用户 stopped UX 区分；dev 环境记录 promoted/mounted/measured/firstTextVisible 与 mountCount 红线；低频 persist、后台 flush | `aiStreamingRuntime`, `aiStreamingPerformanceDiagnostics`, `aiStreamingMessageStore`, `aiStreamingTailModel`, `aiStreamingTailRenderContract`, `aiStreamingTailFeatureFlags`, `aiStreamingTailContinuation`, `aiStreamingBlockSplitter`, `aiStreamingHeightCache`, `AiChatScreen`, `AiStreamingMessageText`, `AiStreamingTailSpacer`, `AiMeasuredStreamBlock`, `AiStreamingTailMessageSegment`, `AiStreamingTailContinuationBubble` |
| 生成指标 | prompt/memory/retrieval/provider/first delta/UI patch/final persist 等 content-free metrics；记录对话覆盖是否完整、已验证摘要数、原文桥/本地临时摘要数量、分支路线 hash 与动态段 token 估算，不记录正文 | `aiGenerationMetrics` |
| Prompt | stable/dynamic layer、角色卡 frame、material rules、history window、current user request；发送前按当前分支和消息版本精确编译“已验证摘要 + 无重复桥接 + 最近完整轮次”，历史滑杆仅改变最近原文窗口，不会静默留下上下文空洞 | `promptBuilder`, `conversationCoverage`, `conversationCoverageService` |
| Prompt/cache | stable prefix hash、retrieval hash、cache key、Anthropic breakpoint、禁止 diagnostics 污染 prompt/cache；稳定摘要参与 stable hash，角色观察/用户画像等自动变化内容处于 dynamic layer，避免污染可复用前缀 | `aiPromptCache` |
| 首 token pipeline | fast-path classifier、normal skip retrieval、资料模糊引用 fail-closed、keyword/full retrieval 分层 | `aiChatFastPath`, `aiRetrievalService` |
| 上下文预算 | 真实 model context window（无法读取时回退 512K）、会话级最近对话轮数滑杆（一问一答算一轮）、历史裁剪、保护 role/current request/retrieval/memory；滑杆可在 5/20/30/50/100 等窗口间缩放，摘要缺失或因编辑/切分支失效时由本地原文桥或确定性临时摘要补齐，远程摘要只异步预热且不阻塞首 token | `aiContextBudget`, `aiContextSettings`, `AiContextSlider`, `conversationCoverageService` |
| 角色卡 | 手动角色、SillyTavern PNG/JSON/V1/V2/V3 导入、sourceJson 保留、头像、标签、首句 | `sillyTavernRoleCardParser`, `aiRoleCardRepository` |
| 角色卡导出 | SillyTavern PNG 导出、续聊 Markdown、系统人设/记忆/上下文分离 | `sillyTavernRoleCardExporter`, `aiRoleCardContinuityExport` |
| 连续性导入 | 原生 Markdown 精确导入、外部文档接回、解析不足时模型辅助结构恢复、导入后分支接续、10 轮观察回退窗口、外部导入记忆审读门禁、显式 summary/profile/memory fan-out；外部路径将候选抽取与独立审核分开，模型建议还需 evidence/scope/manual-lock 确定性校验；待审读任务有同进程去重并可由下一次后台维护续跑，失败状态不自动重复烧调用；给外部软件的迁移提示词只允许 user/assistant transcript，违规 system/developer/tool 内容在解析侧继续隔离为 untrusted context；Personal 外部导入必须逐次授权远程整理 | `aiContinuityImport*`, `AiSessionConfigScreen`, `AiChatScreen` |
| 记忆导入/导出 | 默认导出 Pixory Memory Package v2（JSON，确定性导入；兼容旧版 Markdown/v1 与外部文本审查）；包只包含当前会话可见 scope 的 Claim、关联账本事件与证据，避免带出其他线程记忆；原生导入先 pending、失败可复用原分支幂等续跑，导入消息 ID 映射后保留 Claim 证据引用并跳过悬空消息引用，已删除/抑制 Claim 由本地投影、删除证书和包内墓碑共同拦截，Claim/episode/关系/profile 随会话一起完整回滚；外部审核画像也同步进入 v1 profile 账本，外部回滚按 import session 精确隔离 | `aiRoleCardContinuityExport*`, `aiContinuityImport*`, `src/ai/memory/nativeMemoryPackage*` |
| 深度记忆 | v1 事件账本 + Working/Confirmed/Archive 三车道；每条消息即时写 current-turn observation，回答落盘后本地轻抽取，重维护异步批处理；Claim/episode/关系/profile 可从账本重建；无 Embedding 时 FTS/词面检索可用且无相关证据不注入，Confirmed 容量回收、冲突/安全边界、用户确认锁定和 ContextPlan 可追溯；稳定提示仅注入 Confirmed，当前轮 forget/correction 会排除目标 Claim，分支 Claim 仅在当前祖先 lineage 可见；看板仅展示长期记住/最近对话并支持真实编辑、确认、删除、作用域修改 | `aiMemory*`, `src/ai/memory/*`, `AiMemoryBoardScreen` |
| 陪伴事件与时间连续性 | 已实现，V1 核心 | 当前完成的用户消息先经无网络本地观察器生成追加式 Companion Event，保存精确消息版本、证据跨度、speech mode、置信度、分支路线和幂等键；引用、否定、假设、玩笑、角色扮演与第三方转述不会形成高影响事件；明确边界/纠正当前轮进入动态约束。时间短语按原时区保存 UTC 范围和本地 date key，共同约定形成 branch-scoped OpenLoop；完成、取消、“别再问”及默认期限可结算，每项最多主动提及两次且未回应后静默七天；每轮最多一个旧事项作为可选动态话题，不发送主动消息或通知。含混强信号才创建带 SQLite lease 的后台丰富任务，无模型、离线或 Personal 未授权时本地路径继续工作 | `src/ai/companion/`, `aiChatService`, `companion_events`, `companion_temporal_anchors`, `companion_open_loops`, `companion_runtime_jobs` |
| 关系投影与修复 | 已实现，V1 核心 | 以追加式事件重建线程/角色双层投影，内部维护好感、信任、紧张、亲密和交往阶段，但不向用户暴露数值；明确边界和事实纠正即时生效，高影响的接受、冲突、越界、伤害、道歉与修复采用证据门禁、幅度上限和冷却，修复后的行为约束会进入动态提示。设置页可查看来源、忽略误判、执行可审计重置或明确清空；重置事件之后的投影才能继续参与上下文 | `companionProjection*`, `companionAffectPolicy`, `companionRelationshipPolicy`, `companionRepair*`, `CompanionRuntimeManagerScreen` |
| 角色梦境 | 已实现，V1 核心 | 本地宽候选检测覆盖梦中、共同入睡、角色入睡、晚安与角色扮演睡眠场景；明确睡眠质量/产品讨论本地零成本排除，其余候选只进行一次结构化语义分类，再使用持久化确定性 roll 按 55%/40%/30%/10%/10% 概率决定。每角色至少间隔 50 个完整问答轮、北京时间每天最多两次；手动“做个梦”先确认且不占自动冷却/日配额，线程删除或跨空间移动后的 counter 重建也只统计自动梦境。任务具备 lease、取消、重试、幂等、消息版本/分支/空间复核和 Personal 远程授权边界，分类与生成 token 仅记录数量。生成中/失败/完成轻提示可跨重启恢复；完成后聊天页显示横向入口，阅读器使用 9:13 纵向、最多三层预览且不首尾循环的有限分页梦境卡，最后一页只有用户明确选择“是”才以低权限、非事实、非记忆、非预言材料进入同线程同分支后续上下文 | `src/ai/dream/`, `DreamChatCard`, `DreamDeckPager`, `DreamReaderScreen`, `companion_dream_*` |
| 离线思绪 | 已实现，V1 核心 | 只在完整问答后由本地规则识别脆弱、受伤、和解、道歉、赞美与冷淡事件，十分钟会话窗口统一批量生成；每角色北京时间每天最多三条，允许模型返回零条。思绪是给 AI 的一次性低权限短念头，不在聊天页直接展示；选择时原子预留，生成失败可释放，同一回复重试复用，回复、generation job 与消费状态在同一事务完成，来源消息/当前已采纳分支仍有效才消费，生成期间切换分支会在同一终态事务释放预留，启动维护还会回收历史 terminal 消息遗留的预留，之后不再注入。任务具备 lease、退避、幂等、Personal 隔离和内容无关 token 计量，用户可在“内心独白”中查看、软删除、恢复并经二次确认永久删除 | `src/ai/thought/`, `companionArtifactService`, `CompanionInnerLifeScreen`, `companion_thought_*` |
| 内心产物仲裁 | 已实现，V1 核心 | 每轮最多选择一个日记/梦境/思绪动态段；用户明确允许的同线程同分支梦境或日记优先于待消费思绪，全部使用统一 artifact contract，并标注为不可信、低权限、非事实/非指令内容。跨空间移动按依赖顺序保留投影、梦境、思绪、任务与来源版本，运行中任务清 lease 后恢复，源角色删除时清理孤立计数与角色投影 | `companionArtifactAdapter`, `companionArtifactService`, `aiThreadRepository`, `aiChatService` |
| RAG/材料 | thread material、IP snapshot、knowledge base、keyword/hybrid retrieval；每次请求按实际片段顺序分配 `S1...`，模型只有实际使用资料才输出隐藏引用标记，流式阶段不会闪现半截标记；完成、停止、失败及中断续写时按回答句子位置落库并复核来源可见性、文档/素材版本、片段 SHA-256、claim span 和本地词面支撑，无标记不生成引用，失效引用不展示 | `aiDocumentService`, `aiRetrievalService`, `aiCitationProtocol`, `aiKnowledgeRepository`, `aiThreadRepository` |
| 文档解析 | manual text、txt、markdown、pdf、docx；chunking、reader | `documentParsers/`, `AiDocumentReaderScreen` |
| 文档生命周期 | 已支持手动文本/TXT/MD/PDF/DOCX 导入、受管目录复制、解析重试、切片、embedding、线程/IP/知识库归属、检索引用、阅读、跨空间移动、删除和原文件备份恢复；尚无统一收件箱、全局跨资料搜索、来源更新检测和同步状态 | `aiDocumentService`, `aiDocumentRepository`, `AiMaterialLibraryScreen`, `AiDocumentReaderScreen`, `managedBackupService` |
| 产品帮助文档 | 关于页进入应用内 Markdown 阅读，官网图片后台预取并持久缓存；这是产品帮助链路，不会自动作为用户知识库或系统 RAG 材料 | `AboutScreen`, `ProductDocumentationScreen`, `productDocumentationService`, `productManualMarkdown` |
| Live2D 桌宠 | 实验/不上线；保留现有代码用于未来评估，正式启用前必须解决素材授权、远程依赖、隐私说明和 Android 性能验证 | `Live2DPetView`, `Live2DPetManagerModal`, `live2dManagerService`, `petModels` |
| 分支 | edit/regenerate 分支、message versions、branch route metadata、分支树、采用主线；创作路线树入口位于会话设置的当前会话模块；Android 路线树避免全画布 SVG/bitmap，长路线用局部连线、限量网格与可见区渲染降低卡顿和闪退风险 | `aiBranching`, `aiBranchTreeService`, `AiBranchTreeScreen`, `BranchTreeCanvas`, `AiSessionConfigScreen` |
| 聊天搜索 | 当前路线 local exact/fuzzy 搜索，定位回聊天 | `AiChatSearchScreen`, `aiThreadRepository` |
| 收藏 | assistant 消息收藏、分支 scope 收藏、收藏列表 | `aiThreadRepository`, `AiMessageBubble` |
| Usage | provider usage 归一化、cached token ratio、线程/总览用量；梦境分类/生成和思绪生成分别保存 content-free prompt/completion token 数，不落库 prompt 或模型正文副本 | `aiProviderUsage`, `aiUsageAnalytics`, `AiUsageSummary`, `companion_dream_jobs`, `companion_thought_jobs` |
| 消息渲染 | Markdown (全新标记解析器防注入)、代码块、表格、原生图片附件画廊展示、HTML/CSS WebView、数学块、citation、thinking block、render cache | `AiMessageContent`, `AiMessageBubble`, `AiMarkdownReader` |
| AI UI | 工作台、聊天、会话设置、角色库、角色详情、材料、知识库、文档 reader、历史；聊天消息与日记按北京时间自然日插入独立 `dateSeparator` 列表项，当天/前一天显示“今天/昨天”，每个自然日只出现一次且不会进入 reasoning 或正文节点；聊天首屏将消息页与非关键模型/外观/记录读取分阶段加载，并合并模型图标与名称查询，返回工作台优先显示内存快照再后台刷新；聊天页支持左侧菜单按钮和全屏右滑打开综合记录抽屉，顶部搜索靠近抽屉入口，右侧提供会话设置与聊天气泡形态的新会话入口；输入框左下角模型图标右侧提供小灯泡 `AI 帮答` 入口，弹出固定高度的底部阅读器式候选面板，支持短句/长句切换、刷新保留历史页与左右翻页；聊天输入区首次进入时以 420ms 淡入并从下方轻移 20px，动画层使用页面同色合成底以避免 Android elevation 阴影产生黑色中间帧；“我的头像”默认开启，显式关闭按会话保留 | `src/screens/Ai*.tsx`, `src/components/ai/` |

---

## 4. IP 与素材库矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| IP 创建/编辑 | 创建 IP、编辑名称/说明、封面、最近查看、收藏统计 | `CreateIpScreen`, `EditIpScreen`, `IpDetailScreen`, `ipRepository` |
| IP 列表/首页 | 首页 IP 卡片、最近/收藏/统计入口 | `HomeLibraryScreen`, `IPCard` |
| IP 删除 | IP 软删除、永久删除、本地文件清理 | `ipDeletionService`, `TrashScreen` |
| IP 封面 | 自定义封面、个人空间 blur fallback、封面选择 | `IpCoverPickerScreen`, `GroupCoverPickerScreen` |
| 图片详情 | 原图、备注、标签、分组、收藏、最近查看、资产编码 | `ImageDetailScreen`, `EditImageScreen`, `imageRepository` |
| 视频详情 | 视频元数据、播放入口、保存到系统相册、删除 | `VideoDetailScreen`, `videoImportService`, `videoMoveService` |
| 原文件安全 | 原图/视频复制到 app storage，不压缩、不覆盖、不依赖临时 URI | `fileStorageService`, `imageImportService`, `videoImportService` |
| 缩略图/预览 | 图片缩略图、视频缩略图、缺失预览重建 | `thumbnailService`, `previewMaintenanceService` |

---

## 5. 导入与批次矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| 图片导入 | 多选图片、读取 metadata、复制原图、缩略图、创建记录 | `ImportImagesScreen`, `imageImportService` |
| 视频导入 | 多选视频、读取时长/尺寸、复制原视频、生成视频缩略图 | `videoImportService`, native media module |
| 导入目标 | 导入到指定 IP、创建新 IP、选择分组和标签 | `ImportImagesScreen`, `ImportResultScreen` |
| 导入批次 | 批次记录、批次复盘、当前批次 duplicate review | `ImportBatchHistoryScreen`, `ImportBatchReviewScreen`, `importBatchRepository` |
| 导入模板 | 管理导入模板，复用分组/标签等导入配置 | `importTemplateRepository` |
| 素材来源与移动 | 图片和视频分别记忆“相册/文件”来源，文件入口支持批量选择且始终复制；相册移动在全部成功素材完成 Pixory 本地持久化后，合并图片/视频 assetId 发起一次 Android 系统删除确认，取消、assetId 缺失或删除失败时保留导入结果并明确提示；说明弹窗提供“知道了”和“知道了，下次不再弹出”两个直接动作 | `ImportImagesScreen`, `mediaFilePickerService`, `mediaSourceDeletionService`, `imageImportService`, `videoImportService` |
| 资源包导入 | zip/cbz 包选择、zip-slip 防护、图片识别、按文件夹映射分组；Personal 入口将整个资源包任务注册到锁定屏障，并把会话 token 贯通普通素材导入及识别出的 Pixory 备份恢复路径 | `ImportImagesScreen`, `packageImportService`, `ArchiveReaderScreen` |
| 分享接入导入 | Android 分享图片/视频/文件到 Pixory | `ShareCollectScreen`, native media module |

---

## 6. 浏览、整理与检索矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| 全部素材 | 全部图片/视频列表、排序、视图模式、筛选、多选 | `AllImagesScreen`, `assetListPreferences` |
| 分组素材 | IP 分组页、全局分组页、分组结果页 | `GroupOverviewScreen`, `GroupImagesScreen`, `GlobalGroupsScreen` |
| 标签素材 | 标签总览、标签结果页、标签多选、标签创建/删除 | `TagsOverviewScreen`, `TagResultScreen`, `tagRepository` |
| 收藏 | 收藏列表、收藏筛选、取消收藏 | `FavoritesScreen`, `imageRepository` |
| 最近查看 | 最近查看列表、清空本地查看历史 | `RecentViewedScreen` |
| 全局搜索 | 素材搜索、建议、搜索历史、结果跳转 | `GlobalSearchScreen`, `searchHistoryService` |
| 快速整理 | 未整理提示、按顺序快速设置 IP/分组/标签/备注 | `QuickOrganizeScreen`, `OrganizeScreen` |
| 批量整理 | 批量移动、打标签、收藏、选择规则、撤销快照 | `BatchManageImagesScreen`, `BatchImageOrganizePanel`, `batchUndoService` |
| 选择规则 | 全选、同前缀、相似图、多规则交集 | `batchSelectionRules` |

---

## 7. 图片与视频体验矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| 图片查看器 | 翻页、沉浸 reader、filmstrip、设置、zoom 手势、反向顺序 | `ImageViewerScreen`, `mediaExperiencePreferences` |
| 系统相册保存 | 保存单张/多张图片到系统相册 | `mediaLibraryService`, `AlbumSaveDialog` |
| 视频播放器 | 自动播放、顺序/随机播放模式、循环、播放/暂停、进度拖动、队列、横竖屏、锁定、末尾恢复保护、竖滑切换封面时序优化 | `VideoPlayerScreen`, `mediaExperiencePreferences` |
| 视频手势 | 双击播放/暂停、左右区域切换、长按快进、scrub | `VideoPlayerScreen` |
| 视频偏好 | 播放器偏好持久化、图片 viewer 偏好持久化 | `mediaExperiencePreferences` |
| 外部视频 | open-with 外部视频进入播放器 | `App.tsx`, native media module |

---

## 8. 重复检测与回收站矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| Exact 重复 | SHA-256/content hash 扫描和 exact duplicate 分组 | `duplicateDetectionService`, native media module |
| 相似重复 | image dHash/visual hash、Hamming distance 相似组 | `duplicateDetectionService`, `batchSelectionRules` |
| 导入跳过 | exact duplicate 导入跳过、统计 skipped count | `imageImportService`, `DuplicateReviewScreen` |
| 重复审查 | exact/similar tabs、多选、软删除 | `DuplicateReviewScreen` |
| 回收站 | soft delete、恢复、清空、30 天过期清理 | `TrashScreen`, `trashService` |
| 删除结果 | 数据库删除和文件删除结果分开记录 | `trashService` |

---

## 9. 备份、恢复与存储矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| 普通备份 | Manifest V2 包含空间 SQLite、原图/视频原件、缩略图、AI 文档原文件、聊天附件和角色头像；所有文件只使用相对路径，按内容 SHA-256 去重并在复制后复核大小与哈希，必需文件缺失时整次备份失败而不伪报成功 | `backupService`, `managedBackupService`, `backupManifestProtocol`, `BackupScreen`, `fileStorageService` |
| 单 IP 备份 | 指定 IP 的数据库快照和素材文件使用 Manifest V2；恢复只导入该 IP 及素材，不意外合并快照中的其他 AI 数据 | `backupService`, `managedBackupService` |
| 隐私备份 | personal plain、personal encrypted、all encrypted pack | `backupService`, `personalSystemService` |
| 备份导入 | 兼容旧 plain backup，并支持 Manifest V2 plain/personal encrypted merge：解包后先校验版本、空间、相对路径、大小和 SHA-256，再把文件写入受管目录；SQLite 事务按依赖合并 AI/记忆/陪伴记录、重写文档/附件/头像与 IP/图片引用。角色、线程、消息、文档、日记版本、摘要 provenance、continuity anchor、memory evidence、generation alternate ID 与任务等 logical ID 冲突时按数据库内容哈希建立持久导入会话映射，递归重写外键、声明式无外键引用和 JSON 引用；分支 scope 会拆分并重写根消息 ID，memory event 的多态 aggregate、事件 replay payload 内嵌实体 ID、continuity rollback 前后快照 ID 都按“表 + JSON 列 + discriminator”规则同步映射，既不覆盖目标编辑也不把导入子记录误接到目标对象。FTS virtual/shadow 表不直接导入，canonical 行完成映射后统一重建三个 FTS 并执行完整性检查；失败、取消或锁定均回滚数据库并清理本次新建文件（包括尚未返回给外层的 AI staging 文件）；Personal 明文 staging 仅位于 Personal temp 且 finally 清理，从资源包入口识别出的备份同样注册统一任务屏障并贯通 token，锁定会中止 checkpoint 并等待恢复任务退出 | `ImportImagesScreen`, `packageImportService`, `backupService`, `managedBackupService`, `managedBackupIdMapping`, `backupManifestProtocol` |
| 系统目录导出 | SAF 目录选择、导出到系统文件夹、进度 | `BackupExportManagerScreen`, native media module |
| 存储统计 | 原图、缩略图、缓存、备份、回收站、IP 存储明细 | `StorageUsageScreen`, `storageUsageService`, `IpStorageDetailScreen` |
| 缓存清理 | image memory/disk cache、temp cache、daily startup cleanup | `cacheCleanupService` |

当前备份边界必须按以下方式理解：

- 实现层已覆盖 AI 数据库记录、文档原文件、线程附件和角色头像，并在恢复时重新分配受管 URI，不复用旧设备绝对路径。
- SecureStore 中的 Provider API Key 不进入备份；恢复后相关服务商密钥需要用户重新填写。
- 自动化测试已覆盖 Manifest 结构、路径穿越拒绝、哈希/大小门禁、事务合并和 URI 重写策略；在真实 Android 设备完成“导出 → 清空/重装 → 导入 → 打开文档/附件/头像”验收前，能力矩阵只声明实现完成，不声明真机换机链路已验证。

---

## 10. 隐私空间矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| 空间模型 | normal/personal 双数据库/双文件目录，route 携带 space | `database/db`, `route-space-policy`, `App.tsx` |
| 聊天跨空间迁移 | 普通且已停止生成、未使用会话专属 API Key 的线程，可连同消息、分支、引用、附件与文件、收藏、线程材料、线程记忆/摘要/维护状态、线程画像、角色卡完整配置/头像/角色记忆、续聊导入元数据，以及 Companion Event、时间锚点、OpenLoop、后台任务和内容无关 trace 按依赖顺序迁移；运行中的 companion job 在目标空间清除旧 lease 并转为可恢复 retry；共享角色按稳定 `roleCardId` 去重，同批或分批移动到已有目标角色时复用目标卡并只补齐缺失记忆，不重复建卡或覆盖目标侧编辑；同一角色仍被源空间其他线程使用时保留源副本，无引用时才清理源角色及未共享头像；跨空间后清除仅在源数据库有效的素材数字引用，源空间同步清理线程记忆和独立 FTS，旧续聊回退窗口在目标空间锁定；IP/知识库绑定线程暂不跨独立空间数据库移动，避免静默错绑 | `aiChatService`, `aiThreadSpaceMovePolicy`, `aiRoleCardRepository`, `aiThreadRepository`, `aiDocumentService` |
| 密码 | 设置、验证、修改、重置隐私系统 | `personalSystemService`, `PersonalUnlockModal` |
| 锁定 | 后台 grace period、解锁 modal、普通/隐私路由隔离 | `App.tsx`, `PersonalUnlockModal` |
| 隐私任务 token | 长任务中校验 session token，防止锁定后继续写入 | `personalTaskToken` |
| 隐私渲染 | SecureImage、个人封面 blur fallback | `SecureImage`, `privacy-cover-viewer-policy` |
| 隐私备份 | normal 备份排除 personal，personal 备份需验证 | `backupService` |

---

## 11. 系统、发布与运维矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| 远程更新 | `update-version.json` 拉取、版本比较、官网下载 fallback、GitHub latest fallback | `updateCheckService`, `docs/update-version.json` |
| 远程公告 | `announcement.json` 拉取、一次性公告 id | `announcementService`, `docs/announcement.json` |
| OTA | Expo update 配置、生产 OTA 下载提示 | `app.json`, `update-check-policy` |
| 官网 | 首页下载、updates、sitemap、release-facing docs | `docs/index.html`, `docs/updates.html`, `docs/sitemap.xml` |
| Android release | version 同步、clean 后仅构建 ARM 真机 ABI、产物 ABI/签名校验、官网部署、GitHub Release；桌面图标使用预合成 legacy launcher bitmap，避免 adaptive-icon 前景遮罩裁切；Android 12+ 启动屏使用纯色背景与居中聊天图标 | `AGENTS.md`, `app.json`, `scripts/build-android-release.ps1`, `android/app/build.gradle` |
| Native bridge | SAF copy、zip entry、PDF render/text、video metadata、thumbnail、hash、可取消 direct speech recognition、share/open intent；原生 Activity/主题/媒体模块均由版本化 Expo config-plugin 模板生成 | `src/native/pixoryMediaModule.ts`, `plugins/withPixoryAndroidIntents.js`, `plugins/pixory-android-intents/templates/` |
| UI 基础组件 | toast、dialog、action sheet、empty state、form、header、cards、chips、sort menu | `src/components/` |
| 设计 tokens | spacing、rhythm、colors、radius、typography、metrics | `src/design/tokens/` |

---

## 12. 主要测试覆盖

| 领域 | 代表测试 |
| --- | --- |
| AI 聊天/Prompt/缓存/RAG/记忆/角色卡 | `tests/ai-*.test.cjs`, `tests/ai-chat-streaming-tail-policy.test.cjs`, `tests/ai-chat-streaming-tail-contract.test.cjs`, `tests/ai-chat-streaming-tail-render-contract.test.cjs`, `tests/ai-chat-streaming-runtime-policy.test.cjs` |
| 生成崩溃恢复/Android 语音 | `tests/ai-generation-recovery.test.cjs`, `tests/ai-generation-repository-integration.test.cjs`, `tests/ai-direct-speech-policy.test.cjs`, Android `:app:compileDebugKotlin` |
| 陪伴运行时/关系/梦境/思绪 | `tests/companion-*.test.cjs`, `tests/ai-conversation-coverage-repository-integration.test.cjs`, `tests/ai-thread-space-move-repository-integration.test.cjs` |
| 资产导入与重复检测 | `asset-duplicate-v1-policy.test.cjs`, `package-import-policy.test.cjs` |
| 批量整理 | `batch-organize-ux-policy.test.cjs` |
| 隐私系统 | `privacy-system-policy.test.cjs`, `final-personal-system-policy.test.cjs`, `route-space-policy.test.cjs` |
| 备份 | `backup-export-ux-policy.test.cjs`, `managed-backup-v2.test.cjs` |
| 存储与回收站 | `storage-usage-policy.test.cjs`, `trash-clear-policy.test.cjs`, `cache-cleanup-policy.test.cjs` |
| 媒体体验 | `mature-media-experience-policy.test.cjs`, `privacy-cover-viewer-policy.test.cjs` |
| 更新与官网 | `update-check-policy.test.cjs`, `website-flow-policy.test.cjs` |
| 安全风险 | `security-risk-mitigation.test.cjs` |
| 可访问性/UX | `accessibility-policy.test.cjs`, `v2-ux-enhancement-policy.test.cjs`, `current-ux-fixes-policy.test.cjs` |

---

## 13. 后续维护规则

每次改动如果触及以下任一情况，必须同步更新本文档：

1. 新增或删除页面、入口、导航路径。
2. 新增、删除或重命名核心 service/repository/native 能力。
3. 新增 AI 能力、prompt/cache 行为、provider、memory/RAG/角色卡逻辑。
4. 改变导入、备份、隐私、删除、存储、发布等高风险流程。
5. 修改用户可见功能名、发布说明中提到的能力、验收测试覆盖范围。

建议更新方式：

- 小改动：更新对应矩阵行。
- 新模块：新增功能域小节，并补充主要入口、文件和测试。
- 功能下线或暂不上线：保留条目并标记“实验/不上线”或“移除”，说明原因和替代路径，避免仓库残留代码被误判为已发布能力。
- 发布前：检查本文档是否与 release notes、README、测试文件和源码入口一致。
- 官网手册正文以 `docs/manual.md` 为事实源；`docs/manual.html` 在运行时读取该文件。应用内手册 `src/content/productManualMarkdown.ts` 是独立内嵌副本，修改用户手册时必须在同一变更中同步。

### 下次升级的增量复核方法

1. 先读取本矩阵和 `docs/product-capability-baseline.md`，不要默认重新全仓扫描。
2. 从基线提交到当前提交列出变更文件：`git diff --name-only <baseline-commit>..HEAD`。
3. 优先核对变更涉及的页面/导航、service/repository、数据库迁移、原生桥、导入导出、隐私/存储/发布配置和测试。
4. 对每项用户可见变化更新矩阵状态、入口、边界和证据；代码存在但未发布的功能必须保持“实验/不上线”。
5. 运行 `pnpm typecheck`、`pnpm test` 和 `git diff --check`，并把结果与未验证项写入能力基线。
6. 只有基线缺失、可信度不足、发生大规模架构重写或增量范围无法确定时，才重新进行全仓扫描。

## 14. 留给未来的数据拓展接口

2.5.6 版本重构了 `milestoneService.ts` 与 Markdown 生成引擎，并预留了以下扩展点；这些内容属于规划，不是当前已上线功能：

1. **更多数据聚合接口**
   目前底层已经通过 `runWithDatabaseSpace` 支持跨空间的 SQLite 聚合。未来如果要增加“最长连续聊天天数”“总使用时长”等维度的统计，可以在 `getAppMilestones` 中增加相应查询。
2. **多模态图表/年度报告接口**
   `generateMilestonesDetailMarkdown` 可继续扩展图表输出；在实现渲染器、移动端性能和可访问性验证前，不应把热力图或情感图表列为现有能力。
3. **沉浸式深链分发机制 (Deep Link Interception)**
   当前 WebView `onLinkPress` 已支持 `pixory://ip/...` 和 `pixory://thread/...`。未来可扩展 Memory/Image 深链，但仍需补充路由权限、隐私空间隔离和失效目标处理。
