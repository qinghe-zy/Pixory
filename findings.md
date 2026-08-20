# Findings & Decisions

## Requirements
- 制定覆盖性能和用户体验的全面修复计划。
- 图片阅读器不能只固定预取三页，需要承受连续快速滑动。
- 视频上下切换应达到成熟短视频产品的跟手、连续、自然体验。
- 调研倍速播放时消除“花栗鼠音”的成熟算法和 Android 可借鉴实现。
- 首页进入时只显示与真实内容同尺寸的 skeleton，叠加 shimmer，不显示“正在读取本地资产库”等加载提示。
- Skeleton 只显示一个 IP 卡片占位。
- IP 卡片很多、从下往上滑动时，必须避免第二张先完成、第一张稍后突然闪入。
- 继续覆盖聊天长列表、SQLite、缓存、上传及极端稳定性。

## Research Findings
- 上一轮审计已确认媒体阅读器整批查询、逐页写库和全局刷新，视频切换后才设置封面，多个图库页面非虚拟化。
- 聊天已有 60 条游标分页和 FlatList，但深度加载、初次位置修正、隐藏无限动画和无界附件 Base64 仍需治理。
- 首页把列表查询延迟到 `InteractionManager.runAfterInteractions`，加载态由文字型 `PageStateBlock` 占据至少 280px，和真实 IP 卡片 `aspectRatio: 2.08` 不同，视觉替换必然跳动。
- `IPCard` 只有第一项被包入 `MagneticLiquidContainer` 与 `MagneticCardContainer`；该路径启动 ROTATION/GRAVITY 两个 16ms 传感器、嵌套 Pan 手势、800% SVG 径向高光和多个 800% 渐变，第二项以后没有这些负担。这是“第二卡先出现、第一卡稍后闪入”的高可信根因，也是向上滚动时的手势竞争源。
- `SecureImage` 没有暴露加载优先级、占位、回收键或淡入控制；封面解码完成顺序可能进一步放大卡片乱序出现感。
- 当前项目安装的 `expo-video@3.0.16` 类型文档声称 `preservesPitch` 默认为 `true`，但 Android `VideoPlayer.kt` 实际初始化为 `false`；Pixory 只设置了 `playbackRate`，没有显式设置 `preservesPitch`。Android 侧随后把 pitch 设为 speed，正好会产生“花栗鼠音”。
- Android Media3 的 `PlaybackParameters(speed)` 会做保持音高的 time-stretch；显式 `pitch = speed` 则是重采样式升调。Media3 内置 `SonicAudioProcessor`，可独立修改速度、音高和采样率。
- Expo Video 支持创建未挂载到 `VideoView` 的 player 进行缓冲；Android Media3 `DefaultPreloadManager` 则专门面向一维短视频/轮播流，根据与当前项的距离排序并按阶段预加载。因此可把“屏幕三槽”与“远大于三项的资源预热池”分开设计。
- `expo-image` 支持批量 `prefetch` 和内存 `loadAsync`，适合把编码文件预取窗口与近邻解码窗口分层；不能把所有高速前瞻项都解码为全尺寸位图。
- SoundTouch 是成熟的本地时域变速方案，Rubber Band 是相位声码器方向的高质量方案；两者都需要原生集成且有延迟、CPU 和许可证成本。当前问题应先修正 Expo/Media3 已有的保音高路径，而不是直接引入重型 DSP 库。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 自适应前瞻缓存 + 有界解码缓存 + 元数据分页 | 兼顾高速滑动命中率与低端机内存 |
| 垂直视频使用三槽视觉容器，但预取队列可远大于三项 | 屏幕容器数量和资源预热窗口不是同一个概念 |
| Skeleton 与真实首页共用布局常量/组件壳 | 防止加载完成后尺寸和位置跳动 |
| 首卡高级光效从 FlatList 热路径移除或延迟到稳定空闲态 | 保证所有卡片首帧成本一致，禁止回收时重新启动传感器/大图层 |
| 图片采用“元数据大窗 + 编码文件中窗 + 解码位图小窗” | 快速滑动不能依赖固定 3 页，但全尺寸解码窗口也不能无限扩大 |
| 视频采用三槽画面、2–3 个 player、较大的封面/MediaSource 预热池 | 实现短视频式跟手切换，同时控制硬件解码器和 Surface 数量 |
| 倍速先显式开启 `preservesPitch`，Media3/Sonic 为默认底层 | 当前花栗鼠音是配置路径错误；只有真机仍有明显伪影时才评估 SoundTouch/Rubber Band |
| SQLite 深页改 keyset，查询与排序增加组合索引 | 避免 OFFSET 随页深线性变慢和临时排序 |
| 缓存以 space/filter/sort/dataEpoch 为键并有容量上限 | 保证命中率、数据新鲜度与 Personal 隔离 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 当前没有 Android 设备 | 计划中保留真机性能门禁，不用桌面基准替代 |

## Resources
- `src/screens/ImageViewerScreen.tsx`
- `src/screens/VideoPlayerScreen.tsx`
- `src/screens/HomeLibraryScreen.tsx`
- `src/screens/AiChatScreen.tsx`
- `src/database/repositories/imageRepository.ts`

## Execution Baseline Findings
- 项目使用 `pnpm`，验证入口为 `pnpm typecheck`、`pnpm test`，性能脚本已有 `pnpm bench:ai-chat`。
- 测试体系主要是 `node:test` 的 `.cjs` policy/unit/integration 测试；本次沿用既有静态策略测试，并把可纯函数化的预取、游标、会话缓存策略放入 TypeScript 模块后由测试加载。
- 仓库已有 `.worktrees`，但当前工作区存在用户未提交且与 `HomeLibraryScreen` 等目标文件重叠的修改；本次按用户明确执行授权留在当前工作区增量修改，不复制或重置用户改动。
- `docs/superpowers/specs/` 与 `docs/superpowers/plans/` 已有既定文档惯例，完整 Spec 和分模块 Plan 存放于这两个目录。
- 首页现有结构把 `FlatList` 包在 `PageStateBlock` 内，且仅在非 loading 时显示 children；单骨架需要把“加载”从整页状态块中拆出，但保留错误态与真正空态。
- `IPCard` 的真实几何来源分散在组件样式中：`aspectRatio: 2.08`、`componentTokens.ipCard.radius`、`spacing[4]`。为保证 skeleton 零跳动，应先提取共享 `IP_CARD_ASPECT_RATIO`/卡片壳，而不是复制魔法数。
- `SecureImage` 当前最小接口只有 uri/space/blur/contentFit/style。首卡和虚拟列表修复需要在不改变 Personal 缓存边界的前提下增加 `priority`、`recyclingKey`、`placeholder`/`transition` 等透传属性。
- 现有测试大量使用源码 policy 断言；首页模块可以先新增失败策略测试，锁定“单 skeleton、无加载文案、无 isFirst 重型路径、稳定 FlatList 参数”，再实现。
- 图片阅读器当前 `renderItem`/`goToRelativeImage` 在依赖数组与闭包中引用了后声明的 `handleImageLongPress`/`jumpToImageIndex`，这是可由 `pnpm typecheck` 稳定复现的声明顺序错误；模块 0 先修复该正确性阻断。
- 图片阅读器进入时对上下文执行无界整批查询，随后用 `requestAnimationFrame + scrollToIndex` 修正位置；当前 `initialNumToRender` 为 5、横向 `windowSize` 为 5、纵向为 7，但没有资源级预取和会话窗口，列表窗口不能等同于媒体预热。
- 图片阅读器每次 active image 变化都立即 `touchLastViewedAt` 并调用全局 `onRefreshed`，必须改为会话级去重/节流，在退出或停留稳定后提交。
- 视频播放器当前只有一个 `useVideoPlayer(null)`；源切换会 pause → `replaceAsync` → 播放，切换动画完成退出后才 `setLoadingCoverVideo(nextVideo)`，精确解释了“落位后封面突然切换”。
- 视频倍速设置存在初始化、源替换、设置变更、长按进入和长按退出五条写入路径，需统一为 `applyPitchPreservingRate(player, rate)`，避免遗漏 `preservesPitch`。
- 视频待播队列使用 `ScrollView + queue.map`，队列无界；该列表需单独虚拟化，但不能和短视频手势状态机同时大改，按模块顺序先保音高、再切换/预热、最后队列虚拟化 review。
- SQLite 已启用 WAL/foreign_keys，数据库版本为 59；本次数据库优化应新增迁移 60 的组合索引并通过双空间迁移，而不是重复开启 WAL 或替换数据库引擎。
- `findFilteredPage` 已存在但使用 `LIMIT/OFFSET`；媒体阅读会经过多个无界 `findBy*`，视频队列也通过 `findByIpId` 整批加载。需要补充统一 cursor page/around-anchor API，而非在屏幕层对全量数组切片。
- `IMAGE_LIST_SELECT` 含每行标签/关系聚合，适合详情/小页但不适合 100k 元数据窗口；阅读器列表需使用轻投影，再对当前/近邻批量 hydration。
- 聊天当前已具备 60 条 cursor page 与单线程 route snapshot prefetch，说明本轮不应重写分页架构；重点转为初次可见时序、去除显示后 400/700ms 的纠正跳转、稳定锚点和附件有界读取。
- `AiChatScreen` 仍保留消息区从透明到可见的初始 fade，以及多组 delayed scroll timeout；Spec 必须区分搜索/分支定位所需重试与普通首次进入不应发生的可见纠正。
- 文件选择当前 `copyToCacheDirectory: true`，之后又进入受管存储复制；极端导入会短时双占用空间。计划需在受支持平台验证 `copyToCacheDirectory: false` 的 URI 生命周期，不能直接全局关闭。
- 缓存目录大小递归使用无界 `Promise.all`；大目录会造成 I/O 峰值。该模块可先抽取有界并发遍历并用单元测试锁定峰值并发数。

## Verified Baseline
- `pnpm typecheck` 当前先被用户已有根目录 `fix_tests.js` 非法字符阻断；使用 `pnpm exec tsc --noEmit --allowJs false` 可隔离应用 TypeScript，确认 10 个错误：4 个来自用户已修改的 `CircularProgress.tsx` token 名称，6 个来自 `ImageViewerScreen.tsx` 的后声明引用。
- 当前根路由固定从首页开始，未发现可靠持久化的“下次进入聊天线程”目标；启动遮罩阶段应只完成 SQLite/索引/缓存初始化，目标线程数据应在点击、搜索或历史记录产生明确路由意图后预取，避免为了预热引入无关的导航持久化状态。
- 完整 `node:test` 基线共有 2 个失败：Personal `SecureImage` policy 期待 `cachePolicy='none'` 但当前为 `memory`；批量管理 policy 期待只选图片但当前用户改动允许 image/video。两项均属于进入本轮前的现有修改冲突，不能静默篡改测试或用户代码。
- 图片阅读器已从无界上下文读取改为锚点周围 81 条元数据 + 40 条 keyset 边界页；快速 fling 使用编码前向 32/后向 8、解码前向 6/后向 3 的方向窗口，并限制编码并发 4、解码并发 2。
- 阅读器退出恢复必须区分“同一入口重新进入”和“同一上下文点开另一张图”；会话同时保存 entryId 与 currentId，只有 entryId 匹配才恢复 currentId，避免错误覆盖用户新点击的图片。
- 逐张 `lastViewedAt` 写入会放大快速翻页的 SQLite 压力；现改为 2 秒唯一 ID 合并并用单条 `UPDATE ... IN (...)` 写入，退出时补 flush，父列表只刷新一次。
- 本轮模块验收必须区分“本模块 focused tests 全绿”和“全量基线仍保留已记录的既有失败”；最终只有获得对应范围授权或用户改动本身解决后，才能声称全量测试通过。

## Visual/Browser Findings
- 截图显示首页标题、搜索和筛选已经完整呈现，但内容区被大面积插画、进度点和两行“正在读取本地资产库/SQLite...”文字占据；加载内容的高度、结构与最终 IP 卡片明显不同。
- 用户要求该整块加载提示完全移除，只在列表首卡位置显示一个真实尺寸 IPCard skeleton，并叠加轻量 shimmer。
- 首页不能等第一张封面解码完才创建整张卡片；卡片壳、标题和元数据必须按数据顺序同步出现，图片只在壳内独立补齐，避免第二卡先于第一卡“整卡出现”。

## Primary References
- Expo Video 官方文档：预加载、`preservesPitch`、Android Surface 限制。
- Android Media3 `PlaybackParameters`、`SonicAudioProcessor`、`DefaultPreloadManager` 官方文档。
- Expo Image 官方文档：`prefetch`、`loadAsync` 和缓存策略。
- SoundTouch、Rubber Band 官方技术与集成文档。
