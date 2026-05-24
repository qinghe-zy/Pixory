# Pixory 产品宣传手册与项目招标说明书

最后更新：2026-05-23
适用版本：Pixory 2.1.17
维护方式：随功能、版本、测试和发布记录持续更新

---

## 1. 文档定位

本文档用于对 Pixory 项目进行完整、可复用、可持续更新的产品级说明。它同时面向以下场景：

- 产品宣传手册：用于说明 Pixory 的产品定位、目标用户、核心价值、功能亮点和使用场景。
- 招标书/项目方案：用于说明项目建设目标、技术路线、功能范围、实施方法、交付内容、验收依据和维护机制。
- 内部更新资料：用于后续版本迭代时持续补充功能变化、实现依据、风险边界和测试记录。

本文档以当前仓库中的源码、配置、页面、服务层、数据库 schema、Android 原生模块和测试文件为主要依据。README、AGENTS、历史计划和说明文档只作为辅助线索；当文档描述与代码不一致时，应优先回到代码和可运行行为重新核验。

本文档不会将未实现内容描述为已完成能力；对于已有代码基础但仍可继续演进的方向，会使用“可选能力”“演进方向”“建议扩展”等措辞。

---

## 2. 项目概述

### 2.1 项目名称

Pixory

### 2.2 产品定位

Pixory 是一款 Android-first、本地优先的 IP 图片与视觉资产管理应用，面向创作者、运营人员、品牌视觉管理者、小型创意团队和个人素材收藏用户。

它帮助用户将本地图片、视频等视觉资产按照 IP、分组、标签、收藏、备注、最近查看和元数据进行系统化整理，同时最大程度保护原始文件质量与本地数据完整性。

从现有代码看，Pixory 当前已经形成“本地资产管理 + Android 媒体处理 + 备份迁移 + 隐私空间 + 可选 AI 材料辅助”的产品形态。它的核心价值是：在移动端环境中，安全、清晰、可恢复地管理视觉资产，并为后续围绕整理、协作、智能检索、内容流转等方向留下扩展空间。

### 2.3 建设目标

Pixory 的建设目标是形成一套面向 Android 移动端的本地视觉资产管理系统，重点解决以下问题：

- 图片和视频素材长期散落在系统相册、文件夹、聊天记录和压缩包中，难以按项目或 IP 管理。
- 原图容易在整理、转存、压缩或编辑过程中被替换、压缩、裁剪或误删。
- 大批量素材缺少导入记录、分组依据、标签索引和可追踪的整理流程。
- 手机端素材库缺少真正适合长期使用的回收站、备份、导出、重复检查和存储统计能力。
- 个人敏感素材与普通素材混放，缺少独立空间与基础隐私保护。

### 2.4 核心原则

Pixory 的产品和技术设计遵循以下优先级：

```text
本地可靠性
> 原始文件安全
> 数据一致性
> 简单清晰的用户体验
> 精致克制的移动端界面
> 后续扩展能力
```

---

## 3. 目标用户与典型场景

### 3.1 目标用户

| 用户类型 | 典型需求 |
| --- | --- |
| IP 创作者 | 按角色、主题、视觉系列管理设定图、海报、场景图、表情包等素材 |
| 运营/内容人员 | 快速查找节日、活动、投放、社媒用途素材 |
| 品牌视觉管理者 | 维护不同品牌形象或视觉资产集合，减少重复与错用 |
| 个人收藏用户 | 整理大量本地图片和视频，保留原图质量，降低素材散落和误删风险 |
| 小团队资料整理者 | 通过备份包、资源包和导入记录交接素材资产 |

### 3.2 典型使用场景

#### 场景一：IP 素材归档

用户创建一个 IP，将角色立绘、节日活动、运营海报、场景背景、表情包等素材批量导入 Pixory。导入时，原图被复制到应用私有目录，系统生成独立缩略图，并写入 SQLite 元数据。后续用户可以按分组、标签、收藏和搜索快速定位素材。

#### 场景二：批量整理与补充元数据

用户一次性导入大量素材后，可进入导入批次、快速整理、批量管理等页面，为素材统一添加分组、标签、收藏状态或备注，并查看未分组、未打标、无备注、疑似重复等整理状态。

#### 场景三：本地备份与迁移

用户可以创建完整备份、单个 IP 备份、普通备份包或加密包。有效备份包含 SQLite 数据库、原图目录、缩略图目录和 manifest 文件，确保未来恢复或迁移时不仅有预览图，也保留原始文件。

#### 场景四：回收站恢复与谨慎删除

删除素材默认进入回收站。用户可以恢复误删素材，也可以在明确确认后清空回收站。清空时系统只物理删除 Pixory 管理目录内的原图和预览文件，避免误删外部文件。

#### 场景五：隐私空间管理

用户可以设置隐私空间密码，在普通空间之外维护独立的 personal 数据库和文件目录。隐私空间支持解锁、锁定、后台超时锁定、允许系统截屏、独立备份与重置。

#### 场景六：材料问答辅助

对于需要整理文本资料的用户，Pixory 提供可选的 AI 材料与知识库辅助能力。用户可导入 txt、Markdown、PDF、docx 或基于 IP 生成结构化资料，进行分段、检索和问答。该能力已经在当前代码中形成基础模块，后续可继续向智能整理、素材说明生成、知识库检索和创作辅助方向演进。

---

## 4. 产品功能总览

### 4.1 功能地图

| 模块 | 功能范围 | 当前状态 |
| --- | --- | --- |
| IP 资产库 | 创建、编辑、收藏、封面、统计、删除、详情 | 已实现 |
| 分组管理 | 创建分组、编辑分组、分组封面、置顶、全局分组 | 已实现 |
| 图片资产管理 | 批量导入、原图保存、缩略图、详情、编辑、收藏、备注 | 已实现 |
| 视频资产管理 | 批量导入、封面生成、详情、播放、进度与播放体验 | 已实现 |
| 标签系统 | 创建、展示、搜索、筛选、添加、移除、标签结果页 | 已实现 |
| 搜索与筛选 | 全局搜索、标签结果、收藏、最近查看、排序、筛选 | 已实现 |
| 批量整理 | 批量选择、快速整理、导入批次、批量编辑 | 已实现 |
| 重复检查 | 内容 hash、视觉 hash、精确重复、相似图片复核 | 已实现 |
| 回收站 | 软删除、恢复、清空、过期清理、清理失败记录 | 已实现 |
| 备份与导入 | 完整备份、IP 备份、备份导入、加密包、资源包导入 | 已实现 |
| 存储管理 | 原图、预览、临时缓存、备份、回收站、按 IP 统计 | 已实现 |
| 隐私空间 | 独立数据库、独立文件目录、密码、锁定、允许截屏 | 已实现 |
| 外部入口 | 系统分享收集、外部视频打开、压缩包阅读入口 | 已实现 |
| 更新公告 | 远程更新 JSON、远程公告 JSON、应用内提示 | 已实现 |
| AI 材料辅助 | 供应商配置、角色卡、知识库、材料解析、检索问答 | 已实现为可选能力 |

---

## 5. 核心功能说明

### 5.1 IP 资产库

IP 是 Pixory 的顶层管理单位，可代表角色、品牌、主题、视觉身份或创意系列。每个 IP 下可包含图片、视频、分组、标签、备注、封面和统计数据。

主要能力：

- 创建、编辑、删除 IP。
- 设置 IP 描述、收藏状态和封面素材。
- 统计图片数量、视频数量、分组数量、标签数量和总占用空间。
- 支持最近更新、收藏和搜索过滤。
- IP 删除默认进入回收站状态，避免误删带来的数据损失。

实现依据：

- 数据表：`ips`
- 类型定义：`src/database/types.ts`
- Repository：`src/database/repositories/ipRepository.ts`
- 主要页面：`HomeLibraryScreen`、`IpDetailScreen`、`CreateIpScreen`、`EditIpScreen`

### 5.2 分组管理

分组是 IP 内部轻量组织方式，适合按季节、场景、节日、用途或自定义维度管理素材。

主要能力：

- 支持默认分组类型：Seasonal、Scene、Festival、Usage、Custom。
- 支持一个素材关联多个分组。
- 支持分组说明、排序、置顶和封面。
- 支持 IP 内分组页和全局分组总览。

实现依据：

- 数据表：`groups`、`image_groups`
- Repository：`src/database/repositories/groupRepository.ts`
- 主要页面：`GroupOverviewScreen`、`GroupImagesScreen`、`GlobalGroupsScreen`、`EditGroupScreen`

### 5.3 图片导入与原图保护

图片批量导入是 Pixory 的核心流程。导入时不会压缩、裁剪、重编码或覆盖原始图片，而是将原图复制到 Pixory 私有目录，并生成独立缩略图作为预览。

标准导入流程：

```text
选择图片
→ 校验目标 IP / 分组
→ 生成内部文件名
→ 复制原图到 app 私有 originals 目录
→ 读取尺寸、文件大小、MIME 类型
→ 计算内容 hash 与视觉 hash
→ 判断重复导入策略
→ 生成独立缩略图
→ 写入 SQLite 记录
→ 写入标签关系与导入批次明细
→ 返回导入结果
```

保护机制：

- `allowsEditing: false`，避免系统选择器裁剪图片。
- `quality: 1` 与 Current representation，尽量保留当前系统资产表示。
- 原图通过 `copyOriginalToAppStorage` 复制进入私有目录。
- 缩略图由 `thumbnailService` 独立生成，不替代原图。
- 导入失败会清理已写入的数据库记录、原图和缩略图，避免半成品残留。
- Android content URI 复制失败时，会回退到原生流式复制。

实现依据：

- 服务：`src/services/imageImportService.ts`
- 文件存储：`src/services/fileStorageService.ts`
- 缩略图：`src/services/thumbnailService.ts`
- 原生桥接：`android/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt`
- 页面：`ImportImagesScreen`、`ImportResultScreen`、`ImportBatchReviewScreen`

### 5.4 视频资产管理

Pixory 已将视频纳入统一资产体系。视频作为 `image_assets` 表中的 `mediaType = 'video'` 资产保存，与图片共享 IP、分组、标签、收藏、备注、导入批次和回收站机制。

主要能力：

- 批量选择并导入视频。
- 原视频复制到 Pixory 私有 originals 目录。
- 读取视频宽高、时长、旋转角度、MIME 类型和文件大小。
- 生成视频封面缩略图。
- 记录导入批次、成功/失败/跳过明细。
- 视频详情页与视频播放器支持本地查看。
- 支持外部视频打开入口。
- 支持保存视频到系统相册。

实现要点：

- 大文件复制通过原生 `copyUriToFileWithProgress` 执行，并向 JS 层回传进度。
- 视频元数据和封面由 Android `MediaMetadataRetriever` 读取。
- 导入先写入临时目录，校验成功后再移动到 originals 目录。
- 出错时删除临时文件、原文件目标和封面目标，避免残留。

实现依据：

- 服务：`src/services/videoImportService.ts`
- 原生模块：`PixoryMediaModule.kt`
- 页面：`VideoDetailScreen`、`VideoPlayerScreen`

### 5.5 标签系统

标签是用户自定义的轻量索引，不设计复杂分类、别名、合并规则或大型 taxonomy。

主要能力：

- 创建标签。
- 添加或移除素材标签。
- 标签总览。
- 标签结果页。
- 导入时批量写入标签。
- 搜索和筛选中使用标签条件。

实现依据：

- 数据表：`tags`、`image_tags`
- Repository：`src/database/repositories/tagRepository.ts`
- 组件：`TagChip`、`TagMultiSelectPanel`
- 页面：`TagsOverviewScreen`、`TagResultScreen`

### 5.6 搜索、筛选与最近查看

Pixory 提供面向素材库长期使用的查找能力。

主要能力：

- 全局搜索 IP、分组、标签和素材。
- 按文件名、备注、IP、分组、标签等条件查询素材。
- 收藏视图。
- 最近查看视图。
- 按创建时间、更新时间、最近查看、文件名、文件大小等排序。
- 横图、竖图、方图、全景图等比例筛选。
- 图片/视频/全部媒体类型过滤。

实现依据：

- 类型：`ImageListQueryOptions`
- Repository：`src/database/repositories/imageRepository.ts`
- 页面：`GlobalSearchScreen`、`FavoritesScreen`、`RecentViewedScreen`、`AllImagesScreen`

### 5.7 批量整理与导入批次

批量整理用于降低大量素材导入后的管理成本。

主要能力：

- 导入批次记录。
- 每个批次记录成功、失败、跳过明细。
- 批量选择素材。
- 批量移动分组、补充标签、收藏、备注。
- 快速整理视图展示未分组、未打标、无备注和疑似重复素材。
- 批量操作支持撤销快照。

实现依据：

- 数据表：`import_batches`、`import_batch_items`
- 服务：`src/services/batchUndoService.ts`
- 页面：`ImportBatchHistoryScreen`、`ImportBatchReviewScreen`、`BatchManageImagesScreen`、`QuickOrganizeScreen`

### 5.8 重复素材检查

Pixory 支持重复素材识别，以减少素材库膨胀和误导入。

主要能力：

- 内容 hash：用于识别精确重复文件。
- 视觉 hash：用于识别相似图片。
- 导入时可选择导入全部、跳过精确重复、跳过相似图片或取消导入。
- 可运行重复扫描补算缺失 hash。
- 重复复核页面用于人工判断。

实现依据：

- 服务：`src/services/duplicateDetectionService.ts`
- 原生能力：`computeFileSha256`、`computeImageDHash`
- 页面：`DuplicateReviewScreen`

### 5.9 回收站与删除安全

Pixory 默认采用软删除。

删除策略：

```text
用户删除素材
→ 写入 deletedAt
→ 从普通列表隐藏
→ 进入回收站
→ 用户可恢复
→ 用户清空回收站时才物理删除文件
```

安全机制：

- 清空回收站前，数据库删除和文件删除分阶段执行。
- 仅删除 Pixory 私有 originals/thumbnails 目录下的受管理文件。
- 删除失败会记录到 `trash_cleanup_failures`。
- 支持 30 天过期回收站项目的空闲清理。

实现依据：

- 服务：`src/services/trashService.ts`
- 数据表：`trash_cleanup_failures`
- 页面：`TrashScreen`

### 5.10 备份、导出与导入

Pixory 将本地备份视为核心可靠性能力。有效备份必须包含数据库、原图、缩略图和 manifest 文件，而不是只有预览或导出后的缩略图。

备份类型：

- 完整备份：导出当前空间完整数据库、原图、缩略图和 manifest。
- 单 IP 备份：导出指定 IP 及其素材、分组、标签、导入批次信息。
- Personal 普通备份：隐私空间验证后导出。
- 加密包：支持 personal 或 all 范围的加密包。
- 系统目录导出：通过 SAF 将备份复制到用户选择的系统目录。

导入能力：

- 普通 Pixory 备份包合并导入。
- personal 加密包在隐私空间内合并导入。
- IP 名称冲突策略：合并已有、创建重命名、取消或询问。
- 导入时重建 IP、分组、素材、标签、批次、封面关系。

实现依据：

- 服务：`src/services/backupService.ts`
- 存储统计：`src/services/storageUsageService.ts`
- 页面：`BackupScreen`、`BackupExportManagerScreen`

### 5.11 资源包导入

Pixory 支持通过 `.zip` 或 `.pixorypack` 导入资源包。

主要能力：

- 使用系统文档选择器选择资源包。
- 拷贝到 Pixory 私有 temp 目录再处理。
- 校验包体积、解压后体积、文件数量、目录深度和剩余空间。
- 防止不安全路径穿越。
- 通过 magic bytes 识别图片/视频类型。
- 支持将目录结构映射为 Pixory 分组。
- 如果检测到 Pixory manifest，则走备份导入逻辑。

安全限制：

- 单包大小上限：200 MB。
- 解压后大小上限：800 MB。
- 文件数量上限：1000。
- 目录深度上限：8。
- 导入后清理临时目录。

实现依据：

- 服务：`src/services/packageImportService.ts`
- 页面：`ShareCollectScreen`、`ArchiveReaderScreen`、`ImportBatchReviewScreen`

### 5.12 存储使用与缓存维护

Pixory 提供本地存储可视化能力，帮助用户理解资产库占用。

统计类别：

- 原始素材。
- 预览缓存。
- 临时缓存。
- 备份导出。
- 回收站。

主要能力：

- 汇总总占用和各类占用。
- 统计图片/视频数量。
- 按 IP 展示存储占用。
- 查看 IP 存储明细。
- 管理备份导出项。
- 清理旧临时文件和图片缓存。

实现依据：

- 服务：`src/services/storageUsageService.ts`
- 缓存：`src/services/cacheCleanupService.ts`
- 页面：`StorageUsageScreen`、`OriginalStorageScreen`、`IpStorageDetailScreen`

### 5.13 隐私空间

Pixory 提供 normal 与 personal 两个空间。personal 空间拥有独立数据库、独立文件目录和密码验证流程。

主要能力：

- 设置隐私空间密码。
- 验证密码并进入隐私模式。
- 切回普通模式。
- 修改密码。
- 重置隐私空间数据。
- 后台超过 60 秒自动锁定。
- 隐私模式允许系统截屏，同时保留后台超过 60 秒自动锁定。
- 隐私任务使用 task token，锁定后中止仍在运行的隐私任务。

实现依据：

- 数据库：`pixory.sqlite`、`pixory_personal.sqlite`
- 服务：`src/services/personalSystemService.ts`
- 入口：`App.tsx`
- 组件：`PersonalUnlockModal`
- 存储目录：`pixory/`、`pixory_personal/`

说明：

当前隐私空间提供基础本地隔离、密码校验、后台锁定和独立存储。当前版本允许系统截屏，除加密导出包外，不应将其表述为“端到端加密本地保险箱”。

### 5.14 外部分享与打开入口

Pixory 支持从 Android 系统入口接收外部内容。

主要能力：

- 系统分享入口收集图片、视频等素材。
- 外部视频打开后进入 Pixory 视频播放器。
- ZIP/CBZ 等压缩包可进入阅读入口。
- `.pixorypack` 可识别为 Pixory 包入口。
- 外部入口返回时退出 Pixory，不打断来源应用阅读流程。

实现依据：

- Android 原生入口：`PixoryShareActivity.kt`
- 原生模块：`PixoryMediaModule.kt`
- 入口路由：`App.tsx`
- 页面：`ShareCollectScreen`、`ArchiveReaderScreen`、`VideoPlayerScreen`

### 5.15 更新检查与远程公告

Pixory 支持通过 GitHub raw JSON 提供轻量远程更新和公告。

更新文件：

- `docs/update-version.json`

公告文件：

- `docs/announcement.json`

主要能力：

- 应用启动后读取远程更新 JSON。
- 对比当前版本号和 versionCode。
- 有新版本时展示更新信息和下载链接。
- 没有更新时读取远程公告。
- 已忽略的版本或已关闭的公告不重复打扰用户。

实现依据：

- 服务：`src/services/updateCheckService.ts`
- 服务：`src/services/announcementService.ts`
- 配置：`app.json`

### 5.16 可选 AI 材料与知识库辅助

Pixory 当前包含一套可选 AI 材料工作台能力，用于围绕 IP 资料、文档和知识库进行检索与问答。从现有代码看，它已经覆盖供应商配置、角色卡、资料导入、文档切分、检索和会话等基础链路，可作为后续智能整理和创作辅助能力的基础。

主要能力：

- AI 供应商配置：DeepSeek、OpenAI、Gemini、Claude、OpenAI Compatible、自定义。
- API Key 使用 SecureStore 保存。
- 支持角色卡、会话配置、历史会话、上下文绑定。
- 支持知识库创建。
- 支持导入手动文本、txt、Markdown、PDF、docx。
- 聊天输入支持图片、视频和文档附件。
- 普通聊天默认不写入角色指令，只有用户配置后才保存系统提示。
- 会话保存设置提供成功或失败反馈。
- 新会话可根据第一条用户消息自动生成标题。
- 消息操作以气泡下方小按钮呈现，支持复制、用户消息重写和助手回复重新生成。
- 历史会话支持左滑归档，重命名移动到长按菜单，减少列表常驻操作占用。
- 支持根据 IP 元数据生成结构化资料文档。
- 文档解析后按固定长度分段。
- 支持关键词检索；如果配置 embedding provider，可生成向量并进行检索增强。
- 支持引用列表与文档阅读器。

实现依据：

- 数据表：`ai_providers`、`ai_role_cards`、`ai_knowledge_bases`、`ai_threads`、`ai_messages`、`ai_documents`、`ai_chunks`、`ai_embeddings`、`ai_message_citations`
- 服务：`src/ai/aiDocumentService.ts`、`src/ai/aiChatService.ts`、`src/ai/aiProviderService.ts`
- 页面：`AiHomeScreen`、`AiChatScreen`、`AiKnowledgeBaseScreen`、`AiMaterialImportScreen`、`AiMaterialListScreen`

当前实现说明：

- 当前代码中的 AI 能力以文本资料、知识库、会话、检索和引用为主。
- 供应商网络请求取决于用户配置的 provider、API Key 和模型。
- 当前仓库未实现“服务器端集中处理”架构，也未看到必须依赖自建服务器才能完成核心资产管理的代码路径。
- 相关供应商能力需要用户自行配置 API Key 和模型。

---

## 6. 产品亮点

### 6.1 原图安全优先

Pixory 的导入逻辑以原始文件保护为第一原则。原图复制进入私有目录，缩略图和封面作为独立文件存在，不替代原图，不将缩略图当作原图使用。

### 6.2 真正适合移动端长期使用

Pixory 不是简单相册列表，而是围绕 IP、分组、标签、导入批次、收藏、最近查看、回收站、备份、重复检查和存储统计构建的长期资产管理工具。

### 6.3 离线优先和本地可控

核心资产管理不依赖自建服务器或后端数据库。SQLite 保存结构化元数据，本地文件系统保存原图和预览；账号、同步、协作、云备份、AI 生成等方向可作为后续产品演进议题，但不应让现有本地可靠性和原图安全能力退化。

### 6.4 数据一致性可追踪

Pixory 使用导入批次、导入明细、数据库迁移、背景任务、备份 manifest、hash 和清理失败记录增强可追踪性，便于排查导入、恢复和删除问题。

### 6.5 Android 大文件处理优化

针对 Android content URI、大文件复制、视频封面、PDF 渲染、SAF 导出等场景，Pixory 提供原生模块辅助，避免把重 IO 全部压在 JS 层。

### 6.6 备份能力覆盖完整数据

备份包含数据库、原图、缩略图和 manifest，并支持按全量或单 IP 导出。对本地应用而言，备份不是附属功能，而是可靠性闭环的一部分。

### 6.7 隐私空间基础保护

普通空间与隐私空间在数据库和文件目录上分离，并提供密码、后台锁定、任务 token 失效等机制；当前版本允许系统截屏，适合在验收、反馈和日常记录时保留用户主动截图能力。

### 6.8 UI 方向清晰

Pixory 的视觉方向是 clean、calm、premium、practical，强调浅色、克制、信息密度和真实移动端产品感。后续如果扩展更多内容流转、智能辅助或协作能力，也应保持清晰可信的工具型产品气质。

---

## 7. 技术架构

### 7.1 技术栈

| 类别 | 技术 |
| --- | --- |
| 应用框架 | Expo 54 |
| UI 框架 | React Native 0.81、React 19 |
| 语言 | TypeScript |
| 数据库 | expo-sqlite、SQLite WAL、foreign keys |
| 文件系统 | expo-file-system |
| 图片选择 | expo-image-picker、expo-media-library |
| 文档选择 | expo-document-picker |
| 视频能力 | expo-video、Android MediaMetadataRetriever |
| 安全存储 | expo-secure-store |
| 压缩包 | react-native-zip-archive |
| Android 原生扩展 | Kotlin/Java React Native Module |
| 测试 | Node.js built-in test runner |

### 7.2 本地数据架构

Pixory 使用 SQLite 保存结构化数据，使用文件系统保存实际媒体文件。

推荐目录结构：

```text
AppData/
├─ pixory/
│  ├─ originals/
│  │  └─ ip_{ipId}/
│  ├─ thumbnails/
│  │  └─ ip_{ipId}/
│  ├─ exports/
│  ├─ temp/
│  ├─ profile/
│  ├─ ai_documents/
│  └─ ai_role_avatars/
├─ pixory_personal/
│  ├─ originals/
│  ├─ thumbnails/
│  ├─ exports/
│  ├─ temp/
│  ├─ ai_documents/
│  └─ ai_role_avatars/
├─ SQLite database/
│  ├─ pixory.sqlite
│  └─ pixory_personal.sqlite
```

### 7.3 数据库设计

当前数据库版本为 18，使用增量迁移维护结构变化。

核心数据表：

| 表 | 作用 |
| --- | --- |
| `ips` | IP 资产库 |
| `groups` | IP 内分组 |
| `image_assets` | 图片/视频资产统一记录 |
| `tags` | 标签 |
| `image_tags` | 素材与标签关系 |
| `image_groups` | 素材与多分组关系 |
| `import_batches` | 导入批次 |
| `import_batch_items` | 导入批次内每个文件的成功、失败、跳过记录 |
| `app_settings` | 应用设置 |
| `background_tasks` | 背景任务状态 |
| `trash_cleanup_failures` | 回收站清理失败记录 |
| `ai_*` | 可选 AI 材料、会话、知识库和引用相关数据 |

数据库配置：

- 启用 WAL：提升移动端本地数据库并发与可靠性。
- 启用 foreign keys：保证关联数据一致性。
- 使用 `PRAGMA user_version` 管理迁移版本。

实现依据：

- `src/database/schema.ts`
- `src/database/db.ts`

### 7.4 文件处理架构

Pixory 将文件处理分为四层：

1. JS 服务层：组织导入、备份、清理、存储统计等业务流程。
2. Expo 文件层：处理普通文件复制、目录创建、读取和删除。
3. Android 原生模块：处理大文件流式复制、视频元数据、视频封面、PDF 渲染、PDF 文本提取、SAF 导出等。
4. SQLite 记录层：写入文件路径、尺寸、大小、MIME、hash、分组、标签和状态。

### 7.5 路由与页面架构

当前项目使用自维护路由栈，而不是单纯依赖文件式路由。`App.tsx` 管理根标签、普通空间/隐私空间、外部入口、更新公告、后台锁定和页面切换。

主要根标签：

- 主页资产库。
- 分组。
- 标签。
- 整理。
- 我的/设置。
- AI 辅助入口。

主要页面由 `src/screens/` 维护，公共 UI 由 `src/components/` 维护，设计 token 位于 `src/design/tokens/`。

---

## 8. 安全、可靠性与数据保护

### 8.1 原图保护

- 原图复制到私有 originals 目录。
- 缩略图存放在 thumbnails 目录。
- 预览文件不替代原图。
- 导入失败时清理半成品。
- 备份包含原图，而不是只包含缩略图。

### 8.2 删除保护

- 默认软删除。
- 清空回收站前可恢复。
- 物理删除限制在 Pixory 管理目录内。
- 删除失败记录进入数据库，便于后续核查。

### 8.3 资源包安全

- 限制包体积、解压体积、文件数量和目录深度。
- 校验剩余空间。
- 检查路径穿越。
- 通过 magic bytes 识别文件类型。
- 临时目录在导入结束后清理。

### 8.4 隐私空间保护

- 密码 salt + SHA-256 hash 存储在 SecureStore。
- 连续失败达到 5 次后临时锁定。
- 后台超时锁定。
- 允许系统截屏。
- 独立数据库和文件目录。

### 8.5 大文件处理

- Android 原生 IO 线程池处理复制和导出。
- 复制失败时清理目标文件。
- SAF 导出使用原生流式复制。
- 视频封面生成和元数据读取在原生层执行。

---

## 9. 项目实施方法

### 9.1 开发原则

- Android 优先。
- 核心流程离线可用。
- 不把核心资产管理改造成依赖自建服务器才能运行的流程；服务器能力若未来出现，应作为可选增强或分发辅助，而不是破坏本地数据可靠性的前提条件。
- 不把大媒体文件写入 SQLite。
- 避免宽泛重构和无关 UI 重写。
- 新 UI 使用 `src/design/tokens/` 内的颜色、间距、圆角、字体、尺寸和节奏 token。

### 9.2 关键实现流程

#### 图片导入实现流程

```text
ImagePicker 选择
→ buildImageAssetFromPickedFile
→ copyOriginalToAppStorage
→ computeFileSha256 / computeImageDHash
→ generateThumbnail
→ imageRepository.create
→ tagRepository.replaceImageTags
→ importBatchRepository.createItem
```

#### 视频导入实现流程

```text
ImagePicker 选择视频
→ copyUriToFileWithProgress 复制到 temp
→ 校验文件可用性
→ computeFileSha256
→ move 到 originals
→ getNativeVideoMetadata
→ createNativeVideoThumbnail
→ assetRepository.createVideo
→ 写入标签与导入批次
```

#### 备份实现流程

```text
checkpoint SQLite
→ 创建 backup shell
→ serialize 数据库
→ 复制 originals
→ 复制 thumbnails / covers
→ 写入 manifest.json
→ 可选导出到 SAF 系统目录
```

#### 回收站清空实现流程

```text
读取 deletedAt 素材
→ 数据库永久删除
→ 仅删除 Pixory 管理目录内文件
→ 记录删除失败
→ 返回清理结果
```

---

## 10. 招标响应式功能清单

### 10.1 基础能力

| 编号 | 功能项 | 响应说明 |
| --- | --- | --- |
| F-001 | 本地 IP 资产库 | 支持创建、编辑、收藏、封面、统计和软删除 |
| F-002 | 图片批量导入 | 支持多图选择、复制原图、生成缩略图、写入元数据 |
| F-003 | 原图无损保存 | 不压缩、不裁剪、不重编码、不覆盖原图 |
| F-004 | 分组管理 | 支持 IP 内分组、全局分组、封面和置顶 |
| F-005 | 标签管理 | 支持标签创建、添加、移除、搜索和结果页 |
| F-006 | 收藏与最近查看 | 支持常用素材快速访问 |
| F-007 | 全局搜索 | 支持跨 IP、分组、标签、素材检索 |
| F-008 | 批量整理 | 支持批量选择和集中编辑 |
| F-009 | 导入批次 | 支持导入结果、失败与跳过明细追踪 |
| F-010 | 重复检查 | 支持精确重复和相似图片检查 |

### 10.2 可靠性能力

| 编号 | 功能项 | 响应说明 |
| --- | --- | --- |
| R-001 | SQLite 本地数据库 | 结构化元数据持久化 |
| R-002 | 私有文件目录 | 原图、缩略图、导出、临时文件分目录管理 |
| R-003 | 备份导出 | 支持完整备份和单 IP 备份 |
| R-004 | 备份导入 | 支持合并导入和关系重建 |
| R-005 | 回收站 | 支持软删除、恢复和清空 |
| R-006 | 删除失败追踪 | 清理失败记录入库 |
| R-007 | 存储统计 | 支持按类别和按 IP 查看空间占用 |
| R-008 | 缓存清理 | 支持旧临时文件和图片缓存清理 |

### 10.3 Android 能力

| 编号 | 功能项 | 响应说明 |
| --- | --- | --- |
| A-001 | Android 权限配置 | 支持相册、图片、视频和文档相关权限 |
| A-002 | content URI 处理 | 支持原生流式复制 |
| A-003 | SAF 导出 | 支持导出到系统选择目录 |
| A-004 | 视频元数据 | 支持读取宽高、旋转、时长、MIME |
| A-005 | 视频封面 | 支持原生生成视频封面 |
| A-006 | 外部打开 | 支持外部视频、压缩包入口 |
| A-007 | 系统分享 | 支持接收系统分享素材 |

### 10.4 可选扩展能力

| 编号 | 功能项 | 响应说明 |
| --- | --- | --- |
| E-001 | 隐私空间 | 支持独立 personal 空间 |
| E-002 | 加密备份包 | 支持 personal/all 加密包 |
| E-003 | 资源包导入 | 支持 zip/pixorypack 包导入 |
| E-004 | AI 材料辅助 | 支持资料导入、切分、检索、问答 |
| E-005 | 远程更新 | 支持轻量 JSON 更新提示 |
| E-006 | 远程公告 | 支持轻量公告配置 |

---

## 11. 非功能指标建议

| 指标 | 建议标准 |
| --- | --- |
| 离线可用性 | IP、图片、视频、分组、标签、搜索、回收站、备份等核心流程应离线可用 |
| 原图保护 | 导入后原图文件大小与原始复制结果一致，不使用缩略图替代 |
| 数据一致性 | 素材记录、文件路径、标签关系、分组关系、导入批次可回读 |
| 删除安全 | 普通删除不物理删除文件；清空回收站仅删除受管理目录文件 |
| 备份完整性 | 备份必须包含数据库、原图、缩略图、manifest |
| Android 体验 | 支持 content URI、大文件复制、外部打开、系统分享和 SAF 导出 |
| UI 体验 | 清晰、克制、移动优先，不出现 AI 模板感或大量无意义装饰 |
| 隐私保护 | personal 空间锁定、允许截屏和任务失效机制可验证 |

---

## 12. 验收建议

### 12.1 功能验收

- 创建 IP，并在 IP 下创建多个分组。
- 批量导入图片，确认原图复制到 Pixory 私有目录。
- 为图片添加标签、备注、收藏和多个分组。
- 使用全局搜索查找 IP、分组、标签和素材。
- 导入视频，确认视频详情、封面、时长和播放器可用。
- 删除素材后进入回收站，恢复后回到原列表。
- 清空回收站前进行二次确认，清空后文件和数据库记录一致。
- 创建完整备份和单 IP 备份，确认包含 database、originals、thumbnails 和 manifest。
- 导入备份包，确认 IP、分组、标签、素材和封面关系恢复。
- 运行重复扫描，确认精确重复和相似图片分组可展示。

### 12.2 技术验收

- 运行 TypeScript 检查：

```bash
pnpm run typecheck
```

- 运行测试：

```bash
pnpm test
```

- 检查 Expo 依赖兼容性：

```bash
pnpm run doctor
```

- Android 手动验收：

```bash
pnpm run acceptance:android
```

### 12.3 数据验收

- 数据库 `PRAGMA user_version` 应为当前 schema 版本。
- 图片资产记录应包含原图路径、缩略图路径、文件名、宽高、MIME、大小、收藏、备注、创建/更新时间等。
- 视频资产记录应包含 `mediaType = video`、时长、封面路径和预览状态。
- 导入批次应包含成功、失败、跳过明细。
- 备份 manifest 应能说明备份类型、空间、素材数量、原图数量、缩略图数量和导出数据。

---

## 13. 交付物清单

### 13.1 应用交付

- Android 应用源码。
- Android Release APK。
- Expo/React Native 运行配置。
- Android 原生模块与配置插件。
- 应用图标、启动图和基础视觉资源。

### 13.2 文档交付

- README。
- AGENTS 项目规则。
- 远程更新 JSON。
- 远程公告 JSON。
- 产品宣传手册与招标说明书，也就是本文档。
- 后续可补充：用户操作手册、测试报告、发布说明、部署说明、数据结构说明。

### 13.3 数据交付

- SQLite 数据库结构。
- 数据迁移脚本。
- 本地文件目录规范。
- 备份 manifest 结构。
- 导入批次与清理失败记录。

---

## 14. 产品边界与演进空间

### 14.1 当前代码事实

基于当前代码，Pixory 已经实现的是 Android 本地优先的视觉资产管理应用，核心能力集中在本地数据库、本地文件、媒体导入、备份恢复、隐私空间、资源包、视频、搜索整理和可选 AI 材料辅助。

当前代码没有体现“必须依赖自建服务器才能运行”的产品形态，也没有后端服务目录、服务端 API、云数据库、集中账号服务或服务器部署配置。因此，宣传和招标说明中应把“服务器依赖”列为明确边界：Pixory 的核心资产管理能力不应被设计成离开服务器就不可用。

### 14.2 可开放探索方向

除服务器依赖型架构外，以下方向不应在文档中被写死为永久禁止，而应视为可研判、可立项、可分阶段建设的演进空间：

- 云端或跨设备备份：可作为可选备份/迁移增强，但不应替代本地原图安全链路。
- 账号或设备身份：可用于授权、购买、同步偏好或跨设备体验，但不应成为访问本地素材的强制前置。
- 同步与协作：可围绕导出包、共享目录、局域网、云盘或后续服务设计，但需要单独论证数据安全和冲突合并。
- 社交或发布：可作为素材流转、展示、交付或发布辅助，但不应把 Pixory 改造成以信息流为核心的社交产品。
- AI 生成与智能整理：可围绕素材描述、标签建议、资料总结、创作辅助、图片生成或多模态检索继续探索，但需要清楚区分本地资产管理和外部模型能力。
- 图片编辑与轻量处理：可作为衍生版本、预览标注或导出处理能力建设，但必须继续保护原始文件不被覆盖。

### 14.3 不可牺牲的底线

后续无论扩展哪些能力，都应保持以下底线：

- 原图不被默认压缩、裁剪、重编码或覆盖。
- 核心素材记录和文件关系必须可追踪、可备份、可恢复。
- 删除必须有可恢复或可确认机制。
- 服务器能力不能成为本地素材库可用性的唯一前提。
- 新能力不能破坏现有 Android 本地文件、SQLite 数据和备份链路。

---

## 15. 可持续更新机制

为保持本文档长期可用，每次重要版本更新时建议同步维护以下内容：

### 15.1 更新触发条件

- 新增核心功能模块。
- 修改导入、删除、备份、隐私、数据库等关键流程。
- 数据库 schema 版本变化。
- Android 权限或原生模块变化。
- 发布新版本 APK。
- 新增或删除重要页面。
- 测试策略发生变化。

### 15.2 更新位置

| 变化类型 | 应更新章节 |
| --- | --- |
| 新功能 | 第 4、5、10 章 |
| 技术实现变化 | 第 7、9 章 |
| 安全策略变化 | 第 8、14 章 |
| 测试与验收变化 | 第 12 章 |
| 发布版本变化 | 文档头部、第 17 章 |
| 风险和边界变化 | 第 14、16 章 |

### 15.3 推荐维护流程

```text
确认版本变化
→ 阅读相关代码与测试
→ 更新功能说明
→ 更新实现依据
→ 更新验收项
→ 更新版本记录
→ 运行文档相关检查
```

---

## 16. 风险与改进方向

### 16.1 当前风险

- 本地优先产品仍依赖用户主动备份；如果用户不导出备份，设备损坏会导致本地数据丢失。
- personal 空间提供本地隔离和锁定保护，但不应被误解为所有本地文件都默认强加密。
- AI 材料辅助能力在使用外部供应商时，可能涉及网络请求、API Key 管理和第三方服务条款。
- 大资源包导入受设备剩余空间、Android 存储策略和 SAF 行为影响。
- 视频和 PDF 等大文件处理在低端设备上仍需要重点验收性能和稳定性。

### 16.2 后续改进方向

- 更完善的用户操作手册。
- 更细的备份恢复向导。
- 更清晰的导入失败诊断页面。
- 更完整的 Android 真机兼容性测试矩阵。
- 更明确的 personal 空间安全说明页。
- 更系统的性能基准测试。
- 更多面向真实素材库的 UI 截图验收记录。
- 围绕智能整理、AI 生成、跨设备备份、导出交付、轻量编辑等方向形成独立可研方案。

---

## 17. 版本记录

| 日期 | 版本 | 更新摘要 |
| --- | --- | --- |
| 2026-05-23 | 2.1.14 | 优化 AI 高级角色指令权重、历史会话和回复时间显示、消息版本切换顺序、会话重命名/删除，以及重写和重新生成的独立思考计时；数据库 schema 升至 21 |
| 2026-05-24 | 2.1.17 | AI 长期记忆支持安全校准、内联反馈和过期记忆管理，手动记忆保持用户优先 |
| 2026-05-23 | 2.1.16 | 新增 AI 深度记忆开关，短期上下文提升到 20 条，并优化长聊天流式回复与消息列表性能 |
| 2026-05-23 | 2.1.15 | 优化 AI 已发送消息编辑光标、重新生成后自动切换最新版本、自动标题生成逻辑、最近继续上次聊天时间显示，以及资料库知识库长按批量删除 |
| 2026-05-22 | 2.1.12 | 统一 AI 全页面 light 设计；补齐模型账号中的 Embedding 接口和自定义 Embedding 模型配置；数据库 schema 升至 19 |
| 2026-05-22 | 2.1.11 | 补充 AI 聊天 light 界面、紧凑输入框、会话设置瘦身、历史会话长按批量整理和弹窗花纹统一说明；同步官网 release 文案 |
| 2026-05-22 | 2.1.10 | 补充 AI 聊天输入、气泡操作、历史会话左滑归档、自动标题和隐私模式允许截屏说明；同步官网 release 文案 |
| 2026-05-17 | 2.1.5 | 初次生成产品宣传手册与招标说明书，依据当前源码、配置、数据库 schema、服务层、页面、Android 原生模块和测试文件整理；README 仅作辅助线索 |

---

## 18. 代码依据索引

| 内容 | 路径 |
| --- | --- |
| Expo 配置 | `app.json` |
| 依赖与脚本 | `package.json` |
| 应用入口与路由 | `App.tsx` |
| 数据库 schema | `src/database/schema.ts` |
| 数据库初始化 | `src/database/db.ts` |
| 数据类型 | `src/database/types.ts` |
| 文件存储 | `src/services/fileStorageService.ts` |
| 图片导入 | `src/services/imageImportService.ts` |
| 视频导入 | `src/services/videoImportService.ts` |
| 备份与恢复 | `src/services/backupService.ts` |
| 资源包导入 | `src/services/packageImportService.ts` |
| 回收站 | `src/services/trashService.ts` |
| 重复检测 | `src/services/duplicateDetectionService.ts` |
| 存储统计 | `src/services/storageUsageService.ts` |
| 隐私空间 | `src/services/personalSystemService.ts` |
| 更新检查 | `src/services/updateCheckService.ts` |
| 公告检查 | `src/services/announcementService.ts` |
| AI 文档材料 | `src/ai/aiDocumentService.ts` |
| AI 会话 | `src/ai/aiChatService.ts` |
| Android 原生媒体模块 | `android/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt` |
| 更新 JSON | `docs/update-version.json` |
| 公告 JSON | `docs/announcement.json` |
| 辅助说明，不作为唯一依据 | `README.md`、`AGENTS.md` |

---

## 19. 宣传摘要

Pixory 是一款面向 Android 的本地优先 IP 视觉资产管理应用。它以原图安全、本地可靠和移动端高效整理为核心，帮助用户把图片、视频等素材按 IP、分组、标签、收藏、备注和元数据组织起来。当前核心数据存储在本机 SQLite 与私有文件目录中，同时保留围绕备份迁移、智能整理、内容流转和创作辅助继续扩展的空间。

它不仅能批量导入素材，还提供导入批次、重复检查、快速整理、回收站、完整备份、资源包导入、存储统计和隐私空间等能力。对于创作者、运营人员、品牌视觉管理者和个人收藏用户而言，Pixory 提供的是一套可长期维护、可备份、可恢复、可追踪的移动端素材资产管理工作台。
