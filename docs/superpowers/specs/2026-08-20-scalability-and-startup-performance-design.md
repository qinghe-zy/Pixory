# Pixory 启动与大数据页面性能补强设计

**状态：** Modules 1–5、用户追加的 AI 会话历史模块、最终 review 与常规验证均已完成
**日期：** 2026-08-20
**依据：** `docs/feature-matrix.md`、现有页面代码、2026-08-20 全面性能 Review 及用户本轮确认
**执行约束：** 不使用子智能体；不做压力测试；每个模块必须先有 RED 测试，完成后独立 review；不改变原件、隐私空间或备份语义。

## 1. 目标与完成定义

本轮处理此前媒体 reader、短视频播放器和聊天主链路之外仍可由源码确定的伸缩风险：

1. 原生启动屏过早交给 React，数据库和六套字体未就绪时显示文字加载页；启动 300ms 后四个根页同时挂载并运行隐藏动画。
2. 全部素材、分组、标签、收藏、回收站和批量管理仍全量查询、全量挂载，绕过已有媒体 keyset cursor 与 LRU。
3. 备份存在关系 N+1、整库 Base64 常驻内存；存储统计重复扫描同一预览树并创建无界文件 Promise。
4. 材料、日记、梦境、独白、AI 收藏等长期数据页面仍全量读取或缺少继续分页。
5. 导入批次为计数读取整批明细，批量复制验证逐条查库且无界并发，相似重复分组存在平方级候选扫描。
6. AI 会话历史虽只展示有限行，但旧实现先计算/返回完整历史再在 JavaScript 截断；搜索、快速换筛选和持续下拉缺少 SQL cursor 与旧请求隔离。

完成定义：聚焦测试、`pnpm typecheck`、全量 `pnpm test` 和 `git diff --check` 通过；代码 review 不再发现本轮列出的全量挂载、N+1、无界文件并发或隐藏动画路径；Spec、Plan、全面 Review 与功能矩阵同步。用户明确免除压力测试，因此不以 10 万素材或大型备份基准作为本轮完成门禁。

## 2. 启动屏、字体与根页面生命周期

- 在 JS 模块加载时调用 `SplashScreen.preventAutoHideAsync`，由 React 在数据库初始化和关键字体完成、首个可交互页面已提交后主动隐藏；初始化失败必须立即隐藏并展示可重试错误页。
- 删除正常启动期间的“正在初始化数据库”文字卡。若原生 Splash 因系统行为提前隐藏，React fallback 只显示与 Splash 同色的无文字表面，不出现第二套加载提示。
- 首页实际使用的 JetBrains 作为关键字体；Playfair、日记手写体与楷体在首屏提交后通过 `InteractionManager` 后台加载，不阻塞首页。文件目录创建与 normal SQLite 初始化并行等待。
- 根页只同步挂载当前页；首屏交互完成后按相邻优先级逐页预热，禁止一次性 `setRenderedTabs(all)`。已经访问的页面保留状态。
- `HomeLibraryScreen`、`MeScreen`、`AiHomeScreen` 接收 `isActive`。隐藏时停止无限 Reanimated 循环与频谱动画；再次显示时从确定的初值重新启动。普通数据快照可以保留，但隐藏页不得因纯可见性变化重复全量查询。

## 3. 素材集合虚拟化与游标分页

- 新增共享 `VirtualizedAssetCollection`，统一承载 grid/detail 两种 item、分页 footer、空状态、三列补位、固定批量/window 参数和滚动事件。
- 新增 `useMediaCursorCollection`，只接受可序列化查询 scope 和现有 `findFilteredCursorPage`，按 `(sortValue,id)` 追加；request key 变化或 reload 清空 cursor；过期响应不得覆盖新 scope。
- `AllImagesScreen`、`GroupImagesScreen`、`TagResultScreen`、`FavoritesScreen`、`TrashScreen` 和 `BatchManageImagesScreen` 不再调用无上限 `findBy*` 作为页面数据源。
- “全选”只表示当前已加载集合；需要全范围操作时通过 ID-only 分块查询实现，不把全部 `ImageListItem` 放进 React state。本轮保持现有按钮文案，但计数与实际选择范围必须一致。
- reader 上下文使用查询 scope 或已有 cursor context；只有主动筛选为显式 ID 集时才传 ID 数组，避免从大列表复制完整 ID 集。

## 4. 备份与存储统计

- 备份导出关系改为分块批量读取 `image_groups`、`image_tags/tags`、批次和批次项，禁止每素材两条查询。
- SQLite 备份优先使用一致性文件快照/原生导出能力；若 Expo 当前接口只能 `serializeAsync`，至少取消额外 Base64 中间字符串并在文档标记剩余边界。不得在未证明一致性的情况下直接复制活跃 WAL 数据库。
- Manifest/ExportData 分阶段构建并及时释放临时数组；文件复制和哈希使用既有固定并发工具与取消检查。
- 存储统计用一次 preview inventory 同时计算总量、图片预览和视频预览；备份目录枚举使用固定并发。
- `StorageUsageScreen` 先展示按 space 缓存的最近快照，再后台刷新；数据库写 epoch 或显式清理后失效。缓存只存统计数字，不缓存私密路径或文件内容。

## 5. AI 长期数据与收藏

- AI 材料、日记/梦境/独白和 AI 收藏按增长风险分级：材料必须数据库分页，内心生活只读取当前 tab。
- `AiMaterialListScreen` 先分页 owner group 摘要；每个来源只批量读取最近 4 份预览，点击来源后按 `(updatedAt,id)` 每页 40 条读取全部材料，避免单来源把总库重新变成无界列表。
- `CompanionInnerLifeScreen` 只加载当前 tab，切换后再读对应的日记、梦境或独白，不在初次进入时并发读取三套数据。
- `FavoritesScreen` 只加载当前“图片/AI”分段；AI 收藏改为 keyset cursor，不能以默认 80 条静默截断。
- 所有页面保留当前空态、Personal scope 和删除/恢复语义。

## 6. 批量、导入历史与重复检测

- 导入历史使用一条按 `importBatchId,status` 聚合的 SQL 返回最近 30 批计数，不读取明细正文。
- 批量复制验证先一次性分块读取目标记录，文件 metadata 最多 4 worker；禁止每个素材重新打开数据库 scope。
- 精确重复先在 SQL 中按 `contentHash HAVING COUNT(*) > 1` 找候选，再读取成员。
- 感知哈希使用稳定前缀/位段 bucket 缩小候选，之后才计算汉明距离；bucket 边界必须允许邻桶候选，不能为性能漏掉阈值内重复。若无法给出无漏检保证，本轮只优化 exact 路径并保留 visual 路径，文档明确边界。

## 7. 测试与 review

- 行为 helper 使用可执行单元测试；页面 wiring、无界调用和启动契约使用 policy test；数据库聚合使用内存 SQLite integration test。
- 每模块执行：RED → 最小实现 → 聚焦 GREEN → `pnpm typecheck` → `git diff --check` → 源码 review → 记录发现。
- 最终只运行常规测试，不执行 `bench:*`、大型 fixture、真机压力或声学测试。

## 7.1 用户追加：AI 会话历史

- 搜索条件下推 SQLite，按最后活动时间、创建时间和 ID 做稳定 keyset；每页固定 40 条并只查询 `limit + 1` 判断后续页。
- 页面使用 `FlatList` 和有界 render/window 参数，不以 `items.map` 挂载累计历史。
- 搜索词、普通/回收站筛选或空间变化时推进请求代际；旧 reload/load-more 晚返回不得覆盖或追加到新条件。
- 保留 adopted branch 的最后可见消息投影、分组标题、滑动归档、多选、重命名和 Personal 数据语义。

## 8. 自审结论

- 无 `TBD/TODO`；每一目标均有明确数据边界和验证方式。
- 方案复用现有 Expo/React Native/SQLite、keyset cursor、LRU 与有界 worker，不增加依赖、不切换数据库。
- 启动优化只改变交接和非关键字体时序，不改变 Splash 视觉、Android 12 安全区或首页真实卡片尺寸。
- visual duplicate 只有在可证明召回不退化时才改算法；原件、Personal、备份一致性优先于速度。
- 决定：按启动 → 素材列表 → 备份/存储 → AI 长期页 → 批量/重复 → 文档总审顺序执行。
