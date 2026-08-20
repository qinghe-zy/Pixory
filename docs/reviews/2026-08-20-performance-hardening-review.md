# Pixory 全面性能加固与代码 Review 记录

日期：2026-08-20
适用版本：Pixory 2.8.1 工作树
范围：首页、IP 卡片、图片阅读器、视频播放器、AI 聊天、SQLite/缓存、缩略图、图片/视频导入、批量整理、系统相册保存与 Personal 隔离。
执行约束：未使用子智能体；每个模块完成后单独测试和 review；未执行打包、发布、提交、推送或数据库破坏性操作。

## 1. 结论与声明边界

本轮已完成源码级性能加固、自动化测试和桌面 SQLite 基准；发现的确定性代码问题均已修正。以下结论只能按证据理解：

- “已通过”表示 TypeScript、Node 自动化测试、查询计划或源码契约有新鲜证据。
- “待真机”表示 Android 设备上的帧率、掉帧、内存峰值、codec 数、真实音质、首屏肉眼闪烁、后台恢复和低存储行为尚未得到设备证据。
- 图片、视频原件没有被压缩、裁剪、重编码或覆盖；预取、封面和缩略图仍是独立缓存/派生资源。
- Personal 图片仅进入内存图片缓存；锁定时清除全局内存图片缓存、Personal reader session、Personal 聊天预取和 Personal 临时文件，不再为此清空普通空间磁盘图片缓存。
- 当前工作树同时包含性能主线和此前并存的 UI/批量媒体改动。本文按真实最终行为记录，不把并存改动伪报为独立新提交。

## 2. Review 新发现并修复的问题

| 编号 | 严重度 | 发现 | 修复 | 主要证据 |
| --- | --- | --- | --- | --- |
| RV-01 | P1 | `CircularProgress` 在 `state` 为空时提前 return，`useSafeAreaInsets` 位于 return 之后，可能改变 Hook 调用顺序；同时使用了不存在的 spacing/typography token | Hook 移到所有条件 return 之前，改用 `spacing[3]`、`spacing[4]` 和 `typography.textStyles.body` | 应用 TypeScript；相关 UI policy |
| RV-02 | P1 | Personal 图片改用 memory cache 后，锁定仍调用 `Image.clearDiskCache()`，导致普通空间磁盘缩略图无谓失效 | `clearPersonalImageCache` 只清内存；普通磁盘缓存保留 | `personal-unified-ui-policy`、`home-library-loading-performance-policy` |
| RV-03 | P1 | reader session key 包含 data epoch，但所有素材结构写入都没有 bump，导入/删除/移动/收藏后可能恢复旧队列 | 素材 create/update/group/favorite/delete/restore/永久删除/清空最近记录成功后 bump `media` epoch；普通浏览 last-view 合并写不 bump，避免本次阅读会话自我失效 | `data-epoch-service-unit`、cursor/integration tests |
| RV-04 | P0 | 图片详情和视频详情在 load effect 内写 last-view 后立即触发 `onRefreshed`，而 effect 又依赖 `refreshToken`，可形成持续重载链 | last-view 只写库；列表刷新通知移到详情页卸载时执行 | `media-reader-integration-policy` |
| RV-05 | P1 | `ImageViewerScreen` 每次 render 直接读取全局 epoch，本页收藏等写入可在当前入口触发整窗重新加载 | epoch 只在入口 image/context 改变时重新采样，本次 reader 会话保持稳定 | 应用 TypeScript、reader integration tests |
| RV-06 | P1 | 视频池虽保留 5 个 player，但 `replaceAsync` 串行准备，第 2～5 项仍要排队 | 保持 5-player/单音频 owner 上限，按当前、方向前方、反向回退优先级，最多 3 路并行准备，避免无限 codec 并发 | `video-preload-pool-unit` 最大并发测试 |
| RV-07 | P1 | 聊天路由预取只有在 consume 时 catch；快速换线程、返回或 Personal 锁定后，被替换 Promise 的拒绝可能变为未处理拒绝 | 预取创建时即 `.catch(() => null)`；消费端仍进行 adopted-route revision 校验 | `ai-chat-entry-performance-policy` |
| RV-08 | P2 | 首页第 1～3 张封面同为 high 且都淡入，解码接近时仍可能第二卡先显示、首卡后闪 | 仅首卡 high，首卡命中后 0ms 呈现；其他卡 normal 并保留 120ms 淡入；仍首批渲染 3 卡避免空洞 | `home-library-loading-performance-policy` |
| RV-09 | P0 | 混合图片/视频导入分别执行 1000 文件/32GB 预检，组合批次可把上限计算两次 | 页面在创建导入任务前对图片+视频执行一次混合总数、单文件、总量和磁盘余量预检，再把已解析大小传给两类服务 | `media-import-extreme-integration-policy` |
| RV-10 | P0 | 普通素材导入虽检查 Personal token，但没有注册到锁定等待屏障，锁定清理数据库时可能与仍在退出的导入竞争 | 整次图片+视频导入 Promise 交给 `trackPersonalTask`；锁定可等待任务退出 | `media-import-extreme-integration-policy` |
| RV-11 | P1 | 混合批量保存相册已允许视频，但服务只识别 mp4/mov/webm，mkv/avi 会误走图片桥 | 补齐 mp4/mov/mkv/webm/avi/m4v/3gp，视频统一走 native video MediaStore | `batch-organize-ux-policy` |
| RV-12 | P1 | 根目录 `fix_tests.js` 自身正则语法无效，阻断默认 `pnpm typecheck` | 删除重复且非法的替换语句；保留脚本其余行为 | `node --check fix_tests.js`、最终 `pnpm typecheck` |
| RV-13 | P2 | Personal/批量媒体旧 policy 仍断言 cache=none、批量页只能选图片，与最终行为冲突 | 更新为 memory-only Personal cache、图片视频混选，并增加锁定清理/视频桥约束 | 全量测试 |
| RV-14 | P3 | `FilterChip`、`SearchBar` 留有无用 React/Platform import | 仅删除无用 import，不改行为 | 应用 TypeScript |
| RV-15 | P1 | 混合图片/视频预检虽共享总 gate，但在检查总数和已知大小前先读取全部缺失 metadata；超过 1000 项仍会产生无意义文件 I/O | 在任何文件 metadata I/O 前先用内存中的数量和已知大小执行一次早拒绝；通过后才进入最多 4 worker 的补全阶段 | `media-import-extreme-integration-policy`、导入聚焦回归 7/7 |
| RV-16 | P1 | `media` data epoch 原为全局值，普通空间的结构写会让 Personal reader session 无必要失效，反向亦然 | DB 句柄注册 normal/personal scope；epoch 组合 global + 当前 scope；repository 按句柄推进，未知句柄保守推进 global | `data-epoch-service-unit`、reader/cursor 聚焦 15/15 |
| RV-17 | P0 | 混合导入虽共享预检，但图片与视频服务仍各自创建实际写入账本；若两类源文件都在预检后变大，累计值可被分开计算 | 页面在混合 gate 后只创建一个 `MediaImportCommitBudget`，向图片/视频服务传同一对象；独立服务调用仍兼容自动创建 | import/preflight/Personal 聚焦 19/19 |
| RV-18 | P1 | 图片预取的 high-pressure 策略仍保留当前 decoded ref，且只有宽度限制；Android low-memory/trim 无法主动让 reader 收缩 | Android 媒体模块注册 `ComponentCallbacks2` 并发 typed event；reader 在本屏会话内 sticky high、释放全部 speculative decoded ref、禁止新预解码，`loadAsync` 同时限制 viewport pixel width/height | media/reader 聚焦 21/21；`:app:compileDebugKotlin` 成功 |
| RV-19 | P1 | 聊天 around-anchor 在同一 Expo SQLite 连接上并发执行 anchor/latest/before/after，多数组合后又在 JS 建 Map 和 sort | 单条 CTE statement 读取并去重四个窗口，最终按 `(createdAt,id)` 排序；缺失 anchor 同一 statement 自然只返回 latest | 聊天聚焦 69 pass/0 fail/2 skipped；6000 消息 DB benchmark |

## 3. 逐项修改清单

### 3.1 首页、骨架与 IP 卡片

| 编号 | 修改内容 | 性能/体验影响 | 文件 |
| --- | --- | --- | --- |
| HOME-01 | 首页从首帧挂载同一 `FlatList`；初始无数据时 `ListEmptyComponent` 只放 1 个 skeleton | 不再先渲染加载说明再换成列表，减少结构切换 | `HomeLibraryScreen.tsx` |
| HOME-02 | skeleton 与真实卡片共享 aspect ratio、圆角、padding、caption 宽度 token | 占位和真实卡片几何一致，避免加载完成后高度跳动 | `IPCardSkeleton.tsx`, `IPCard.tsx`, `components.ts` |
| HOME-03 | shimmer 使用 transform 动画；Reduce Motion 时关闭；卸载时停止 | 避免 JS 每帧布局和隐藏动画泄漏 | `IPCardSkeleton.tsx` |
| HOME-04 | 删除首卡独有的陀螺仪、磁吸和超大高光分支 | 首卡与后续卡走同一轻量路径，不再与滚动手势/传感器争用 | `IPCard.tsx` |
| HOME-05 | 固定 `getItemLayout`，稳定 key/recyclingKey，首批 3、每批 4、window 5 | 限制列表常驻量并减少回收后错图 | `HomeLibraryScreen.tsx`, `SecureImage.tsx` |
| HOME-06 | 首卡独占 high priority 且无淡入，其余 normal + 120ms transition | 降低“第二卡先出、第一卡后闪”的概率 | `HomeLibraryScreen.tsx`, `IPCard.tsx` |

### 3.2 SQLite、游标和缓存

| 编号 | 修改内容 | 性能/一致性影响 | 文件 |
| --- | --- | --- | --- |
| DB-01 | normal/personal 初始化幂等确保媒体 created、recent 和聊天 message 复合索引 | 热查询直接走覆盖/组合索引，不依赖重新建库 | `db.ts` |
| DB-02 | 新增 created/recent/source 稳定 keyset cursor，`createdAt/lastViewedAt/sourceOrder + id` 作为 tie-breaker | 深分页不使用 OFFSET，相同时间值不重不漏 | `types.ts`, `imageRepository.ts`, `assetRepository.ts` |
| DB-03 | 新增 around-anchor 读取：初始 81 项、边界 40 项 | 阅读器/播放器不再先读取整个上下文 | `imageRepository.ts` |
| DB-04 | 新增 scope-aware LRU、TTL、显式 scope clear 和按 normal/personal 隔离的 data epoch；DB 句柄注册所属空间，未知句柄走 global fail-safe | reader session 有容量、过期和空间级失效边界，一个空间写入不再清退另一空间会话 | `scopedLruCache.ts`, `dataEpochService.ts`, `databaseSpaceRegistry.ts`, `mediaReaderSessionCache.ts` |
| DB-05 | 素材结构写成功后按数据库空间推进 epoch；浏览时间写入不推进 | 未来入口不会恢复旧队列，同时当前 reader 不因自身 last-view 写入抖动 | `imageRepository.ts` |
| DB-06 | 增加 100,000 行确定性 benchmark 和 EXPLAIN 断言 | 可重复验证 created/recent/video page 不使用 temp B-tree | `benchmark-media-database-performance.cjs`, `package.json` |
| DB-07 | 聊天 around-anchor 由 4 条同连接并发读取 + JS 合并改为单条 CTE statement；新增 6000 消息/100 页 repository benchmark | 降低初次定位时 statement 竞争和 JS 临时分配；缺失 anchor 保持 latest fallback，稳定 keyset 不重不漏 | `aiThreadRepository.ts`, `benchmark-ai-message-repository.cjs`, `package.json` |

### 3.3 图片阅读器与所有图片入口

| 编号 | 修改内容 | 性能/体验影响 | 文件 |
| --- | --- | --- | --- |
| IMG-01 | 所有大集合上下文转换为 image-only cursor request；保留 group/tag/favorite/aspect/size/mime/import-batch/image-scope 条件 | 从全部素材、分组、标签、收藏、批次等入口均不做无界读取 | `mediaReaderContextQuery.ts` |
| IMG-02 | 使用 `initialScrollIndex` 直接落在锚点，不再首帧后 `requestAnimationFrame + scrollToIndex` 纠偏 | 减少进入后的可见位置闪动 | `ImageViewerScreen.tsx` |
| IMG-03 | 编码窗口按速度为 8/4、16/6、32/8；解码上限为前 6/后 3；编码并发 4、解码并发 2；Android memory trim 后本屏 sticky encoded-only；预解码同时受 viewport pixel width/height 约束 | 快速翻动有远端文件预热，内存紧张时立即释放 speculative decoded ref 且不继续全尺寸预解码 | `mediaPrefetchPolicy.ts`, `mediaImagePrefetchCoordinator.ts`, `ImageViewerScreen.tsx`, `pixoryMediaModule.ts`, `PixoryMediaModule.kt` |
| IMG-04 | direction/generation 变更后丢弃过时任务，释放窗口外 decoded ref，重叠 encoded 请求去重 | 反向快滑不会让旧结果覆盖当前项，内存不随翻页线性增长 | `mediaImagePrefetchCoordinator.ts` |
| IMG-05 | active 接近 10 项边界时自动补 40 项，prepend 时按 ID 保持当前画面 | 连续快速滑动可跨初始窗口且不因前插改变当前项 | `ImageViewerScreen.tsx` |
| IMG-06 | 最近查看写入 2 秒合并、ID 去重、退出 flush | 降低每翻一页一次 SQLite 写入和全局刷新 | `mediaLastViewedQueue.ts` |
| IMG-07 | reader session 保存最多 81 项、当前 ID/index 和双向 boundary，TTL 10 分钟、容量 8 | 退出再进在 epoch 未变时恢复附近窗口和位置，不重新全量读取 | `mediaReaderSessionCache.ts`, `ImageViewerScreen.tsx` |
| IMG-08 | Personal reader encoded cache 仅 memory，session 锁定清除 | 不把隐私媒体落入磁盘图片缓存 | `SecureImage.tsx`, `App.tsx` |
| IMG-09 | 图片/视频详情 last-view 不再形成 refreshToken 循环 | 消除详情页持续 reload/闪烁风险 | `ImageDetailScreen.tsx`, `VideoDetailScreen.tsx` |

### 3.4 视频短视频式切换与倍速

| 编号 | 修改内容 | 性能/体验影响 | 文件 |
| --- | --- | --- | --- |
| VID-01 | 竖滑使用 previous/current/next 三槽，静态相邻封面随 transform 跟手 | 下个视频封面在拖动阶段已出现，不等落位后突变 | `VideoPlayerScreen.tsx` |
| VID-02 | 距离 18% 或速度 0.65 决策；从当前 transform 可中断并反向 | 快滑、短促 fling 和反向取消更接近短视频交互 | `videoSwipePolicy.ts` |
| VID-03 | 资源池保持 current + 3 个方向前方 + 1 个反向回退；只允许 current 有声音 | 连滑复用已准备 player，同时避免双音轨 | `videoPreloadPool.ts` |
| VID-04 | player/source 准备从串行改为优先序不变的最多 3 路并行 | 降低高速连续切换时后续 source 排队时间，并限制 codec 压力 | `videoPreloadPool.ts` |
| VID-05 | 视频队列以 61 项锚点窗口起步，靠近边界补 40 项，列表改为 FlatList | 大 IP 视频队列不再一次全读或 ScrollView 全挂载 | `VideoPlayerScreen.tsx`, `assetRepository.ts` |
| VID-06 | 所有普通倍速、长按倍速、player 创建/替换路径统一先设置 `preservesPitch=true` 再写 rate | Android 使用 Media3/平台保音高路径，避免直接改变采样速率造成明显花栗鼠音 | `videoPlaybackRate.ts`, `VideoPlayerScreen.tsx` |
| VID-07 | 支持的系统相册视频扩展统一走 native video MediaStore | 混合批量保存不把视频误当图片 | `mediaLibraryService.ts` |

### 3.5 AI 聊天首屏、超长历史与附件

| 编号 | 修改内容 | 性能/体验影响 | 文件 |
| --- | --- | --- | --- |
| CHAT-01 | 已知 thread 的 push/open/replace 在路由 mutation 前启动 adopted-route snapshot prefetch | 利用导航过渡时间读取首个 60 条消息页 | `App.tsx`, `aiThreadMessagePrefetch.ts` |
| CHAT-02 | 预取只保留最近线程，消费即删除，失败收敛为 null，使用前校验 adopted route revision；Personal 锁定清除 | 不展示旧分支/旧空间消息，也不遗留未处理拒绝 | `aiThreadMessagePrefetch.ts`, `AiChatScreen.tsx` |
| CHAT-03 | 普通进入由同槽位骨架遮住列表，首个非空 content layout 后揭开；空线程直接 ready | 不再依赖 250ms fade 和 50～700ms 普通入口纠偏滚动 | `AiChatScreen.tsx` |
| CHAT-04 | 线程切换先清空旧消息，inverted list 始终以 offset 0 表示最新 | 避免旧线程瞬间闪现或先显示错误位置 | `AiChatScreen.tsx` |
| CHAT-05 | 更早消息页采用有序 O(n) 去重合并，当前窗口覆盖重复 ID；around-anchor 的 latest/before/anchor/after 由单条 CTE statement 返回 | 超长历史连续加载不再对累计数组反复 sort，初始锚点读取也不在同一 DB 连接并发多 statement | `aiMessagePageMerge.ts`, `AiChatScreen.tsx`, `aiThreadRepository.ts` |
| CHAT-06 | 附件限制 8 个、单图片 12MB、单文档/视频 metadata 24MB、总量 32MB；未知大小保守占位 | 在复制和 Base64 前拒绝极端输入 | `limits.ts`, `aiAttachmentPolicy.ts` |
| CHAT-07 | 文件 size/read 和图片 Base64 固定并发 2；视频不做 Base64；单张图片读取失败隔离并写入 prompt 提示 | 限制内存峰值，避免一个坏附件让全部视觉输入失效 | `aiChatService.ts`, `aiBoundedConcurrency.ts` |
| CHAT-08 | 聊天隐藏或应用后台时停止极光循环 | 降低不可见页面 UI 线程消耗 | `ParallaxLightSweep.tsx`, `AiChatScreen.tsx` |

### 3.6 极端导入、临时文件和缓存清理

| 编号 | 修改内容 | 性能/数据安全影响 | 文件 |
| --- | --- | --- | --- |
| IO-01 | 统一限制：1000 文件、单图片 256MB、单视频 20GB、批次 32GB、未知大小预留 256MB、完成后保留 512MB | 极端批次在创建任务/批次行和复制前失败 | `limits.ts`, `mediaImportPreflight.ts` |
| IO-02 | 混合图片+视频先过一次总批次 gate，并为两类服务共享同一个实际写入 `MediaImportCommitBudget` | 防止预检上限或预检后文件增长被图片/视频分账计算 | `mediaImportPreflightRuntime.ts`, `ImportImagesScreen.tsx`, `imageImportService.ts`, `videoImportService.ts` |
| IO-03 | 先以内存中的总数/已知大小早拒绝，再以最多 4 worker 补齐缺失 size；初次 gate 后把解析大小传给服务 | 超限批次不触发文件 metadata I/O，通过的批次也不创建无界 Promise 或重复读取 metadata | `boundedFileConcurrency.ts`, `mediaImportPreflightRuntime.ts` |
| IO-04 | 复制后核对真实文件存在且 size > 0；size 变化或每 16 个项目重新检查累计量和剩余空间 | 文件提供者 size 变化时在 DB commit 前阻止越界 | `imageImportService.ts`, `videoImportService.ts` |
| IO-05 | commit budget 只在素材、标签和记录全部成功后累加；取消检查放在关键写点，错误 catch 先重新抛出 Personal 取消 | 失败项不污染后续预算，锁定后不继续处理未来项目 | `imageImportService.ts`, `videoImportService.ts` |
| IO-06 | 整次普通混合导入注册到 Personal task barrier | 锁定可等待回滚/清理完成后再关闭 Personal DB | `ImportImagesScreen.tsx`, `personalTaskToken.ts` |
| IO-07 | DocumentPicker 固定 `copyToCacheDirectory:true`；只有本次 picker 返回、显式标记 temporary 且仍在 Expo cache 下的 URI 才删除 | 取消/移除/离页清理双占用，不误删相册或外部原件 | `mediaFilePickerService.ts`, `ImportImagesScreen.tsx` |
| IO-08 | 目录大小遍历、相册创建时间读取均使用最多 4 个文件 worker，单项失败隔离 | 避免宽目录/大批 metadata 的 Promise fan-out 和 OOM | `cacheCleanupService.ts`, `mediaImportOrderService.ts` |

### 3.7 批量整理与并存 UI 改动

| 编号 | 修改内容 | 行为影响 | 文件 |
| --- | --- | --- | --- |
| UX-01 | 批量管理、导入批次堆、IP 操作支持图片/视频混选和整理；视频点击进入详情 | 视频不再从批量工作流静默消失 | `BatchManageImagesScreen.tsx`, `ImportBatchReviewScreen.tsx`, `IpDetailScreen.tsx`, `App.tsx` |
| UX-02 | 批量保存系统相册允许图片和视频 | 调用相应图片/视频 native MediaStore 路径 | `BatchImageOrganizePanel.tsx`, `mediaLibraryService.ts` |
| UX-03 | 清空最近查看后同时刷新当前页和父列表 | 返回后不会继续显示已清空记录 | `RecentViewedScreen.tsx`, `App.tsx` |
| UX-04 | 搜索栏可点击模式禁用内部输入命中；FilterChip/SearchBar 降低阴影 | 避免点击被 TextInput 截获并降低叠层绘制成本 | `SearchBar.tsx`, `FilterChip.tsx` |
| UX-05 | 进度浮层适配安全区并使用 token | 避免状态栏遮挡和非法设计 token | `CircularProgress.tsx` |

## 4. 文件级交付索引

### 4.1 新增生产文件

- `src/ai/aiAttachmentPolicy.ts`
- `src/ai/aiMessagePageMerge.ts`
- `src/components/IPCardSkeleton.tsx`
- `src/media/mediaImagePrefetchCoordinator.ts`
- `src/media/mediaLastViewedQueue.ts`
- `src/media/mediaPrefetchPolicy.ts`
- `src/media/mediaReaderContextQuery.ts`
- `src/media/mediaReaderSessionCache.ts`
- `src/media/videoPlaybackRate.ts`
- `src/media/videoPreloadPool.ts`
- `src/media/videoSwipePolicy.ts`
- `src/services/boundedFileConcurrency.ts`
- `src/database/databaseSpaceRegistry.ts`
- `src/services/dataEpochService.ts`
- `src/services/mediaImportPreflight.ts`
- `src/services/mediaImportPreflightRuntime.ts`
- `src/services/scopedLruCache.ts`
- `scripts/benchmark-media-database-performance.cjs`
- `scripts/benchmark-ai-message-repository.cjs`

### 4.2 主要修改文件

- 路由/隐私清理：`App.tsx`
- 聊天：`src/ai/aiChatService.ts`, `src/ai/aiThreadMessagePrefetch.ts`, `src/screens/AiChatScreen.tsx`, `src/components/ParallaxLightSweep.tsx`
- 首页/UI：`HomeLibraryScreen.tsx`, `IPCard.tsx`, `SecureImage.tsx`, `CircularProgress.tsx`, `FilterChip.tsx`, `SearchBar.tsx`, `src/design/tokens/components.ts`
- 数据库：`db.ts`, `types.ts`, `databaseSpaceRegistry.ts`, `imageRepository.ts`, `assetRepository.ts`, `aiThreadRepository.ts`
- 媒体页面：`ImageViewerScreen.tsx`, `ImageDetailScreen.tsx`, `VideoPlayerScreen.tsx`, `VideoDetailScreen.tsx`, `RecentViewedScreen.tsx`
- 批量整理：`BatchManageImagesScreen.tsx`, `ImportBatchReviewScreen.tsx`, `IpDetailScreen.tsx`, `BatchImageOrganizePanel.tsx`
- 导入/文件：`limits.ts`, `imageImportService.ts`, `videoImportService.ts`, `mediaFilePickerService.ts`, `mediaImportOrderService.ts`, `cacheCleanupService.ts`, `mediaLibraryService.ts`, `ImportImagesScreen.tsx`
- 工程入口：`package.json`, `fix_tests.js`

### 4.3 新增与更新测试

新增的性能/稳定性测试覆盖 attachment、message merge、home skeleton、cursor、index、LRU、space-scoped epoch、图片预取/内存压力、reader session/last-view、导入 preflight/共享实际字节账本/并发、视频 swipe/pool/pitch、100k 媒体 benchmark 及 6000 消息 repository benchmark。旧 policy 只在真实产品行为已改变时更新，未通过删除用例隐藏问题。

## 5. 验证结果

2026-08-20 在当前工作树执行的新鲜验证：

| 门禁 | 最终结果 |
| --- | --- |
| `node --check fix_tests.js` | 通过，exit 0 |
| `pnpm typecheck` | 通过，TypeScript 0 error |
| `pnpm test` | 通过：1138 tests；1123 pass；0 fail；15 skipped |
| `pnpm bench:ai-chat` | 通过：59,890 字符/200 patch replay 中位数 140.022ms；1MiB token estimate 7.516ms；小输入 0.187µs（Node v24.13.1/Windows host 基线） |
| `pnpm bench:media-db` | 通过：100,000 行；seed+index 499.357ms；created 0.094ms、recent 0.062ms、video 0.056ms；每页 40 条；31 次采样；均命中 covering index、无 temp B-tree |
| `pnpm bench:chat-db` | 通过：6000 消息；60 条/页；100 页完整遍历 6000 个唯一 ID；latest 0.223ms、before 0.226ms、around-anchor 5.237ms、遍历 64.827ms；查询均命中 `idx_ai_messages_thread_created_id` |
| `android\\gradlew.bat :app:compileDebugKotlin` | 通过：BUILD SUCCESSFUL in 33s；317 tasks（4 executed/313 up-to-date）；只有 Gradle/第三方既有提示 |
| `git diff --check` | 通过；仅输出 Git 的 LF→CRLF 提示，无 whitespace error |
| ADB 设备探测 | `adb devices -l` 只有表头、无设备；所有 Android 门禁保持待验证 |

本轮只执行 Android Kotlin 编译，没有构建 APK、安装、发布、提交或对用户数据库做写入式压力测试。`node:sqlite` 输出 experimental warning，因此上述数据库数据只作为可重复 host 回归基线，不代表 Android 绝对 SLA。

## 6. Android 真机验收清单（当前不能伪报通过）

1. 首页冷启动：单 skeleton 与真实卡片逐像素尺寸一致；首卡不晚于第二卡闪现；底部快速上滑回收后无错图。
2. 图片阅读器：横/竖连续快速翻 200 项、30 次急速反向；记录 dropped frames、JS/UI FPS、PSS、native heap、图片 cache；退出再进恢复当前项。
3. 视频：连续上滑 30 条并反向 30 次；确认封面跟手、无 settle 后突闪、只有一条音轨；记录 codec/内存和失败恢复。
4. 倍速音频：对语音、音乐、44.1/48kHz、AAC/Opus，分别测 0.5×、0.75×、1.5×、2×、3×；主观 AB 和基频偏差都通过后才可写“花栗鼠音已解决”。
5. 聊天：冷启动进入 60/600/6000 条线程，快速上下滑、加载更早、流式回复、键盘开合、搜索定位、分支返回；确认无首帧位置闪烁。
6. 导入：1000 文件、超大视频、未知 size、文件中途变化、低于 512MB、用户取消、Personal 锁定、DocumentPicker 离页；确认无半记录和原件误删。
7. Personal：锁定后检查内存图片、reader session、聊天 prefetch、临时文件和数据库连接均按顺序清理；普通磁盘缩略图仍可命中。

## 7. 补强完成项与后续真机规划

本次 follow-up 已完成原 review 中所有可由源码确定的补强项：图片双维像素预算与 Android memory trim、normal/personal 独立 media epoch、混合导入共享实际字节账本、6000 消息 repository benchmark 及 around-anchor 单 statement。

仍需设备证据的加强项：

- 接入 Android Macrobenchmark/JankStats、Perfetto 和 `adb shell dumpsys meminfo`，把首屏、reader、short-feed 和 6000 条聊天变成可重复门禁。
- 在真实设备按 RAM/codec 能力分档调整视频准备并发；只有 3 路并行仍不能覆盖目标时，再评估 Media3 原生 preload manager。
- 对聊天补充真实 FlatList 布局采样和消息高度缓存命中统计；host repository benchmark 不能代替 UI thread/frame 证据。
