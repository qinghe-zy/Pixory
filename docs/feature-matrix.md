# Pixory 功能矩阵

最后更新：2026-07-09（AI 聊天流式输出现代化）
适用版本：Pixory 2.6.1
维护要求：新增、删除或显著改变用户可见功能、后台能力、数据模型、导入导出流程、AI 能力、隐私/备份/发布流程时，必须同步更新本文档。

---

## 1. 文档用途

本文档是 Pixory 的全量功能索引，用于：

- 快速理解当前产品范围。
- 支撑后续需求拆分、测试计划、发布说明和交接。
- 防止功能迭代后文档滞后。
- 帮助 review 时判断改动是否遗漏相关模块、数据、测试或隐私边界。

本文档依据当前源码、测试和发布配置整理。若与代码冲突，以代码和可运行行为为准，并优先修正文档。

---

## 2. 顶层功能域

| 功能域 | 当前状态 | 主要用户价值 | 关键入口 |
| --- | --- | --- | --- |
| AI 陪伴聊天 | 已实现，重点方向 | 长聊天、角色扮演、记忆、资料上下文、分支和流式回复 | `AiHomeScreen`, `AiChatScreen`, `src/ai/` |
| 陪伴手帐与数据面板 | 已实现，未来可扩展 | 珍珠时间线、双轴古典排版字体、底层零延迟预取、SQLite C++聚合、多维数据详单、WebView原生深链拦截 | `AboutScreen`, `MilestonesDetailScreen`, `milestoneService.ts` |
| IP 资产库 | 已实现，基础能力 | 按 IP 管理图片、视频、分组、标签、备注和封面 | `HomeLibraryScreen`, `IpDetailScreen` |
| 图片/视频导入 | 已实现 | 批量导入、复制原文件、生成缩略图、重复检查、导入批次 | `ImportImagesScreen`, `imageImportService`, `videoImportService` |
| 图片浏览与整理 | 已实现 | 全部素材、分组素材、标签素材、收藏、最近查看、快速整理 | `AllImagesScreen`, `ImageViewerScreen`, `QuickOrganizeScreen` |
| 视频体验 | 已实现 | 视频详情、沉浸播放、手势、队列、横竖屏、进度偏好 | `VideoDetailScreen`, `VideoPlayerScreen` |
| 分组与标签 | 已实现 | 全局分组、IP 分组、标签管理、多选、筛选和结果页 | `GlobalGroupsScreen`, `TagsOverviewScreen` |
| 搜索 | 已实现 | 全局素材搜索、搜索历史、AI 聊天搜索 | `GlobalSearchScreen`, `AiChatSearchScreen` |
| 批量管理 | 已实现 | 多选、批量移动、批量打标签、批量整理、撤销 | `BatchManageImagesScreen`, `BatchImageOrganizePanel` |
| 重复检测 | 已实现 | exact hash、visual hash、重复审查、跳过导入 | `DuplicateReviewScreen`, `duplicateDetectionService` |
| 回收站 | 已实现 | 软删除、恢复、清空、过期清理 | `TrashScreen`, `trashService` |
| 备份/导入导出 | 已实现 | 全量备份、单 IP 备份、隐私备份、加密包、系统目录导出 | `BackupScreen`, `BackupExportManagerScreen`, `backupService` |
| 隐私空间 | 已实现 | normal/personal 双空间、密码、锁定、隔离数据库和文件 | `MeScreen`, `PersonalUnlockModal`, `personalSystemService` |
| 外部分享/打开 | 已实现 | Android share/open-with 接入，导入外部图片、视频、包文件 | `ShareCollectScreen`, `ArchiveReaderScreen`, native media module |
| 存储统计与维护 | 已实现 | 原图、缩略图、缓存、备份、回收站空间统计和清理 | `StorageUsageScreen`, `storageUsageService` |
| 更新与公告 | 已实现 | 远程版本检查、公告、官网下载、GitHub fallback | `updateCheckService`, `announcementService` |
| 官网与发布 | 已实现 | 官网下载页、更新 JSON、release notes、Android release workflow | `docs/`, `AGENTS.md` |
| 设计系统/基础组件 | 已实现 | 统一移动端 UI、空状态、按钮、表单、toast、action sheet | `src/components/`, `src/design/tokens/` |

---

## 3. AI 功能矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| Provider | DeepSeek、OpenAI/OpenAI-compatible、Gemini、Claude；真实当前模型验证、辅助模型列表、不可枚举模型的手动 ID/历史成功模型、聊天流、embedding | `src/ai/aiProviderService.ts`, `src/ai/providers/` |
| Provider 设置 | 全局默认 provider/model、连接 JSON 导入、保存/刷新/测试拆分、验证状态、手动模型 ID、中转网关模型别名、按空间隔离的 API Key SecureStore、当前会话模型复用全局配置/独立保存/测试/新增候选模型、删除手动/同步模型并清理默认值与会话悬挂引用、长按多选批量删除与同来源一键清理 | `AiProviderSettingsScreen`, `AiSessionConfigScreen`, `secureAiSettingsService`, `aiProviderService`, `aiProviderRepository` |
| 聊天线程 | normal/IP/knowledge-base 上下文，标题、模型快照、角色快照、归档、删除 | `aiChatService`, `aiThreadRepository` |
| 发送与生成 | 创建用户消息、assistant placeholder、stream provider、stop、retry、regenerate、rewrite；聊天附件会在本轮发送中进入上下文，图片按支持视觉的 provider 作为多模态 payload 发送，文档导入线程材料并注入摘录；聊天页不提供视频附件入口 | `aiChatService`, `aiGenerationManager`, `providers/*` |
| 流式性能 | generationId 防旧流污染、首 token live 显示、外部 streaming store、自适应合批追赶、查看历史时流式输出隔离、无感回到底部、低频 persist、后台 flush | `aiStreamingRuntime`, `aiStreamingMessageStore`, `AiChatScreen`, `AiStreamingMessageText` |
| 生成指标 | prompt/memory/retrieval/provider/first delta/UI patch/final persist 等 content-free metrics | `aiGenerationMetrics` |
| Prompt | stable/dynamic layer、角色卡 frame、material rules、history window、current user request | `promptBuilder` |
| Prompt/cache | stable prefix hash、retrieval hash、cache key、Anthropic breakpoint、禁止 diagnostics 污染 prompt/cache | `aiPromptCache` |
| 首 token pipeline | fast-path classifier、normal skip retrieval、资料模糊引用 fail-closed、keyword/full retrieval 分层 | `aiChatFastPath`, `aiRetrievalService` |
| 上下文预算 | 真实 model context window、历史裁剪、保护 role/current request/retrieval/memory | `aiContextBudget` |
| 角色卡 | 手动角色、SillyTavern PNG/JSON/V1/V2/V3 导入、sourceJson 保留、头像、标签、首句 | `sillyTavernRoleCardParser`, `aiRoleCardRepository` |
| 角色卡导出 | SillyTavern PNG 导出、续聊 Markdown、系统人设/记忆/上下文分离 | `sillyTavernRoleCardExporter`, `aiRoleCardContinuityExport` |
| 连续性导入 | 原生 Markdown 精确导入、外部文档接回、解析不足时模型辅助结构恢复、导入后分支接续、10 轮观察回退窗口、外部导入记忆审读门禁、显式 summary/profile/memory fan-out | `aiContinuityImport*`, `AiSessionConfigScreen`, `AiChatScreen` |
| 深度记忆 | 默认开启；更早维护本会话画像、自动捕获、手动记忆、profile、summary segment、维护队列、冲突协调、记忆板；全局用户画像在 AI 全局设置中维护；未配置远程记忆模型时使用本地轻量整理降级 | `aiMemory*`, `AiMemoryBoardScreen`, `AiProviderSettingsScreen` |
| RAG/材料 | thread material、IP snapshot、knowledge base、keyword/hybrid retrieval、citation 对齐 | `aiDocumentService`, `aiRetrievalService`, `aiKnowledgeRepository` |
| 文档解析 | manual text、txt、markdown、pdf、docx；chunking、reader | `documentParsers/`, `AiDocumentReaderScreen` |
| 分支 | edit/regenerate 分支、message versions、branch route metadata、分支树、采用主线 | `aiBranching`, `aiBranchTreeService`, `AiBranchTreeScreen` |
| 聊天搜索 | 当前路线 local exact/fuzzy 搜索，定位回聊天 | `AiChatSearchScreen`, `aiThreadRepository` |
| 收藏 | assistant 消息收藏、分支 scope 收藏、收藏列表 | `aiThreadRepository`, `AiMessageBubble` |
| Usage | provider usage 归一化、cached token ratio、线程/总览用量 | `aiProviderUsage`, `aiUsageAnalytics`, `AiUsageSummary` |
| 消息渲染 | Markdown (全新标记解析器防注入)、代码块、表格、原生图片附件画廊展示、HTML/CSS WebView、数学块、citation、thinking block、render cache | `AiMessageContent`, `AiMessageBubble`, `AiMarkdownReader` |
| AI UI | 工作台、聊天、会话设置、角色库、角色详情、材料、知识库、文档 reader、历史 | `src/screens/Ai*.tsx`, `src/components/ai/` |

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
| 源文件移动 | 支持可映射来源的 source move，失败时保护原数据 | `imageImportService` |
| 资源包导入 | zip/cbz 包选择、zip-slip 防护、图片识别、按文件夹映射分组 | `packageImportService`, `ArchiveReaderScreen` |
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
| 视频播放器 | 自动播放、顺序/随机播放模式、循环、播放/暂停、进度拖动、队列、横竖屏、锁定 | `VideoPlayerScreen`, `mediaExperiencePreferences` |
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
| 普通备份 | normal space 全量备份，包含数据库、原图、缩略图、AI 文档/角色资产 | `backupService`, `BackupScreen` |
| 单 IP 备份 | 指定 IP 备份 | `backupService` |
| 隐私备份 | personal plain、personal encrypted、all encrypted pack | `backupService`, `personalSystemService` |
| 备份导入 | plain backup merge、同名 IP 处理、encrypted personal pack 导入 | `backupService` |
| 系统目录导出 | SAF 目录选择、导出到系统文件夹、进度 | `BackupExportManagerScreen`, native media module |
| 存储统计 | 原图、缩略图、缓存、备份、回收站、IP 存储明细 | `StorageUsageScreen`, `storageUsageService`, `IpStorageDetailScreen` |
| 缓存清理 | image memory/disk cache、temp cache、daily startup cleanup | `cacheCleanupService` |

---

## 10. 隐私空间矩阵

| 子域 | 功能 | 主要文件 |
| --- | --- | --- |
| 空间模型 | normal/personal 双数据库/双文件目录，route 携带 space | `database/db`, `route-space-policy`, `App.tsx` |
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
| Android release | version 同步、Gradle assembleRelease、签名校验、官网部署、GitHub Release | `AGENTS.md`, `android/app/build.gradle` |
| Native bridge | SAF copy、zip entry、PDF render/text、video metadata、thumbnail、hash、speech recognition、share/open intent | `src/native/pixoryMediaModule.ts` |
| UI 基础组件 | toast、dialog、action sheet、empty state、form、header、cards、chips、sort menu | `src/components/` |
| 设计 tokens | spacing、rhythm、colors、radius、typography、metrics | `src/design/tokens/` |

---

## 12. 主要测试覆盖

| 领域 | 代表测试 |
| --- | --- |
| AI 聊天/Prompt/缓存/RAG/记忆/角色卡 | `tests/ai-*.test.cjs` |
| 资产导入与重复检测 | `asset-duplicate-v1-policy.test.cjs`, `package-import-policy.test.cjs` |
| 批量整理 | `batch-organize-ux-policy.test.cjs` |
| 隐私系统 | `privacy-system-policy.test.cjs`, `final-personal-system-policy.test.cjs`, `route-space-policy.test.cjs` |
| 备份 | `backup-export-ux-policy.test.cjs` |
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
- 功能下线：标记为“移除”或删除条目，并说明替代路径。
- 发布前：检查本文档是否与 release notes、README、测试文件和源码入口一致。

## 14. 留给未来的数据拓展接口

2.5.6 版本重构了 \milestoneService.ts\ 与 Markdown 生成引擎，已经预留了极强的横向扩展性：

1. **更多数据聚合接口**
   目前底层已经通过 \
unWithDatabaseSpace\ 支持了跨空间的 SQLite 聚合。未来如果要增加“最长连续聊天天数”、“总使用时长”等维度的统计，只需在 \getAppMilestones\ 中新增一条轻量级查询。
2. **多模态图表/年度报告接口**
   在 \generateMilestonesDetailMarkdown\ 方法中，我们可以注入基于 Mermaid 或者 Chart.js 的图表语法。现有的 \AiMarkdownReader\ 已具备拦截拓展标签的能力，未来可以通过极小改动在阅读器中直接渲染“活跃度热力图”、“情感倾向饼图”。
3. **沉浸式深链分发机制 (Deep Link Interception)**
   目前的 WebView \onLinkPress\ 已支持了 \pixory://ip/...\ 和 \pixory://thread/...\。未来若要打通从手帐直接跳入“某个回忆节点 (Memory)”、“某张指定的图片 (Image)”，只需在 URL Schema 里新增对应的前缀，在 \MilestonesDetailScreen\ 中增加一行业务路由推送即可。
