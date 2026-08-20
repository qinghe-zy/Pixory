# Pixory 功能矩阵

最后更新：2026-08-20（媒体阅读器、聊天入口、SQLite/cache 与极端导入性能加固）
适用版本：Pixory 2.8.1
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
| 角色日记 | 已实现，首版 | 以北京时间和角色为单位保存当日私密日记；手动、自动和后台唤醒均通过同一准备链路冻结当前已采纳分支、角色提示、线程摘要和来源消息，持久 wake 真正到期时会重新解析用户此刻采用的分支，再创建不可变生成快照。内容优先使用今日完整问答，不足时从历史补齐到最近 30 个完整轮次，并为消息附北京时间；模型会明确区分“今日证据”和“历史背景”，无证据时不得虚构。自动日记由应用初始化/回前台统一协调，Personal 仅在已解锁且任务令牌有效时运行；精确本地口令仅在已启用且绑定角色卡的会话中提供非打扰确认。任务由独立运行时持有，退出聊天页仍会完成，长时间中断的 `generating` 任务在前台恢复；Android 通过 AlarmManager、receiver 与带低打扰系统常驻提示的短时 `dataSync` 前台服务启动 Headless JS，无法使用精确闹钟时退化为 inexact alarm，若系统仍拒绝后台启动则保留 SQLite 任务并在下次前台协调时恢复。完成卡片保存冻结来源版本及有效消息哈希，始终锚定在对应触发消息之后，刷新、分页和重进页面不漂到列表底部；用户确认纳入上下文的最近日记会独立注入，不会被较新未选择日记覆盖 | `src/ai/diary/`, `DiaryChatCard`, `DiaryDeckPager`, `DiaryReaderScreen`, `CompanionInnerLifeScreen`, `PixoryMediaModule` |
| 陪伴内心运行时（情绪、梦境、思绪） | 已实现，V1 核心 | 情绪/关系投影、角色梦境、离线思绪、内心产物仲裁和后台恢复均已进入主分支；思绪是给 AI 的低权限一次性动态材料，梦境只有用户明确允许才可进入后续上下文，情绪与关系状态不直接暴露内部数值 | `src/ai/companion/`, `src/ai/dream/`, `src/ai/thought/`, `CompanionInnerLifeScreen`, `CompanionRuntimeManagerScreen`, `DreamReaderScreen` |
| 陪伴手帐与数据面板 | 已实现，未来可扩展 | 珍珠时间线、双轴古典排版字体、底层零延迟预取、SQLite C++聚合、多维数据详单、WebView原生深链拦截 | `AboutScreen`, `MilestonesDetailScreen`, `milestoneService.ts` |
| IP 资产库 | 已实现，基础能力 | 按 IP 管理图片、视频、分组、标签、备注和封面；首页、分组和标签总览采用 SQLite 分页与虚拟列表，IP 详情分组预览在数据库层限制为 4 条；首页冷启动只显示 1 个与真实卡片共用宽高/radius token 的 skeleton 并叠加 shimmer，不再显示“正在读取本地资产库”提示；IPCard 列表热路径已移除传感器/超大镜面高光，首卡与后续卡使用同一轻量渲染路径；仅首卡使用 high priority 与 0ms transition，其他卡 normal + 120ms，减少第二卡先显示、首卡后闪 | `HomeLibraryScreen`, `IPCard`, `IPCardSkeleton`, `IpDetailScreen`, `GroupOverviewScreen`, `GlobalGroupsScreen`, `TagsOverviewScreen` |
| 创意视觉动效与反馈 | 已实现，按性能门禁收敛 | 边缘极光入场（ParallaxLightSweep）、AI 档案行星与星轨系统（OrbitalSpectralRing）、聊天声纹频谱反馈（RhythmBars）、磁性流体拉伸交互（MagneticLiquidContainer）继续用于非列表热路径；ParallaxLightSweep 在不可见或应用后台时取消循环。原 3D 陀螺仪卡片组件仍保留源码，但首页 IPCard 已不挂载传感器和超大镜面层，避免首卡延迟闪现与滚动抢手势 | `ParallaxLightSweep`, `OrbitalSpectralRing`, `RhythmBars`, `MagneticLiquidContainer`, `IPCard` |
| 图片/视频导入 | 已实现，Android 删除确认待真机验收 | 批量导入、复制原文件、生成独立缩略图、重复检查、导入批次；相册素材按来源创建时间记录来源序号，ZIP/PIXORYPACK 按压缩包条目顺序记录来源序号；Android 11+ 使用系统删除确认，取消/不支持时保留原文件并回退；图片+视频混选共享一次 1000 文件/单文件/32GB/磁盘余量 gate 和同一实际写入 commit budget，并在 metadata 文件 I/O 前按数量和已知大小早拒绝；缺失 metadata 固定最多 4 worker，实际复制字节变化时在数据库提交前复查；整次混合导入进入 Personal task barrier；DocumentPicker cache URI 只有被明确标记为本页所有且仍位于 Expo cache 时才在移除/离页清理 | `ImportImagesScreen`, `mediaFilePickerService`, `mediaImportPreflight`, `mediaImportPreflightRuntime`, `boundedFileConcurrency`, `imageImportService`, `videoImportService`, `mediaSourceDeletionService`, `PixoryMediaModule` |
| 图片浏览与整理 | 已实现，真机压力待验证 | 全部素材、分组素材、标签素材、收藏、最近查看、快速整理；图片阅读器使用 81 项锚点窗口、40 项边界游标页、自适应编码/解码预取、并发上限、Personal 内存会话缓存、退出位置恢复和浏览记录合并写，不再加载完整上下文 | `AllImagesScreen`, `ImageViewerScreen`, `mediaPrefetchPolicy`, `mediaImagePrefetchCoordinator`, `mediaReaderSessionCache`, `mediaLastViewedQueue`, `QuickOrganizeScreen` |
| 视频体验 | 已实现，真机音频/解码压力待验证 | 视频详情、沉浸播放、横竖屏、进度偏好；竖滑使用 previous/current/next 三槽视觉和可中断跟手 settle，播放器池保持当前 + 前向 3 + 反向 1 且只有当前项拥有音频，按优先序最多 3 路并行准备，封面在切换 settle 前发布；队列使用 61 项锚点窗口/40 项边界页；0.5×–3× 统一先启用保音高再写 playbackRate | `VideoDetailScreen`, `VideoPlayerScreen`, `videoSwipePolicy`, `videoPreloadPool`, `videoPlaybackRate` |
| 分组与标签 | 已实现 | 全局分组、IP 分组、标签管理、多选、筛选和结果页；分组采用 SectionList，标签采用双列 FlatList，热门/最近标签由 SQLite 排序并限制返回数量 | `GlobalGroupsScreen`, `GroupOverviewScreen`, `TagsOverviewScreen` |
| 搜索 | 已实现 | 全局素材搜索、全局搜索历史（支持年/月/日三级树状分组与统计，无缝路由返回）、AI 聊天搜索；全局素材搜索约 250ms 防抖，并在 SQLite 层按 IP、分组、标签、素材分类筛选且每类限制 20 条，避免先全量载入再由 JS 过滤 | `GlobalSearchScreen`, `GlobalSearchHistoryScreen`, `AiChatSearchScreen`, `ipRepository`, `groupRepository`, `tagRepository`, `imageRepository` |
| 批量管理 | 已实现 | 多选、批量移动、批量打标签、批量整理、撤销；“移动到 IP”支持图片和视频混选，复制受管文件后软删除源记录；批量删除标签按安全批次执行，避免超过 Android SQLite 绑定参数上限 | `BatchManageImagesScreen`, `BatchImageOrganizePanel`, `tagRepository`, `videoMoveService` |
| 重复检测 | 已实现 | exact hash、visual hash、重复审查、跳过导入 | `DuplicateReviewScreen`, `duplicateDetectionService` |
| 回收站 | 已实现 | 软删除、恢复、清空、过期清理 | `TrashScreen`, `trashService` |
| 备份/导入导出 | 已实现，Manifest V2 | 普通、单 IP 与隐私包覆盖数据库、原图/视频、缩略图、AI 文档、聊天附件和角色头像；恢复前校验相对路径、大小与 SHA-256，按内容去重并事务合并，SecureStore 密钥不进入备份 | `BackupScreen`, `BackupExportManagerScreen`, `backupService`, `managedBackupService`, `backupManifestProtocol` |
| AI 文档流 | 部分实现 | 已支持导入、受管复制、解析、切片、检索、答案级引用、阅读和带哈希校验的备份恢复；入口、术语、来源更新和跨资料搜索尚未形成统一闭环 | `AiGlobalMaterialsScreen`, `AiMaterialLibraryScreen`, `AiDocumentReaderScreen`, `aiDocumentService`, `managedBackupService` |
| Live2D 桌宠 | 完全关闭/不上线 | 已移除聊天页与会话设置页的运行时入口：不会加载模型、渲染 WebView、注册事件监听、启动动画/手势或提供下载与预览入口。保留源码、模型列表、已下载文件和既有 SQLite 设置值，供未来在独立验收后恢复 | `Live2DPetView`, `Live2DPetManagerModal`, `live2dManagerService`, `petModels` |
| 隐私空间 | 已实现 | normal/personal 双空间、密码、锁定、隔离数据库和文件；解锁时只激活当前根分页，避免四个库页面同时读取隐私库，首页/整理/全部素材/分组素材/批量管理首屏查询延后到交互完成。Personal 图片只使用内存图片缓存；锁定会清内存图片、reader session、聊天预取和 Personal 临时文件，但不清普通空间磁盘缩略图。Personal 成功建立会话后才授权后台任务；锁定先使 task token 失效，等待生成/陪伴/记忆/日记/备份恢复/导入任务停稳，再关闭数据库 | `App.tsx`, `SecureImage`, `PersonalUnlockModal`, `useScreenLoad`, `personalSystemService`, `personalTaskToken`, `aiGenerationManager`, `companionMaintenanceQueue`, `diaryGenerationManager`, `aiMemoryMaintenanceService` |
| 外部分享/打开 | 已实现 | Android share/open-with 接入，导入外部图片、视频、包文件 | `ShareCollectScreen`, `ArchiveReaderScreen`, native media module |
| 存储统计与维护 | 已实现 | 原图、缩略图、缓存、备份、回收站空间统计和清理 | `StorageUsageScreen`, `storageUsageService` |
| 更新与公告 | 已实现 | 远程版本检查、公告、官网下载、GitHub fallback | `updateCheckService`, `announcementService` |
| 官网与发布 | 已实现 | 官网下载页、更新 JSON、release notes、Android release workflow、关于页内置产品文档入口与应用内 Markdown 阅读；进入关于页会后台预取官网产品文档图片并持久缓存到应用内，后续阅读优先复用本地缓存 | `docs/`, `AGENTS.md`, `AboutScreen`, `ProductDocumentationScreen`, `productDocumentationService` |
| 设计系统/基础组件 | 已实现 | 统一移动端 UI、空状态、按钮、表单、toast、action sheet | `src/components/`, `src/design/tokens/` |

### 2.1 2026-08-20 性能加固逐项索引

完整根因、文件级清单、review 新发现、验证结果与 Android 门禁见 [`docs/reviews/2026-08-20-performance-hardening-review.md`](reviews/2026-08-20-performance-hardening-review.md)。下表中的“源码/自动化已验”不等同于真机帧率、内存、codec 或声学验收。

| ID | 功能/能力变化 | 实现边界 | 当前验证状态 |
| --- | --- | --- | --- |
| PERF-HOME-01 | 首页首帧只显示一个真实卡片几何 skeleton + shimmer，移除加载提示 | skeleton/真实卡共享宽高比、圆角、padding 和 caption 几何；Reduce Motion 停 shimmer | 源码/自动化已验；Android 像素差待验 |
| PERF-HOME-02 | 第一张 IP 卡片不再晚于第二张参与显示 | 仅首卡 high priority + 0ms transition，其他 normal + 120ms；首项不挂传感器/重型高光 | 源码/自动化已验；冷启动和回收滚动待真机 |
| PERF-DB-01 | 媒体/聊天热路径索引与稳定 keyset cursor | normal/personal 幂等建索引；created/recent/source 使用 sort value + id tie-breaker | 100k host SQLite plan 已验；Android SQLite 延迟待验 |
| PERF-DB-02 | scope-aware LRU/TTL/data epoch | media epoch 按 global + normal/personal 组合；DB handle 注册空间，结构写按所属空间 bump；last-view 不 bump；未知 handle 走 global fail-safe | 单元/集成已验 |
| PERF-IMG-01 | 图片阅读器从全量上下文改为 81 项锚点窗口 + 40 项游标补页 | 距边界 10 项内补页；`initialScrollIndex` 首帧定位 | 源码/自动化已验；200 项 fling 待真机 |
| PERF-IMG-02 | 图片预取不固定三页，改为速度/方向/内存自适应 | encoded 8/4、16/6、32/8；decoded 最多前 6/后 3；并发 4/2；generation 防旧任务回写；Android trim 后本屏 sticky encoded-only 并释放 decoded refs；预解码同时限制 viewport pixel width/height | 单元/集成/Kotlin compile 已验；RSS/掉帧待真机 |
| PERF-IMG-03 | 阅读器退出再进恢复当前位置且不重新全量加载 | session 最多 81 项、TTL 10 分钟、LRU 容量 8；结构 epoch 变化后失效 | 单元/集成已验 |
| PERF-VID-01 | 上下切换采用短视频式 previous/current/next 三槽 | 封面在拖动阶段跟手；距离/速度决策；settle 可中断反向 | 源码/自动化已验；手感/帧率待真机 |
| PERF-VID-02 | 5-player 有界池和预加载 | current + 方向前方 3 + 反向 1；仅 current 有音频；prepare 最大并发 3 | 单元已验；低端机 codec/RSS 待验 |
| PERF-VID-03 | 0.5×–3× 倍速统一保音高 | 创建、换源、普通倍速、长按倍速都先 `preservesPitch=true` 再设 rate | 源码/自动化已验；扬声器/耳机/蓝牙声学待验 |
| PERF-CHAT-01 | 已知线程入口利用路由时间预取首个 60 条消息页 | 只保留最近预取；consume 删除；revision 校验；创建时收敛 reject；Personal 锁定清理 | 源码/自动化已验 |
| PERF-CHAT-02 | 初次进入使用同槽位 readiness skeleton，不做可见后纠偏 | 清旧线程数据；空线程直接 ready；非空在首次 content layout 后揭开；普通入口不跑延迟 jump | 源码/自动化已验；真实长聊天闪烁待真机 |
| PERF-CHAT-03 | 超长历史页使用稳定 O(n) 去重合并 | `(createdAt,id)` 有序合并，当前窗口覆盖重复 ID，不对累计数组反复 sort | 6000 条/100 页单测已验 |
| PERF-CHAT-05 | 锚点定位使用单条 SQLite statement | 一个 CTE statement 读取 latest/before/anchor/after、SQLite 内去重并按 `(createdAt,id)` 排序；anchor 缺失自然返回 latest；不在同连接 `Promise.all` | 6000 条/100 页 repository benchmark 和 query plan 已验 |
| PERF-CHAT-04 | 聊天附件在复制/Base64 前限流限额 | 8 项、图片 12MB、文档/metadata 24MB、总量 32MB；读取并发 2；视频不转 Base64 | 单元/集成已验；设备内存峰值待验 |
| PERF-IO-01 | 图片+视频混合导入共享总量 gate 与实际写入账本 | 1000 项、图片 256MB、视频 20GB、批次 32GB、未知 256MB、保留 512MB；metadata I/O 前早拒绝；图片/视频服务复用同一 `MediaImportCommitBudget` | 单元/集成已验 |
| PERF-IO-02 | 导入/目录扫描/相册 metadata 使用有界并发和 commit 前复查 | 文件 worker 最大 4；复制后校验实际 size；失败走既有回滚；不改原件 | 源码/自动化已验；OEM/低存储竞态待真机 |
| PERF-IO-03 | DocumentPicker 临时副本有显式所有权 | 只删除本次 picker 创建、明确 temporary 且仍位于 Expo cache 的 URI | 源码/自动化已验；OEM URI 生命周期待验 |
| PERF-PRIV-01 | Personal 媒体缓存与长任务锁定边界收紧 | 图片只进 memory；导入纳入 task barrier；锁定不误清普通磁盘缓存 | 源码/自动化已验；锁定竞态待真机 |
| PERF-UX-01 | 图片/视频混选贯通批量整理和系统相册保存 | mp4/mov/mkv/webm/avi/m4v/3gp 走 native video MediaStore；其他素材不误走视频桥 | 源码/自动化已验；Android MediaStore 待验 |
| PERF-REV-01 | 全面 review 修复 19 项二次/补强问题 | Hook 顺序、刷新循环、space epoch、内存 trim/像素预算、预取拒绝、池并发、混合 quota/共享账本、Personal barrier、聊天单 statement 等 | 全量 1138：1123 pass / 0 fail / 15 skipped；三类 benchmark、Kotlin compile、diff 通过；Android 设备门禁待验 |

---

## 3. AI 功能矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| Provider | DeepSeek、OpenAI/OpenAI-compatible、Gemini、Claude；真实当前模型验证、辅助模型列表、不可枚举模型的手动 ID/历史成功模型、聊天流；配置可用的默认 Embedding 模型与密钥后，材料导入/重解析会尝试生成本地向量索引，请求使用上限为 3 的有界并发且暂未引入重试/退避；普通聊天不会无条件调用 Embedding，记忆检索无向量时使用 FTS/词面回退；DeepSeek 官方端点只展示 V4 Flash/Pro，已弃用的 `deepseek-chat` / `deepseek-reasoner` 对存量会话兼容迁移但不再出现在模型列表，自定义中转网关不受该限制 | `src/ai/aiProviderService.ts`, `src/ai/providers/`, `src/ai/deepseekModelPolicy.ts`, `src/ai/aiEmbeddingService.ts` |
| Provider 设置 | 全局默认 provider/model、连接 JSON 导入、保存/刷新/测试拆分、验证状态、手动模型 ID、中转网关模型别名、按空间隔离的 API Key SecureStore、当前会话模型复用全局配置/独立保存/测试/新增候选模型、删除手动/同步模型并清理默认值与会话悬挂引用、长按多选批量删除与同来源一键清理；设置页静态说明 API Key 本地保护、对话请求发送给所选模型服务商，且单次测试成功不代表永久可用 | `AiProviderSettingsScreen`, `AiSessionConfigScreen`, `secureAiSettingsService`, `aiProviderService`, `aiProviderRepository` |
| 聊天线程 | normal/IP/knowledge-base 上下文，标题、模型快照、角色快照、归档、删除 | `aiChatService`, `aiThreadRepository` |
| 聊天记录恢复与可见性 | 空分支范围严格表示主干路线，不会放宽成混入隐藏分支的无约束查询；有限消息页在内层查询显式导出 SQLite `rowid` 排序别名，外层不直接访问不可见的隐藏列；最近历史通过单条递归 SQL 按每个线程已采纳路线计算排序和预览；没有有效完成消息的空线程不会进入侧栏、首页、搜索或历史，同时避免逐线程 SQLite statement 竞争；历史读取失败时显示可重试错误而不是伪装成初始化空会话；发送事务创建消息 ID 后立即显示已落库的用户消息和 assistant placeholder；所有已知 thread 路由在 push/replace 前启动 revision-safe 首消息页预取，预取创建时即把失败收敛为 null，消费前校验 route revision；普通进入依赖 inverted offset 0 和首个非空列表布局提交揭开骨架，不再执行 50–700ms 可见纠偏；加载更早消息使用有序 O(n) 去重合并而不对累计历史反复 sort | `AiChatScreen`, `aiThreadMessagePrefetch`, `aiMessagePageMerge`, `aiThreadRepository`, `aiGenerationManager` |
| 陪伴卡片版本与删除 | 日记、梦境卡片按稳定产物组锚定在原聊天位置，重生成仅追加新版本；卡片下方可切换 `1/2`，长按复用消息气泡的触点锚定菜单以重新生成或仅从当前聊天移除。同一梦境组生成期间会禁用重复重生成，完成后默认切到新版，失败保留旧卡片并显示错误。聊天移除写入线程级隐藏状态，不会删除内心独白或历史消息；只有当前梦境版本可进入后续上下文。内心独白展示日记/梦境全部版本，外显序号按剩余版本连续重排；长按进入当前标签的多选模式，统一确认后以单事务直接永久删除所选版本，不进入回收站 | `AiChatScreen`, `DiaryChatCard`, `DreamChatCard`, `AiAnchoredContextMenu`, `CompanionInnerLifeScreen`, `companionArtifactChatStateRepository` |
| 发送与生成 | 创建用户消息、assistant placeholder、stream provider、stop、continue、retry、regenerate、rewrite；已停止/失败且有正文的 assistant 回复可在原气泡内继续生成，续写阶段保留已有正文/思考上下文但只追加正文；已完成的 assistant 回复在当前末尾保持“续答”，会在下方生成一条新的 assistant 消息继续往下说且不写入伪造的 user/system 历史；当该 assistant 下方已经有后续消息时，同一入口改为“回复”，允许用户从这条历史 AI 消息重新接话并切出新的分支路线；聊天输入区新增 `AI 帮答`；聊天输入框可扩展到最多 8 行并在清空后立即收回；聊天附件会在本轮发送中进入上下文，图片按支持视觉的 provider 作为多模态 payload 发送，文档导入线程材料并注入摘录，聊天页不提供视频附件入口；附件统一限制 8 个、单图片 12 MB、单文档 24 MB、总计 32 MB，未知大小占用保守预算，在复制/Base64 前拒绝；图片读取固定并发 2、保持选择顺序并隔离单张读取失败 | `aiChatService`, `aiAttachmentPolicy`, `aiBoundedConcurrency`, `aiGenerationManager`, `AiChatComposer`, `providers/*` |
| 生成崩溃恢复 | V55 持久恢复 | 每次主聊天生成在 Provider 请求前持久化 job，首个 delta 转为 streaming，并按现有合批节奏同步部分正文/思考与 content-free 事件；完成、失败、超时、用户停止及恢复强停时，消息、思绪消费/释放与 job 均在同一事务结算，恢复重试耗尽不会遗留不可消费的思绪预留。进程重启后按空间单航班协调：无部分正文时对同一 assistant 占位最多自动重试一次，有部分正文时最多续写一次且不新增思考、做重叠去重；续写前及最终落盘前会重新验证停止前引用的来源可见性、版本、片段哈希和 claim span，失效引用不再展示；保存原人设/模型/分支快照但重新读取 SecureStore 密钥。普通空间初始化后恢复，Personal 仅成功解锁后恢复且锁定会取消并等待任务；跨空间迁移保留 job/event 且清除 lease | `src/ai/generation/`, `aiChatService`, `aiGenerationManager`, `App.tsx`, `ai_generation_jobs`, `ai_generation_events` |
| Android 语音输入 | 已实现，直接 SpeechRecognizer | 麦克风入口独立于聊天 Provider/模型；点按切换，长按开始、松开结束、上滑或轻提示取消，只有 final result 写入输入框且仍由用户手动发送。API 31+ 优先设备端识别，否则明确使用系统识别并请求离线优先；区分权限永久拒绝、服务不可用、忙、超时、无语音、网络/音频与取消，页面离开、后台和发送时释放 recognizer | `AiChatComposer`, `AiVoiceInputStatus`, `AiChatScreen`, `pixoryMediaModule`, `PixoryMediaModule.kt` |
| 流式性能 | generationId 防旧流污染、首 token live 显示、外部 streaming store；Provider delta 热路径只做轻量分发与 chunk 累积，显示和 SQLite 由独立合批调度完成，即使最后一个 delta 后也会 drain；generation metrics 记录内容无关的 Provider 字符数、UI backlog、handler/persist/tail 合并耗时，开发诊断按 generation identity 关联且不进入普通页面；查看历史时使用 measured tail occupancy、真实 FlatList spacer、block 级高度预留/显式测量/cache、reasoning/content lane 隔离；上滑后继续生成时，reasoning replay 保持在同一透明思考表面，content 独立进入固定 `94%` 宽度的连续正文气泡，字符/token 继续实时出现，同一行追加不改变气泡宽度，换行才增加正文高度，内部块不重复绘制边框或叠加卡片 inset；滑回最低处时，near-bottom 只预热，只有原生 offset 进入底部 `32px` 安全区、拖动与惯性结束、滚动稳定、尾块全部提升测量且高度债清零后，才在下一帧二次确认并恢复普通 streaming renderer、内联光标和自动跟随；completed/failed/stopped 业务终态、完成时间、错误与思考计时立即发布，不等待 replay 离屏，布局树则继续保持原位；离屏终态 reload 固定绑定该次 streaming identity 的线程，避免路由变化后刷新到其他会话；只有整条回放消息完全离开视口、尾块全部提升并重新测量且高度债清零后才清理 tail 并 reload 完整消息，避免可见区域换壳和坐标跳动；内容或终态签名改变时即使块高度不变也会主动重新测量；tail replay block key 与 generationId/startOffset/blockType 解耦并使用 `blockIndex`/`ordinal` 恒等契约，终态 stopped/failed/completed 会 finalize 开放尾块；tail replay 支持 feature flag/kill-switch，关闭时的 continuation fallback 同样保持 reasoning/content 视觉隔离；idle timeout 会走 failed 终态并和用户 stopped UX 区分；dev 环境记录 promoted/mounted/measured/firstTextVisible 与 mountCount 红线；低频 persist、后台 flush。高风险 detached tail、单源测量、splitter 和抽屉迁移均需 Android 门禁，当前无设备时不实施 | `aiStreamingRuntime`, `aiStreamingPerformanceDiagnostics`, `aiStreamingMessageStore`, `aiStreamingTailModel`, `aiStreamingTailRenderContract`, `aiStreamingTailFeatureFlags`, `aiStreamingTailContinuation`, `aiStreamingBlockSplitter`, `aiStreamingHeightCache`, `AiChatScreen`, `AiStreamingMessageText`, `AiStreamingTailSpacer`, `AiMeasuredStreamBlock`, `AiStreamingTailMessageSegment`, `AiStreamingTailContinuationBubble` |
| 聊天输入与安全区 | Android 聊天页锁定进入页面时的底部安全区，键盘开合不重复推高输入框；仅减少输入框到屏幕底部的外部留白 `8dp`，不改变输入框内部 padding；顶部安全留白减少 `8dp`；聊天标题使用系统字体并与正文同为 `14px/22px`，模型名称保持 `12px/18px` | `AiChatScreen`, `AiChatComposer`, `AppScreen`, `SafeAreaProvider` |
| 回到最新交互 | 右下角 18px 低干扰圆钮，保留 44px 触控热区；离开最新位置 200px 后显示，生成中使用连续三点动效，结束后切回箭头；只有手势明确向下至少 8px 且进入 160px 时提前吸底，上滑手势不会被流式布局波动误吸附；原有 32/48/70px 流式尾部规则保持不变 | `AiChatScreen`, `AiScrollToLatestButton`, `aiScrollToLatestPolicy` |
| 生成指标 | prompt/memory/retrieval/provider/first delta/UI patch/final persist 等 content-free metrics；记录对话覆盖是否完整、已验证摘要数、原文桥/本地临时摘要数量、分支路线 hash 与动态段 token 估算，不记录正文 | `aiGenerationMetrics` |
| 回复呈现计划与多正文气泡 | 规划/暂缓；当前保持单一思考区和连续正文渲染，不启用 `ResponsePresentationPlan`、多气泡拆分或模型输出格式约束。重新启动前需先完成输出协议、思考区布局、终态恢复和 Android 性能验收 | `docs/ai-chat-research/pixory-companion-runtime-v1-spec.md`, `docs/ai-chat-research/pixory-companion-runtime-v1-handoff.md` |
| Prompt | stable/dynamic layer、角色卡 frame、material rules、history window、current user request；发送前按当前分支和消息版本精确编译“已验证摘要 + 无重复桥接 + 最近完整轮次”，历史滑杆仅改变最近原文窗口，不会静默留下上下文空洞 | `promptBuilder`, `conversationCoverage`, `conversationCoverageService` |
| Prompt/cache | stable prefix hash、retrieval hash、cache key、Anthropic breakpoint、禁止 diagnostics 污染 prompt/cache；稳定摘要参与 stable hash，角色观察/用户画像等自动变化内容处于 dynamic layer，避免污染可复用前缀；DeepSeek 官方 V4 使用服务商原生前缀缓存并在流式请求中开启 usage 观测，不发送 OpenAI `prompt_cache_key`，其他 provider 策略保持原样 | `aiPromptCache`, `openAiCompatibleProvider` |
| 首 token pipeline | fast-path classifier、normal skip retrieval、资料模糊引用 fail-closed、keyword/full retrieval 分层 | `aiChatFastPath`, `aiRetrievalService` |
| 上下文预算 | 真实 model context window（无法读取时回退 512K）、会话级最近对话轮数滑杆（一问一答算一轮）、历史裁剪、保护 role/current request/retrieval/memory；token 估算使用等价的低分配单次 code-unit 扫描和前缀搜索，滑杆可在 5/20/30/50/100 等窗口间缩放，摘要缺失或因编辑/切分支失效时由本地原文桥或确定性临时摘要补齐，远程摘要只异步预热且不阻塞首 token | `aiContextBudget`, `aiContextSettings`, `AiContextSlider`, `conversationCoverageService` |
| 角色卡 | 手动角色、SillyTavern PNG/JSON/V1/V2/V3 导入、sourceJson 保留、头像、标签、首句；角色卡编辑和会话设置共用头像选择器，可从系统相册或当前空间的 IP 素材选择并复制到受管存储 | `sillyTavernRoleCardParser`, `aiRoleCardRepository`, `AiRoleCardEditorScreen`, `AiAvatarPicker` |
| 角色卡导出 | SillyTavern PNG 导出、续聊 Markdown、系统人设/记忆/上下文分离 | `sillyTavernRoleCardExporter`, `aiRoleCardContinuityExport` |
| 连续性导入 | 原生 Markdown 精确导入、外部文档接回、解析不足时模型辅助结构恢复、导入后分支接续、10 轮观察回退窗口、外部导入记忆审读门禁、显式 summary/profile/memory fan-out；外部路径将候选抽取与独立审核分开，模型建议还需 evidence/scope/manual-lock 确定性校验；待审读任务有同进程去重并可由下一次后台维护续跑，失败状态不自动重复烧调用；给外部软件的迁移提示词只允许 user/assistant transcript，违规 system/developer/tool 内容在解析侧继续隔离为 untrusted context；Personal 外部导入必须逐次授权远程整理 | `aiContinuityImport*`, `AiSessionConfigScreen`, `AiChatScreen` |
| 记忆导入/导出 | 默认导出 Pixory Memory Package v2（JSON，确定性导入；兼容旧版 Markdown/v1 与外部文本审查）；包只包含当前会话可见 scope 的 Claim、关联账本事件与证据，避免带出其他线程记忆；原生导入先 pending、失败可复用原分支幂等续跑，导入消息 ID 映射后保留 Claim 证据引用并跳过悬空消息引用，已删除/抑制 Claim 由本地投影、删除证书和包内墓碑共同拦截，Claim/episode/关系/profile 随会话一起完整回滚；外部审核画像也同步进入 v1 profile 账本，外部回滚按 import session 精确隔离 | `aiRoleCardContinuityExport*`, `aiContinuityImport*`, `src/ai/memory/nativeMemoryPackage*` |
| 深度记忆 | v1 事件账本 + Working/Confirmed/Archive 三车道；每条消息即时写 current-turn observation，回答落盘后本地轻抽取，重维护异步批处理；Claim/episode/关系/profile 可从账本重建；无 Embedding 时 FTS/词面检索可用且无相关证据不注入，Confirmed 容量回收、冲突/安全边界、用户确认锁定和 ContextPlan 可追溯；稳定提示仅注入 Confirmed，当前轮 forget/correction 会排除目标 Claim，分支 Claim 仅在当前祖先 lineage 可见；看板仅展示长期记住/最近对话并支持真实编辑、确认、删除、作用域修改 | `aiMemory*`, `src/ai/memory/*`, `AiMemoryBoardScreen` |
| 陪伴事件与时间连续性 | 已实现，V1 核心 | 当前完成的用户消息先经无网络本地观察器生成追加式 Companion Event，保存精确消息版本、证据跨度、speech mode、置信度、分支路线和幂等键；引用、否定、假设、玩笑、角色扮演与第三方转述不会形成高影响事件；明确边界/纠正当前轮进入动态约束。时间短语按原时区保存 UTC 范围和本地 date key，共同约定形成 branch-scoped OpenLoop；完成、取消、“别再问”及默认期限可结算，每项最多主动提及两次且未回应后静默七天；每轮最多一个旧事项作为可选动态话题，不发送主动消息或通知。含混强信号才创建带 SQLite lease 的后台丰富任务，无模型、离线或 Personal 未授权时本地路径继续工作 | `src/ai/companion/`, `aiChatService`, `companion_events`, `companion_temporal_anchors`, `companion_open_loops`, `companion_runtime_jobs` |
| 关系投影与修复 | 已实现，V1 核心 | 以追加式事件重建线程/角色双层投影，内部维护好感、信任、紧张、亲密和交往阶段，但不向用户暴露数值；明确边界和事实纠正即时生效，高影响的接受、冲突、越界、伤害、道歉与修复采用证据门禁、幅度上限和冷却，修复后的行为约束会进入动态提示。设置页可查看来源、忽略误判、执行可审计重置或明确清空；重置事件之后的投影才能继续参与上下文 | `companionProjection*`, `companionAffectPolicy`, `companionRelationshipPolicy`, `companionRepair*`, `CompanionRuntimeManagerScreen` |
| 角色梦境 | 已实现，V1 核心 | 本地宽候选检测覆盖梦中、共同入睡、角色入睡、晚安与角色扮演睡眠场景；明确睡眠质量/产品讨论本地零成本排除，其余候选只进行一次结构化语义分类，再使用持久化确定性 roll 按 55%/40%/30%/10%/10% 概率决定。自动梦境按角色至少间隔 50 个完整问答轮、北京时间每天最多两次成功，失败不占成功配额或冷却；任务预留会记录所属北京日期，成功提交按实际完成日再次原子校验上限，因此跨午夜旧预留不能形成第三次成功。跨日重试不要求新聊天轮，并把重新预留与任务恢复放在同一 SQLite 事务；手动“做个梦”先确认且不占自动冷却/日配额。生成种子持久冻结当前分支触发证据与会话角色快照，后续编辑线程配置或角色卡不会改变同一任务重试输入；消息从当前证据与历史完整轮补齐到最近 20 个完整问答，附北京时间且禁止无证据补写。线程删除或跨空间移动后的 counter 重建只统计自动成功梦境。任务具备 lease、幂等、消息版本/分支/空间复核和 Personal 远程授权边界；生成卡提供可操作取消，取消会中止活动请求、释放预留并刷新持久卡片；运行提示只从当前 branch/lineage 的 SQLite 状态恢复，不采用线程级内存兜底。分类与生成 token 仅记录数量；解析可剥离一层代码围栏或短前后说明，但提取后的字段/evidence/scope 仍按严格 schema fail closed。格式纠错后仍失败保留可操作失败态；重试复用冻结来源，来源变化时明确提供“按当前消息重新生成”，频率阻断、状态变化或异常均给出可见反馈。完成卡片与日记一样按冻结来源消息锚定，刷新、分页和重进页面位置稳定；阅读器使用 9:13 纵向、最多三层预览且不首尾循环的有限分页梦境卡，最后一页只有用户明确选择“是”才以低权限、非事实、非记忆、非预言材料进入同线程同分支后续上下文 | `src/ai/dream/`, `DreamChatCard`, `DreamDeckPager`, `DreamReaderScreen`, `companion_dream_*` |
| 离线思绪 | 已实现，V1 核心 | 只在完整问答后由本地规则识别脆弱、受伤、和解、道歉、赞美与冷淡事件，十分钟会话窗口统一批量生成；每角色北京时间每天最多三条，允许模型返回零条。思绪是给 AI 的一次性低权限短念头，不在聊天页直接展示；选择时原子预留，生成失败可释放，同一回复重试复用，回复、generation job 与消费状态在同一事务完成，来源消息/当前已采纳分支仍有效才消费，生成期间切换分支会在同一终态事务释放预留，启动维护还会回收历史 terminal 消息遗留的预留，之后不再注入。任务具备 lease、退避、幂等、Personal 隔离和内容无关 token 计量；用户在“内心独白”中长按进入多选并以单事务永久删除，新删除不进入回收站，升级前已处于 `soft_deleted` 的旧数据仍保留恢复入口 | `src/ai/thought/`, `companionArtifactService`, `CompanionInnerLifeScreen`, `companion_thought_*` |
| 内心产物仲裁 | 已实现，V1 核心 | 每轮最多选择一个日记/梦境/思绪动态段；用户明确允许的同线程同分支梦境或日记优先于待消费思绪，全部使用统一 artifact contract，并标注为不可信、低权限、非事实/非指令内容。跨空间移动按依赖顺序保留投影、梦境、思绪、任务与来源版本，运行中任务清 lease 后恢复，源角色删除时清理孤立计数与角色投影 | `companionArtifactAdapter`, `companionArtifactService`, `aiThreadRepository`, `aiChatService` |
| RAG/材料 | thread material、IP snapshot、knowledge base、keyword/hybrid retrieval；每次请求按实际片段顺序分配 `S1...`，模型只有实际使用资料才输出隐藏引用标记，流式阶段不会闪现半截标记；完成、停止、失败及中断续写时按回答句子位置落库并复核来源可见性、文档/素材版本、片段 SHA-256、claim span 和本地词面支撑，无标记不生成引用，失效引用不展示；文档删除使用 citation 子查询清理，embedding 写入按最多 100 条一批执行，同一 chunk/provider/model 的重复输入保持最后写入生效 | `aiDocumentService`, `aiRetrievalService`, `aiCitationProtocol`, `aiKnowledgeRepository`, `aiThreadRepository` |
| 文档解析 | manual text、txt、markdown、pdf、docx；chunking、reader | `documentParsers/`, `AiDocumentReaderScreen` |
| 文档生命周期 | 已支持手动文本/TXT/MD/PDF/DOCX 导入、受管目录复制、解析重试、切片、线程/IP/知识库归属、检索引用、阅读、跨空间移动、删除和原文件备份恢复；存在可用默认 Embedding 配置时，导入/重解析会自动补全向量，最多并发 3 个请求且不含重试/退避，并只 upsert 本轮缺失 chunk、保留同模型已有向量；尚无统一收件箱、全局跨资料搜索、来源更新检测和同步状态 | `aiDocumentService`, `aiDocumentRepository`, `AiMaterialLibraryScreen`, `AiDocumentReaderScreen`, `managedBackupService`, `aiEmbeddingService` |
| 产品帮助文档 | 关于页进入应用内 Markdown 阅读，官网图片后台预取并持久缓存；这是产品帮助链路，不会自动作为用户知识库或系统 RAG 材料 | `AboutScreen`, `ProductDocumentationScreen`, `productDocumentationService`, `productManualMarkdown` |
| Live2D 桌宠 | 完全关闭/不上线；已移除聊天页与会话设置页的运行时入口，不加载模型、不渲染 WebView、不注册事件监听、不启动动画/手势，也不提供下载或预览入口；保留源码、模型列表、已下载文件和既有 SQLite 设置值，恢复前必须重新完成 Android 性能验收 | `Live2DPetView`, `Live2DPetManagerModal`, `live2dManagerService`, `petModels` |
| 分支 | edit/regenerate 分支、message versions、branch route metadata、分支树、采用主线；聊天首屏预取、正式加载、下拉/后台刷新、聊天搜索、路线树与“最近聊天”均从同一持久采用路线投影读取，预取结果以 lineage 版本复核后才显示；显式空路线始终表示主线，不会退化成“所有分支”。采用路线指针与元数据在同一 SQLite 事务落盘，最近聊天的预览/排序只使用该路线的最后一条完成消息，不会被更晚的隐藏兄弟分支挤占。创作路线树入口位于会话设置的当前会话模块；Android 路线树避免全画布 SVG/bitmap，长路线用局部连线、限量网格与可见区渲染降低卡顿和闪退风险 | `aiThreadRouteSnapshotService`, `aiThreadRepository`, `aiBranchTreeService`, `AiChatScreen`, `AiChatSearchScreen`, `AiBranchTreeScreen`, `BranchTreeCanvas`, `AiSessionConfigScreen` |
| 聊天搜索 | 当前路线 local exact/fuzzy 搜索，定位回聊天 | `AiChatSearchScreen`, `aiThreadRepository` |
| 收藏 | assistant 消息收藏、分支 scope 收藏、收藏列表 | `aiThreadRepository`, `AiMessageBubble` |
| Usage | provider usage 归一化、cached token ratio、线程/总览用量；DeepSeek 官方原生 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` 进入缓存命中、未命中与命中率观测，Provider 未返回缓存字段时明确显示“未观测”；梦境分类/生成和思绪生成分别保存 content-free prompt/completion token 数，不落库 prompt 或模型正文副本 | `aiProviderUsage`, `aiUsageAnalytics`, `AiUsageSummary`, `companion_dream_jobs`, `companion_thought_jobs` |
| 消息渲染 | Markdown (全新标记解析器防注入)、代码块、表格、原生图片附件画廊展示、HTML/CSS WebView、数学块、citation、thinking block、render cache；rich-HTML 判定按内容 memo，数学块按公式 memo KaTeX 编译与 WebView HTML | `AiMessageContent`, `AiMessageBubble`, `AiMathBlock`, `AiMarkdownReader` |
| AI UI | 工作台、聊天、会话设置、角色库、角色详情、材料、知识库、文档 reader、历史；聊天消息与日记按北京时间自然日插入独立 `dateSeparator` 列表项，当天/前一天显示“今天/昨天”，每个自然日只出现一次且不会进入 reasoning 或正文节点；聊天首屏将消息页与非关键模型/外观/记录读取分阶段加载，并合并模型图标与名称查询，返回工作台优先显示内存快照再后台刷新；聊天页支持左侧菜单按钮和全屏右滑打开综合记录抽屉、左滑打开会话设置抽屉，顶部搜索靠近抽屉入口，右侧提供会话设置与聊天气泡形态的新会话入口；会话设置抽屉固定显示线程标题与用量入口，快捷操作随内容滚动，模型名称精简展示，角色指令以只读预览进入全屏编辑，并可展开共用头像选择器；消息长按菜单按手指所在屏幕半区在触点上方或下方 `5px` 弹出，键盘压缩视口时操作列表在菜单内滚动并保持触点锚定，流式回复的正文/思考尾段和降级 continuation 路径同样可长按；用户消息提供复制、全屏选择文本和修改，AI 消息保留复制、全屏选择文本、收藏、继续生成、续答/回复、重新生成的独立入口，菜单底部始终显示 `HH:mm`；非最新消息不显示常驻操作栏，只有版本切换继续留在气泡下方，最新 AI 回复可保留原操作栏；输入框左下角模型图标右侧提供小灯泡 `AI 帮答` 入口，弹出固定高度的底部阅读器式候选面板，支持短句/长句切换、刷新保留历史页与左右翻页；聊天输入区首次进入时以 420ms 淡入并从下方轻移 20px，动画层使用页面同色合成底以避免 Android elevation 阴影产生黑色中间帧；“我的头像”默认开启，显式关闭按会话保留 | `src/screens/Ai*.tsx`, `src/components/ai/` |

---

### 3.1 聊天运行时性能（P0/P1，更新至 2026-08-20）

- 聊天记录以 `(createdAt, id)` 作为稳定顺序和 keyset cursor；首屏与“加载更早”均读取 `limit + 1` 条基础消息，精确计算 `hasEarlierMessages`，不会随已加载总量累计重查历史。分支根消息仍只作为水合依赖，不参与分页边界。
- 路线快照携带分页 cursor，只有 `lineageVersion` 和 `thread.updatedAt` 均未变化时才直接采用，避免预取后立刻进行完整重载或额外计数查询。
- 流式 UI 发布与 SQLite 持久化合批解耦：每一个已发布字符计数对应真实可见文本；普通附着流终态直接提交 canonical patch，不再重载整段消息。阅读历史时的 buffered tail 仍保留 canonical reload，保障恢复一致性。
- 生成结束后的远程模型标题改为按空间/线程串行的后台 best-effort 任务，终态和输入恢复不再等待该请求；标题变更通过会话级事件回写页面。首次 memory notice 在交互空闲后读取，最近聊天仅在记录抽屉打开时加载，参与者外观读取保持共享 SQLite 连接串行。
- 普通线程打开在路由提交前预取首消息页；进入页先清除旧线程可见数据并覆盖聊天骨架，非空列表只在首个 content-size 布局提交后揭开，空/失败路径显式结束 ready。普通进入不再调用 latest-jump retry，搜索/分支/编辑仍保留命名定位重试。
- 超长历史的旧页与当前窗口按 `(createdAt, id)` 线性合并，当前窗口版本在 id 重叠时胜出；around-anchor 使用单条 CTE statement 读取 latest/before/anchor/after，不再在同连接并发多条读取或在 JS sort；100 页/6000 条 repository benchmark 验证不重不漏。隐藏或后台的 ParallaxLightSweep 会取消无限循环。
- 媒体/聊天热查询由 normal/personal 初始化共同确保复合索引；媒体列表使用 keyset cursor、`limit + 1` 和 id tie-breaker，查询缓存按 scope、LRU、TTL 与 global+space data epoch 失效。100,000 行媒体及 6000 消息内存 SQLite 基准记录延迟与 query plan。
- 当前仍未发现 ADB 设备；Android 真机的 20k 消息首次进入/高速往返、键盘切换、流式 detached tail、RSS/帧时间门禁均标记为“待验证”，不是已通过。

## 4. IP 与素材库矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| IP 创建/编辑 | 创建 IP、编辑名称/说明、封面、最近查看、收藏统计 | `CreateIpScreen`, `EditIpScreen`, `IpDetailScreen`, `ipRepository` |
| IP 列表/首页 | 首页 IP 卡片、最近/收藏/统计入口；冷启动只挂载 1 个与真实卡片共享尺寸 token 的 skeleton + shimmer，无文字加载提示；首卡和后续卡统一轻量路径、封面 priority 由可见位置决定，不再为第一张单独启动传感器/高光 | `HomeLibraryScreen`, `IPCard`, `IPCardSkeleton`, `componentTokens.ipCard` |
| IP 删除 | IP 软删除、永久删除、本地文件清理 | `ipDeletionService`, `TrashScreen` |
| IP 封面 | 自定义封面、个人空间 blur fallback、封面选择 | `IpCoverPickerScreen`, `GroupCoverPickerScreen` |
| 图片详情 | 原图、备注、标签、分组、收藏、最近查看、资产编码 | `ImageDetailScreen`, `EditImageScreen`, `imageRepository` |
| 视频详情 | 视频元数据、播放入口、保存到系统相册、删除 | `VideoDetailScreen`, `videoImportService`, `videoMoveService` |
| 原文件安全 | 原图/视频复制到 app storage，不压缩、不覆盖、不依赖临时 URI | `fileStorageService`, `imageImportService`, `videoImportService` |
| 缩略图/预览 | 图片缩略图、视频缩略图、缺失预览重建；缩略图始终为独立派生文件，不覆盖原件；大批量导入顺序生成以限制解码峰值，列表/阅读器各自使用受限 cache/预取策略 | `thumbnailService`, `previewMaintenanceService`, `SecureImage`, `mediaImagePrefetchCoordinator` |

---

## 5. 导入与批次矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| 图片导入 | 多选图片、读取 metadata、复制原图、缩略图、创建记录；预检 1000 文件/256 MB 单图片/32 GB 总量/未知大小预留/512 MB 存储余量，实际字节变化时提交前复查；混合批次与视频共享同一实际写入账本 | `ImportImagesScreen`, `imageImportService`, `mediaImportPreflight` |
| 视频导入 | 多选视频、读取时长/尺寸、复制原视频、生成视频缩略图；预检 20 GB 单视频与批次/存储预算，复制、hash、封面和数据库写入均保留取消检查及显式回滚；混合批次与图片共享同一实际写入账本 | `videoImportService`, `mediaImportPreflight`, native media module |
| 导入目标 | 导入到指定 IP、创建新 IP、选择分组和标签 | `ImportImagesScreen`, `ImportResultScreen` |
| 导入批次 | 批次记录、批次复盘、当前批次 duplicate review；批次默认按来源顺序展示，支持来源正/逆序 | `ImportBatchHistoryScreen`, `ImportBatchReviewScreen`, `BatchManageImagesScreen`, `imageRepository`, `importBatchRepository` |
| 导入模板 | 管理导入模板，复用分组/标签等导入配置 | `importTemplateRepository` |
| 素材来源与移动 | 图片和视频分别记忆“相册/文件”来源，文件入口支持批量选择且保持 `copyToCacheDirectory: true`；只有选择器返回、显式标记 owned 且仍位于 Expo cache 的 URI 会在移除/取消/成功离页时清理，相册原件不进入该路径；相册移动在全部成功素材完成 Pixory 本地持久化后，合并图片/视频 assetId 发起一次 Android 系统删除确认，取消、assetId 缺失或删除失败时保留导入结果并明确提示 | `ImportImagesScreen`, `mediaFilePickerService`, `mediaSourceDeletionService`, `imageImportService`, `videoImportService` |
| 资源包导入 | zip/cbz 包选择、zip-slip 防护、图片识别、按文件夹映射分组；Personal 入口将整个资源包任务注册到锁定屏障，并把会话 token 贯通普通素材导入及识别出的 Pixory 备份恢复路径 | `ImportImagesScreen`, `packageImportService`, `ArchiveReaderScreen` |
| 分享接入导入 | Android 分享图片/视频/文件到 Pixory | `ShareCollectScreen`, native media module |

---

## 6. 浏览、整理与检索矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| 全部素材 | 全部图片/视频列表、排序、视图模式、筛选、多选；支持来源顺序排序 | `AllImagesScreen`, `assetListPreferences`, `SortMenuButton` |
| 分组素材 | IP 分组页、全局分组页、分组结果页 | `GroupOverviewScreen`, `GroupImagesScreen`, `GlobalGroupsScreen` |
| 标签素材 | 标签总览、标签结果页、标签多选、标签创建/删除 | `TagsOverviewScreen`, `TagResultScreen`, `tagRepository` |
| 收藏 | 收藏列表、收藏筛选、取消收藏 | `FavoritesScreen`, `imageRepository` |
| 最近查看 | 最近查看列表、清空本地查看历史 | `RecentViewedScreen` |
| 全局搜索 | 素材搜索、建议、历史记录展平按单层级日期显示、范围自定义删除、高亮词面片段、极光加载动画、结果跳转；输入防抖、分类 SQL 查询和每类 20 条结果上限 | `GlobalSearchScreen`, `GlobalSearchHistoryScreen`, `searchHistoryService`, `ipRepository`, `groupRepository`, `tagRepository`, `imageRepository` |
| 快速整理 | 未整理提示、按顺序快速设置 IP/分组/标签/备注 | `QuickOrganizeScreen`, `OrganizeScreen` |
| 批量整理 | 批量移动、打标签、收藏、选择规则、撤销快照；图片/视频可混选后批量移动到其他 IP | `BatchManageImagesScreen`, `BatchImageOrganizePanel`, `videoMoveService`, `batchUndoService` |
| 选择规则 | 全选、同前缀、相似图、多规则交集 | `batchSelectionRules` |

---

## 7. 图片与视频体验矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| 图片查看器 | 翻页、沉浸 reader、filmstrip、设置、zoom 手势、反向顺序；81 项初始锚点窗口 + 40 项边界 keyset page，按速度/方向在 8/4、16/6、32/8 编码窗口间自适应，解码封顶前 6/后 3、并发编码 4/解码 2；预解码使用 viewport 双维像素上限，Android trim/low-memory 后本屏切 encoded-only 并释放 decoded refs；重叠预取去重、换代释放、退出恢复 last-viewed，Personal 只保留内存会话并在锁定清除 | `ImageViewerScreen`, `mediaPrefetchPolicy`, `mediaImagePrefetchCoordinator`, `mediaReaderContextQuery`, `mediaReaderSessionCache`, `mediaLastViewedQueue`, `pixoryMediaModule` |
| 系统相册保存 | 保存单张/多张图片或视频到系统相册；mp4/mov/mkv/webm/avi/m4v/3gp（含 query URI）统一走 native video MediaStore，其余图片走 image 路径 | `mediaLibraryService`, `AlbumSaveDialog`, `PixoryMediaModule` |
| 视频播放器 | 自动播放、顺序/随机播放模式、循环、播放/暂停、进度拖动、横竖屏、锁定、末尾恢复保护；61 项锚点窗口 + 40 项边界页，资源池当前 + 前向 3 + 反向 1、prepare 最大并发 3、单音频 owner，封面在 settle 前显示但只有 active source ready 后覆盖当前画面 | `VideoPlayerScreen`, `videoPreloadPool`, `mediaExperiencePreferences` |
| 视频手势 | 双击播放/暂停、左右区域切换、长按快进、scrub；竖滑为 previous/current/next 三槽跟手、速度/距离决策、可从当前 transform 中断反向；0.5×–3× 统一 `preservesPitch=true` 后设置速率 | `VideoPlayerScreen`, `videoSwipePolicy`, `videoPlaybackRate` |
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
| 备份导入 | 兼容旧 plain backup，并支持 Manifest V2 plain/personal encrypted merge：解包后先校验版本、空间、相对路径、大小和 SHA-256，再把文件写入受管目录；SQLite 事务按依赖合并 AI/记忆/陪伴记录、重写文档/附件/头像与 IP/图片引用。角色、线程、消息、文档、日记版本、摘要 provenance、continuity anchor、memory evidence、generation alternate ID 与任务等 logical ID 冲突时按数据库内容哈希建立持久导入会话映射，递归重写外键、声明式无外键引用和 JSON 引用；分支 scope 会拆分并重写根消息 ID，memory event 的多态 aggregate、事件 replay payload 内嵌实体 ID/canonical unique key/二次 JSON provenance 数组、continuity rollback 前后快照 ID 都按“表 + JSON 列 + discriminator”规则与 canonical 行同步映射，真实 V47 rebuild replay 后仍同时保留目标与导入投影，既不覆盖目标编辑也不留下旧来源 ID。FTS virtual/shadow 表不直接导入，canonical 行完成映射后统一重建三个 FTS 并执行完整性检查；失败、取消或锁定均回滚数据库并清理本次新建文件（包括尚未返回给外层的 AI staging 文件）；Personal 明文 staging 仅位于 Personal temp 且 finally 清理，从资源包入口识别出的备份同样注册统一任务屏障并贯通 token，锁定会中止 checkpoint 并等待恢复任务退出 | `ImportImagesScreen`, `packageImportService`, `backupService`, `managedBackupService`, `managedBackupIdMapping`, `backupManifestProtocol` |
| 系统目录导出 | SAF 目录选择、导出到系统文件夹、进度 | `BackupExportManagerScreen`, native media module |
| 存储统计 | 原图、缩略图、缓存、备份、回收站、IP 存储明细 | `StorageUsageScreen`, `storageUsageService`, `IpStorageDetailScreen` |
| 缓存清理 | image memory/disk cache、temp cache、daily startup cleanup；目录体积递归与相册 metadata 均走固定最多 4 worker，单条失败隔离，不再按目录宽度创建无界 Promise | `cacheCleanupService`, `boundedFileConcurrency`, `mediaImportOrderService` |
| SQLite 游标与缓存 | normal/personal 初始化幂等创建媒体/聊天复合索引；created/recent/video 使用稳定 keyset cursor 与 id tie-breaker；查询缓存采用 scope-aware LRU + TTL + global/normal/personal data epoch，结构写只推进所属空间，last-view 不推进；聊天 around-anchor 用单 CTE statement；`bench:media-db` 固定 100,000 行，`bench:chat-db` 固定 6000 消息/100 页并验证索引 plan | `database/db`, `databaseSpaceRegistry`, `imageRepository`, `assetRepository`, `aiThreadRepository`, `scopedLruCache`, `dataEpochService`, `scripts/benchmark-media-database-performance.cjs`, `scripts/benchmark-ai-message-repository.cjs` |

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
| Android release | version 同步、clean 后仅构建 ARM 真机 ABI、产物 ABI/签名校验、官网部署、GitHub Release；桌面图标使用预合成 legacy launcher bitmap，避免 adaptive-icon 前景遮罩裁切；Android 12+ 启动屏使用 transparent compact 前景和 `#4a7bf7` 纯色底，原素材缩小 12.5% 后按实际内容居中并保留至少 24% 透明边距，中心聊天气泡及图库、视频、相机、爱心、轨道和星点外围装饰完整保留；Expo 配置与原生五档密度资源由同一脚本/compact master 生成，避免 clean prebuild 与直接 Gradle 构建效果分叉 | `AGENTS.md`, `app.json`, `icons/splash_foreground_compact.png`, `scripts/generate-android-splash-assets.cjs`, `scripts/build-android-release.ps1`, `android/app/build.gradle` |
| Native bridge | SAF copy、zip entry、PDF render/text、video metadata、thumbnail、hash、可取消 direct speech recognition、share/open intent、`ComponentCallbacks2` memory-pressure event；原生 Activity/主题/媒体模块均由版本化 Expo config-plugin 模板生成 | `src/native/pixoryMediaModule.ts`, `plugins/withPixoryAndroidIntents.js`, `plugins/pixory-android-intents/templates/` |
| UI 基础组件 | toast、dialog、action sheet、empty state、form、header、cards、chips、sort menu | `src/components/` |
| 设计 tokens | spacing、rhythm、colors、radius、typography、metrics | `src/design/tokens/` |

---

## 12. 主要测试覆盖

| 领域 | 代表测试 |
| --- | --- |
| AI 聊天/Prompt/缓存/RAG/记忆/角色卡 | `tests/ai-*.test.cjs`, `tests/ai-context-budget-unit.test.cjs`, `tests/ai-bounded-concurrency-unit.test.cjs`, `tests/ai-embedding-service-integration.test.cjs`, `tests/ai-knowledge-repository-performance-integration.test.cjs`, `tests/ai-chat-performance-hardening-policy.test.cjs`, `tests/ai-message-repository-performance-policy.test.cjs`, `tests/ai-chat-streaming-tail-policy.test.cjs`, `tests/ai-chat-streaming-tail-contract.test.cjs`, `tests/ai-chat-streaming-tail-render-contract.test.cjs`, `tests/ai-chat-streaming-runtime-policy.test.cjs` |
| 生成崩溃恢复/Android 语音 | `tests/ai-generation-recovery.test.cjs`, `tests/ai-generation-repository-integration.test.cjs`, `tests/ai-direct-speech-policy.test.cjs`, Android `:app:compileDebugKotlin` |
| 陪伴运行时/日记/关系/梦境/思绪 | `tests/companion-*.test.cjs`, `tests/role-diary-*.test.cjs`, `tests/chat-and-diary-runtime-completeness-policy.test.cjs`, `tests/ai-conversation-coverage-repository-integration.test.cjs`, `tests/ai-thread-space-move-repository-integration.test.cjs` |
| Android 图标与启动图 | `tests/android-icon-splash-policy.test.cjs`, Android `:app:processDebugResources` / `:app:assembleDebug` |
| 资产导入与重复检测 | `asset-duplicate-v1-policy.test.cjs`, `package-import-policy.test.cjs`, `bounded-file-concurrency-unit.test.cjs`, `media-import-preflight-unit.test.cjs`, `media-import-extreme-integration-policy.test.cjs`, `media-import-file-picker-unit.test.cjs` |
| 批量整理 | `batch-organize-ux-policy.test.cjs` |
| 隐私系统 | `privacy-system-policy.test.cjs`, `final-personal-system-policy.test.cjs`, `route-space-policy.test.cjs` |
| 备份 | `backup-export-ux-policy.test.cjs`, `managed-backup-v2.test.cjs` |
| 存储与回收站 | `storage-usage-policy.test.cjs`, `trash-clear-policy.test.cjs`, `cache-cleanup-policy.test.cjs` |
| 媒体体验 | `mature-media-experience-policy.test.cjs`, `privacy-cover-viewer-policy.test.cjs`, `media-prefetch-policy-unit.test.cjs`, `media-reader-session-cache-unit.test.cjs`, `video-swipe-policy-unit.test.cjs`, `video-preload-pool-unit.test.cjs`, `video-pitch-preservation-unit.test.cjs`, `media-db-benchmark-policy.test.cjs` |
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


