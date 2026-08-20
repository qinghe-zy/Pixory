# Pixory 启动与大数据页面性能补强 Implementation Plan

> **执行方式：** 按用户要求在当前会话内顺序执行，不使用子智能体；每个模块完成后先 review 再进入下一模块。

**Goal:** 消除启动交接、隐藏根页、全量列表、备份/存储 I/O 和长期 AI 数据页中可由源码确认的性能风险。
**Architecture:** 复用现有 keyset cursor、scope LRU、SQLite 索引和固定并发 worker；页面改为虚拟列表与按需加载，后台工作由可见性和数据 epoch 驱动。
**Tech Stack:** Expo 54、React Native 0.81、TypeScript、Expo SQLite、Reanimated、Node test runner。

---

## Module 1：启动交接与根页生命周期

**Files:** `App.tsx`, `src/screens/HomeLibraryScreen.tsx`, `src/screens/MeScreen.tsx`, `src/screens/AiHomeScreen.tsx`, `src/components/ai/AiActiveSpectrum.tsx`, `tests/app-startup-performance-policy.test.cjs`, `tests/android-icon-splash-policy.test.cjs`。

- [x] 1.1 写 RED：要求 `preventAutoHideAsync`、主动 hide、无正常启动文字提示、日记字体不在关键 `useFonts`、禁止 300ms 一次挂载四页、根页收到 `isActive`。
- [x] 1.2 运行 RED，确认 4 项仅因新契约缺失而失败。
- [x] 1.3 实现 Splash 生命周期、无文字 fallback、关键/延迟字体分层和相邻优先的 idle 根页预热。
- [x] 1.4 为首页、我的、AI 工作台及频谱增加 active gate，卸载/隐藏时取消无限动画。
- [x] 1.5 运行启动/首页/Splash 聚焦测试、`pnpm typecheck`、`git diff --check`；review 初始化失败、外部入口、Personal 切换和动画恢复。

### Module 1 review record

- RED：`node --test tests/app-startup-performance-policy.test.cjs`，4 fail / 0 pass，分别命中 Splash、字体、根页预热和动画 gate 缺失。
- GREEN：启动/Splash/首页聚焦 9 pass / 0 fail；`pnpm typecheck` exit 0；`git diff --check` 无 whitespace error。
- Files：`App.tsx`、`HomeLibraryScreen`、`MeScreen`、`AiHomeScreen`、`RhythmBars`、`AiActiveSpectrum`、启动 policy test。
- Review：初始化错误路径会 hide 并提供重试；分享/外部入口在 DB ready 后正常接管；隐藏页无限循环均有 cancel；日记字体失败只降级字体、不阻塞主界面。
- Review 修复：隐藏 `RhythmBars` 时额外取消尚未结束的 blend animation，避免最多 2.5 秒残留工作。
- 启动图结论：各密度 PNG 与 Android 12 safe-area 已合理，主要收益来自受控交接、少两套关键字体和根页错峰，不修改视觉素材。

## Module 2：素材长列表虚拟化与 cursor

**Files:** `src/components/VirtualizedAssetCollection.tsx`, `src/hooks/useMediaCursorCollection.ts`, `src/database/repositories/imageRepository.ts`, 六个素材页面，`tests/media-collection-pagination-unit.test.cjs`, `tests/media-collection-virtualization-policy.test.cjs`。

- [x] 2.1 写 RED helper 测试：全排序 cursor、deleted-only、reader query scope 与 stale response 契约。
- [x] 2.2 写 RED policy：六页不得使用 `ScreenScaffold scrollable + images.map`，不得以无界 `findBy*` 加载主列表。
- [x] 2.3 实现共享 cursor controller/hook 和 grid/detail FlatList；固定 page size、render batch、window、key 与 footer。
- [x] 2.4 逐页迁移全部素材、分组、标签、收藏、回收站、批量管理；保持过滤、排序、多选、滑选和 reader context。
- [x] 2.5 运行 cursor/repository/六页 policy、`pnpm typecheck`、`git diff --check`；review prepend/append、筛选切换、全选语义和视频入口。

### Module 2 review record

- RED：cursor 原只支持创建时间倒序；六个页面缺少共享虚拟列表/游标 hook；过滤后的 reader 仅携带当前已加载 ID，会在 48 项后被截断。
- GREEN：cursor/虚拟化/reader query 聚焦测试 11 pass / 0 fail；`pnpm typecheck` exit 0；`git diff --check` 无 whitespace error。
- Files：`VirtualizedAssetCollection`、`useMediaCursorCollection`、`usePagedScreenLoad`、`useSwipeGridSelection`、`imageRepository`、六个素材页面、reader context/query 与对应 tests。
- Review：所有排序使用 `(sortValue,id)` 稳定翻页；回收站总容量使用 SQL aggregate 而非已加载页求和；标签的同尺寸/文件签名/前缀只读取轻量列后返回 ID；筛选 reader 改为 `media-query`，不会在当前页边界停止。
- Review 修复：FlatList 增加 `flex:1`；手势类型改为 React Native `GestureResponderHandlers`；批量页明确文案为“当前已加载”，避免把局部选择伪装成全库选择。
- 保留边界：滑选/批量全选只作用于已加载项；需要全库批处理的独立 ID-only SQL 操作不在现有交互内隐式触发，避免意外操作未看见的数据。

## Module 3：备份与存储 I/O

**Files:** `src/services/backupService.ts`, `src/services/managedBackupService.ts`, `src/services/storageUsageService.ts`, `src/services/storageUsageSnapshotCache.ts`, repositories, `tests/backup-query-batching-policy.test.cjs`, `tests/storage-usage-inventory-unit.test.cjs`, existing backup/storage tests。

- [x] 3.1 写 RED：备份关系查询必须分块，禁止 per-image repository Promise；preview inventory 单次遍历；备份条目使用固定 worker。
- [x] 3.2 在 repository 增加 image relation、批次/明细的 400 ID chunk bulk API，空输入返回空 Map/数组。
- [x] 3.3 重写 export projection 使用 bulk maps；保留 Manifest 内容、Personal scope、恢复兼容与错误清理。
- [x] 3.4 合并存储 preview 扫描，接入 scope snapshot stale-while-revalidate；清理、预览重建、备份创建/删除时失效。
- [x] 3.5 运行 backup/storage/cache 聚焦测试、`pnpm typecheck`、`git diff --check`；review WAL 一致性、路径泄露、取消和临时文件。

### Module 3 review record

- RED：3 fail / 0 pass，分别命中关系 N+1、预览/备份无界文件 Promise 和缓存模块缺失。
- GREEN：backup/storage/managed-manifest 聚焦测试 13 pass / 0 fail；`pnpm typecheck` exit 0；`git diff --check` 无 whitespace error。
- Files：三个 repositories、`backupService`、`managedBackupService`、`storageUsageService`、新 `storageUsageSnapshotCache`、`StorageUsageScreen` 与 policy test。
- Review：bulk 查询按 400 bind 分块且保序；Manifest 不写原始 Personal URI；托管备份先最多 4 路读取/哈希，随后顺序去重复用和复制，避免同 hash 竞态；快照只存统计对象并按 space、media epoch、2 分钟 TTL 隔离。
- Review 修复：回收站统计复用 SQL aggregate；预览总量和图片/视频拆分来自同一次目录 inventory，不再先递归求总量再逐 URI 重读；缓存清理和预览重建先失效后刷新。
- 保留边界：Expo legacy 文件写 API 仍要求把 `serializeAsync()` 结果转 Base64 写入，属于单份数据库快照的短时 JS 字符串峰值；未改为直接复制活跃 WAL 文件，以数据一致性优先。

## Module 4：AI 长期数据与收藏

**Files:** AI document/diary/dream/thought repositories/services, `AiMaterialListScreen.tsx`, `CompanionInnerLifeScreen.tsx`, `AiRoleLibraryScreen.tsx`, `AiKnowledgeBaseScreen.tsx`, `AiIpPickerScreen.tsx`, `AiAvatarPicker.tsx`, `FavoritesScreen.tsx`, tests。

- [x] 4.1 写 RED：AI 收藏必须 keyset/懒加载，内心生活只读当前 tab，材料必须 FlatList + owner/document 双游标分页。
- [x] 4.2 实现 AI favorite `(createdAt,id)` keyset、document `(updatedAt,id)` keyset、owner group summary cursor 和复合索引，不修改 prompt/RAG 读取路径。
- [x] 4.3 材料总库按 20 来源一页、每来源 4 份预览；进入任意 thread/knowledge-base/IP 来源后按 40 条一页读取全部。
- [x] 4.4 收藏页按分段懒加载，图片和 AI 各自分页；内心生活切换 tab 后才查询对应数据。
- [x] 4.5 运行 AI repository/UI policy、global material 回归、normal/personal SQLite integration 与 `pnpm typecheck`；review 单来源极端量和删除后 reload。

### Module 4 review record

- RED：AI 长列表 policy 先命中材料 repository/service 无分页；补强 review 再命中单来源预览无上限。
- GREEN：AI 材料/收藏/内心生活 policy、全局资料回归和 normal/personal SQLite integration 共 21 pass / 0 fail；`pnpm typecheck` exit 0。
- Files：`aiThreadRepository`、`aiChatService`、`aiKnowledgeRepository`、`aiDocumentService`、`FavoritesScreen`、`CompanionInnerLifeScreen`、`AiMaterialListScreen`、`App.tsx`、schema/db 与 tests。
- Review：AI 收藏不再默认 80 条截断；同时间值由 ID tie-breaker 保证无重漏；总库当前页来源由一条 bulk SQL hydrate，不做 per-owner N+1；单来源只显示 4 份预览并可进入完整分页列表。
- Review 修复：新增已有数据库幂等材料复合索引；全局 group key 改为 `ownerType:ownerId`，避免不同来源类型同 ID 的 React key 碰撞；knowledge-base/IP 来源也能从总库进入完整列表。

## Module 5：批量、导入历史与重复检测

**Files:** `src/database/repositories/importBatchRepository.ts`, `src/screens/ImportBatchHistoryScreen.tsx`, `src/screens/BatchManageImagesScreen.tsx`, duplicate repository/service, tests。

- [x] 5.1 写 RED policy：最近 30 批状态不得逐批读取 items。
- [x] 5.2 实现 `countItemsByStatusForBatchIds` 分块聚合，历史页一次获取 success/failed/skipped。
- [x] 5.3 写 RED policy：批量软删除文件验证固定 4 worker、记录单次按 IDs 回读、无 per-item DB scope。
- [x] 5.4 实现批量验证；exact duplicate 改为 SQL hash group；visual 路径因无法证明分桶无漏检而保持原召回语义。
- [x] 5.5 运行批量/导入/重复检测 policy、`pnpm typecheck`；review软删除文件保留、选择语义和重复召回。

### Module 5 review record

- RED：3 项分别命中导入历史逐批明细、批量删除逐项数据库/文件 fan-out、exact duplicate 先全量装载。
- GREEN：批次/批量/重复 policy 3 pass / 0 fail；与 AI 长列表合并门禁 6 pass / 0 fail；`pnpm typecheck` exit 0。
- Files：`importBatchRepository`、`ImportBatchHistoryScreen`、`BatchManageImagesScreen`、`imageRepository` 与 policy test。
- Review：最近 30 批状态一条分组查询；软删除后数据库一批回读，文件最多 4 worker；exact 只读取 SQL 已确认重复的 hash 成员。
- 保留边界：visual hash 继续采用原比较路径，未用未经证明的前缀 bucket 换取速度，优先保证不漏掉阈值内相似素材。

## Module 6：文档与最终验证

**Files:** `docs/reviews/2026-08-20-performance-hardening-review.md`, `docs/feature-matrix.md`, 本 Spec/Plan，全部变更。

- [x] 6.1 把每模块 RED/GREEN、文件、review 发现与剩余边界写入全面 Review。
- [x] 6.2 更新功能矩阵中的启动、素材浏览、备份/存储、AI UI、批量/重复和测试覆盖。
- [x] 6.3 新鲜运行 `pnpm typecheck`、`pnpm test`、`git diff --check`；不运行压力 benchmark。
- [x] 6.4 对照 Spec 逐条自审，搜索 `images.map` 全量页面、无界文件 `Promise.all`、隐藏无限动画和正常启动文字提示；剩余长期页归入独立清单而非伪报完成。

## Module 6A：AI 会话历史（用户追加的最高优先级模块）

**Files:** `src/database/repositories/aiThreadRepository.ts`, `src/ai/aiChatService.ts`, `src/screens/AiHistoryScreen.tsx`, history/navigation tests。

- [x] 6A.1 写 RED：历史必须在 SQL 中 keyset 分页并以 `FlatList` 呈现，禁止累计 `items.map`。
- [x] 6A.2 把筛选/搜索下推 repository，按 `(lastMessageAt,createdAt,id)` 返回 40 条页；保留 adopted route 投影。
- [x] 6A.3 页面接入加载更多、去重和有界 window；保留分组、滑动归档、多选及重命名。
- [x] 6A.4 模块 review 发现旧筛选 load-more 可能晚返回并回灌，以及 `onEndReached` 在 state commit 前可能重复发同一 cursor；分别补 RED 后增加 request generation 与同步 in-flight 门闩。
- [x] 6A.5 运行 history/projection/navigation 聚焦回归和 TypeScript；把未实施项写入后续性能清单。

### Module 6A review record

- RED：历史 policy 命中 repository 无 cursor、服务无 page API、页面使用累计 map；二次 RED 命中筛选切换时缺少请求代际。
- GREEN：history/projection/navigation 46 tests；44 pass / 0 fail / 2 skipped；旧请求代际用例通过。
- Files：`aiThreadRepository`、`aiChatService`、`AiHistoryScreen`、3 个 history/navigation tests。
- Review：搜索通配符按字面量转义；相同活动时间用创建时间与 ID tie-breaker；旧 reload/load-more 响应不能污染新 space/filter/search；同 cursor 同时只允许一个分页请求。
- 保留边界：adopted route 的最后消息仍由消息 CTE 投影，返回行已有界但查询成本会随历史消息总量增长；物化投影/FTS 已列入后续 P1，不在本轮贸然改变分支一致性模型。

## Pre-execution self-review

- Spec coverage：五类代码风险分别映射 Modules 1–5；Module 6 负责文档和全量门禁。
- TDD：每个生产行为都有先行 RED；页面结构用 policy、纯控制器用 unit、SQL 用 integration。
- API consistency：媒体 cursor 只复用现有 `(sortValue,id)`；新增 bulk API 对空输入返回空集合；active gate 默认 `true` 保持非根页兼容。
- Safety：不改原件，不直接复制活跃 WAL 数据库，不把 Personal 路径写入缓存，不以性能名义降低重复检测召回。
- Scope：按用户要求不执行压力测试、设备测试、打包、发布或推送。
- Decision：自审通过，开始 Module 1；前一模块 review 未记录前不得开始下一模块。
